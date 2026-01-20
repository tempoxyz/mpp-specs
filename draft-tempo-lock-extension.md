---
title: Tempo Payment Lock Extension
docName: draft-tempo-lock-extension-00
category: std
ipr: trust200902
submissionType: IETF
consensus: true

author:
  - fullname: Jake Moxey
    email: jake@tempo.xyz
    organization: Tempo Labs
  - fullname: Georgios Konstantopoulos
    email: georgios@tempo.xyz
    organization: Tempo Labs
---

## Abstract

This document extends the Tempo Payment Method [draft-tempo-payment-method]
with support for escrowed payment locks. It defines the `lock` intent for
incremental payments suitable for streaming and metered services, where
clients deposit funds into an on-chain escrow that permits the payee to
withdraw funds up to the amount authorized by signed releases, while
permitting the payer to withdraw any remaining funds after expiry.

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
4. [Intent: lock](#4-intent-lock)
5. [Lock Request Schema](#5-lock-request-schema)
6. [Lock Credential Schema](#6-lock-credential-schema)
7. [EIP-712 Release Format](#7-eip-712-release-format)
8. [TIP20Escrow Interface](#8-tip20escrow-interface)
9. [Verification Procedure](#9-verification-procedure)
10. [Settlement Procedure](#10-settlement-procedure)
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

For metered services—where consumption is only known as the service is
delivered—a different model is required: one where clients deposit funds into
escrow, receive service, and authorize incremental releases as they consume.

This extension defines the `lock` intent, which establishes an **escrowed
payment lock** using:

- **TIP20Escrow interface** for on-chain fund escrow (implementable as a
  smart contract or chain-native precompile)
- **Off-chain EIP-712 releases** for incremental release authorization
- **Payee-controlled settlement** for efficient fund collection

### 1.1. Example Use Case: Metered Agent Execution

This section is non-normative.

Consider a user delegating tasks to an AI agent that consumes API tokens:

1. User initiates an agent task (e.g., a research task)
2. Agent's API returns 402 with a `lock` challenge
3. User creates a lock with a budget for the task
4. As tokens are consumed, the client sends EIP-712 releases authorizing payment
5. Server settles periodically or when the task completes

The user pays for tokens consumed, with unused budget reclaimable after lock
expiry. This enables users to delegate open-ended tasks to agents with bounded
spending.

### 1.2. Trust Model and Fund Commitment

In this document, the **server** acts as the **payee**, and the **client**
acts on behalf of the **payer**.

Payment locks use an **escrow-based model** with on-chain fund locking:

1. **Funds are locked at creation.** The payer deposits TIP-20 tokens into
   a TIP20Escrow implementation. These funds are locked until release or expiry.

2. **Payee can release at any time.** Using a signed release from the payer,
   the payee can withdraw funds from the escrow (up to the released amount).

3. **Partial release is supported.** The payee can release multiple times,
   each time withdrawing the delta between the release amount and previously
   released amount.

4. **Payer can withdraw after expiry.** If the payee fails to release before
   the lock expires, the payer can withdraw all remaining (unreleased) funds.

5. **Payee bears the risk of not settling.** The only risk to the payee is
   failing to release before expiry; escrowed funds are committed for payment.

**Trust properties:**

- **Payer protection**: Funds can only be released by payee with a valid
  signed release; after expiry, payer reclaims unreleased funds.
- **Payee protection**: Escrowed funds are committed for payment for valid
  releases (no risk of payer draining wallet).

```
Lock Lifecycle:
                                                             
  CREATE           SERVICE            RELEASE          EXPIRY
    │                  │                 │                │
    ▼                  ▼                 ▼                ▼
┌─────────┐      ┌───────────┐     ┌──────────┐     ┌──────────┐
│ Deposit │      │ Releases  │     │ Payee    │     │ Payer    │
│ to      │─────▶│ signed    │────▶│ withdraws│────▶│ withdraws│
│ escrow  │      │ (off-chain)│    │ delta    │     │ remainder│
└─────────┘      └───────────┘     └──────────┘     └──────────┘
     │                                  │
     └──────────────────────────────────┘
              Funds locked in escrow
              (guaranteed for payee)
```

**Cumulative release semantics:**

Releases MUST authorize a **cumulative total**, not incremental deltas. A
release's `cumulativeAmount` MUST be strictly greater than the previously
accepted `cumulativeAmount` for the same lock.

- Release #1: `cumulativeAmount = 100000` (authorizes 100000 total)
- Release #2: `cumulativeAmount = 250000` (authorizes 250000 total)
- Release #3: `cumulativeAmount = 400000` (authorizes 400000 total)

When settling, the implementation computes: `delta = cumulativeAmount - released`

This permits the lock to remain usable after partial releases—the payer
continues signing releases with higher cumulative amounts up to the deposit.

### 1.3. Relationship to Base Specification

This document extends [draft-tempo-payment-method] with:

- A new `lock` intent (Section 4)
- Lock-specific request and credential schemas (Sections 5-6)
- EIP-712 release format (Section 7)
- TIP20Escrow interface (Section 8)
- Lock-specific verification and settlement procedures (Sections 9-10)

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

**Payment Lock**
: An on-chain escrow where the payer deposits TIP-20 tokens that can only
  be released to a designated payee using signed releases, or withdrawn
  by the payer after expiry.

**Release**
: An EIP-712 signed message authorizing a cumulative release amount for
  a specific lock. Releases are monotonically increasing in amount.

**TIP20Escrow**
: An interface for payment lock escrow, providing `lock`, `release`,
  `requestRelease`, and `withdraw` operations. Implementations MAY be
  deployed as smart contracts or chain-native precompiles.

**Lock ID**
: A unique identifier (bytes32) for a specific lock, returned by a
  TIP20Escrow implementation when a lock is created.

**Cumulative Amount**
: The total amount authorized for release since lock creation. Each
  release's `cumulativeAmount` MUST be greater than the previous.

---

## 4. Intent: "lock"

An escrowed payment lock for streaming or metered services. The payer
deposits funds into an on-chain escrow (a TIP20Escrow implementation) that
permits the payee to withdraw funds up to the amount authorized by releases,
while permitting the payer to withdraw any remaining funds after expiry.

A lock request MUST include the parameters defined as REQUIRED in Section 5.
A server challenge for `intent="lock"` MUST NOT omit any REQUIRED fields.

---

## 5. Lock Request Schema

For `intent="lock"`, the `request` parameter contains a base64url-encoded
JSON object with the following fields:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `asset` | string | REQUIRED | TIP-20 token address |
| `amount` | string | REQUIRED | Amount to lock in base units (stringified number) |
| `expiry` | string | REQUIRED | Lock expiry as UNIX timestamp in seconds (stringified number) |
| `payee` | string | REQUIRED | Recipient address for released funds |
| `trust` | string | OPTIONAL | Exclusive intermediary authorized to call release (if set, payee cannot) |
| `feePayer` | boolean | OPTIONAL | If `true`, server will pay transaction fees (default: `false`) |

If `trust` is present, only `trust` can call `release()`; the `payee` cannot.
Funds are still transferred to `payee`, but `trust` acts as an exclusive
intermediary (e.g., an arbitration service). If `trust` is absent, `payee`
calls `release()` directly.

The following is a non-normative example:

```json
{
  "asset": "0x20c0000000000000000000000000000000000001",
  "amount": "10000000",
  "expiry": "1737043200",
  "payee": "0x742d35Cc6634C0532925a3b844Bc9e7595f8fE00"
}
```

In this example, the request specifies a lock of 10.00 alphaUSD (10000000
base units) expiring at UNIX timestamp 1737043200.

The client MUST fulfill this by signing a Tempo Transaction that:

1. Calls `lock(asset, amount, expiry, payee, trust)` on a TIP20Escrow
   implementation
2. The implementation transfers `amount` of `asset` from the payer to escrow
3. Returns a `lockId` that identifies this specific lock

The `trust` field, if present, specifies an additional address that can
release funds (e.g., an arbitration service). If omitted, only the `payee`
can release funds before expiry.

---

## 6. Lock Credential Schema

### 6.1. Lock Credential

For `intent="lock"`, the credential includes a `lockId` field that identifies
the created lock on-chain. The client MUST broadcast the lock creation
transaction and obtain the resulting `lockId` before sending the credential.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | REQUIRED | Challenge ID from the server |
| `source` | string | OPTIONAL | Payer identifier as a DID |
| `payload` | object | REQUIRED | Contains `type`, `signature`, and `lockId` |

The `payload` object for lock credentials:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `type` | string | REQUIRED | `"lock"` |
| `hash` | string | REQUIRED | Transaction hash of the lock creation transaction |
| `lockId` | string | REQUIRED | Lock identifier returned by the TIP20Escrow implementation |

**Example:**

```json
{
  "id": "xT4wLkM9pQvR2nJsY6aDfE",
  "payload": {
    "type": "lock",
    "hash": "0x1234567890abcdef...",
    "lockId": "0x6d0f4fdf..."
  },
  "source": "did:pkh:eip155:42431:0x1234567890abcdef1234567890abcdef12345678"
}
```

### 6.2. Release Credential

Release credentials are transmitted out of band (for example, via HTTP POST
to an endpoint defined by the server). The credential includes the EIP-712
message and signature:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | REQUIRED | Original challenge ID from the lock session |
| `payload` | object | REQUIRED | Contains `type`, `message`, and `signature` |

The `payload` object for release credentials:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `type` | string | REQUIRED | `"release"` |
| `message` | object | REQUIRED | EIP-712 Release struct (see Section 7) |
| `signature` | string | REQUIRED | EIP-712 signature over the message |

The `message` object:

| Field | Type | Description |
|-------|------|-------------|
| `lockId` | string | Lock identifier (bytes32 hex) |
| `cumulativeAmount` | string | Total amount authorized for release (cumulative, base units) |
| `expires` | string | UNIX timestamp after which release expires |

**Example:**

```json
{
  "id": "mK7xPqWvT2nJrHsY4aDfEb",
  "payload": {
    "type": "release",
    "message": {
      "lockId": "0x6d0f4fdf9a8b2c3e...",
      "cumulativeAmount": "250000",
      "expires": "1737043200"
    },
    "signature": "0xabc123...EIP-712 signature..."
  }
}
```

---

## 7. EIP-712 Release Format

To release funds from a lock, the payee MUST provide an EIP-712 signed
release from the lock owner. The signed release authorizes the payee to
withdraw funds up to `cumulativeAmount` from the lock.

### 7.1. Domain Separator

The EIP-712 domain MUST use the following values:

| Field | Value |
|-------|-------|
| `name` | `"TIP20Escrow"` |
| `version` | `"1"` |
| `chainId` | Tempo chain ID (e.g., 42431) |
| `verifyingContract` | Address of the TIP20Escrow implementation that created the lock |

### 7.2. Release Type

```solidity
struct Release {
    bytes32 lockId;
    uint256 cumulativeAmount;
    uint256 expires;
}
```

| Field | Type | Description |
|-------|------|-------------|
| `lockId` | bytes32 | Lock identifier |
| `cumulativeAmount` | uint256 | Total amount authorized for release (cumulative, not delta) |
| `expires` | uint256 | UNIX timestamp after which this release expires |

### 7.3. Cumulative Semantics

Releases MUST authorize a cumulative total, not incremental deltas. A
TIP20Escrow implementation MUST reject any release where
`cumulativeAmount <= released`. A payee SHOULD use the highest valid
release available when calling `release()`.

- Release #1: `cumulativeAmount = 100000` → releases 100000
- Release #2: `cumulativeAmount = 250000` → releases 150000 more (delta)
- Release #3: `cumulativeAmount = 400000` → releases 150000 more (delta)

The implementation computes: `delta = cumulativeAmount - lock.released`

This prevents replay attacks and permits the lock to remain usable after
partial releases—the payer continues signing releases with higher
cumulative amounts up to the locked deposit.

### 7.4. Example Release

```json
{
  "types": {
    "EIP712Domain": [
      { "name": "name", "type": "string" },
      { "name": "version", "type": "string" },
      { "name": "chainId", "type": "uint256" },
      { "name": "verifyingContract", "type": "address" }
    ],
    "Release": [
      { "name": "lockId", "type": "bytes32" },
      { "name": "cumulativeAmount", "type": "uint256" },
      { "name": "expires", "type": "uint256" }
    ]
  },
  "primaryType": "Release",
  "domain": {
    "name": "TIP20Escrow",
    "version": "1",
    "chainId": 42431,
    "verifyingContract": "0x0000000000000000000000000000000000000100"
  },
  "message": {
    "lockId": "0x6d0f4fdf9a8b2c3e...",
    "cumulativeAmount": "250000",
    "expires": "1737043200"
  }
}
```

---

## 8. TIP20Escrow Interface

The TIP20Escrow interface defines the escrow functionality for payment locks.
Implementations MAY be deployed as:

- **Smart contracts**: Standard EVM contracts deployable on any EVM chain
- **Precompiles**: Chain-native implementations at fixed addresses for
  improved gas efficiency

The interface is described using Solidity for exposition; non-Solidity
implementations MUST provide equivalent semantics.

### 8.1. Lock State

Each lock is identified by a unique `lockId` and stores:

| Field | Type | Description |
|-------|------|-------------|
| `active` | bool | Whether the lock is active |
| `asset` | address | TIP-20 token address |
| `amount` | uint256 | Total amount deposited |
| `released` | uint256 | Cumulative amount already released |
| `expires` | uint256 | UNIX timestamp after which payer can withdraw |
| `payee` | address | Recipient of released funds |
| `trust` | address | If set, exclusive caller for release (payee cannot call) |

### 8.2. Functions

#### 8.2.1. lock

Creates a new payment lock with escrowed funds.

```solidity
function lock(
    address asset,
    uint256 amount,
    uint256 duration,
    address payee,
    address trust
) external returns (bytes32 lockId);
```

The implementation MUST:

1. Transfer `amount` of `asset` from `msg.sender` to the implementation
2. Compute `expires = block.timestamp + duration`
3. Generate unique `lockId`
4. Store lock state with `released = 0`
5. Emit `LockCreated` event
6. Return `lockId`

#### 8.2.2. withdraw

Withdraw funds from a lock.

```solidity
// Payer reclaims remaining funds after expiry or grace period
function withdraw(
    address account,
    bytes32 lockId
) external;

// Payee/trust claims earned funds using payer's signed release
function withdraw(
    address account,
    bytes32 lockId,
    uint256 cumulativeAmount,
    bytes calldata signature
) external;
```

**Payer reclaim** (no signature):

The implementation MUST:

1. Verify `msg.sender == account` (lock owner)
2. Verify either:
   - `block.timestamp >= lock.expires`, OR
   - `lock.releaseRequested > 0 && block.timestamp >= lock.releaseRequested + gracePeriod`
3. Compute `remaining = lock.amount - lock.released`
4. Transfer `remaining` to `msg.sender`
5. Mark lock as `active = false`
6. Emit `FundsReleased` event

**Payee claim** (with signature):

The implementation MUST:

1. If `lock.trust` is set: verify `msg.sender == lock.trust`
   If `lock.trust` is not set: verify `msg.sender == lock.payee`
2. Verify `block.timestamp < lock.expires`
3. Verify EIP-712 signature from `account` (lock owner)
4. Verify `cumulativeAmount > lock.released` (monotonicity)
5. Verify `cumulativeAmount <= lock.amount` (cap)
6. Compute `delta = cumulativeAmount - lock.released`
7. Transfer `delta` to `lock.payee`
8. Update `lock.released = cumulativeAmount`
9. Emit `FundsReleased` event

The implementation MUST reject payee claims after expiry.

#### 8.2.3. requestRelease

Payer requests early release of the lock.

```solidity
function requestRelease(bytes32 lockId) external;
```

The implementation MUST:

1. Verify `msg.sender` is lock owner
2. Set `lock.releaseRequested = block.timestamp`
3. Emit `ReleaseRequested` event

After the implementation-defined grace period, the payer can call `withdraw()`.
The grace period SHOULD be documented by the implementation.

#### 8.2.4. modifyLock

Payer adds funds and/or extends expiry on an existing lock. A value of `0`
indicates no change for that field.

```solidity
function modifyLock(
    bytes32 lockId,
    uint256 additionalAmount,
    uint256 newExpiry
) external;
```

The implementation MUST:

1. Verify `msg.sender` is lock owner
2. Verify lock is active
3. If `additionalAmount > 0`:
   - Transfer `additionalAmount` of the lock's asset from payer to escrow
   - Add to `lock.amount`
4. If `newExpiry > 0`:
   - Reject if `newExpiry <= lock.expires` (expiry can only be extended)
   - Update `lock.expires = newExpiry`
5. Emit `LockModified` event

#### 8.2.5. getLock

Query lock state.

```solidity
function getLock(
    address account,
    bytes32 lockId
) external view returns (Lock memory);
```

---

## 9. Verification Procedure

### 9.1. Lock Verification

For `intent="lock"` credentials, servers MUST verify the lock state
on-chain before granting access:

1. Extract `lockId` from the credential payload
2. Call `getLock(payer, lockId)` on the TIP20Escrow implementation
3. Verify the returned lock state:
   - `active` is `true`
   - `asset` matches the requested token
   - `amount` >= the requested minimum amount
   - `expires` MUST be greater than the current time. Servers SHOULD enforce
     an implementation-defined minimum remaining lifetime suitable for the
     requested service.
   - `payee` matches the server's address
4. If `trust` was specified in the request, verify it matches

Servers SHOULD cache lock state and periodically re-verify for long-running
services.

### 9.2. Release Verification

Servers receiving a `type="release"` credential MUST perform the following
checks:

1. Verify `id` matches an active lock session
2. Extract release fields: `lockId`, `cumulativeAmount`, `expires`, `signature`
3. Verify `cumulativeAmount` > previously received release amount (monotonicity)
4. Verify `expires` > current time
5. Verify EIP-712 signature matches the lock owner (see Section 7)
6. Store the release for later settlement

Servers SHOULD acknowledge receipt of valid releases. Servers MAY batch
multiple releases and settle periodically rather than per-release.

---

## 10. Settlement Procedure

For `intent="lock"`, settlement requires a signed release from the lock
owner. The signed release authorizes the payee to withdraw funds up to
`cumulativeAmount` from the lock, enabling incremental authorization for
streaming services.

### 10.1. Settlement Flow

```
   Client                        Server                     Tempo Network
      │                             │                             │
      │  (1) Sign lock tx           │                             │
      │                             │                             │
      │  (2) Broadcast lock tx      │                             │
      ├────────────────────────────────────────────────────────────>│
      │                             │                             │
      │  (3) Lock created           │                             │
      │<────────────────────────────────────────────────────────────┤
      │                             │                             │
      │  (4) Authorization:         │                             │
      │      Payment <credential>   │                             │
      │      (with lockId)          │                             │
      ├────────────────────────────>│                             │
      │                             │                             │
      │                             │  (5) Verify lock state      │
      │                             │      getLock(payer, lockId) │
      │                             ├────────────────────────────>│
      │                             │  (6) Lock verified          │
      │                             │<────────────────────────────┤
      │                             │                             │
      │  (7) 200 OK                 │                             │
      │      (service begins)       │                             │
      │<────────────────────────────┤                             │
      │                             │                             │
      │         ... service streaming ...                         │
      │                             │                             │
      │  (8) Sign EIP-712 release   │                             │
      │                             │                             │
      │  (9) Authorization:         │                             │
      │      Payment <release>      │                             │
      ├────────────────────────────>│                             │
      │                             │                             │
      │         ... more service ...                              │
      │                             │                             │
      │  (10) Authorization:        │                             │
      │       Payment <final>       │                             │
      ├────────────────────────────>│                             │
      │                             │                             │
      │                             │  (11) release(payer, lockId,│
      │                             │       cumulativeAmount, sig)│
      │                             ├────────────────────────────>│
      │                             │                             │
      │                             │  (12) Funds transferred     │
      │                             │<────────────────────────────┤
      │                             │                             │
```

The following is an illustrative (non-normative) flow:

1. Client signs and broadcasts a transaction with `lock()` call
2. Lock is created; client receives `lockId`
3. Client sends lock credential via `Authorization: Payment` header
4. Server verifies lock state on-chain and begins service
5. As service streams, client signs EIP-712 releases
6. Client sends release credentials via `Authorization: Payment` header
7. Server collects releases; settles periodically
8. Server calls `release(payer, lockId, amount, signature)` with latest release
9. Implementation verifies signature and transfers `delta` to payee

### 10.2. Post-Expiry Recovery

After expiry, the lock owner can reclaim all unreleased funds by calling
`withdraw(lockId)` (no signature required—only the lock owner can withdraw
their own funds after expiry).

### 10.3. Early Release

If the payer wants to end the lock before expiry:

1. Payer calls `requestRelease(lockId)` on the TIP20Escrow implementation
2. The implementation-defined grace period begins
3. Payee can still call `release()` with any pending releases during grace
4. After grace period, payer can call `withdraw(lockId)` to reclaim remaining funds

This mechanism permits the payee to settle outstanding authorized amounts
during the grace period while permitting the payer to recover unspent funds
thereafter.

---

## 11. Security Considerations

### 11.1. Lock Security

Implementations MUST consider the following security properties:

**Expiry Management**: Servers MUST release funds before the lock expires.
After expiry, the payer can reclaim all remaining funds. Servers SHOULD:

- Set alerts for approaching lock expiry
- Release funds well before expiry (with margin for transaction confirmation)
- Track all active locks and their expiry timestamps

**Payee Address Verification**: Clients MUST verify the `payee` address
in the lock request matches the expected server. A malicious server could
specify a different address to redirect funds.

**Lock Amount**: Clients SHOULD limit locked amounts to those consistent
with their risk tolerance. While expiry protects against indefinite fund
locking, funds remain unavailable until expiry.

**Trust Address**: If the `trust` field is specified, only that address can
call `release()`; the payee cannot. Clients SHOULD only accept trusted
arbitration services and verify the trust address is legitimate.

**Partial Release**: TIP20Escrow implementations support partial releases.
Servers SHOULD release only the amount consumed to minimize client exposure.
Clients can reclaim unreleased funds after expiry.

**Early Release (requestRelease)**: Payers can request early release before
expiry. This starts an implementation-defined grace period during which:

- The payee can still call `release()` with valid releases
- After the grace period, the payer can call `withdraw()` to reclaim funds
- Servers SHOULD monitor for `ReleaseRequested` events and settle promptly

This permits payer flexibility while providing the payee time to finalize
settlement.

### 11.2. Release Security

Implementations MUST consider the following EIP-712 release security properties:

**Replay Prevention**: Releases use cumulative semantics—each release
authorizes a total amount, not a delta. The implementation enforces:

- `cumulativeAmount > lock.released` (monotonicity)
- `cumulativeAmount <= lock.amount` (cap)

This prevents replay: submitting the same release twice has no effect
after the first settlement.

**Release Expiry**: The `expires` field limits release validity.
Clients SHOULD use short windows during active streaming to limit exposure
if a release is intercepted. Implementations MUST reject releases where
`block.timestamp > expires`.

**Signature Verification**: Implementations MUST:

- Use strict ECDSA recovery to derive signer address
- Verify signer matches the lock owner (`account` parameter)
- Prevent signature malleability attacks
- Bind signature to `lockId`, `cumulativeAmount`, and `expires`

**Release Interception**: Even if an attacker intercepts a release:

- They cannot submit it (only payee/trust can call `release()`)
- They cannot modify the amount (signature verification fails)
- They cannot use it on another lock (bound to `lockId`)

**Off-chain Release Delivery**: Clients send releases to servers out of
band (for example, via HTTP POST to a server-defined endpoint). The
release credential includes both the EIP-712 message and signature.

When release credentials are transmitted over HTTP, the client MUST use
TLS [RFC8446]. Servers SHOULD acknowledge receipt of valid releases.

---

## 12. IANA Considerations

This document registers the following payment intent:

**Intent:** `lock`
**Method:** `tempo`
**Reference:** This document

---

## 13. References

### 13.1. Normative References

- [RFC2119] Bradner, S., "Key words for use in RFCs to Indicate Requirement
  Levels", BCP 14, RFC 2119, March 1997.
- [RFC8174] Leiba, B., "Ambiguity of Uppercase vs Lowercase in RFC 2119 Key
  Words", BCP 14, RFC 8174, May 2017.
- [RFC8446] Rescorla, E., "The Transport Layer Security (TLS) Protocol
  Version 1.3", RFC 8446, August 2018.
- [I-D.ietf-httpauth-payment] "Payment HTTP Authentication Scheme"
- [draft-tempo-payment-method] "Tempo Payment Method for HTTP Payment
  Authentication"
- [EIP-712] "Ethereum typed structured data hashing and signing"

### 13.2. Informative References

- [TEMPO-TX-SPEC] Tempo Labs, "Tempo Transaction Specification",
  https://docs.tempo.xyz/protocol/transactions/spec-tempo-transaction.

---

## Appendix A: Examples

### A.1. Payment Lock Flow

```
Client                                 Server                    Tempo
  │                                      │                         │
  │ (1) GET /video/stream                │                         │
  ├─────────────────────────────────────>│                         │
  │                                      │                         │
  │ (2) 402 Payment Required             │                         │
  │     WWW-Authenticate: Payment        │                         │
  │       method="tempo"                 │                         │
  │       intent="lock"                  │                         │
  │       request=<base64url>            │                         │
  │<─────────────────────────────────────┤                         │
  │                                      │                         │
  │ (3) Sign and broadcast lock tx       │                         │
  ├─────────────────────────────────────────────────────────────── │
  │                                      │                         │
  │ (4) Lock created, receive lockId     │                         │
  │<───────────────────────────────────────────────────────────────┤
  │                                      │                         │
  │ (5) GET /video/stream                │                         │
  │     Authorization: Payment           │                         │
  │       <lock credential>              │                         │
  ├─────────────────────────────────────>│                         │
  │                                      │ (6) Verify lock         │
  │                                      ├────────────────────────>│
  │                                      │<────────────────────────┤
  │ (7) 200 OK                           │                         │
  │     Content-Type: video/mp4          │                         │
  │<─────────────────────────────────────┤                         │
  │                                      │                         │
  │ (8) Video streaming...               │                         │
  │<─────────────────────────────────────┤                         │
  │                                      │                         │
  │ (9) POST /payments/release            │                         │
  │     Authorization: Payment           │                         │
  │       <release credential>           │                         │
  ├─────────────────────────────────────>│                         │
  │                                      │                         │
  │ ... continue streaming ...           │                         │
  │                                      │                         │
  │ (10) POST /payments/release          │                         │
  │      Authorization: Payment          │                         │
  │        <final release credential>    │                         │
  ├─────────────────────────────────────>│                         │
  │                                      │ (11) release()          │
  │                                      ├────────────────────────>│
  │                                      │<────────────────────────┤
  │ (12) 200 OK                          │                         │
  │      Payment-Receipt: <receipt>      │                         │
  │<─────────────────────────────────────┤                         │
```

### A.2. Challenge

```http
HTTP/1.1 402 Payment Required
WWW-Authenticate: Payment id="lock_kM9xPqWvT2nJrHsY4aDfEb",
  realm="video.example.com",
  method="tempo",
  intent="lock",
  request="eyJhc3NldCI6IjB4MjBjMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMSIsImFtb3VudCI6IjEwMDAwMDAwIiwiZXhwaXJlcyI6IjM2MDAiLCJwYXllZSI6IjB4NzQyZDM1Q2M2NjM0QzA1MzI5MjVhM2I4NDRCYzllNzU5NWY4ZkUwMCJ9"
```

Decoded request:

```json
{
  "asset": "0x20c0000000000000000000000000000000000001",
  "amount": "10000000",
  "expiry": "1737043200",
  "payee": "0x742d35Cc6634C0532925a3b844Bc9e7595f8fE00"
}
```

### A.3. Lock Credential

```json
{
  "id": "lock_kM9xPqWvT2nJrHsY4aDfEb",
  "source": "did:pkh:eip155:42431:0x1234567890abcdef1234567890abcdef12345678",
  "payload": {
    "type": "lock",
    "hash": "0xabcd1234...",
    "lockId": "0x6d0f4fdf1f2f6a1f6c1b0fbd6a7d5c2c0a8d3d7b1f6a9c1b3e2d4a5b6c7d8e9f"
  }
}
```

### A.4. Release Request

```http
POST /payments/release HTTP/1.1
Host: video.example.com
Authorization: Payment eyJpZCI6ImxvY2tfa005eFBxV3ZUMm5KckhzWTRhRGZFYiIsInBheWxvYWQiOnsidHlwZSI6InJlbGVhc2UiLCJtZXNzYWdlIjp7ImxvY2tJZCI6IjB4NmQwZjRmZGYuLi4iLCJjdW11bGF0aXZlQW1vdW50IjoiNTAwMDAwIiwiZXhwaXJlcyI6IjE3MzcwNDMyMDAifSwic2lnbmF0dXJlIjoiMHhhYmMxMjMuLi4ifX0
```

Decoded credential:

```json
{
  "id": "lock_kM9xPqWvT2nJrHsY4aDfEb",
  "payload": {
    "type": "release",
    "message": {
      "lockId": "0x6d0f4fdf1f2f6a1f6c1b0fbd6a7d5c2c0a8d3d7b1f6a9c1b3e2d4a5b6c7d8e9f",
      "cumulativeAmount": "500000",
      "expires": "1737043200"
    },
    "signature": "0xabc123...EIP-712 signature..."
  }
}
```

---

## Acknowledgements

The authors thank the Tempo community for their feedback on payment lock
design.

---

## Authors' Addresses

Jake Moxey
Tempo Labs
Email: jake@tempo.xyz

Georgios Konstantopoulos
Tempo Labs
Email: georgios@tempo.xyz
