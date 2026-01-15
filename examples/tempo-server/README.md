# Payment Auth Example Server (Tempo + Cloudflare Workers)

A reference implementation of the [HTTP Payment Authentication Scheme](../../draft-ietf-httpauth-payment.md) using the [Tempo payment method](../../draft-tempo-payment-method.md), deployed on Cloudflare Workers.

## Overview

This server demonstrates:

- **402 Payment Required** responses with `WWW-Authenticate: Payment` challenges
- Tempo transaction verification and settlement
- `Payment-Receipt` headers with transaction confirmation
- Stateless challenge management (in-memory for demo, use KV/Durable Objects for production)

## Deployed Instance

**URL**: `https://payment-auth-example.tempo.workers.dev`

Try it:

```bash
# 1. Get the payment challenge
curl -i https://payment-auth-example.tempo.workers.dev/api/weather
```

Response:
```http
HTTP/1.1 402 Payment Required
WWW-Authenticate: Payment id="abc123...", realm="payment-auth-example.tempo.workers.dev", method="tempo", intent="charge", expires="2026-01-15T16:00:00Z", request="eyJhbW91bnQiOiIxMDAwMCIsImFzc2V0IjoiMHgyMGMwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAxIiwiZGVzdGluYXRpb24iOiIweDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDEiLCJleHBpcmVzIjoiMjAyNi0wMS0xNVQxNjowMDowMFoifQ"

{"error":"payment_required","message":"Payment is required"}
```

## Price

| Endpoint | Price |
|----------|-------|
| `GET /api/weather` | 0.01 alphaUSD |

## Protocol Flow

```
Client                              Server                         Tempo (Moderato)
  │                                    │                                  │
  │  1. GET /api/weather               │                                  │
  ├───────────────────────────────────>│                                  │
  │                                    │                                  │
  │  2. 402 + WWW-Authenticate         │                                  │
  │<───────────────────────────────────┤                                  │
  │                                    │                                  │
  │  3. Parse challenge, construct     │                                  │
  │     Tempo Transaction with:        │                                  │
  │     - transfer(destination, 10000) │                                  │
  │     - asset: alphaUSD              │                                  │
  │     - chainId: 42431               │                                  │
  │                                    │                                  │
  │  4. Sign transaction               │                                  │
  │                                    │                                  │
  │  5. GET /api/weather               │                                  │
  │     Authorization: Payment <cred>  │                                  │
  ├───────────────────────────────────>│                                  │
  │                                    │  6. eth_sendRawTransactionSync   │
  │                                    ├─────────────────────────────────>│
  │                                    │  7. Transaction receipt          │
  │                                    │<─────────────────────────────────┤
  │  8. 200 OK + Payment-Receipt       │                                  │
  │<───────────────────────────────────┤                                  │
```

## Challenge Format

The `request` parameter decodes to:

```json
{
  "amount": "10000",
  "asset": "0x20c0000000000000000000000000000000000001",
  "destination": "0x0000000000000000000000000000000000000001",
  "expires": "2026-01-15T16:00:00Z"
}
```

- **amount**: 10000 base units = 0.01 alphaUSD (6 decimals)
- **asset**: alphaUSD token address on Tempo Moderato
- **destination**: Server's receiving address
- **expires**: ISO 8601 expiry timestamp

## Credential Format

Clients submit a Tempo Transaction in the credential:

```json
{
  "id": "abc123...",
  "source": "did:pkh:eip155:42431:0x...",
  "payload": {
    "type": "transaction",
    "signature": "0x76f901...signed transaction..."
  }
}
```

The `signature` field contains the RLP-serialized Tempo Transaction (type `0x76`).

## Local Development

```bash
# Install dependencies
pnpm install

# Generate types
pnpm gen:types

# Run locally
pnpm dev

# Deploy
pnpm deploy
```

## Configuration

Set these environment variables in `wrangler.jsonc` or via secrets:

| Variable | Description | Default |
|----------|-------------|---------|
| `TEMPO_RPC_URL` | Tempo RPC endpoint | `https://rpc.moderato.tempo.xyz` |
| `ALPHA_USD` | alphaUSD token address | `0x20c0...0001` |
| `DESTINATION_ADDRESS` | Server's receiving address | Must be set |

## Network

This example uses **Tempo Moderato** (testnet):
- Chain ID: `42431`
- RPC: `https://rpc.moderato.tempo.xyz`
- Explorer: `https://moderato.tempotrace.xyz`

Get testnet alphaUSD from the [Tempo Faucet](https://faucet.tempo.xyz).

## Implementation Notes

### What This Example Does

1. **Challenge Generation**: Creates a unique challenge ID with 128 bits of entropy
2. **Request Building**: Encodes payment requirements as base64url JSON
3. **Transaction Verification**: Deserializes the Tempo Transaction and verifies:
   - Chain ID is 42431 (Moderato)
   - First call targets the correct asset (alphaUSD)
   - Call data is a `transfer(to, amount)` with correct destination and amount
4. **Settlement**: Broadcasts via `eth_sendRawTransactionSync` for synchronous confirmation
5. **Receipt**: Returns transaction hash and block number in `Payment-Receipt` header

### Security Considerations

- Challenge IDs are cryptographically random (128 bits)
- Challenges are single-use and expire after 5 minutes
- Transaction is fully verified before broadcasting
- Amount and destination are validated against the original challenge

### Production Improvements

For production use, consider:

- **Persistent Challenge Storage**: Use Cloudflare KV or Durable Objects instead of in-memory Map
- **Rate Limiting**: Add rate limits per IP/address
- **Idempotency**: Handle duplicate credential submissions gracefully
- **Monitoring**: Add metrics for payment success/failure rates
- **Fee Payer**: Support server-sponsored fees for better UX
