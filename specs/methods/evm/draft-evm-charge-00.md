---
title: EVM Charge Intent for HTTP Payment Authentication
abbrev: EVM Charge
docname: draft-evm-charge-00
version: 00
category: info
ipr: noModificationTrust200902
submissiontype: IETF
consensus: true

author:
  - name: Xin Tian
    ins: X. Tian
    email: xin.tian@okg.com
    organization: OKG
  - name: Eason Wang
    ins: E. Wang
    email: wangyuxin@okg.com
    organization: OKG
  - name: Michael Wong
    ins: M. Wong
    email: michael.wong@okg.com
    organization: OKG
  - name: Aaron Zhou
    ins: A. Zhou
    email: guoliang.zhou@okg.com
    organization: OKG

normative:
  RFC2119:
  RFC3339:
  RFC4648:
  RFC8174:
  RFC8259:
  RFC8785:
  RFC9457:
  I-D.payment-intent-charge:
    title: "'charge' Intent for HTTP Payment Authentication"
    target: https://datatracker.ietf.org/doc/draft-payment-intent-charge/
    author:
      - name: Jake Moxey
      - name: Brendan Ryan
      - name: Tom Meagher
    date: 2026
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
      - name: Leonid Logvinov
      - name: Jacob Evans
    date: 2017-09
  EIP-55:
    title: "Mixed-case checksum address encoding"
    target: https://eips.ethereum.org/EIPS/eip-55
  EIP-3009:
    title: "Transfer With Authorization"
    target: https://eips.ethereum.org/EIPS/eip-3009
    author:
      - name: Peter Jihoon Kim
      - name: Kevin Britz
      - name: David Knott
    date: 2020-09
  ERC-20:
    title: "Token Standard"
    target: https://eips.ethereum.org/EIPS/eip-20
  PERMIT2:
    title: "Permit2"
    target: https://github.com/Uniswap/permit2
    author:
      - org: Uniswap Labs
  EIP-5267:
    title: "Retrieval of EIP-712 domain"
    target: https://eips.ethereum.org/EIPS/eip-5267
    author:
      - name: Francisco Giordano
    date: 2022-07
  ERC-4337:
    title: "Account Abstraction Using Alt Mempool"
    target: https://eips.ethereum.org/EIPS/eip-4337
  EIP-7702:
    title: "Set Code for EOAs"
    target: https://eips.ethereum.org/EIPS/eip-7702
    author:
      - name: Vitalik Buterin
      - name: Sam Wilson
      - name: Ansgar Dietrichs
      - name: lightclient
    date: 2024-05
  ERC-7710:
    title: "Smart Contract Delegation"
    target: https://eips.ethereum.org/EIPS/eip-7710
    author:
      - name: Ryan McPeck
      - name: Dan Finlay
      - name: Rob Dawson
      - name: Derek Chiang
    date: 2024-05
  ERC-7579:
    title: "Minimal Modular Smart Accounts"
    target: https://eips.ethereum.org/EIPS/eip-7579
  DID-PKH:
    title: "did:pkh Method Specification"
    target: https://github.com/w3c-ccg/did-pkh/blob/main/did-pkh-method-draft.md
    author:
      - org: W3C Credentials Community Group
    date: 2022
---

--- abstract

This document defines the "charge" intent for the "evm" payment
method in the Payment HTTP Authentication Scheme
{{I-D.httpauth-payment}}. It specifies how clients and servers
exchange one-time ERC-20 token transfers on any EVM-compatible
blockchain.

Two credential types are supported: `type="transaction"`
(RECOMMENDED), where the client provides an off-chain
authorization and the server submits the on-chain
transfer; and `type="hash"` (fallback), where the client
broadcasts the transaction itself and presents the
on-chain transaction hash for server verification.

The `type="transaction"` credential supports three
authorization mechanisms, selected via
`authorization.type`: `"eip-3009"` (RECOMMENDED), using
EIP-3009 {{EIP-3009}} transfer-with-authorization;
`"permit2"`, using Permit2 {{PERMIT2}} off-chain signed
approvals; and `"delegation"`, using ERC-7710 {{ERC-7710}}
smart account delegation.

This specification covers ERC-20 token transfers only. Native
token transfers (ETH, etc.) are out of scope.

--- middle

# Introduction

HTTP Payment Authentication {{I-D.httpauth-payment}} defines a
challenge-response mechanism that gates access to resources behind
payments. This document registers the "charge" intent for the
"evm" payment method.

The Ethereum Virtual Machine (EVM) is the execution environment
shared by Ethereum and a growing number of compatible blockchains.
These chains share a common smart contract interface (ERC-20
{{ERC-20}}), transaction semantics, and address encoding
(EIP-55 {{EIP-55}}) — making it possible to define a single
payment method that works across all of them.

This specification inherits the shared request semantics of the
"charge" intent from {{I-D.payment-intent-charge}}. It defines
only the EVM-specific `methodDetails`, `payload`, and verification
procedures.

## Design Rationale

The control flow, data structures, and verification logic are
identical across EVM-compatible chains — the only differences are
chain ID and optional RPC extensions. A unified `evm` method
avoids fragmenting the registry while still allowing chain-specific
optimizations at the implementation level.

Servers MAY return multiple challenges with different methods
simultaneously to let clients choose the most suitable one.

## Credential Types

This specification defines two credential types,
distinguished by `payload.type`:

- **`type="transaction"` (RECOMMENDED)**: The client
  provides an off-chain authorization and the server
  constructs and submits the on-chain transaction. The
  client never interacts with the chain directly. The
  authorization mechanism is selected via
  `authorization.type`:

    - **`authorization.type="eip-3009"` (RECOMMENDED)**:
      EIP-3009 {{EIP-3009}} transfer-with-authorization.
      The server sponsors gas (fee payer). No Permit2
      approval prerequisite — zero setup. Requires the
      token to implement EIP-3009.

    - **`authorization.type="permit2"`**: Permit2
      {{PERMIT2}} off-chain signed approval. The server
      sponsors gas. Split payments are atomic via batch
      transfers. `externalId` is cryptographically bound
      via witness data. Requires a one-time ERC-20
      approval to the Permit2 contract per token per
      chain.

    - **`authorization.type="delegation"`**: ERC-7710
      {{ERC-7710}} smart account delegation. The server
      sponsors gas. Supports smart accounts (ERC-4337
      {{ERC-4337}}), EIP-7702 {{EIP-7702}} EOAs, and any
      ERC-7710 compatible wallet. Split payments are
      atomic via batched execution. Delegation caveats
      enable fine-grained authorization constraints
      (amount limits, token restrictions, expiry).
      Requires the client's account to support ERC-7710
      delegation.

- **`type="hash"` (fallback)**: The client broadcasts the
  transaction itself and presents the confirmed on-chain
  transaction hash. This covers cases where none of the
  above authorization mechanisms are feasible — for
  example, custodial wallets, hardware signers, or tokens
  that do not support EIP-3009 on chains without Permit2
  or ERC-7710. The client pays gas.

Servers SHOULD prefer `type="transaction"` with
`authorization.type="eip-3009"` when the target token
supports EIP-3009. Clients SHOULD prefer
`authorization.type="eip-3009"` when available. For smart
account clients that do not support EIP-3009 or Permit2,
servers SHOULD prefer `authorization.type="delegation"`
over `type="hash"`.

## Client-Broadcast Fallback

Some clients (custodial wallets, hardware signers) cannot
hand off a signed-but-unbroadcast authorization. For these
cases, `type="hash"` allows the client to broadcast the
transaction itself and present the on-chain hash. This mode
provides weaker challenge binding and does not support
server-paid fees. Servers SHOULD prefer
`type="transaction"` when possible.

## Charge Flow

The following diagram illustrates the recommended charge flow
using an EIP-3009 transaction credential:

~~~
Client                  Server               EVM Chain
  |                        |                      |
  | (1) GET /resource      |                      |
  |----------------------->|                      |
  |                        |                      |
  | (2) 402 Payment Req    |                      |
  |     intent="charge"    |                      |
  |<-----------------------|                      |
  |                        |                      |
  | (3) Sign EIP-712       |                      |
  |     EIP-3009 authz     |                      |
  |                        |                      |
  | (4) Authorization:     |                      |
  |     Payment <cred>     |                      |
  |----------------------->|                      |
  |                        | (5) Call transfer-   |
  |                        |  WithAuthorization() |
  |                        |--------------------->|
  |                        | (6) Receipt          |
  |                        |<---------------------|
  | (7) 200 OK + Receipt   |                      |
  |<-----------------------|                      |
  |                        |                      |
~~~

# Requirements Language

{::boilerplate bcp14-tagged}

# Terminology

ERC-20
: The standard token interface on EVM-compatible chains
{{ERC-20}}. Tokens expose `transfer(address,uint256)` and
emit `Transfer` events on successful transfers.

Permit2
: Uniswap's universal token approval contract {{PERMIT2}}.
Deployed across EVM-compatible chains; the contract
address varies per chain. Enables off-chain signed
approvals for any ERC-20 token.

EIP-712
: A standard for typed structured data hashing and signing
{{EIP-712}}, used by Permit2 and EIP-3009 to produce
human-readable, replay-protected authorization signatures.

EIP-3009
: An ERC-20 extension {{EIP-3009}} that enables
`transferWithAuthorization(from, to, value, validAfter,
validBefore, nonce, v, r, s)` — the token holder signs
off-chain, any relayer can submit the on-chain transaction.

ERC-7710
: A standard interface for smart contract delegation
{{ERC-7710}}. Enables a delegator (smart account) to
authorize a Delegation Manager contract to execute actions
on its behalf via `redeemDelegations()`. Uses ERC-7579
{{ERC-7579}} execution modes for flexibility.

EIP-7702
: A mechanism that allows EOAs to set account code
{{EIP-7702}}, enabling them to temporarily delegate to a
smart account implementation. This allows EOAs to behave
as smart accounts and use ERC-7710 delegation.

Base Units
: The smallest transferable unit of a token, determined by
the token's decimal precision. For example, USDC (6
decimals) uses 1,000,000 base units per 1 USDC.

# Intent Identifier

The intent identifier for this specification is "charge".
It MUST be lowercase.

# Encoding Conventions {#encoding}

All JSON {{RFC8259}} objects carried in auth-params or HTTP
headers in this specification MUST be serialized using the JSON
Canonicalization Scheme (JCS) {{RFC8785}} before encoding. JCS
produces a deterministic byte sequence, which is required for
any digest or signature operations defined by the base spec
{{I-D.httpauth-payment}}.

The resulting bytes MUST then be encoded using base64url
{{RFC4648}} Section 5 without padding characters (`=`).
Implementations MUST NOT append `=` padding when encoding,
and MUST accept input with or without padding when decoding.

This encoding convention applies to: the `request` auth-param
in `WWW-Authenticate`, the credential token in `Authorization`,
and the receipt token in `Payment-Receipt`.

# Request Schema

The `request` auth-param of the `WWW-Authenticate: Payment`
header contains a JCS-serialized, base64url-encoded JSON
object (see {{encoding}}).

## Shared Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `amount` | string | REQUIRED | Amount in base units (stringified integer) |
| `currency` | string | REQUIRED | ERC-20 token contract address (EIP-55 checksummed) |
| `recipient` | string | REQUIRED | Recipient address, EIP-55 encoded {{EIP-55}} |
| `description` | string | OPTIONAL | Human-readable payment description |
| `externalId` | string | OPTIONAL | Merchant's reference (order ID, invoice number, etc.) |

The `amount` field MUST be a base-10 integer string with no
sign, decimal point, exponent, or surrounding whitespace.

Challenge expiry is conveyed by the `expires` auth-param in
`WWW-Authenticate` per {{I-D.httpauth-payment}}.

Addresses in `currency` and `recipient` MUST be 0x-prefixed,
20-byte hex strings. Implementations SHOULD use EIP-55
mixed-case encoding but MUST compare addresses by decoded
20-byte value, not string form.

## Method Details

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `chainId` | number | REQUIRED | EVM chain ID |
| `feePayer` | boolean | OPTIONAL | If `true`, server pays gas; client MUST use `type="transaction"`. If `false` (default), client may use any credential type |
| `permit2Address` | string | OPTIONAL | Permit2 contract address for the target chain (EIP-55 checksummed). REQUIRED when the server accepts `authorization.type="permit2"` credentials; see {{PERMIT2}} for chain-specific addresses |
| `splits` | array | OPTIONAL | Additional payment splits. See {{split-payments}} |
| `memo` | string | OPTIONAL | Human-readable label for display purposes only (max 256 UTF-8 bytes). This field is metadata and is NOT transmitted on-chain |

### Chain Identification

The `chainId` field identifies the target blockchain using
its EIP-155 chain ID. It MUST be present in every challenge.
Clients MUST reject challenges whose `chainId` does not
match a chain they support.

A registry of EVM chain IDs is maintained at
https://chainlist.org. This specification is not limited to
any particular set of chains. The `chainId` value MUST NOT
exceed 2^53 - 1 (the JSON safe integer range per
{{RFC8259}}).

### Fee Payer Semantics

The `feePayer` field determines the payment mode and
constrains the allowed credential types:

| `feePayer` | Allowed `payload.type` | Description |
|-----------|----------------------|-------------|
| `true` | `"transaction"` | Client signs off-chain; server submits the on-chain transfer and pays gas |
| `false` (default) | `"transaction"` or `"hash"` | Client may sign off-chain OR broadcast the transaction itself |

When `feePayer` is `false` or absent, the client behavior
depends on its wallet type:

- **EOA clients**: Use `type="transaction"` with
  `authorization.type="eip-3009"` or
  `authorization.type="permit2"`, or broadcast an ERC-20
  `transfer` and submit txHash via `type="hash"`
- **Smart Wallet clients**: Use `type="transaction"` with
  `authorization.type="delegation"`, or batch transfers in
  a UserOperation (ERC-4337 {{ERC-4337}}), optionally
  using a Paymaster for gas, and submit txHash via
  `type="hash"`
- **EIP-7702 EOA clients**: May use `type="transaction"`
  with `authorization.type="delegation"` when the EOA has
  delegated to a smart account implementation supporting
  ERC-7710 {{EIP-7702}}

**Example:**

~~~json
{
  "amount": "1000000",
  "currency": "0xA8CE8aee21bC2A48a5EF670afCc9274C7bbbC035",
  "recipient": "0x742d35Cc6634c0532925a3b844bC9e7595F8fE00",
  "methodDetails": {
    "chainId": 196,
    "feePayer": true,
    "permit2Address": "0x000000000022D473030F116dDEE9F6B43aC78BA3"
  }
}
~~~

This requests a transfer of 1.00 USDC (1,000,000 base units)
on X Layer, with the server paying gas.

## Split Payments {#split-payments}

The `splits` field enables a single charge to distribute payment
across multiple recipients atomically. This is useful for
platform fees, revenue sharing, and marketplace payouts.

### Semantics

The top-level `amount` represents the total amount the client
pays. Each entry in `splits` specifies a recipient and the
amount they receive. The primary recipient (the top-level
`recipient`) receives the remainder: `amount` minus the sum
of all split amounts.

### Split Entry Schema

Each entry in the `splits` array is a JSON object:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `amount` | string | REQUIRED | Amount in base units for this recipient |
| `recipient` | string | REQUIRED | Recipient EVM address |
| `memo` | string | OPTIONAL | Human-readable label for display purposes only (max 256 UTF-8 bytes). This field is metadata and is NOT transmitted on-chain |

The `amount` field in each split entry MUST be a base-10
integer string with no sign, decimal point, exponent, or
surrounding whitespace. Each `splits[i].amount` MUST be
greater than zero. Address fields are compared by decoded
20-byte value, not by string form.

### Constraints

The sum of all `methodDetails.splits[].amount` values MUST be
strictly less than `amount`. Clients MUST reject any request
that violates this constraint. The primary recipient MUST
always receive a non-zero remainder:
`amount - sum(methodDetails.splits[].amount) > 0`.
Servers MUST validate this constraint when generating
challenges; servers MUST reject credentials where the
constraint is violated.

Additional constraints:

- If present, `splits` MUST contain at least 1 entry.
  Servers SHOULD reject challenges with more than 10 splits.
- All transfers MUST target the same `currency` token.
- The `memo` field, if present, MUST NOT exceed 256 UTF-8
  bytes.

### Ordering

For `type="transaction"` credentials with
`authorization.type="permit2"`, the `transferDetails`
array entries MUST correspond positionally: the first entry
is the primary recipient, subsequent entries match
`methodDetails.splits` in order.
For `type="transaction"` credentials with
`authorization.type="eip-3009"`, the order of entries
in the credential `authorization.splits` array MUST
correspond positionally to the challenge
`methodDetails.splits` array.
For `type="transaction"` credentials with
`authorization.type="delegation"`, the server constructs
the batch execution calldata with the primary recipient
first, followed by split recipients in the same order as
`methodDetails.splits`.
For `type="hash"` credentials, the order of on-chain
`Transfer` events is not significant; servers MUST verify
that the required payment effects are present regardless
of event ordering.

### On-Chain Execution

- **`authorization.type="permit2"`**: All transfers
  (primary + splits) execute atomically in a single
  on-chain Permit2 transaction. The client signs one
  EIP-712 message covering all transfers.

- **`authorization.type="eip-3009"`**: Each split requires
  an independent EIP-3009 authorization and signature from
  the client. The server submits all
  `transferWithAuthorization` calls in a single batched
  transaction.

- **`authorization.type="delegation"`**: The server
  constructs a batch of ERC-20 `transfer` calls (primary +
  splits) and redeems the delegation via
  `redeemDelegations()`. All transfers execute atomically
  within the delegator's smart account.

- **`type="hash"`**: The client MUST produce all required
  `Transfer` events on-chain. The mechanism is the client's
  choice (e.g., multicall, ERC-4337 UserOperation, or any
  other approach). The server verifies only the resulting
  `Transfer` event logs.

### Example

~~~json
{
  "amount": "1000000",
  "currency": "0xA8CE8aee21bC2A48a5EF670afCc9274C7bbbC035",
  "recipient": "0x742d35Cc6634c0532925a3b844bC9e7595F8fE00",
  "methodDetails": {
    "chainId": 196,
    "feePayer": true,
    "permit2Address": "0x000000000022D473030F116dDEE9F6B43aC78BA3",
    "splits": [
      {
        "amount": "50000",
        "recipient": "0xA1B2C3d4e5F6a1B2c3d4e5F6a1b2c3d4e5F6a1b2"
      },
      {
        "amount": "10000",
        "memo": "affiliate fee",
        "recipient": "0xC4D5e6F7A8B9c4D5E6f7a8B9c4d5e6F7a8b9C4D5"
      }
    ]
  }
}
~~~

This requests a total payment of 1.00 USDC (1,000,000 base
units). The platform receives 0.05 USDC, the affiliate
receives 0.01 USDC (labeled "affiliate fee"), and the
primary recipient receives the remaining 0.94 USDC
(940,000 base units).

### Client Behavior

When `methodDetails.splits` is present, the client MUST
produce on-chain effects that include the following
`Transfer` events on the `currency` token:

1. The primary recipient (top-level `recipient`) receives
   `amount - sum(methodDetails.splits[].amount)`.
2. Each `methodDetails.splits[i].recipient` receives
   `methodDetails.splits[i].amount`.

Clients MAY achieve these effects using any valid
transaction structure, including batched calls, smart
contract wallet invocations, or intermediary operations —
provided all required payment effects are emitted or
recorded atomically.

# Credential Schema

The credential in the `Authorization` header contains a
base64url-encoded JSON object per {{I-D.httpauth-payment}}.

## Credential Structure

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `challenge` | object | REQUIRED | Echo of the challenge from the server |
| `payload` | object | REQUIRED | EVM-specific payload object |
| `source` | string | OPTIONAL | Payer identifier as a DID (e.g., `did:pkh:eip155:196:0x...`). REQUIRED for `type="hash"` and `authorization.type="delegation"`; OPTIONAL otherwise |

The `source` field SHOULD use the `did:pkh` method
{{DID-PKH}} with the chain ID from the challenge and the
payer's Ethereum address. For
`authorization.type="delegation"`, `source` identifies the
smart account address (delegator). Clients MUST include
`source` when using `type="hash"` or
`authorization.type="delegation"`.

## Transaction Payload (type="transaction") {#transaction-payload}

The RECOMMENDED credential type. The client provides an
off-chain authorization and the server constructs and
submits the on-chain transaction, paying gas from its own
balance. The client never interacts with the chain
directly.

The authorization mechanism is selected via
`authorization.type`:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `type` | string | REQUIRED | `"transaction"` |
| `authorization` | object | REQUIRED | Authorization-specific payload, discriminated by `authorization.type` |

### EIP-3009 Authorization (authorization.type="eip-3009") {#eip3009-payload}

The RECOMMENDED authorization type. The client signs an
off-chain EIP-3009 `transferWithAuthorization` message.
The server constructs and submits the on-chain transaction,
paying gas from its own balance. The client never interacts
with the chain directly.

This authorization type requires that the token supports
EIP-3009. Clients MAY verify support by checking for the
`transferWithAuthorization` function via `eth_call` or
off-chain token registries.

#### Single Transfer (No Splits)

When no splits are present, the `authorization` object
contains:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `type` | string | REQUIRED | `"eip-3009"` |
| `from` | string | REQUIRED | Payer address |
| `to` | string | REQUIRED | Recipient address (= `request.recipient`) |
| `value` | string | REQUIRED | Transfer amount in base units (= `request.amount`). String encoding; server converts to uint256 |
| `validAfter` | string | REQUIRED | Unix timestamp in seconds (UTC), valid from. `"0"` = immediately valid. String encoding; server converts to uint256 |
| `validBefore` | string | REQUIRED | Unix timestamp in seconds (UTC), expires. MUST be >= the challenge `expires` auth-param converted to a Unix timestamp in seconds (UTC), to ensure the server has sufficient time to submit. String encoding; server converts to uint256 |
| `nonce` | string | REQUIRED | Random `bytes32` hex. EIP-3009 requires a unique nonce per authorizer within each token contract |
| `signature` | string | REQUIRED | EIP-712 signature in `[r \|\| s \|\| v]` format, 65 bytes hex (0x-prefixed, 132 hex chars). `r` is bytes 0-31, `s` is bytes 32-63, `v` is byte 64 (value 27 or 28). Compact (64-byte) signatures MUST NOT be used |

**EIP-712 {{EIP-712}} Signing Domain:**

~~~
TransferWithAuthorization(
  address from,
  address to,
  uint256 value,
  uint256 validAfter,
  uint256 validBefore,
  bytes32 nonce
)
~~~

The EIP-712 domain separator MUST include:

| Field | Value |
|-------|-------|
| `name` | Token contract's EIP-712 domain name |
| `version` | Token contract's EIP-712 domain version |
| `chainId` | EVM chain ID from `methodDetails.chainId` |
| `verifyingContract` | Token contract address (`currency`) |

If the token contract's EIP-712 domain includes a `salt`
field, clients MUST include it in the domain separator.
Clients SHOULD retrieve the domain separator fields via the
`eip712Domain()` function defined in EIP-5267 {{EIP-5267}},
or via a known token registry.

**Example (single transfer):**

~~~json
{
  "challenge": {
    "id": "kM9xPqWvT2nJrHsY4aDfEb",
    "realm": "api.example.com",
    "method": "evm",
    "intent": "charge",
    "request": "eyJ...",
    "expires": "2026-04-01T12:05:00Z"
  },
  "payload": {
    "type": "transaction",
    "authorization": {
      "type": "eip-3009",
      "from": "0x1234567890AbcdEF1234567890aBcdef12345678",
      "to": "0x742d35Cc6634c0532925a3b844bC9e7595F8fE00",
      "value": "1000000",
      "validAfter": "0",
      "validBefore": "1775059500",
      "nonce": "0x6d0f4fdf1f2f6a1f6c1b0fbd6a7d5c2c0a8d3d7b1f6a9c1b3e2d4a5b6c7d8e9f",
      "signature": "0xabcdef1234567890...65bytes"
    }
  },
  "source": "did:pkh:eip155:196:0x1234567890AbcdEF1234567890aBcdef12345678"
}
~~~

#### With Splits

When the challenge includes splits, the `authorization`
object retains the primary recipient fields and adds a
`splits` array for the additional recipients. The primary
recipient receives
`amount - sum(methodDetails.splits[].amount)`. Each split
entry carries its own independent EIP-3009 fields and
signature, corresponding to the challenge
`methodDetails.splits` entries in order.

The `authorization` object with splits adds:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `splits` | array | REQUIRED | Array of split authorization entries |

Each entry in the `authorization.splits` array:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `from` | string | REQUIRED | Payer address (MUST match primary `from`) |
| `to` | string | REQUIRED | Split recipient address |
| `value` | string | REQUIRED | Split transfer amount in base units |
| `validAfter` | string | REQUIRED | Unix timestamp (same semantics as primary) |
| `validBefore` | string | REQUIRED | Unix timestamp (same semantics as primary) |
| `nonce` | string | REQUIRED | Random `bytes32` hex (unique per split) |
| `signature` | string | REQUIRED | EIP-712 signature for this split transfer |

**Example (with splits):**

~~~json
{
  "challenge": {
    "id": "sP1itPaym3ntEx4mple",
    "realm": "marketplace.example.com",
    "method": "evm",
    "intent": "charge",
    "request": "eyJ...",
    "expires": "2026-04-01T12:05:00Z"
  },
  "payload": {
    "type": "transaction",
    "authorization": {
      "type": "eip-3009",
      "from": "0x1234...5678",
      "to": "0x742d35Cc6634c0532925a3b844bC9e7595F8fE00",
      "value": "940000",
      "validAfter": "0",
      "validBefore": "1775059500",
      "nonce": "0x1111...1111",
      "signature": "0xabc...primary",
      "splits": [
        {
          "from": "0x1234...5678",
          "to": "0xA1B2C3d4e5F6a1B2c3d4e5F6a1b2c3d4e5F6a1b2",
          "value": "50000",
          "validAfter": "0",
          "validBefore": "1775059500",
          "nonce": "0x2222...2222",
          "signature": "0xdef...split1"
        },
        {
          "from": "0x1234...5678",
          "to": "0xC4D5e6F7A8B9c4D5E6f7a8B9c4d5e6F7a8b9C4D5",
          "value": "10000",
          "validAfter": "0",
          "validBefore": "1775059500",
          "nonce": "0x3333...3333",
          "signature": "0xghi...split2"
        }
      ]
    }
  },
  "source": "did:pkh:eip155:196:0x1234...5678"
}
~~~

### Permit2 Authorization (authorization.type="permit2") {#permit2-payload}

The client signs an off-chain EIP-712 {{EIP-712}} Permit2
authorization message. The server constructs and submits
the on-chain transaction, paying gas from its own balance.

This authorization type requires that the Permit2 contract
is deployed on the target chain and that the client has an
active ERC-20 approval to the Permit2 contract (a one-time
operation per token per chain). Clients MUST NOT use
`authorization.type="permit2"` when `permit2Address` is
absent from the challenge.

The `authorization` object for Permit2:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `type` | string | REQUIRED | `"permit2"` |
| `permit` | object | REQUIRED | Permit2 permit data |
| `transferDetails` | array | REQUIRED | Array of transfer details |
| `witness` | object | REQUIRED | Challenge binding witness data |
| `signature` | string | REQUIRED | EIP-712 signature (`0x`-prefixed, 65 bytes hex) |

#### Permit Object

The `permit` object describes the token permissions:

| Field | Type | Description |
|-------|------|-------------|
| `permitted` | array | Array of `{ token, amount }` objects. One entry per transfer (primary + each split) |
| `nonce` | string | Permit2 nonce (stringified integer) |
| `deadline` | string | Unix timestamp (stringified integer) |

The `permitted` field MUST always be a JSON array, even
for single transfers (length 1). Clients MUST sign using
the appropriate Permit2 EIP-712 type for the number of
transfers (single vs. batch); see {{PERMIT2}} for the
corresponding type definitions.

Each entry specifies:

| Field | Type | Description |
|-------|------|-------------|
| `token` | string | ERC-20 token address (MUST match `currency`) |
| `amount` | string | Maximum transfer amount in base units |

#### Transfer Details

The `transferDetails` array MUST have the same length as
`permitted`. Each entry specifies:

| Field | Type | Description |
|-------|------|-------------|
| `to` | string | Recipient address |
| `requestedAmount` | string | Exact transfer amount in base units |

The first entry corresponds to the primary recipient.
Subsequent entries (if any) correspond to split recipients
in array order.

#### Witness Data (Challenge Binding) {#witness-data}

The Permit2 witness mechanism provides cryptographic
binding between the payment authorization and the
challenge. The client MUST include a `challengeHash` in
the EIP-712 witness struct. The server MUST verify the
witness matches before submitting the transaction.

The witness type is defined as:

~~~solidity
struct PaymentWitness {
    bytes32 challengeHash;
}
~~~

Where `challengeHash` is computed as:

~~~
challengeHash = keccak256(abi.encode(
    challenge.id,
    challenge.realm
))
~~~

This binds the Permit2 signature to the specific challenge
instance. The signature cannot be reused against a
different challenge, even if the payment parameters are
identical.

The witness type string for EIP-712 is:

~~~
PaymentWitness witness)
PaymentWitness(bytes32 challengeHash)
TokenPermissions(address token,uint256 amount)
~~~

(Shown on multiple lines for readability; the actual string
is a single line with no whitespace between components.)

This binding applies to both single and batch transfers —
the same witness type string is used in both cases.

#### EIP-712 Domain

The EIP-712 domain separator for Permit2 signatures MUST
include:

| Field | Value |
|-------|-------|
| `name` | `"Permit2"` |
| `chainId` | EVM chain ID from `methodDetails.chainId` |
| `verifyingContract` | Permit2 contract address (from `methodDetails.permit2Address`) |

#### Nonce Selection

Permit2 nonces are not sequential. The `nonce` is a
`uint256` that MUST NOT have been previously consumed on
the Permit2 contract. Each nonce can only be used once.
See {{PERMIT2}} for the nonce selection mechanism.

#### Server Behavior

For single transfers (no splits, `permitted` length 1),
the server calls `permitWitnessTransferFrom()` with the
single-transfer variant.

For batch transfers (with splits, `permitted` length > 1),
the server calls `permitWitnessTransferFrom()` with the
batch variant. This executes all transfers in a single
on-chain transaction — if any transfer fails, the entire
batch reverts.

The server pays gas from its own balance in both cases.
This is the natural fee sponsorship model for Permit2: the
client signs only the off-chain authorization and the
server handles all chain interaction.

#### Example: Single Transfer

~~~json
{
  "challenge": {
    "id": "kM9xPqWvT2nJrHsY4aDfEb",
    "realm": "api.example.com",
    "method": "evm",
    "intent": "charge",
    "request": "eyJ...",
    "expires": "2026-04-01T12:05:00Z"
  },
  "payload": {
    "type": "transaction",
    "authorization": {
      "type": "permit2",
      "permit": {
        "permitted": [
          {
            "token": "0xA8CE8aee21bC2A48a5EF670afCc9274C7bbbC035",
            "amount": "1000000"
          }
        ],
        "nonce": "1",
        "deadline": "1775059500"
      },
      "transferDetails": [
        {
          "to": "0x742d35Cc6634c0532925a3b844bC9e7595F8fE00",
          "requestedAmount": "1000000"
        }
      ],
      "witness": {
        "challengeHash": "0x8a3b...f1c2"
      },
      "signature": "0x1b2c3d4e5f..."
    }
  },
  "source": "did:pkh:eip155:196:0x1234...5678"
}
~~~

#### Example: Batch Transfer with Splits

~~~json
{
  "challenge": {
    "id": "sP1itBatchEx4mple",
    "realm": "marketplace.example.com",
    "method": "evm",
    "intent": "charge",
    "request": "eyJ...",
    "expires": "2026-04-01T12:05:00Z"
  },
  "payload": {
    "type": "transaction",
    "authorization": {
      "type": "permit2",
      "permit": {
        "permitted": [
          {
            "token": "0xA8CE8aee21bC2A48a5EF670afCc9274C7bbbC035",
            "amount": "950000"
          },
          {
            "token": "0xA8CE8aee21bC2A48a5EF670afCc9274C7bbbC035",
            "amount": "50000"
          }
        ],
        "nonce": "2",
        "deadline": "1775059500"
      },
      "transferDetails": [
        {
          "to": "0x742d35Cc6634c0532925a3b844bC9e7595F8fE00",
          "requestedAmount": "950000"
        },
        {
          "to": "0xA1B2C3d4e5F6a1B2c3d4e5F6a1b2c3d4e5F6a1b2",
          "requestedAmount": "50000"
        }
      ],
      "witness": {
        "challengeHash": "0x7d4e...a3b9"
      },
      "signature": "0x9a8b7c6d5e..."
    }
  },
  "source": "did:pkh:eip155:196:0x1234...5678"
}
~~~

This transfers 0.95 USDC to the primary recipient and
0.05 USDC to the platform — atomically, in a single
transaction. The client signs one EIP-712 message covering
both transfers.

### Delegation Authorization (authorization.type="delegation") {#delegation-payload}

The client provides an ERC-7710 {{ERC-7710}} delegation
that authorizes the server to execute token transfers from
the client's smart account. The server redeems the
delegation on-chain via the delegation manager contract,
paying gas from its own balance.

This authorization type requires that the client's account
supports ERC-7710 delegation. This includes ERC-4337 smart
accounts with ERC-7710 modules, EIP-7702 EOAs that have
delegated to an ERC-7710-compatible implementation, and any
other smart account supporting the ERC-7710 interface.

The `authorization` object for delegation:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `type` | string | REQUIRED | `"delegation"` |
| `delegationManager` | string | REQUIRED | ERC-7710 delegation manager contract address (EIP-55 checksummed) |
| `permissionContexts` | array | REQUIRED | Array of delegation proof bytes (`0x`-prefixed hex strings). The structure is opaque to this specification and interpreted by the delegation manager |
| `mode` | string | REQUIRED | ERC-7579 {{ERC-7579}} execution mode (`0x`-prefixed, `bytes32` hex). Common values: `0x0000...0000` for single call, `0x0100...0000` for batch |

#### Delegation Flow

1. The client creates a delegation authorizing the server
   (or a designated facilitator address) to execute ERC-20
   token transfers from the client's smart account.
2. The delegation MAY include caveats that constrain the
   authorization — for example, limiting the token address,
   maximum transfer amount, recipient set, or expiry time.
3. The client encodes the delegation proof into
   `permissionContexts` and submits the credential.
4. The server constructs the execution calldata
   (ERC-20 `transfer` calls for the primary recipient and
   any splits) and calls `redeemDelegations()` on the
   delegation manager.

#### Server Behavior

The server constructs the execution calldata based on the
challenge parameters:

- For single transfers: a single ERC-20 `transfer(to, amount)`
  call targeting the `recipient` for the full `amount`.
- For splits: a batch of ERC-20 `transfer` calls — one for
  the primary recipient (remainder amount) and one for each
  split recipient. The `mode` MUST be set to batch execution.

The server calls `redeemDelegations()` on the
`delegationManager` contract:

~~~solidity
delegationManager.redeemDelegations(
    permissionContexts,  // from credential
    modes,               // [mode] from credential
    executionCallDatas   // constructed by server
)
~~~

The delegation manager validates the delegation authority,
enforces any caveats, and calls back into the client's
smart account to execute the token transfers.

#### Nonce and Replay Protection

Delegation replay protection depends on the delegation
manager implementation. Common approaches include:

- **Single-use delegations**: The delegation is invalidated
  after one redemption. The delegation manager tracks
  consumed delegation hashes on-chain.
- **Nonce-based delegations**: The delegation includes a
  nonce that is consumed on-chain upon redemption.
- **Caveat-enforced limits**: Caveats may restrict the
  delegation to a maximum cumulative transfer amount,
  effectively preventing replay after the limit is reached.

Servers MUST verify via simulation that the delegation is
still redeemable before submitting the on-chain transaction.

#### Example

~~~json
{
  "challenge": {
    "id": "dLg7710SmartAcct01",
    "realm": "api.example.com",
    "method": "evm",
    "intent": "charge",
    "request": "eyJ...",
    "expires": "2026-04-01T12:05:00Z"
  },
  "payload": {
    "type": "transaction",
    "authorization": {
      "type": "delegation",
      "delegationManager": "0xDb21655b8eB51BEaD4b1B3e19F46fd959f407392",
      "permissionContexts": [
        "0xabcdef1234...delegationProofBytes"
      ],
      "mode": "0x0000000000000000000000000000000000000000000000000000000000000000"
    }
  },
  "source": "did:pkh:eip155:196:0xSmartAccount1234567890abcdef12345678"
}
~~~

## Hash Payload (type="hash") {#hash-payload}

Fallback for clients that broadcast transactions themselves.
This covers cases where none of the `type="transaction"`
authorization mechanisms are feasible — for example,
custodial wallets, hardware signers, or tokens without
EIP-3009 support on chains without Permit2 or ERC-7710.
The client broadcasts a transaction that produces the
required on-chain payment effects and presents the
confirmed hash.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `type` | string | REQUIRED | `"hash"` |
| `hash` | string | REQUIRED | Transaction hash (`0x`-prefixed, 32 bytes hex) |

Constraints:

- Clients MUST NOT use `type="hash"` when
  `methodDetails.feePayer` is `true`. Servers MUST reject
  such credentials.
- Clients MUST include `source` when using `type="hash"`.
- The client pays gas.
- The server cannot modify or retry the transaction.
- Weaker challenge binding than `type="transaction"` (see
  {{hash-binding}}).
- When `splits` are present, `type="hash"` requires an
  execution environment that can perform all transfers
  atomically in one on-chain transaction, such as an
  ERC-4337 account or a chain-local batch contract. EOA
  clients that need split support SHOULD use
  `type="transaction"` with
  `authorization.type="delegation"` via EIP-7702
  {{EIP-7702}} instead (see {{delegation-payload}}).
  If no such mechanism is available, clients MUST reject
  the challenge.

**Example:**

~~~json
{
  "challenge": {
    "id": "kM9xPqWvT2nJrHsY4aDfEb",
    "realm": "api.example.com",
    "method": "evm",
    "intent": "charge",
    "request": "eyJ...",
    "expires": "2026-04-01T12:05:00Z"
  },
  "payload": {
    "hash": "0x1a2b3c4d5e6f7890abcdef1234567890abcdef1234567890abcdef1234567890",
    "type": "hash"
  },
  "source": "did:pkh:eip155:196:0x1234567890AbcdEF1234567890aBcdef12345678"
}
~~~

# Fee Payment

The `feePayer` field in `methodDetails` determines who pays
transaction gas.

## Server-Paid Fees (feePayer: true)

When `feePayer: true`:

1. **Client signs authorization**: The client signs
   EIP-712 typed data — the specific format depends on
   `authorization.type` (EIP-3009, Permit2, or ERC-7710
   delegation). No gas is required from the client.

2. **Server submits on-chain**: For
   `authorization.type="permit2"`, the server submits the
   authorization to the Permit2 contract. For
   `authorization.type="eip-3009"`, the server calls
   `transferWithAuthorization(...)` on the token
   contract. For `authorization.type="delegation"`, the
   server calls `redeemDelegations()` on the delegation
   manager. In all cases the server pays gas from its
   own EOA.

3. **For splits**: With `authorization.type="permit2"`,
   all transfers execute atomically in a single Permit2
   transaction. With `authorization.type="eip-3009"`,
   the server batches `transferWithAuthorization` calls
   in a single transaction. With
   `authorization.type="delegation"`, the server
   constructs batch execution calldata covering all
   recipients.

Note: `authorization.type="permit2"` and
`authorization.type="delegation"` inherently require the
server to submit the on-chain transaction. When a client
uses these authorization types with `feePayer: false`, the
server still pays gas. The `feePayer` field constrains only
the advertised intent; gas sponsorship is structural for
these authorization types.

## Client-Paid Fees (feePayer: false)

When `feePayer: false` or omitted:

- **EOA clients**: Client constructs and broadcasts an
  ERC-20 `transfer` transaction directly, paying gas from
  their own balance. For splits, the client needs a
  chain-local batch contract; otherwise `type="hash"` is
  only interoperable for single-recipient payments.
- **Smart Wallet clients**: Client batches transfers in a
  UserOperation (ERC-4337 {{ERC-4337}}). A Paymaster MAY
  sponsor gas on behalf of the client.

## Server Requirements

When acting as fee payer:

- MUST maintain sufficient native token balance to pay gas
- MUST verify the authorization parameters match the
  challenge before submitting
- MAY recover fee costs through pricing or other business
  logic
- MUST simulate via `eth_call` before submitting to
  detect failures without spending gas. If simulation
  fails, the server MUST NOT submit the transaction and
  SHOULD return a 402 response

## Client Requirements

- When `feePayer: true`: Clients MUST sign the required
  authorization payload (Permit2, EIP-3009, or ERC-7710
  delegation) with all required parameters. Clients MUST
  NOT broadcast any on-chain transaction.
- When `feePayer: false` or omitted: Clients MAY use any
  supported credential type. For `type="hash"`, clients
  MUST construct and broadcast a valid ERC-20 `transfer`
  transaction and have sufficient balance for both the
  transfer amount and gas fees.

# Verification Procedure {#verification}

Upon receiving a request with a credential, the server MUST:

1. Decode the base64url credential and parse the JSON.
2. Verify that `payload.type` is present and is one of
   `"transaction"` or `"hash"`.
3. Look up the stored challenge using
   `credential.challenge.id`. If no matching challenge is
   found, reject the request.
4. Verify that all fields in `credential.challenge` exactly
   match the stored challenge auth-params.
5. Proceed with type-specific verification:
    - For `type="transaction"`: verify that
      `authorization.type` is present and is one of
      `"eip-3009"`, `"permit2"`, or `"delegation"`.
      Then proceed with authorization-type-specific
      verification:
        - For `authorization.type="eip-3009"`: see
          {{eip3009-verification}}.
        - For `authorization.type="permit2"`: see
          {{permit2-verification}}.
        - For `authorization.type="delegation"`: see
          {{delegation-verification}}.
    - For `type="hash"`: see {{hash-verification}}.

## EIP-3009 Verification {#eip3009-verification}

Before submitting, servers MUST verify:

### Single Transfer (no `authorization.splits` array)

1. Verify `authorization.type` is `"eip-3009"`
2. If `source` is present, verify it identifies the same
   payer address as `authorization.from`
3. Verify `authorization.to` matches `request.recipient`
4. Verify `authorization.value` matches `request.amount`
5. Verify `authorization.validBefore` has not passed
6. Verify `authorization.validAfter` has passed (current
   time > `validAfter`). The token contract enforces this
   on-chain, but checking server-side avoids wasting gas
   on a transaction that would revert
7. Recover the EIP-712 signer from
   `authorization.signature` and verify it matches
   `authorization.from`
8. Call `transferWithAuthorization(from, to, value,
   validAfter, validBefore, nonce, v, r, s)` on the
   `currency` token contract
9. Verify the transaction receipt indicates success
10. Verify `Transfer` event log matches expected parameters

### With Splits (`authorization.splits` array present)

1. Verify the primary `authorization` fields using steps
   1-3 and 5-7 from the single transfer path
2. Verify `authorization.value` matches
   `amount - sum(methodDetails.splits[].amount)` (replaces
   single-transfer step 4)
3. Verify the number of `authorization.splits` entries
   equals the number of challenge `methodDetails.splits`
4. For each `authorization.splits[i]`, verify
   `splits[i].to` matches
   `methodDetails.splits[i].recipient` and
   `splits[i].value` matches
   `methodDetails.splits[i].amount`
5. For each `authorization.splits[i]`:
    - Verify `from` matches the primary
      `authorization.from` (all transfers MUST originate
      from the same payer)
    - If `source` is present, verify it identifies the same
      payer address as `authorization.from`
    - Verify `validBefore` has not passed
    - Recover the EIP-712 signer from `signature` and
      verify it matches `authorization.from`
6. Batch all `transferWithAuthorization` calls (primary +
   splits) in a single on-chain transaction. Because EVM
   transactions are atomic, if any individual
   `transferWithAuthorization` call reverts, the entire
   batch reverts — partial settlement is not possible
7. Verify the transaction receipt and all `Transfer` events

Servers MUST simulate the transaction via `eth_call`
before submitting to detect failures without spending gas.
If simulation fails, the server MUST NOT submit the
transaction and SHOULD return a 402 response.

## Permit2 Verification {#permit2-verification}

The server MUST use the Permit2 contract address from
`methodDetails.permit2Address`. Servers MUST verify that
the address corresponds to a legitimate Permit2 deployment
on the target chain.

Before submitting, servers MUST verify:

1. The EIP-712 signature is valid and recovers to the
   `source` address (if present), or to a valid signer
   if `source` is omitted
2. The `deadline` has not passed
3. The signer has sufficient token balance for the total
   amount (primary + all splits)
4. The signer has sufficient Permit2 allowance
5. The `witness.challengeHash` matches the expected value
   derived from the challenge `id` and `realm`
6. `permitted` and `transferDetails` arrays have equal
   length
7. Each `permitted[i].token` matches `currency`
8. `transferDetails[0].to` matches `recipient`
9. `transferDetails[0].requestedAmount` matches the primary
   transfer amount (`amount` minus sum of splits, or
   `amount` if no splits)
10. For each split at index i (if present),
    `transferDetails[i+1].to` matches
    `methodDetails.splits[i].recipient` and
    `transferDetails[i+1].requestedAmount` matches
    `methodDetails.splits[i].amount`

After verification:

11. Call `permitWitnessTransferFrom()` on the Permit2
    contract with the appropriate variant for the
    transfer count (single or batch)
12. Verify the transaction receipt indicates success
13. Verify `Transfer` event logs match all expected
    transfers

Servers MUST simulate the transaction via `eth_call`
before submitting to detect failures without spending gas.
If simulation fails, the server MUST NOT submit the
transaction and SHOULD return a 402 response.

## Delegation Verification {#delegation-verification}

Before submitting, servers MUST verify:

1. Verify `source` is present and identifies a smart account
   address
2. Verify `authorization.delegationManager` is a known and
   legitimate ERC-7710 delegation manager deployment on the
   target chain
3. Verify `authorization.mode` is a valid ERC-7579
   execution mode
4. Construct the execution calldata based on the challenge:
    - For single transfers: encode
      `transfer(recipient, amount)` on the `currency` token
    - For splits: encode a batch of `transfer` calls — one
      for the primary recipient (remainder amount) and one
      for each split recipient
5. Simulate the `redeemDelegations()` call via `eth_call`
   with the provided `permissionContexts`, `mode`, and
   constructed execution calldata. If simulation fails,
   the server MUST NOT submit the transaction and SHOULD
   return a 402 response
6. Submit the `redeemDelegations()` call on-chain
7. Verify the transaction receipt indicates success
8. Verify `Transfer` event logs match all expected transfers
   (primary + splits)

## Hash Verification {#hash-verification}

For hash credentials, servers MUST:

1. Verify `methodDetails.feePayer` is `false` or absent.
   Reject the credential if `feePayer` is `true`.
2. Verify `payload.hash` has not been previously consumed
   (see {{replay-protection}})
3. Fetch the transaction receipt via
   `eth_getTransactionReceipt` from an RPC node connected
   to the chain identified by `methodDetails.chainId`
4. Verify `status` is `0x1` (success)
5. Verify `source` is present and that the address it
   identifies matches the `from` parameter in the on-chain
   `Transfer` event logs. Note: for smart wallets (e.g.,
   ERC-4337), `source` identifies the wallet contract
   address that holds and transfers the tokens, not the
   EOA signer that initiated the UserOperation
6. Verify the receipt contains the payment effects expected by
   the challenge. Match ERC-20 `Transfer` events by topic
   `0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef`:
    - Log `address` matches `currency`
    - `from` parameter matches the `source` address
    - `to` parameter matches `recipient`
    - `value` parameter matches expected amount
7. If splits are present, verify payment effects for each split
   recipient with matching amounts
8. Mark the hash as consumed

# Settlement Procedure

## Transaction Settlement (type="transaction")

Settlement varies by `authorization.type`.

### EIP-3009 Settlement (authorization.type="eip-3009")

~~~
Client                  Server               EVM Chain
  |                        |                      |
  | (1) Authorization:     |                      |
  |     Payment <cred>     |                      |
  |  (EIP-3009 authz)      |                      |
  |----------------------->|                      |
  |                        | (2) Verify params    |
  |                        | (3) Call transfer-   |
  |                        |  WithAuthorization() |
  |                        |--------------------->|
  |                        | (4) Receipt          |
  |                        |<---------------------|
  | (5) 200 OK + Receipt   |                      |
  |<-----------------------|                      |
~~~

For single transfers, the server calls
`transferWithAuthorization()` once. When splits are present,
the server batches multiple `transferWithAuthorization()`
calls in a single transaction.

### Permit2 Settlement (authorization.type="permit2")

~~~
Client                  Server               EVM Chain
  |                        |                      |
  | (1) Authorization:     |                      |
  |     Payment <cred>     |                      |
  |  (Permit2 signature)   |                      |
  |----------------------->|                      |
  |                        | (2) Verify sig       |
  |                        | (3) Submit permit-   |
  |                        |  WitnessTransfer-    |
  |                        |  From()              |
  |                        |--------------------->|
  |                        | (4) Receipt          |
  |                        |  (all transfers      |
  |                        |   atomic in 1 tx)    |
  |                        |<---------------------|
  | (5) 200 OK + Receipt   |                      |
  |<-----------------------|                      |
~~~

The server calls `permitWitnessTransferFrom()` on the
Permit2 contract. When splits are present, all transfers
execute atomically in a single transaction.

### Delegation Settlement (authorization.type="delegation")

~~~
Client                  Server               EVM Chain
  |                        |                      |
  | (1) Authorization:     |                      |
  |     Payment <cred>     |                      |
  |  (ERC-7710 delegation) |                      |
  |----------------------->|                      |
  |                        | (2) Construct        |
  |                        |  execution calldata  |
  |                        | (3) Call redeem-     |
  |                        |  Delegations()       |
  |                        |--------------------->|
  |                        | (4) Delegation Mgr   |
  |                        |  validates & calls   |
  |                        |  smart account       |
  |                        | (5) Receipt          |
  |                        |  (transfers execute  |
  |                        |   within account)    |
  |                        |<---------------------|
  | (6) 200 OK + Receipt   |                      |
  |<-----------------------|                      |
~~~

The server constructs the execution calldata from the
challenge parameters and redeems the delegation. The
delegation manager validates the delegation authority,
enforces caveats, and calls back into the client's smart
account to execute the token transfers. For splits, the
server constructs batch execution calldata covering all
recipients atomically.

## Hash Settlement

~~~
Client                  Server               EVM Chain
  |                        |                      |
  | (1) Broadcast tx       |                      |
  |---------------------------------------------->|
  | (2) Confirmed          |                      |
  |<----------------------------------------------|
  |                        |                      |
  | (3) Authorization:     |                      |
  |     Payment <cred>     |                      |
  |  (tx hash)             |                      |
  |----------------------->|                      |
  |                        | (4) getTransaction-  |
  |                        |     Receipt          |
  |                        |--------------------->|
  |                        | (5) Verify           |
  |                        |<---------------------|
  | (6) 200 OK + Receipt   |                      |
  |<-----------------------|                      |
~~~

## Confirmation Requirements

Servers MUST wait for a successful transaction receipt
(i.e., the transaction has been included in at least one
block) before returning a `Payment-Receipt` header.

Confirmation depth is a server policy decision. Recommended
guidelines:

| Chain | Recommended Confirmations | Finality Time | Notes |
|-------|--------------------------|---------------|-------|
| X Layer | 1 block | ~2s | L2 sequencer ordering, low reorg risk |
| Base / Optimism / Arbitrum | 1 block | ~2s | L2 sequencer ordering, low reorg risk |
| Ethereum | 12 blocks | ~2.4min | Probabilistic finality; 2 epochs (~13 min) for economic finality via Casper FFG |
| Polygon PoS | 64 blocks | ~2.1min | Per Polygon documentation (~2s block time) |

Servers SHOULD use fewer confirmations for low-value
transactions (e.g., < 10 USDC at 1 confirmation) and more
for high-value transactions. Servers SHOULD include the
`confirmations` count in the receipt.

## Receipt Generation

Upon successful settlement, servers MUST return a
`Payment-Receipt` header per {{I-D.httpauth-payment}}.
Servers MUST NOT include a `Payment-Receipt` header on error
responses; failures are communicated via HTTP status codes
and Problem Details {{RFC9457}}.

The receipt payload:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `method` | string | REQUIRED | `"evm"` |
| `reference` | string | REQUIRED | Transaction hash (`0x`-prefixed) |
| `status` | string | REQUIRED | `"success"` |
| `timestamp` | string | REQUIRED | {{RFC3339}} settlement time |
| `chainId` | number | REQUIRED | Chain ID where settlement occurred |
| `confirmations` | number | OPTIONAL | Number of block confirmations at settlement time |
| `challengeId` | string | OPTIONAL | The challenge `id` for client correlation |
| `externalId` | string | OPTIONAL | Echoed from the challenge request |

# Replay Protection {#replay-protection}

Servers MUST maintain a set of consumed credential
identifiers. The replay prevention token depends on the
credential type:

- **`authorization.type="eip-3009"`**: The EIP-3009 nonce
  is consumed on-chain by the token contract. The nonce
  is unique per (from, token) pair. Even if the same
  authorization is submitted to two servers, only the first
  `transferWithAuthorization` call succeeds; the second
  reverts.
- **`authorization.type="permit2"`**: The combination of
  signer address and Permit2 nonce serves as the replay
  token. The nonce is consumed on-chain by the Permit2
  contract.
- **`authorization.type="delegation"` (ERC-7710)**: Replay
  protection depends on the delegation manager
  implementation. For single-use delegations, the
  delegation hash is consumed on-chain upon redemption.
  For nonce-based delegations, the nonce is consumed
  on-chain. Servers MUST verify via simulation
  (`eth_call`) that the delegation is still redeemable
  before submitting. After successful on-chain redemption,
  the delegation manager's state change prevents replay.
- **`type="hash"`**: The transaction hash provided by the
  client. Servers MUST maintain a global txHash
  de-duplication table. The same txHash MUST NOT be accepted
  for two different challenges. This prevents a client from
  using one on-chain transfer to pay two merchants.

Before accepting a credential, the server MUST check whether
its replay token has already been consumed. After successful
verification, the server MUST atomically mark it as consumed.

# Error Responses

Servers SHOULD include `Cache-Control: no-store` on all
402 responses to prevent caching of payment challenges.

When rejecting a credential, the server MUST return HTTP 402
(Payment Required) with a fresh `WWW-Authenticate: Payment`
challenge per {{I-D.httpauth-payment}}. The server SHOULD
include a response body conforming to Problem Details
{{RFC9457}} with `Content-Type: application/problem+json`.

Servers MUST use the standard problem types defined in
{{I-D.httpauth-payment}}: `malformed-credential`,
`invalid-challenge`, and `verification-failed`. The `detail`
field SHOULD contain a human-readable description of the
specific failure.

Example:

~~~json
{
  "type": "https://paymentauth.org/problems/verification-failed",
  "title": "Transfer Mismatch",
  "status": 402,
  "detail": "Transfer amount does not match challenge request"
}
~~~

# Security Considerations

## Transport Security

All communication MUST use TLS 1.2 or higher per
{{I-D.httpauth-payment}}. Credentials MUST only be
transmitted over HTTPS connections.

## Transaction Replay

### Same-Server Replay

The challenge `id` is a server-generated unique identifier
that is single-use. Servers mark consumed challenges,
preventing the same credential from being replayed.

### Cross-Server Replay

The challenge `realm` binds to the server's domain. The
challenge `id` is generated from a server-specific secret,
making it invalid on other servers. If multiple server
instances share an HMAC secret (e.g., same organization),
additional server identification SHOULD be included.

### Permit2 Nonce Replay

The Permit2 contract enforces nonce uniqueness on-chain.
Once a nonce is consumed, it cannot be reused. This
provides contract-level replay protection for
`authorization.type="permit2"` credentials.

### EIP-3009 Nonce Replay

The ERC-20 contract enforces per-nonce uniqueness via
`authorizationState(from, nonce)`. Once consumed, a nonce
cannot be reused. This provides contract-level replay
protection for `authorization.type="eip-3009"` credentials.

### Cross-Chain Replay

The EIP-712 domain separator includes `chainId`, making
signatures invalid on other chains. This is enforced by
the EIP-712 standard. This applies to
`authorization.type="permit2"` and
`authorization.type="eip-3009"` credentials. For
`authorization.type="delegation"` credentials, cross-chain
replay is prevented by the delegation manager contract
being deployed per-chain — a delegation created on one
chain cannot be redeemed on another.

## Amount Verification

Clients MUST parse and verify the `request` payload before
signing:

1. Verify `amount` is reasonable for the service
2. Verify `currency` is the expected token address
3. Verify `recipient` is controlled by the expected party
4. Verify `chainId` matches the expected network
5. If `splits` are present, verify the sum of split amounts
   is strictly less than `amount` and all split recipients
   are expected

## Hash Credential Binding {#hash-binding}

Hash credentials (`type="hash"`) provide weaker challenge
binding than other credential types. The server verifies
that a payment matching the challenge terms exists on-chain,
but cannot prove the payment was created specifically for
this challenge.

By contrast, `authorization.type="eip-3009"` credentials
include an EIP-3009 nonce that is consumed on-chain,
binding the authorization to a single execution. While the
nonce does not cryptographically bind to the challenge
`id`, the server's verification of authorization parameters
against the challenge provides strong binding.

`authorization.type="permit2"` credentials include a
`challengeHash` in the EIP-712 witness data,
cryptographically binding the signature to the specific
challenge `id` and `realm`. This prevents signature reuse
across challenges, even if payment parameters are
identical.

`authorization.type="delegation"` credentials bind through
the delegation manager's caveat enforcement and single-use
semantics. While delegations do not cryptographically bind
to the challenge `id`, single-use delegations are consumed
on-chain upon redemption, preventing reuse. Clients SHOULD
use single-use delegations or narrow caveats to minimize
the window for misuse.

## Reorg Risk

If a server grants access based on a confirmed transaction
that is later removed by a chain reorganization, the server
bears the loss. Mitigations:

- Use higher confirmation depths for high-value transactions
- Prefer `type="transaction"` where the server controls
  submission timing and gas strategy
- For L2 rollups, consider the L1 settlement finality

## Permit2-Specific Risks

**Allowance Prerequisite**: Permit2 requires a one-time
ERC-20 `approve()` to the Permit2 contract. Clients should
understand they are granting approval to a third-party
contract. The Permit2 contract is widely deployed and
audited, but clients SHOULD verify that the
`methodDetails.permit2Address` matches a known legitimate
Permit2 deployment for the target chain.

**Nonce Management**: Permit2 nonces are consumed on-chain.
If a server fails to submit a Permit2 credential, the nonce
remains unconsumed and the client can reuse it. Servers
MUST handle nonce conflicts gracefully.

## Delegation-Specific Risks

**Delegation Manager Trust**: The `delegationManager`
address in the credential is provided by the client.
Servers MUST verify that it corresponds to a known and
trusted ERC-7710 delegation manager deployment on the
target chain. A malicious delegation manager could
execute arbitrary logic when `redeemDelegations()` is
called.

**Caveat Enforcement**: Delegation caveats constrain what
the delegation manager can execute on behalf of the
delegator. Clients SHOULD use narrow caveats that limit
the delegation to the specific token, amount, and
recipient(s) required by the challenge. Over-broad
delegations (e.g., unlimited amount, any token) expose
the client to risk if the server or delegation manager
is compromised.

**Delegation Revocation**: Clients SHOULD be able to
revoke outstanding delegations. The revocation mechanism
depends on the delegation manager implementation.
Servers SHOULD NOT assume a delegation remains valid
indefinitely — always verify via simulation before
submitting.

**EIP-7702 Considerations**: When an EOA uses EIP-7702
to delegate to a smart account implementation, the
delegation is temporary and tied to the EOA's current
code designation. If the EOA changes its code
designation, previously issued delegations may become
invalid. Servers MUST simulate before submitting.

## Split Payment Risks

**Recipient Transparency**: Where a human approval step
exists, clients SHOULD present each split recipient and
amount so the user can verify the payment distribution.
Clients SHOULD highlight when the primary recipient receives
a small remainder relative to the total `amount`.

**Batch Failure**: With Permit2 batch transfers, splits are
atomic — all succeed or all revert. A failure in any split
causes the entire payment (including the primary transfer)
to revert. Servers SHOULD simulate the batch via `eth_call`
before submitting to detect failures early.

**Gas Overhead**: Each additional
`transferWithAuthorization` call in a batch adds gas when
using `authorization.type="eip-3009"`. Servers sponsoring
fees via
`feePayer: true` MUST budget for the increased gas limit.

**Split Count Bound**: Servers SHOULD reject challenges with
more than 10 splits.

## Fee Payer Risks

Servers acting as fee payers (via `type="transaction"` with
`feePayer: true`) accept financial risk:

**Denial of Service**: Malicious clients could submit
valid-looking authorizations that fail on-chain, causing the
server to pay gas without receiving payment. Mitigations:

- Simulate transactions via `eth_call` before broadcast
  (MUST)
- Rate limit per client address and IP
- Verify client token balance before submitting
- Require client authentication before accepting
  credentials

**Balance Exhaustion**: Servers MUST monitor their native
token balance and reject new requests when insufficient to
cover gas.

Gas costs vary significantly across EVM chains. On low-fee
chains (X Layer, Base), fee sponsorship is negligible
(<$0.001/tx). On Ethereum L1, gas costs may be significant
and servers SHOULD factor this into pricing.

## RPC Trust

Servers rely on their RPC endpoint for transaction data. A
compromised RPC could return fabricated data. Servers SHOULD
use trusted RPC providers or run their own nodes.

# IANA Considerations

## Payment Method Registration

This document registers the following payment method in the
"HTTP Payment Methods" registry established by
{{I-D.httpauth-payment}}:

| Method Identifier | Description | Reference |
|-------------------|-------------|-----------|
| `evm` | EVM-compatible blockchain ERC-20 token transfer | This document |

Contact: OKX (<xin.tian@okg.com>)

## Payment Intent Registration

This document registers the following payment intent in the
"HTTP Payment Intents" registry established by
{{I-D.httpauth-payment}}:

| Intent | Applicable Methods | Description | Reference |
|--------|-------------------|-------------|-----------|
| `charge` | `evm` | One-time ERC-20 token transfer on any EVM chain | This document |

--- back

# ABNF Collected

~~~ abnf
; Productions not defined here are per RFC 9110

evm-charge-challenge = "Payment" 1*SP
  "id=" quoted-string ","
  "realm=" quoted-string ","
  "method=" DQUOTE "evm" DQUOTE ","
  "intent=" DQUOTE "charge" DQUOTE ","
  "request=" base64url-nopad ","
  "expires=" quoted-string

evm-charge-credential = "Payment" 1*SP base64url-nopad

; Base64url encoding without padding per RFC 4648 Section 5
base64url-nopad = 1*( ALPHA / DIGIT / "-" / "_" )
~~~

# Full Example: EIP-3009 Transaction Charge on X Layer

**1. Challenge (402 response):**

~~~http
HTTP/1.1 402 Payment Required
WWW-Authenticate: Payment id="kM9xPqWvT2nJrHsY4aDfEb",
  realm="api.example.com",
  method="evm",
  intent="charge",
  request="eyJhbW91bnQiOiIxMDAwMDAwIiwiY3VycmVuY3kiOiIw
    eEE4Q0U4YWVlMjFiQzJBNDhhNUVGNjcwYWZDYzkyNzRDN2Ji
    YkMwMzUiLCJtZXRob2REZXRhaWxzIjp7ImNoYWluSWQiOjE5
    NiwiZmVlUGF5ZXIiOnRydWUsInBlcm1pdDJBZGRyZXNzIjoi
    MHgwMDAwMDAwMDAwMjJENDczMDMwRjExNmRERUU5RjZCNDNh
    Qzc4QkEzIn0sInJlY2lwaWVudCI6IjB4NzQyZDM1Q2M2NjM0
    YzA1MzI5MjVhM2I4NDRiQzllNzU5NUY4ZkUwMCJ9",
  expires="2026-04-01T12:05:00Z"
Cache-Control: no-store
~~~

Decoded `request`:

~~~json
{
  "amount": "1000000",
  "currency": "0xA8CE8aee21bC2A48a5EF670afCc9274C7bbbC035",
  "recipient": "0x742d35Cc6634c0532925a3b844bC9e7595F8fE00",
  "methodDetails": {
    "chainId": 196,
    "feePayer": true,
    "permit2Address": "0x000000000022D473030F116dDEE9F6B43aC78BA3"
  }
}
~~~

This requests 1.00 USDC (1,000,000 base units) on X Layer
(chain 196).

**2. Credential (EIP-3009 authorization):**

~~~http
GET /api/resource HTTP/1.1
Host: api.example.com
Authorization: Payment <base64url-encoded credential>
~~~

Decoded credential:

~~~json
{
  "challenge": {
    "id": "kM9xPqWvT2nJrHsY4aDfEb",
    "realm": "api.example.com",
    "method": "evm",
    "intent": "charge",
    "request": "eyJ...",
    "expires": "2026-04-01T12:05:00Z"
  },
  "payload": {
    "type": "transaction",
    "authorization": {
      "type": "eip-3009",
      "from": "0x1234567890AbcdEF1234567890aBcdef12345678",
      "to": "0x742d35Cc6634c0532925a3b844bC9e7595F8fE00",
      "value": "1000000",
      "validAfter": "0",
      "validBefore": "1775059500",
      "nonce": "0x6d0f4fdf1f2f6a1f6c1b0fbd6a7d5c2c0a8d3d7b1f6a9c1b3e2d4a5b6c7d8e9f",
      "signature": "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef12345678901b"
    }
  },
  "source": "did:pkh:eip155:196:0x1234567890AbcdEF1234567890aBcdef12345678"
}
~~~

**3. Receipt:**

~~~http
HTTP/1.1 200 OK
Payment-Receipt: eyJ...base64url-encoded receipt...
Content-Type: application/json
~~~

Decoded receipt:

~~~json
{
  "method": "evm",
  "reference": "0x9f8e7d6c5b4a39281700abcdef1234567890abcdef1234567890abcdef123456",
  "status": "success",
  "timestamp": "2026-04-01T12:01:30Z",
  "chainId": 196,
  "challengeId": "kM9xPqWvT2nJrHsY4aDfEb"
}
~~~

# Split Payment Example

**Challenge with splits:**

~~~http
HTTP/1.1 402 Payment Required
WWW-Authenticate: Payment id="sP1itPaym3ntEx4mple",
  realm="marketplace.example.com",
  method="evm",
  intent="charge",
  request="eyJ...",
  expires="2026-04-01T12:05:00Z"
Cache-Control: no-store
~~~

Decoded `request`:

~~~json
{
  "amount": "1000000",
  "currency": "0xA8CE8aee21bC2A48a5EF670afCc9274C7bbbC035",
  "recipient": "0x742d35Cc6634c0532925a3b844bC9e7595F8fE00",
  "methodDetails": {
    "chainId": 196,
    "feePayer": true,
    "permit2Address": "0x000000000022D473030F116dDEE9F6B43aC78BA3",
    "splits": [
      {
        "amount": "50000",
        "recipient": "0xA1B2C3d4e5F6a1B2c3d4e5F6a1b2c3d4e5F6a1b2"
      }
    ]
  }
}
~~~

This requests 1.00 USDC total. The platform receives 0.05
USDC and the merchant receives 0.95 USDC. The resulting
transaction must emit the following Transfer events:

1. 950,000 to `0x742d...fE00` — merchant receives remainder
2. 50,000 to `0xA1B2...A1B2` — platform fee

**Credential response:**

~~~json
{
  "challenge": {
    "id": "sP1itPaym3ntEx4mple",
    "realm": "marketplace.example.com",
    "method": "evm",
    "intent": "charge",
    "request": "eyJ...",
    "expires": "2026-04-01T12:05:00Z"
  },
  "payload": {
    "type": "transaction",
    "authorization": {
      "type": "eip-3009",
      "from": "0x1234567890AbcdEF1234567890aBcdef12345678",
      "to": "0x742d35Cc6634c0532925a3b844bC9e7595F8fE00",
      "value": "950000",
      "validAfter": "0",
      "validBefore": "1775059500",
      "nonce": "0xaaaa...aaaa",
      "signature": "0xabc...merchant",
      "splits": [
        {
          "from": "0x1234567890AbcdEF1234567890aBcdef12345678",
          "to": "0xA1B2C3d4e5F6a1B2c3d4e5F6a1b2c3d4e5F6a1b2",
          "value": "50000",
          "validAfter": "0",
          "validBefore": "1775059500",
          "nonce": "0xbbbb...bbbb",
          "signature": "0xdef...platform"
        }
      ]
    }
  },
  "source": "did:pkh:eip155:196:0x1234567890AbcdEF1234567890aBcdef12345678"
}
~~~

The server batches both `transferWithAuthorization` calls
in a single on-chain transaction.

# Full Example: Permit2 Charge on X Layer

**1. Challenge (402 response):**

~~~http
HTTP/1.1 402 Payment Required
WWW-Authenticate: Payment id="pRm2tChrgXlayer01",
  realm="api.example.com",
  method="evm",
  intent="charge",
  request="eyJ...",
  expires="2026-04-01T12:05:00Z"
Cache-Control: no-store
~~~

Decoded `request`:

~~~json
{
  "amount": "1000000",
  "currency": "0xA8CE8aee21bC2A48a5EF670afCc9274C7bbbC035",
  "recipient": "0x742d35Cc6634c0532925a3b844bC9e7595F8fE00",
  "methodDetails": {
    "chainId": 196,
    "feePayer": true,
    "permit2Address": "0x000000000022D473030F116dDEE9F6B43aC78BA3"
  }
}
~~~

This requests 1.00 USDC (1,000,000 base units) on X Layer
(chain 196) via Permit2.

**2. Credential (Permit2 authorization):**

~~~http
GET /api/resource HTTP/1.1
Host: api.example.com
Authorization: Payment <base64url-encoded credential>
~~~

Decoded credential:

~~~json
{
  "challenge": {
    "id": "pRm2tChrgXlayer01",
    "realm": "api.example.com",
    "method": "evm",
    "intent": "charge",
    "request": "eyJ...",
    "expires": "2026-04-01T12:05:00Z"
  },
  "payload": {
    "type": "transaction",
    "authorization": {
      "type": "permit2",
      "permit": {
        "permitted": [
          {
            "token": "0xA8CE8aee21bC2A48a5EF670afCc9274C7bbbC035",
            "amount": "1000000"
          }
        ],
        "nonce": "42",
        "deadline": "1775059500"
      },
      "transferDetails": [
        {
          "to": "0x742d35Cc6634c0532925a3b844bC9e7595F8fE00",
          "requestedAmount": "1000000"
        }
      ],
      "witness": {
        "challengeHash": "0x8a3b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b"
      },
      "signature": "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef12345678901b"
    }
  },
  "source": "did:pkh:eip155:196:0x1234567890AbcdEF1234567890aBcdef12345678"
}
~~~

**3. Receipt:**

~~~http
HTTP/1.1 200 OK
Payment-Receipt: eyJ...base64url-encoded receipt...
Content-Type: application/json
~~~

Decoded receipt:

~~~json
{
  "method": "evm",
  "reference": "0xaabb1122334455667788990011223344556677889900112233445566778899aa",
  "status": "success",
  "timestamp": "2026-04-01T12:01:30Z",
  "chainId": 196,
  "challengeId": "pRm2tChrgXlayer01"
}
~~~

# Acknowledgements

The authors thank the MPP community for their feedback on this
specification.
