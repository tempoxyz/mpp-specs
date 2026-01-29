---
title: Tempo stream Intent for HTTP Payment Authentication
abbrev: Tempo Stream
docname: draft-tempo-stream-00
version: 00
category: info
ipr: trust200902
submissiontype: IETF
consensus: true

author:
  - name: Georgios Konstantopoulos
    ins: G. Konstantopoulos
    email: georgios@tempo.xyz
    organization: Tempo Labs
  - name: Jake Moxey
    ins: J. Moxey
    email: jake@tempo.xyz
    organization: Tempo Labs
  - name: Brendan Ryan
    ins: B. Ryan
    email: brendan@tempo.xyz
    organization: Tempo Labs

normative:
  RFC2119:
  RFC4648:
  RFC8174:
  RFC8259:
  I-D.httpauth-payment:
    title: "The 'Payment' HTTP Authentication Scheme"
    target: https://datatracker.ietf.org/doc/draft-ietf-httpauth-payment/
    author:
      - name: Jake Moxey
    date: 2026-01
  EIP-712:
    title: "Typed structured data hashing and signing"
    target: https://eips.ethereum.org/EIPS/eip-712
    author:
      - name: Remco Bloemen
    date: 2017-09

informative:
  SSE:
    title: "Server-Sent Events"
    target: https://html.spec.whatwg.org/multipage/server-sent-events.html
    author:
      - org: WHATWG
  TEMPO-TX-SPEC:
    title: "Tempo Transaction Specification"
    target: https://docs.tempo.xyz/protocol/transactions/spec-tempo-transaction
    author:
      - org: Tempo Labs
---

--- abstract

This document defines the "stream" intent for the "tempo" payment method
in the Payment HTTP Authentication Scheme {{I-D.httpauth-payment}}. It
specifies unidirectional streaming payment channels for incremental,
voucher-based payments suitable for metered services such as AI token
streaming.

--- middle

# Introduction

The `stream` intent establishes a unidirectional streaming payment channel
using on-chain escrow and off-chain EIP-712 vouchers. This enables high-
frequency, low-cost payments by batching many off-chain voucher signatures
into periodic on-chain settlements.

Unlike the `charge` intent which requires the payment amount upfront, the
`stream` intent allows clients to pay incrementally as they consume
services, paying exactly for resources received.

## Use Case: AI Token Streaming

Consider an AI API that charges per output token:

1. Client requests a streaming completion (SSE response)
2. Server returns 402 with a `stream` challenge
3. Client opens a payment channel on-chain, depositing funds
4. Server begins streaming tokens
5. As tokens stream, client signs vouchers with increasing amounts
6. Server settles periodically or at stream completion

The client pays exactly for tokens received, with no worst-case reservation.

## Stream Flow

The following diagram illustrates the Tempo stream flow:

~~~
   Client                        Server                     Tempo Network
      |                             |                             |
      |  (1) GET /api/stream        |                             |
      |-------------------------->  |                             |
      |                             |                             |
      |  (2) 402 Payment Required   |                             |
      |      intent="stream"        |                             |
      |<--------------------------  |                             |
      |                             |                             |
      |  (3) Open channel on-chain  |                             |
      |------------------------------------------------------>    |
      |                             |                             |
      |  (4) Authorization: Payment |                             |
      |      action="open"          |                             |
      |-------------------------->  |                             |
      |                             |                             |
      |  (5) 200 OK (SSE stream)    |                             |
      |<--------------------------  |                             |
      |                             |                             |
      |  (6) POST /stream           |                             |
      |      (updated vouchers)     |                             |
      |-------------------------->  |                             |
      |                             |                             |
      |  (7) POST /stream           |                             |
      |      action="close"         |                             |
      |-------------------------->  |                             |
      |                             |  (8) close(voucher)         |
      |                             |-------------------------->  |
      |                             |                             |
      |  (9) 200 OK + Receipt       |                             |
      |<--------------------------  |                             |
      |                             |                             |
~~~

# Requirements Language

{::boilerplate bcp14-tagged}

# Terminology

Streaming Payment Channel
: A unidirectional off-chain payment mechanism where the payer deposits
  funds into an escrow contract and signs cumulative vouchers authorizing
  increasing payment amounts.

Voucher
: An EIP-712 signed message authorizing a cumulative payment amount for
  a specific channel. Vouchers are monotonically increasing in amount.

Channel
: A payment relationship between a payer and payee, identified by a
  unique `channelId`. The channel holds deposited funds and tracks
  cumulative settlements.

Settlement
: The on-chain TIP-20 transfer that converts off-chain voucher
  authorizations into actual token movement.

Authorized Signer
: An address delegated to sign vouchers on behalf of the payer.
  Defaults to the payer if not specified.

# Channel Escrow Contract

Streaming payment channels require an on-chain escrow contract that holds
user deposits and enforces voucher-based withdrawals.

## Channel State

Each channel is identified by a unique `channelId` and stores:

| Field | Type | Description |
|-------|------|-------------|
| `payer` | address | User who deposited funds |
| `payee` | address | Server authorized to withdraw |
| `token` | address | TIP-20 token address |
| `authorizedSigner` | address | Address authorized to sign vouchers (0 = payer) |
| `deposit` | uint128 | Total amount deposited |
| `settled` | uint128 | Cumulative amount already withdrawn by payee |
| `closeRequestedAt` | uint64 | Timestamp when close was requested (0 if not) |
| `finalized` | bool | Whether channel is closed |

The `channelId` MUST be computed deterministically:

~~~
channelId = keccak256(abi.encode(
    payer,
    payee,
    token,
    deposit,
    salt,
    authorizedSigner,
    contractAddress,
    chainId
))
~~~

## Channel Lifecycle

Channels have no expiry—they remain open until explicitly closed.

~~~
┌─────────────────────────────────────────────────────────────────┐
│                         CHANNEL OPEN                            │
│  Client deposits tokens, channel created with unique ID         │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      STREAMING PAYMENTS                         │
│  Client signs vouchers, server provides service                 │
│  Server may periodically settle() to claim funds                │
└─────────────────────────────────────────────────────────────────┘
                              │
              ┌───────────────┴───────────────┐
              ▼                               ▼
┌─────────────────────────┐     ┌─────────────────────────────────┐
│    COOPERATIVE CLOSE    │     │        FORCED CLOSE             │
│  Server calls close()   │     │  1. Client calls requestClose() │
│  with final voucher     │     │  2. Wait 15 min grace period    │
│                         │     │  3. Client calls withdraw()     │
└─────────────────────────┘     └─────────────────────────────────┘
              │                               │
              └───────────────┬───────────────┘
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                       CHANNEL CLOSED                            │
│  Funds distributed, channel finalized                           │
└─────────────────────────────────────────────────────────────────┘
~~~

## Contract Functions

### open

Opens a new channel with escrowed funds.

~~~solidity
function open(
    address payee,
    address token,
    uint128 deposit,
    bytes32 salt,
    address authorizedSigner
) external returns (bytes32 channelId);
~~~

### settle

Server withdraws funds using a signed voucher without closing.

~~~solidity
function settle(
    bytes32 channelId,
    uint128 cumulativeAmount,
    bytes calldata signature
) external;
~~~

### topUp

User adds more funds to an existing channel.

~~~solidity
function topUp(
    bytes32 channelId,
    uint128 additionalDeposit
) external;
~~~

### close

Server closes the channel, settling any outstanding voucher and refunding
the remainder to the payer. Only callable by the payee.

~~~solidity
function close(
    bytes32 channelId,
    uint128 cumulativeAmount,
    bytes calldata signature
) external;
~~~

### requestClose

User requests channel closure, starting a 15-minute grace period.

~~~solidity
function requestClose(bytes32 channelId) external;
~~~

### withdraw

User withdraws remaining funds after the grace period.

~~~solidity
function withdraw(bytes32 channelId) external;
~~~

# Request Schema

The `request` parameter in the `WWW-Authenticate` challenge contains a
base64url-encoded JSON object.

## Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `escrowContract` | string | REQUIRED | Address of the channel escrow contract |
| `currency` | string | REQUIRED | TIP-20 token address (e.g., `"0x20c0..."`) |
| `recipient` | string | REQUIRED | Payee address (server's withdrawal address) |
| `amount` | string | REQUIRED | Required deposit amount in base units |
| `expires` | string | REQUIRED | Expiry timestamp for this challenge in ISO 8601 format |
| `channelId` | string | CONDITIONAL | Channel ID if channel already exists |
| `salt` | string | CONDITIONAL | Random salt for new channel |
| `streamEndpoint` | string | REQUIRED | HTTPS URL for voucher and close request submission |
| `minVoucherDelta` | string | OPTIONAL | Minimum amount increase between vouchers (default: `"1"`) |

Either `channelId` or `salt` MUST be provided, but not both:

- **New channel**: Server provides `salt`. Client computes `channelId`
  using the formula in Section 4.1, opens the channel on-chain, and
  returns the `channelId` in the credential.
- **Existing channel**: Server provides `channelId`. Client MUST verify
  `channel.deposit - channel.settled >= amount` before resuming. If
  insufficient, client SHOULD either call `topUp()` with the difference
  or request a new channel.

Servers SHOULD prefer reusing existing channels when the client has an
open channel with sufficient remaining deposit. This reduces on-chain
transactions and improves user experience.

## Method Details

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `methodDetails.chainId` | number | OPTIONAL | Tempo chain ID (default: 42431) |

**Example (new channel):**

~~~json
{
  "escrowContract": "0x1234567890abcdef1234567890abcdef12345678",
  "currency": "0x20c0000000000000000000000000000000000001",
  "recipient": "0x742d35Cc6634C0532925a3b844Bc9e7595f8fE00",
  "amount": "10000000",
  "expires": "2025-01-06T12:05:00Z",
  "salt": "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
  "streamEndpoint": "https://api.example.com/payments/stream",
  "minVoucherDelta": "1000",
  "methodDetails": {
    "chainId": 42431
  }
}
~~~

**Example (existing channel):**

~~~json
{
  "escrowContract": "0x1234567890abcdef1234567890abcdef12345678",
  "currency": "0x20c0000000000000000000000000000000000001",
  "recipient": "0x742d35Cc6634C0532925a3b844Bc9e7595f8fE00",
  "amount": "10000000",
  "expires": "2025-01-06T12:05:00Z",
  "channelId": "0x6d0f4fdf1f2f6a1f6c1b0fbd6a7d5c2c0a8d3d7b1f6a9c1b3e2d4a5b6c7d8e9f",
  "streamEndpoint": "https://api.example.com/payments/stream",
  "minVoucherDelta": "1000",
  "methodDetails": {
    "chainId": 42431
  }
}
~~~

# Credential Schema

The credential in the `Authorization` header contains a base64url-encoded
JSON object per Section 5.2 of {{I-D.httpauth-payment}}.

## Credential Structure

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `challenge` | object | REQUIRED | Echo of the challenge from the server |
| `payload` | object | REQUIRED | Stream-specific payload object |
| `source` | string | OPTIONAL | Payer identifier as a DID |

## Payload Actions

The `payload` object uses an `action` discriminator:

| Action | Description |
|--------|-------------|
| `open` | Confirms channel is open on-chain; begins streaming |
| `voucher` | Submits an updated cumulative voucher |
| `close` | Requests server to close the channel |

### Open Payload

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `action` | string | REQUIRED | `"open"` |
| `channelId` | string | REQUIRED | Channel ID (computed from request) |
| `authorizedSigner` | string | OPTIONAL | Delegated signer address |
| `openTxHash` | string | REQUIRED | Transaction hash of channel open |
| `voucher` | object | REQUIRED | Initial signed voucher (amount=0) |

The initial zero-amount voucher proves the client controls the signing key
and establishes the voucher chain.

The `voucher` object contains:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `payload` | object | REQUIRED | EIP-712 typed data |
| `signature` | string | REQUIRED | Hex-encoded signature |

**Example:**

~~~json
{
  "challenge": { "id": "kM9xPqWvT2nJrHsY4aDfEb", ... },
  "payload": {
    "action": "open",
    "channelId": "0x6d0f4fdf1f2f6a1f6c1b0fbd6a7d5c2c0a8d3d7b1f6a9c1b3e2d4a5b6c7d8e9f",
    "openTxHash": "0xabcd1234567890abcdef1234567890abcdef1234567890abcdef1234567890ab",
    "voucher": {
      "payload": {
        "primaryType": "Voucher",
        "domain": {
          "name": "Tempo Stream Channel",
          "version": "1",
          "chainId": 42431,
          "verifyingContract": "0x7a6357db33731cfb7b9d54aca750507f13a3fec0"
        },
        "types": {
          "Voucher": [
            { "name": "channelId", "type": "bytes32" },
            { "name": "cumulativeAmount", "type": "uint128" }
          ]
        },
        "message": {
          "channelId": "0x6d0f4fdf1f2f6a1f6c1b0fbd6a7d5c2c0a8d3d7b1f6a9c1b3e2d4a5b6c7d8e9f",
          "cumulativeAmount": "0"
        }
      },
      "signature": "0x1234567890abcdef..."
    }
  },
  "source": "did:pkh:eip155:42431:0x1234567890abcdef1234567890abcdef12345678"
}
~~~

### Voucher Payload

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `action` | string | REQUIRED | `"voucher"` |
| `channelId` | string | REQUIRED | Channel ID |
| `voucher` | object | REQUIRED | Signed voucher with higher amount |

### Close Payload

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `action` | string | REQUIRED | `"close"` |
| `channelId` | string | REQUIRED | Channel ID |
| `closeRequest` | object | REQUIRED | Signed close request |

The `closeRequest` uses EIP-712 with type
`CloseRequest(bytes32 channelId, uint64 requestedAt)`. The `requestedAt`
timestamp prevents replay attacks; servers SHOULD reject requests older
than 5 minutes.

Note: CloseRequest is an off-chain signal only. The contract's
`requestClose()` function does not verify this signature; it is called
directly by the payer when cooperative close fails.

# EIP-712 Voucher Format

Vouchers use EIP-712 typed data with cumulative semantics: each voucher
authorizes a cumulative total amount, not an incremental delta.

## Type Definitions

~~~
Voucher(bytes32 channelId, uint128 cumulativeAmount)
~~~

## Domain Parameters

| Field | Value |
|-------|-------|
| `name` | `"Tempo Stream Channel"` |
| `version` | `"1"` |
| `chainId` | Tempo chain ID (e.g., 42431) |
| `verifyingContract` | `request.escrowContract` |

## Cumulative Semantics

Vouchers specify cumulative totals, not incremental deltas:

- Voucher #1: `cumulativeAmount = 100` (authorizes 100 total)
- Voucher #2: `cumulativeAmount = 250` (authorizes 250 total)
- Voucher #3: `cumulativeAmount = 400` (authorizes 400 total)

When settling, the contract computes: `delta = cumulativeAmount - settled`

This allows partial settlement while the channel remains usable.

# Verification Procedure

## Open Verification

On `action="open"`, servers MUST:

1. Verify `openTxHash` references a confirmed transaction
2. Query the escrow contract to verify channel state:
   - Channel exists with matching `channelId`
   - `channel.payee` matches server's address
   - `channel.token` matches `request.currency`
   - `channel.deposit >= request.amount`
   - `channel.settled == 0` (fresh channel)
3. Verify the initial voucher:
   - Recover signer from EIP-712 signature
   - Signer matches `channel.payer` or `channel.authorizedSigner`
   - `voucher.channelId` matches
   - `voucher.cumulativeAmount == 0` for initial voucher
4. Initialize server-side channel state

## Voucher Verification

On `action="voucher"`, servers MUST:

1. Verify voucher signature
2. Recover signer and verify it matches expected signer
3. Verify monotonicity:
   - `cumulativeAmount > highestVoucherAmount`
   - `(cumulativeAmount - highestVoucherAmount) >= minVoucherDelta`
4. Verify `cumulativeAmount <= channel.deposit`
5. Persist voucher to durable storage before providing service
6. Update `highestVoucherAmount = cumulativeAmount`

Servers MUST persist the highest voucher to durable storage before
providing the corresponding service. Failure to do so may result in
unrecoverable fund loss if the server crashes after service delivery.

## Rejection and Error Responses

If verification fails, servers MUST return an appropriate HTTP status
code with a JSON error response:

| Status | When |
|--------|------|
| 400 Bad Request | Malformed payload or missing fields |
| 401 Unauthorized | Invalid signature or signer mismatch |
| 409 Conflict | Stale voucher (amount not increasing) |
| 410 Gone | Channel finalized or not found |

Error response format:

~~~json
{
  "error": "Human-readable error message",
  "code": "ERROR_CODE",
  "channelId": "0x..."
}
~~~

Error codes:

| Code | Description |
|------|-------------|
| `INVALID_SIGNATURE` | Voucher or close request signature invalid |
| `SIGNER_MISMATCH` | Signer is not authorized for this channel |
| `AMOUNT_NOT_INCREASING` | Voucher amount not higher than previous |
| `AMOUNT_EXCEEDS_DEPOSIT` | Voucher amount exceeds channel deposit |
| `DELTA_TOO_SMALL` | Amount increase below `minVoucherDelta` |
| `CHANNEL_NOT_FOUND` | No channel with this ID exists |
| `CHANNEL_FINALIZED` | Channel has been closed |

## Stream Endpoint Responses

Successful voucher submissions to `streamEndpoint` MUST return:

~~~
HTTP/1.1 200 OK
Content-Type: application/json

{
  "accepted": true,
  "highestAmount": "250000"
}
~~~

Servers SHOULD limit voucher submissions to 10 per second per channel.
Servers MAY implement IP-based rate limiting for unauthenticated requests.

# Settlement Procedure

## Settlement Timing

Servers MAY settle at any time using their own criteria:

- Periodically (e.g., every N seconds or M base units accrued)
- When `action="close"` is received
- When accumulated unsettled amount exceeds a threshold
- Based on gas cost optimization

Settlement frequency is an implementation detail left to servers.

The `close()` function settles any delta between the provided
`cumulativeAmount` and `channel.settled`. If the server has already
settled the highest voucher via `settle()`, calling `close()` with the
same amount will only refund the payer the remaining deposit.

## Cooperative Close

When the client sends `action="close"`:

1. Server receives the signed close request
2. Server calls `close(channelId, cumulativeAmount, signature)` on-chain
3. Contract settles any delta and refunds remainder to payer
4. Server returns receipt with transaction hash

Servers SHOULD close promptly when clients request—the economic
incentive is to claim earned funds immediately.

## Forced Close

If the server does not respond to close requests:

1. Client calls `requestClose(channelId)` on-chain
2. 15-minute grace period begins (wall-clock time via `block.timestamp`)
3. Server can still `settle()` or `close()` during grace period
4. After grace period, client calls `withdraw(channelId)`
5. Client receives all remaining (unsettled) funds

Clients SHOULD wait at least 16 minutes after `requestClose()` before
calling `withdraw()` to account for block time variance.

## Concurrent Streams

A single channel MAY be used for multiple sequential or concurrent
streams. The cumulative voucher semantics ensure correctness regardless
of stream count—each voucher authorizes a total amount, and the
contract tracks cumulative settlements.

## Voucher Submission Transport

Vouchers MUST be submitted via separate HTTP requests to `streamEndpoint`,
independent of any SSE connection used for streaming content. Clients
SHOULD use HTTP/2 multiplexing or maintain separate connections for
voucher submission and content streaming.

## Receipt Generation

Upon successful settlement or close, servers MUST return a `Payment-Receipt`
header per Section 5.3 of {{I-D.httpauth-payment}}.

The base Payment Auth spec defines core receipt fields. The stream intent
extends the receipt with additional fields in the `streamFields` object:

| Field | Type | Description |
|-------|------|-------------|
| `method` | string | `"tempo"` |
| `reference` | string | Transaction hash of settlement/close |
| `status` | string | `"success"` or `"failed"` |
| `timestamp` | string | ISO 8601 settlement time |
| `streamFields.channelId` | string | The channel identifier |
| `streamFields.settledAmount` | string | Total amount settled to payee |

# Security Considerations

## Replay Prevention

Vouchers are bound to a specific channel and contract via:

- `channelId` in the voucher message
- `verifyingContract` in EIP-712 domain
- `chainId` in EIP-712 domain
- Cumulative amount semantics (can only increase)

The escrow contract enforces:

- `cumulativeAmount > channel.settled` (monotonicity)
- `cumulativeAmount <= channel.deposit` (cap)

## No Voucher Expiry

Unlike the original proposal, vouchers have no `validUntil` field. This
simplifies the protocol:

- Channels have no expiry—they are closed explicitly
- Vouchers remain valid until the channel closes
- The close grace period protects against clients disappearing

## Denial of Service

To mitigate voucher flooding:

- Enforce `minVoucherDelta` to prevent tiny increments
- Rate-limit voucher submissions per channel (SHOULD limit to 10/second)
- Reject vouchers that don't advance state

To mitigate channel griefing via dust deposits:

- Servers SHOULD enforce a minimum deposit (e.g., 1 USD equivalent)
- Servers MAY reject channels below this threshold

## Front-Running Protection

Cumulative voucher semantics prevent front-running attacks. If a client
submits a higher voucher while a server's `settle()` transaction is
pending, the settlement will still succeed—it merely leaves additional
unsettled funds that the server can claim later.

## Cross-Contract Replay Prevention

The EIP-712 domain includes `verifyingContract`, binding vouchers to a
specific escrow contract address. This prevents replay of vouchers
across different escrow contract deployments.

## Escrow Guarantees

The escrow contract provides:

- **Payer protection**: Funds only withdrawn with valid voucher signature
- **Payee protection**: Deposited funds guaranteed (cannot be drained)
- **Forced close**: 15-minute grace period protects both parties

## Authorized Signer

The `authorizedSigner` field allows delegation of signing authority
to a hot wallet while the main wallet only deposits funds. This reduces
exposure of the primary key during streaming sessions.

**Security considerations for delegated signing:**

- Clients using `authorizedSigner` delegation SHOULD limit channel
  deposits to acceptable loss amounts
- Clients SHOULD rotate authorized signers periodically
- Clients SHOULD NOT reuse signers across multiple high-value channels
- If the authorized signer key is compromised, an attacker can drain
  the entire channel deposit

# IANA Considerations

## Payment Intent Registration

This document registers the following payment intent in the "HTTP Payment
Intents" registry established by {{I-D.httpauth-payment}}:

| Intent | Applicable Methods | Description | Reference |
|--------|-------------------|-------------|-----------|
| `stream` | `tempo` | Streaming payment channel | This document |

--- back

# Example

## Challenge

~~~http
HTTP/1.1 402 Payment Required
WWW-Authenticate: Payment id="kM9xPqWvT2nJrHsY4aDfEb",
  realm="api.ai-service.com",
  method="tempo",
  intent="stream",
  request="eyJlc2Nyb3dDb250cmFjdCI6IjB4N2E2MzU3ZGIzMzczMWNmYjdiOWQ1NGFjYTc1MDUwN2YxM2EzZmVjMCIsImN1cnJlbmN5IjoiMHgyMGMwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAxIiwicmVjaXBpZW50IjoiMHg3NDJkMzVDYzY2MzRDMDUzMjkyNWEzYjg0NEJjOWU3NTk1ZjhmRTAwIiwiYW1vdW50IjoiMTAwMDAwMDAiLCJleHBpcmVzIjoiMjAyNS0wMS0wNlQxMjowNTowMFoiLCJzYWx0IjoiMHhhYmNkZWYxMjM0NTY3ODkwYWJjZGVmMTIzNDU2Nzg5MGFiY2RlZjEyMzQ1Njc4OTBhYmNkZWYxMjM0NTY3ODkwIiwic3RyZWFtRW5kcG9pbnQiOiJodHRwczovL2FwaS5haS1zZXJ2aWNlLmNvbS9wYXltZW50cy9zdHJlYW0iLCJtaW5Wb3VjaGVyRGVsdGEiOiIxMDAwIn0"
~~~

The `request` decodes to:

~~~json
{
  "escrowContract": "0x7a6357db33731cfb7b9d54aca750507f13a3fec0",
  "currency": "0x20c0000000000000000000000000000000000001",
  "recipient": "0x742d35Cc6634C0532925a3b844Bc9e7595f8fE00",
  "amount": "10000000",
  "expires": "2025-01-06T12:05:00Z",
  "salt": "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
  "streamEndpoint": "https://api.ai-service.com/payments/stream",
  "minVoucherDelta": "1000"
}
~~~

This requests a deposit of 10.00 alphaUSD (10000000 base units).

## Open Credential

~~~http
GET /api/stream HTTP/1.1
Host: api.ai-service.com
Authorization: Payment eyJjaGFsbGVuZ2UiOnsiaWQiOiJrTTl4UHFXdlQybkpySHNZNGFEZkViIn0sInBheWxvYWQiOnsiYWN0aW9uIjoib3BlbiIsImNoYW5uZWxJZCI6IjB4NmQwZjRmZGYxZjJmNmExZjZjMWIwZmJkNmE3ZDVjMmMwYThkM2Q3YjFmNmE5YzFiM2UyZDRhNWI2YzdkOGU5ZiIsIm9wZW5UeEhhc2giOiIweGFiY2QxMjM0NTY3ODkwYWJjZGVmMTIzNDU2Nzg5MGFiY2RlZjEyMzQ1Njc4OTBhYmNkZWYxMjM0NTY3ODkwYWIiLCJ2b3VjaGVyIjp7InBheWxvYWQiOnt9LCJzaWduYXR1cmUiOiIweDEyMzQ1Njc4OTBhYmNkZWYuLi4ifX0sInNvdXJjZSI6ImRpZDpwa2g6ZWlwMTU1OjQyNDMxOjB4MTIzNDU2Nzg5MGFiY2RlZjEyMzQ1Njc4OTBhYmNkZWYxMjM0NTY3OCJ9
~~~

## Voucher Submission

During streaming, clients POST updated vouchers to the `streamEndpoint`:

~~~http
POST /payments/stream HTTP/1.1
Host: api.ai-service.com
Content-Type: application/json

{
  "action": "voucher",
  "channelId": "0x6d0f4fdf1f2f6a1f6c1b0fbd6a7d5c2c0a8d3d7b1f6a9c1b3e2d4a5b6c7d8e9f",
  "voucher": {
    "payload": {
      "primaryType": "Voucher",
      "domain": {
        "name": "Tempo Stream Channel",
        "version": "1",
        "chainId": 42431,
        "verifyingContract": "0x7a6357db33731cfb7b9d54aca750507f13a3fec0"
      },
      "types": {
        "Voucher": [
          { "name": "channelId", "type": "bytes32" },
          { "name": "cumulativeAmount", "type": "uint128" }
        ]
      },
      "message": {
        "channelId": "0x6d0f4fdf1f2f6a1f6c1b0fbd6a7d5c2c0a8d3d7b1f6a9c1b3e2d4a5b6c7d8e9f",
        "cumulativeAmount": "250000"
      }
    },
    "signature": "0x1234567890abcdef..."
  }
}
~~~

## Close Request

~~~http
POST /payments/stream HTTP/1.1
Host: api.ai-service.com
Content-Type: application/json

{
  "action": "close",
  "channelId": "0x6d0f4fdf1f2f6a1f6c1b0fbd6a7d5c2c0a8d3d7b1f6a9c1b3e2d4a5b6c7d8e9f",
  "closeRequest": {
    "payload": {
      "primaryType": "CloseRequest",
      "domain": {
        "name": "Tempo Stream Channel",
        "version": "1",
        "chainId": 42431,
        "verifyingContract": "0x7a6357db33731cfb7b9d54aca750507f13a3fec0"
      },
      "types": {
        "CloseRequest": [
          { "name": "channelId", "type": "bytes32" },
          { "name": "requestedAt", "type": "uint64" }
        ]
      },
      "message": {
        "channelId": "0x6d0f4fdf1f2f6a1f6c1b0fbd6a7d5c2c0a8d3d7b1f6a9c1b3e2d4a5b6c7d8e9f",
        "requestedAt": "1736165100"
      }
    },
    "signature": "0x1234567890abcdef..."
  }
}
~~~

# Reference Implementation

This appendix provides reference implementation details. These are
informative and not normative.

## Deployed Contracts

| Network | Chain ID | Contract Address |
|---------|----------|------------------|
| Moderato (Testnet) | 42431 | `0x7a6357db33731cfb7b9d54aca750507f13a3fec0` |

## Contract Source

The reference implementation is available at:

~~~
https://github.com/tempoxyz/ai-payments/tree/main/packages/stream-channels
~~~

### Solidity Interface

~~~solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface ITempoStreamChannel {
    struct Channel {
        address payer;
        address payee;
        address token;
        address authorizedSigner;
        uint128 deposit;
        uint128 settled;
        uint64 closeRequestedAt;
        bool finalized;
    }

    function CLOSE_GRACE_PERIOD() external view returns (uint64);
    function VOUCHER_TYPEHASH() external view returns (bytes32);
    function CLOSE_REQUEST_TYPEHASH() external view returns (bytes32);

    function open(
        address payee,
        address token,
        uint128 deposit,
        bytes32 salt,
        address authorizedSigner
    ) external returns (bytes32 channelId);

    function settle(
        bytes32 channelId,
        uint128 cumulativeAmount,
        bytes calldata signature
    ) external;

    function topUp(
        bytes32 channelId,
        uint128 additionalDeposit
    ) external;

    function close(
        bytes32 channelId,
        uint128 cumulativeAmount,
        bytes calldata signature
    ) external;

    function requestClose(bytes32 channelId) external;

    function withdraw(bytes32 channelId) external;

    function getChannel(bytes32 channelId)
        external view returns (Channel memory);

    function getChannelsBatch(bytes32[] calldata channelIds)
        external view returns (Channel[] memory);

    function computeChannelId(
        address payer,
        address payee,
        address token,
        uint128 deposit,
        bytes32 salt,
        address authorizedSigner
    ) external view returns (bytes32);

    function getVoucherDigest(
        bytes32 channelId,
        uint128 cumulativeAmount
    ) external view returns (bytes32);

    function getCloseRequestDigest(
        bytes32 channelId,
        uint64 requestedAt
    ) external view returns (bytes32);

    function domainSeparator() external view returns (bytes32);

    event ChannelOpened(
        bytes32 indexed channelId,
        address indexed payer,
        address indexed payee,
        address token,
        address authorizedSigner,
        uint256 deposit
    );

    event Settled(
        bytes32 indexed channelId,
        address indexed payer,
        address indexed payee,
        uint256 cumulativeAmount,
        uint256 deltaPaid,
        uint256 newSettled
    );

    event CloseRequested(
        bytes32 indexed channelId,
        address indexed payer,
        address indexed payee,
        uint256 closeGraceEnd
    );

    event TopUp(
        bytes32 indexed channelId,
        address indexed payer,
        address indexed payee,
        uint256 additionalDeposit,
        uint256 newDeposit
    );

    event ChannelClosed(
        bytes32 indexed channelId,
        address indexed payer,
        address indexed payee,
        uint256 settledToPayee,
        uint256 refundedToPayer
    );

    event ChannelExpired(
        bytes32 indexed channelId,
        address indexed payer,
        address indexed payee
    );

    error ChannelAlreadyExists();
    error ChannelNotFound();
    error ChannelFinalized();
    error InvalidSignature();
    error AmountExceedsDeposit();
    error AmountNotIncreasing();
    error NotPayer();
    error NotPayee();
    error TransferFailed();
    error CloseNotReady();
}
~~~

## TypeScript SDK

A TypeScript SDK is available at:

~~~
https://github.com/tempoxyz/ai-payments/tree/main/packages/stream-channels/src
~~~

### Voucher Signing

~~~typescript
import { hashTypedData, recoverTypedDataAddress } from 'viem'

const voucherTypes = {
  Voucher: [
    { name: 'channelId', type: 'bytes32' },
    { name: 'cumulativeAmount', type: 'uint128' },
  ],
} as const

function getVoucherDomain(escrowContract: Address, chainId: number) {
  return {
    name: 'Tempo Stream Channel',
    version: '1',
    chainId,
    verifyingContract: escrowContract,
  } as const
}

// Sign a voucher
const signature = await walletClient.signTypedData({
  domain: getVoucherDomain(escrowContract, 42431),
  types: voucherTypes,
  primaryType: 'Voucher',
  message: {
    channelId: '0x...',
    cumulativeAmount: 250000n,
  },
})

// Recover signer from voucher
const signer = await recoverTypedDataAddress({
  domain: getVoucherDomain(escrowContract, 42431),
  types: voucherTypes,
  primaryType: 'Voucher',
  message: {
    channelId: '0x...',
    cumulativeAmount: 250000n,
  },
  signature,
})
~~~

### Close Request Signing

~~~typescript
const closeRequestTypes = {
  CloseRequest: [
    { name: 'channelId', type: 'bytes32' },
    { name: 'requestedAt', type: 'uint64' },
  ],
} as const

// Sign a close request with timestamp for replay protection
const requestedAt = BigInt(Math.floor(Date.now() / 1000))

const signature = await walletClient.signTypedData({
  domain: getVoucherDomain(escrowContract, 42431),
  types: closeRequestTypes,
  primaryType: 'CloseRequest',
  message: {
    channelId: '0x6d0f4fdf1f2f6a1f6c1b0fbd6a7d5c2c0a8d3d7b1f6a9c1b3e2d4a5b6c7d8e9f',
    requestedAt,
  },
})

// Server should reject if requestedAt is older than 5 minutes
~~~

# Acknowledgements

The authors thank the Tempo community for their feedback on streaming
payment design.
