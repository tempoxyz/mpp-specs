---
title: EVM Stake Intent for HTTP Payment Authentication
abbrev: EVM Stake
docname: draft-evm-stake-00
version: 00
category: info
ipr: noModificationTrust200902
submissiontype: IETF
consensus: true

author:
  - name: Jonathan Schwartz
    ins: J. Schwartz
    email: jonathan@glif.io
    org: GitBond

normative:
  RFC2119:
  RFC3339:
  RFC4648:
  RFC8174:
  RFC8259:
  EIP-712:
    title: "Typed structured data hashing and signing"
    target: https://eips.ethereum.org/EIPS/eip-712
    author:
      - name: Remco Bloemen
    date: 2017-09
  ERC-20:
    title: "Token Standard"
    target: https://eips.ethereum.org/EIPS/eip-20
  I-D.httpauth-payment:
    title: "The 'Payment' HTTP Authentication Scheme"
    target: https://datatracker.ietf.org/doc/draft-ryan-httpauth-payment/
    author:
      - name: Jake Moxey
    date: 2026-01

informative:
---

--- abstract

This document defines the "stake" payment intent for the "evm" payment
method in the Payment HTTP Authentication Scheme. The "stake" intent
represents a collateral-based access pattern where ERC-20 tokens are locked
in an EVM escrow contract rather than transferred as payment. Access is
granted upon proof that a protected scope currently has a qualifying active
stake. This specification defines two authorization modes:
`scope-beneficiary-active`, which binds access to a specific beneficiary and
requires challenge-bound beneficiary control proof, and `scope-active`,
which only requires that at least one qualifying active stake exists for the
protected scope. In either mode, the stake may later be refunded, slashed,
or withdrawn according to the escrow contract's rules.

--- middle

# Introduction

The "stake" intent introduces a collateral-based alternative to direct
payment. Instead of transferring funds to a recipient, a payer locks tokens in
an escrow contract on behalf of a beneficiary. The server authorizes access
based on active stake for a protected scope.

This specification defines two authorization modes:

- **`scope-beneficiary-active`**: the requester proves challenge-bound control
  of a beneficiary, and the server verifies that beneficiary currently has a
  qualifying active stake for the challenged scope
- **`scope-active`**: the server verifies that the challenged scope currently
  has at least one qualifying active stake, without requiring challenge-bound
  proof that the requester controls the staking beneficiary

In `scope-beneficiary-active`, a server MAY omit `beneficiary` from the
challenged request. In that case, any requester who proves control of a
beneficiary with a qualifying active stake for the challenged scope MAY
satisfy the challenge. In `scope-active`, any qualifying active stake for the
challenged scope MAY satisfy the challenge. Presence or omission of
`beneficiary` does not change that owner-agnostic authorization semantic.

This specification defines the EVM request, proof, and verification rules for
stake-backed access. It does not prescribe a specific escrow contract design
beyond requiring that servers can verify active stake state and the challenged
terms (see {{escrow-verification}}).

This model enables several patterns:

- **Zero-cost access**: The server gates access without charging users;
  well-behaved participants get their stake back
- **Enforcement via slashing**: The counterparty can penalize policy
  violations by slashing the stake
- **Yield-based monetization**: Staked tokens may be deposited into
  yield-bearing protocols, enabling new types of business models
- **Sponsored access**: A payer can fund stake on behalf of a different
  beneficiary
- **Reversible commitments**: Users can lock collateral rather than make
  irreversible payments

## Escrow Contract Trust

The escrow contract address is specified by the server in the challenge
request. The security properties of the stake depend entirely on the contract
implementation. A well-designed escrow contract enforces fair refund and slash
rules, but a malicious contract could behave arbitrarily.

Clients SHOULD verify the escrow contract before interacting with it.
Canonical, audited escrow contracts MAY be published by ecosystem
participants and referenced by multiple server implementations. See
{{contract-verification}} for guidance.

## Relationship to the EVM Payment Method

This document defines how the `evm` payment method implements the "stake"
intent. It specifies the EVM request fields, ERC-20 staking semantics,
EIP-712 proof rules, and escrow verification requirements needed for
interoperable stake-backed access.

# Requirements Language

{::boilerplate bcp14-tagged}

# Terminology

Stake
: A collateral deposit where tokens are locked in an escrow contract to gain
resource access.

Escrow
: A smart contract or custodial mechanism that holds staked tokens. The
escrow's rules (refund conditions, slash authority, withdrawal rights) are
defined by its implementation.

Counterparty
: The entity designated by the server as the escrow's controlling party.
Typically authorized to trigger refunds or slashes, but the exact authority
depends on the escrow contract.

Beneficiary
: The authorization subject for stake-backed access. The server grants access
when this beneficiary has an active stake for the challenged scope. A
beneficiary is always relevant to escrow state, but only
`scope-beneficiary-active` requires challenge-bound proof that the requester
currently controls that beneficiary.

Payer
: The account that funds the escrow deposit. The payer MAY be the same as the
beneficiary, but sponsorship flows MAY use a different payer.

Scope
: A stable identifier for the protected access surface. A scope identifies what
the active stake authorizes. It is not a per-challenge replay key and is not a
contract storage key. Depending on the deployment profile, a scope MAY be an
IPFS content identifier, a mutable application-level reference, a canonical
resource path, or another stable identifier chosen by the server.

Authorization Mode
: The challenged authorization semantics for the protected scope.
`scope-beneficiary-active` binds access to a beneficiary with proof of current
beneficiary control. `scope-active` is owner-agnostic and only requires that
the challenged scope have a qualifying active stake.

Escrow ID
: A contract-assigned identifier for one escrow instance. Escrow IDs are
implementation details used for storage, events, refund flows, slash flows,
and audit trails.

Base Units
: The smallest denomination of a currency or asset. For tokens, this is the
smallest transferable unit defined by the token's decimal precision.

# Intent Semantics

## Definition

The "stake" intent represents a request for tokens to be locked in an escrow
contract so that access can be authorized for a protected scope. Access is
granted upon proof that the challenged mode's conditions hold:

1. for `scope-beneficiary-active`, the requester controls the beneficiary for
   the current challenge and that beneficiary currently has an active stake for
   the required scope; or
2. for `scope-active`, the challenged scope currently has at least one active
   stake that satisfies the challenged terms, regardless of which beneficiary
   provided it.

## Properties

| Property              | Value                                                      |
| --------------------- | ---------------------------------------------------------- |
| **Intent Identifier** | `stake`                                                    |
| **Payment Timing**    | Before request (active stake must already exist)           |
| **Challenge Replay**  | Single-use per challenge `id`                              |
| **Stake Reuse**       | Active stake MAY satisfy multiple challenges for the scope |
| **Reversibility**     | Contract-dependent (see {{resolution}})                    |

## Lifecycle

The stake intent has a three-phase lifecycle:

### Phase 1: Prove

1. Server issues a 402 response with `intent="stake"`
2. Client ensures an active escrow exists for the challenged scope
3. Client submits a credential matching the challenged mode:
   - `scope-beneficiary-active` proves beneficiary control for the challenge
   - `scope-active` attests that the client is responding to a scope-only
     active-stake challenge
4. Server verifies active stake and grants access
5. Server MAY return a `Payment-Receipt` header

Servers MAY provide implementation-specific assistance to help a client
establish an escrow, such as wallet UX hints, calldata templates, or links to
separate staking flows. Such assistance is optional and is not part of the
normative server role. A conforming server MAY be verification-only and need
not submit, relay, sponsor, or otherwise cause escrow-creation transactions to
execute.

### Phase 2: Active

While the escrow is active, the challenged scope remains authorized according
to the challenged mode. In `scope-beneficiary-active`, this means the verified
beneficiary has ongoing access to the protected scope. In `scope-active`, this
means the scope remains accessible so long as a qualifying active stake still
exists. An already-active stake MAY satisfy later challenges for the same scope
without requiring a new escrow deposit, but later protected requests still use
the normal challenge-response flow unless a higher-layer session mechanism
defines otherwise. A server MAY establish such a mechanism by issuing an
optional `stake-session` token as described in
{{optional-stake-session-tokens}}. When later protected requests continue to
use the normal challenge-response flow, each later challenge requires its own
fresh credential. In `scope-beneficiary-active`, that fresh credential includes
a new challenge-bound beneficiary-control proof. In `scope-active`, the server
still issues a fresh challenge and re-verifies active stake, even though no
beneficiary-control proof is required.

### Phase 3: Resolution {#resolution}

The escrow resolves when it transitions out of the active state. Common
resolution outcomes include:

- **Refund**: The counterparty returns the staked tokens to the beneficiary.
  This is the expected outcome for well-behaved participants.
- **Slash**: The counterparty transfers the staked tokens to itself as a
  penalty for policy violation.
- **Withdraw**: The payer or beneficiary reclaims the stake, if permitted by
  the escrow contract.

The set of available resolution actions and the conditions under which they are
permitted are defined by the escrow contract implementation and are outside the
scope of this specification. Servers MUST revoke access when the escrow is no
longer active, regardless of the resolution type.

## Atomicity

The "stake" intent is atomic at verification time: the server MUST NOT grant
access until the active stake has been verified with the correct parameters.
Inactive or mismatched escrows MUST be rejected.

# Request Schema

The `request` parameter for a "stake" intent is a JSON object with
shared fields defined by this specification and method-specific
extensions in the `methodDetails` field. The `request` JSON MUST be
serialized using JSON Canonicalization Scheme (JCS) and base64url-encoded
without padding per {{I-D.httpauth-payment}}.

## Shared Fields

### Required Fields

| Field          | Type   | Description                                                      |
| -------------- | ------ | ---------------------------------------------------------------- |
| `amount`       | string | Minimum stake amount in base units                               |
| `contract`     | string | Escrow contract address in method-native format                  |
| `counterparty` | string | Address authorized to control the escrow                         |
| `mode`         | string | Authorization mode: `scope-beneficiary-active` or `scope-active` |
| `scope`        | string | Stable identifier for the protected scope                        |
| `token`        | string | ERC-20 token contract address                                    |

### Optional Fields

| Field         | Type   | Description                                                                                                                                                                                                                                                                                                             |
| ------------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `beneficiary` | string | In `scope-beneficiary-active`, the beneficiary the server expects to authorize. If omitted, the beneficiary is recovered from the ownership proof. In `scope-active`, this field SHOULD be omitted. If present, it is non-authoritative metadata and MUST NOT change the mode's owner-agnostic authorization semantics. |
| `description` | string | Human-readable description of the stake requirement                                                                                                                                                                                                                                                                     |
| `externalId`  | string | Server reference identifier                                                                                                                                                                                                                                                                                             |
| `policy`      | string | Identifier for the counterparty's policy                                                                                                                                                                                                                                                                                |
| `resource`    | string | Identifier for the resource being accessed                                                                                                                                                                                                                                                                              |

Challenge expiry is conveyed by the `expires` auth-param in
`WWW-Authenticate` per {{I-D.httpauth-payment}}, using {{RFC3339}}
format. Request objects MUST NOT duplicate the expiry value.

`token` MUST identify an ERC-20 token contract. Blockchain-native tokens are
out of scope for this specification and MUST NOT be represented in `token`.

## Scope Semantics

`scope` is the canonical identifier for the protected access surface.
It MUST be stable across challenges for the same protected surface and MUST NOT
be used as a per-challenge replay key.

This specification intentionally leaves scope derivation to implementations.
Method specifications or profiles MAY define concrete derivation rules. A
profile MAY, for example, require `scope` to be a `bytes32` hash in EVM
environments.

`scope` does not need to be on-chain-native. Depending on the application, it
MAY identify immutable content such as an IPFS content identifier, a mutable
reference such as a document slug or application-specific handle, a canonical
resource path, or another stable identifier for the protected surface.

## Method Extensions

Payment methods MAY define additional fields in the `methodDetails`
object. These fields are method-specific and MUST be documented in the
payment method specification. Clients that do not recognize a payment
method SHOULD ignore `methodDetails` but MUST still be able to parse
the shared fields.

Method-specific extensions MAY include optional fields that help clients or
their delegates establish an escrow. Such fields are advisory only; defining
them does not require a server to submit, relay, or sponsor escrow-creation
transactions.

Example method-specific fields include:

| Field     | Type   | Description                             |
| --------- | ------ | --------------------------------------- |
| `chainId` | number | Chain identifier for the target network |

# Credential Requirements

## Payload

The credential structure follows {{I-D.httpauth-payment}}, containing
`challenge`, `payload`, and an optional `source` field.

For `scope-beneficiary-active`, the server MUST be able to determine the
beneficiary identity from the credential. This identity MAY be conveyed in the
challenged `beneficiary` field, MAY be recoverable directly from the signature
scheme, or MAY be conveyed in `source` when the payment method defines how
`source` maps to the beneficiary identity. At least one of these mechanisms
MUST be available. For `scope-active`, the server MUST instead be able to
evaluate whether qualifying active stake exists for the challenged scope and
terms.

The `payload` for a "stake" intent MUST use a single proof type:

| Proof Type               | `type` Value                 | Description                                                                  |
| ------------------------ | ---------------------------- | ---------------------------------------------------------------------------- |
| Scope Beneficiary Active | `"scope-beneficiary-active"` | Proof that the requester controls the beneficiary for the challenged scope   |
| Scope Active             | `"scope-active"`             | Owner-agnostic proof that the challenged scope has a qualifying active stake |

The `payload.type` MUST match the challenged `mode`.

### Scope-Beneficiary-Active Payload

```json
{
  "signature": "0x1234...abcd",
  "type": "scope-beneficiary-active"
}
```

The `signature` field is method-specific. This specification defines the
required semantics, but each payment method MUST define the exact signature
algorithm, encoding, verification procedure, and beneficiary recovery rules.
The signature MUST be bound to the challenge and MUST allow the server to
recover or verify the beneficiary address. The signature MUST NOT merely prove
that some past escrow-creation transaction occurred.

If `source` is present, it MUST match the recovered beneficiary identity.
`source` alone is not authoritative and MUST NOT override the beneficiary
obtained from the method-defined proof verification procedure.

### Scope-Active Payload

```json
{
  "type": "scope-active"
}
```

`scope-active` does not include a beneficiary-control signature. If `source` is
present, it is informational only and MUST NOT be treated as proof that the
requester controls the beneficiary. A server using `scope-active` MUST base its
authorization decision on qualifying active stake state, not on unsigned
identity claims.

## Challenge Freshness

Stake credentials are single-use at the challenge level, not at the scope
level. Servers MUST reject replayed credentials for the same challenge `id`.
An already-active stake MAY satisfy later challenges for the same scope,
subject to normal server replay protection. Reuse of the underlying stake does
not eliminate the need for a new challenge on later protected requests. In
`scope-beneficiary-active`, it also does not eliminate the need for a new
challenge-bound beneficiary proof.

# Escrow Verification {#escrow-verification}

Servers MUST verify that an escrow is active and that its parameters
match the original challenge before granting access. The mechanism used
to query escrow state is an implementation detail and is outside the
scope of this specification. Servers MAY use contract state queries,
event logs, indexers, or any other method appropriate for their target
platform.

Server-side escrow creation or transaction submission is outside the scope of
this specification. A server MAY choose to offer such functionality as an
implementation-specific UX feature, but conforming servers are only required to
issue challenges and verify active escrow state.

Implementations SHOULD expose a canonical active lookup by `(scope,
beneficiary)` when supporting `scope-beneficiary-active`. Implementations that
support owner-agnostic `scope-active` SHOULD also define a canonical lookup or
query procedure for determining whether any qualifying active stake exists for a
scope and challenged term set. Escrow IDs are internal implementation details
and SHOULD NOT appear in the public challenge or credential shape.

# Verification

## Server Responsibilities

Servers verifying a "stake" credential MUST:

1. Verify the challenge `id` matches an outstanding challenge
2. Verify the challenge has not expired
3. Verify that the challenged `mode` is supported
4. For `scope-beneficiary-active`, determine the beneficiary from the
   challenged `beneficiary` field, from method-defined signature recovery, or
   from a method-defined mapping of `source`
5. For `scope-beneficiary-active`, verify the
   `scope-beneficiary-active` ownership proof and recover or validate that
   beneficiary
6. Verify active escrow state according to the challenged mode:
   - for `scope-beneficiary-active`, verify that an active escrow exists for
     `(scope, beneficiary)`
   - for `scope-active`, verify that at least one qualifying active escrow
     satisfies the challenged scope and terms
7. Verify that the escrow parameters match the challenge
8. Verify that the escrow principal meets or exceeds the requested amount

## On-Chain Verification {#on-chain-verification}

Servers MUST verify that the escrow is active before granting access.
Historical escrow-creation evidence alone is insufficient: a client could have
created an escrow and then immediately resolved it. Servers MUST confirm the
escrow is currently active using whatever query mechanism is appropriate for
their escrow contract and platform.

When verifying escrow state, servers MUST confirm that the active escrow
matches the challenge:

- In `scope-beneficiary-active`, beneficiary matches the recovered proof
  subject
- In `scope-beneficiary-active`, if the request explicitly specifies
  `beneficiary`, escrow beneficiary matches that request field
- Counterparty matches the request
- Token matches the request
- Scope matches the request
- Amount meets or exceeds the requested stake

Servers MAY additionally verify escrow creation events as a supplementary audit
mechanism, but such events are not the normative stake proof.

## Ongoing Verification

Servers SHOULD periodically re-verify escrow state for ongoing access.
A withdrawn, refunded, or slashed escrow MUST result in access revocation.
Servers MAY implement webhooks, event subscriptions, or polling to detect
escrow state changes.

Unless a higher-layer session mechanism is in use, later protected requests
SHOULD issue a fresh challenge and require a fresh credential matching the
challenged mode, while reusing the same active stake if it still satisfies the
challenged scope and terms. Later `scope-beneficiary-active` requests require a
fresh challenge-bound proof. Later `scope-active` requests require a fresh
challenge and active-stake verification, but not a new beneficiary proof.

## Optional Stake-Session Tokens {#optional-stake-session-tokens}

After successfully verifying a `scope-beneficiary-active` or `scope-active`
credential, a server MAY establish a higher-layer session for the protected
scope and, when relevant, the beneficiary. This specification refers to such a
server-issued session artifact as a `stake-session` token.

A `stake-session` token is not part of the public Payment challenge or
credential format. It is a higher-layer mechanism that allows later protected
requests to omit a fresh stake credential while the session remains valid. A
`stake-session` token attests only that the server previously verified the
challenged mode and an active matching escrow. It does not itself prove current
beneficiary control.

The encoding and transport of a `stake-session` token are out of scope for this
specification. Implementations MAY use an opaque session identifier, a signed
token such as JWS, or another integrity-protected session artifact. The
`Payment-Receipt` header is a settlement receipt, not a `stake-session` token,
unless another specification explicitly defines such use.

If a server issues a `stake-session` token, the associated session state,
whether self-contained or lookup-based, MUST be bound to at least:

- mode
- scope
- contract
- counterparty
- token
- minimum authorized amount
- payment method
- relevant method details needed to uniquely identify the escrow environment
  (for example, `chainId`)
- issuance time
- expiry time
- unique session identifier
- intended audience or origin, when applicable

If the verified mode was `scope-beneficiary-active`, or if the challenge
explicitly specified a beneficiary, the session state MUST also be bound to
that beneficiary.

Before granting access on the basis of a `stake-session` token, the server
MUST:

1. verify the token is valid and unexpired;
2. verify the token corresponds to the protected scope being accessed;
3. verify active escrow state still satisfies the bound mode and any bound
   beneficiary requirements; and
4. verify the escrow terms still satisfy the bound session parameters.

Servers MUST revoke or reject a `stake-session` token when the corresponding
escrow is withdrawn, refunded, slashed, expired according to server policy, or
otherwise no longer satisfies the bound scope and terms. Servers SHOULD keep
`stake-session` tokens short-lived and SHOULD re-verify escrow state before
renewal.

When a valid `stake-session` token is accepted, the server MAY skip issuing a
fresh payment challenge and MAY authorize access without obtaining a new
stake credential for that request. When no valid `stake-session` token is
present, the normal challenge-response flow applies.

## EVM Proof Rules

For the `evm` payment method, the `scope-beneficiary-active` proof MUST be an
EIP-712 signature over typed structured data using the beneficiary's
secp256k1 key.

The proof MUST bind all of the following values:

Domain:

- `chainId`
- `verifyingContract`

Message:

- `challenge.id`
- `expires`
- `scope`
- `beneficiary`
- `counterparty`
- `token`
- `amount`

If the challenge explicitly specifies `beneficiary`, the signed `beneficiary`
MUST match it. If the challenge omits `beneficiary`, the recovered signer MUST
be treated as the beneficiary for escrow verification.

This specification requires an exact typed-data schema, signature encoding,
and signer-recovery procedure. For interoperability, implementations SHOULD
accept the canonical 65-byte ECDSA encoding (`r || s || v`) and MAY
additionally accept the 64-byte compact EIP-2098 form. Implementations
SHOULD use a single canonical typed-data schema for interoperability rather
than defining server-specific variants.

For the `evm` payment method, `source` is OPTIONAL in
`scope-beneficiary-active` and MUST NOT be used as a substitute for signer
recovery. If present, it MUST be treated only as an additional claimed
identifier and MUST match the recovered beneficiary identity.

For `scope-active`, no beneficiary-control signature is required.
Implementations supporting `scope-active` MUST define how the server
determines whether a qualifying active escrow exists for the challenged
scope and terms. This MAY be by using a scope-level query, consulting an
indexer, aggregating qualifying active escrows, or another method-defined
lookup. If a `beneficiary` field is present in a `scope-active` challenge,
it MUST NOT be treated as changing the mode's owner-agnostic semantics or
as proof of beneficiary control. Unsigned `source` or other unsigned
identity hints MUST NOT be treated as proof of beneficiary control.

# Examples

### Scope-Beneficiary-Active Challenge

```json
{
  "amount": "5000000",
  "mode": "scope-beneficiary-active",
  "contract": "0x651B0DB0D25A49d0CBbF790a404cE10A3F401821",
  "counterparty": "0x742d35Cc6634C0532925a3b844Bc9e7595f8fE00",
  "description": "Stake required to access premium content",
  "externalId": "document:incident-report",
  "policy": "document-access-v1",
  "resource": "/documents/incident-report",
  "scope": "0x9a3f...7b2e",
  "token": "0x20c0000000000000000000000000000000000000",
  "methodDetails": {
    "chainId": 42431
  }
}
```

### Scope-Beneficiary-Active Credential

```json
{
  "challenge": {
    "id": "challenge-123",
    "method": "tempo",
    "intent": "stake",
    "request": {
      "amount": "5000000",
      "mode": "scope-beneficiary-active",
      "contract": "0x651B0DB0D25A49d0CBbF790a404cE10A3F401821",
      "counterparty": "0x742d35Cc6634C0532925a3b844Bc9e7595f8fE00",
      "scope": "0x9a3f...7b2e",
      "token": "0x20c0000000000000000000000000000000000000",
      "methodDetails": {
        "chainId": 42431
      }
    }
  },
  "payload": {
    "signature": "0x1234...abcd",
    "type": "scope-beneficiary-active"
  },
  "source": "did:pkh:eip155:42431:0x1234567890abcdef1234567890abcdef12345678"
}
```

### Scope-Active Challenge

```json
{
  "amount": "5000000",
  "mode": "scope-active",
  "contract": "0x651B0DB0D25A49d0CBbF790a404cE10A3F401821",
  "counterparty": "0x742d35Cc6634C0532925a3b844Bc9e7595f8fE00",
  "description": "Any active bond unlocks the shared resource",
  "resource": "/rooms/general",
  "scope": "0x9a3f...7b2e",
  "token": "0x20c0000000000000000000000000000000000000",
  "methodDetails": {
    "chainId": 42431
  }
}
```

### Scope-Active Credential

```json
{
  "challenge": {
    "id": "challenge-456",
    "method": "tempo",
    "intent": "stake",
    "request": {
      "amount": "5000000",
      "mode": "scope-active",
      "contract": "0x651B0DB0D25A49d0CBbF790a404cE10A3F401821",
      "counterparty": "0x742d35Cc6634C0532925a3b844Bc9e7595f8fE00",
      "scope": "0x9a3f...7b2e",
      "token": "0x20c0000000000000000000000000000000000000",
      "methodDetails": {
        "chainId": 42431
      }
    }
  },
  "payload": {
    "type": "scope-active"
  }
}
```

# Security Considerations

## Stake Amount Verification

Clients MUST verify the requested stake amount is appropriate before locking
tokens. Malicious servers could request excessive collateral. Clients SHOULD
warn users when stake amounts exceed a configurable threshold.

## Counterparty Trust

The counterparty has authority over the escrow as defined by the contract.
Depending on the contract implementation, this may include the ability to slash
the entire stake. Clients SHOULD verify the counterparty address against a
known trusted set or warn users about unknown counterparties. The
counterparty's policies SHOULD be publicly documented.

## Contract Verification {#contract-verification}

Clients MUST verify the escrow contract address before interacting with it.
Malicious servers could specify a contract that steals tokens rather than
escrowing them.

Ecosystem participants MAY publish canonical escrow contract addresses
that are audited, well-known, and reusable across server implementations.
Clients SHOULD maintain a registry of trusted escrow contracts and warn
users when encountering an unknown contract. Verification methods include:

- Checking the contract address against a known-good list
- Verifying contract bytecode matches a published reference
- Checking for audit attestations on-chain

## Replay Protection

Servers MUST implement replay protection for challenge credentials. The replay
unit is the challenge `id`, not the scope. Reusing an active stake across later
challenges is allowed only when each later challenge has its own valid
challenge-response exchange.

## Mode Selection

`scope-active` is weaker than `scope-beneficiary-active`. Servers MUST use
`scope-beneficiary-active` when authorization depends on who controls the
stake, when a protected action should be attributable to the staking
beneficiary, or when the requester must prove current control of the active
stake.

Servers SHOULD use `scope-active` only for owner-agnostic resources where the
authorization rule is intentionally "this scope has at least one qualifying
active stake" rather than "this requester controls the beneficiary that
staked."

## Scope Derivation

Servers MUST derive `scope` deterministically for the protected access surface
they intend to authorize. If a server changes scope derivation unexpectedly, it
may strand legitimate active stakes or unintentionally merge distinct access
surfaces into one authorization domain.

## Beneficiary and Payer Separation

Implementations MUST NOT assume that the payer and beneficiary are the same
account. In `scope-beneficiary-active`, access is granted based on the
beneficiary's active stake and the requester's control of that beneficiary.
In `scope-active`, funding and active-stake ownership may still involve a
beneficiary even though authorization is owner-agnostic.

## Escrow Liveness

Servers MUST re-verify escrow state for ongoing access. A refunded, slashed, or
withdrawn escrow MUST result in access revocation. Servers SHOULD NOT cache
escrow state indefinitely.

## Token Approval Risk

EVM implementations that use the approve-then-escrow flow expose the payer to
front-running risk between the approval and escrow creation transactions.
Implementations SHOULD prefer approval patterns that minimize this window when
their token ecosystem supports them.

## Transport Security

All Payment authentication flows MUST use TLS 1.2 or later per
{{I-D.httpauth-payment}}. Stake credentials are challenge-bound artifacts that
could otherwise be replayed within the challenge validity window.

## Slash Abuse

Counterparties could abuse their slash authority. This specification
does not define slash policy enforcement; it is the responsibility of the
escrow contract and the counterparty's governance model. Clients SHOULD only
stake with counterparties and contracts whose policies are transparent and
auditable.

## Withdrawal Risk

If the escrow contract allows withdrawal, a client could gain access and then
withdraw immediately. Servers MUST re-verify escrow state to detect this.
Escrow contracts MAY implement time locks or other withdrawal conditions to
mitigate this risk.

# IANA Considerations

## Payment Intent Registration

This document requests registration of the following entry in the "HTTP
Payment Intents" registry established by {{I-D.httpauth-payment}}:

| Intent  | Applicable Methods | Description                    | Reference     |
| ------- | ------------------ | ------------------------------ | ------------- |
| `stake` | `evm`              | Collateral-based escrow access | This document |

Contact: Jonathan Schwartz (<jonathan@glif.io>)
