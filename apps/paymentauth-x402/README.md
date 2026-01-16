# paymentauth-x402

Payment Auth implementation compatible with the x402 protocol, using Tempo for payments.

## What It Does

A Cloudflare Worker that implements the x402 payment protocol while using Tempo as the underlying payment network:

- `GET /ping` - Free endpoint, returns pong without payment
- `GET /ping/paid` - Paid endpoint, requires 0.01 AlphaUSD payment

This server speaks the IETF Payment Auth protocol format, making it compatible with x402 clients while processing payments on Tempo.

## Quick Start

```bash
# Start the server locally
pnpm --filter @tempo/paymentauth-x402 dev
```

## Testing with the Client

### TypeScript Client

```bash
# Test free endpoint
pnpm --filter @tempo/paymentauth-client demo GET http://localhost:8787/ping

# Test paid endpoint
PRIVATE_KEY=0x... pnpm --filter @tempo/paymentauth-client demo GET http://localhost:8787/ping/paid
```

### Bash Client

```bash
cd packages/paymentauth-client
PRIVATE_KEY=0x... ./demo.sh GET http://localhost:8787/ping/paid
```

## Configuration

| Variable | Description | Default |
|----------|-------------|---------|
| `DESTINATION_ADDRESS` | Wallet to receive payments | Required |
| `TEMPO_RPC_URL` | Tempo RPC endpoint | Required |
| `TEMPO_RPC_USERNAME` | Optional RPC auth username | - |
| `TEMPO_RPC_PASSWORD` | Optional RPC auth password | - |
| `FEE_PAYER_PRIVATE_KEY` | Fee payer wallet | Required |
| `FEE_TOKEN_ADDRESS` | AlphaUSD contract | `0x20c0...0001` |
| `PAYMENT_AMOUNT` | Price in base units | `10000` (0.01 USD) |
| `CHALLENGE_VALIDITY_SECONDS` | Challenge expiry | `300` (5 minutes) |
| `X402_NETWORK` | Network identifier | - |

## Deployment

```bash
# Deploy to preview
pnpm --filter @tempo/paymentauth-x402 deploy:preview

# Deploy to production
pnpm --filter @tempo/paymentauth-x402 deploy:prod
```
