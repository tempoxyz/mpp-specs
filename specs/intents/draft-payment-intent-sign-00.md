---
title: Sign Intent for HTTP Payment Authentication
abbrev: Payment Intent Sign
docname: draft-payment-intent-sign-00
version: 00
category: info
ipr: trust200902
submissiontype: IETF
consensus: true

author:
  - name: Jake Moxey
    ins: J. Moxey
    email: jake@tempo.xyz
    org: Tempo Labs

normative:
  RFC2119:
  RFC3339:
  RFC8174:
  I-D.httpauth-payment:
    title: "The 'Payment' HTTP Authentication Scheme"
    target: https://datatracker.ietf.org/doc/draft-httpauth-payment/
    author:
      - name: Jake Moxey
    date: 2026-01
---

--- abstract

This document defines the "sign" intent for use with the Payment HTTP
Authentication Scheme {{I-D.httpauth-payment}}. The "sign" intent
enables servers to request a cryptographic signature from the client
over server-provided data, using a signing scheme defined by the
payment method specification.

--- middle

# Introduction

The "sign" intent enables a server to challenge a client to produce
a cryptographic signature over server-provided data. Unlike the
"charge" intent, which requests payment, the "sign" intent requests
proof of account control or explicit authorization of a
server-defined message.

This intent applies to scenarios where the server needs a signature
from the client for purposes beyond payment:

- Identity verification (prove control of an account)
- Authorization ceremonies (sign a message authorizing an action)
- On-chain attestations (produce a signature for contract
  verification)
- Session establishment (sign a challenge to obtain a session token)

## Relationship to Payment Methods

This document defines the abstract semantics of the "sign" intent.
Payment method specifications define how to implement this intent
using their specific signing infrastructure, including supported
signing schemes, data formats, and verification procedures.

# Requirements Language

{::boilerplate bcp14-tagged}

# Terminology

Sign
: A request for the client to produce a cryptographic signature
  over server-provided data.

Signing Scheme
: A method-defined mechanism for producing and verifying
  cryptographic signatures. Identified by the `type` field in
  the request object.

# Intent Semantics

## Definition

The "sign" intent represents a request for the client to produce a
cryptographic signature over data provided by the server, using a
signing scheme defined by the payment method.

## Properties

| Property | Value |
|----------|-------|
| **Intent Identifier** | `sign` |
| **Payment Timing** | N/A (no payment required) |
| **Idempotency** | Single-use per challenge |
| **Reversibility** | N/A |

## Flow

1. Server issues a 402 response with `intent="sign"`
2. Client inspects the data to be signed
3. Client produces the signature (method-specific)
4. Client submits credential with signature
5. Server verifies signature and grants access
6. Server returns `Payment-Receipt` header

## Atomicity

The "sign" intent implies atomic exchange: the server SHOULD NOT
provide partial access if signature verification fails. Either the
full resource is provided (signature valid) or access is denied
(signature invalid).

# Request Schema

The `request` parameter for a "sign" intent is a JSON object with
shared fields defined by this specification and method-specific
data determined by the signing scheme.

## Shared Fields

All payment methods implementing the "sign" intent MUST support
these shared fields, enabling clients to identify the signing
scheme consistently across methods.

### Required Fields

| Field | Type | Description |
|-------|------|-------------|
| `type` | string | Signing scheme identifier (method-defined) |
| `payload` | string or object | The data to be signed |

The `type` field identifies the signing scheme the client MUST use
to produce the signature. Payment method specifications define
which `type` values they support and the procedure for computing
the signature.

The `payload` field contains the data the client will sign. Its
format depends on the signing scheme: it MAY be a plaintext string
(e.g., for message signing) or a structured object (e.g., for
typed data signing). Payment method specifications define the
expected format for each `type`.

### Optional Fields

| Field | Type | Description |
|-------|------|-------------|
| `methodDetails` | object | Method-specific extension data |

Challenge expiry is conveyed by the `expires` auth-param in
`WWW-Authenticate` per {{I-D.httpauth-payment}}, using {{RFC3339}}
format. Request objects MUST NOT duplicate the expiry value.

## Method Extensions

Payment methods MAY define additional fields alongside the shared
fields. These fields are method-specific and MUST be documented
in the payment method specification. Clients that do not recognize
a payment method SHOULD ignore method-specific fields but MUST
still be able to parse the shared fields.

## Design Rationale: Pre-Images over Raw Digests

Payment method specifications implementing the "sign" intent
SHOULD NOT permit servers to request signatures over raw digests
(opaque hashes). Instead, the server SHOULD provide the pre-image
— the data from which the client can derive the signing input —
so that clients can inspect the content before signing.

This design provides two critical properties:

1. **Inspectability**: Clients can examine the content before
   signing, enabling informed consent and reducing phishing risk.

2. **Domain separation**: Signing schemes that apply a
   domain-specific prefix to the signed data prevent signatures
   from being repurposed as valid transaction authorizations or
   cross-protocol replays.

Payment method specifications MUST document how their supported
signing schemes address inspectability and domain separation.

## Examples

### Simple Message Signing (Tempo)

~~~ json
{
  "type": "personal_sign",
  "payload": "Authorize access to api.example.com\nNonce: qB3wErTyU7iOpAsD9fGhJk\nIssued At: 2026-03-18T12:00:00Z"
}
~~~

### Typed Data Signing (Tempo)

~~~ json
{
  "type": "typed_data",
  "payload": {
    "action": "access /api/v1/resource",
    "nonce": "zL4xCvBnM6kJhGfD8sAaWe",
    "expiry": "1742313600"
  },
  "methodDetails": {
    "domain": {
      "name": "Example API",
      "version": "1",
      "chainId": 1
    },
    "types": {
      "Authorization": [
        { "name": "action", "type": "string" },
        { "name": "nonce", "type": "string" },
        { "name": "expiry", "type": "uint256" }
      ]
    },
    "primaryType": "Authorization"
  }
}
~~~

Payment method specifications define the complete `methodDetails`
schema for their supported signing schemes and the `type` values
they accept.

# Credential Requirements

## Payload

The credential `payload` for a "sign" intent MUST contain the
signature produced by the client.

## Single-Use

Each credential MUST be usable only once per challenge. Servers MUST
reject replayed credentials.

# Verification

## Server Responsibilities

Servers verifying a "sign" credential MUST:

1. Verify the `id` matches an outstanding challenge
2. Verify the challenge has not expired
3. Reconstruct the signing input from the request data using the
   method-specific procedure for the signing scheme
4. Verify the signature using the method-specific verification
   procedure
5. Verify the recovered or presented identity satisfies the
   server's authorization policy

## Signer Identification

The mechanism for identifying the signer (e.g., address recovery,
public key comparison, on-chain contract verification) is defined
by the payment method specification.

# Security Considerations

## Blind Signing Prevention

Payment method specifications implementing the "sign" intent
SHOULD require servers to provide signing pre-images rather than
raw digests. Clients SHOULD inspect the content before producing
a signature. Clients MAY reject signing requests that contain
suspicious or unexpected content.

## Domain Separation

Payment method specifications SHOULD require signing schemes that
apply a domain-specific prefix or encoding to the signed data.
This prevents signatures produced for the "sign" intent from
being repurposed as valid transaction authorizations or replayed
across unrelated protocols.

## Replay Protection

Replay protection is provided by the challenge `id` mechanism
defined in {{I-D.httpauth-payment}}. Each challenge `id` is
single-use; servers MUST reject credentials referencing an
already-consumed challenge.

For additional replay protection within the signed data itself,
servers SHOULD include a nonce or timestamp in the data to be
signed.

## Signature Reuse Across Contexts

A signature produced for a "sign" challenge could theoretically be
valid in other contexts that accept the same signing scheme over
the same data. Servers SHOULD include context-specific data (realm,
nonce, timestamp) in the signing input to limit reuse.

Payment method specifications SHOULD document how their signing
schemes mitigate cross-context signature reuse.

## Financial Operation Authorization

The "sign" intent does not involve payment. However, clients MUST
verify that a "sign" challenge does not contain data that would
authorize a financial operation (e.g., token transfer, approval)
unless the client explicitly intends to authorize such an action.

# IANA Considerations

## Payment Intent Registration

This document registers the "sign" intent in the "HTTP Payment
Intents" registry established by {{I-D.httpauth-payment}}:

| Intent | Description | Reference |
|--------|-------------|-----------|
| `sign` | Cryptographic signature over server-provided data | This document |
