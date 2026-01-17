---
title: Tempo Streaming Payment Channels Extension
docName: draft-tempo-stream-extension-00
category: std
ipr: trust200902
submissionType: IETF
consensus: true

author:
  - fullname: Georgios Konstantopoulos
    email: georgios@tempo.xyz
    organization: Tempo Labs
---

## Abstract

This document extends the Tempo Payment Method [draft-tempo-payment-method]
with support for unidirectional streaming payment channels. It defines the
`stream` intent for incremental, voucher-based payments suitable for metered
services such as AI token streaming, where users pay only for resources
actually consumed.

## Status of This Memo

This Internet-Draft is submitted in full conformance with the provisions
of BCP 78 and BCP 79.

## Copyright Notice

Copyright (c) 2026 IETF Trust and the persons identified as the document
authors. All rights reserved.

## Table of Contents

1. [Introduction](#1-introduction)
2. [Requirements Language](#2-requirements-language)
3. [Terminology](#3-terminology)
4. [Intent: stream](#4-intent-stream)
5. [Stream Request Schema](#5-stream-request-schema)
6. [Stream Credential Schema](#6-stream-credential-schema)
7. [EIP-712 Voucher Format](#7-eip-712-voucher-format)
8. [Verification Procedure](#8-verification-procedure)
9. [Settlement Procedure](#9-settlement-procedure)
10. [Channel Lifecycle](#10-channel-lifecycle)
11. [Security Considerations](#11-security-considerations)
12. [IANA Considerations](#12-iana-considerations)
13. [References](#13-references)
14. [Appendix A: Examples](#appendix-a-examples)
15. [Acknowledgements](#acknowledgements)
16. [Authors' Addresses](#authors-addresses)

---

## 1. Introduction

The base Tempo Payment Method [draft-tempo-payment-method] supports one-time
charges, authorizations, and subscriptions. However, these intents require
the payment amount to be known upfront or bounded by a fixed authorization.

For metered services—particularly AI inference APIs where token consumption
is only known as the response streams—a different model is needed: one where
clients pay incrementally as they receive service, and servers can settle
periodically rather than per-request.

This extension defines the `stream` intent, which establishes a **unidirectional
streaming payment channel** using:

- **Access Keys** for delegated payment authority
- **Off-chain EIP-712 vouchers** for incremental payment authorization
- **Periodic on-chain settlement** for efficiency

### 1.1. Use Case: AI Token Streaming

Consider an AI API that charges per output token:

1. Client requests a streaming completion (SSE response)
2. Server returns 402 with a `stream` challenge
3. Client provisions an Access Key and signs an initial voucher
4. Server begins streaming tokens
5. As tokens stream, client sends updated vouchers (out-of-band)
6. Server settles periodically or at stream completion

The client pays exactly for tokens received, with no worst-case reservation.

### 1.2. Trust Model and Fund Commitment

Streaming payment channels use an **escrow-based model** with on-chain
fund locking:

1. **Funds are locked at channel open.** The user deposits TIP-20 tokens
   into a channel escrow contract. These funds are locked until settlement
   or expiry.

2. **Server can settle at any time.** Using a signed voucher from the user,
   the server can withdraw funds from the escrow (up to the voucher amount).

3. **Partial settlement is supported.** The server can settle multiple times,
   each time withdrawing the delta between the voucher amount and previously
   settled amount.

4. **User can withdraw after expiry.** If the server fails to settle before
   the channel expires, the user can withdraw all remaining (unspent) funds.

5. **Server bears the risk of not settling.** The only risk to the server is
   failing to settle before expiry; escrowed funds guarantee payment.

**Trust properties:**

- **User protection**: Funds can only be withdrawn by server with a valid
  signed voucher; after expiry, user reclaims unspent funds.
- **Server protection**: Escrowed funds guarantee payment for valid vouchers
  (no risk of user draining wallet).

```
Channel Lifecycle:
                                                             
  OPEN             STREAMING            SETTLE           EXPIRY
    │                  │                   │                │
    ▼                  ▼                   ▼                ▼
┌─────────┐      ┌───────────┐       ┌──────────┐     ┌──────────┐
│ Deposit │      │ Vouchers  │       │ Server   │     │ User     │
│ to      │─────▶│ signed    │──────▶│ withdraws│────▶│ withdraws│
│ escrow  │      │ (off-chain)│      │ delta    │     │ remainder│
└─────────┘      └───────────┘       └──────────┘     └──────────┘
     │                                    │
     └────────────────────────────────────┘
              Funds locked in escrow
              (guaranteed for server)
```

**Cumulative voucher semantics:**

Vouchers authorize a **cumulative total**, not incremental deltas:

- Voucher #1: `cumulativeAmount = 100` (authorizes 100 total)
- Voucher #2: `cumulativeAmount = 250` (authorizes 250 total)
- Voucher #3: `cumulativeAmount = 400` (authorizes 400 total)

When settling, the contract computes: `delta = cumulativeAmount - settled`

This allows the channel to remain usable after partial settlement—the user
continues signing vouchers with higher cumulative amounts up to the deposit.

### 1.3. Relationship to Base Specification

This document extends [draft-tempo-payment-method] with:

- A new `stream` intent (Section 4)
- Stream-specific request and credential schemas (Sections 5-6)
- EIP-712 voucher format (Section 7)
- Stream-specific verification and settlement procedures (Sections 8-9)

All other aspects of the Tempo Payment Method apply unchanged.

---

## 2. Requirements Language

The key words "MUST", "MUST NOT", "REQUIRED", "SHALL", "SHALL NOT",
"SHOULD", "SHOULD NOT", "RECOMMENDED", "NOT RECOMMENDED", "MAY", and
"OPTIONAL" in this document are to be interpreted as described in
BCP 14 [RFC2119] [RFC8174] when, and only when, they appear in all
capitals, as shown here.

---

## 3. Terminology

**Streaming Payment Channel**
: A unidirectional off-chain payment mechanism where the payer signs
  cumulative vouchers authorizing increasing payment amounts. The payee
  collects vouchers and settles on-chain periodically.

**Voucher**
: An EIP-712 signed message authorizing a cumulative payment amount for
  a specific channel. Vouchers are monotonically increasing in amount
  and nonce.

**Channel State**
: Server-side record of a channel including: channel ID, payer, asset,
  destination, highest accepted voucher (nonce, amount), cumulative
  settled amount, and expiry.

**Settlement**
: The on-chain TIP-20 transfer that converts off-chain voucher
  authorizations into actual token movement.

---

## 4. Channel Escrow Contract

Streaming payment channels require an on-chain escrow contract that holds
user deposits and enforces voucher-based withdrawals.

### 4.1. Contract State

Each channel is identified by a unique `channelId` and stores:

| Field | Type | Description |
|-------|------|-------------|
| `payer` | address | User who deposited funds |
| `payee` | address | Server authorized to withdraw |
| `token` | address | TIP-20 token address |
| `deposit` | uint128 | Total amount deposited (fixed at open) |
| `settled` | uint128 | Cumulative amount already withdrawn by payee |
| `expiry` | uint64 | UNIX timestamp after which user can withdraw |
| `closeRequested` | uint64 | Timestamp when user requested early close (0 if not requested) |

The `channelId` MUST be computed deterministically:

```
channelId = keccak256(abi.encode(
    payer,
    payee,
    token,
    deposit,
    expiry,
    salt,
    contractAddress,
    chainId
))
```

### 4.2. Contract Functions

#### 4.2.1. open

Opens a new channel with escrowed funds.

```solidity
function open(
    address payee,
    address token,
    uint128 deposit,
    uint64 expiry,
    bytes32 salt
) external returns (bytes32 channelId);
```

Behavior:
1. Compute `channelId` from parameters
2. Verify channel does not already exist
3. Transfer `deposit` tokens from `msg.sender` to contract
4. Store channel state with `settled = 0`
5. Emit `ChannelOpened` event

#### 4.2.2. settle

Server withdraws funds using a signed voucher.

```solidity
function settle(
    bytes32 channelId,
    uint128 cumulativeAmount,
    uint64 validUntil,
    bytes calldata payerSignature
) external;
```

Behavior:
1. Verify `block.timestamp < channel.expiry`
2. Verify `block.timestamp <= validUntil`
3. Verify `cumulativeAmount <= channel.deposit`
4. Verify `cumulativeAmount > channel.settled`
5. Verify EIP-712 signature from `channel.payer`
6. Compute `delta = cumulativeAmount - channel.settled`
7. Update `channel.settled = cumulativeAmount`
8. Transfer `delta` tokens to `channel.payee`
9. Emit `Settled` event

The channel remains usable after settlement—the user can sign new vouchers
with higher `cumulativeAmount` up to `deposit`.

#### 4.2.3. requestClose

User requests early channel closure.

```solidity
function requestClose(bytes32 channelId) external;
```

Behavior:
1. Verify `msg.sender == channel.payer`
2. Set `channel.closeRequested = block.timestamp + CLOSE_GRACE_PERIOD`
3. Emit `CloseRequested` event

The server SHOULD monitor for this event and settle before the grace period
ends if it has outstanding vouchers.

#### 4.2.4. topUp

User adds more funds and/or extends expiry.

```solidity
function topUp(
    bytes32 channelId,
    uint128 additionalDeposit,
    uint64 newExpiry
) external;
```

Behavior:
1. Verify `msg.sender == channel.payer`
2. Verify channel is not finalized
3. If `additionalDeposit > 0`:
   - Transfer `additionalDeposit` tokens from payer to contract
   - Add to `channel.deposit`
4. If `newExpiry > channel.expiry`:
   - Update `channel.expiry = newExpiry`
5. Emit `TopUp` event

**Rationale for expiry extension:**

The server can settle at any time before expiry—they bear no risk from a longer
expiry. Expiry only protects the user's right to withdraw unspent funds if the
server disappears. Extending expiry is purely the user's choice to wait longer
for their potential refund.

#### 4.2.5. withdraw

User withdraws remaining funds after expiry or close grace period.

```solidity
function withdraw(bytes32 channelId) external;
```

Behavior:
1. Verify `msg.sender == channel.payer`
2. Verify `block.timestamp >= channel.expiry` OR
   `(channel.closeRequested != 0 && block.timestamp >= channel.closeRequested)`
3. Compute `refund = channel.deposit - channel.settled`
4. Transfer `refund` tokens to `channel.payer`
5. Mark channel as finalized (prevent double-withdraw)
6. Emit `Withdrawn` event

### 4.3. EIP-712 Domain

The contract uses EIP-712 typed data for voucher signatures:

```json
{
  "name": "Tempo Stream Channel",
  "version": "1",
  "chainId": <chain_id>,
  "verifyingContract": "<escrow_contract_address>"
}
```

### 4.4. Events

```solidity
event ChannelOpened(
    bytes32 indexed channelId,
    address indexed payer,
    address indexed payee,
    address token,
    uint256 deposit,
    uint256 expiry
);

event Settled(
    bytes32 indexed channelId,
    uint256 cumulativeAmount,
    uint256 deltaPaid,
    uint256 newSettled
);

event CloseRequested(
    bytes32 indexed channelId,
    uint256 closeGraceEnd
);

event TopUp(
    bytes32 indexed channelId,
    uint256 additionalDeposit,
    uint256 newDeposit,
    uint256 newExpiry
);

event Withdrawn(
    bytes32 indexed channelId,
    uint256 refunded
);
```

---

## 5. Intent: stream

The `stream` intent establishes a unidirectional streaming payment channel
with on-chain escrow, suitable for incremental payments during metered
service delivery.

**Characteristics:**

- Payer deposits funds into escrow contract at channel open
- Payer can top up deposit and/or extend expiry at any time
- Payer signs cumulative EIP-712 vouchers authorizing withdrawals
- Server can settle (withdraw) at any time using valid vouchers
- Partial settlement is supported; channel remains usable
- After expiry, payer can withdraw unspent funds

**Fulfillment mechanism:**

- **Escrow + EIP-712 vouchers**: The payer deposits TIP-20 tokens into the
  escrow contract, then signs a sequence of vouchers with monotonically
  increasing cumulative amounts as service is consumed. The server settles
  by submitting vouchers to the escrow contract.

---

## 5. Stream Request Schema

For `intent="stream"`, the `request` parameter contains:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `escrowContract` | string | REQUIRED | Address of the channel escrow contract |
| `asset` | string | REQUIRED | TIP-20 token address |
| `destination` | string | REQUIRED | Payee address (server's address for withdrawals) |
| `deposit` | string | REQUIRED | Required deposit amount in base units |
| `expires` | string | REQUIRED | Channel expiry (ISO 8601) |
| `channelId` | string | CONDITIONAL | Channel ID if channel already exists |
| `salt` | string | CONDITIONAL | Random salt for new channel; server-generated |
| `voucherEndpoint` | string | REQUIRED | HTTPS URL for voucher submission |
| `minVoucherDelta` | string | OPTIONAL | Minimum amount increase between vouchers (default: `"1"`) |

**Channel ID vs Salt:**

- For **new channels**: Server provides `salt`; client computes `channelId`
  per Section 4.1, opens channel on-chain, then proceeds.
- For **existing channels**: Server provides `channelId`; client verifies
  the channel exists and has sufficient remaining deposit.

Either `channelId` or `salt` MUST be provided, but not both.

**Example (new channel):**

```json
{
  "escrowContract": "0x1234567890abcdef1234567890abcdef12345678",
  "asset": "0x20c0000000000000000000000000000000000001",
  "destination": "0x742d35Cc6634C0532925a3b844Bc9e7595f8fE00",
  "deposit": "10000000",
  "expires": "2026-01-15T12:00:00Z",
  "salt": "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
  "voucherEndpoint": "https://api.example.com/payments/voucher",
  "minVoucherDelta": "1000"
}
```

**Example (existing channel):**

```json
{
  "escrowContract": "0x1234567890abcdef1234567890abcdef12345678",
  "asset": "0x20c0000000000000000000000000000000000001",
  "destination": "0x742d35Cc6634C0532925a3b844Bc9e7595f8fE00",
  "deposit": "10000000",
  "expires": "2026-01-15T12:00:00Z",
  "channelId": "0x6d0f4fdf1f2f6a1f6c1b0fbd6a7d5c2c0a8d3d7b1f6a9c1b3e2d4a5b6c7d8e9f",
  "voucherEndpoint": "https://api.example.com/payments/voucher",
  "minVoucherDelta": "1000"
}
```

---

## 6. Stream Credential Schema

Stream credentials use `type="stream"` with an `action` field:

| Action | Description |
|--------|-------------|
| `open` | Confirms channel is open on-chain; begins streaming |
| `voucher` | Submits an updated voucher during streaming |
| `close` | Final voucher; requests server to settle and close |

### 6.1. Credential Envelope

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `type` | string | REQUIRED | MUST be `"stream"` |
| `action` | string | REQUIRED | `"open"`, `"voucher"`, or `"close"` |
| `channelId` | string | REQUIRED | Channel ID (computed or from request) |
| `openTxHash` | string | REQUIRED for `open` | Transaction hash of channel open |
| `voucher` | object | REQUIRED | Signed EIP-712 voucher |

For `action="open"`, the client MUST:

1. Compute `channelId` from request parameters (if `salt` provided)
2. Call `escrowContract.open(...)` on-chain
3. Wait for transaction confirmation
4. Include `openTxHash` in the credential

The server verifies the channel exists on-chain before streaming.

**Example (open):**

```json
{
  "id": "challenge-id-from-server",
  "source": "did:pkh:eip155:42431:0x1234...5678",
  "payload": {
    "type": "stream",
    "action": "open",
    "channelId": "0x6d0f4fdf1f2f6a1f6c1b0fbd6a7d5c2c0a8d3d7b1f6a9c1b3e2d4a5b6c7d8e9f",
    "openTxHash": "0xabcd1234...",
    "voucher": {
      "payload": { /* EIP-712 typed data */ },
      "signature": "0x..."
    }
  }
}
```

**Example (voucher):**

```json
{
  "id": "challenge-id-from-server",
  "payload": {
    "type": "stream",
    "action": "voucher",
    "channelId": "0x6d0f4fdf1f2f6a1f6c1b0fbd6a7d5c2c0a8d3d7b1f6a9c1b3e2d4a5b6c7d8e9f",
    "voucher": {
      "payload": { /* EIP-712 typed data with higher cumulativeAmount */ },
      "signature": "0x..."
    }
  }
}
```

---

## 7. EIP-712 Voucher Format

Vouchers use EIP-712 typed data with cumulative semantics: each voucher
authorizes a **cumulative total** amount for the channel, not an incremental
delta.

### 7.1. Type Definitions

```json
{
  "EIP712Domain": [
    { "name": "name", "type": "string" },
    { "name": "version", "type": "string" },
    { "name": "chainId", "type": "uint256" },
    { "name": "verifyingContract", "type": "address" }
  ],
  "Voucher": [
    { "name": "channelId", "type": "bytes32" },
    { "name": "cumulativeAmount", "type": "uint128" },
    { "name": "validUntil", "type": "uint64" }
  ]
}
```

Note: The voucher does not include `asset` or `destination` because these
are fixed per channel and verified against on-chain channel state.

### 7.2. Domain Parameters

| Field | Value |
|-------|-------|
| `name` | `"Tempo Stream Channel"` |
| `version` | `"1"` |
| `chainId` | Tempo chain ID (e.g., 42431 for Moderato) |
| `verifyingContract` | `request.escrowContract` |

Using the escrow contract as `verifyingContract` binds vouchers to the
specific contract instance and chain.

### 7.3. Message Fields

| Field | Type | Constraints |
|-------|------|-------------|
| `channelId` | bytes32 | MUST match the channel ID |
| `cumulativeAmount` | uint128 | Total authorized; MUST be `<=` deposit; MUST be strictly increasing |
| `validUntil` | uint64 | UNIX timestamp; MUST be `<=` channel expiry |

### 7.4. Example Voucher

```json
{
  "primaryType": "Voucher",
  "domain": {
    "name": "Tempo Stream Channel",
    "version": "1",
    "chainId": 42431,
    "verifyingContract": "0x1234567890abcdef1234567890abcdef12345678"
  },
  "types": {
    "EIP712Domain": [...],
    "Voucher": [...]
  },
  "message": {
    "channelId": "0x6d0f4fdf1f2f6a1f6c1b0fbd6a7d5c2c0a8d3d7b1f6a9c1b3e2d4a5b6c7d8e9f",
    "cumulativeAmount": "250000",
    "validUntil": 1770000000
  }
}
```

---

## 8. Verification Procedure

### 8.1. Open Verification

On `action="open"`, servers MUST:

1. Verify `openTxHash` references a confirmed transaction
2. Query the escrow contract to verify channel state:
   - Channel exists with matching `channelId`
   - `channel.payee` matches server's address (`request.destination`)
   - `channel.token` matches `request.asset`
   - `channel.deposit >= request.deposit`
   - `channel.expiry` matches expected expiry
   - `channel.settled == 0` (fresh channel)
3. Verify the initial voucher:
   - Recover signer from EIP-712 signature
   - Signer matches `channel.payer` from on-chain state
   - `voucher.channelId` matches
   - `voucher.cumulativeAmount == 0` for initial voucher
   - `voucher.validUntil <= channel.expiry`
4. Initialize server-side channel state:
   - Record `channelId`, `payer`, `deposit`
   - Set `highestVoucherAmount = 0`

### 8.2. Voucher Verification

On `action="voucher"` or `action="close"`, servers MUST:

1. Verify voucher signature
2. Recover signer and verify it matches `channel.payer`
3. Verify monotonicity:
   - `cumulativeAmount > highestVoucherAmount`
   - `(cumulativeAmount - highestVoucherAmount) >= minVoucherDelta`
4. Verify `cumulativeAmount <= channel.deposit`
5. Verify `validUntil` has not passed
6. Update `highestVoucherAmount = cumulativeAmount`

### 8.3. Rejection

If verification fails, servers MUST:

- Return 401 with error details, OR
- Return 402 with a fresh `stream` challenge if channel is unusable

---

## 9. Settlement Procedure

### 9.1. Settlement Timing

Servers MAY settle at any time before channel expiry:

- Periodically (e.g., every N seconds or M base units accrued)
- When `action="close"` is received
- When approaching channel expiry
- When the accumulated unsettled amount exceeds a threshold

Servers MUST settle before channel expiry to claim funds. After expiry,
the user can withdraw all remaining funds.

### 9.2. Settlement Transaction

To settle, the server calls `escrowContract.settle(...)` with:

- `channelId`: The channel identifier
- `cumulativeAmount`: From the highest accepted voucher
- `validUntil`: From the voucher
- `payerSignature`: The EIP-712 signature from the voucher

The contract computes `delta = cumulativeAmount - channel.settled` and
transfers `delta` tokens to the server (payee).

### 9.3. Partial Settlement

After partial settlement:

- The channel remains open with `channel.settled` updated
- The user continues signing vouchers with higher `cumulativeAmount`
- The server can settle again with newer vouchers

Example:
1. User deposits 1,000,000 (1.00 USD)
2. User signs voucher for 250,000
3. Server settles → receives 250,000; `channel.settled = 250,000`
4. User signs voucher for 500,000
5. Server settles → receives 250,000 (delta); `channel.settled = 500,000`
6. Channel expires with 500,000 remaining
7. User withdraws 500,000

### 9.4. Settlement Receipt

```json
{
  "method": "tempo",
  "status": "success",
  "reference": "0x1234567890abcdef...",
  "timestamp": "2026-01-15T10:30:00Z",
  "amount": "250000",
  "channelId": "0x6d0f4fdf..."
}
```

---

## 10. Channel Lifecycle

```
                    ┌─────────────────────────────────────┐
                    │                                     │
    ┌───────┐   open    ┌──────────┐   voucher   ┌──────────┐   close   ┌────────┐
    │ IDLE  │ ────────> │ OPEN     │ ──────────> │ ACTIVE   │ ────────> │ CLOSED │
    └───────┘           └──────────┘             └──────────┘           └────────┘
                              │                       │                      │
                              │                       │                      │
                              └───────────────────────┴──────────────────────┘
                                              │
                                          settle (periodic)
                                              │
                                              v
                                        ┌───────────┐
                                        │ ON-CHAIN  │
                                        │ TRANSFER  │
                                        └───────────┘
```

**States:**

- **IDLE**: No channel exists
- **OPEN**: Channel opened, initial voucher accepted
- **ACTIVE**: Streaming in progress, receiving vouchers
- **CLOSED**: Final voucher received, awaiting final settlement

**Transitions:**

- `open` → OPEN (or ACTIVE if service begins immediately)
- `voucher` → ACTIVE (updates highest voucher)
- `close` → CLOSED
- `settle` → Updates `settledAmount` (can occur in any active state)
- `expire` → CLOSED (if expiry reached without explicit close)

---

## 11. Security Considerations

### 11.1. Replay Prevention

Vouchers are bound to a specific channel and contract via:

- `channelId` in the voucher message
- `verifyingContract` = escrow contract address in EIP-712 domain
- `chainId` in EIP-712 domain
- Cumulative amount semantics (can only increase)

The escrow contract enforces:

- `cumulativeAmount > channel.settled` (monotonicity)
- `cumulativeAmount <= channel.deposit` (cap)

Servers SHOULD also track `highestVoucherAmount` off-chain to reject
stale vouchers before attempting on-chain settlement.

### 11.2. Voucher Expiry

The `validUntil` field limits voucher validity. The escrow contract MUST
reject vouchers where `block.timestamp > validUntil`.

Clients SHOULD use short `validUntil` windows during active streaming to
limit exposure if a voucher is intercepted.

### 11.3. Denial of Service

To mitigate voucher flooding:

- Enforce `minVoucherDelta` to prevent tiny increments
- Rate-limit voucher submissions per channel
- Reject vouchers that don't advance state

### 11.4. Settlement Integrity

The escrow contract guarantees settlement integrity:

- Only the payee (server) can call `settle()`
- Settlement is only valid before channel expiry
- Delta is computed on-chain from `cumulativeAmount - settled`
- Double-settlement is impossible due to cumulative semantics

### 11.5. Escrow Contract Security

The escrow contract MUST:

- Use `nonReentrant` guards on state-changing functions
- Validate all signatures using strict ECDSA recovery
- Prevent signature malleability attacks
- Handle TIP-20 transfer failures gracefully

### 11.6. Service Delivery

Vouchers authorize payment but do not guarantee service delivery.
Clients SHOULD stop sending vouchers if service quality degrades. Servers
SHOULD stop delivering service if vouchers are not received.

### 11.7. Server Risk (Expiry)

The server's only risk is failing to settle before channel expiry:

- After expiry, the user can withdraw all remaining funds
- Servers MUST monitor channel expiry and settle in time
- Servers SHOULD set alerts for approaching expiry

### 11.8. User Protections

Users are protected by the escrow model:

- **Deposit cap**: Maximum loss is limited to the deposit amount
- **Expiry protection**: After expiry, user reclaims all unspent funds
- **Voucher control**: Only funds authorized by signed vouchers can be withdrawn
- **Early close**: User can request early close via `requestClose()`
- **Transparency**: All settlements are on-chain and auditable

Users SHOULD use dedicated wallet addresses or signing keys per channel
to limit exposure.

---

## 12. IANA Considerations

This document registers the following payment intent:

**Intent:** `stream`
**Method:** `tempo`
**Reference:** This document

---

## 13. References

### 13.1. Normative References

- [RFC2119] Bradner, S., "Key words for use in RFCs to Indicate Requirement
  Levels", BCP 14, RFC 2119, March 1997.
- [RFC8174] Leiba, B., "Ambiguity of Uppercase vs Lowercase in RFC 2119 Key
  Words", BCP 14, RFC 8174, May 2017.
- [I-D.ietf-httpauth-payment] "Payment HTTP Authentication Scheme"
- [draft-tempo-payment-method] "Tempo Payment Method for HTTP Payment
  Authentication"
- [EIP-712] "Ethereum typed structured data hashing and signing"

### 13.2. Informative References

- [SSE] "Server-Sent Events", W3C Recommendation

---

## Appendix A: Examples

### A.1. AI Token Streaming Flow

```
Client                                 Server                    Tempo
  │                                      │                         │
  │ (1) POST /v1/chat/completions        │                         │
  │     Accept: text/event-stream        │                         │
  ├─────────────────────────────────────>│                         │
  │                                      │                         │
  │ (2) 402 Payment Required             │                         │
  │     WWW-Authenticate: Payment        │                         │
  │       method="tempo"                 │                         │
  │       intent="stream"                │                         │
  │       request=<base64url>            │                         │
  │<─────────────────────────────────────┤                         │
  │                                      │                         │
  │ (3) Provision Access Key             │                         │
  │     Sign initial voucher (amount=0)  │                         │
  │                                      │                         │
  │ (4) POST /v1/chat/completions        │                         │
  │     Authorization: Payment           │                         │
  │       <stream/open credential>       │                         │
  ├─────────────────────────────────────>│                         │
  │                                      │ (5) Verify & open       │
  │ (6) 200 OK                           │     channel             │
  │     Content-Type: text/event-stream  │                         │
  │<─────────────────────────────────────┤                         │
  │                                      │                         │
  │ (7) SSE: data: {"content": "Hello"}  │                         │
  │<─────────────────────────────────────┤                         │
  │                                      │                         │
  │ (8) POST /payments/voucher           │                         │
  │     Authorization: Payment           │                         │
  │       <voucher amount=12000>         │                         │
  ├─────────────────────────────────────>│                         │
  │                                      │                         │
  │ (9) SSE: data: {"content": " world"} │                         │
  │<─────────────────────────────────────┤                         │
  │                                      │                         │
  │ (10) POST /payments/voucher          │                         │
  │      <voucher amount=24000>          │                         │
  ├─────────────────────────────────────>│                         │
  │                                      │                         │
  │ (11) SSE: data: [DONE]               │                         │
  │<─────────────────────────────────────┤                         │
  │                                      │                         │
  │ (12) POST /payments/voucher          │                         │
  │      action="close"                  │                         │
  │      <voucher amount=36000>          │                         │
  ├─────────────────────────────────────>│                         │
  │                                      │ (13) Settle             │
  │                                      ├────────────────────────>│
  │                                      │ (14) Transfer complete  │
  │                                      │<────────────────────────┤
  │ (15) 200 OK                          │                         │
  │      Payment-Receipt: <receipt>      │                         │
  │<─────────────────────────────────────┤                         │
```

### A.2. Challenge

```http
HTTP/1.1 402 Payment Required
WWW-Authenticate: Payment id="str_kM9xPqWvT2nJrHsY4aDfEb",
  realm="api.ai-service.com",
  method="tempo",
  intent="stream",
  request="eyJhc3NldCI6IjB4MjBjMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMSIsImRlc3RpbmF0aW9uIjoiMHg3NDJkMzVDYzY2MzRDMDUzMjkyNWEzYjg0NEJjOWU3NTk1ZjhmRTAwIiwibWF4QW1vdW50IjoiMTAwMDAwMDAiLCJleHBpcmVzIjoiMjAyNi0wMS0xNVQxMjowMDowMFoiLCJjaGFubmVsSWQiOiIweDZkMGY0ZmRmMWYyZjZhMWY2YzFiMGZiZDZhN2Q1YzJjMGE4ZDNkN2IxZjZhOWMxYjNlMmQ0YTViNmM3ZDhlOWYiLCJ2b3VjaGVyRW5kcG9pbnQiOiJodHRwczovL2FwaS5haS1zZXJ2aWNlLmNvbS9wYXltZW50cy92b3VjaGVyIiwibWluVm91Y2hlckRlbHRhIjoiMTAwMCIsImZlZVBheWVyIjp0cnVlfQ"
```

Decoded request:

```json
{
  "asset": "0x20c0000000000000000000000000000000000001",
  "destination": "0x742d35Cc6634C0532925a3b844Bc9e7595f8fE00",
  "maxAmount": "10000000",
  "expires": "2026-01-15T12:00:00Z",
  "channelId": "0x6d0f4fdf1f2f6a1f6c1b0fbd6a7d5c2c0a8d3d7b1f6a9c1b3e2d4a5b6c7d8e9f",
  "voucherEndpoint": "https://api.ai-service.com/payments/voucher",
  "minVoucherDelta": "1000",
  "feePayer": true
}
```

### A.3. Open Credential

```json
{
  "id": "str_kM9xPqWvT2nJrHsY4aDfEb",
  "source": "did:pkh:eip155:42431:0x1234567890abcdef1234567890abcdef12345678",
  "payload": {
    "type": "stream",
    "action": "open",
    "channelId": "0x6d0f4fdf1f2f6a1f6c1b0fbd6a7d5c2c0a8d3d7b1f6a9c1b3e2d4a5b6c7d8e9f",
    "keyAuthorization": {
      "type": "keyAuthorization",
      "signature": "0xf8b2..."
    },
    "voucher": {
      "payload": {
        "primaryType": "TempoStreamVoucher",
        "domain": {
          "name": "Tempo Stream Voucher",
          "version": "1",
          "chainId": 42431,
          "verifyingContract": "0x742d35Cc6634C0532925a3b844Bc9e7595f8fE00"
        },
        "types": {
          "EIP712Domain": [...],
          "TempoStreamVoucher": [...]
        },
        "message": {
          "channelId": "0x6d0f4fdf1f2f6a1f6c1b0fbd6a7d5c2c0a8d3d7b1f6a9c1b3e2d4a5b6c7d8e9f",
          "asset": "0x20c0000000000000000000000000000000000001",
          "destination": "0x742d35Cc6634C0532925a3b844Bc9e7595f8fE00",
          "amount": "0",
          "nonce": 0,
          "validBefore": 1770000000
        }
      },
      "signature": "0x..."
    }
  }
}
```

---

## Acknowledgements

The authors thank the Tempo community for their feedback on streaming
payment design.

---

## Authors' Addresses

Georgios Konstantopoulos
Tempo Labs
Email: georgios@tempo.xyz
