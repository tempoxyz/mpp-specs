# reth-snapshots

Pay-per-download service for Reth blockchain snapshots.

## What It Does

A Cloudflare Worker that provides paid downloads of Reth snapshots stored in R2:

- `GET /health` - Health check
- `GET /snapshots` - List available snapshots with sizes and prices (free)
- `GET /snapshots/:filename` - Download a snapshot (paid, priced per GB)

Pricing is based on file size: $0.01 per GB by default. Payment is processed on Tempo using AlphaUSD.

## Quick Start

```bash
# Start the server locally
pnpm --filter @tempo/reth-snapshots dev
```

## Testing with the Client

### List Available Snapshots

```bash
curl http://localhost:8787/snapshots
```

Response:
```json
{
  "snapshots": [
    {
      "filename": "reth-mainnet-2024-01-15.tar.zst",
      "size": "150.25 GB",
      "priceUsd": "$1.51",
      "priceBaseUnits": "1510000"
    }
  ],
  "pricing": {
    "perGbCents": 1,
    "perGbUsd": "$0.01"
  }
}
```

### Download a Snapshot

```bash
# Using TypeScript client
PRIVATE_KEY=0x... pnpm --filter @tempo/paymentauth-client demo \
  GET http://localhost:8787/snapshots/reth-mainnet-2024-01-15.tar.zst \
  --output snapshot.tar.zst

# Using Bash client
cd packages/paymentauth-client
PRIVATE_KEY=0x... ./demo.sh GET http://localhost:8787/snapshots/reth-mainnet-2024-01-15.tar.zst
```

## Configuration

| Variable | Description | Default |
|----------|-------------|---------|
| `SNAPSHOTS` | R2 bucket binding for snapshots | Required |
| `DESTINATION_ADDRESS` | Wallet to receive payments | Required |
| `TEMPO_RPC_URL` | Tempo RPC endpoint | Required |
| `TEMPO_RPC_USERNAME` | Optional RPC auth username | - |
| `TEMPO_RPC_PASSWORD` | Optional RPC auth password | - |
| `FEE_TOKEN_ADDRESS` | AlphaUSD contract | Required |
| `PRICE_PER_GB_CENTS` | Price per GB in cents | `1` ($0.01/GB) |
| `CHALLENGE_VALIDITY_SECONDS` | Challenge expiry | `600` (10 minutes) |

## Deployment

```bash
# Deploy to preview
pnpm --filter @tempo/reth-snapshots deploy:preview

# Deploy to production
pnpm --filter @tempo/reth-snapshots deploy:prod
```
