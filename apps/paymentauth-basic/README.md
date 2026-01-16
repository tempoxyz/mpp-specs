# paymentauth-basic

Payment Auth reference implementation using **Tempo** as the payment network.

## What It Does

A Cloudflare Worker that demonstrates the Payment Auth protocol flow on Tempo:

- `GET /ping` - Free endpoint, returns pong without payment
- `GET /ping/paid` - Paid endpoint, requires 0.01 AlphaUSD payment on Tempo

When a client requests the paid endpoint without payment, the server returns HTTP 402 with a `WWW-Authenticate` challenge. The client signs a TIP-20 transfer transaction and retries with the payment credential.

Supports both Tempo (type 0x76) transactions and standard EIP-1559 transactions.

## Quick Start

```bash
# Start the server locally
pnpm --filter @tempo/paymentauth-basic dev
```

## Testing with the Client

### TypeScript Client

```bash
# Test free endpoint
pnpm --filter @tempo/paymentauth-client demo GET http://localhost:3001/ping

# Test paid endpoint (requires PRIVATE_KEY with Tempo AlphaUSD)
PRIVATE_KEY=0x... pnpm --filter @tempo/paymentauth-client demo GET http://localhost:3001/ping/paid
```

### Bash Client

```bash
cd packages/paymentauth-client

# Test paid endpoint
PRIVATE_KEY=0x... ./demo.sh GET http://localhost:3001/ping/paid
```

## Configuration

| Variable | Description | Default |
|----------|-------------|---------|
| `DESTINATION_ADDRESS` | Wallet to receive payments | Required |
| `TEMPO_RPC_URL` | Tempo RPC endpoint | Required |
| `TEMPO_RPC_USERNAME` | Optional RPC auth username | - |
| `TEMPO_RPC_PASSWORD` | Optional RPC auth password | - |
| `FEE_PAYER_PRIVATE_KEY` | Fee payer wallet (for sponsored txs) | Required |
| `FEE_TOKEN_ADDRESS` | AlphaUSD contract address | `0x20c0000000000000000000000000000000000001` |
| `PAYMENT_AMOUNT` | Price in base units (6 decimals) | `10000` (0.01 USD) |
| `CHALLENGE_VALIDITY_SECONDS` | Challenge expiry | `300` (5 minutes) |

## Deployment

```bash
# Deploy to preview
pnpm --filter @tempo/paymentauth-basic deploy:preview

# Deploy to production
pnpm --filter @tempo/paymentauth-basic deploy:prod
```
