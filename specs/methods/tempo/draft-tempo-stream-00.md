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
      |  (6) POST /voucher          |                             |
      |      (updated vouchers)     |                             |
      |-------------------------->  |                             |
      |                             |                             |
      |  (7) POST /voucher          |                             |
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
| `asset` | string | REQUIRED | TIP-20 token address |
| `destination` | string | REQUIRED | Payee address (server's withdrawal address) |
| `deposit` | string | REQUIRED | Required deposit amount in base units |
| `channelId` | string | CONDITIONAL | Channel ID if channel already exists |
| `salt` | string | CONDITIONAL | Random salt for new channel |
| `voucherEndpoint` | string | REQUIRED | HTTPS URL for voucher submission |
| `minVoucherDelta` | string | OPTIONAL | Minimum amount increase between vouchers (default: `"1"`) |

Either `channelId` or `salt` MUST be provided, but not both:

- **New channel**: Server provides `salt`; client computes `channelId`
  and opens channel on-chain.
- **Existing channel**: Server provides `channelId`; client verifies
  the channel exists and has sufficient remaining deposit.

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
  "asset": "0x20c0000000000000000000000000000000000001",
  "destination": "0x742d35Cc6634C0532925a3b844Bc9e7595f8fE00",
  "deposit": "10000000",
  "salt": "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
  "voucherEndpoint": "https://api.example.com/payments/voucher",
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
  "asset": "0x20c0000000000000000000000000000000000001",
  "destination": "0x742d35Cc6634C0532925a3b844Bc9e7595f8fE00",
  "deposit": "10000000",
  "channelId": "0x6d0f4fdf1f2f6a1f6c1b0fbd6a7d5c2c0a8d3d7b1f6a9c1b3e2d4a5b6c7d8e9f",
  "voucherEndpoint": "https://api.example.com/payments/voucher",
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

The `payload` object uses `type="stream"` with an `action` discriminator:

| Action | Description |
|--------|-------------|
| `open` | Confirms channel is open on-chain; begins streaming |
| `voucher` | Submits an updated cumulative voucher |
| `close` | Requests server to close the channel |

### Open Payload

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `type` | string | REQUIRED | `"stream"` |
| `action` | string | REQUIRED | `"open"` |
| `channelId` | string | REQUIRED | Channel ID (computed from request) |
| `authorizedSigner` | string | OPTIONAL | Delegated signer address |
| `openTxHash` | string | REQUIRED | Transaction hash of channel open |
| `voucher` | object | REQUIRED | Initial signed voucher (amount=0) |

The `voucher` object contains:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `payload` | object | REQUIRED | EIP-712 typed data |
| `signature` | string | REQUIRED | Hex-encoded signature |

**Example:**

~~~json
{
  "challenge": { "id": "str_abc123", ... },
  "payload": {
    "type": "stream",
    "action": "open",
    "channelId": "0x6d0f4fdf...",
    "openTxHash": "0xabcd1234...",
    "voucher": {
      "payload": {
        "primaryType": "Voucher",
        "domain": {
          "name": "Tempo Stream Channel",
          "version": "1",
          "chainId": 42431,
          "verifyingContract": "0x1234..."
        },
        "types": { ... },
        "message": {
          "channelId": "0x6d0f4fdf...",
          "cumulativeAmount": "0"
        }
      },
      "signature": "0x..."
    }
  },
  "source": "did:pkh:eip155:42431:0x1234..."
}
~~~

### Voucher Payload

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `type` | string | REQUIRED | `"stream"` |
| `action` | string | REQUIRED | `"voucher"` |
| `channelId` | string | REQUIRED | Channel ID |
| `voucher` | object | REQUIRED | Signed voucher with higher amount |

### Close Payload

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `type` | string | REQUIRED | `"stream"` |
| `action` | string | REQUIRED | `"close"` |
| `channelId` | string | REQUIRED | Channel ID |
| `closeRequest` | object | REQUIRED | Signed close request |

The `closeRequest` uses EIP-712 with type `CloseRequest(bytes32 channelId)`.

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
   - `channel.token` matches `request.asset`
   - `channel.deposit >= request.deposit`
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
5. Update `highestVoucherAmount = cumulativeAmount`

## Rejection

If verification fails, servers MUST return 401 with error details.

# Settlement Procedure

## Settlement Timing

Servers MAY settle at any time using their own criteria:

- Periodically (e.g., every N seconds or M base units accrued)
- When `action="close"` is received
- When accumulated unsettled amount exceeds a threshold
- Based on gas cost optimization

Settlement frequency is an implementation detail left to servers.

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
2. 15-minute grace period begins
3. Server can still `settle()` or `close()` during grace period
4. After grace period, client calls `withdraw(channelId)`
5. Client receives all remaining (unsettled) funds

## Receipt Generation

Upon successful settlement or close, servers MUST return a `Payment-Receipt`
header per Section 5.3 of {{I-D.httpauth-payment}}.

| Field | Type | Description |
|-------|------|-------------|
| `method` | string | `"tempo"` |
| `reference` | string | Transaction hash of settlement/close |
| `status` | string | `"success"` or `"failed"` |
| `timestamp` | string | ISO 8601 settlement time |
| `channelId` | string | The channel identifier |
| `settledAmount` | string | Total amount settled to payee |

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
- Rate-limit voucher submissions per channel
- Reject vouchers that don't advance state

## Escrow Guarantees

The escrow contract provides:

- **Payer protection**: Funds only withdrawn with valid voucher signature
- **Payee protection**: Deposited funds guaranteed (cannot be drained)
- **Forced close**: 15-minute grace period protects both parties

## Authorized Signer

The `authorizedSigner` field allows delegation of signing authority
to a hot wallet while the main wallet only deposits funds. This reduces
exposure of the primary key during streaming sessions.

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
WWW-Authenticate: Payment id="str_kM9xPqWvT2nJrHsY4aDfEb",
  realm="api.ai-service.com",
  method="tempo",
  intent="stream",
  request="eyJlc2Nyb3dDb250cmFjdCI6IjB4MTIzNDU2Nzg5MGFiY2RlZjEyMzQ1Njc4OTBhYmNkZWYxMjM0NTY3OCIsImFzc2V0IjoiMHgyMGMwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAxIiwiZGVzdGluYXRpb24iOiIweDc0MmQzNUNjNjYzNEMwNTMyOTI1YTNiODQ0QmM5ZTc1OTVmOGZFMDAiLCJkZXBvc2l0IjoiMTAwMDAwMDAiLCJzYWx0IjoiMHhhYmNkZWYxMjM0NTY3ODkwYWJjZGVmMTIzNDU2Nzg5MGFiY2RlZjEyMzQ1Njc4OTBhYmNkZWYxMjM0NTY3ODkwIiwidm91Y2hlckVuZHBvaW50IjoiaHR0cHM6Ly9hcGkuYWktc2VydmljZS5jb20vcGF5bWVudHMvdm91Y2hlciIsIm1pblZvdWNoZXJEZWx0YSI6IjEwMDAifQ"
~~~

The `request` decodes to:

~~~json
{
  "escrowContract": "0x1234567890abcdef1234567890abcdef12345678",
  "asset": "0x20c0000000000000000000000000000000000001",
  "destination": "0x742d35Cc6634C0532925a3b844Bc9e7595f8fE00",
  "deposit": "10000000",
  "salt": "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
  "voucherEndpoint": "https://api.ai-service.com/payments/voucher",
  "minVoucherDelta": "1000"
}
~~~

## Open Credential

~~~http
GET /api/stream HTTP/1.1
Host: api.ai-service.com
Authorization: Payment eyJjaGFsbGVuZ2UiOnsiaWQiOiJzdHJfa005eFBxV3ZUMm5KckhzWTRhRGZFYiJ9LCJwYXlsb2FkIjp7InR5cGUiOiJzdHJlYW0iLCJhY3Rpb24iOiJvcGVuIiwiY2hhbm5lbElkIjoiMHg2ZDBmNGZkZi4uLiIsIm9wZW5UeEhhc2giOiIweGFiY2QxMjM0Li4uIiwidm91Y2hlciI6eyJwYXlsb2FkIjp7fSwic2lnbmF0dXJlIjoiMHguLi4ifX0sInNvdXJjZSI6ImRpZDpwa2g6ZWlwMTU1OjQyNDMxOjB4MTIzNC4uLiJ9
~~~

## Voucher Submission

During streaming, clients POST updated vouchers to the `voucherEndpoint`:

~~~http
POST /payments/voucher HTTP/1.1
Host: api.ai-service.com
Content-Type: application/json

{
  "type": "stream",
  "action": "voucher",
  "channelId": "0x6d0f4fdf...",
  "voucher": {
    "payload": {
      "primaryType": "Voucher",
      "domain": { ... },
      "types": { ... },
      "message": {
        "channelId": "0x6d0f4fdf...",
        "cumulativeAmount": "250000"
      }
    },
    "signature": "0x..."
  }
}
~~~

## Close Request

~~~http
POST /payments/voucher HTTP/1.1
Host: api.ai-service.com
Content-Type: application/json

{
  "type": "stream",
  "action": "close",
  "channelId": "0x6d0f4fdf...",
  "closeRequest": {
    "payload": {
      "primaryType": "CloseRequest",
      "domain": { ... },
      "types": {
        "CloseRequest": [
          { "name": "channelId", "type": "bytes32" }
        ]
      },
      "message": {
        "channelId": "0x6d0f4fdf..."
      }
    },
    "signature": "0x..."
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
  ],
} as const

// Sign a close request
const signature = await walletClient.signTypedData({
  domain: getVoucherDomain(escrowContract, 42431),
  types: closeRequestTypes,
  primaryType: 'CloseRequest',
  message: {
    channelId: '0x...',
  },
})
~~~

# Acknowledgements

The authors thank the Tempo community for their feedback on streaming
payment design.
