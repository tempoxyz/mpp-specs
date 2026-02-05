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
    │  channelId = keccak256(address, realm)         │
    │  sign voucher(channelId, amount, sessionHash)  │
    │                                                │
    │──── GET /chat ────────────────────────────────►│
    │     Authorization: Payment <credential>        │
    │                                                │
    │◄─── 200 OK (SSE stream) ──────────────────────│
    │     data: {"token":"Hello","spent":"25"}       │
    │     data: {"token":"!","spent":"50"}           │
    │     ...                                        │
```

**Stateless client**: Channel ID derived from `keccak256(payerAddress, realm)`. No local state file needed.

## Running

```bash
# Terminal 1: Start server
pnpm dev

# Terminal 2: Run client
pnpm tsx scripts/demo.ts --prompt "Hello"

# Subsequent requests reuse the channel
pnpm tsx scripts/demo.ts --prompt "Tell me more"

# Check status
pnpm tsx scripts/demo.ts --status

# Close channel
pnpm tsx scripts/demo.ts --close
```

## CLI Options

```
-p, --prompt <text>    Prompt to send (default: "Hello!")
-d, --deposit <amount> Amount to add to channel (default: 100000)
-s, --status           Show channel status
    --close            Close channel
```

## Files

```
src/
├── routes/chat.ts        # Payment-gated streaming endpoint
├── lib/
│   ├── stream-server.ts  # Method.toServer() + Mpay.create()
│   ├── stream-client.ts  # Method.toClient()
│   ├── voucher.ts        # EIP-712 signing
│   └── storage/          # Channel state (in-memory)
scripts/
└── demo.ts               # CLI client
```
