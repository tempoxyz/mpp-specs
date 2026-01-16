# paymentauth-tetris

Pay-per-move Tetris game powered by Payment Auth on Tempo.

## What It Does

A Cloudflare Worker that runs a shared Tetris game where every move costs 0.01 AlphaUSD:

- `GET /state` - View current game state (free)
- `POST /reset` - Reset the game (free, for testing)
- `POST /move/:action` - Make a move: `left`, `right`, `rotate`, `drop` (paid)

The game state is persisted in Cloudflare KV, so all players share the same board. Each move triggers a payment, and the game tracks who made each move.

Supports both wallet-signed transactions and WebAuthn authentication (passkeys).

## Quick Start

```bash
# Start the server locally
pnpm --filter @tempo/paymentauth-tetris dev
```

## Testing with the Client

### View Game State

```bash
curl http://localhost:8787/state
```

### Make a Paid Move

```bash
# Using TypeScript client
PRIVATE_KEY=0x... pnpm --filter @tempo/paymentauth-client demo \
  POST http://localhost:8787/move/left

# Using Bash client
cd packages/paymentauth-client
PRIVATE_KEY=0x... ./demo.sh POST http://localhost:8787/move/rotate
```

### Available Actions

| Action | Description |
|--------|-------------|
| `left` | Move piece left |
| `right` | Move piece right |
| `rotate` | Rotate piece clockwise |
| `drop` | Hard drop piece |

## WebAuthn Support

The app also supports WebAuthn/passkey authentication:

```bash
# Get a challenge for registration
curl http://localhost:8787/keys/challenge

# Register a public key
curl -X POST http://localhost:8787/keys \
  -H "Content-Type: application/json" \
  -d '{"credentialId": "...", "publicKey": "..."}'
```

## Configuration

| Variable | Description | Default |
|----------|-------------|---------|
| `GAME_STATE` | KV namespace for game state | Required |
| `KEY_STORE` | KV namespace for WebAuthn keys | Required |
| `DESTINATION_ADDRESS` | Wallet to receive payments | Required |
| `TEMPO_RPC_URL` | Tempo RPC endpoint | Required |
| `FEE_PAYER_PRIVATE_KEY` | Fee payer wallet | Required |
| `FEE_TOKEN_ADDRESS` | AlphaUSD contract | `0x20c0...0001` |
| `PAYMENT_AMOUNT` | Price per move | `10000` (0.01 USD) |

## Deployment

```bash
# Deploy to preview
pnpm --filter @tempo/paymentauth-tetris deploy:preview

# Deploy to production
pnpm --filter @tempo/paymentauth-tetris deploy:prod
```
