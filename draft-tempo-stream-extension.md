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

Streaming payment channels use a **pull-based metering model** where:

1. **No funds are locked at channel open.** The Access Key grants authorization
   to transfer, but does not escrow or reserve funds on-chain.

2. **Funds are committed only at settlement.** When the server submits an
   on-chain transfer using the Access Key, funds move from the payer's wallet.

3. **Server bears counterparty risk between settlements.** The user could
   drain their wallet after streaming begins but before settlement.

**Risk mitigation:**

- **Frequent settlement**: Servers SHOULD settle often (e.g., every $0.10-$1.00
  or every N tokens) to minimize exposure.
- **Maximum unsettled cap**: Servers SHOULD stop streaming if accrued-unsettled
  amount exceeds a threshold until settlement succeeds.
- **Balance verification**: Servers MAY check user balance at open and
  periodically, but this is not a guarantee.

This model avoids worst-case reservation while keeping server risk bounded
to the maximum unsettled amount between settlements.

```
Trust Timeline:
                                                             
  OPEN          STREAMING           SETTLE         STREAMING
    │               │                  │               │
    ▼               ▼                  ▼               ▼
┌───────┐     ┌───────────┐      ┌──────────┐    ┌──────────┐
│Access │     │ Vouchers  │      │ On-chain │    │ Vouchers │
│Key    │────▶│ accrue    │─────▶│ transfer │───▶│ accrue   │──▶ ...
│given  │     │ (no lock) │      │ (commit) │    │ (no lock)│
└───────┘     └───────────┘      └──────────┘    └──────────┘
                  │                   │
                  └───────────────────┘
                   Server risk window
                   (keep small via
                    frequent settlement)
```

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

## 4. Intent: stream

The `stream` intent establishes a unidirectional streaming payment channel
suitable for incremental payments during metered service delivery.

**Characteristics:**

- Payer signs cumulative vouchers using an Access Key
- Vouchers authorize total amounts, not deltas
- Server collects vouchers off-chain
- Settlement occurs periodically, not per-voucher
- Channel has a maximum amount and expiry

**Fulfillment mechanism:**

- **Access Key + EIP-712 vouchers**: The payer provisions an Access Key
  scoped to the channel parameters, then signs a sequence of vouchers
  with monotonically increasing amounts as service is consumed.

---

## 5. Stream Request Schema

For `intent="stream"`, the `request` parameter contains:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `asset` | string | REQUIRED | TIP-20 token address |
| `destination` | string | REQUIRED | Payee address for settlement |
| `maxAmount` | string | REQUIRED | Maximum cumulative amount (base units) |
| `expires` | string | REQUIRED | Channel expiry (ISO 8601) |
| `channelId` | string | REQUIRED | Unique channel ID (0x-prefixed 32-byte hex) |
| `voucherEndpoint` | string | REQUIRED | HTTPS URL for voucher submission |
| `minVoucherDelta` | string | OPTIONAL | Minimum amount increase between vouchers (default: `"1"`) |
| `maxUnsettled` | string | OPTIONAL | Maximum unsettled amount before server pauses streaming (base units). Server's risk tolerance. |
| `settlementInterval` | string | OPTIONAL | Suggested settlement frequency in seconds (informational) |
| `feePayer` | boolean | OPTIONAL | Server pays settlement fees (default: `false`) |

Servers MUST generate cryptographically random `channelId` values (at least
128 bits of entropy) and MUST NOT reuse channel IDs.

**Example:**

```json
{
  "asset": "0x20c0000000000000000000000000000000000001",
  "destination": "0x742d35Cc6634C0532925a3b844Bc9e7595f8fE00",
  "maxAmount": "10000000",
  "expires": "2026-01-15T12:00:00Z",
  "channelId": "0x6d0f4fdf1f2f6a1f6c1b0fbd6a7d5c2c0a8d3d7b1f6a9c1b3e2d4a5b6c7d8e9f",
  "voucherEndpoint": "https://api.example.com/payments/voucher",
  "minVoucherDelta": "1000",
  "maxUnsettled": "100000",
  "settlementInterval": "30",
  "feePayer": true
}
```

---

## 6. Stream Credential Schema

Stream credentials use `type="stream"` with an `action` field:

| Action | Description |
|--------|-------------|
| `open` | Opens the channel (first request) |
| `voucher` | Submits an updated voucher during streaming |
| `close` | Final voucher, indicating stream completion |

### 6.1. Credential Envelope

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `type` | string | REQUIRED | MUST be `"stream"` |
| `action` | string | REQUIRED | `"open"`, `"voucher"`, or `"close"` |
| `channelId` | string | REQUIRED | Channel ID from request |
| `keyAuthorization` | object | REQUIRED for `open` | Access Key authorization |
| `voucher` | object | REQUIRED | Signed EIP-712 voucher |

**Example (open):**

```json
{
  "id": "challenge-id-from-server",
  "source": "did:pkh:eip155:42431:0x1234...5678",
  "payload": {
    "type": "stream",
    "action": "open",
    "channelId": "0x6d0f4fdf...",
    "keyAuthorization": {
      "signature": "0xf8b2...",
      "type": "keyAuthorization"
    },
    "voucher": {
      "payload": { /* EIP-712 typed data */ },
      "signature": "0x..."
    }
  }
}
```

---

## 7. EIP-712 Voucher Format

Vouchers use EIP-712 typed data with cumulative semantics: each voucher
authorizes a **total** amount for the channel, not an incremental delta.

### 7.1. Type Definitions

```json
{
  "EIP712Domain": [
    { "name": "name", "type": "string" },
    { "name": "version", "type": "string" },
    { "name": "chainId", "type": "uint256" },
    { "name": "verifyingContract", "type": "address" }
  ],
  "TempoStreamVoucher": [
    { "name": "channelId", "type": "bytes32" },
    { "name": "asset", "type": "address" },
    { "name": "destination", "type": "address" },
    { "name": "amount", "type": "uint256" },
    { "name": "nonce", "type": "uint64" },
    { "name": "validBefore", "type": "uint64" }
  ]
}
```

### 7.2. Domain Parameters

| Field | Value |
|-------|-------|
| `name` | `"Tempo Stream Voucher"` |
| `version` | `"1"` |
| `chainId` | Tempo chain ID (e.g., 42431 for Moderato) |
| `verifyingContract` | `request.destination` (payee address) |

Using `destination` as `verifyingContract` binds vouchers to the specific
payee, preventing voucher redirection attacks.

### 7.3. Message Fields

| Field | Type | Constraints |
|-------|------|-------------|
| `channelId` | bytes32 | MUST equal `request.channelId` |
| `asset` | address | MUST equal `request.asset` |
| `destination` | address | MUST equal `request.destination` |
| `amount` | uint256 | MUST be `<=` `request.maxAmount`; MUST be strictly increasing |
| `nonce` | uint64 | MUST be strictly increasing per channel |
| `validBefore` | uint64 | UNIX timestamp; MUST be `<=` `request.expires` |

### 7.4. Example Voucher

```json
{
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
    "amount": "250000",
    "nonce": 5,
    "validBefore": 1770000000
  }
}
```

---

## 8. Verification Procedure

### 8.1. Open Verification

On `action="open"`, servers MUST:

1. Validate `channelId` matches the challenge
2. Verify `keyAuthorization`:
   - Valid Access Key signature
   - Key expiry `<=` `request.expires`
   - Spending limit `>=` `request.maxAmount` for `request.asset`
3. Verify the voucher:
   - Recover signer from EIP-712 signature
   - Signer corresponds to the Access Key
   - All message fields match request constraints
   - `nonce` SHOULD be 0 for the first voucher
4. Initialize channel state:
   - Store `(channelId, payer, asset, destination)`
   - Record highest accepted `(nonce, amount)`
   - Set `settledAmount = 0`

### 8.2. Voucher Verification

On `action="voucher"` or `action="close"`, servers MUST:

1. Verify voucher signature and message constraints
2. Verify monotonicity:
   - `nonce > lastAcceptedNonce`
   - `amount > lastAcceptedAmount`
   - `(amount - lastAcceptedAmount) >= minVoucherDelta`
3. Verify `amount <= maxAmount`
4. Update channel state with new highest voucher

### 8.3. Rejection

If verification fails, servers MUST:

- Return 401 with a fresh `stream` challenge, OR
- Return 402 if the channel cannot be continued

---

## 9. Settlement Procedure

### 9.1. Settlement Timing

Servers MAY settle:

- Periodically (e.g., every N seconds or M base units)
- At channel close (`action="close"`)
- At or shortly after channel expiry
- When the Access Key is near its spending limit

Servers SHOULD batch settlements to minimize on-chain costs.

### 9.2. Settlement Amount

```
delta = latestAcceptedAmount - settledAmount
```

If `delta <= 0`, no settlement is needed.

### 9.3. Transaction Construction

To settle `delta`, the server constructs a Tempo Transaction:

1. If Access Key is not yet registered on-chain, include `keyAuthorization`
2. Call `transfer(destination, delta)` on the TIP-20 asset
3. If `feePayer == true`, add fee payer signature (0x78 domain)
4. Submit via `eth_sendRawTransactionSync`

After successful inclusion:

- Update `settledAmount += delta`
- Return `Payment-Receipt` header with transaction hash

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

Vouchers are bound to a specific channel via:

- `channelId` in the message
- `destination` as `verifyingContract` in EIP-712 domain
- Strictly increasing `nonce` per channel

Servers MUST reject:

- Vouchers with non-matching `channelId`
- Vouchers with `nonce <= lastAcceptedNonce`
- Vouchers for unknown or expired channels

### 11.2. Voucher Expiry

The `validBefore` field limits voucher validity. Servers MUST reject
vouchers where `block.timestamp > validBefore`.

Clients SHOULD use short `validBefore` windows (seconds to minutes) during
active streaming to limit exposure from voucher interception.

### 11.3. Denial of Service

To mitigate voucher flooding:

- Enforce `minVoucherDelta` to prevent tiny increments
- Rate-limit voucher submissions per channel
- Reject vouchers that don't advance state

### 11.4. Settlement Integrity

Servers MUST:

- Store channel state durably (e.g., Durable Objects)
- Compute settlement `delta` against `settledAmount` to prevent double-charging
- Never settle more than the latest accepted voucher amount

### 11.5. Access Key Scope

Clients SHOULD provision a dedicated Access Key per channel with:

- Expiry matching channel expiry
- Spending limit matching `maxAmount`
- Destination restriction if supported

Shared Access Keys across channels may have their spending limits depleted
by concurrent usage.

### 11.6. Service Delivery

Streaming vouchers authorize payment but do not guarantee service delivery.
Clients SHOULD stop sending vouchers if service quality degrades. Servers
SHOULD stop delivering service if vouchers are not received in a timely manner.

### 11.7. Counterparty Risk (Server-Side)

Unlike escrow-based payment channels, streaming channels with Access Keys
do NOT lock funds at open. The server bears counterparty risk:

- User may drain their wallet after streaming begins
- Access Key may be revoked (if revocation is supported)
- Settlement may fail due to insufficient funds

**Mitigations:**

1. **Frequent settlement**: Settle every `settlementInterval` seconds or
   every `maxUnsettled` base units, whichever comes first
2. **Pause on failure**: If settlement fails, pause streaming until user
   tops up or provides a new Access Key
3. **Balance checks**: Optionally verify balance >= accrued amount before
   continuing to stream
4. **Reputation/history**: Track user payment history for risk scoring

Servers MUST define their risk tolerance via `maxUnsettled` and MUST NOT
stream beyond that threshold without successful settlement.

### 11.8. User Protections

Users are protected by:

- **Access Key limits**: The Access Key's spending limit caps total exposure
- **Access Key expiry**: Keys expire, limiting long-term authorization
- **Voucher transparency**: Users sign each voucher, maintaining awareness
- **No lock-up**: Funds remain in user's wallet until settlement

Users SHOULD provision dedicated Access Keys per channel with tight limits
matching expected usage.

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
