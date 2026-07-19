# Payment Session Extensions for JSON-RPC 2.0 over WebSocket

**Status**: Draft Proposal  
**Date**: 2026-03-25

---

## Abstract

This document defines how the `session` payment intent operates
over JSON-RPC 2.0 WebSocket connections. It extends the JSON-RPC
payment transport defined in `draft-payment-transport-mcp-00` with
session lifecycle messages: channel open, voucher updates, top-up,
and close. The `charge` intent over JSON-RPC WebSocket is already
defined by the base transport spec and is not redefined here.

This specification defines only the transport binding. Session
semantics — channel escrow, voucher signing, cumulative accounting,
and settlement — are inherited from `draft-tempo-session-00`
without modification.

---

## 1. Introduction

The JSON-RPC payment transport (`draft-payment-transport-mcp-00`)
defines how the Payment Authentication Scheme operates within
JSON-RPC 2.0 messages. It covers the `charge` intent across
HTTP, WebSocket, and stdio transports. However, the `session`
intent requires additional message types that do not exist in the
base transport spec:

- **Voucher updates** during a metered phase
- **Balance signals** when the server exhausts authorized funds
- **Top-up** and **close** operations that manage the on-chain
  payment channel

Over HTTP, these are handled via HTTP headers and SSE events
(`draft-tempo-session-00` §11). Over WebSocket, this document
defines equivalent JSON-RPC messages.

### 1.1. Scope

This specification covers:

- Session lifecycle messages over WebSocket (`payment.voucher`,
  `payment.needVoucher`, `payment.receipt`, `payment.topUp`,
  `payment.close`, `payment.error`)
- Capability advertisement for session support
- Session state machine on a WebSocket connection
- Reconnect and resume procedures
- Pre-upgrade payment challenge

This specification does NOT cover:

- Charge intent flows (defined in `draft-payment-transport-mcp-00`)
- Session intent semantics (defined in `draft-tempo-session-00`)
- Bidirectional metering (deferred to a future document; see
  Appendix A)

### 1.2. Relationship to Other Specifications

This document inherits:

- Challenge, credential, and receipt structures from
  `draft-httpauth-payment-00`
- Error codes (`-32042`, `-32043`), `_meta` placement, and
  `org.paymentauth/*` key naming from
  `draft-payment-transport-mcp-00`
- Session semantics, voucher format, channel escrow, and
  settlement procedures from `draft-tempo-session-00`

### 1.3. Requirements Language

The key words "MUST", "MUST NOT", "REQUIRED", "SHALL", "SHALL
NOT", "SHOULD", "SHOULD NOT", "RECOMMENDED", "NOT RECOMMENDED",
"MAY", and "OPTIONAL" in this document are to be interpreted as
described in BCP 14 [RFC2119] [RFC8174].

---

## 2. Transport Requirements

### 2.1. TLS

All WebSocket connections carrying payment messages MUST use
`wss://` (WebSocket over TLS 1.2 [RFC5246] or later; TLS 1.3
[RFC8446] RECOMMENDED). Servers MUST reject `ws://` upgrade
requests for payment-enabled endpoints.

### 2.2. JSON-RPC 2.0

All messages defined in this specification are JSON-RPC 2.0
[JSON-RPC] frames. Binary WebSocket frames MUST NOT be used
for payment messages. Servers MUST reject binary frames
containing payment control messages.

### 2.3. Batching Prohibition

JSON-RPC 2.0 batch requests MUST NOT contain `payment.*`
messages or requests carrying `org.paymentauth/credential`
in `_meta`. Servers MUST reject batches containing payment
messages with error code `-32600` (Invalid Request).

Rationale: Batch processing order is not guaranteed by
JSON-RPC 2.0. Payment messages have ordering dependencies
(e.g., voucher before data delivery) that batching would
violate.

### 2.4. Concurrency Model

A WebSocket connection MUST have at most one active session
at a time. A session is identified by its `channelId` and is
bound to the connection on which it was opened.

If a client needs multiple concurrent sessions, it MUST open
multiple WebSocket connections.

---

## 3. Connection Lifecycle

### 3.1. Pre-Upgrade Challenge

Servers that require payment for WebSocket access MAY return
HTTP 402 with a `WWW-Authenticate: Payment` challenge on the
upgrade request, before completing the WebSocket handshake.

```
Client                                    Server
   │                                         │
   │  GET /ws HTTP/1.1                       │
   │  Upgrade: websocket                     │
   ├────────────────────────────────────────>│
   │                                         │
   │  402 Payment Required                   │
   │  WWW-Authenticate: Payment ...          │
   │<────────────────────────────────────────┤
   │                                         │
   │  (client fulfills challenge)            │
   │                                         │
   │  GET /ws HTTP/1.1                       │
   │  Upgrade: websocket                     │
   │  Authorization: Payment <credential>    │
   ├────────────────────────────────────────>│
   │                                         │
   │  101 Switching Protocols                │
   │<────────────────────────────────────────┤
```

This prevents unauthenticated or unpaid clients from consuming
WebSocket connection resources. Servers that do not require
payment for connection establishment SHOULD proceed directly
to 101 and use post-upgrade challenges per §3.3.

### 3.2. Capability Advertisement

After a successful WebSocket upgrade, servers SHOULD send a
`payment.capabilities` JSON-RPC notification:

```json
{
  "jsonrpc": "2.0",
  "method": "payment.capabilities",
  "params": {
    "methods": {
      "tempo": { "intents": ["charge", "session"] }
    }
  }
}
```

Clients MAY send their own `payment.capabilities` notification.
Capability advertisement is informational only — it does not
constitute negotiation. Servers MAY still issue challenges for
intents or methods not advertised by the client.

### 3.3. Post-Upgrade Challenge

When a client sends a JSON-RPC request for a paid operation, the
server responds with error code `-32042` per
`draft-payment-transport-mcp-00`. For `session` intents, the
challenge includes session-specific request fields as defined in
`draft-tempo-session-00` §6:

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "error": {
    "code": -32042,
    "message": "Payment Required",
    "data": {
      "httpStatus": 402,
      "challenges": [{
        "id": "kM9xPqWvT2nJrHsY4aDfEb",
        "realm": "ws.example.com",
        "method": "tempo",
        "intent": "session",
        "request": {
          "amount": "25",
          "unitType": "message",
          "suggestedDeposit": "10000000",
          "currency": "0x20c0...",
          "recipient": "0x742d...",
          "methodDetails": {
            "escrowContract": "0x9d13...",
            "chainId": 42431
          }
        },
        "expires": "2026-03-25T13:05:00Z"
      }]
    }
  }
}
```

---

## 4. Session Lifecycle Messages

### 4.1. Open (Client → Server)

The client opens a session by retrying the original JSON-RPC
request with an `org.paymentauth/credential` containing
`action: "open"`. The credential structure follows
`draft-payment-transport-mcp-00` §5 for `_meta` placement:

```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "doThing",
  "params": {"input": "hello"},
  "_meta": {
    "org.paymentauth/credential": {
      "challenge": {
        "id": "kM9xPqWvT2nJrHsY4aDfEb",
        "realm": "ws.example.com",
        "method": "tempo",
        "intent": "session",
        "request": { ... },
        "expires": "2026-03-25T13:05:00Z"
      },
      "payload": {
        "action": "open",
        "type": "transaction",
        "channelId": "0x6d0f...",
        "transaction": "0x76f9...",
        "cumulativeAmount": "0",
        "signature": "0xabcd..."
      }
    }
  }
}
```

The server broadcasts the open transaction, verifies the on-chain
channel state, and returns the JSON-RPC result with a receipt in
`org.paymentauth/receipt`. The session enters the METERED state.

Challenge `expires` gates only the `open` action. Once the
channel is confirmed on-chain, the challenge expiry is no longer
relevant — the on-chain channel is the trust anchor for the
remainder of the session. Voucher updates reference the original
`challengeId` for audit correlation but do not depend on
challenge validity.

### 4.2. Voucher Update (Client → Server)

During the metered phase, the client sends voucher updates as
JSON-RPC **requests** (with `id`). Each voucher MUST include a
client-assigned `seq` (sequence number) for correlation.

```json
{
  "jsonrpc": "2.0",
  "id": 100,
  "method": "payment.voucher",
  "params": {
    "channelId": "0x6d0f...",
    "cumulativeAmount": "250000",
    "signature": "0xabcd...",
    "seq": 7
  }
}
```

#### Required Fields

| Field | Type | Description |
|-------|------|-------------|
| `channelId` | string | Channel identifier (hex bytes32) |
| `cumulativeAmount` | string | Cumulative authorized amount (decimal) |
| `signature` | string | EIP-712 voucher signature (hex) |
| `seq` | integer | Client-assigned sequence number, monotonically increasing |

The server verifies the voucher per `draft-tempo-session-00` §9.3
and responds with a JSON-RPC result:

**Success:**
```json
{
  "jsonrpc": "2.0",
  "id": 100,
  "result": {
    "status": "accepted",
    "seq": 7,
    "acceptedCumulative": "250000",
    "spent": "237500",
    "available": "12500"
  }
}
```

**Failure:**
```json
{
  "jsonrpc": "2.0",
  "id": 100,
  "error": {
    "code": -32043,
    "message": "Payment Verification Failed",
    "data": {
      "seq": 7,
      "channelId": "0x6d0f...",
      "type": "https://paymentauth.org/problems/session/invalid-signature",
      "detail": "Voucher signature could not be verified"
    }
  }
}
```

#### Idempotency

Servers MUST treat voucher submissions idempotently per
`draft-tempo-session-00` §9.4:

- A voucher with the same `cumulativeAmount` as the highest
  accepted MUST return success with current state.
- A voucher with a lower `cumulativeAmount` MUST return success
  with current state (not an error).

#### Rate Limiting

Servers MUST limit voucher submissions to at most 10 per second
per session. Servers SHOULD perform format validation (field
presence, hex encoding, length) before ECDSA signature recovery
to minimize cost of malformed messages.

### 4.3. Need Voucher (Server → Client)

When the server exhausts the client's authorized balance and must
pause metered delivery, it sends a `payment.needVoucher`
notification:

```json
{
  "jsonrpc": "2.0",
  "method": "payment.needVoucher",
  "params": {
    "channelId": "0x6d0f...",
    "requiredCumulative": "250025",
    "acceptedCumulative": "250000",
    "spent": "250000",
    "deposit": "500000"
  }
}
```

#### Required Fields

| Field | Type | Description |
|-------|------|-------------|
| `channelId` | string | Channel identifier |
| `requiredCumulative` | string | Minimum cumulative amount the next voucher must authorize to resume delivery of the next metered unit |
| `acceptedCumulative` | string | Current highest accepted voucher amount |
| `spent` | string | Cumulative amount charged so far |
| `deposit` | string | Current on-chain deposit |

When `requiredCumulative > deposit`, the client MUST top up the
on-chain channel (§4.5) before sending a new voucher.

After sending `payment.needVoucher`, the server MUST pause
metered data delivery. The server MUST continue processing
`payment.*` control messages (see §5.2).

Servers SHOULD close the WebSocket connection if no valid voucher
is received within 60 seconds of sending `payment.needVoucher`.

### 4.4. Receipt (Server → Client)

Sent as a JSON-RPC notification after metered delivery or on
settlement events. This is distinct from the inline
`org.paymentauth/receipt` on JSON-RPC results (used for `open`
and `close` responses).

```json
{
  "jsonrpc": "2.0",
  "method": "payment.receipt",
  "params": {
    "method": "tempo",
    "intent": "session",
    "status": "success",
    "timestamp": "2026-03-25T12:08:30Z",
    "challengeId": "kM9xPqWvT2nJrHsY4aDfEb",
    "channelId": "0x6d0f...",
    "acceptedCumulative": "250000",
    "spent": "237500"
  }
}
```

Servers MAY send periodic `payment.receipt` notifications during
the metered phase to keep clients informed of balance state.
Servers MUST send a final `payment.receipt` notification before
closing the WebSocket, if a session was active.

The receipt structure follows `draft-tempo-session-00` §11.8.

### 4.5. TopUp (Client → Server)

Sent as a JSON-RPC **request** (has `id`, expects response)
because it involves an on-chain transaction:

```json
{
  "jsonrpc": "2.0",
  "id": 200,
  "method": "payment.topUp",
  "params": {
    "channelId": "0x6d0f...",
    "transaction": "0x76f9...",
    "additionalDeposit": "5000000"
  }
}
```

The server broadcasts the transaction, waits for on-chain
confirmation, and returns a result with updated balance state:

```json
{
  "jsonrpc": "2.0",
  "id": 200,
  "result": {
    "status": "confirmed",
    "channelId": "0x6d0f...",
    "deposit": "15000000",
    "acceptedCumulative": "250000",
    "spent": "237500",
    "available": "12500"
  }
}
```

After a successful top-up, the client sends a `payment.voucher`
to authorize spending the new funds.

TopUp requires a valid challenge. If the original challenge has
expired, the client MUST obtain a fresh challenge by sending a
request that triggers a `-32042` error, then use that challenge
for the top-up credential.

### 4.6. Close (Client → Server)

Sent as a JSON-RPC **request**:

```json
{
  "jsonrpc": "2.0",
  "id": 300,
  "method": "payment.close",
  "params": {
    "channelId": "0x6d0f...",
    "cumulativeAmount": "500000",
    "signature": "0xabcd..."
  }
}
```

The server calls `close()` on the escrow contract per
`draft-tempo-session-00` §11.2 and returns a receipt:

```json
{
  "jsonrpc": "2.0",
  "id": 300,
  "result": {
    "status": "closed",
    "channelId": "0x6d0f...",
    "txHash": "0x1a2b...",
    "acceptedCumulative": "500000",
    "spent": "487500"
  }
}
```

After close, the session transitions to CLOSED. The server
SHOULD close the WebSocket connection after sending the result.

---

## 5. Metering Rules

### 5.1. Charge Timing

For each metered unit of service:

1. The server MUST reserve cost BEFORE enqueueing the outbound
   message for transmission.
2. The server MUST update `spent` atomically with the
   reservation.
3. If the reservation fails (insufficient balance), the server
   MUST send `payment.needVoucher` and pause delivery.

Balance updates MUST be serialized per channel. This mirrors
the concurrency requirement in `draft-tempo-session-00` §2.2.

### 5.2. Control Messages Are Never Metered

The following message types are NEVER metered and MUST be
processed even while data delivery is paused:

- `payment.voucher`
- `payment.topUp`
- `payment.close`
- `payment.needVoucher`
- `payment.receipt`
- `payment.error`
- `payment.capabilities`

Only application-level JSON-RPC requests and results bound to
the metered session are subject to charging.

### 5.3. Voucher Timing Strategies

Clients choose when to send vouchers. This specification does
not mandate a strategy. Common approaches:

| Strategy | Description | Trade-off |
|----------|-------------|-----------|
| Reactive | Send voucher only on `payment.needVoucher` | Simple but causes delivery pauses |
| Periodic | Send voucher every T seconds | Smooth but may overshoot |
| Consumption-tracking | Send voucher when local spend estimate approaches accepted amount | Responsive, more complex |

**Warning**: Vouchers are irrevocable payment authorizations up
to `cumulativeAmount`. The server retains the highest accepted
voucher and may settle on-chain at any time. Clients SHOULD NOT
sign vouchers for amounts significantly exceeding service
actually received unless they trust the server.

---

## 6. Session State Machine

```
 ┌───────────┐
 │ CONNECTED │  WebSocket open, capabilities exchanged
 └─────┬─────┘
       │ First paid request → server returns -32042
       ▼
 ┌───────────┐
 │ CHALLENGED│  Client has received session challenge
 └─────┬─────┘
       │ Client sends credential with action="open"
       ▼
 ┌───────────┐
 │  OPENING  │  Server broadcasting open tx on-chain
 └─────┬─────┘
       │ Channel confirmed on-chain
       ▼
 ┌───────────┐       payment.voucher accepted
 │  METERED  │◄──────────────────────────────┐
 └─────┬─────┘                               │
       │                                      │
       ├── balance exhausted ──► ┌──────────┐ │
       │                         │  PAUSED  │─┘
       │                         └────┬─────┘
       │                              │ requiredCumulative > deposit
       │                              ▼
       │                        ┌───────────┐
       │                        │ TOPPING UP│─────┘
       │                        └───────────┘
       │
       │ Client sends payment.close
       ▼
 ┌───────────┐
 │  CLOSING  │  Server settling on-chain
 └─────┬─────┘
       │ close() confirmed
       ▼
 ┌───────────┐
 │  CLOSED   │
 └───────────┘
```

**Transitions:**

| From | To | Trigger |
|------|----|---------|
| CONNECTED | CHALLENGED | Server returns `-32042` with `intent="session"` |
| CHALLENGED | OPENING | Client sends `open` credential |
| OPENING | METERED | On-chain confirmation received |
| METERED | PAUSED | `available < cost` for next unit |
| PAUSED | METERED | Valid voucher advances `acceptedCumulative` |
| PAUSED | TOPPING UP | `requiredCumulative > deposit` |
| TOPPING UP | METERED | `payment.topUp` confirmed + voucher received |
| METERED | CLOSING | Client sends `payment.close` |
| CLOSING | CLOSED | On-chain `close()` confirmed |

**Connection drop at any state**: See §7.

---

## 7. Reconnect and Resume

When a WebSocket connection drops during an active session:

1. The server retains the highest accepted voucher and MAY
   settle on-chain at any time.
2. The channel remains open on-chain until explicitly closed
   (cooperative or forced).
3. This specification does not prescribe server behavior on
   disconnect. Servers MAY settle immediately, hold state
   for reconnection, or apply their own policy.

### 7.1. Resume Procedure

To resume a session on a new WebSocket connection:

1. **Client connects** and receives `payment.capabilities`.
2. **Client sends a request** that triggers a `-32042` challenge.
   The server SHOULD include `methodDetails.channelId` pointing
   to the existing channel.
3. **Client sends a `payment.voucher`** with its highest locally-
   known `cumulativeAmount` and `signature`.
4. **Server responds** with the current session state
   (`acceptedCumulative`, `spent`, `available`).
5. If the voucher matches or exceeds the server's state, the
   session resumes in METERED. If it is below, the server
   responds with the current highest state (idempotent).
6. The session is now active on the new connection.

The client does NOT need to re-send `action="open"` — the
channel is already open on-chain. The voucher exchange
re-establishes the off-chain state.

### 7.2. Challenge for Existing Channels

When a server recognizes a returning client (e.g., via
authentication or address), it SHOULD include the existing
`channelId` in the challenge's `methodDetails`:

```json
{
  "request": {
    "amount": "25",
    "currency": "0x20c0...",
    "recipient": "0x742d...",
    "methodDetails": {
      "escrowContract": "0x9d13...",
      "channelId": "0x6d0f...",
      "chainId": 42431
    }
  }
}
```

This tells the client to resume the existing channel rather
than opening a new one.

---

## 8. Security Considerations

### 8.1. Transport Security

All connections MUST use `wss://`. See §2.1.

### 8.2. Voucher Flood Mitigation

Servers MUST limit `payment.voucher` submissions to 10 per
second per connection. Servers SHOULD perform format validation
(field presence, hex encoding, string lengths) before ECDSA
signature recovery. Servers SHOULD skip signature verification
for vouchers that do not advance state (return current state
per §4.2 idempotency).

Servers MAY close the WebSocket with status code 1008 (Policy
Violation) after repeated invalid payment messages.

### 8.3. Credential and Voucher Confidentiality

Payment control messages contain EIP-712 signatures and
transaction blobs that could result in financial loss if
intercepted. Beyond TLS:

- Servers MUST NOT log `payment.voucher` or credential payloads
  in plaintext.
- Servers SHOULD minimize retention of voucher signatures.
- Clients MUST NOT persist voucher signatures beyond the session
  lifetime.

### 8.4. Overpayment on Disconnect

Vouchers are irrevocable payment authorizations. If a client
signs a voucher for `cumulativeAmount = 500000` but only
receives `spent = 300000` worth of service before disconnect,
the server MAY settle up to `500000`.

Clients SHOULD use reactive or consumption-tracking voucher
strategies (§5.3) to minimize overpayment risk with untrusted
servers.

### 8.5. Pre-Upgrade Resource Exhaustion

Without pre-upgrade challenges (§3.1), unauthenticated clients
can consume server connection resources by completing the
WebSocket handshake without paying.

Servers that require payment for all operations SHOULD use
pre-upgrade 402 challenges. Servers MAY additionally impose
connection rate limits and idle timeouts.

### 8.6. Payment-Before-Auth Ordering

When a resource requires both authentication and payment,
servers MUST verify authentication before issuing payment
challenges, per `draft-httpauth-payment-00` §3.3. On WebSocket:

- Authentication SHOULD occur during the HTTP upgrade (e.g.,
  via cookies, bearer tokens, or client certificates).
- Servers MUST NOT send `payment.capabilities` or payment
  challenges before authentication succeeds for endpoints
  that require authentication.

### 8.7. Namespace Collision

The `payment.*` method prefix is used for all payment control
messages. Applications using JSON-RPC over the same WebSocket
MUST NOT define methods with the `payment.` prefix.

If namespace collision is a concern, servers SHOULD use a
WebSocket subprotocol (e.g., `Sec-WebSocket-Protocol: paymentauth.v1`)
to signal that the `payment.*` namespace is reserved.

---

## 9. IANA Considerations

This document has no IANA actions. Payment methods and intents
are registered per `draft-httpauth-payment-00`. Error codes
(`-32042`, `-32043`) are defined in
`draft-payment-transport-mcp-00`.

---

## 10. Message Summary

| Message | Direction | JSON-RPC Type | Metered | Allowed While Paused |
|---------|-----------|---------------|---------|---------------------|
| `payment.capabilities` | S→C, C→S | Notification | No | Yes |
| `-32042` error | S→C | Error response | No | N/A |
| `org.paymentauth/credential` (open) | C→S | On request `_meta` | No | N/A |
| `payment.voucher` | C→S | Request | No | Yes |
| `payment.topUp` | C→S | Request | No | Yes |
| `payment.close` | C→S | Request | No | Yes |
| `payment.needVoucher` | S→C | Notification | No | N/A (triggers pause) |
| `payment.receipt` | S→C | Notification | No | Yes |
| `payment.error` | S→C | Notification | No | Yes |

---

## Appendix A: Future Work — Bidirectional Metering

The session intent as defined in `draft-tempo-session-00` is
unidirectional: the server meters outbound delivery and the
client pays for service received. WebSocket connections are
inherently bidirectional, enabling a second metering direction
where the server charges for data the client sends (uploads,
prompts, input streams).

Bidirectional metering changes the payment semantic — it is not
merely a transport concern. A future document may define:

- A `methodDetails.inbound` pricing extension
- Rules for combined inbound/outbound balance accounting
- Maximum unpaid inbound message size (DoS mitigation)
- Whether the server rejects or buffers unpaid inbound messages

This is deferred because:

1. It would change session intent semantics, which should be
   done in a revision to `draft-tempo-session-00` or a new
   intent specification.
2. Exact per-message inbound metering on a single ordered
   WebSocket stream is inherently approximate — the server
   must receive and parse a message before it can price it.
   A future multistream transport (WebTransport, HTTP/3) may
   be a better substrate for precise bidirectional metering.

## Appendix B: Relationship to SSE Transport

Over HTTP, the session intent uses Server-Sent Events for
balance signals during streaming responses:

| SSE (HTTP) | WebSocket (this spec) |
|------------|----------------------|
| `event: payment-need-voucher` | `payment.needVoucher` notification |
| `event: payment-receipt` | `payment.receipt` notification |
| Voucher via `Authorization: Payment` on HTTP request | `payment.voucher` request on WS |
| `HEAD` request for voucher-only updates | `payment.voucher` request on WS |

The semantics are identical; only the framing differs. A service
MAY support both HTTP+SSE and WebSocket transports concurrently.
