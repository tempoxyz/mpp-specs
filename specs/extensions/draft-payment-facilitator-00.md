---
title: "Facilitator" Extension for HTTP Payment Authentication
abbrev: Payment Facilitator
docname: draft-payment-facilitator-00
version: 00
category: info
ipr: trust200902
submissiontype: IETF
consensus: true

author:
  - name: Ankit Singh
    ins: A. Singh
    email: 01100001.singh@gmail.com
    org: Independent

normative:
  RFC2119:
  RFC3339:
  RFC4648:
  RFC8174:
  RFC8259:
  RFC9110:
  RFC9457:
  I-D.httpauth-payment:
    title: "The 'Payment' HTTP Authentication Scheme"
    target: https://datatracker.ietf.org/doc/draft-httpauth-payment/
    author:
      - name: Brendan Ryan
    date: 2026-01

informative: {}
---

--- abstract

This document defines the "facilitator" extension for
the Payment HTTP Authentication Scheme
{{I-D.httpauth-payment}}. A facilitator is an
intermediary service that verifies payment proofs and
settles payments on behalf of resource servers. This
extension specifies the facilitator's verification and
settlement endpoints, request and response schemas,
trust model, and discovery mechanism.

--- middle

# Introduction

The Payment authentication scheme
{{I-D.httpauth-payment}} requires resource servers to
verify payment proofs and settle payments. For many
payment methods, this requires specialized
infrastructure: blockchain nodes, gas management,
transaction signing keys, and payment processor
integrations.

A facilitator abstracts this complexity. Resource
servers delegate payment verification and settlement
to a trusted facilitator, allowing them to accept
payments without operating payment infrastructure
directly.

This model generalizes the facilitator pattern
for any payment method within the MPP framework.

## Motivation

Without a facilitator, every resource server must:

- Run or connect to payment network nodes.
- Manage gas tokens and transaction fees.
- Implement verification logic for each payment
  method.
- Handle settlement, retries, and failure recovery.

A facilitator centralizes these responsibilities,
enabling resource servers to:

- Accept payments with a single HTTP integration.
- Support multiple payment methods through one
  facilitator.
- Avoid managing cryptographic keys for settlement.
- Offload gas management and fee estimation.

## Scope

This extension:

- DOES: Define the facilitator role and its
  interfaces.
- DOES: Specify verification and settlement
  endpoints.
- DOES: Define a discovery mechanism for facilitator
  advertisement.
- DOES NOT: Mandate a specific trust relationship
  between servers and facilitators.
- DOES NOT: Define payment-method-specific
  verification or settlement procedures.

## Relationship to Core Specification

This document extends {{I-D.httpauth-payment}}.
Implementations of this extension MUST also implement
the core specification. The facilitator is transparent
to clients; the client-facing protocol is unchanged.

# Requirements Language

{::boilerplate bcp14-tagged}

# Terminology

Facilitator
: An intermediary service that verifies payment proofs
  and settles payments on behalf of resource servers.

Resource Server
: The HTTP server that gates access to resources
  behind payment. The resource server delegates
  payment operations to a facilitator.

Verification
: The process of validating that a payment credential
  contains a valid proof of payment or authorization.

Settlement
: The process of executing the actual value transfer
  on the payment network.

# Architecture

## Overview

The facilitator sits between the resource server's
payment logic and the payment network. The client
interacts only with the resource server; the
facilitator is an implementation detail of the
server's payment processing.

~~~
  Client                Resource Server         Facilitator       Payment Network
     │                        │                      │                   │
     │  (1) GET /resource     │                      │                   │
     ├───────────────────────>│                      │                   │
     │                        │                      │                   │
     │  (2) 402 + challenge   │                      │                   │
     │<───────────────────────┤                      │                   │
     │                        │                      │                   │
     │  (3) Authorization:    │                      │                   │
     │      Payment ...       │                      │                   │
     ├───────────────────────>│                      │                   │
     │                        │                      │                   │
     │                        │  (4) POST /verify    │                   │
     │                        ├─────────────────────>│                   │
     │                        │                      │                   │
     │                        │  (5) Verification    │                   │
     │                        │      result          │                   │
     │                        │<─────────────────────┤                   │
     │                        │                      │                   │
     │                        │  (6) POST /settle    │                   │
     │                        ├─────────────────────>│                   │
     │                        │                      │  (7) Execute      │
     │                        │                      ├──────────────────>│
     │                        │                      │                   │
     │                        │                      │  (8) Confirmation │
     │                        │                      │<──────────────────┤
     │                        │  (9) Settlement      │                   │
     │                        │      result          │                   │
     │                        │<─────────────────────┤                   │
     │                        │                      │                   │
     │  (10) 200 OK +         │                      │                   │
     │       Receipt          │                      │                   │
     │<───────────────────────┤                      │                   │
     │                        │                      │                   │
~~~

## Capabilities

This extension provides:

1. **Verification Delegation**: Resource servers
   delegate proof validation to the facilitator.
2. **Settlement Delegation**: Resource servers
   delegate value transfer to the facilitator.
3. **Multi-Method Support**: A single facilitator
   MAY support multiple payment methods.
4. **Infrastructure Abstraction**: Resource servers
   do not need direct payment network access.

# Specification

## Facilitator Endpoints

A facilitator MUST expose two HTTPS endpoints:

1. `POST /verify` -- Validate a payment credential.
2. `POST /settle` -- Execute payment settlement.

The base URL of the facilitator is implementation-
defined. The paths `/verify` and `/settle` are
relative to that base URL.

Both endpoints MUST be served over HTTPS with TLS 1.2
or later. Both endpoints MUST accept and return
`Content-Type: application/json`.

## Authentication

Resource servers MUST authenticate to the facilitator.
The authentication mechanism is out of scope for this
specification. Implementations SHOULD use mutual TLS,
API keys, or OAuth 2.0 bearer tokens.

Facilitators MUST reject unauthenticated requests
with 401 Unauthorized.

## Verification Endpoint

### Request

~~~
POST /verify
Content-Type: application/json
~~~

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `challenge` | object | Yes | The original challenge parameters issued to the client. |
| `credential` | object | Yes | The decoded credential submitted by the client. |

The `challenge` object MUST contain all parameters
from the `WWW-Authenticate` header: `id`, `realm`,
`method`, `intent`, `request`, and any optional
parameters (`expires`, `digest`, `opaque`).

The `credential` object MUST contain the decoded
JSON from the client's `Authorization: Payment`
header, including `challenge`, `payload`, and
optional `source` fields.

### Request Example

~~~json
{
  "challenge": {
    "id": "x7Tg2pLqR9mKvNwY3hBcZa",
    "realm": "api.example.com",
    "method": "example",
    "intent": "charge",
    "request":
      "eyJhbW91bnQiOiIxMDAwIiwiY3VycmVuY3kiOiJ1c2QifQ",
    "expires": "2025-01-15T12:05:00Z"
  },
  "credential": {
    "challenge": {
      "id": "x7Tg2pLqR9mKvNwY3hBcZa",
      "realm": "api.example.com",
      "method": "example",
      "intent": "charge",
      "request":
        "eyJhbW91bnQiOiIxMDAwIiwiY3VycmVuY3kiOiJ1c2QifQ",
      "expires": "2025-01-15T12:05:00Z"
    },
    "source":
      "did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK",
    "payload": {
      "signature": "0x1b2c3d4e5f..."
    }
  }
}
~~~

### Response

The facilitator MUST respond with one of the
following:

**Success (200 OK)**:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `valid` | boolean | Yes | `true` if the credential is valid. |
| `method` | string | Yes | Payment method verified. |
| `details` | object | No | Method-specific verification details. |

~~~json
{
  "valid": true,
  "method": "example",
  "details": {
    "signer":
      "0x742d35Cc6634C0532925a3b844Bc9e7595f8fE00"
  }
}
~~~

**Failure (200 OK with valid=false)**:

~~~json
{
  "valid": false,
  "method": "example",
  "error": {
    "code": "invalid_signature",
    "detail": "Signature verification failed."
  }
}
~~~

The facilitator MUST return 200 for both valid and
invalid credentials. The `valid` field distinguishes
the outcome. HTTP-level errors (4xx, 5xx) indicate
facilitator infrastructure failures, not credential
validity.

**Error (4xx/5xx)**:

Facilitator infrastructure errors use Problem Details
{{RFC9457}}:

~~~json
{
  "type":
    "https://paymentauth.org/problems/network-error",
  "title": "Payment Network Unavailable",
  "status": 503,
  "detail":
    "Cannot reach payment network for verification."
}
~~~

## Settlement Endpoint

### Request

~~~
POST /settle
Content-Type: application/json
~~~

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `challenge` | object | Yes | The original challenge parameters. |
| `credential` | object | Yes | The decoded credential. |
| `amount` | string | Yes | Amount to settle in base units. |

The `amount` field specifies the amount to settle.
For "charge" intents this MUST equal the challenge
request amount. For "upto" intents this MUST be less
than or equal to `max_amount`.

### Request Example

~~~json
{
  "challenge": {
    "id": "x7Tg2pLqR9mKvNwY3hBcZa",
    "realm": "api.example.com",
    "method": "example",
    "intent": "charge",
    "request":
      "eyJhbW91bnQiOiIxMDAwIiwiY3VycmVuY3kiOiJ1c2QifQ",
    "expires": "2025-01-15T12:05:00Z"
  },
  "credential": {
    "challenge": {
      "id": "x7Tg2pLqR9mKvNwY3hBcZa",
      "realm": "api.example.com",
      "method": "example",
      "intent": "charge",
      "request":
        "eyJhbW91bnQiOiIxMDAwIiwiY3VycmVuY3kiOiJ1c2QifQ",
      "expires": "2025-01-15T12:05:00Z"
    },
    "payload": {
      "signature": "0x1b2c3d4e5f..."
    }
  },
  "amount": "1000"
}
~~~

### Response

**Success (200 OK)**:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `settled` | boolean | Yes | `true` if settlement succeeded. |
| `reference` | string | Yes | Method-specific settlement reference (e.g., transaction hash). |
| `amount` | string | Yes | Amount actually settled. |
| `timestamp` | string | Yes | {{RFC3339}} settlement timestamp. |

~~~json
{
  "settled": true,
  "reference": "0xabc123def456...",
  "amount": "1000",
  "timestamp": "2025-01-15T12:00:30Z"
}
~~~

**Failure (200 OK with settled=false)**:

~~~json
{
  "settled": false,
  "error": {
    "code": "settlement_failed",
    "detail": "Transaction reverted."
  }
}
~~~

As with verification, the facilitator MUST return 200
for both successful and failed settlements. The
`settled` field distinguishes the outcome.

## Idempotency

Facilitators MUST support idempotent settlement
requests. If a resource server retries a `/settle`
request with the same challenge `id`, the facilitator
MUST return the same result without executing a
duplicate settlement.

Facilitators SHOULD use the challenge `id` as the
idempotency key.

## Verify-Then-Settle Pattern

Resource servers SHOULD follow a two-phase pattern:

1. Call `/verify` to validate the credential.
2. If valid, perform the application logic.
3. Call `/settle` to execute the payment.
4. If settlement succeeds, return the resource with
   a `Payment-Receipt` header.

Resource servers MUST NOT grant resource access if
either verification or settlement fails.

Resource servers MAY combine verification and
settlement into a single `/settle` call if the
facilitator supports it. In this case the facilitator
MUST verify the credential before settling.

# Discovery

## Facilitator Advertisement

Servers MAY advertise their facilitator in the 402
challenge by including an optional `facilitator`
auth-param:

~~~http
HTTP/1.1 402 Payment Required
Cache-Control: no-store
WWW-Authenticate: Payment id="x7Tg2pLqR9mKvNwY3hBcZa",
    realm="api.example.com",
    method="example",
    intent="charge",
    facilitator="https://pay.facilitator.com",
    request="eyJhbW91bnQiOiIxMDAwIiwiY3VycmVuY3kiOiJ1c2QifQ"
~~~

The `facilitator` parameter is OPTIONAL. Its value is
the base URL of the facilitator's API. Clients MUST
ignore this parameter if they do not implement
facilitator-aware logic.

The `facilitator` parameter is informational. Clients
MUST NOT use it for security decisions. The resource
server's choice of facilitator is an implementation
detail; clients interact only with the resource
server's payment challenge.

## OpenAPI Extension

Servers using the discovery extension
(draft-payment-discovery-00) MAY include a
`facilitator` field in the `x-payment-info` object:

~~~json
{
  "intent": "charge",
  "method": "example",
  "amount": "1000",
  "currency": "usd",
  "facilitator": "https://pay.facilitator.com"
}
~~~

# Trust Model

## Facilitator as Trusted Party

The facilitator is a trusted party in the payment
flow. The resource server trusts the facilitator to:

1. Honestly report verification results.
2. Settle the correct amount to the correct
   recipient.
3. Not settle more than the client authorized.
4. Not withhold or redirect funds.

## Cryptographic Binding

The facilitator's ability to move funds is
constrained by the client's cryptographic
authorization. The facilitator MUST NOT be able to
settle more than the amount the client signed or
authorized.

This binding is enforced by the payment method:

- For signed authorization methods, the client's
  signature covers the amount and recipient. The
  payment network rejects settlements that exceed
  the signed amount.
- For escrow methods, funds are locked at the
  authorized amount. The facilitator can release
  up to that amount but not more.
- For processor methods, the hold is placed at the
  authorized amount. The facilitator can capture
  up to that amount.

The key invariant: **the facilitator cannot
unilaterally increase the payment amount beyond what
the client authorized**, regardless of what the
resource server requests.

## Trust Boundaries

| Trust Relationship | Enforced By |
|--------------------|-------------|
| Client trusts resource server to charge fairly | Application-level (reputation, terms of service) |
| Client trusts facilitator not to overcharge | Cryptographic binding (payment method) |
| Resource server trusts facilitator to verify honestly | Service agreement, mutual authentication |
| Resource server trusts facilitator to settle correctly | Service agreement, audit logs |

## Facilitator Compromise

If a facilitator is compromised, the attacker could:

- Report invalid credentials as valid (causing
  resource servers to grant access without payment).
- Report valid credentials as invalid (denial of
  service).
- Delay or withhold settlement.

The attacker CANNOT:

- Settle more than the client authorized
  (cryptographic binding prevents this).
- Forge client credentials (the client's signing
  key is not held by the facilitator).

Mitigations:

- Resource servers SHOULD monitor settlement
  confirmations independently when possible.
- Resource servers SHOULD use multiple facilitators
  for redundancy.
- Facilitators SHOULD provide audit logs accessible
  to resource servers.

# Security Considerations

## Transport Security

All communication between resource servers and
facilitators MUST use TLS 1.2 or later. Facilitator
endpoints contain payment credentials and settlement
instructions; interception could result in financial
loss.

## Authentication Between Server and Facilitator

Resource servers MUST authenticate to the facilitator
to prevent unauthorized parties from submitting
verification or settlement requests. Facilitators
MUST reject unauthenticated requests.

Facilitators SHOULD implement rate limiting per
authenticated resource server to prevent abuse.

## Credential Forwarding

Resource servers forward client credentials to the
facilitator. This means the facilitator sees the
full payment proof. Facilitators MUST treat
credentials as sensitive data and MUST NOT log them
in plaintext.

## Settlement Amount Validation

Facilitators MUST validate that the requested
settlement amount does not exceed the authorized
amount in the credential. This is the primary
defense against overcharging by compromised resource
servers.

For "charge" intents, the settlement amount MUST
equal the request amount. For "upto" intents, the
settlement amount MUST be less than or equal to
`max_amount`.

## Replay Protection

Facilitators MUST implement replay protection for
both `/verify` and `/settle` endpoints. Each
challenge `id` MUST be usable for at most one
successful settlement.

## Information Disclosure

The `facilitator` auth-param in the 402 challenge
reveals the facilitator's identity to clients. This
is acceptable in most deployments but servers that
consider their payment infrastructure confidential
SHOULD omit this parameter.

Facilitator error responses MUST NOT leak internal
infrastructure details, payment network node
addresses, or key identifiers.

## Denial of Service

A facilitator serves multiple resource servers.
Overloading the facilitator could disrupt payments
for all of them. Facilitators MUST implement:

- Per-server rate limiting.
- Request size limits.
- Timeout enforcement on payment network operations.

Resource servers SHOULD implement fallback behavior
(e.g., queuing requests or returning 503) when the
facilitator is unavailable.

# IANA Considerations

## Challenge Parameter Registration

This document registers the following parameter for
the "Payment" authentication scheme:

| Parameter | Description | Reference |
|-----------|-------------|-----------|
| `facilitator` | Base URL of the facilitator service | This document |

Contact: Ankit Singh (<01100001.singh@gmail.com>)

--- back

# JSON Schema for Verify Request

~~~json
{
  "$schema":
    "https://json-schema.org/draft/2020-12/schema",
  "title": "Facilitator Verify Request",
  "type": "object",
  "required": ["challenge", "credential"],
  "properties": {
    "challenge": {
      "type": "object",
      "required": [
        "id", "realm", "method",
        "intent", "request"
      ],
      "properties": {
        "id": { "type": "string" },
        "realm": { "type": "string" },
        "method": { "type": "string" },
        "intent": { "type": "string" },
        "request": { "type": "string" },
        "expires": { "type": "string" },
        "digest": { "type": "string" },
        "opaque": { "type": "string" }
      }
    },
    "credential": {
      "type": "object",
      "required": ["challenge", "payload"],
      "properties": {
        "challenge": { "type": "object" },
        "source": { "type": "string" },
        "payload": { "type": "object" }
      }
    }
  }
}
~~~

# JSON Schema for Settle Request

~~~json
{
  "$schema":
    "https://json-schema.org/draft/2020-12/schema",
  "title": "Facilitator Settle Request",
  "type": "object",
  "required": [
    "challenge", "credential", "amount"
  ],
  "properties": {
    "challenge": {
      "type": "object",
      "required": [
        "id", "realm", "method",
        "intent", "request"
      ],
      "properties": {
        "id": { "type": "string" },
        "realm": { "type": "string" },
        "method": { "type": "string" },
        "intent": { "type": "string" },
        "request": { "type": "string" },
        "expires": { "type": "string" },
        "digest": { "type": "string" },
        "opaque": { "type": "string" }
      }
    },
    "credential": {
      "type": "object",
      "required": ["challenge", "payload"],
      "properties": {
        "challenge": { "type": "object" },
        "source": { "type": "string" },
        "payload": { "type": "object" }
      }
    },
    "amount": {
      "type": "string",
      "pattern": "^(0|[1-9][0-9]*)$"
    }
  }
}
~~~

# Acknowledgments
{:numbered="false"}

The authors thank the contributors to the MPP
specification suite for their feedback on the trust
model and interface design.
