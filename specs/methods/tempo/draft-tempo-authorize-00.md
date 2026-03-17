---
title: Tempo authorize Intent for HTTP Payment Authentication
abbrev: Tempo Authorize
docname: draft-tempo-authorize-00
version: 00
category: info
ipr: trust200902
submissiontype: IETF
consensus: true

author:
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
  RFC3339:
  RFC4648:
  RFC8174:
  RFC8259:
  I-D.httpauth-payment:
    title: "The 'Payment' HTTP Authentication Scheme"
    target: https://datatracker.ietf.org/doc/draft-ietf-httpauth-payment/
    author:
      - name: Jake Moxey
    date: 2026-01

informative:
  EIP-712:
    title: "Typed structured data hashing and signing"
    target: https://eips.ethereum.org/EIPS/eip-712
    author:
      - name: Remco Bloemen
    date: 2017-09
  EIP-2718:
    title: "Typed Transaction Envelope"
    target: https://eips.ethereum.org/EIPS/eip-2718
    author:
      - name: Micah Zoltu
    date: 2020-10
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

This document defines the "authorize" intent for the "tempo" payment method
in the Payment HTTP Authentication Scheme {{I-D.httpauth-payment}}. It
specifies how clients authorize a maximum spending amount by depositing
TIP-20 tokens into an onchain escrow, and how servers capture funds
against that authorization before an expiry deadline.

--- middle

# Introduction

The `authorize` intent separates payment authorization from capture. The
client authorizes a maximum amount by depositing tokens onchain, and the
server captures funds against that authorization as services are consumed.
Any uncaptured funds are returned to the client.

This two-phase model mirrors traditional authorize-and-capture payment
flows (e.g., credit card holds) but is implemented onchain using an
escrow contract. The authorization phase locks funds;
the capture phase transfers them to the server.

Unlike the `charge` intent which requires the full payment amount to be
determined upfront, `authorize` is suited for scenarios where the final
cost is unknown at the time of authorization:

- **Metered billing**: Pay-per-use APIs where total cost depends on
  consumption
- **Delayed fulfillment**: Services where delivery occurs after
  authorization and the final amount may differ
- **Partial capture**: Scenarios where the server captures less than the
  authorized maximum, refunding the remainder

This specification defines the request schema, credential formats,
escrow contract requirements, and capture procedures for the authorize
intent on Tempo.

## Authorize Flow

The following diagram illustrates the Tempo authorize flow:

~~~
   Client                        Server                          Tempo
      |                             |                             |
      |  (1) GET /api/resource      |                             |
      |-------------------------->  |                             |
      |                             |                             |
      |  (2) 402 Payment Required   |                             |
      |      intent="authorize"     |                             |
      |<--------------------------  |                             |
      |                             |                             |
      |  (3) Sign escrow open tx    |                             |
      |      + max-amount voucher   |                             |
      |                             |                             |
      |  (4) Authorization: Payment |                             |
      |      (tx + voucher)         |                             |
      |-------------------------->  |                             |
      |                             |  (5) Broadcast open tx      |
      |                             |      (deposits client funds)|
      |                             |-------------------------->  |
      |                             |  (6) Escrow created         |
      |                             |<--------------------------  |
      |  (7) 200 OK + Receipt       |                             |
      |      (authorized)           |                             |
      |<--------------------------  |                             |
      |                             |                             |
      |         ... later ...       |                             |
      |                             |                             |
      |                             |  (8) close(captureAmount,   |
      |                             |      maxVoucher)            |
      |                             |-------------------------->  |
      |                             |  (9) transfer(captureAmount)|
      |                             |<--------------------------  |
      |                             |                             |
~~~

# Requirements Language

{::boilerplate bcp14-tagged}

# Terminology

TIP-20
: Tempo's enshrined token standard, implemented as precompiles rather
  than smart contracts. TIP-20 tokens use 6 decimal places and provide
  `transfer`, `transferFrom`, and `approve` operations.

Tempo Transaction
: An EIP-2718 transaction with type prefix `0x76`, supporting batched
  calls, multiple signature types (secp256k1, P256, WebAuthn), 2D nonces,
  and validity windows.

Escrow Contract
: A smart contract that holds deposited funds and enforces voucher-based
  withdrawals within an expiry deadline.

Voucher
: An {{EIP-712}} signed message authorizing a cumulative payment amount for
  a specific channel. Vouchers are monotonically increasing in amount.

Channel
: An escrow relationship between a payer and payee, identified by a
  unique `channelId`. The channel holds deposited funds and tracks
  cumulative settlements.

2D Nonce
: Tempo's nonce system where each account has multiple independent nonce
  lanes (`nonce_key`), enabling parallel transaction submission.

Fee Payer
: An account that pays transaction fees on behalf of another account.
  Tempo Transactions support fee payment via a separate signature
  domain (`0x78`), allowing the server to pay for fees while the client
  only signs the payment authorization.

Base Units
: The smallest indivisible unit of a TIP-20 token. TIP-20 tokens use
  6 decimal places; one million base units equals 1.00 tokens.

# Request Schema

The `request` parameter in the `WWW-Authenticate` challenge contains a
base64url-encoded JSON object.

## Shared Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `amount` | string | REQUIRED | Maximum authorization amount in base units |
| `currency` | string | REQUIRED | TIP-20 token address |
| `recipient` | string | REQUIRED | Server's address (payee on the escrow channel) |

Challenge expiry is conveyed by the `expires` auth-param in
`WWW-Authenticate` per {{I-D.httpauth-payment}}. This expiry defines
the authorization deadline: the escrow channel MUST be opened with an
expiry matching this value.

## Method Details

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `methodDetails.chainId` | number | OPTIONAL | Tempo chain ID (default: 42431) |
| `methodDetails.feePayer` | boolean | OPTIONAL | If `true`, server pays transaction fees (default: `false`) |
| `methodDetails.escrowContract` | string | OPTIONAL | Escrow contract address |

**Example:**

~~~json
{
  "amount": "50000000",
  "currency": "0x20c0000000000000000000000000000000000001",
  "recipient": "0x742d35Cc6634C0532925a3b844Bc9e7595f8fE00",
  "methodDetails": {
    "chainId": 42431,
    "feePayer": true,
    "escrowContract": "0x9d136eEa063eDE5418A6BC7bEafF009bBb6CFa70"
  }
}
~~~

This requests an authorization of up to 50000000 base units of `currency`,
escrowed until the challenge `expires` timestamp.

The client fulfills this by signing a Tempo Transaction that calls
`open(payee, token, deposit, salt, authorizedSigner, expiresAt)` on the
escrow contract, depositing up to `amount` in base units of the specified
`currency`. The `expiresAt` parameter MUST be set to the challenge `expires`
auth-param converted to a Unix timestamp.

If `methodDetails.feePayer` is `true`, the client signs with
`fee_payer_signature` set to `0x00` and `fee_token` empty, allowing the
server to sponsor fees. If `feePayer` is `false` or omitted, the client
MUST set `fee_token` and pay fees themselves.

# Credential Schema

The credential in the `Authorization` header contains a base64url-encoded
JSON object per {{I-D.httpauth-payment}}.

## Credential Structure

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `challenge` | object | REQUIRED | Echo of the challenge from the server |
| `payload` | object | REQUIRED | Tempo-specific payload object |
| `source` | string | OPTIONAL | Payer identifier as a DID (e.g., `did:pkh:eip155:42431:0x...`) |

The `source` field, if present, SHOULD use the `did:pkh` method with the
chain ID applicable to the challenge and the payer's Ethereum address.

## Transaction Payload (type="transaction")

When `type` is `"transaction"`, `transaction` contains the complete signed
Tempo Transaction (type 0x76) serialized as RLP and hex-encoded with
`0x` prefix. The transaction MUST contain an `open(...)` call on the
escrow contract. The `voucher` field contains an {{EIP-712}} signature
authorizing the server to capture up to the full deposited amount.

The client signs both the open transaction and the max-amount voucher
atomically before submitting the credential. This gives the server
everything it needs to open the escrow and later capture funds without
further client interaction.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `transaction` | string | REQUIRED | Hex-encoded RLP-serialized signed transaction |
| `type` | string | REQUIRED | `"transaction"` |
| `channelId` | string | REQUIRED | Computed channel ID with `0x` prefix |
| `voucher` | string | REQUIRED | {{EIP-712}} voucher signature for the max authorized amount |

The `channelId` MUST be computed deterministically from the channel
parameters (payer, payee, token, salt, authorizedSigner, contract address,
chain ID) using the escrow contract's `computeChannelId()` function.

**Example:**

~~~json
{
  "challenge": {
    "id": "nR5tYuLpS8mWvXzQ1eCgHj",
    "realm": "api.example.com",
    "method": "tempo",
    "intent": "authorize",
    "request": "eyJ...",
    "expires": "2025-02-05T12:05:00Z"
  },
  "payload": {
    "channelId": "0x6d0f4fdf1f2f6a1f6c1b0fbd6a7d5c2c0a8d3d7b1f6a9c1b3e2d4a5b6c7d8e9f",
    "transaction": "0x76f901...signed transaction bytes...",
    "type": "transaction",
    "voucher": "0xabcdef1234567890...EIP-712 signature..."
  },
  "source": "did:pkh:eip155:42431:0x1234567890abcdef1234567890abcdef12345678"
}
~~~

## Hash Payload (type="hash")

When `type` is `"hash"`, the client has already broadcast the escrow
opening transaction to the Tempo network. The `hash` field contains the
transaction hash for the server to verify onchain. The `voucher` field
contains the max-amount {{EIP-712}} signature, same as the transaction
payload.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `hash` | string | REQUIRED | Transaction hash with `0x` prefix |
| `type` | string | REQUIRED | `"hash"` |
| `channelId` | string | REQUIRED | Computed channel ID with `0x` prefix |
| `voucher` | string | REQUIRED | {{EIP-712}} voucher signature for the max authorized amount |

**Example:**

~~~json
{
  "challenge": {
    "id": "nR5tYuLpS8mWvXzQ1eCgHj",
    "realm": "api.example.com",
    "method": "tempo",
    "intent": "authorize",
    "request": "eyJ...",
    "expires": "2025-02-05T12:05:00Z"
  },
  "payload": {
    "channelId": "0x6d0f4fdf1f2f6a1f6c1b0fbd6a7d5c2c0a8d3d7b1f6a9c1b3e2d4a5b6c7d8e9f",
    "hash": "0x9f8e7d6c5b4a3210fedcba0987654321fedcba0987654321fedcba0987654321",
    "type": "hash",
    "voucher": "0xabcdef1234567890...EIP-712 signature..."
  },
  "source": "did:pkh:eip155:42431:0x1234567890abcdef1234567890abcdef12345678"
}
~~~

**Limitations:**

- Cannot be used with `feePayer: true` (client must pay their own fees)
- Server cannot modify or enhance the transaction

# Escrow Contract

The authorize intent requires an onchain escrow contract that holds
deposited funds, enforces voucher-based withdrawals, and supports expiry.

## Channel State

Each channel is identified by a unique `channelId` and stores:

| Field | Type | Description |
|-------|------|-------------|
| `payer` | address | Client who deposited funds |
| `payee` | address | Server authorized to withdraw |
| `token` | address | {{TIP-20}} token address |
| `authorizedSigner` | address | Authorized voucher signer (0 = payer) |
| `deposit` | uint128 | Total amount deposited |
| `settled` | uint128 | Cumulative amount already withdrawn by payee |
| `expiresAt` | uint64 | Unix timestamp after which the payer may withdraw (after grace period) |
| `closeRequestedAt` | uint64 | Timestamp when close was requested (0 if not) |
| `finalized` | bool | Whether channel is closed |

The `channelId` MUST be computed deterministically:

~~~
channelId = keccak256(abi.encode(
    payer,
    payee,
    token,
    salt,
    authorizedSigner,
    address(this),
    block.chainid
))
~~~

## Channel Lifecycle

~~~
┌─────────────────────────────────────────────────────────────────┐
│                      AUTHORIZE (open)                           │
│   Client deposits tokens + signs max-amount voucher             │
│   Server broadcasts open tx, stores voucher                     │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                     ACTIVE (before expiry)                      │
│        Server may close() to capture at any time                │
│        Capture amount may be ≤ voucher max (partial capture)    │
└─────────────────────────────────────────────────────────────────┘
                              │
              ┌───────────────┼───────────────┐
              ▼               ▼               ▼
┌───────────────────┐ ┌─────────────────┐ ┌───────────────────────┐
│     CAPTURE       │ │  FORCED CLOSE   │ │   EXPIRED WITHDRAW    │
│ Server calls      │ │ 1. Client calls │ │ After expiry +        │
│ close(capture,    │ │    requestClose │ │ grace period, client  │
│ maxVoucher)       │ │ 2. Wait 15 min  │ │ calls withdraw()      │
│                   │ │ 3. Client calls │ │                       │
│                   │ │    withdraw()   │ │                       │
└───────────────────┘ └─────────────────┘ └───────────────────────┘
              │               │               │
              └───────────────┼───────────────┘
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                       CHANNEL CLOSED                            │
│     Captured amount → server, remainder → client                │
└─────────────────────────────────────────────────────────────────┘
~~~

## Expiry Semantics

The `expiresAt` field defines a deadline for the authorization:

- **Before expiry**: The channel operates normally. The server may
  call `close()` to capture funds at any time. Forced close via
  `requestClose()` requires the standard grace period (15 minutes).
- **After expiry**: The payer may call `withdraw()` after the grace
  period (15 minutes) without needing to call `requestClose()` first.
  This grace period gives the server a final window to submit a
  `close()` transaction. The server MAY still call `close()` to
  capture during the grace period.

This ensures the client can always recover funds after the authorization
window closes, while giving the server the full authorization window to
settle.

## Contract Functions

Compliant escrow contracts MUST implement the following functions.

### open

Opens a new channel with escrowed funds and an expiry.

| Parameter | Type | Description |
|-----------|------|-------------|
| `payee` | address | Server's address authorized to withdraw funds |
| `token` | address | {{TIP-20}} token contract address |
| `deposit` | uint128 | Amount to deposit in base units |
| `salt` | bytes32 | Random value for deterministic channelId computation |
| `authorizedSigner` | address | Delegated signer; use `0x0` to default to payer |
| `expiresAt` | uint64 | Unix timestamp after which payer may withdraw (after grace period) |

Returns the computed `channelId`.

~~~solidity
function open(
    address payee,
    address token,
    uint128 deposit,
    bytes32 salt,
    address authorizedSigner,
    uint64 expiresAt
) external returns (bytes32 channelId);
~~~

### close

Server closes the channel, capturing a specified amount and refunding
the remainder to the payer. The `captureAmount` MAY be less than the
voucher's `cumulativeAmount`, enabling partial capture. The contract
verifies that `captureAmount <= cumulativeAmount` and that the voucher
signature is valid for `cumulativeAmount`.

| Parameter | Type | Description |
|-----------|------|-------------|
| `channelId` | bytes32 | Unique channel identifier |
| `cumulativeAmount` | uint128 | Max authorized amount from the voucher |
| `captureAmount` | uint128 | Amount to capture (must be ≤ cumulativeAmount) |
| `signature` | bytes | {{EIP-712}} signature from authorized signer |

The contract transfers `captureAmount - channel.settled` to the payee
and refunds `channel.deposit - captureAmount` to the payer.

~~~solidity
function close(
    bytes32 channelId,
    uint128 cumulativeAmount,
    uint128 captureAmount,
    bytes calldata signature
) external;
~~~

### settle

Server withdraws an incremental amount without closing the channel.
The voucher's `cumulativeAmount` MUST be greater than the channel's
current `settled` value. The contract transfers
`cumulativeAmount - channel.settled` to the payee and updates
`channel.settled`.

| Parameter | Type | Description |
|-----------|------|-------------|
| `channelId` | bytes32 | Unique channel identifier |
| `cumulativeAmount` | uint128 | Cumulative amount authorized by the voucher |
| `signature` | bytes | {{EIP-712}} signature from authorized signer |

~~~solidity
function settle(
    bytes32 channelId,
    uint128 cumulativeAmount,
    bytes calldata signature
) external;
~~~

### topUp

Payer deposits additional funds into an existing channel. The
channel MUST NOT be finalized. The `channel.deposit` is increased
by `amount`.

| Parameter | Type | Description |
|-----------|------|-------------|
| `channelId` | bytes32 | Unique channel identifier |
| `amount` | uint128 | Additional amount to deposit in base units |

~~~solidity
function topUp(
    bytes32 channelId,
    uint128 amount
) external;
~~~

### requestClose

Payer requests early channel closure, starting the grace period.

| Parameter | Type | Description |
|-----------|------|-------------|
| `channelId` | bytes32 | Unique channel identifier |

~~~solidity
function requestClose(bytes32 channelId) external;
~~~

### withdraw

Payer withdraws remaining funds. Callable after `expiresAt + grace period`,
or after the grace period following `requestClose()`.

| Parameter | Type | Description |
|-----------|------|-------------|
| `channelId` | bytes32 | Unique channel identifier |

~~~solidity
function withdraw(bytes32 channelId) external;
~~~

The contract MUST allow withdrawal (without `requestClose()`)
when `block.timestamp >= channel.expiresAt + CLOSE_GRACE_PERIOD`.

## Voucher Format

Vouchers are {{EIP-712}} typed data with the following structure:

~~~
Voucher(bytes32 channelId, uint128 cumulativeAmount)
~~~

The EIP-712 domain uses:

| Field | Value |
|-------|-------|
| `name` | `"Tempo Stream Channel"` |
| `version` | `"1"` |
| `chainId` | Tempo chain ID |
| `verifyingContract` | Escrow contract address |

# Fee Payment

When a request includes `feePayer: true`, the server commits to paying
transaction fees on behalf of the client for the escrow opening
transaction.

## Server-Paid Fees

When `feePayer: true`:

1. **Client signs with placeholder**: The client signs the Tempo Transaction
   with `fee_payer_signature` set to `0x00` and `fee_token` empty.

2. **Server adds fee payment signature**: The server selects a `fee_token`
   and signs the transaction using signature domain `0x78`.

3. **Server broadcasts**: The final transaction contains both signatures.

## Client-Paid Fees

When `feePayer: false` or omitted, the client MUST set `fee_token` to a
valid USD TIP-20 token address and pay fees themselves.

# Settlement Procedure

## Authorization

For `intent="authorize"` fulfilled via transaction, the client signs an
`open(...)` transaction and a max-amount voucher. The server broadcasts
the open transaction and stores the voucher for later capture:

~~~
   Client                           Server                             Tempo
      |                                |                                |
      |  (1) Authorization:            |                                |
      |      Payment <credential>      |                                |
      |      (open tx + voucher)       |                                |
      |------------------------------->|                                |
      |                                |                                |
      |                                |  (2) eth_sendRawTxSync         |
      |                                |------------------------------->|
      |                                |                                |
      |                                |  (3) Escrow opened             |
      |                                |<-------------------------------|
      |                                |                                |
      |                                |  (4) Store voucher for         |
      |                                |      later capture             |
      |                                |                                |
      |  (5) 200 OK                    |                                |
      |      Payment-Receipt:          |                                |
      |      <base64url-receipt>       |                                |
      |<-------------------------------|                                |
      |                                |                                |
~~~

1. Client submits credential containing signed `open(...)` transaction and
   max-amount voucher
2. If `feePayer: true`, server adds fee sponsorship (signs with `0x78` domain)
3. Server broadcasts transaction to Tempo
4. Escrow channel created with deposited funds and expiry
5. Server stores the voucher for later capture
6. Server returns a receipt with the transaction hash

## Capture

The server captures funds by calling `close()` with the stored voucher.
The `captureAmount` may be any value up to the voucher's `cumulativeAmount`,
enabling partial capture. The remainder is refunded to the client:

~~~
   Client                        Server                          Tempo
      |                             |                             |
      |         ... service consumed ...                          |
      |                             |                             |
      |                             |  (1) close(captureAmount)   |
      |                             |-------------------------->  |
      |                             |                             |
      |                             |  (2) transfer(captureAmount)|
      |                             |<--------------------------  |
      |                             |                             |
~~~

The server determines the `captureAmount` based on actual service
consumption. No further client interaction is required — the max-amount
voucher signed at authorization time is sufficient.

If the server does not capture before expiry, the client MAY call
`withdraw()` to recover all deposited funds after the grace period.

## Hash Settlement

For credentials with `type="hash"`, the client has already broadcast the
`open(...)` transaction. The server verifies the escrow was created
onchain and stores the voucher from the credential for later capture.

## Receipt Generation

Upon successful escrow creation, servers MUST return a `Payment-Receipt`
header per {{I-D.httpauth-payment}}.

The receipt payload for Tempo authorize:

| Field | Type | Description |
|-------|------|-------------|
| `method` | string | `"tempo"` |
| `reference` | string | Transaction hash of the escrow opening transaction |
| `status` | string | `"success"` |
| `timestamp` | string | {{RFC3339}} settlement time |

# Use Cases

The escrow channel primitives compose to support a range of payment
patterns. Each use case is described below.

## Single Capture

The simplest authorize-and-capture flow. The client opens a channel
with a deposit and signs a max-amount voucher at authorization time.
The server later calls `close()` to capture funds:

~~~
   Client                        Server                          Tempo
      |                             |                             |
      |  (1) open() + max voucher   |                             |
      |-------------------------->  |                             |
      |                             |  (2) Broadcast open tx      |
      |                             |-------------------------->  |
      |                             |                             |
      |         ... later ...       |                             |
      |                             |                             |
      |                             |  (3) close(captureAmount)   |
      |                             |-------------------------->  |
      |                             |  (4) transfer(captureAmount)|
      |                             |<--------------------------  |
      |                             |                             |
~~~

## Partial Capture

Identical to single capture, but the server passes a `captureAmount`
strictly less than the voucher's `cumulativeAmount`. The contract
refunds the difference to the client automatically:

~~~
   Client                        Server                          Tempo
      |                             |                             |
      |  (1) open(50) + voucher(50) |                             |
      |-------------------------->  |                             |
      |                             |  (2) Broadcast open tx      |
      |                             |-------------------------->  |
      |                             |                             |
      |         ... later ...       |                             |
      |                             |                             |
      |                             |  (3) close(capture=30)      |
      |                             |-------------------------->  |
      |                             |  (4) transfer(30)           |
      |                             |<--------------------------  |
      |  (5) transfer(20) (refund)  |                             |
      |<----------------------------------------------------------|
      |                             |                             |
~~~

## Multi-Capture

For ongoing service consumption, the server settles intermediate
amounts before final capture. The client issues successive vouchers
with monotonically increasing `cumulativeAmount` values:

~~~
   Client                        Server                          Tempo
      |                             |                             |
      |  (1) open() + voucher(10)   |                             |
      |-------------------------->  |                             |
      |                             |  (2) Broadcast open tx      |
      |                             |-------------------------->  |
      |                             |                             |
      |    ... service consumed ... |                             |
      |                             |                             |
      |  (3) New voucher(20)        |                             |
      |-------------------------->  |                             |
      |                             |  (4) settle(20)             |
      |                             |-------------------------->  |
      |                             |  (5) transfer(20)           |
      |                             |<--------------------------  |
      |                             |                             |
      |    ... more consumed ...    |                             |
      |                             |                             |
      |  (5) New voucher(35)        |                             |
      |-------------------------->  |                             |
      |                             |  (6) close(35)              |
      |                             |-------------------------->  |
      |                             |  (7) trasfer(35)            |
      |                             |<--------------------------  |
      |                             |                             |
~~~

## Incremental Authorization

The client increases the authorization by depositing additional funds
into an existing channel via `topUp()`:

~~~
   Client                        Server                          Tempo
      |                             |                             |
      |  (1) open(50) + voucher(50) |                             |
      |-------------------------->  |                             |
      |                             |  (2) Broadcast open tx      |
      |                             |-------------------------->  |
      |                             |                             |
      |    ... nearing limit ...    |                             |
      |                             |                             |
      |  (3) topUp(30)              |                             |
      |---------------------------------------------------------->|
      |                             |                             |
      |  (4) New voucher(80)        |                             |
      |-------------------------->  |                             |
      |                             |                             |
      |         ... later ...       |                             |
      |                             |                             |
      |                             |  (5) close(80)              |
      |                             |-------------------------->  |
      |                             |  (6) transfer(80)           |
      |                             |<--------------------------  |
      |                             |                             |
~~~

## Void

The server releases all funds back to the client without capturing
any amount, by calling `close()` with a `captureAmount` of zero.
This is equivalent to canceling the authorization hold:

~~~
   Client                        Server                          Tempo
      |                             |                             |
      |  (1) open() + voucher       |                             |
      |-------------------------->  |                             |
      |                             |  (2) Broadcast open tx      |
      |                             |-------------------------->  |
      |                             |                             |
      |                             |  (3) close(capture=0)       |
      |                             |-------------------------->  |
      |  (4) transfer(full deposit) |                             |
      |<----------------------------------------------------------|
      |                             |                             |
~~~

## Delegation

The `authorizedSigner` parameter on `open()` allows the client to
delegate voucher signing to a separate key (e.g., a session key or
agent). The contract verifies voucher signatures against the
`authorizedSigner` address:

~~~
   Client                     Delegate              Server                Tempo
      |                          |                      |                  |
      |  (1) open(delegate=D)    |                      |                  |
      |------------------------------------------------------------------> |
      |                          |                      |                  |
      |                          |  (2) Sign vouchers   |                  |
      |                          |--------------------> |                  |
      |                          |                      |                  |
      |                          |                      |  (3) close()     |
      |                          |                      |----------------> |
      |                          |                      |  (4) Settled     |
      |                          |                      |<---------------- |
      |                          |                      |                  |
~~~

# Security Considerations

## Fund Recovery

After expiry plus the grace period (15 minutes), the payer can call
`withdraw()` without needing `requestClose()`. The grace period
prevents frontrunning of server capture transactions near the expiry
boundary. This ensures funds are never permanently locked in the
escrow contract, even if the server becomes unresponsive.

## Voucher Security

The client signs a single max-amount voucher at authorization time. The
onchain contract verifies the voucher signature and ensures the capture
amount does not exceed the voucher's `cumulativeAmount`. The voucher
cannot be used to extract more than the deposited amount, as the contract
also enforces `captureAmount <= channel.deposit`.

## Server-Paid Fees

Servers acting as fee payers accept financial risk. Malicious clients
could submit valid-looking credentials that fail onchain, causing the
server to pay fees without receiving an escrow deposit. Servers SHOULD
implement rate limiting and MAY require client authentication before
accepting payment credentials.

## Source Verification

If a credential includes the optional `source` field, servers MUST NOT
trust this value without verification. Servers MUST verify the payer
identity by:

- For `type="transaction"`: Recovering the signer address from the
  transaction signature
- For `type="hash"`: Retrieving the `from` address from the transaction
  receipt onchain

# IANA Considerations

## Payment Intent Registration

This document registers the following payment intent in the "HTTP Payment
Intents" registry established by {{I-D.httpauth-payment}}:

| Intent | Applicable Methods | Description | Reference |
|--------|-------------------|-------------|-----------|
| `authorize` | `tempo` | Escrow-based payment authorization | This document |

Contact: Tempo Labs (<contact@tempo.xyz>)

--- back

# Example

**Challenge:**

~~~http
HTTP/1.1 402 Payment Required
WWW-Authenticate: Payment id="nR5tYuLpS8mWvXzQ1eCgHj",
  realm="api.example.com",
  method="tempo",
  intent="authorize",
  request="eyJhbW91bnQiOiI1MDAwMDAwMCIsImN1cnJlbmN5IjoiMHgyMGMwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAxIiwicmVjaXBpZW50IjoiMHg3NDJkMzVDYzY2MzRDMDUzMjkyNWEzYjg0NEJjOWU3NTk1ZjhmRTAwIiwibWV0aG9kRGV0YWlscyI6eyJjaGFpbklkIjo0MjQzMSwiZmVlUGF5ZXIiOnRydWUsImVzY3Jvd0NvbnRyYWN0IjoiMHg5ZDEzNmVFYTA2M2VERTUNMThBNkJDN2JFYWZGMDA5YkJiNkNGYTcwIn19",
  expires="2025-02-05T12:00:00Z"
~~~

The `request` decodes to:

~~~json
{
  "amount": "50000000",
  "currency": "0x20c0000000000000000000000000000000000001",
  "recipient": "0x742d35Cc6634C0532925a3b844Bc9e7595f8fE00",
  "methodDetails": {
    "chainId": 42431,
    "feePayer": true,
    "escrowContract": "0x9d136eEa063eDE5418A6BC7bEafF009bBb6CFa70"
  }
}
~~~

**Credential:**

~~~http
GET /api/resource HTTP/1.1
Host: api.example.com
Authorization: Payment eyJjaGFsbGVuZ2UiOnsiaWQiOiJuUjV0WXVMcFM4bVd2WHpRMWVDZ0hqIn0sInBheWxvYWQiOnsic2lnbmF0dXJlIjoiMHg3NmY5MDEuLi4iLCJ0eXBlIjoidHJhbnNhY3Rpb24iLCJjaGFubmVsSWQiOiIweDZkMGY0ZmRmLi4uIn0sInNvdXJjZSI6ImRpZDpwa2g6ZWlwMTU1OjQyNDMxOjB4MTIzNDU2Nzg5MGFiY2RlZjEyMzQ1Njc4OTBhYmNkZWYxMjM0NTY3OCJ9
~~~
