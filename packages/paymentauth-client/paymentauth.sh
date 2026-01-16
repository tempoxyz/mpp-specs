#!/bin/bash
# Payment HTTP Auth Client - bash/cast implementation
# Speaks the protocol defined in draft-ietf-httpauth-payment
#
# Usage: ./paymentauth.sh <URL> [METHOD]
#
# Environment:
#   PRIVATE_KEY      - Wallet private key (0x-prefixed)
#   WALLET_ADDRESS   - Wallet address (derived from PRIVATE_KEY if not set)
#   TEMPO_RPC_URL    - RPC endpoint (default: https://rpc.moderato.tempo.xyz)
#
# Example:
#   PRIVATE_KEY=0x... ./paymentauth.sh https://api.example.com/paid-endpoint

set -e

URL="${1:?Usage: $0 <URL> [METHOD]}"
METHOD="${2:-GET}"

# Wallet config
PRIVATE_KEY="${PRIVATE_KEY:?Set PRIVATE_KEY environment variable}"
RPC="${TEMPO_RPC_URL:-https://rpc.moderato.tempo.xyz}"
CHAIN_ID=42431

# Derive wallet address if not provided
if [ -z "$WALLET_ADDRESS" ]; then
    WALLET_ADDRESS=$(cast wallet address "$PRIVATE_KEY")
fi

echo "Wallet: $WALLET_ADDRESS"
echo "URL: $URL"
echo ""

# Step 1: Initial request
echo "=== Requesting resource ==="
RESPONSE=$(curl -s -D /tmp/pa_headers.txt -X "$METHOD" "$URL")
STATUS=$(head -1 /tmp/pa_headers.txt | awk '{print $2}')

if [ "$STATUS" != "402" ]; then
    echo "Status: $STATUS (no payment required)"
    echo "$RESPONSE"
    exit 0
fi

echo "Status: 402 Payment Required"

# Step 2: Parse WWW-Authenticate challenge
WWW_AUTH=$(grep -i "www-authenticate:" /tmp/pa_headers.txt)
CHALLENGE_ID=$(echo "$WWW_AUTH" | grep -oP 'id="\K[^"]+')
REQUEST_B64=$(echo "$WWW_AUTH" | grep -oP 'request="\K[^"]+')
PA_METHOD=$(echo "$WWW_AUTH" | grep -oP 'method="\K[^"]+')
INTENT=$(echo "$WWW_AUTH" | grep -oP 'intent="\K[^"]+')

echo "Challenge ID: $CHALLENGE_ID"
echo "Method: $PA_METHOD"
echo "Intent: $INTENT"

if [ "$PA_METHOD" != "tempo" ]; then
    echo "Error: Only 'tempo' payment method is supported, got '$PA_METHOD'"
    exit 1
fi

if [ "$INTENT" != "charge" ]; then
    echo "Error: Only 'charge' intent is supported, got '$INTENT'"
    exit 1
fi

# Decode base64url request
PADDED=$(echo "$REQUEST_B64" | tr '_-' '/+')
MOD=$((${#PADDED} % 4))
[ $MOD -eq 2 ] && PADDED="${PADDED}=="
[ $MOD -eq 3 ] && PADDED="${PADDED}="
REQUEST_JSON=$(echo "$PADDED" | base64 -d)

AMOUNT=$(echo "$REQUEST_JSON" | jq -r '.amount')
ASSET=$(echo "$REQUEST_JSON" | jq -r '.asset')
DESTINATION=$(echo "$REQUEST_JSON" | jq -r '.destination')

echo ""
echo "=== Payment Request ==="
echo "Amount: $AMOUNT base units"
echo "Asset: $ASSET"
echo "Destination: $DESTINATION"

# Step 3: Sign transaction with cast
echo ""
echo "=== Signing transaction ==="
NONCE=$(cast nonce "$WALLET_ADDRESS" --rpc-url "$RPC")
echo "Nonce: $NONCE"

SIGNED_TX=$(cast mktx \
  --private-key "$PRIVATE_KEY" \
  --rpc-url "$RPC" \
  --nonce "$NONCE" \
  --gas-limit 100000 \
  --priority-gas-price 1gwei \
  --gas-price 10gwei \
  "$ASSET" \
  "transfer(address,uint256)" "$DESTINATION" "$AMOUNT")

echo "Signed TX: ${SIGNED_TX:0:50}..."

# Step 4: Build credential (base64url-encoded JSON)
CREDENTIAL='{"id":"'"$CHALLENGE_ID"'","source":"did:pkh:eip155:'"$CHAIN_ID"':'"$WALLET_ADDRESS"'","payload":{"type":"transaction","signature":"'"$SIGNED_TX"'"}}'
CREDENTIAL_B64=$(echo -n "$CREDENTIAL" | base64 -w0 | tr '+/' '-_' | tr -d '=')

# Step 5: Submit payment
echo ""
echo "=== Submitting payment ==="
PAID_RESPONSE=$(curl -s -D /tmp/pa_paid_headers.txt -X "$METHOD" "$URL" \
  -H "Authorization: Payment $CREDENTIAL_B64")
PAID_STATUS=$(head -1 /tmp/pa_paid_headers.txt | awk '{print $2}')

echo "Status: $PAID_STATUS"

# Parse Payment-Receipt header if present
RECEIPT_HEADER=$(grep -i "payment-receipt:" /tmp/pa_paid_headers.txt 2>/dev/null | sed 's/payment-receipt: //i' | tr -d '\r\n' || true)
if [ -n "$RECEIPT_HEADER" ]; then
    PADDED=$(echo "$RECEIPT_HEADER" | tr '_-' '/+')
    MOD=$((${#PADDED} % 4))
    [ $MOD -eq 2 ] && PADDED="${PADDED}=="
    [ $MOD -eq 3 ] && PADDED="${PADDED}="
    RECEIPT=$(echo "$PADDED" | base64 -d 2>/dev/null || echo "{}")
    echo ""
    echo "=== Payment Receipt ==="
    echo "$RECEIPT" | jq . 2>/dev/null || echo "$RECEIPT"
fi

echo ""
echo "=== Response ==="
echo "$PAID_RESPONSE" | jq . 2>/dev/null || echo "$PAID_RESPONSE"

# Exit with appropriate code
if [ "$PAID_STATUS" = "200" ]; then
    exit 0
else
    exit 1
fi
