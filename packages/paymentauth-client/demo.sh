#!/usr/bin/env bash
#
# Payment Auth Client - Bash + Foundry
#
# Usage:
#   PRIVATE_KEY=0x... ./demo.sh GET http://localhost:3000/ping/paid
#   ./demo.sh GET http://localhost:8787/browserbase/v1/sessions -H "X-BB-API-Key: YOUR_KEY"
#
# Requires: Foundry (cast), curl, jq, bc
#

set -euo pipefail

export FOUNDRY_DISABLE_NIGHTLY_WARNING=1

TEMPO_RPC_URL="${TEMPO_RPC_URL:-https://rpc.moderato.tempo.xyz}"
BASE_RPC_URL="${BASE_RPC_URL:-https://sepolia.base.org}"

RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m'

verbose=false  # Will be set in main()

info() { [[ "$verbose" == "true" ]] && echo -e "${BLUE}▶${NC} $*" >&2 || true; }
success() { [[ "$verbose" == "true" ]] && echo -e "${GREEN}✓${NC} $*" >&2 || true; }
error() { echo -e "${RED}✗${NC} $*" >&2; exit 1; }

base64url_encode() { echo -n "$1" | base64 | tr '+/' '-_' | tr -d '='; }

base64url_decode() {
    local input="$1" padding=$((4 - ${#1} % 4))
    [[ $padding -lt 4 ]] && input="${input}$(printf '=%.0s' $(seq 1 $padding))"
    echo -n "$input" | tr -- '-_' '+/' | base64 -d
}

parse_auth_param() { echo "$1" | grep -oE "$2=\"[^\"]*\"" | sed -E "s/$2=\"(.*)\"/\1/"; }

# Parse extra headers from -H flags (after method and url)
# Outputs headers as null-separated values for safe parsing
parse_extra_headers() {
    shift 2  # Skip method and url
    while [[ $# -gt 0 ]]; do
        case "$1" in
            -H|--header)
                [[ $# -lt 2 ]] && break
                printf '%s\0' "$2"
                shift 2
                ;;
            -d|--data)
                # Skip data flag, we'll handle it separately
                [[ $# -lt 2 ]] && break
                shift 2
                ;;
            --verbose)
                shift
                ;;
            *)
                shift
                ;;
        esac
    done
}

# Parse request body from -d flags (after method and url)
parse_request_body() {
    shift 2  # Skip method and url
    while [[ $# -gt 0 ]]; do
        case "$1" in
            -d|--data)
                [[ $# -lt 2 ]] && return
                echo "$2"
                return
                ;;
            *)
                shift
                ;;
        esac
    done
}

sign_tempo_tx() {
    local asset="$1" destination="$2" amount="$3"
    
    # Build ERC-20 transfer calldata using cast
    local calldata
    calldata=$(cast calldata "transfer(address,uint256)" "$destination" "$amount")
    
    # Use cast mktx with --legacy for Tempo (server accepts both Tempo and legacy txs)
    local result
    if ! result=$(cast mktx "$asset" "$calldata" \
        --private-key "$PRIVATE_KEY" \
        --rpc-url "$TEMPO_RPC_URL" \
        --legacy \
        --gas-limit 100000 2>&1); then
        error "cast failed: $result"
    fi
    echo "$result"
}

sign_base_tx() {
    local asset="$1" destination="$2" amount="$3"
    local calldata result
    calldata=$(cast calldata "transfer(address,uint256)" "$destination" "$amount")
    if ! result=$(cast mktx "$asset" "$calldata" \
        --private-key "$PRIVATE_KEY" \
        --rpc-url "$BASE_RPC_URL" \
        --chain 84532 \
        --gas-limit 100000 2>&1); then
        error "cast failed: $result"
    fi
    echo "$result"
}

main() {
    [[ $# -lt 2 ]] && { echo "Usage: PRIVATE_KEY=0x... $0 <method> <url> [--verbose] [-d <data>] [-H 'Header: Value']..." >&2; exit 1; }
    
    # Parse --verbose flag and rebuild args without it
    local args=()
    for arg in "$@"; do
        if [[ "$arg" == "--verbose" ]]; then
            verbose=true
        else
            args+=("$arg")
        fi
    done
    
    local method="${args[0]^^}" url="${args[1]}"
    local response headers http_code
    local request_body has_content_type=false
    request_body=$(parse_request_body "${args[@]}")
    
    response=$(mktemp); headers=$(mktemp)
    trap "rm -f '$response' '$headers'" EXIT
    
    # Build curl command array
    local curl_args=(-s -X "$method" "$url")
    
    # Add extra headers (null-separated for safety)
    while IFS= read -r -d '' header || [[ -n "$header" ]]; do
        curl_args+=(-H "$header")
        [[ "${header,,}" == content-type:* ]] && has_content_type=true
    done < <(parse_extra_headers "${args[@]}")
    
    # Add body if present
    if [[ -n "$request_body" ]]; then
        curl_args+=(-d "$request_body")
        # Add Content-Type if not already present
        if [[ "$has_content_type" == "false" ]]; then
            curl_args+=(-H "Content-Type: application/json")
        fi
    fi
    
    http_code=$(curl "${curl_args[@]}" -w "%{http_code}" -o "$response" -D "$headers")
    
    if [[ "$http_code" != "402" ]]; then
        jq . "$response" 2>/dev/null || cat "$response"
        exit 0
    fi
    
    info "Received 402 Payment Required"
    [[ -z "${PRIVATE_KEY:-}" ]] && error "PRIVATE_KEY required"
    
    local www_auth challenge_id challenge_method request_b64 request_json
    www_auth=$(grep -i "^www-authenticate:" "$headers" | sed 's/^[^:]*: //' | tr -d '\r')
    [[ -z "$www_auth" ]] && error "Missing WWW-Authenticate header"
    
    challenge_id=$(parse_auth_param "$www_auth" "id")
    challenge_method=$(parse_auth_param "$www_auth" "method")
    request_b64=$(parse_auth_param "$www_auth" "request")
    request_json=$(base64url_decode "$request_b64")
    
    local amount asset destination chain_id signed_tx
    amount=$(echo "$request_json" | jq -r '.amount')
    asset=$(echo "$request_json" | jq -r '.asset')
    destination=$(echo "$request_json" | jq -r '.destination')
    chain_id=$([[ "$challenge_method" == "tempo" ]] && echo 111111 || echo 84532)
    
    info "Payment: $(echo "scale=6; $amount / 1000000" | bc) USD via ${challenge_method^^}"
    info "Signing ${challenge_method^^} transaction..."
    
    if [[ "$challenge_method" == "tempo" ]]; then
        signed_tx=$(sign_tempo_tx "$asset" "$destination" "$amount")
    else
        signed_tx=$(sign_base_tx "$asset" "$destination" "$amount")
    fi
    
    local wallet_address credential auth_header
    wallet_address=$(cast wallet address --private-key "$PRIVATE_KEY")
    
    credential=$(jq -nc \
        --arg id "$challenge_id" \
        --arg source "did:pkh:eip155:${chain_id}:${wallet_address}" \
        --arg sig "$signed_tx" \
        '{id:$id,source:$source,payload:{type:"transaction",signature:$sig}}')
    auth_header="Payment $(base64url_encode "$credential")"
    
    info "Submitting payment..."
    # Build curl command array for retry with authorization
    local retry_curl_args=(-s -X "$method" "$url")
    
    # Add extra headers (null-separated for safety)
    while IFS= read -r -d '' header || [[ -n "$header" ]]; do
        retry_curl_args+=(-H "$header")
    done < <(parse_extra_headers "${args[@]}")
    
    # Add authorization header
    retry_curl_args+=(-H "Authorization: $auth_header")
    
    # Add body if present
    if [[ -n "$request_body" ]]; then
        retry_curl_args+=(-d "$request_body")
        if [[ "$has_content_type" == "false" ]]; then
            retry_curl_args+=(-H "Content-Type: application/json")
        fi
    fi
    
    http_code=$(curl "${retry_curl_args[@]}" -w "%{http_code}" -o "$response" -D "$headers")
    
    if [[ "$http_code" == "200" ]]; then
        success "Payment accepted!"
        local receipt=$(grep -i "^payment-receipt:" "$headers" | sed 's/^[^:]*: //' | tr -d '\r' || true)
        [[ -n "$receipt" ]] && info "TX: $(base64url_decode "$receipt" | jq -r '.reference // empty')"
        [[ "$verbose" == "true" ]] && echo ""
    fi
    
    # Output opaque result (final response body)
    jq . "$response" 2>/dev/null || cat "$response"
}

main "$@"
