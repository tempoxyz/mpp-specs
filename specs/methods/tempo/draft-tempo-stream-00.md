---
title: Tempo Stream Intent for HTTP Payment Authentication
abbrev: Tempo Stream
docname: draft-tempo-stream-00
version: 00
category: info
ipr: trust200902
submissiontype: IETF
consensus: true

author:
  - name: Dan Robinson
    ins: D. Robinson
    email: dan@tempo.xyz
    organization: Tempo Labs
  - name: Georgios Konstantopoulos
    ins: G. Konstantopoulos
    email: georgios@tempo.xyz
    organization: Tempo Labs
  - name: Brendan Ryan
    ins: B. Ryan
    email: brendan@tempo.xyz
    organization: Tempo Labs
  - name: Jake Moxey
    ins: J. Moxey
    email: jake@tempo.xyz
    organization: Tempo Labs

normative:
  RFC2119:
  RFC3339:
  RFC4648:
  RFC8174:
  RFC8259:
  RFC9457:
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
  TIP-20:
    title: "TIP-20 Token Standard"
    target: https://docs.tempo.xyz/protocol/tip20/spec
    author:
      - org: Tempo Labs
---

--- abstract

This document defines the "stream" intent for the "tempo" payment method
in the Payment HTTP Authentication Scheme. It specifies unidirectional
streaming payment channels for incremental, voucher-based payments
suitable for metered services.

--- middle

# Introduction

The `stream` intent establishes a unidirectional streaming payment channel
using on-chain escrow and off-chain {{EIP-712}} vouchers. This enables high-
frequency, low-cost payments by batching many off-chain voucher signatures
into periodic on-chain settlements.

Unlike the `charge` intent which requires the payment amount upfront, the
`stream` intent allows clients to pay incrementally as they consume
services, paying exactly for resources received.

## Use Case: LLM Token Streaming

Consider an LLM API that charges per output token:

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
: An {{EIP-712}} signed message authorizing a cumulative payment amount for
  a specific channel. Vouchers are monotonically increasing in amount.

Channel
: A payment relationship between a payer and payee, identified by a
  unique `channelId`. The channel holds deposited funds and tracks
  cumulative settlements.

Settlement
: The on-chain {{TIP-20}} transfer that converts off-chain voucher
  authorizations into actual token movement.

Authorized Signer
: An address delegated to sign vouchers on behalf of the payer.
  Defaults to the payer if not specified.

Signature Type
: The cryptographic signature algorithm used for voucher signing. Tempo
  supports four types per {{TEMPO-TX-SPEC}}: `secp256k1` (65 bytes),
  `p256` (130 bytes), `webauthn` (variable), and `keychain` (variable).
  The signature is passed as opaque bytes; the verification precompile
  dispatches based on length and type prefix.

Highest Voucher Amount
: The highest `cumulativeAmount` from any voucher the server has received
  and persisted for a given channel. Servers MUST store this value in
  durable storage (e.g., database) to survive crashes and restarts.

Base Units
: The smallest indivisible unit of a TIP-20 token. TIP-20 tokens use
  6 decimal places; 1,000,000 base units equals 1.00 tokens.

# Channel Escrow Contract

Streaming payment channels require an on-chain escrow contract that holds
user deposits and enforces voucher-based withdrawals.

## Channel State

Each channel is identified by a unique `channelId` and stores:

| Field | Type | Description |
|-------|------|-------------|
| `payer` | address | User who deposited funds |
| `payee` | address | Server authorized to withdraw |
| `token` | address | {{TIP-20}} token address |
| `authorizedSigner` | address | Address authorized to sign vouchers (0 = payer) |
| `deposit` | uint256 | Total amount deposited |
| `settled` | uint256 | Cumulative amount already withdrawn by payee |
| `expiresAt` | uint64 | Optional expiry timestamp (0 = no expiry) |
| `closeRequestedAt` | uint64 | Timestamp when close was requested (0 if not) |
| `finalized` | bool | Whether channel is closed |

The `channelId` MUST be computed deterministically using the escrow
contract's `computeChannelId()` function:

~~~
channelId = keccak256(abi.encode(
    payer,
    payee,
    token,
    deposit,
    salt,
    authorizedSigner
))
~~~

Note: The `chainId` and `contractAddress` are implicitly bound via the
EIP-712 domain separator used for voucher verification. Clients MUST use
the contract's `computeChannelId()` function or equivalent logic to
ensure interoperability.

## Channel Lifecycle

Channels may optionally have an expiry timestamp. If `expiresAt` is set
(non-zero), the channel automatically becomes closeable after that time
without requiring user interaction. This enables subscription-style
use cases (e.g., monthly streaming budgets).

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
    uint256 deposit,
    bytes32 salt,
    address authorizedSigner,
    uint64 expiresAt
) external returns (bytes32 channelId);
~~~

The `expiresAt` parameter is optional (pass 0 for no expiry). If set,
the channel can be closed by anyone after the expiry time without
requiring the grace period flow.

### settle

Server withdraws funds using a signed voucher without closing.

~~~solidity
function settle(
    bytes32 channelId,
    uint256 cumulativeAmount,
    bytes calldata signature
) external;
~~~

### settleBatch

Server settles multiple channels in a single transaction for efficiency.

~~~solidity
function settleBatch(
    bytes32[] calldata channelIds,
    uint256[] calldata cumulativeAmounts,
    bytes[] calldata signatures
) external;
~~~

All arrays MUST have the same length. Each settlement is processed
independently; a failure in one does not revert the others.

### topUp

User adds more funds to an existing channel.

~~~solidity
function topUp(
    bytes32 channelId,
    uint256 additionalDeposit
) external;
~~~

### close

Server closes the channel, settling any outstanding voucher and refunding
the remainder to the payer. Only callable by the payee.

~~~solidity
function close(
    bytes32 channelId,
    uint256 cumulativeAmount,
    bytes calldata signature
) external;
~~~

### requestClose

User requests channel closure, starting a grace period. The grace period
SHOULD be 15 minutes but MAY be any value >= 15 minutes as configured by
the escrow contract deployment.

~~~solidity
function requestClose(bytes32 channelId) external;
~~~

### withdraw

User withdraws remaining funds after the grace period.

~~~solidity
function withdraw(bytes32 channelId) external;
~~~

## Access Control

The escrow contract MUST enforce the following access control:

| Function | Caller | Description |
|----------|--------|-------------|
| `open` | Anyone | Creates channel; caller becomes payer |
| `settle` | Payee only | Withdraws funds using voucher |
| `topUp` | Payer only | Adds funds to existing channel |
| `close` | Payee only | Closes channel with final voucher |
| `requestClose` | Payer only | Initiates forced close |
| `withdraw` | Payer only | Withdraws after grace period |

## Signature Verification

The escrow contract MUST perform the following signature verification for
all functions that accept voucher signatures (`settle`, `close`).

### Signature Type Detection

Signatures are passed as opaque bytes. The signature type is determined
by length and type prefix per {{TEMPO-TX-SPEC}}:

| Type | Detection | Length |
|------|-----------|--------|
| `secp256k1` | Exactly 65 bytes, no prefix | 65 bytes |
| `p256` | First byte `0x01` | 130 bytes |
| `webauthn` | First byte `0x02` | 129-2049 bytes |
| `keychain` | First byte `0x03` + 20 bytes address + inner sig | Variable |

The escrow contract (or future signature verification precompile)
dispatches to the appropriate verification logic based on these rules.
This enables support for passkey accounts (P256/WebAuthn) and delegated
access keys (Keychain) without protocol changes.

### Verification Requirements

1. **Canonical signatures**: For secp256k1 signatures, the contract MUST
   reject signatures with non-canonical (high-s) values. Signatures MUST
   have `s <= secp256k1_order / 2` where the half-order is
   `0x7FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF5D576E7357A4501DDFE92F46681B20A0`.
   See {{signature-malleability}} for rationale.

2. **Authorized signer verification**: The contract MUST recover the
   signer address from the EIP-712 signature and verify it matches the
   expected signer for the channel:
   - If `channel.authorizedSigner` is non-zero, the recovered signer
     MUST equal `channel.authorizedSigner`
   - Otherwise, the recovered signer MUST equal `channel.payer`

3. **Domain binding**: The contract MUST use its own address as the
   `verifyingContract` in the EIP-712 domain separator, ensuring
   vouchers cannot be replayed across different escrow deployments.

Failure to enforce these requirements on-chain would allow attackers to
bypass server-side validation by submitting transactions directly to
the contract.

# Request Schema

The `request` parameter in the `WWW-Authenticate` challenge contains a
base64url-encoded JSON object.

## Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `amount` | string | REQUIRED | Required deposit amount in base units |
| `currency` | string | REQUIRED | {{TIP-20}} token address (e.g., `"0x20c0..."`) |
| `recipient` | string | REQUIRED | Payee address (server's withdrawal address)—equivalent to the on-chain `payee` |

Challenge expiry is specified via the `expires` auth-param in the
`WWW-Authenticate` header per {{I-D.httpauth-payment}}, using {{RFC3339}}
timestamp format.

## Method Details

As of version 00, stream-specific request fields are placed in
`methodDetails`. A future high-level "stream" intent definition may
promote common fields to the core schema.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `methodDetails.escrowContract` | string | REQUIRED | Address of the channel escrow contract |
| `methodDetails.channelId` | string | CONDITIONAL | Channel ID if channel already exists |
| `methodDetails.salt` | string | CONDITIONAL | Random salt for new channel |
| `methodDetails.channelExpiresAt` | string | OPTIONAL | Channel expiry timestamp in {{RFC3339}} format (for new channels). Enables auto-close after expiry without user tx. |
| `methodDetails.streamEndpoint` | string | REQUIRED | HTTPS URL for voucher and close request submission. Servers MUST include appropriate CORS headers to allow browser-based clients. |
| `methodDetails.minVoucherDelta` | string | OPTIONAL | Minimum amount increase between vouchers (default: `"1"`) |
| `methodDetails.chainId` | number | OPTIONAL | Tempo chain ID (default: 42431) |

Either `channelId` or `salt` MUST be provided in `methodDetails`, but not both:

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

**Example (new channel):**

~~~json
{
  "amount": "10000000",
  "currency": "0x20c0000000000000000000000000000000000001",
  "recipient": "0x742d35Cc6634C0532925a3b844Bc9e7595f8fE00",
  "methodDetails": {
    "escrowContract": "0x1234567890abcdef1234567890abcdef12345678",
    "salt": "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
    "streamEndpoint": "https://api.example.com/payments/stream",
    "minVoucherDelta": "1000",
    "chainId": 42431
  }
}
~~~

**Example (existing channel):**

~~~json
{
  "amount": "10000000",
  "currency": "0x20c0000000000000000000000000000000000001",
  "recipient": "0x742d35Cc6634C0532925a3b844Bc9e7595f8fE00",
  "methodDetails": {
    "escrowContract": "0x1234567890abcdef1234567890abcdef12345678",
    "channelId": "0x6d0f4fdf1f2f6a1f6c1b0fbd6a7d5c2c0a8d3d7b1f6a9c1b3e2d4a5b6c7d8e9f",
    "streamEndpoint": "https://api.example.com/payments/stream",
    "minVoucherDelta": "1000",
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

The `source` field, if present, SHOULD use the `did:pkh` method with the
Tempo chain ID (42431 for Moderato testnet) and the payer's address.

## Payload Actions

The `payload` object uses an `action` discriminator:

| Action | Description |
|--------|-------------|
| `open` | Confirms channel is open on-chain; begins streaming |
| `resume` | Resumes an existing channel without opening a new one |
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
| `channelId` | string | REQUIRED | Channel ID (bytes32 hex) |
| `cumulativeAmount` | string | REQUIRED | Cumulative amount in base units |
| `signature` | string | REQUIRED | Hex-encoded EIP-712 signature |

The signature is computed over the EIP-712 typed data with domain bound to
the escrow contract. The contract reconstructs the signing payload from
`channelId` and `cumulativeAmount`.

**Example:**

~~~json
{
  "challenge": {
    "id": "kM9xPqWvT2nJrHsY4aDfEb",
    "realm": "api.llm-service.com",
    "method": "tempo",
    "intent": "stream",
    "request": "eyJhbW91bnQiOiIxMDAwMDAwMCIsImN1cnJlbmN5IjoiMHgyMGMw...",
    "expires": "2025-01-06T12:05:00Z"
  },
  "payload": {
    "action": "open",
    "channelId": "0x6d0f4fdf1f2f6a1f6c1b0fbd6a7d5c2c0a8d3d7b1f6a9c1b3e2d4a5b6c7d8e9f",
    "openTxHash": "0xabcd1234567890abcdef1234567890abcdef1234567890abcdef1234567890ab",
    "voucher": {
      "channelId": "0x6d0f4fdf1f2f6a1f6c1b0fbd6a7d5c2c0a8d3d7b1f6a9c1b3e2d4a5b6c7d8e9f",
      "cumulativeAmount": "0",
      "signature": "0x1234567890abcdef..."
    }
  },
  "source": "did:pkh:eip155:42431:0x1234567890abcdef1234567890abcdef12345678"
}
~~~

The `challenge` object MUST echo all parameters from the server's
`WWW-Authenticate` header per {{I-D.httpauth-payment}} Section 5.2.

### Resume Payload

When the server provides `channelId` in the challenge (existing channel),
clients use `action="resume"` instead of `action="open"`:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `action` | string | REQUIRED | `"resume"` |
| `channelId` | string | REQUIRED | Channel ID from challenge |
| `voucher` | object | REQUIRED | Signed voucher proving control of signing key |

The voucher amount MUST be >= `channel.settled` (the highest amount already
settled on-chain). Clients SHOULD query the channel state to determine
the current settled amount before resuming.

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
| `voucher` | object | REQUIRED | Final signed voucher for settlement |
| `closeRequest` | object | OPTIONAL | Signed close request for authentication |

The `voucher` field contains the final cumulative voucher that the server
will use to call `close(channelId, cumulativeAmount, signature)` on-chain.
This is the same voucher format used in `action="voucher"` payloads.

The optional `closeRequest` uses EIP-712 with type
`CloseRequest(bytes32 channelId, uint64 requestedAt)`. The `requestedAt`
timestamp provides replay protection for the close intent; servers SHOULD
reject requests older than 5 minutes. If omitted, the server SHOULD use
the highest previously-received voucher.

Note: CloseRequest is an off-chain signal only. The contract's
`requestClose()` function does not verify this signature; it is called
directly by the payer when cooperative close fails.

# EIP-712 Voucher Format

Vouchers use EIP-712 typed data with cumulative semantics: each voucher
authorizes a cumulative total amount, not an incremental delta.

## Type Definitions

~~~
Voucher(bytes32 channelId, uint256 cumulativeAmount)
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

# EIP-712 CloseRequest Format

The CloseRequest type enables authenticated close intent with replay
protection via timestamp. Unlike vouchers, CloseRequest is an off-chain
signal only—the contract's `requestClose()` function does not verify
this signature.

## Type Definition

~~~
CloseRequest(bytes32 channelId, uint64 requestedAt)
~~~

| Field | Type | Description |
|-------|------|-------------|
| `channelId` | bytes32 | The channel to close |
| `requestedAt` | uint64 | Unix timestamp of the request (seconds since epoch) |

## Domain Parameters

CloseRequest uses the same domain parameters as Voucher (Section 6.2):

| Field | Value |
|-------|-------|
| `name` | `"Tempo Stream Channel"` |
| `version` | `"1"` |
| `chainId` | Tempo chain ID (e.g., 42431) |
| `verifyingContract` | `request.escrowContract` |

## Replay Protection

Servers SHOULD reject CloseRequest signatures where `requestedAt` is
more than 300 seconds (5 minutes) in the past relative to server time.
This prevents replay of old close requests while allowing reasonable
clock skew between client and server.

The escrow contract MUST expose a `CLOSE_REQUEST_TYPEHASH()` view
function returning the keccak256 hash of the type string for
implementer convenience.

# Verification Procedure

## Open Verification

On `action="open"`, servers MUST:

1. Verify `openTxHash` references a finalized transaction. On Tempo
   networks, finality is achieved within approximately 500ms. Servers
   SHOULD query the escrow contract state rather than relying solely
   on transaction receipt.
2. Query the escrow contract to verify channel state:
   - Channel exists with matching `channelId`
   - `channel.payee` matches server's address
   - `channel.token` matches `request.currency`
   - `channel.deposit >= request.amount`
   - `channel.settled == 0` (fresh channel)
3. Verify the initial voucher:
   - Recover signer from EIP-712 signature
   - Verify signature uses canonical low-s values (see Section 10.7)
   - Signer matches `channel.payer` or `channel.authorizedSigner`
   - `voucher.channelId` matches
   - `voucher.cumulativeAmount == 0` for initial voucher
4. Initialize server-side channel state

## Voucher Verification

On `action="voucher"`, servers MUST:

1. Verify voucher signature using EIP-712 recovery
2. Verify signature uses canonical low-s values (see Section 10.7)
3. Recover signer and MUST verify it matches expected signer from on-chain state
4. Verify monotonicity:
   - `cumulativeAmount > highestVoucherAmount`
   - `(cumulativeAmount - highestVoucherAmount) >= minVoucherDelta`
5. Verify `cumulativeAmount <= channel.deposit`
6. Persist voucher to durable storage before providing service
7. Update `highestVoucherAmount = cumulativeAmount`

Servers MUST derive the expected signer from on-chain channel state by
querying the escrow contract. The expected signer is `channel.authorizedSigner`
if non-zero, otherwise `channel.payer`. Servers MUST NOT trust signer
claims in HTTP payloads.

Servers MUST persist the highest voucher to durable storage before
providing the corresponding service. Failure to do so may result in
unrecoverable fund loss if the server crashes after service delivery.

## Idempotency

Servers MUST treat voucher submissions idempotently:

- Resubmitting a voucher with the same `cumulativeAmount` as the highest
  accepted MUST return 200 OK with the current `highestAmount`
- Submitting a voucher with lower `cumulativeAmount` than highest accepted
  MUST return 200 OK with the current `highestAmount` (not an error)
- Clients MAY safely retry voucher submissions after network failures

## Rejection and Error Responses

If verification fails, servers MUST return an appropriate HTTP status
code with a Problem Details {{RFC9457}} response body:

| Status | When |
|--------|------|
| 400 Bad Request | Malformed payload or missing fields |
| 402 Payment Required | Invalid signature or signer mismatch |
| 410 Gone | Channel finalized or not found |

For the `streamEndpoint` API, error responses use Problem Details format:

~~~json
{
  "type": "https://tempo.xyz/stream/errors/invalid-signature",
  "title": "Invalid Signature",
  "status": 402,
  "detail": "Voucher signature could not be verified",
  "channelId": "0x6d0f4fdf..."
}
~~~

Problem type URIs:

| Type URI | Description |
|----------|-------------|
| `https://tempo.xyz/stream/errors/invalid-signature` | Voucher or close request signature invalid |
| `https://tempo.xyz/stream/errors/signer-mismatch` | Signer is not authorized for this channel |
| `https://tempo.xyz/stream/errors/amount-exceeds-deposit` | Voucher amount exceeds channel deposit |
| `https://tempo.xyz/stream/errors/delta-too-small` | Amount increase below `minVoucherDelta` |
| `https://tempo.xyz/stream/errors/channel-not-found` | No channel with this ID exists |
| `https://tempo.xyz/stream/errors/channel-finalized` | Channel has been closed |

For errors on the Payment Auth protected resource (the initial request
carrying `Authorization: Payment`), servers MUST return 402 with a fresh
`WWW-Authenticate: Payment` challenge per {{I-D.httpauth-payment}}.

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
2. Server MUST call `close(channelId, cumulativeAmount, signature)` on-chain
3. Contract settles any delta and refunds remainder to payer
4. Server returns receipt with transaction hash

Servers MUST close the channel when clients request cooperative close.
The economic incentive aligns: servers claim earned funds immediately,
and clients receive their refund. Failure to close forces clients to
use the forced close path, which delays fund recovery.

## Forced Close

If the server does not respond to close requests:

1. Client calls `requestClose(channelId)` on-chain
2. Grace period begins (wall-clock time via `block.timestamp`). The
   grace period SHOULD be 15 minutes but MAY be >= 15 minutes.
3. Server can still `settle()` or `close()` during grace period
4. After grace period, client calls `withdraw(channelId)`
5. Client receives all remaining (unsettled) funds

Clients SHOULD wait at least 1 minute beyond the configured grace period
after `requestClose()` before calling `withdraw()` to account for block
time variance. For the default 15-minute grace period, this means waiting
at least 16 minutes.

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
extends the receipt with additional fields in the `methodDetails` object:

| Field | Type | Description |
|-------|------|-------------|
| `method` | string | `"tempo"` |
| `reference` | string | Transaction hash of settlement/close |
| `status` | string | `"success"` or `"failed"` |
| `timestamp` | string | {{RFC3339}} settlement time |
| `methodDetails.channelId` | string | The channel identifier |
| `methodDetails.settledAmount` | string | Total amount settled to payee |

**Example receipt:**

~~~json
{
  "method": "tempo",
  "reference": "0x1a2b3c4d5e6f7890abcdef1234567890abcdef1234567890abcdef1234567890",
  "status": "success",
  "timestamp": "2025-01-06T12:10:00Z",
  "methodDetails": {
    "channelId": "0x6d0f4fdf1f2f6a1f6c1b0fbd6a7d5c2c0a8d3d7b1f6a9c1b3e2d4a5b6c7d8e9f",
    "settledAmount": "250000"
  }
}
~~~

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

**Operational guidance:** Servers SHOULD settle and close channels that
have been inactive for extended periods (e.g., 30+ days) to reduce
storage requirements and operational liability. Servers MAY refuse to
accept vouchers for channels with no activity exceeding a configured
threshold.

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

## Signature Malleability {#signature-malleability}

ECDSA signatures are malleable: for any valid signature `(r, s)`, the
signature `(r, -s mod n)` is also valid for the same message. To prevent
signature substitution attacks, implementations MUST enforce canonical
signatures:

- Signatures MUST use "low-s" values where `s <= secp256k1_order / 2`
- The secp256k1 half-order is:
  `0x7FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF5D576E7357A4501DDFE92F46681B20A0`
- Servers MUST reject signatures with `s` values exceeding this threshold

Accepted signature formats:

- 65-byte `(r, s, v)` format where `v` is 27 or 28
- 64-byte EIP-2098 compact format

Implementations SHOULD use established libraries (e.g., OpenZeppelin ECDSA)
that enforce these requirements.

## Voucher Context and User Experience

The voucher message contains only `channelId` and `cumulativeAmount`. The
`channelId` is derived from channel parameters including payer, payee,
token, and deposit amount, cryptographically binding these values.

However, wallet signing interfaces may only display the raw `channelId`
bytes, making it difficult for users to verify payment details. Wallet
implementations are encouraged to:

- Decode `channelId` components when the derivation formula is known
- Display the payee address and token in human-readable form
- Show cumulative vs. incremental amounts clearly

## Session Attribution

Vouchers are bound to channels but not to specific HTTP sessions or API
requests. When a payee operates multiple services using the same channel,
voucher-to-service attribution is an implementation concern.

Servers MUST implement session-to-voucher mapping for:

- Dispute resolution
- Usage accounting
- Audit trails

The `streamEndpoint` MAY include a `sessionId` parameter for this purpose,
though it is not cryptographically bound to the voucher signature.

## Grace Period Rationale

The 15-minute forced close grace period balances competing concerns:

- **Payer protection**: Ensures timely fund recovery if the server becomes
  unresponsive
- **Payee protection**: Provides time to detect close requests and submit
  final settlements, even during network congestion or maintenance windows
- **Block time variance**: Allows margin for timestamp variations in
  on-chain enforcement

Implementations MAY use different grace periods in their escrow contracts,
but MUST clearly document the value and ensure clients are aware.

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
  realm="api.llm-service.com",
  method="tempo",
  intent="stream",
  expires="2025-01-06T12:05:00Z",
  request="eyJhbW91bnQiOiIxMDAwMDAwMCIsImN1cnJlbmN5IjoiMHgyMGMwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAxIiwicmVjaXBpZW50IjoiMHg3NDJkMzVDYzY2MzRDMDUzMjkyNWEzYjg0NEJjOWU3NTk1ZjhmRTAwIiwibWV0aG9kRGV0YWlscyI6eyJlc2Nyb3dDb250cmFjdCI6IjB4N2E2MzU3ZGIzMzczMWNmYjdiOWQ1NGFjYTc1MDUwN2YxM2EzZmVjMCIsInNhbHQiOiIweGFiY2RlZjEyMzQ1Njc4OTBhYmNkZWYxMjM0NTY3ODkwYWJjZGVmMTIzNDU2Nzg5MGFiY2RlZjEyMzQ1Njc4OTAiLCJzdHJlYW1FbmRwb2ludCI6Imh0dHBzOi8vYXBpLmxsbS1zZXJ2aWNlLmNvbS9wYXltZW50cy9zdHJlYW0iLCJtaW5Wb3VjaGVyRGVsdGEiOiIxMDAwIiwiY2hhaW5JZCI6NDI0MzF9fQ"
~~~

The `request` decodes to:

~~~json
{
  "amount": "10000000",
  "currency": "0x20c0000000000000000000000000000000000001",
  "recipient": "0x742d35Cc6634C0532925a3b844Bc9e7595f8fE00",
  "methodDetails": {
    "escrowContract": "0x7a6357db33731cfb7b9d54aca750507f13a3fec0",
    "salt": "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
    "streamEndpoint": "https://api.llm-service.com/payments/stream",
    "minVoucherDelta": "1000",
    "chainId": 42431
  }
}
~~~

Note: Challenge expiry is in the header `expires` auth-param, not in the
request JSON.

This requests a deposit of 10.00 alphaUSD (10000000 base units).

## Open Credential

~~~http
GET /api/stream HTTP/1.1
Host: api.llm-service.com
Authorization: Payment eyJjaGFsbGVuZ2UiOnsiaWQiOiJrTTl4UHFXdlQybkpySHNZNGFEZkViIn0sInBheWxvYWQiOnsiYWN0aW9uIjoib3BlbiIsImNoYW5uZWxJZCI6IjB4NmQwZjRmZGYxZjJmNmExZjZjMWIwZmJkNmE3ZDVjMmMwYThkM2Q3YjFmNmE5YzFiM2UyZDRhNWI2YzdkOGU5ZiIsIm9wZW5UeEhhc2giOiIweGFiY2QxMjM0NTY3ODkwYWJjZGVmMTIzNDU2Nzg5MGFiY2RlZjEyMzQ1Njc4OTBhYmNkZWYxMjM0NTY3ODkwYWIiLCJ2b3VjaGVyIjp7InBheWxvYWQiOnt9LCJzaWduYXR1cmUiOiIweDEyMzQ1Njc4OTBhYmNkZWYuLi4ifX0sInNvdXJjZSI6ImRpZDpwa2g6ZWlwMTU1OjQyNDMxOjB4MTIzNDU2Nzg5MGFiY2RlZjEyMzQ1Njc4OTBhYmNkZWYxMjM0NTY3OCJ9
~~~

## Voucher Submission

During streaming, clients POST updated vouchers to the `streamEndpoint`:

~~~http
POST /payments/stream HTTP/1.1
Host: api.llm-service.com
Content-Type: application/json

{
  "action": "voucher",
  "channelId": "0x6d0f4fdf1f2f6a1f6c1b0fbd6a7d5c2c0a8d3d7b1f6a9c1b3e2d4a5b6c7d8e9f",
  "voucher": {
    "channelId": "0x6d0f4fdf1f2f6a1f6c1b0fbd6a7d5c2c0a8d3d7b1f6a9c1b3e2d4a5b6c7d8e9f",
    "cumulativeAmount": "250000",
    "signature": "0x1234567890abcdef..."
  }
}
~~~

## Close Request

~~~http
POST /payments/stream HTTP/1.1
Host: api.llm-service.com
Content-Type: application/json

{
  "action": "close",
  "channelId": "0x6d0f4fdf1f2f6a1f6c1b0fbd6a7d5c2c0a8d3d7b1f6a9c1b3e2d4a5b6c7d8e9f",
  "voucher": {
    "channelId": "0x6d0f4fdf1f2f6a1f6c1b0fbd6a7d5c2c0a8d3d7b1f6a9c1b3e2d4a5b6c7d8e9f",
    "cumulativeAmount": "500000",
    "signature": "0xabcdef1234567890..."
  },
  "closeRequest": {
    "channelId": "0x6d0f4fdf1f2f6a1f6c1b0fbd6a7d5c2c0a8d3d7b1f6a9c1b3e2d4a5b6c7d8e9f",
    "requestedAt": "1736165100",
    "signature": "0x1234567890abcdef..."
  }
}
~~~

The `voucher` contains the final cumulative amount for on-chain settlement.
The optional `closeRequest` provides authenticated close intent with replay
protection via `requestedAt` timestamp.

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
        uint256 deposit;
        uint256 settled;
        uint64 expiresAt;
        uint64 closeRequestedAt;
        bool finalized;
    }

    function CLOSE_GRACE_PERIOD() external view returns (uint64);
    function VOUCHER_TYPEHASH() external view returns (bytes32);
    function CLOSE_REQUEST_TYPEHASH() external view returns (bytes32);

    function open(
        address payee,
        address token,
        uint256 deposit,
        bytes32 salt,
        address authorizedSigner,
        uint64 expiresAt
    ) external returns (bytes32 channelId);

    function settle(
        bytes32 channelId,
        uint256 cumulativeAmount,
        bytes calldata signature
    ) external;

    function settleBatch(
        bytes32[] calldata channelIds,
        uint256[] calldata cumulativeAmounts,
        bytes[] calldata signatures
    ) external;

    function topUp(
        bytes32 channelId,
        uint256 additionalDeposit
    ) external;

    function close(
        bytes32 channelId,
        uint256 cumulativeAmount,
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
        uint256 deposit,
        bytes32 salt,
        address authorizedSigner
    ) external view returns (bytes32);

    function getVoucherDigest(
        bytes32 channelId,
        uint256 cumulativeAmount
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

# Acknowledgements

The authors thank the Tempo community for their feedback on streaming
payment design.
