# Payments Dashboard

Real-time visualization of payment channel activity on the Tempo blockchain.

**Live:** https://payments.testnet.tempo.xyz

## What It Does

Displays live blockchain activity with a brutalist black & white aesthetic:

- **Stats Grid**: Latest block, transaction counts, blocks/minute, avg tx/block
- **Block Indicator**: Pulsing indicator showing the latest block
- **Live Activity Feed**: Real-time transaction stream with links to explorer

All endpoints are **free** (no payment required).

### Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/health` | GET | Health check |
| `/api/blocks` | GET | Fetch recent blocks with transactions |
| `/api/rpc` | POST | Proxy RPC requests to Tempo |

## How to Test

```bash
# Start local development
pnpm --filter @tempo/payments-dashboard dev

# Open http://localhost:5173
```

## Design

**Brutalist Editorial Black & White**

- Pure black background (#000000)
- White text (#ffffff)
- Space Mono (monospace) + Instrument Serif (display)
- Dot-grid background texture
- Noise overlay
- Sharp borders, no rounded corners
- Minimalist, editorial typography
