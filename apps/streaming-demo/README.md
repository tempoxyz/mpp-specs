# Streaming Payment Demo

Per-token payment streaming for LLM APIs using mpay SDK and Tempo payment channels.

## Architecture

```
  CLIENT                                           SERVER
    │                                                │
    │──── GET /chat ────────────────────────────────►│
    │                                                │
    │◄─── 402 Payment Required ─────────────────────│
    │     WWW-Authenticate: Payment intent="stream"  │
    │                                                │
    │  open channel on-chain (approve + open)        │
    │  channelId from escrow contract                │
    │  sign voucher(channelId, cumulativeAmount)     │
    │                                                │
    │──── GET /chat ────────────────────────────────►│
    │     Authorization: Payment <credential>        │
    │                                                │
    │◄─── 200 OK (SSE stream) ──────────────────────│
    │     data: {"token":"Hello","spent":"25"}       │
    │     data: {"token":"!","spent":"50"}           │
    │     ...                                        │
```

**On-chain channels**: The demo opens a real payment channel on the [TempoStreamChannel](https://explore.testnet.tempo.xyz/address/0x9d136eEa063eDE5418A6BC7bEafF009bBb6CFa70) escrow contract (Moderato testnet). Channel ID is computed on-chain from `keccak256(payer, payee, token, deposit, salt, authorizedSigner, contract, chainId)`. Channels are reused across runs for the same parameters. The client uses `StreamChannelClient` from `@tempo/stream-channels` for all on-chain operations (approve, open, getChannel, computeChannelId).

## Running

```bash
# Terminal 1: Start server
pnpm dev

# Terminal 2: Run client (first run opens channel on-chain)
pnpm tsx scripts/demo.ts --prompt "Hello"

# Subsequent requests reuse the channel
pnpm tsx scripts/demo.ts --prompt "Tell me more"

# Check status (on-chain + server)
pnpm tsx scripts/demo.ts --status

# Close channel
pnpm tsx scripts/demo.ts --close
```

## CLI Options

```
-p, --prompt <text>    Prompt to send (default: "Hello!")
-d, --deposit <amount> Deposit for new channel (default: 1000000)
-s, --status           Show channel status (on-chain + server)
    --close            Close channel
```

Note: changing `--deposit` creates a new channel since deposit is part of the channel ID.

## Files

```
src/
├── routes/chat.ts              # Payment-gated streaming endpoint
├── stream/
│   ├── Types.ts                # Voucher, SignedVoucher, StreamCredentialPayload
│   ├── Voucher.ts              # EIP-712 signing (matches on-chain VOUCHER_TYPEHASH)
│   ├── Intents.ts              # Zod schemas for stream intent
│   ├── Method.ts               # Tempo method definition
│   ├── Chain.ts                # On-chain channel reads
│   ├── Receipt.ts              # Payment receipt serialization
│   ├── Storage.ts              # Channel state interface
│   ├── client/Method.ts        # Method.toClient()
│   └── server/Method.ts        # Method.toServer() + Mpay.create()
├── storage/
│   ├── memory.ts               # In-memory channel state
│   └── durable.ts              # Durable Object channel state
scripts/
└── demo.ts                     # CLI client (opens real on-chain channel)
```
