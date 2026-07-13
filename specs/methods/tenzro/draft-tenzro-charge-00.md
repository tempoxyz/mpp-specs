---
title: Tenzro Charge Intent for HTTP Payment Authentication
abbrev: Tenzro Charge
docname: draft-tenzro-charge-00
version: 00
category: info
ipr: noModificationTrust200902
submissiontype: IETF
consensus: true

author:
  - name: Hilal Agil
    ins: H. Agil
    email: hilal@tenzro.com
    organization: Tenzro Network

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
    date: 2017-09
  EIP-55:
    title: "Mixed-case checksum address encoding"
    target: https://eips.ethereum.org/EIPS/eip-55
  ERC-20:
    title: "Token Standard"
    target: https://eips.ethereum.org/EIPS/eip-20
  TDIP:
    title: "Tenzro Decentralized Identity Protocol"
    target: https://github.com/tenzro/tenzro-network/blob/main/TDIP.md
    author:
      - org: Tenzro Network
    date: 2026
  CIP-56:
    title: "Canton Improvement Proposal 56 - Token Standard"
    target: https://github.com/digital-asset/canton-network-node
    author:
      - org: Canton Foundation
  CAIP-2-TENZRO:
    title: "CAIP-2 Tenzro Namespace"
    target: https://github.com/ChainAgnostic/namespaces/pull/184
    author:
      - org: Tenzro Network
  FIPS-204:
    title: "FIPS 204: Module-Lattice-Based Digital Signature Standard"
    target: https://csrc.nist.gov/pubs/fips/204/final
    author:
      - org: NIST
    date: 2024-08
  RFC8032:
    title: "Edwards-Curve Digital Signature Algorithm (EdDSA)"
    target: https://datatracker.ietf.org/doc/html/rfc8032
---

--- abstract

This document defines the "charge" intent for the "tenzro" payment
method in the Payment HTTP Authentication Scheme
{{I-D.httpauth-payment}}. It specifies how clients and servers
exchange one-time TNZO and TNZO-pointer-asset transfers on the Tenzro
Ledger.

The Tenzro Ledger is a multi-VM L1 supporting EVM, SVM, and Canton/DAML
execution layers over a single underlying ledger state. The "tenzro"
method exposes a unified payment surface that lets the same logical
TNZO transfer settle through whichever VM façade the payer or recipient
prefers, without fragmenting the asset or requiring bridging between
façades.

This document also profiles two Tenzro-specific authentication
augmentations: mandatory hybrid post-quantum signatures
(Ed25519 + ML-DSA-65) and Tenzro Decentralized Identity Protocol
(TDIP) DID binding with delegation-scope and runtime
spending-policy enforcement.

--- middle

# Introduction

HTTP Payment Authentication {{I-D.httpauth-payment}} defines a
challenge-response mechanism that gates access to resources behind
payments. This document registers the "charge" intent for the
"tenzro" payment method.

The Tenzro Ledger is purpose-built for AI-age commerce: humans and
autonomous machines (AI agents) settle inference fees, agent-to-agent
service payments, and bridged stablecoin transfers in a single
account-and-balance model. To support both Ethereum-tooling
ecosystems and Solana-tooling ecosystems and Canton-tooling
ecosystems simultaneously, Tenzro Ledger ships three VM façades
(EVM, SVM, Canton/DAML) that share a single underlying TNZO balance
via a Sei-V2-style pointer model.

This specification inherits the shared request semantics of the
"charge" intent from {{I-D.payment-intent-charge}}. It defines only
the Tenzro-specific `methodDetails`, `payload`, and verification
procedures, with two extensions over a typical chain-specific method:

1. A `methodDetails.facade` discriminator selecting which VM façade
   ultimately processes the transfer.
2. Two Tenzro-defined credential payload augmentations carrying a
   mandatory ML-DSA-65 post-quantum signature alongside the classical
   Ed25519 / secp256k1 signature, and an optional TDIP DID binding.

## Design Rationale

A separate `tenzro` method (rather than reusing `evm` with a chain-ID
override) is justified by:

- **Multi-VM façade selection.** The same logical TNZO transfer can
  settle via EVM (`wTNZO` ERC-20 pointer), via SVM (`wTNZO-SPL` SPL
  Token pointer), via Canton (CIP-56 holding), or directly on the
  native account model. The `evm` method covers only the EVM façade
  and cannot dispatch the SVM or Canton paths.
- **TDIP identity binding.** Tenzro credentials MAY bind a TDIP DID
  to the payer, which servers MUST resolve before settlement and
  which permits per-credential KYC-tier and delegation-scope
  enforcement that has no counterpart in `evm` or `solana`.
- **Mandatory post-quantum signing.** Tenzro mandates a hybrid
  Ed25519 + ML-DSA-65 {{FIPS-204}} signature on every credential, an
  augmentation no chain-specific method currently profiles.

## Charge Flow

The recommended Tenzro charge flow uses an `authorization` credential:

~~~
Client                Server                Tenzro Ledger
  |                     |                         |
  | (1) GET /resource   |                         |
  |-------------------->|                         |
  |                     |                         |
  | (2) 402 Payment Req |                         |
  |     intent="charge" |                         |
  |<--------------------|                         |
  |                     |                         |
  | (3) Sign EIP-712    |                         |
  |     authorization   |                         |
  |     (Ed25519 +      |                         |
  |      ML-DSA-65)     |                         |
  |                     |                         |
  | (4) Authorization:  |                         |
  |     Payment <cred>  |                         |
  |-------------------->|                         |
  |                     | (5) Submit settlement   |
  |                     |     to selected facade  |
  |                     |------------------------>|
  |                     |                         |
  |                     | (6) Block finality      |
  |                     |     (~6-12s, HotStuff-2)|
  |                     |<------------------------|
  |                     |                         |
  | (7) 200 OK          |                         |
  |     Payment-Receipt |                         |
  |<--------------------|                         |
  |                     |                         |
~~~

# Requirements Language

{::boilerplate bcp14-tagged}

# Terminology

TNZO
: The native gas, governance, and settlement token of the Tenzro
  Ledger. 18-decimal precision. Genesis supply 1,000,000,000 TNZO.

VM Façade
: One of {EVM, SVM, Canton/DAML, Native}. Each façade is an
  execution surface over the same underlying ledger state. Token
  balances move atomically between façades via a pointer model
  (no bridging).

wTNZO
: The ERC-20 pointer contract on the EVM façade. Address
  `0x7a4bcb13a6b2b384c284b5caa6e5ef3126527f93`. wTNZO is not a wrapped
  asset in the bridging sense — it is a thin pointer to the
  underlying TNZO native balance.

wTNZO-SPL
: The SPL Token Program adapter on the SVM façade. Same underlying
  TNZO balance as wTNZO, surfaced through the Solana Program Library
  conventions.

TDIP
: Tenzro Decentralized Identity Protocol {{TDIP}}, the unified
  human/machine W3C DID method (`did:tenzro`) used to bind credential
  signers to long-lived identities with delegation scopes.

DelegationScope
: A structural ceiling attached to a TDIP machine identity bounding
  what payments and operations the machine can authorize. Composed of
  `max_transaction_value`, `max_daily_spend`, `allowed_operations`,
  `allowed_payment_protocols`, `allowed_chains`, and `time_bound`.

SpendingPolicy
: A runtime ceiling, separate from `DelegationScope`, that tracks
  current daily spend and enforces per-transaction limits. Mutable
  by the controller of the machine identity at any time.

Hybrid PQ Signature
: A composite signature comprising one classical signature
  (Ed25519 over Curve25519, {{RFC8032}}) and one post-quantum
  signature (ML-DSA-65, {{FIPS-204}}) over the same preimage. Both
  legs MUST validate for the credential to be accepted.

# Request Schema

The `request` parameter in the `WWW-Authenticate` challenge contains a
base64url-encoded JSON object. The JSON MUST be serialized using JSON
Canonicalization Scheme (JCS) {{RFC8785}} before base64url encoding,
per {{I-D.httpauth-payment}}.

## Shared Fields

The `tenzro` method inherits the shared `charge` intent fields from
{{I-D.payment-intent-charge}}:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `amount` | string | REQUIRED | Amount in base units (stringified `u128`) |
| `currency` | string | REQUIRED | Asset identifier (see {{asset-identifiers}}) |
| `recipient` | string | REQUIRED | Recipient address or `did:tenzro:` DID |
| `description` | string | OPTIONAL | Human-readable payment description |
| `externalId` | string | OPTIONAL | Merchant's reference (order ID, invoice number) |

## Asset Identifiers {#asset-identifiers}

The `currency` field identifies the asset to be transferred. Three
encodings are recognised by the `tenzro` method:

| Encoding | Form | Example |
|----------|------|---------|
| Native ticker | ASCII string | `TNZO` |
| EVM pointer | `0x` + 40 hex chars | `0x7a4bcb13a6b2b384c284b5caa6e5ef3126527f93` |
| Asset DID | `did:tenzro:asset:...` | `did:tenzro:asset:tnzo` |

Servers MUST resolve any of the three encodings to the same underlying
asset. The native ticker form is RECOMMENDED for human-readable
interfaces; the EVM pointer form is RECOMMENDED for tooling that
already interoperates with ERC-20.

## Recipient Identifiers

The `recipient` field MUST be one of:

- A 64-hex-char Tenzro native address with `0x` prefix
  (32-byte address per CAIP-10 Tenzro rules {{CAIP-2-TENZRO}}).
- An EIP-55 mixed-case 40-hex-char EVM address with `0x` prefix.
- A base58btc 43-44 char SVM address.
- A `did:tenzro:human:`, `did:tenzro:machine:`, or `did:pdis:` DID.

When `recipient` is a DID, the receiving server MUST resolve the DID
to a settlement address via the TDIP registry before broadcasting
settlement.

## Method Details

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `methodDetails.facade` | string | OPTIONAL | VM façade for settlement: `"native"` (default), `"evm"`, `"svm"`, or `"canton"` |
| `methodDetails.minKycTier` | number | OPTIONAL | Minimum TDIP KYC tier (0-3, default 0) |
| `methodDetails.tdipRequired` | boolean | OPTIONAL | When `true`, credential MUST carry a TDIP DID (default `false`) |
| `methodDetails.settlementTarget` | string | OPTIONAL | `"block_inclusion"` (~2s) or `"block_finality"` (HotStuff-2, ~6-12s); default `"block_inclusion"` |
| `methodDetails.feePayer` | boolean | OPTIONAL | If `true`, server pays gas (default `false`) |

### Façade Discriminator

`methodDetails.facade` selects the VM surface that ultimately
processes the transfer. The four permitted values:

- **`native`** (default). Settlement via a native Tenzro Ledger
  account-model transaction. Cheapest gas, fewest tooling
  prerequisites.
- **`evm`**. Settlement via an EVM `wTNZO` ERC-20 transfer or via the
  EIP-712 authorization payload type ({{authorization-payload}}).
  Recommended when the payer holds keys in EVM-only wallets.
- **`svm`**. Settlement via an SVM `wTNZO-SPL` SPL Token Program
  transfer. Recommended when the payer holds keys in SVM-only wallets.
- **`canton`**. Settlement via a Canton CIP-56 token transfer
  (two-step `create` → `accept`). Recommended for enterprise tokenisation
  flows and DvP transactions.

The choice of façade does NOT change the underlying balance — all four
share the same TNZO holding. The choice only affects the
serialization, signature scheme, and gas accounting of the settlement
transaction.

**Example** (native façade, default):

~~~json
{
  "amount": "10000",
  "currency": "TNZO",
  "recipient": "0x742d35cc6634c0532925a3b844bc9e7595f8fe000000000000000000000000a"
}
~~~

**Example** (EVM façade with TDIP binding):

~~~json
{
  "amount": "10000000000000000",
  "currency": "0x7a4bcb13a6b2b384c284b5caa6e5ef3126527f93",
  "recipient": "did:tenzro:human:a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "methodDetails": {
    "facade": "evm",
    "tdipRequired": true,
    "minKycTier": 1,
    "settlementTarget": "block_finality"
  }
}
~~~

# Credential Schema

The credential in the `Authorization` header contains a base64url-encoded
JSON object per {{I-D.httpauth-payment}}.

## Credential Structure

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `challenge` | object | REQUIRED | Echo of the challenge from the server |
| `payload` | object | REQUIRED | Tenzro-specific payload object |
| `source` | string | OPTIONAL | Payer DID (REQUIRED if challenge `tdipRequired: true`) |

The `source` field, if present, MUST be a `did:tenzro:` or `did:pdis:`
DID URI. When the challenge sets `tdipRequired: true`, `source` MUST
be present and MUST resolve to a TDIP identity whose controller key
matches the credential's signing key.

## Authorization Payload (type="authorization") {#authorization-payload}

The RECOMMENDED Tenzro credential type. The client signs an EIP-712
typed-data message authorizing the transfer, and the server submits
the on-chain settlement.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `type` | string | REQUIRED | `"authorization"` |
| `signature` | string | REQUIRED | Hex-encoded classical signature |
| `signatureScheme` | string | REQUIRED | `"ed25519"` or `"secp256k1"` |
| `publicKey` | string | REQUIRED | Hex-encoded 32-byte (Ed25519) or 33-byte (secp256k1 compressed) public key |
| `pqSignature` | string | REQUIRED | Base64url-encoded ML-DSA-65 signature |
| `pqPublicKey` | string | REQUIRED | Base64url-encoded ML-DSA-65 verifying key |
| `validBefore` | string | OPTIONAL | {{RFC3339}} expiry; defaults to challenge `expires` |
| `nonce` | string | REQUIRED | 32-byte random value, hex-encoded |

### EIP-712 Domain and Types

~~~json
{
  "domain": {
    "name": "TenzroCharge",
    "version": "1",
    "chainId": "<resolved Tenzro chain id>"
  },
  "types": {
    "Authorization": [
      { "name": "challengeId",  "type": "string" },
      { "name": "amount",       "type": "uint256" },
      { "name": "currency",     "type": "string" },
      { "name": "recipient",    "type": "string" },
      { "name": "facade",       "type": "string" },
      { "name": "validBefore",  "type": "uint256" },
      { "name": "nonce",        "type": "bytes32" }
    ]
  },
  "primaryType": "Authorization",
  "message": {
    "challengeId": "<challenge.id>",
    "amount":      "<amount>",
    "currency":    "<currency>",
    "recipient":   "<recipient>",
    "facade":      "<facade or 'native'>",
    "validBefore": "<unix seconds>",
    "nonce":       "<32-byte hex>"
  }
}
~~~

### Hybrid PQ Signature Construction

The classical and post-quantum signatures MUST cover the byte-identical
EIP-712 hash:

~~~
preimage = keccak256("\x19\x01" || domainSeparator || hashStruct(message))
~~~

Both signatures are computed over `preimage`. Verification fails closed
if either signature is missing or invalid.

**Example credential:**

~~~json
{
  "challenge": {
    "id": "T3nZr0Ch4rg3Ex4mple",
    "realm": "api.example.com",
    "method": "tenzro",
    "intent": "charge",
    "request": "eyJ...",
    "expires": "2026-05-02T18:30:00Z"
  },
  "payload": {
    "type": "authorization",
    "signature": "0x9c5d1f3a4b5c6d7e...",
    "signatureScheme": "ed25519",
    "publicKey": "0xa1b2c3d4...",
    "pqSignature": "AQID...",
    "pqPublicKey": "BAUG...",
    "validBefore": "2026-05-02T18:30:00Z",
    "nonce": "0x1f3a4b5c6d7e8f902f3a4b5c6d7e8f901f3a4b5c6d7e8f902f3a4b5c6d7e8f90"
  },
  "source": "did:tenzro:human:a1b2c3d4-e5f6-7890-abcd-ef1234567890"
}
~~~

## Transaction Payload (type="transaction")

When `type` is `"transaction"`, the client returns a complete signed
settlement transaction in the format required by the selected façade:

| Façade | `signature` content |
|--------|---------------------|
| `native` | RLP-encoded native Tenzro transaction |
| `evm` | RLP-encoded EIP-1559 EVM transaction |
| `svm` | base64url-encoded Solana transaction |
| `canton` | hex-encoded DAML command submission |

The transaction MUST authorize transfer of `amount` of `currency` to
`recipient`. The hybrid PQ signature fields (`pqSignature`,
`pqPublicKey`) are REQUIRED for this payload type as well; they sign
the transaction hash.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `type` | string | REQUIRED | `"transaction"` |
| `signature` | string | REQUIRED | Façade-specific encoded signed transaction |
| `pqSignature` | string | REQUIRED | Base64url ML-DSA-65 over the transaction hash |
| `pqPublicKey` | string | REQUIRED | Base64url ML-DSA-65 verifying key |

## Hash Payload (type="hash")

When `type` is `"hash"`, the client has already broadcast the
settlement transaction. The server verifies it on-chain.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `type` | string | REQUIRED | `"hash"` |
| `hash` | string | REQUIRED | Transaction hash with `0x` prefix |
| `pqSignature` | string | REQUIRED | Base64url ML-DSA-65 over the hash |
| `pqPublicKey` | string | REQUIRED | Base64url ML-DSA-65 verifying key |

`type="hash"` MUST NOT be used when `methodDetails.feePayer` is
`true`; servers MUST reject such credentials.

# Verification

A receiving server MUST perform the following checks before settling:

1. **Challenge lookup.** `credential.challenge.id` MUST match a
   stored, unexpired challenge.
2. **Field equality.** `credential.challenge.method` MUST equal
   `"tenzro"`. `credential.challenge.intent` MUST equal `"charge"`.
3. **Hybrid signature verification.** Both classical and ML-DSA-65
   signatures MUST validate over the canonical preimage of
   {{authorization-payload}} (or the transaction hash, for
   `type="transaction"`/`"hash"`).
4. **Public key binding.** The classical `publicKey` MUST derive to
   the address from which settlement is being authorized, per the
   Tenzro CAIP-10 rules for the selected façade.
5. **TDIP binding** (when `tdipRequired: true`).
   `credential.source` MUST resolve to a TDIP identity whose
   controller key matches `credential.payload.publicKey`. The
   identity's KYC tier MUST be greater than or equal to
   `methodDetails.minKycTier`.
6. **Delegation enforcement** (machine DIDs only). When `source`
   is a `did:tenzro:machine:` or `did:pdis:agent:`, the identity's
   `DelegationScope` MUST permit the operation per
   `enforce_operation`. The runtime `SpendingPolicy`, where bound,
   MUST also pass per its current daily-spend window.
7. **Balance check.** The payer MUST hold at least `amount` of
   `currency` at the latest finalized state.

# Settlement Procedure

For `type="authorization"` and `type="transaction"`, the server
broadcasts a settlement transaction on the selected façade, then
returns a receipt once the transaction reaches `settlementTarget`.
For `type="hash"`, the server fetches the on-chain receipt and
verifies it.

## Receipt Generation

Upon successful settlement, servers MUST return a `Payment-Receipt`
header per {{I-D.httpauth-payment}}.

| Field | Type | Description |
|-------|------|-------------|
| `method` | string | `"tenzro"` |
| `reference` | string | Settlement transaction hash |
| `status` | string | `"success"` |
| `timestamp` | string | {{RFC3339}} settlement time |
| `facade` | string | The façade that processed settlement |
| `externalId` | string | OPTIONAL. Echoed from challenge request |

# Error Codes

This document extends the parent registry of payment problem types
({{RFC9457}}) with the following Tenzro-specific entries:

| Code | Meaning |
|------|---------|
| `tenzro/invalid_address` | `payer` or `recipient` did not parse as a valid native, EVM, SVM, or DID identifier |
| `tenzro/did_resolution_failed` | TDIP DID could not be resolved (network or registry error) |
| `tenzro/kyc_tier_insufficient` | Resolved identity's KYC tier is below `minKycTier` |
| `tenzro/delegation_denied` | Machine DID's `DelegationScope` rejected the operation |
| `tenzro/spending_policy_denied` | Runtime `SpendingPolicy` rejected the operation |
| `tenzro/insufficient_balance` | Payer balance below `amount` at settlement time |
| `tenzro/pq_signature_required` | `pqSignature` / `pqPublicKey` missing or invalid |
| `tenzro/facade_unsupported` | Server does not support the requested façade for this resource |
| `tenzro/settlement_failed` | Settlement transaction reverted or did not finalize within timeout |

# Security Considerations

## Hybrid Post-Quantum Signing

The mandatory ML-DSA-65 leg of every credential signature provides
resilience against a future cryptanalytic break of Ed25519 or
secp256k1. Even if the classical primitive is broken, an attacker
cannot forge a credential without also breaking ML-DSA-65. The two
keys are independent, so a compromise of one classical key does not
permit credential forgery.

Servers MUST fail closed if either signature is missing or invalid.
A "fall back to classical only" mode is forbidden by this specification.

## Replay Protection

Cross-challenge replay is prevented by inclusion of `challenge.id`
in the EIP-712 message of {{authorization-payload}}. Same-challenge
replay is prevented by the `nonce` field, which servers MUST track
and reject on second use within `validBefore`.

For `type="transaction"`, replay protection is provided by the
underlying façade's nonce mechanism (EVM nonce, SVM blockhash,
Canton nonce key) plus the EIP-712 `challengeId` binding.

## TDIP Identity Compromise

If a TDIP identity's controller key is compromised, the controller
SHOULD immediately rotate the key in the TDIP registry. Servers
MUST treat the binding as fixed at challenge-issue time: in-flight
credentials signed with a now-rotated key remain valid until the
challenge `expires`. To mitigate, identity controllers MAY set a
short-lived `time_bound` on the `DelegationScope` so that the
practical replay window is bounded by the scope expiry rather than
the challenge expiry.

## Cross-Façade Replay

Because all four façades share the same underlying TNZO balance, a
naïve implementation could permit a credential authorizing settlement
on the EVM façade to be replayed against the SVM façade. The
`facade` field in the EIP-712 message of {{authorization-payload}}
prevents this: each façade verifies that the signed `facade` field
equals the façade it is processing, and rejects credentials with a
mismatched façade.

## Server-Paid Fees

When `feePayer: true`, servers accept the same financial-risk
considerations as in {{I-D.payment-intent-charge}}: malicious clients
may submit credentials that pass classical verification but fail
on-chain (e.g., insufficient balance after a TOCTOU race). Servers
SHOULD implement rate limiting and SHOULD require a TDIP DID with a
nonzero KYC tier before sponsoring fees.

## Facade Choice and Privacy

The choice of façade leaks information about the payer's tooling
ecosystem to network observers. Privacy-conscious payers SHOULD
prefer the `native` façade. Servers SHOULD NOT advertise façade
preferences in observable headers.

# IANA Considerations

## Payment Method Registration

This document registers the following payment method in the "HTTP
Payment Methods" registry established by {{I-D.httpauth-payment}}:

| Method Identifier | Description | Reference |
|-------------------|-------------|-----------|
| `tenzro` | Tenzro Ledger TNZO and TNZO-pointer-asset transfer with optional TDIP DID binding and mandatory hybrid PQ signing | This document |

Contact: Tenzro Network (<hilal@tenzro.com>)

## Payment Intent Registration

This document registers the following payment intent in the "HTTP
Payment Intents" registry established by {{I-D.httpauth-payment}}:

| Intent | Applicable Methods | Description | Reference |
|--------|-------------------|-------------|-----------|
| `charge` | `tenzro` | One-time TNZO or TNZO-pointer-asset transfer | This document |

--- back

# ABNF Collected

~~~ abnf
tenzro-charge-challenge = "Payment" 1*SP
  "id=" quoted-string ","
  "realm=" quoted-string ","
  "method=" DQUOTE "tenzro" DQUOTE ","
  "intent=" DQUOTE "charge" DQUOTE ","
  "request=" base64url-nopad

tenzro-charge-credential = "Payment" 1*SP base64url-nopad

base64url-nopad = 1*( ALPHA / DIGIT / "-" / "_" )
~~~

# Reference Implementation

A reference implementation in Rust ships in
`crates/tenzro-payments/src/mpp/` of the Tenzro Network monorepo at
<https://github.com/tenzro/tenzro-network>. The reference covers
challenge issuance, credential verification, hybrid PQ signing, TDIP
binding, DelegationScope and SpendingPolicy enforcement, and
settlement on all four façades.

A TypeScript client implementation ships in `sdk/tenzro-ts-sdk` of the
same monorepo.

# Example

**Challenge** (native façade, no TDIP):

~~~http
HTTP/1.1 402 Payment Required
WWW-Authenticate: Payment id="T3nZr0Ch4rg3Ex4mple",
  realm="api.example.com",
  method="tenzro",
  intent="charge",
  request="eyJhbW91bnQiOiIxMDAwMCIsImN1cnJlbmN5IjoiVE5aTyIsInJlY2lwaWVudCI6IjB4NzQyZDM1Y2M2NjM0YzA1MzI5MjVhM2I4NDRiYzllNzU5NWY4ZmUwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMGEifQ",
  expires="2026-05-02T18:30:00Z"
Cache-Control: no-store
~~~

The `request` decodes to:

~~~json
{
  "amount": "10000",
  "currency": "TNZO",
  "recipient": "0x742d35cc6634c0532925a3b844bc9e7595f8fe000000000000000000000000a"
}
~~~

**Credential:**

~~~http
GET /api/inference HTTP/1.1
Host: api.example.com
Authorization: Payment eyJjaGFsbGVuZ2UiOnsiaWQiOiJUM25acjBDaDRyZzNFeDRtcGxlIn0sInBheWxvYWQiOnsidHlwZSI6ImF1dGhvcml6YXRpb24iLCJzaWduYXR1cmUiOiIweDljNWQuLi4iLCJzaWduYXR1cmVTY2hlbWUiOiJlZDI1NTE5IiwicHVibGljS2V5IjoiMHhhMWIyLi4uIiwicHFTaWduYXR1cmUiOiJBUUlELi4uIiwicHFQdWJsaWNLZXkiOiJCQVVHLi4uIn19
~~~

# Acknowledgements

The author thanks the Tempo team (Tom Meagher, Brendan Ryan, Jake
Moxey) for the underlying MPP framework, the EVM authors (Brett
DiNovi, Conner Swenberg, Kyle Scott) for the multi-chain method
pattern that informed the façade discriminator design, and the
broader IETF httpapi working group for review of the parent
specification.
