---
title: Solana Session Intent for HTTP Payment Authentication
abbrev: Solana Session
docname: draft-solana-session-00
version: 00
category: info
ipr: trust200902
submissiontype: independent
consensus: false

author:
  - name: Alexander Attar
    ins: A. Attar
    email: alexanderattar@gmail.com

normative:
  RFC2119:
  RFC3339:
  RFC4648:
  RFC8174:
  RFC8259:
  RFC8785:
  RFC9457:
  I-D.httpauth-payment:
    title: "The 'Payment' HTTP Authentication Scheme"
    target: https://datatracker.ietf.org/doc/draft-ietf-httpauth-payment/
    author:
      - name: Jake Moxey
    date: 2026-01
  I-D.solana-charge:
    title: "Solana Charge Intent for HTTP Payment Authentication"
    target: https://datatracker.ietf.org/doc/draft-solana-charge/
    author:
      - name: Ludo Galabru
      - name: Ilan Gitter
    date: 2026

informative:
  SOLANA-DOCS:
    title: "Solana Documentation"
    target: https://solana.com/docs
    author:
      - org: Solana Foundation
    date: 2026
  SPL-TOKEN:
    title: "SPL Token Program"
    target: https://solana.com/docs/tokens
    author:
      - org: Solana Foundation
    date: 2026
  SPL-TOKEN-2022:
    title: "SPL Token-2022 Program"
    target: https://solana.com/docs/tokens/extensions
    author:
      - org: Solana Foundation
    date: 2026
  ED25519-PROGRAM:
    title: "Solana Ed25519 Program"
    target: https://solana.com/docs/core/programs#ed25519-program
    author:
      - org: Solana Foundation
    date: 2026
  BASE58:
    title: "Base58 Encoding Scheme"
    target: https://datatracker.ietf.org/doc/html/draft-msporny-base58-03
    author:
      - name: Manu Sporny
    date: 2023
---

--- abstract

This document defines the "session" intent for the "solana" payment
method within the Payment HTTP Authentication Scheme
{{I-D.httpauth-payment}}.

A Solana session authorizes repeated paid access through a
channel-like lifecycle carried in MPP credentials. A client opens a
session with an initial escrowed amount and an initial signed
voucher, then submits updated signed vouchers over time with
monotonically increasing cumulative amounts. A session MAY also be
topped up or closed through additional credential actions.

This document defines four credential actions:
`action="open"`, `action="update"`, `action="topup"`, and
`action="close"`. Voucher signatures are generated over a
domain-separated canonical representation of the voucher object.
Servers verify voucher signatures, challenge binding, monotonic
session state, and any configured transaction proof requirements.

--- middle

# Introduction

HTTP Payment Authentication {{I-D.httpauth-payment}} defines a
challenge-response mechanism that gates access to resources behind
payments. This document registers the "session" intent for the
"solana" payment method.

The Solana charge intent {{I-D.solana-charge}} handles one-time
payments where each request requires an onchain transaction.
Sessions amortize onchain settlement across multiple requests,
making them suitable for high-frequency or low-value use cases
where per-request onchain transactions would be operationally
or economically inefficient {{SOLANA-DOCS}}.

A Solana session consists of:

1. an initial session open step, optionally backed by an onchain
   transaction proof;
2. one or more offchain voucher updates that monotonically increase
   authorized value;
3. optional topup actions that increase available escrow; and
4. an optional close action that finalizes or proves session
   settlement.

This document standardizes the HTTP-layer request, credential, and
verification semantics for Solana sessions. It does not require a
single canonical Solana escrow program ABI. Instead, it defines the
session action model, signed voucher model, verifier expectations,
and receipt semantics. A compatible settlement profile is described
informatively in {{informative-settlement-profile}}.

## Session Flow Overview {#session-flow-overview}

A typical session proceeds as follows:

~~~
   Client                        Server                    Solana
      |                            |                         |
      |  (1) GET /resource         |                         |
      |--------------------------> |                         |
      |                            |                         |
      |  (2) 402 Payment Required  |                         |
      |      (session request)     |                         |
      |<-------------------------- |                         |
      |                            |                         |
      |  (3) Open session          |                         |
      |      create open payload   |                         |
      |      + signed voucher      |                         |
      |      + optional openTx     |                         |
      |                            |                         |
      |  (4) Authorization:        |                         |
      |      Payment <credential>  |                         |
      |--------------------------> |                         |
      |                            |                         |
      |  (5) Verify open           |                         |
      |      initialize state      |                         |
      |      verify voucher        |                         |
      |      verify openTx if reqd |                         |
      |                            |                         |
      |  (6) 200 OK + Receipt      |                         |
      |<-------------------------- |                         |
      |                            |                         |
      |  (7) Subsequent request    |                         |
      |--------------------------> |                         |
      |                            |                         |
      |  (8) 402 Payment Required  |                         |
      |<-------------------------- |                         |
      |                            |                         |
      |  (9) Update payload        |                         |
      |      + newer signed        |                         |
      |      voucher               |                         |
      |--------------------------> |                         |
      |                            |                         |
      | (10) Verify signature      |                         |
      |      verify monotonicity   |                         |
      |      atomically update     |                         |
      |                            |                         |
      | (11) 200 OK + Receipt      |                         |
      |<-------------------------- |                         |
~~~

Optional `topup` and `close` actions extend the same lifecycle.

## Relationship to the Solana Charge Intent

This document shares the `method="solana"` payment method with
{{I-D.solana-charge}} but uses `intent="session"` instead of
`intent="charge"`.

The charge intent authorizes a one-time payment for a single
request. The session intent authorizes repeated paid access through
a session lifecycle composed of credential actions and signed
vouchers. Both intents use the same base `Payment` authentication
scheme and the same encoding conventions for structured values
carried in `WWW-Authenticate`, `Authorization`, and
`Payment-Receipt`.

# Requirements Language

{::boilerplate bcp14-tagged}

# Terminology

Session Channel
: A long-lived Solana payment context identified by `channelId`.
  The channel tracks payer, recipient, asset, authorized amount,
  and any settlement-related metadata required by the verifier.

Signed Session Voucher
: A structured object containing a voucher, signer identity,
  signature type, and signature bytes. Signed vouchers authorize
  cumulative payment updates within an existing session channel.

Voucher
: The unsigned voucher object nested inside a signed session
  voucher. It contains session-scoped identifiers and payment
  state such as cumulative amount, sequence, recipient,
  chain identifier, and channel program.

Cumulative Amount
: The total amount authorized from channel open through the current
  voucher. Each accepted voucher's cumulative amount MUST be greater
  than or equal to the previously accepted cumulative amount for the
  same session channel.

Sequence
: A monotonically increasing integer carried in the voucher.
  Prevents replay of older vouchers and provides ordering for
  concurrent server-side verification.

Server Nonce
: An opaque nonce value scoped to a session channel. Once accepted
  during session open, it MUST remain constant for subsequent
  updates on that session channel.

Authorization Mode
: A string that describes which signer model is used to authorize
  vouchers for a session channel. Examples include direct payer
  authorization and delegated session-key authorization.

Asset Descriptor
: The `asset` object in the session request. It identifies the
  settlement asset and its amount normalization parameters.

Pricing Descriptor
: The `pricing` object in the session request. It describes how
  session usage maps to debits, including the meter name and
  amount per unit.

Base Units
: The smallest transferable unit of the settlement asset. For SPL
  assets, this is determined by mint decimals. For native SOL, this
  is lamports.

# Intent Identifier

The intent identifier for this specification is "session".
It MUST be lowercase.

# Intent: "session"

The "session" intent represents a long-lived payment authorization
gating access to a resource over multiple requests. A client opens a
session once, then submits signed vouchers with monotonically
increasing cumulative amounts for subsequent requests. The server
verifies each voucher locally and grants access for the delta
between the newly accepted cumulative amount and the previously
accepted cumulative amount. A session MAY also be topped up or
closed.

# Encoding Conventions {#encoding}

All JSON {{RFC8259}} objects carried in auth-params or HTTP headers
in this specification MUST be serialized using the JSON
Canonicalization Scheme (JCS) {{RFC8785}} before encoding.

The resulting bytes MUST then be encoded using base64url
{{RFC4648}} Section 5 without padding characters (`=`).
Implementations MUST NOT append `=` padding when encoding, and MUST
accept input with or without padding when decoding.

This encoding convention applies to the `request` auth-param in
`WWW-Authenticate`, the credential token in `Authorization`, and the
receipt token in `Payment-Receipt`.

# Request Schema

The `request` auth-param of the `WWW-Authenticate: Payment` header
contains a JCS-serialized, base64url-encoded JSON object
(see {{encoding}}).

The Solana session request object contains the following fields:

asset
: REQUIRED. Describes the asset used for session settlement.

  The `asset` object contains:

  * `kind`: REQUIRED. MUST be either `"sol"` or `"spl"`.
  * `decimals`: REQUIRED. Non-negative integer used for base-unit
    normalization.
  * `mint`: REQUIRED when `kind="spl"`. Base58-encoded SPL mint
    address. MUST NOT be present when `kind="sol"`.
  * `symbol`: OPTIONAL. Display-only symbol hint.

channelProgram
: REQUIRED. Base58-encoded address of the channel program or
  settlement program expected by the verifier.

network
: OPTIONAL. Solana network identifier. Examples include
  `"mainnet-beta"`, `"devnet"`, and `"localnet"`. If omitted,
  implementations SHOULD treat `"mainnet-beta"` as the default.

pricing
: OPTIONAL. Describes how usage maps to debits within the session.

  The `pricing` object contains:

  * `amountPerUnit`: REQUIRED. Decimal string in base units.
  * `meter`: REQUIRED. Meter identifier for usage accounting.
  * `unit`: REQUIRED. Logical billed unit name.
  * `minDebit`: OPTIONAL. Minimum debit per request, in base units.

recipient
: REQUIRED. Base58-encoded recipient public key for session
  settlement.

sessionDefaults
: OPTIONAL. Server hints for default session behavior.

  The `sessionDefaults` object contains:

  * `suggestedDeposit`: OPTIONAL. Suggested initial escrow amount in
    base units.
  * `ttlSeconds`: OPTIONAL. Suggested session time-to-live.
  * `closeBehavior`: OPTIONAL. Close policy hint.
  * `settleInterval`: OPTIONAL. Settlement cadence hint.

verifier
: OPTIONAL. Server verifier policy hints.

  The `verifier` object contains:

  * `acceptAuthorizationModes`: OPTIONAL. List of accepted
    authorization-mode strings.
  * `maxClockSkewSeconds`: OPTIONAL. Allowed timestamp skew when
    evaluating expiry.

## Session Request Example

~~~json
{
  "asset": {
    "kind": "spl",
    "decimals": 6,
    "mint": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    "symbol": "USDC"
  },
  "channelProgram": "MPPsession1111111111111111111111111111111",
  "network": "mainnet-beta",
  "pricing": {
    "amountPerUnit": "1000",
    "meter": "inference_request",
    "unit": "request",
    "minDebit": "1000"
  },
  "recipient": "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU",
  "sessionDefaults": {
    "suggestedDeposit": "1000000",
    "ttlSeconds": 3600,
    "closeBehavior": "server_may_finalize"
  },
  "verifier": {
    "acceptAuthorizationModes": ["regular_budget", "regular_unbounded"],
    "maxClockSkewSeconds": 30
  }
}
~~~

This requests a session priced at 1000 base units per request
(0.001 USDC) with a suggested initial deposit of 1 USDC.

# Credential Schema

The `Authorization` header carries a single base64url-encoded JSON
token and no auth-params. The decoded object contains the following
top-level fields:

challenge
: REQUIRED. Echo of the challenge auth-params from
  `WWW-Authenticate`: `id`, `realm`, `method`, `intent`, `request`,
  and, if present, `expires`. This binds the credential to the exact
  challenge that was issued.

source
: OPTIONAL. Payer identifier string as defined by
  {{I-D.httpauth-payment}}. Solana implementations MAY use the
  payer's base58-encoded public key or a DID.

payload
: REQUIRED. A Solana-specific session payload. The `action` field
  determines which additional fields are present.

The following actions are defined:

- `action="open"`
- `action="update"`
- `action="topup"`
- `action="close"`

## Open Payload {#open-payload}

The `open` action initializes a session channel and provides the
initial signed voucher.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `action` | string | REQUIRED | `"open"` |
| `authorizationMode` | string | REQUIRED | Authorization mode for the session |
| `channelId` | string | REQUIRED | Session channel identifier |
| `depositAmount` | string | REQUIRED | Initial escrow amount in base units |
| `openTx` | string | REQUIRED | Onchain transaction reference proving session open |
| `payer` | string | REQUIRED | Base58-encoded payer public key |
| `expiresAt` | string | OPTIONAL | Session expiry hint as {{RFC3339}} timestamp |
| `capabilities` | object | OPTIONAL | Advertised authorizer capabilities |
| `voucher` | object | REQUIRED | Signed session voucher |

The `capabilities` object MAY include implementation-specific hints
such as `maxCumulativeAmount` or `allowedActions`.

Example (decoded):

~~~json
{
  "challenge": {
    "id": "kM9xPqWvT2nJrHsY4aDfEb",
    "realm": "api.example.com",
    "method": "solana",
    "intent": "session",
    "request": "eyJ...",
    "expires": "2026-03-21T12:05:00Z"
  },
  "payload": {
    "action": "open",
    "authorizationMode": "regular_budget",
    "channelId": "6Yd4vFHRk2pLJ9NwQxGjZ8Bt...",
    "depositAmount": "1000000",
    "openTx": "5UfDuX7hXbPjGUpTmt9PHRLsNGJe4dEny...",
    "payer": "9f2wLQ7A8sR6q7r7h6A6H9C8oP4e7nY6d2Y3vH7F5f1Q",
    "voucher": {
      "signature": "3QF7k8...",
      "signatureType": "ed25519",
      "signer": "9f2wLQ7A8sR6q7r7h6A6H9C8oP4e7nY6d2Y3vH7F5f1Q",
      "voucher": {
        "chainId": "solana:mainnet-beta",
        "channelId": "6Yd4vFHRk2pLJ9NwQxGjZ8Bt...",
        "channelProgram": "MPPsession1111111111111111111111111111111",
        "cumulativeAmount": "1000",
        "meter": "inference_request",
        "payer": "9f2wLQ7A8sR6q7r7h6A6H9C8oP4e7nY6d2Y3vH7F5f1Q",
        "recipient": "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU",
        "sequence": 0,
        "serverNonce": "0d6c8c9e-1111-4444-8888-16bb8a72f9c1",
        "units": "1"
      }
    }
  }
}
~~~

## Update Payload {#update-payload}

The `update` action submits a newer signed voucher for an existing
session channel.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `action` | string | REQUIRED | `"update"` |
| `channelId` | string | REQUIRED | Existing session channel identifier |
| `voucher` | object | REQUIRED | Signed session voucher |

Example (decoded):

~~~json
{
  "challenge": {
    "id": "nR8yQsXwU3oKtIsZ5bEgFc",
    "realm": "api.example.com",
    "method": "solana",
    "intent": "session",
    "request": "eyJ...",
    "expires": "2026-03-21T12:10:00Z"
  },
  "payload": {
    "action": "update",
    "channelId": "6Yd4vFHRk2pLJ9NwQxGjZ8Bt...",
    "voucher": {
      "signature": "4NdK2u...",
      "signatureType": "ed25519",
      "signer": "9f2wLQ7A8sR6q7r7h6A6H9C8oP4e7nY6d2Y3vH7F5f1Q",
      "voucher": {
        "chainId": "solana:mainnet-beta",
        "channelId": "6Yd4vFHRk2pLJ9NwQxGjZ8Bt...",
        "channelProgram": "MPPsession1111111111111111111111111111111",
        "cumulativeAmount": "2000",
        "expiresAt": "2026-03-21T13:00:00Z",
        "meter": "inference_request",
        "payer": "9f2wLQ7A8sR6q7r7h6A6H9C8oP4e7nY6d2Y3vH7F5f1Q",
        "recipient": "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU",
        "sequence": 1,
        "serverNonce": "0d6c8c9e-1111-4444-8888-16bb8a72f9c1",
        "units": "1"
      }
    }
  }
}
~~~

## Topup Payload {#topup-payload}

The `topup` action increases the tracked escrow amount for an existing
session channel.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `action` | string | REQUIRED | `"topup"` |
| `channelId` | string | REQUIRED | Existing session channel identifier |
| `additionalAmount` | string | REQUIRED | Additional escrow amount in base units |
| `topupTx` | string | REQUIRED | Onchain transaction reference proving topup |

## Close Payload {#close-payload}

The `close` action closes an existing session channel and MAY include
an onchain settlement transaction reference.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `action` | string | REQUIRED | `"close"` |
| `channelId` | string | REQUIRED | Existing session channel identifier |
| `closeTx` | string | OPTIONAL | Onchain settlement transaction reference |
| `voucher` | object | REQUIRED | Final signed session voucher |

# Signed Voucher Format {#voucher-format}

A signed session voucher consists of the following fields:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `signature` | string | REQUIRED | Signature over the serialized voucher bytes |
| `signatureType` | string | REQUIRED | Signature scheme discriminator |
| `signer` | string | REQUIRED | Public identifier of the signer |
| `voucher` | object | REQUIRED | Unsigned voucher object |

The unsigned voucher object contains:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `chainId` | string | REQUIRED | Chain identifier, for example `solana:mainnet-beta` |
| `channelId` | string | REQUIRED | Session channel identifier |
| `channelProgram` | string | REQUIRED | Channel or settlement program identifier |
| `cumulativeAmount` | string | REQUIRED | Monotonic cumulative authorized amount |
| `expiresAt` | string | OPTIONAL | Voucher expiration timestamp |
| `meter` | string | REQUIRED | Meter identifier |
| `payer` | string | REQUIRED | Payer public key |
| `recipient` | string | REQUIRED | Recipient public key |
| `sequence` | integer | REQUIRED | Monotonic sequence number |
| `serverNonce` | string | REQUIRED | Session-scoped nonce |
| `units` | string | REQUIRED | Meter units associated with the update |

## Voucher Serialization

Voucher signatures are computed over:

1. the ASCII domain separator string
   `"solana-mpp-session-voucher-v1:"`
2. followed by a canonical JSON serialization of the voucher object,
   with object keys sorted lexicographically and undefined fields
   omitted.

The resulting byte sequence is signed using the indicated signature
scheme.

## Signature Types

Implementations of this version MUST support `signatureType="ed25519"`.

Implementations MAY support additional signature types. One currently
used value is `"swig-session"`, which represents an alternative
session-authorizer model. Verifiers that do not recognize a signature
type MUST reject it unless they are explicitly configured with a
custom verifier for that signature type.

# Verification Procedure {#verification}

Upon receiving a request with a session credential, the server MUST:

1. Decode the base64url credential and parse the JSON.
2. Verify that `payload.action` is present and is one of
   `"open"`, `"update"`, `"topup"`, or `"close"`.
3. Verify or resolve an outstanding challenge using
   `credential.challenge.id` and the echoed challenge fields.
4. Verify that all fields in `credential.challenge` exactly match the
   challenge being verified.
5. Proceed with action-specific verification.

## Open Verification {#open-verification}

For credentials with `action="open"`, the server MUST:

1. Verify `payload.openTx` is present.
2. Verify `payload.depositAmount` is a valid non-negative integer
   string.
3. Parse the signed session voucher.
4. Verify `voucher.channelId` equals `payload.channelId`.
5. Verify `voucher.payer` equals `payload.payer`.
6. Verify `voucher.recipient` equals the configured recipient and the
   challenged recipient.
7. Verify `voucher.channelProgram` equals the challenged
   `channelProgram`.
8. Verify `voucher.chainId` matches the challenged network.
9. Verify `voucher.cumulativeAmount` does not exceed
   `payload.depositAmount`.
10. Verify `payload.authorizationMode`, if constrained by the
    verifier, is accepted.
11. Verify `voucher.expiresAt`, if present, has not passed.
12. Verify the voucher signature.
13. Verify any configured transaction proof requirement for
    `openTx`.
14. Initialize server-side session state for the channel.
15. Reject if the channel already exists.

## Update Verification {#update-verification}

For credentials with `action="update"`, the server MUST:

1. Look up stored session state for `payload.channelId`.
2. Reject if no active session exists for that channel.
3. Verify the channel is open and not expired.
4. Parse the signed session voucher.
5. Verify `voucher.channelId`, `payer`, `recipient`,
   `channelProgram`, and `serverNonce` match stored session state
   and the challenged request.
6. Verify `voucher.chainId` matches the challenged network.
7. Verify `voucher.sequence` is strictly greater than the previously
   accepted sequence.
8. Verify `voucher.cumulativeAmount` is greater than or equal to the
   previously accepted cumulative amount.
9. Verify `voucher.cumulativeAmount` does not exceed the tracked
   escrow amount.
10. Verify `voucher.expiresAt`, if present, has not passed.
11. Verify the voucher signature.
12. Atomically update stored session state with the new cumulative
    amount and sequence.
13. Grant access only for the delta between the new cumulative amount
    and the previously accepted cumulative amount.

## Topup Verification {#topup-verification}

For credentials with `action="topup"`, the server MUST:

1. Look up stored session state for `payload.channelId`.
2. Reject if no active session exists for that channel.
3. Verify the channel is open and not expired.
4. Verify `payload.additionalAmount` is a valid non-negative integer
   string.
5. Verify `payload.topupTx` is present.
6. Verify any configured transaction proof requirement for
   `topupTx`.
7. Atomically increase the tracked escrow amount.

## Close Verification {#close-verification}

For credentials with `action="close"`, the server MUST:

1. Look up stored session state for `payload.channelId`.
2. Reject if no active session exists for that channel.
3. Reject if the channel is already closed.
4. Parse the signed session voucher.
5. Apply the same binding, monotonicity, and expiry checks as
   `update`.
6. Verify `voucher.cumulativeAmount` does not exceed the tracked
   escrow amount.
7. Verify any configured transaction proof requirement for
   `closeTx`, when required.
8. Atomically mark the channel closed and record the final accepted
   cumulative amount and sequence.

# Session State Requirements {#server-state}

Servers MUST track per-channel session state. The following fields
are required:

- `channelId`
- payer public key
- recipient public key
- asset descriptor
- tracked escrow amount
- highest accepted cumulative amount
- highest accepted sequence
- session-scoped `serverNonce`
- status
- any verifier-required expiry metadata

The cumulative-amount and sequence updates MUST be atomic to prevent
race conditions where concurrent requests count the same voucher
delta twice. In-process locks are NOT safe across multiple server
instances. Horizontally-scaled deployments MUST use an external
atomic store such as Redis with WATCH/MULTI, PostgreSQL with
row-level locks, or equivalent.

# Transaction Proof Requirements {#transaction-proofs}

A Solana session MAY rely on onchain transaction proofs for some
actions. This document defines the HTTP-layer semantics for the
following optional transaction references:

- `openTx`
- `topupTx`
- `closeTx`

If a verifier requires one of these proofs, it MUST verify that the
referenced transaction:

1. exists at the required commitment level;
2. succeeded;
3. corresponds to the expected action for the channel;
4. targets the expected program or settlement path; and
5. reflects the expected amount semantics for that action.

This specification does not require a single canonical Solana escrow
program ABI for session settlement. Program-specific settlement logic
is implementation-defined unless separately standardized.

## Confirmation Requirements

When `openTx`, `topupTx`, or `closeTx` are used as required proofs,
clients MUST wait for at least the `confirmed` commitment level
before presenting the credential, and servers MUST verify the
transaction at at least `confirmed` commitment.

## Finality

Solana provides two commitment levels commonly used in payment
verification:

- `confirmed`: optimistic confirmation from a supermajority of
  validators. Sufficient for most session lifecycle proofs.
- `finalized`: stronger rollback resistance with higher latency.

`confirmed` is RECOMMENDED as the default for session action
verification. Servers MAY require `finalized` for higher-value
channels or more conservative settlement policies.

# Receipt Generation

Upon successful verification, the server MUST include a
`Payment-Receipt` header in the 200 response.

The receipt payload for Solana session contains:

| Field | Type | Description |
|-------|------|-------------|
| `method` | string | `"solana"` |
| `challengeId` | string | The challenge `id` from `WWW-Authenticate` |
| `reference` | string | Session channel identifier, or close transaction reference when a close action uses one |
| `status` | string | `"success"` |
| `timestamp` | string | {{RFC3339}} verification time |

Example receipt (decoded):

~~~json
{
  "method": "solana",
  "challengeId": "nR8yQsXwU3oKtIsZ5bEgFc",
  "reference": "6Yd4vFHRk2pLJ9NwQxGjZ8Bt...",
  "status": "success",
  "timestamp": "2026-03-21T12:05:02Z"
}
~~~

# Error Responses

When rejecting a session credential, the server MUST return HTTP 402
(Payment Required) with a fresh `WWW-Authenticate: Payment`
challenge per {{I-D.httpauth-payment}}.

The server SHOULD include a response body conforming to
RFC 9457 {{RFC9457}} Problem Details, with
`Content-Type: application/problem+json`.

Servers MUST use the standard problem types defined in
{{I-D.httpauth-payment}}: `malformed-credential`,
`invalid-challenge`, and `verification-failed`.

Example error response body:

~~~json
{
  "type": "https://paymentauth.org/problems/verification-failed",
  "title": "Invalid Session Voucher",
  "status": 402,
  "detail": "Voucher sequence 3 is not greater than previously accepted sequence 5"
}
~~~

# Security Considerations

## Transport Security

All communication MUST use TLS 1.2 or higher. Session credentials
MUST only be transmitted over HTTPS connections.

## Replay and Reordering Protection

Session replay protection depends on all of the following:

- strict channel binding through `channelId`;
- monotonic `sequence`;
- monotonic `cumulativeAmount`;
- a constant per-session `serverNonce`; and
- atomic server-side state updates.

Servers MUST reject any voucher whose sequence is less than or equal
to the highest previously accepted sequence for the channel.

Servers MUST reject any voucher whose cumulative amount is less than
the highest previously accepted cumulative amount for the channel.

## Signature Verification

Voucher verification MUST bind all of the following fields:

- `chainId`
- `channelId`
- `channelProgram`
- `payer`
- `recipient`
- `cumulativeAmount`
- `sequence`
- `serverNonce`
- `meter`
- `units`
- `expiresAt`, if present

A verifier MUST reject a voucher if any of these fields do not match
the expected session scope.

## Authorization Modes

Different authorization modes can imply different acceptable signers.
Implementations MUST verify that the voucher signer is authorized for
the session's recorded authorization mode.

Implementations that support delegated session keys MUST ensure that a
delegated signer cannot authorize vouchers outside the scope granted
for that channel.

## Atomic Session State

Session state transitions MUST be atomic. Without an atomic update,
concurrent verification can cause the same voucher delta to be
counted more than once, resulting in under-charging.

## Counterparty Risk

During an active session, the server carries risk equal to the
highest accepted cumulative amount minus any realized settlement.
Servers SHOULD limit this exposure through settlement policy,
deposit sizing, and verifier constraints.

## Client-Side Verification

Before opening a session, clients MUST verify at least:

1. `recipient` is the expected counterparty;
2. `asset` is the expected settlement asset;
3. `channelProgram` is acceptable;
4. `pricing`, if present, is acceptable for the resource;
5. `sessionDefaults.suggestedDeposit`, if present, is within
   acceptable limits.

## RPC Trust

When transaction proofs are required, the server relies on its
Solana RPC endpoint to provide accurate transaction data.
A compromised RPC could cause the server to accept action proofs that
did not actually occur. Servers SHOULD use trusted RPC providers or
run their own nodes.

# Informative Settlement Profile {#informative-settlement-profile}

This section is informative. It describes one compatible settlement
profile for Solana sessions. It is not the only possible settlement
profile for `intent="session"`.

A compatible profile uses a unidirectional escrow program with the
following high-level lifecycle:

- channel open
- partial settle
- channel close
- timeout reclaim

In such a profile, the server or recipient MAY periodically settle the
latest accepted voucher onchain to reduce counterparty exposure.

## Informative Timeout Rules

One compatible timeout model is:

- settle allowed while both the voucher and the channel are unexpired;
- close allowed while both the voucher and the channel are unexpired;
- reclaim allowed only after channel expiry.

This avoids ambiguous overlap between recipient close and payer
reclaim.

## Informative PDA Stability

One compatible program design derives the session account from stable
seeds only, for example payer, recipient, and a channel nonce set at
open time. Voucher sequence MUST NOT be part of PDA derivation because
it changes over time.

## Informative Ed25519 Onchain Verification {#ed25519-security}

When a settlement profile verifies voucher signatures onchain, Solana's
Ed25519 precompile program
(`Ed25519SigVerify111111111111111111111111111`)
{{ED25519-PROGRAM}} is NOT callable via CPI.

A compatible verification pattern is:

1. include an Ed25519 verify instruction in the transaction;
2. read the instructions sysvar from the settlement program; and
3. verify that the Ed25519 instruction checked the correct public key
   over the correct message bytes.

If this is implemented incorrectly, an attacker can bypass signature
verification and withdraw or settle funds using arbitrary voucher
data. Implementations that use this pattern MUST include adversarial
tests covering:

- missing Ed25519 verify instruction;
- wrong public key; and
- wrong message bytes.

# IANA Considerations

## Payment Method Registration

This document uses the `solana` method identifier registered by
{{I-D.solana-charge}}.

## Payment Intent Registration

This document requests registration of the following entry in the
"HTTP Payment Intents" registry established by
{{I-D.httpauth-payment}}:

| Intent | Applicable Methods | Description | Reference |
|--------|-------------------|-------------|-----------|
| `session` | `solana` | Repeated paid access on Solana through signed session vouchers and session lifecycle actions | This document |

--- back

# Examples

## Session Open

A session priced at 0.001 USDC per request, with a suggested initial
deposit of 1 USDC.

**Challenge (402 response):**

~~~http
HTTP/1.1 402 Payment Required
WWW-Authenticate: Payment id="kM9xPqWvT2nJrHsY4aDfEb",
  realm="api.example.com",
  method="solana",
  intent="session",
  request="<base64url-encoded request>",
  expires="2026-03-21T12:05:00Z"
Cache-Control: no-store
~~~

Decoded `request`:

~~~json
{
  "asset": {
    "kind": "spl",
    "decimals": 6,
    "mint": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    "symbol": "USDC"
  },
  "channelProgram": "MPPsession1111111111111111111111111111111",
  "network": "mainnet-beta",
  "pricing": {
    "amountPerUnit": "1000",
    "meter": "inference_request",
    "unit": "request",
    "minDebit": "1000"
  },
  "recipient": "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU",
  "sessionDefaults": {
    "suggestedDeposit": "1000000",
    "ttlSeconds": 3600,
    "closeBehavior": "server_may_finalize"
  }
}
~~~

Decoded credential:

~~~json
{
  "challenge": {
    "id": "kM9xPqWvT2nJrHsY4aDfEb",
    "realm": "api.example.com",
    "method": "solana",
    "intent": "session",
    "request": "<base64url-encoded request>",
    "expires": "2026-03-21T12:05:00Z"
  },
  "payload": {
    "action": "open",
    "authorizationMode": "regular_budget",
    "channelId": "6Yd4vFHRk2pLJ9NwQxGjZ8Bt...",
    "depositAmount": "1000000",
    "openTx": "5UfDuX7hXbPjGUpTmt9PHRLsNGJe4dEny...",
    "payer": "9f2wLQ7A8sR6q7r7h6A6H9C8oP4e7nY6d2Y3vH7F5f1Q",
    "voucher": {
      "signature": "3QF7k8...",
      "signatureType": "ed25519",
      "signer": "9f2wLQ7A8sR6q7r7h6A6H9C8oP4e7nY6d2Y3vH7F5f1Q",
      "voucher": {
        "chainId": "solana:mainnet-beta",
        "channelId": "6Yd4vFHRk2pLJ9NwQxGjZ8Bt...",
        "channelProgram": "MPPsession1111111111111111111111111111111",
        "cumulativeAmount": "1000",
        "meter": "inference_request",
        "payer": "9f2wLQ7A8sR6q7r7h6A6H9C8oP4e7nY6d2Y3vH7F5f1Q",
        "recipient": "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU",
        "sequence": 0,
        "serverNonce": "0d6c8c9e-1111-4444-8888-16bb8a72f9c1",
        "units": "1"
      }
    }
  }
}
~~~

Decoded receipt:

~~~json
{
  "method": "solana",
  "challengeId": "kM9xPqWvT2nJrHsY4aDfEb",
  "reference": "6Yd4vFHRk2pLJ9NwQxGjZ8Bt...",
  "status": "success",
  "timestamp": "2026-03-21T12:04:58Z"
}
~~~

## Session Update

Decoded credential:

~~~json
{
  "challenge": {
    "id": "nR8yQsXwU3oKtIsZ5bEgFc",
    "realm": "api.example.com",
    "method": "solana",
    "intent": "session",
    "request": "<base64url-encoded request>",
    "expires": "2026-03-21T12:10:00Z"
  },
  "payload": {
    "action": "update",
    "channelId": "6Yd4vFHRk2pLJ9NwQxGjZ8Bt...",
    "voucher": {
      "signature": "4NdK2u...",
      "signatureType": "ed25519",
      "signer": "9f2wLQ7A8sR6q7r7h6A6H9C8oP4e7nY6d2Y3vH7F5f1Q",
      "voucher": {
        "chainId": "solana:mainnet-beta",
        "channelId": "6Yd4vFHRk2pLJ9NwQxGjZ8Bt...",
        "channelProgram": "MPPsession1111111111111111111111111111111",
        "cumulativeAmount": "2000",
        "expiresAt": "2026-03-21T13:00:00Z",
        "meter": "inference_request",
        "payer": "9f2wLQ7A8sR6q7r7h6A6H9C8oP4e7nY6d2Y3vH7F5f1Q",
        "recipient": "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU",
        "sequence": 1,
        "serverNonce": "0d6c8c9e-1111-4444-8888-16bb8a72f9c1",
        "units": "1"
      }
    }
  }
}
~~~

This update increases the cumulative amount from 1000 to 2000 base
units, so the server grants access for a delta of 1000 base units.

Decoded receipt:

~~~json
{
  "method": "solana",
  "challengeId": "nR8yQsXwU3oKtIsZ5bEgFc",
  "reference": "6Yd4vFHRk2pLJ9NwQxGjZ8Bt...",
  "status": "success",
  "timestamp": "2026-03-21T12:05:02Z"
}
~~~

# Acknowledgements

The author thanks the Tempo team for the earlier session method work
that informed this area, and the Solana Foundation for the Solana
charge specification and session SDK work that this document builds
on.