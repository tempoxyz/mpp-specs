---
title: Tempo Charge Intent for HTTP Payment Authentication
abbrev: Tempo Charge
docname: draft-tempo-charge-01
version: "01"
category: info
ipr: noModificationTrust200902
submissiontype: IETF
consensus: true

author:
  - name: Jake Moxey
    ins: J. Moxey
    email: jake@tempo.xyz
    org: Tempo Labs
  - name: Brendan Ryan
    ins: B. Ryan
    email: brendan@tempo.xyz
    org: Tempo Labs
  - name: Tom Meagher
    ins: T. Meagher
    email: tom@tempo.xyz
    org: Tempo Labs

normative:
  RFC2119:
  RFC3339:
  RFC4648:
  RFC8174:
  RFC8259:
  RFC8785:
  I-D.httpauth-payment:
    title: "The 'Payment' HTTP Authentication Scheme"
    target: https://datatracker.ietf.org/doc/draft-ryan-httpauth-payment/
    author:
      - name: Jake Moxey
    date: 2026-01

informative:
  EIP-2718:
    title: "Typed Transaction Envelope"
    target: https://eips.ethereum.org/EIPS/eip-2718
    author:
      - name: Micah Zoltu
    date: 2020-10
  EIP-55:
    title: "Mixed-case checksum address encoding"
    target: https://eips.ethereum.org/EIPS/eip-55
    author:
      - name: Vitalik Buterin
    date: 2016-01
  TEMPO-TX-SPEC:
    title: "Tempo Transaction Specification"
    target: https://docs.tempo.xyz/protocol/transactions/spec-tempo-transaction
    author:
      - org: Tempo Labs
  TEMPO-KEYCHAIN:
    title: "AccountKeychain precompile"
    target: https://github.com/tempoxyz/tempo/tree/main/crates/precompiles/src/account_keychain
    author:
      - org: Tempo Labs
  KECCAK:
    title: "The Keccak reference, version 3.0"
    target: https://keccak.team/files/Keccak-reference-3.0.pdf
    author:
      - name: Guido Bertoni
      - name: Joan Daemen
      - name: Michael Peeters
      - name: Gilles Van Assche
    date: 2011-01
---

--- abstract

This document defines the "charge" intent for the "tempo" payment method
in the Payment HTTP Authentication Scheme {{I-D.httpauth-payment}}. It
specifies how clients and servers exchange one-time TIP-20 token transfers
on the Tempo blockchain.

--- middle

# Introduction

The `charge` intent represents a one-time payment of a specified amount.
The server may submit the signed transaction any time before the
challenge `expires` auth-param timestamp.

This specification defines the request schema, credential formats, and
settlement procedures for charge transactions on Tempo.

For non-zero charges, Tempo supports two submission modes:

- `pull`: The client signs a transaction and returns a
  `type="transaction"` credential for the server to broadcast.
- `push`: The client broadcasts the transaction and returns a
  `type="hash"` credential for the server to verify onchain.

Servers SHOULD support `pull` mode. Servers MAY additionally support
`push` mode. Servers that do not support both non-zero modes for a
challenge MUST advertise the supported subset via
`methodDetails.supportedModes`.

## Pull Mode (Default)

The default Tempo charge flow uses `pull` mode:

~~~
   Client                        Server                     Tempo Network
      |                             |                             |
      |  (1) GET /api/resource      |                             |
      |-------------------------->  |                             |
      |                             |                             |
      |  (2) 402 Payment Required   |                             |
      |      intent="charge"        |                             |
      |<--------------------------  |                             |
      |                             |                             |
      |  (3) Sign transfer tx       |                             |
      |                             |                             |
      |  (4) Authorization: Payment |                             |
      |-------------------------->  |                             |
      |                             |  (5) Broadcast tx           |
      |                             |-------------------------->  |
      |                             |  (6) Transfer complete      |
      |                             |<--------------------------  |
      |  (7) 200 OK + Receipt       |                             |
      |<--------------------------  |                             |
      |                             |                             |
~~~

# Requirements Language

{::boilerplate bcp14-tagged}

# Terminology

TIP-20
: Tempo's enshrined token standard, implemented as precompiles rather
  than smart contracts. TIP-20 tokens use 6 decimal places and provide
  `transfer`, `transferWithMemo`, `transferFrom`, and `approve` operations.

Tempo Transaction
: An EIP-2718 transaction with type prefix `0x76`, supporting batched
  calls, multiple signature types (secp256k1, P256, WebAuthn), 2D nonces,
  and validity windows.

2D Nonce
: Tempo's nonce system where each account has multiple independent nonce
  lanes (`nonce_key`), enabling parallel transaction submission.

Access Key
: A key that an account authorizes, through Tempo's AccountKeychain
  precompile {{TEMPO-KEYCHAIN}}, to sign on its behalf. See
  {{access-keys}}.

Attribution Memo
: A 32-byte memo that identifies a transfer as an MPP payment for a
  specific challenge. See {{attribution-memo}}.

Fee Payer
: An account that pays transaction fees on behalf of another account.
  Tempo Transactions support fee payment via a separate signature
  domain (`0x78`), allowing the server to pay for fees while the client
  only signs the payment authorization.

# Request Schema

The `request` parameter in the `WWW-Authenticate` challenge contains a
base64url-encoded JSON object. The JSON MUST be serialized using JSON
Canonicalization Scheme (JCS) {{RFC8785}} before base64url encoding,
per {{I-D.httpauth-payment}}.

## Shared Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `amount` | string | REQUIRED | Amount in base units (see {{amount-encoding}}) |
| `currency` | string | REQUIRED | TIP-20 token address (e.g., `"0x20c0..."`) |
| `recipient` | string | REQUIRED | Recipient address |
| `description` | string | OPTIONAL | Human-readable payment description |
| `externalId` | string | OPTIONAL | Merchant's reference (order ID, invoice number, etc.) |

Challenge expiry is conveyed by the `expires` auth-param in
`WWW-Authenticate` per {{I-D.httpauth-payment}}.

## Amount Encoding {#amount-encoding}

`amount` and each `splits[i].amount` are base-10 integer strings in
base units of `currency`, with no sign, decimal point, exponent, or
surrounding whitespace. Senders MUST NOT emit leading zeros; the
value zero is `"0"`. Receivers MUST accept leading zeros and MUST
compare amounts by numeric value, not by string form: `"0100"` equals
`"100"`, and `"00"` is a zero-amount charge.

## Method Details

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `methodDetails.chainId` | number | OPTIONAL | Tempo chain ID (default: 42431) |
| `methodDetails.feePayer` | boolean | OPTIONAL | If `true`, server pays transaction fees (default: `false`) |
| `methodDetails.memo` | string | OPTIONAL | A `bytes32` hex value. When present, the client MUST use `transferWithMemo` instead of `transfer`. When absent, see {{attribution-memo}}. |
| `methodDetails.splits` | array | OPTIONAL | Additional recipients that receive a portion of `amount`. See {{split-payments}}. |
| `methodDetails.supportedModes` | array | OPTIONAL | Supported non-zero submission modes. Values are `"pull"` and/or `"push"`. |

## Attribution Memo {#attribution-memo}

The attribution memo ties a transfer onchain to the challenge it
answers. Payers, servers and indexers use it to recognize an MPP
payment, and servers use it to verify that a transfer the client
broadcast itself pays this challenge and no other.

In this section, keccak256(x) is the Keccak-256 hash {{KECCAK}} of the
UTF-8 bytes of string x, as used by Ethereum, and H[0..n] denotes the
first n bytes of H. The memo is 32 bytes:

| Offset | Length | Value |
|--------|--------|-------|
| 0 | 4 | keccak256("mpp")[0..4] (`0xef1ed712`) |
| 4 | 1 | Version, `0x01` |
| 5 | 10 | keccak256(realm)[0..10] |
| 15 | 10 | keccak256(clientId)[0..10], or 10 zero bytes |
| 25 | 7 | keccak256(challengeId)[0..7] |

`realm` is the challenge `realm` and `challengeId` is the challenge
`id`. `clientId` is an optional identifier the client chooses for
itself, such as an application name; a client without one uses 10
zero bytes. A memo is in attribution format when its first 5 bytes
are `0xef1ed71201`. An attribution memo matches a challenge when its
realm and challengeId segments equal the values computed from that
challenge; the clientId segment does not take part in the match.

For example, with `realm` `"api.example.com"`, `clientId` `"my-app"`,
and challenge `id` `"kM9xPqWvT2nJrHsY4aDfEb"`, the memo is:

~~~
0xef1ed712011ece072f76bd8b82350e3a180fb9d0177aa2f3711128fb265e760d
~~~

### Expected Memo {#expected-memo}

The expected memo of a challenge is `methodDetails.memo` when the
request sets it, and otherwise an attribution memo that matches the
challenge. When `methodDetails.memo` is present, the primary transfer
MUST carry exactly that memo, for every credential type, and
attribution does not apply. Split transfers use only
`splits[i].memo`.

When `methodDetails.memo` is absent, clients SHOULD pay the primary
recipient with `transferWithMemo` and an attribution memo for the
challenge, whatever the credential type, and MUST do so for
`type="hash"` credentials.

### Memo Requirements by Credential Type {#memo-requirements}

Push (`type="hash"`):
: The memo is REQUIRED. The primary payment MUST carry the expected
  memo. Servers MUST reject a hash credential with
  `verification-failed` when no primary transfer carries it,
  including when the primary transfer has no memo, a memo not in
  attribution format, or an attribution memo for another challenge.
  The client broadcast the transfer itself, so without a memo bound
  to the challenge a server cannot tell this payment apart from any
  other transfer of the same amount to the same recipient.

Pull (`type="transaction"`):
: The memo is OPTIONAL. For each transfer whose memo the request does
  not set (the primary transfer when `methodDetails.memo` is absent,
  or a split transfer when its `splits[i].memo` is absent), servers
  MUST accept a plain `transfer` or a `transferWithMemo` whose memo
  is not in attribution format. Servers MUST reject, with
  `verification-failed`, any such transfer that carries an attribution
  memo that does not match this challenge, that is, whose realm segment
  does not match this challenge's `realm` or whose challengeId segment
  does not match this challenge's `id`. This includes an attribution
  memo for another realm: once settled, the transfer would carry the
  expected memo of a challenge at that realm, which keeps its own
  accepted-transfer record and could accept the transaction hash as a
  `type="hash"` credential ({{transaction-replay}}). Memos the
  request sets (`methodDetails.memo` and `splits[i].memo`) MUST match
  exactly. The server broadcasts the transaction the client signed for
  this credential, and the chain rejects a second use of that
  transaction, so the transfer can settle only once.

Zero-amount proofs (`type="proof"`):
: No transfer takes place, so no memo applies. Proofs bind to the
  challenge through their signed message ({{proof-payload}}).

## Submission Modes

The `supportedModes` field allows a server to advertise which non-zero
charge submission modes it supports for a specific challenge.

- `pull` indicates that the client creates a `type="transaction"`
  credential containing a signed Tempo Transaction for the server to
  broadcast.
- `push` indicates that the client creates a `type="hash"` credential
  after broadcasting the transaction itself.

If `supportedModes` is present, it MUST contain at least one of `pull`
or `push`, and clients MUST choose one of the advertised modes.

If `supportedModes` is omitted, clients MAY assume both `pull` and
`push` are supported for that challenge for backwards compatibility with
version 00 implementations. Servers MUST omit `supportedModes` only when
they support both non-zero modes for the challenge. A server that
supports only `pull` or only `push` for a challenge MUST include
`supportedModes` explicitly and omit the unsupported mode.

For zero-amount charges, mode negotiation does not apply. Clients use a
`type="proof"` credential regardless of `supportedModes`.

**Example:**

~~~json
{
  "amount": "1000000",
  "currency": "0x20c0000000000000000000000000000000000000",
  "recipient": "0x742d35Cc6634C0532925a3b844Bc9e7595f8fE00",
  "methodDetails": {
    "chainId": 4217,
    "feePayer": true,
    "supportedModes": ["pull"]
  }
}
~~~

The client fulfills this by signing a Tempo Transaction with
`transfer(recipient, amount)` or `transferWithMemo(recipient, amount, memo)`
on the specified `currency` (token address),
with `validBefore` no later than the challenge `expires` auth-param. The client MAY use a dedicated
`nonceKey` (2D nonce lane) for payment transactions to avoid blocking
other account activity if the transaction is not immediately settled.

If `methodDetails.feePayer` is `true`, the client signs with
`fee_payer_signature` set to `0x00` and `fee_token` empty, allowing the
server to sponsor fees. If `feePayer` is `false` or omitted, the client
MUST set `fee_token` and either pay the fees themselves or obtain a fee
payer signature from a sponsor.

## Split Payments {#split-payments}

The `splits` field enables a single charge to distribute payment across
multiple recipients atomically. This is useful for platform fees, revenue
sharing, and marketplace payouts.

### Semantics

The top-level `amount` represents the total amount the client pays. Each
entry in `splits` specifies a recipient and the amount they receive. The
primary recipient (the top-level `recipient`) receives the remainder:
`amount` minus the sum of all split amounts.

### Split Entry Schema

Each entry in the `splits` array is a JSON object:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `amount` | string | REQUIRED | Amount in base units for this recipient |
| `memo` | string | OPTIONAL | A `bytes32` hex value for `transferWithMemo` |
| `recipient` | string | REQUIRED | Recipient address |

The `amount` field in each split entry follows {{amount-encoding}}.
Each `splits[i].amount` MUST be greater than zero. The syntax and encoding
requirements for `splits[i].memo` are identical to those for
`methodDetails.memo`, but apply only to that split transfer. Address
fields are compared by decoded 20-byte value, not by string form.

### Constraints

Servers MUST NOT generate a request where the sum of `splits[].amount`
values is greater than or equal to `amount`. Clients MUST reject any
request that violates this constraint. This ensures the primary
recipient always receives a non-zero remainder, avoiding the need to
define zero-value transfer semantics.

Additional constraints:

- If present, `splits` MUST contain at least 1 entry. Servers
  SHOULD limit splits to 10 entries to keep gas usage within a
  single block's budget (~29,000 gas per additional TIP-20
  transfer). Servers MAY reject requests exceeding their supported
  split count.
- All transfers MUST target the same `currency` token address.

### Ordering

The order of entries in `splits` is not significant for verification.
Clients SHOULD emit calls in array order. Servers MUST verify that the
required payment effects are present regardless of call ordering.

### Example

~~~json
{
  "amount": "1000000",
  "currency": "0x20c0000000000000000000000000000000000000",
  "recipient": "0x742d35Cc6634C0532925a3b844Bc9e7595f8fE00",
  "methodDetails": {
    "chainId": 4217,
    "feePayer": true,
    "splits": [
      {
        "amount": "50000",
        "recipient": "0xA1B2C3D4E5F6A1B2C3D4E5F6A1B2C3D4E5F6A1B2"
      },
      {
        "amount": "10000",
        "memo": "0x00000000000000000000000000000000000000000000000000000000deadbeef",
        "recipient": "0xC4D5E6F7A8B9C4D5E6F7A8B9C4D5E6F7A8B9C4D5"
      }
    ]
  }
}
~~~

This requests a total payment of 1.00 pathUSD (1,000,000 base units).
The platform receives 0.05 pathUSD, the affiliate receives 0.01 pathUSD
(with a memo), and the primary recipient receives the remaining
0.94 pathUSD (940,000 base units).

### Client Behavior

When `splits` is present, the client MUST produce a transaction whose
on-chain effects include the following `Transfer` or `TransferWithMemo`
events on the `currency` token address:

1. The primary `recipient` receives `amount - sum(splits[].amount)`.
2. Each `splits[i].recipient` receives `splits[i].amount`. If
   `splits[i].memo` is present, the corresponding transfer MUST use
   `transferWithMemo`.

The top-level `methodDetails.memo`, if present, applies to the primary
transfer. If it is absent, the primary transfer SHOULD carry an
attribution memo, and MUST carry one for a `type="hash"` credential
({{memo-requirements}}).

Clients MAY achieve these effects using any valid transaction structure,
including batched calls, smart contract wallet invocations, or
intermediary operations such as token swaps — provided all required
transfer events are emitted atomically.

# Credential Schema

The credential in the `Authorization` header contains a base64url-encoded
JSON object per {{I-D.httpauth-payment}}.

## Credential Structure

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `challenge` | object | REQUIRED | Echo of the challenge from the server |
| `payload` | object | REQUIRED | Tempo-specific payload object |
| `source` | string | OPTIONAL | Payer identifier as a DID (e.g., `did:pkh:eip155:4217:0x...`) |

The `source` field, if present, SHOULD use the `did:pkh` method with the
chain ID applicable to the challenge and the payer's Ethereum address.

## Transaction Payload (type="transaction")

When `type` is `"transaction"`, `signature` contains the complete signed
Tempo Transaction (type 0x76) {{TEMPO-TX-SPEC}} serialized as RLP and
hex-encoded with `0x` prefix. The transaction MUST authorize payment in
the requested TIP-20 token sufficient to satisfy the challenge
parameters, using one
or more `transfer` and/or `transferWithMemo` calls. When `splits` are
present, the transaction MUST include transfers for each split entry
(see {{split-payments}}). This payload type corresponds to `pull` mode.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `signature` | string | REQUIRED | Hex-encoded RLP-serialized signed transaction |
| `type` | string | REQUIRED | `"transaction"` |

**Example:**

~~~json
{
  "challenge": {
    "id": "kM9xPqWvT2nJrHsY4aDfEb",
    "realm": "api.example.com",
    "method": "tempo",
    "intent": "charge",
    "request": "eyJ...",
    "expires": "2025-02-05T12:05:00Z"
  },
  "payload": {
    "signature": "0x76f901...signed transaction bytes...",
    "type": "transaction"
  },
  "source": "did:pkh:eip155:4217:0x1234567890abcdef1234567890abcdef12345678"
}
~~~

## Hash Payload (type="hash")

When `type` is `"hash"`, the client has already broadcast the transaction
to the Tempo network. The `hash` field contains the transaction hash for
the server to verify onchain. This payload type corresponds to `push`
mode.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `hash` | string | REQUIRED | Transaction hash with `0x` prefix |
| `type` | string | REQUIRED | `"hash"` |

**Example:**

~~~json
{
  "challenge": {
    "id": "kM9xPqWvT2nJrHsY4aDfEb",
    "realm": "api.example.com",
    "method": "tempo",
    "intent": "charge",
    "request": "eyJ...",
    "expires": "2025-02-05T12:05:00Z"
  },
  "payload": {
    "hash": "0x1a2b3c4d5e6f7890abcdef1234567890abcdef1234567890abcdef1234567890",
    "type": "hash"
  },
  "source": "did:pkh:eip155:4217:0x1234567890abcdef1234567890abcdef12345678"
}
~~~

## Proof Payload (type="proof") {#proof-payload}

When `amount` is `"0"`, no on-chain transfer is required. Instead of
broadcasting a transaction, the client signs an EIP-712 typed-data
message binding the proof to the challenge identifier. This payload
type is used exclusively for zero-amount charges: clients MUST use
`type="proof"` when `amount` is `"0"`, and MUST NOT use `type="proof"`
when `amount` is non-zero. The `supportedModes` field does not apply
to zero-amount charges.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `signature` | string | REQUIRED | EIP-712 signature with `0x` prefix |
| `type` | string | REQUIRED | `"proof"` |

The `source` field MUST be present on proof credentials and MUST be a
`did:pkh:eip155:<chainId>:<address>` DID identifying the signer.

### EIP-712 Domain and Types

The typed-data domain and types are:

~~~json
{
  "domain": {
    "name": "MPP",
    "version": "3",
    "chainId": <challenge methodDetails.chainId>
  },
  "types": {
    "Proof": [
      { "name": "account", "type": "address" },
      { "name": "challengeId", "type": "string" },
      { "name": "realm", "type": "string" }
    ]
  },
  "primaryType": "Proof",
  "message": {
    "account": "<address from credential.source>",
    "challengeId": "<challenge.id>",
    "realm": "<challenge realm>"
  }
}
~~~

The `challengeId` in the message MUST be the `id` from the challenge
that was issued to the client. This binds the signature to exactly one
challenge, preventing cross-challenge replay. The `account` MUST be
the address from `credential.source`, binding the proof to the paying
account so that a signature cannot be replayed against another account
controlled by the same signing key. The `realm` MUST be the `realm`
from the challenge, binding the proof to the issuing origin and
preventing cross-realm replay of a proof obtained from a different
server.

### Proof Contract Versions

The domain `version` identifies the proof contract. Three versions have
shipped:

| Version | `Proof` fields | Description |
|---------|----------------|-------------|
| `"1"` | `challengeId` | Initial contract. Binds a proof to a single challenge. |
| `"2"` | `challengeId`, `realm` | Adds realm binding, so a proof obtained from one server cannot be replayed against another. |
| `"3"` | `account`, `challengeId`, `realm` | Adds payer binding, so a proof cannot be replayed against a different account, including across an access key authorized for multiple accounts. |

Implementations MUST use version `"3"`. The domain `version` is part of
the EIP-712 digest, so a signature produced under version `"1"` or
`"2"` does not verify against the version `"3"` typed data. Servers
MUST NOT accept proof signatures made under domain version `"1"` or
`"2"`.

### Proof Verification

Servers MUST verify proof credentials as follows:

1. Verify `credential.source` is present and parses as
   `did:pkh:eip155:<chainId>:<address>`
2. Verify the chain ID from `source` matches
   `methodDetails.chainId` from the challenge
3. Reconstruct the typed data described above with `account` set to
   the address from `source`, `challengeId` set to the challenge `id`,
   and `realm` set to the challenge `realm`
4. Verify `payload.signature` is a valid signature over that typed
   data by the address from `source`. Recovering the signer and
   comparing it to the address from `source` satisfies this check;
   servers MAY additionally accept contract-account signatures
   (ERC-1271).
5. If step 4 fails, servers MAY instead recover the signer of
   `payload.signature` and accept the credential only if that signer
   is an active access key ({{access-keys}}) for the account in
   `source`. Servers MUST NOT otherwise accept a credential whose
   signer differs from the address in `source`.

### Access Keys {#access-keys}

To check an access key, servers read the key's record from the
AccountKeychain precompile {{TEMPO-KEYCHAIN}} at
`0xAAAAAAAA00000000000000000000000000000000` with
`getKey(account, keyId)` against the latest block, where `account` is
the address from `source` and `keyId` is the recovered signer. The key
is active only when all of the following hold:

- the returned `keyId` is non-zero and equals the signer;
- `isRevoked` is false;
- `expiry` is non-zero and greater than the block timestamp.

An `expiry` of 0 means that no key is registered: `getKey` returns a
zero `keyId` and a zero `expiry` for a missing or revoked key. It never
means that the key does not expire. A key without an expiry is
registered with the maximum `uint64` value. A key is expired once the
block timestamp is equal to or greater than its `expiry`.

### Proof Receipt

Upon successful verification, servers return a receipt per
{{I-D.httpauth-payment}} with `reference` set to the challenge `id`
(since no on-chain transaction exists).

**Example:**

~~~json
{
  "challenge": {
    "id": "kM9xPqWvT2nJrHsY4aDfEb",
    "realm": "api.example.com",
    "method": "tempo",
    "intent": "charge",
    "request": "eyJ...",
    "expires": "2025-02-05T12:05:00Z"
  },
  "payload": {
    "signature": "0xabcdef1234567890...",
    "type": "proof"
  },
  "source": "did:pkh:eip155:4217:0x1234567890abcdef1234567890abcdef12345678"
}
~~~

# Fee Payment

When a request includes `feePayer: true`, the server commits to paying
transaction fees on behalf of the client.

## Server-Paid Fees

When `feePayer: true`:

1. **Client signs with placeholder**: The client signs the Tempo Transaction
   {{TEMPO-TX-SPEC}} with `fee_payer_signature` set to a placeholder value
   (`0x00`) and `fee_token` left empty. The client uses signature domain
   `0x76`.

2. **Server receives credential**: The server extracts the client-signed
   transaction from the credential payload.

3. **Server adds fee payment signature**: The server selects a `fee_token` (any
   USD-denominated TIP-20 stablecoin) and signs the transaction using
   signature domain `0x78`. This signature commits to the transaction
   including the `fee_token` and client's address.

4. **Server broadcasts**: The final transaction contains both signatures:
   - Client's signature (authorizing the payment)
   - Server's `fee_payer_signature` (committing to pay fees)

## Client-Paid Fees

When `feePayer: false` or omitted, the client MUST set `fee_token` to a
valid USD TIP-20 token address and arrange payment of the fees, either
by paying the fees themselves or by obtaining a fee payer signature
from a sponsor. The server broadcasts the transaction as-is without
adding a fee payer signature.

## Server Requirements

When acting as fee payer, servers:

- MUST maintain sufficient balance of a USD TIP-20 token to pay
  transaction fees
- MAY use any USD-denominated TIP-20 token with sufficient AMM
  liquidity as the fee token
- MAY recover fee costs through pricing or other business logic

## Client Requirements

- When `feePayer: true`: Clients MUST sign with `fee_payer_signature` set
  to `0x00` and `fee_token` empty or `0x80` (RLP null)
- When `feePayer: false` or omitted: Clients MUST set `fee_token` to a
  valid USD TIP-20 token. The client or sponsor paying the fee MUST have
  sufficient balance of that token

# Settlement Procedure

For `intent="charge"` fulfilled via transaction, the client signs a
transaction containing one or more `transfer` or `transferWithMemo` calls.
When `splits` are present, the transaction contains multiple calls (see
{{split-payments}}). If `feePayer: true`, the server adds its fee payer
signature before broadcasting:

~~~
   Client                           Server                        Tempo Network
      |                                |                                |
      |  (1) Authorization:            |                                |
      |      Payment <credential>      |                                |
      |------------------------------->|                                |
      |                                |                                |
      |                                |  (2) If feePayer: true,        |
      |                                |      add fee payment signature |
      |                                |                                |
      |                                |  (3) eth_sendRawTxSync         |
      |                                |------------------------------->|
      |                                |                                |
      |                                |  (4) Transfer executed         |
      |                                |      (~500ms finality)         |
      |                                |<-------------------------------|
      |                                |                                |
      |  (5) 200 OK                    |                                |
      |      Payment-Receipt: <base64url-receipt> |                    |
      |<-------------------------------|                                |
      |                                |                                |
~~~

1. Client submits credential containing signed `transfer` or `transferWithMemo` transaction
2. If `feePayer: true`, server adds fee sponsorship (signs with `0x78` domain)
3. Server broadcasts transaction to Tempo
4. Transaction included in block with immediate finality (~500ms)
5. Server returns a receipt whose `reference` field is the transaction digest

## Hash Settlement

For credentials with `type="hash"`, the client has already broadcast
the transaction. The server verifies the transaction onchain:

~~~
   Client                        Server                     Tempo Network
      |                             |                             |
      |  (1) Broadcast tx           |                             |
      |------------------------------------------------------>    |
      |                             |                             |
      |  (2) Transaction confirmed  |                             |
      |<------------------------------------------------------    |
      |                             |                             |
      |  (3) Authorization:         |                             |
      |      Payment <credential>   |                             |
      |      (with txHash)          |                             |
      |-------------------------->  |                             |
      |                             |                             |
      |                             |  (4) eth_getTransactionReceipt
      |                             |-------------------------->  |
      |                             |                             |
      |                             |  (5) Receipt returned       |
      |                             |<--------------------------  |
      |                             |                             |
      |                             |  (6) Verify receipt         |
      |                             |                             |
      |  (7) 200 OK                 |                             |
      |      Payment-Receipt:       |                             |
      |      <base64url-receipt>    |                             |
      |<--------------------------  |                             |
      |                             |                             |
~~~

**Limitations:**

- Clients MUST NOT use `type="hash"` when `methodDetails.feePayer` is
  `true`. Servers MUST reject such credentials.
- If `methodDetails.supportedModes` is present and does not include
  `push`, clients MUST NOT use `type="hash"` credentials. Servers MUST
  reject such credentials.
- Server cannot modify or enhance the transaction.

## Transaction Verification {#transaction-verification}

Before broadcasting a transaction credential, servers MUST verify:

1. Deserialize the RLP-encoded transaction from `payload.signature`
2. Verify the transaction contains `transfer` or `transferWithMemo`
   calls on the `currency` token address
3. Verify the `amount` matches the challenge request amount
4. Verify the `recipient` matches the challenge request recipient
5. If `methodDetails.memo` is present, verify the transaction uses
   `transferWithMemo` with the matching memo value. If it is absent,
   accept the primary transfer without a memo or with a memo not in
   attribution format, and reject it if it carries an attribution memo
   for any other realm or challenge ({{memo-requirements}})
6. If `methodDetails.splits` is present, verify the transaction
   includes transfers satisfying each split entry: the primary
   recipient receives `amount - sum(splits[].amount)`, each split
   recipient receives its specified amount, and any required memo
   values are present. A split transfer without `splits[i].memo`
   follows the memo rule of step 5 ({{memo-requirements}})
7. If `methodDetails.supportedModes` is present, verify it includes
   `pull`

Servers MAY impose additional structural requirements (such as
exact call count or ordering) as local policy before broadcasting.

Servers MUST NOT accept a transaction credential whose transaction
was already included onchain before the server's own broadcast for
that credential, since another server or an earlier settlement may
already have counted it. Before broadcasting, servers MUST compute
the transaction hash and fetch its receipt (for example with
`eth_getTransactionReceipt`). If the transaction is already
included, servers MUST reject the credential with
`verification-failed`, even when the accepted-transfer record
({{accepted-transfers}}) holds no entry for it. When the broadcast
fails because the node already knows the transaction, servers MAY
wait for its receipt and accept it only if the transaction was not
yet included at the pre-broadcast check.

After the broadcast transaction succeeds, servers MUST add the
transfers they counted toward the challenge to the accepted-transfer
record ({{accepted-transfers}}) before returning a receipt, so that
the settled transaction cannot be presented again as a hash
credential.

## Hash Verification {#hash-verification}

For hash credentials, servers MUST fetch the transaction receipt and
verify that it indicates successful execution. Servers MUST verify
that the receipt contains `Transfer` and/or `TransferWithMemo` event
logs emitted by the `currency` token address whose payment effects
satisfy the challenge parameters, including the primary recipient
amount, any split amounts, and any required memo values.

Only a transfer to the primary recipient that carries the expected
memo ({{expected-memo}}) counts toward the primary amount. Servers
MUST ignore other transfers in the same transaction, such as
transfers that pay other challenges in a batched transaction, and
MUST reject the credential with `verification-failed` only when the
transfers that carry the expected memo do not satisfy the primary
amount ({{memo-requirements}}).

A transfer already in the server's accepted-transfer record
({{accepted-transfers}}) does not count toward any challenge. Servers
MUST reject a hash credential with `verification-failed` when a
transfer it needs to satisfy the challenge has already been counted,
and MUST record the transfers it counts before returning a receipt.

If `methodDetails.supportedModes` is present, servers MUST verify it
includes `push` before accepting a hash credential.

## Accepted-Transfer Record {#accepted-transfers}

Servers MUST keep one accepted-transfer record for both submission
modes. Each entry identifies a transfer the server counted toward a
challenge by its transaction hash and log index:

- For a hash credential, the server records each `Transfer` or
  `TransferWithMemo` log it counted toward the challenge, before
  returning a receipt.
- For a transaction credential, after the transaction succeeds onchain
  and before returning a receipt, the server records each transfer
  log of the broadcast transaction that it counted toward the
  challenge.

Servers MUST reject, with `verification-failed`, a credential whose
required transfer is already in the record. One batched transaction
can therefore pay several challenges, each with its own transfers,
but no transfer pays twice. Servers MAY key the record by transaction
hash alone. That is stricter, since a batched transaction then pays
only one challenge, but servers that do so MUST still add the hashes
of transactions they broadcast for pull credentials to the same
record that hash credentials are checked against.

An entry MUST last at least until the challenge it was counted for
expires, and MUST NOT be dropped earlier, for example by a cache
eviction or a time-to-live shorter than the challenge lifetime. When
the expected memo is a `methodDetails.memo` that the server reuses
across challenges, the same transfer can satisfy more than one
challenge, so the entry MUST last as long as any challenge with that
memo can be accepted.

Servers MAY additionally inspect the transaction call data as a
local-policy check, but call-data decoding is not required for
conformance.

## Receipt Generation

Upon successful settlement, servers MUST return a `Payment-Receipt` header
per {{I-D.httpauth-payment}}. Servers MUST NOT include a
`Payment-Receipt` header on error responses; failures are communicated via
HTTP status codes and Problem Details.

The receipt payload for Tempo charge:

| Field | Type | Description |
|-------|------|-------------|
| `method` | string | `"tempo"` |
| `reference` | string | Transaction hash of the settlement transaction |
| `status` | string | `"success"` |
| `timestamp` | string | {{RFC3339}} settlement time |
| `externalId` | string | OPTIONAL. Echoed from the challenge request |

# Security Considerations

## Transaction Replay {#transaction-replay}

Tempo Transactions include chain ID, nonce, and optional `validBefore`/
`validAfter` timestamps that prevent replay attacks:

- Chain ID binding prevents cross-chain replay
- Nonce consumption prevents same-chain replay
- Validity windows limit temporal replay windows

These protections apply to transactions the server broadcasts.
A `type="hash"` credential names a transaction that is already
onchain, so the chain does not stop the same hash from being
presented again. Servers rely on the expected memo
({{memo-requirements}}) to bind the transfer to one challenge and on
the accepted-transfer record ({{accepted-transfers}}) to count each
transfer once.

A transaction the server broadcast for a pull credential is also
onchain once it settles. If its transfers carry a `methodDetails.memo`
the server reuses, they can match the expected memo of another
challenge, and the transaction hash could be presented as a
`type="hash"` credential for it. Recording pull transfers in the same
accepted-transfer record that hash credentials are checked against
prevents one transfer from paying two challenges.

A pull transaction whose transfer carries an attribution memo for
another challenge would, once settled, carry the expected memo of
that challenge. When that challenge belongs to this realm, its
accepted-transfer entry can expire. When it belongs to another realm,
that server keeps a separate accepted-transfer record that never saw
this pull transaction, even though it pays the same recipient, and
would accept the transaction hash as a `type="hash"` credential.
Rejecting pull credentials that carry any attribution memo not
matching this challenge, whatever its realm ({{memo-requirements}}),
keeps a pull transfer from being redeemed for a second challenge.

Accepted-transfer entries can expire, and a server that runs as
several instances can keep them per instance. A pull transaction
whose transfers carry no memo or a memo not in attribution format
would otherwise be redeemable twice, by presenting the
already-settled transaction again as a pull credential. Rejecting a
pull credential whose transaction is already onchain before the
server's own broadcast ({{transaction-verification}}) prevents this.

## Amount Verification

Clients MUST parse and verify the `request` payload before signing:

1. Verify `amount` is reasonable for the service
2. Verify `currency` is the expected token address
3. Verify `recipient` is controlled by the expected party
4. If `splits` is present, verify the sum of split amounts is strictly
   less than `amount` and that all split recipients are expected

## Split Payment Risks

When `splits` are present, additional risks apply:

**Recipient Transparency**: Where a human approval step exists, clients
SHOULD present each split recipient and amount so the user can verify
the payment distribution. Clients SHOULD highlight when the primary
recipient receives a small remainder relative to the total `amount`.

**Gas Overhead**: Each additional split adds approximately 29,000 gas
for the TIP-20 precompile transfer execution. A charge with 10 splits
adds approximately 290,000 gas beyond a single-transfer charge. Servers
sponsoring fees via `feePayer: true` MUST budget for the increased gas
limit.

**Split Count Bound**: Servers SHOULD limit `splits` to 10 entries.
See {{split-payments}} for rationale.

## Server-Paid Fees

Servers acting as fee payers accept financial risk in exchange for
providing a seamless payment experience.

**Denial of Service**: Malicious clients could submit valid-looking
credentials that fail onchain, causing the server to pay fees without
receiving payment. Servers SHOULD implement rate limiting and MAY require
client authentication before accepting payment credentials.

**Fee Token Exhaustion**: Servers MUST monitor their fee token balance
and reject new payment requests when balance is insufficient.

# IANA Considerations

## Payment Method Registration

This document registers the following payment method in the "HTTP Payment
Methods" registry established by {{I-D.httpauth-payment}}:

| Method Identifier | Description | Reference |
|-------------------|-------------|-----------|
| `tempo` | Tempo blockchain TIP-20 token transfer | This document |

Contact: Tempo Labs (<contact@tempo.xyz>)

## Payment Intent Registration

This document registers the following payment intent in the "HTTP Payment
Intents" registry established by {{I-D.httpauth-payment}}:

| Intent | Applicable Methods | Description | Reference |
|--------|-------------------|-------------|-----------|
| `charge` | `tempo` | One-time TIP-20 transfer | This document |

--- back

# ABNF Collected

~~~ abnf
tempo-charge-challenge = "Payment" 1*SP
  "id=" quoted-string ","
  "realm=" quoted-string ","
  "method=" DQUOTE "tempo" DQUOTE ","
  "intent=" DQUOTE "charge" DQUOTE ","
  "request=" base64url-nopad

tempo-charge-credential = "Payment" 1*SP base64url-nopad

; Base64url encoding without padding per RFC 4648 Section 5
base64url-nopad = 1*( ALPHA / DIGIT / "-" / "_" )
~~~

# Example

**Challenge:**

~~~http
HTTP/1.1 402 Payment Required
WWW-Authenticate: Payment id="kM9xPqWvT2nJrHsY4aDfEb",
  realm="api.example.com",
  method="tempo",
  intent="charge",
  request="eyJhbW91bnQiOiIxMDAwMDAwIiwiY3VycmVuY3kiOiIweDIwYzAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAiLCJtZXRob2REZXRhaWxzIjp7ImNoYWluSWQiOjQyMTcsInN1cHBvcnRlZE1vZGVzIjpbInB1bGwiXX0sInJlY2lwaWVudCI6IjB4NzQyZDM1Q2M2NjM0QzA1MzI5MjVhM2I4NDRCYzllNzU5NWY4ZkUwMCJ9",
  expires="2025-01-06T12:00:00Z"
Cache-Control: no-store
~~~

The `request` decodes to:

~~~json
{
  "amount": "1000000",
  "currency": "0x20c0000000000000000000000000000000000000",
  "recipient": "0x742d35Cc6634C0532925a3b844Bc9e7595f8fE00",
  "methodDetails": {
    "chainId": 4217,
    "supportedModes": ["pull"]
  }
}
~~~

This requests a transfer of 1.00 pathUSD (1000000 base units).

**Credential:**

~~~http
GET /api/resource HTTP/1.1
Host: api.example.com
Authorization: Payment eyJjaGFsbGVuZ2UiOnsiaWQiOiJrTTl4UHFXdlQybkpySHNZNGFEZkViIn0sInBheWxvYWQiOnsic2lnbmF0dXJlIjoiMHg3NmY5MDEuLi4iLCJ0eXBlIjoidHJhbnNhY3Rpb24ifSwic291cmNlIjoiZGlkOnBraDplaXAxNTU6NDIxNzoweDEyMzQ1Njc4OTBhYmNkZWYxMjM0NTY3ODkwYWJjZGVmMTIzNDU2NzgifQ
~~~

# Split Payment Example

**Challenge with splits:**

~~~http
HTTP/1.1 402 Payment Required
WWW-Authenticate: Payment id="sP1itPaym3ntEx4mple",
  realm="marketplace.example.com",
  method="tempo",
  intent="charge",
  request="eyJhbW91bnQiOiIxMDAwMDAwIiwiY3VycmVuY3kiOiIweDIwYzAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAiLCJtZXRob2REZXRhaWxzIjp7ImNoYWluSWQiOjQyMTcsImZlZVBheWVyIjp0cnVlLCJzcGxpdHMiOlt7ImFtb3VudCI6IjUwMDAwIiwicmVjaXBpZW50IjoiMHhBMUIyQzNENEU1RjZBMUIyQzNENEU1RjZBMUIyQzNENEU1RjZBMUIyIn1dfSwicmVjaXBpZW50IjoiMHg3NDJkMzVDYzY2MzRDMDUzMjkyNWEzYjg0NEJjOWU3NTk1ZjhmRTAwIn0",
  expires="2025-06-01T12:00:00Z"
Cache-Control: no-store
~~~

The `request` decodes to:

~~~json
{
  "amount": "1000000",
  "currency": "0x20c0000000000000000000000000000000000000",
  "recipient": "0x742d35Cc6634C0532925a3b844Bc9e7595f8fE00",
  "methodDetails": {
    "chainId": 4217,
    "feePayer": true,
    "splits": [
      {
        "amount": "50000",
        "recipient": "0xA1B2C3D4E5F6A1B2C3D4E5F6A1B2C3D4E5F6A1B2"
      }
    ]
  }
}
~~~

This requests a total payment of 1.00 pathUSD. The platform receives
0.05 pathUSD and the merchant receives 0.95 pathUSD. The resulting
transaction must emit the following transfer events:

1. 950,000 to `0x742d...fE00` — merchant receives remainder
2. 50,000 to `0xA1B2...A1B2` — platform fee

# Acknowledgements

The authors thank the Tempo community for their feedback on this
specification.
