# Payments Proxy - Client Examples

The payments proxy lets you access partner APIs on a pay-per-use basis. Access partner APIs via subdomains.

## How It Works

- **Free endpoints**: Requests pass through transparently with your own API key
- **Paid endpoints**: Returns 402, you pay via the protocol, then the request proceeds

---

## Quick Reference

| Partner     | Proxy Base URL                           | Upstream API                    |
|-------------|------------------------------------------|---------------------------------|
| Browserbase | `https://browserbase.payments-testnet.tempo.xyz` (preview)<br>`https://browserbase.payments.tempo.xyz` (production) | `https://api.browserbase.com` |

**Local Development:**
```bash
# Option 1: Host header (for curl/bash scripts)
curl -H "Host: browserbase.localhost" http://localhost:8787/v1/sessions

# Option 2: Path-based routing (for any client including Node.js fetch)
curl http://localhost:8787/browserbase/v1/sessions
```

---

## Test Credentials

These well-known test private keys can be used for development and testing. **Never use these on mainnet or with real funds.**

| Name | Private Key | Address |
|------|-------------|---------|
| Test Account #0 (Hardhat/Anvil) | `0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80` | `0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266` |
| Test Account #1 (Hardhat/Anvil) | `0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d` | `0x70997970C51812dc3A010C7d01b50e0d17dc79C8` |
| Test Account #2 (Hardhat/Anvil) | `0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a` | `0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC` |

---

## Quick Start Examples

Copy-paste ready examples using Test Account #0. Set the private key once:

```bash
export PRIVATE_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
```

### Bash Script Examples (demo.sh)

| Description | Command |
|-------------|---------|
| **Free: List sessions** | `cd packages/paymentauth-client && ./demo.sh GET http://localhost:8787/browserbase/v1/sessions` |
| **Free: Get session details** | `cd packages/paymentauth-client && ./demo.sh GET http://localhost:8787/browserbase/v1/sessions/0dad8d6f-deea-4d37-8087-c63b4b878b3a` |
| **Paid: Create session** | `cd packages/paymentauth-client && PRIVATE_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80 ./demo.sh POST http://localhost:8787/browserbase/v1/sessions -d '{"projectId":"PROJECT_ID"}'` |
| **Paid: Create session (verbose)** | `cd packages/paymentauth-client && PRIVATE_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80 ./demo.sh POST http://localhost:8787/browserbase/v1/sessions -d '{"projectId":"PROJECT_ID"}' --verbose` |

### TypeScript Demo Examples (pnpm demo)

| Description | Command |
|-------------|---------|
| **Free: List sessions** | `cd packages/paymentauth-client && pnpm demo GET http://localhost:8787/browserbase/v1/sessions` |
| **Paid: Create session** | `cd packages/paymentauth-client && PRIVATE_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80 pnpm demo POST http://localhost:8787/browserbase/v1/sessions -d '{"projectId":"PROJECT_ID"}'` |
| **Paid: Create session (verbose)** | `cd packages/paymentauth-client && PRIVATE_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80 pnpm demo POST http://localhost:8787/browserbase/v1/sessions -d '{"projectId":"PROJECT_ID"}' --verbose` |

### curl Examples (Manual Flow)

| Description | Command |
|-------------|---------|
| **Free endpoint** | `curl -s http://localhost:8787/browserbase/v1/sessions \| jq` |
| **Free endpoint (Host header)** | `curl -s http://localhost:8787/v1/sessions -H "Host: browserbase.localhost" \| jq` |
| **Paid endpoint (get 402 challenge)** | `curl -i -X POST http://localhost:8787/browserbase/v1/sessions -H "Content-Type: application/json" -d '{"projectId":"PROJECT_ID"}'` |

> **Note**: Replace `PROJECT_ID` with your Browserbase project ID. Use `./demo.sh GET http://localhost:8787/browserbase/v1/projects` to list available projects.

---

## 1. Free Endpoints (Passthrough)

For free endpoints, include your own API key. The proxy passes it through to the upstream.

### List Sessions (Free)

```bash
# Your API key goes through to Browserbase
curl -X GET "http://localhost:8787/v1/sessions" \
  -H "Host: browserbase.localhost" \
  -H "X-BB-API-Key: YOUR_BROWSERBASE_API_KEY"
```

### Get Session Details (Free)

```bash
curl -X GET "http://localhost:8787/v1/sessions/0dad8d6f-deea-4d37-8087-c63b4b878b3a" \
  -H "Host: browserbase.localhost" \
  -H "X-BB-API-Key: YOUR_BROWSERBASE_API_KEY"
```

### Delete Session (Free)

```bash
curl -X DELETE "http://localhost:8787/v1/sessions/0dad8d6f-deea-4d37-8087-c63b4b878b3a" \
  -H "Host: browserbase.localhost" \
  -H "X-BB-API-Key: YOUR_BROWSERBASE_API_KEY"
```

---

## 2. Paid Endpoints (Payment Required)

Paid endpoints return `402 Payment Required`. You must pay via the protocol to proceed.

### Step-by-Step: Create a Session (Paid - $0.12)

**Step 1: Make the initial request (receive 402)**

```bash
curl -i -X POST "http://localhost:8787/v1/sessions" \
  -H "Host: browserbase.localhost" \
  -H "Content-Type: application/json" \
  -d '{"projectId": "your-project-id"}'
```

Response:
```http
HTTP/1.1 402 Payment Required
WWW-Authenticate: Payment method="tempo", intent="charge", id="pay_abc123...", 
  request="eyJhbW91bnQiOiIxMjAwMDAiLCJhc3NldCI6IjB4MjBjMDAwMD..."
Content-Type: application/json

{"error":"PaymentRequired","message":"Payment of $0.12 required to access Browserbase API"}
```

**Step 2: Parse the challenge and sign a transaction**

The `request` parameter is base64url-encoded JSON:
```json
{
  "amount": "120000",
  "asset": "0x20c0000000000000000000000000000000000001",
  "destination": "0x...",
  "expires": "2025-01-16T12:05:00.000Z"
}
```

**Step 3: Submit payment credential**

```bash
curl -X POST "http://localhost:8787/v1/sessions" \
  -H "Host: browserbase.localhost" \
  -H "Content-Type: application/json" \
  -H "Authorization: Payment eyJpZCI6InBheV9hYmMxMjMuLi4iLCJzb3VyY2UiOi..." \
  -d '{"projectId": "your-project-id"}'
```

Response (success):
```http
HTTP/1.1 200 OK
Payment-Receipt: eyJzdGF0dXMiOiJzdWNjZXNzIiwibWV0aG9kIjoidGVtcG8i...
X-Payment-TxHash: 0x1234...
X-Payment-Explorer: https://explore.tempo.xyz/tx/0x1234...
Content-Type: application/json

{"id":"0dad8d6f-deea-4d37-8087-c63b4b878b3a","status":"created",...}
```

---

## 3. Using the Demo Scripts

The `@tempo/paymentauth-client` package includes demo scripts that handle the 402 flow automatically.

### Bash Script (requires Foundry)

The script supports passing extra headers with `-H` flags and request bodies with `-d` flags. By default, it only outputs the final result. Use `--verbose` to see debug output and progress messages:

```bash
cd packages/paymentauth-client

# Free endpoint - pass your own API key (outputs only the result)
./demo.sh GET http://localhost:8787/v1/sessions \
  -H "Host: browserbase.localhost" \
  -H "X-BB-API-Key: YOUR_BROWSERBASE_API_KEY"

# Paid endpoint with POST body - handles 402 automatically (outputs only the result)
PRIVATE_KEY=0x... ./demo.sh POST http://localhost:8787/v1/sessions \
  -H "Host: browserbase.localhost" \
  -d '{"projectId": "your-project-id"}'

# Paid endpoint with verbose output
PRIVATE_KEY=0x... ./demo.sh POST http://localhost:8787/v1/sessions \
  -H "Host: browserbase.localhost" \
  -d '{"projectId": "your-project-id"}' --verbose

# Paid endpoint with extra headers and body
PRIVATE_KEY=0x... ./demo.sh POST http://localhost:8787/v1/sessions \
  -H "Host: browserbase.localhost" \
  -H "Content-Type: application/json" \
  -d '{"projectId": "your-project-id"}'
```

### TypeScript Demo

The script supports request bodies with `-d` flags and headers with `-H` flags. By default, it only outputs the final result. Use `--verbose` to see debug output and progress messages:

```bash
cd packages/paymentauth-client

# Free endpoint (if no payment required, returns directly)
pnpm demo GET http://localhost:8787/v1/sessions \
  -H "Host: browserbase.localhost"

# Free endpoint with API key header
pnpm demo GET http://localhost:8787/v1/sessions \
  -H "Host: browserbase.localhost" \
  -H "X-BB-API-Key: YOUR_BROWSERBASE_API_KEY"

# Paid endpoint with POST body (outputs only the result)
PRIVATE_KEY=0x... pnpm demo POST http://localhost:8787/v1/sessions \
  -H "Host: browserbase.localhost" \
  -d '{"projectId": "your-project-id"}'

# Paid endpoint with verbose output
PRIVATE_KEY=0x... pnpm demo POST http://localhost:8787/v1/sessions \
  -H "Host: browserbase.localhost" \
  -d '{"projectId": "your-project-id"}' --verbose
```

> **Note**: Both demo scripts now support POST/PUT/PATCH requests with bodies using the `-d` flag, similar to `curl`.

---

## 4. Full Bash Example (Manual)

Complete script showing the payment flow:

```bash
#!/usr/bin/env bash
# Pay-per-use proxy client example
# Requires: Foundry (cast), curl, jq

set -euo pipefail

PROXY_URL="${PROXY_URL:-http://localhost:8787}"
PROXY_HOST="${PROXY_HOST:-browserbase.localhost}"
TEMPO_RPC_URL="${TEMPO_RPC_URL:-https://rpc.moderato.tempo.xyz}"

base64url_encode() { echo -n "$1" | base64 | tr '+/' '-_' | tr -d '='; }
base64url_decode() {
    local input="$1" padding=$((4 - ${#1} % 4))
    [[ $padding -lt 4 ]] && input="${input}$(printf '=%.0s' $(seq 1 $padding))"
    echo -n "$input" | tr -- '-_' '+/' | base64 -d
}

# Create a Browserbase session (paid endpoint)
create_session() {
    local project_id="$1"
    local response headers http_code
    
    response=$(mktemp); headers=$(mktemp)
    trap "rm -f '$response' '$headers'" RETURN
    
    # Step 1: Initial request
    http_code=$(curl -s -X POST "${PROXY_URL}/v1/sessions" \
        -H "Host: ${PROXY_HOST}" \
        -H "Content-Type: application/json" \
        -d "{\"projectId\": \"${project_id}\"}" \
        -w "%{http_code}" -o "$response" -D "$headers")
    
    if [[ "$http_code" != "402" ]]; then
        cat "$response"
        return 0
    fi
    
    echo "Payment required, processing..."
    
    # Step 2: Parse challenge
    local www_auth challenge_id request_b64 request_json
    www_auth=$(grep -i "^www-authenticate:" "$headers" | sed 's/^[^:]*: //' | tr -d '\r')
    challenge_id=$(echo "$www_auth" | grep -oE 'id="[^"]*"' | sed 's/id="//;s/"$//')
    request_b64=$(echo "$www_auth" | grep -oE 'request="[^"]*"' | sed 's/request="//;s/"$//')
    request_json=$(base64url_decode "$request_b64")
    
    local amount asset destination
    amount=$(echo "$request_json" | jq -r '.amount')
    asset=$(echo "$request_json" | jq -r '.asset')
    destination=$(echo "$request_json" | jq -r '.destination')
    
    echo "Amount: $(echo "scale=6; $amount / 1000000" | bc) USD"
    
    # Step 3: Sign transaction
    local calldata signed_tx
    calldata=$(cast calldata "transfer(address,uint256)" "$destination" "$amount")
    signed_tx=$(cast mktx "$asset" "$calldata" \
        --private-key "$PRIVATE_KEY" \
        --rpc-url "$TEMPO_RPC_URL" \
        --legacy \
        --gas-limit 100000)
    
    # Step 4: Build credential
    local wallet_address credential auth_header
    wallet_address=$(cast wallet address --private-key "$PRIVATE_KEY")
    credential=$(jq -nc \
        --arg id "$challenge_id" \
        --arg source "did:pkh:eip155:111111:${wallet_address}" \
        --arg sig "$signed_tx" \
        '{id:$id,source:$source,payload:{type:"transaction",signature:$sig}}')
    auth_header="Payment $(base64url_encode "$credential")"
    
    # Step 5: Retry with payment
    curl -s -X POST "${PROXY_URL}/v1/sessions" \
        -H "Host: ${PROXY_HOST}" \
        -H "Content-Type: application/json" \
        -H "Authorization: $auth_header" \
        -d "{\"projectId\": \"${project_id}\"}" | jq .
}

# Usage
# PRIVATE_KEY=0x... ./example.sh
create_session "your-project-id"
```

---

## 5. TypeScript Client Example

```typescript
import {
  formatAuthorization,
  parseWwwAuthenticate,
  type ChargeRequest,
  type PaymentCredential,
} from '@tempo/paymentauth-protocol'
import { createClient, encodeFunctionData, type Hex, http, parseAbi } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { prepareTransactionRequest, signTransaction } from 'viem/actions'
import { tempoModerato } from 'viem/chains'

const PROXY_URL = process.env.PROXY_URL ?? 'http://localhost:8787'
const PROXY_HOST = process.env.PROXY_HOST ?? 'browserbase.localhost'
const PRIVATE_KEY = process.env.PRIVATE_KEY as Hex

/**
 * Make a request through the payments proxy with automatic 402 handling.
 */
async function proxyRequest(
  method: string,
  path: string,
  options?: { body?: unknown; headers?: Record<string, string> }
): Promise<Response> {
  const url = `${PROXY_URL}${path}`
  
  // Initial request
  const response = await fetch(url, {
    method,
    headers: {
      'Host': PROXY_HOST,
      'Content-Type': 'application/json',
      ...options?.headers,
    },
    body: options?.body ? JSON.stringify(options.body) : undefined,
  })
  
  // If not 402, return as-is
  if (response.status !== 402) {
    return response
  }
  
  // Handle payment
  console.log('Payment required, processing...')
  
  const wwwAuth = response.headers.get('www-authenticate')
  if (!wwwAuth) throw new Error('Missing WWW-Authenticate header')
  
  const challenge = parseWwwAuthenticate<ChargeRequest>(wwwAuth)
  const { amount, asset, destination } = challenge.request
  
  console.log(`Amount: ${Number(amount) / 1_000_000} USD`)
  
  // Sign payment transaction
  const account = privateKeyToAccount(PRIVATE_KEY)
  const transferData = encodeFunctionData({
    abi: parseAbi(['function transfer(address to, uint256 amount)']),
    functionName: 'transfer',
    args: [destination, BigInt(amount)],
  })
  
  const chain = tempoModerato.extend({ feeToken: asset })
  const client = createClient({ chain, transport: http() })
  
  const prepared = await prepareTransactionRequest(client, {
    type: 'tempo',
    account,
    calls: [{ to: asset, data: transferData }],
    feeToken: asset,
    maxPriorityFeePerGas: 1_000_000_000n,
    maxFeePerGas: 10_000_000_000n,
    gas: 100_000n,
  })
  
  const signedTx = await signTransaction(client, { ...prepared, account })
  
  // Build credential
  const credential: PaymentCredential = {
    id: challenge.id,
    source: `did:pkh:eip155:${tempoModerato.id}:${account.address}`,
    payload: { type: 'transaction', signature: signedTx },
  }
  
  // Retry with payment
  return fetch(url, {
    method,
    headers: {
      'Host': PROXY_HOST,
      'Content-Type': 'application/json',
      Authorization: formatAuthorization(credential),
      ...options?.headers,
    },
    body: options?.body ? JSON.stringify(options.body) : undefined,
  })
}

// Example: Create a Browserbase session
async function main() {
  // Free endpoint (list sessions) - include your API key
  const listResponse = await proxyRequest('GET', '/v1/sessions', {
    headers: { 'X-BB-API-Key': process.env.BROWSERBASE_API_KEY! },
  })
  console.log('Sessions:', await listResponse.json())
  
  // Paid endpoint (create session) - payment handled automatically
  const createResponse = await proxyRequest('POST', '/v1/sessions', {
    body: { projectId: 'your-project-id' },
  })
  
  if (createResponse.ok) {
    console.log('Created session:', await createResponse.json())
    console.log('TX Hash:', createResponse.headers.get('X-Payment-TxHash'))
  }
}

main()
```

---

## Endpoint Pricing Reference

### Browserbase (`browserbase.payments.tempo.xyz`)

| Endpoint | Method | Price | Notes |
|----------|--------|-------|-------|
| `/v1/sessions` | GET | Free | Uses your API key |
| `/v1/sessions` | POST | $0.12 | Creates a session |
| `/v1/sessions/:id` | GET | Free | Uses your API key |
| `/v1/sessions/:id` | DELETE | Free | Uses your API key |
| `/v1/sessions/:id/extend` | POST | $0.06 | Extends session |
| `/v1/projects/:id` | GET | Free | Uses your API key |

---

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PRIVATE_KEY` | Wallet private key (0x-prefixed hex) | Required for paid endpoints |
| `TEMPO_RPC_URL` | Tempo RPC endpoint | `https://rpc.moderato.tempo.xyz` |
| `PROXY_URL` | Payments proxy URL | `http://localhost:8787` |
| `PROXY_HOST` | Host header for subdomain routing | `browserbase.localhost` |

---

## Error Responses

### 402 Payment Required
```json
{
  "error": "PaymentRequired",
  "message": "Payment of $0.12 required to access Browserbase API"
}
```

### 401 Invalid Payment
```json
{
  "error": "PaymentVerificationFailed", 
  "message": "Unknown or expired challenge ID"
}
```

### 502 Upstream Failed (after payment)
```json
{
  "error": "Upstream request failed after payment",
  "message": "Connection refused",
  "payment": {
    "status": "success",
    "txHash": "0x...",
    "explorer": "https://explore.tempo.xyz/tx/0x..."
  }
}
```
