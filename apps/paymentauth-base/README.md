# paymentauth-base

Payment Auth reference implementation using **Base Sepolia** as the payment network.

## What It Does

A Cloudflare Worker that demonstrates the Payment Auth protocol flow on Base Sepolia:

- `GET /ping` - Free endpoint, returns pong without payment
- `GET /ping/paid` - Paid endpoint, requires 0.01 USDC payment on Base Sepolia

When a client requests the paid endpoint without payment, the server returns HTTP 402 with a `WWW-Authenticate` challenge. The client signs an ERC-20 transfer transaction and retries with the payment credential.

## Quick Start

```bash
# Start the server locally
pnpm --filter @tempo/paymentauth-base dev
```

## Testing with the Client

### TypeScript Client

```bash
# Test free endpoint
pnpm --filter @tempo/paymentauth-client demo GET http://localhost:8787/ping

# Test paid endpoint (requires PRIVATE_KEY with Base Sepolia USDC)
PRIVATE_KEY=0x... pnpm --filter @tempo/paymentauth-client demo GET http://localhost:8787/ping/paid
```

### Bash Client

```bash
cd packages/paymentauth-client

# Test paid endpoint
PRIVATE_KEY=0x... BASE_RPC_URL=https://sepolia.base.org ./demo.sh GET http://localhost:8787/ping/paid
```

## Configuration

| Variable | Description | Default |
|----------|-------------|---------|
| `DESTINATION_ADDRESS` | Wallet to receive payments | Required |
| `BASE_RPC_URL` | Base Sepolia RPC endpoint | Required |
| `BASE_RPC_USERNAME` | Optional RPC auth username | - |
| `BASE_RPC_PASSWORD` | Optional RPC auth password | - |
| `FEE_TOKEN_ADDRESS` | USDC contract address | `0x036CbD53842c5426634e7929541eC2318f3dCF7e` |
| `PAYMENT_AMOUNT` | Price in base units (6 decimals) | `10000` (0.01 USDC) |
| `CHALLENGE_VALIDITY_SECONDS` | Challenge expiry | `300` (5 minutes) |

## Deployment

```bash
# Deploy to preview
pnpm --filter @tempo/paymentauth-base deploy:preview

# Deploy to production
pnpm --filter @tempo/paymentauth-base deploy:prod
```
