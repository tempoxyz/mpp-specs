---
title: "Upto" Intent for HTTP Payment Authentication
abbrev: Payment Intent Upto
docname: draft-payment-intent-upto-00
version: 00
category: std
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
  I-D.httpauth-payment:
    title: "The 'Payment' HTTP Authentication Scheme"
    target: https://datatracker.ietf.org/doc/draft-httpauth-payment/
    author:
      - name: Brendan Ryan
    date: 2026-01
  I-D.payment-intent-charge:
    title: "Charge Intent for HTTP Payment Authentication"
    target: https://datatracker.ietf.org/doc/draft-payment-intent-charge/
    author:
      - name: Jake Moxey
    date: 2026-01

informative: {}
---

--- abstract

This document defines the "upto" payment intent for
use with the Payment HTTP Authentication Scheme
{{I-D.httpauth-payment}}. The "upto" intent represents
a metered payment where the client authorizes a maximum
amount and the server charges actual usage up to that
cap.

--- middle

# Introduction

The "charge" intent
{{I-D.payment-intent-charge}} requires clients to pay
a fixed amount before accessing a resource. Many
services, however, operate on a usage-based model
where the final cost is not known at request time.
Examples include AI inference APIs billed per token,
data transfer services billed per byte, and compute
services billed per second of execution.

The "upto" intent addresses this gap. The client
authorizes a maximum amount, the server performs the
work, and the server settles the actual cost, which
MUST be less than or equal to the authorized maximum.

This model generalizes the metered payment pattern
for any payment method within the MPP framework.

## Relationship to Payment Methods

This document defines the abstract semantics of the
"upto" intent. Payment method specifications define
how to implement this intent using their specific
payment infrastructure. Methods MUST define how the
maximum authorization is cryptographically bound so
that the server cannot settle more than the authorized
amount.

# Requirements Language

{::boilerplate bcp14-tagged}

# Terminology

Maximum Authorization
: The upper bound on the payment amount that the
  client has authorized. The server MUST NOT settle
  more than this amount.

Actual Usage
: The real cost incurred by the server to fulfill the
  client's request, determined after execution.

Base Units
: The smallest denomination of a currency or asset.
  For USD, this is cents (1/100). For tokens, this
  is the smallest transferable unit defined by the
  token's decimal precision.

Unit
: An optional application-defined unit of metered
  consumption (e.g., "tokens", "bytes", "seconds").

# Intent Semantics

## Definition

The "upto" intent represents a request where the
client authorizes payment up to a maximum amount and
the server charges the actual cost of fulfilling the
request, which MUST be less than or equal to the
authorized maximum.

## Properties

| Property | Value |
|----------|-------|
| **Intent Identifier** | `upto` |
| **Payment Timing** | Deferred (actual amount determined after execution) |
| **Idempotency** | Single-use per challenge |
| **Reversibility** | Method-dependent |

## Comparison with Other Intents

| Property | charge | upto |
|----------|--------|------|
| Amount known at request time | Yes | Maximum only |
| Server determines final amount | No | Yes |
| Overpayment possible | No | No (server charges actual) |
| Use case | Fixed-price resources | Metered services |

The "upto" intent differs from a hypothetical
"session" or prepaid-balance intent in that each
"upto" authorization is scoped to a single request.
There is no persistent balance; each request requires
a new authorization.

## Flow

~~~
  Client                          Server
     │                               │
     │  (1) GET /resource            │
     ├──────────────────────────────>│
     │                               │
     │  (2) 402 Payment Required     │
     │      intent="upto"            │
     │      max_amount="10000"       │
     │<──────────────────────────────┤
     │                               │
     │  (3) Client authorizes up to  │
     │      max_amount               │
     │                               │
     │  (4) GET /resource            │
     │      Authorization: Payment   │
     ├──────────────────────────────>│
     │                               │
     │  (5) Server executes request  │
     │      Actual cost: 3500        │
     │                               │
     │  (6) Server settles 3500      │
     │      (not 10000)              │
     │                               │
     │  (7) 200 OK                   │
     │      Payment-Receipt with     │
     │      charged_amount="3500"    │
     │<──────────────────────────────┤
     │                               │
~~~

## Atomicity

The "upto" intent does NOT imply atomic exchange in
the same way as "charge". The server performs work
before the final amount is known. If execution fails
partway through, the server SHOULD charge only for
the work completed. If no work was completed, the
server MUST NOT settle any amount.

# Request Schema

The `request` parameter for an "upto" intent is a
JSON object with shared fields defined by this
specification and optional method-specific extensions
in the `methodDetails` field. The `request` JSON MUST
be serialized using JSON Canonicalization Scheme (JCS)
and base64url-encoded without padding per
{{I-D.httpauth-payment}}.

## Required Fields

| Field | Type | Description |
|-------|------|-------------|
| `max_amount` | string | Maximum payment amount in base units. |
| `currency` | string | Currency or asset identifier. |

The `max_amount` field MUST be a string of ASCII
digits representing a non-negative integer in the
smallest denomination of the currency. Leading zeros
MUST NOT be used except for the value `"0"`.

## Optional Fields

| Field | Type | Description |
|-------|------|-------------|
| `recipient` | string | Payment recipient in method-native format. |
| `unit` | string | Application-defined metering unit (e.g., `"tokens"`, `"bytes"`, `"seconds"`). |
| `description` | string | Human-readable description of the metered service. |
| `externalId` | string | Merchant's reference identifier. |
| `methodDetails` | object | Method-specific extension data. |

The `unit` field, when present, is informational. It
helps clients display meaningful usage information but
MUST NOT be used for payment verification. The actual
charge is always denominated in `currency`, not in
`unit`.

Challenge expiry is conveyed by the `expires`
auth-param in `WWW-Authenticate` per
{{I-D.httpauth-payment}}. Request objects MUST NOT
duplicate the expiry value.

## Examples

### AI API (Per-Token Billing)

~~~json
{
  "max_amount": "10000",
  "currency": "usd",
  "unit": "tokens",
  "description": "GPT-5 inference, up to 10000 tokens",
  "methodDetails": {
    "chainId": 42431,
    "feePayer": true
  }
}
~~~

### Data Transfer (Per-Byte Billing)

~~~json
{
  "max_amount": "500000",
  "currency":
    "0x20c0000000000000000000000000000000000000",
  "unit": "bytes",
  "recipient":
    "0x742d35Cc6634C0532925a3b844Bc9e7595f8fE00"
}
~~~

### Streaming Compute (Per-Second Billing)

~~~json
{
  "max_amount": "100000",
  "currency": "usd",
  "unit": "seconds",
  "description": "GPU compute, billed per second"
}
~~~

# Credential Requirements

## Payload

The credential structure follows
{{I-D.httpauth-payment}}, containing `challenge`,
`payload`, and an optional `source` field. The
`payload` for an "upto" intent MUST contain proof that
the client has authorized payment up to `max_amount`.

The authorization proof MUST be cryptographically
bound to `max_amount` such that the server cannot
settle more than the authorized maximum. The specific
binding mechanism is defined by the payment method
specification.

| Proof Type | Description | Example Methods |
|------------|-------------|-----------------|
| Signed authorization | Signature over max_amount and recipient | Tempo, EVM |
| Escrow confirmation | Funds locked in escrow up to max | Payment channels |
| Processor hold | Payment processor hold for max_amount | Stripe |

## Single-Use

Each credential MUST be usable only once per
challenge. Servers MUST reject replayed credentials.

# Verification

## Server Responsibilities

Servers verifying an "upto" credential MUST:

1. Verify the `id` matches an outstanding challenge.
2. Verify the challenge has not expired.
3. Verify the payment proof authorizes up to
   `max_amount` using method-specific procedures.
4. Verify the currency matches the request.
5. Verify the recipient matches the request (when
   applicable).

## Settlement

After executing the request and determining the
actual cost:

1. The server MUST calculate the actual usage cost.
2. The actual cost MUST be less than or equal to
   `max_amount`.
3. The server settles the actual cost using
   method-specific settlement procedures.
4. The server MUST NOT settle more than `max_amount`
   under any circumstances.
5. If the actual cost is zero (e.g., the request
   produced no output), the server SHOULD NOT settle
   any amount.

Settlement semantics differ by method:

- **Signed authorization**: Server submits a
  settlement transaction for the actual amount.
  The payment method's cryptographic binding ensures
  the settlement cannot exceed `max_amount`.
- **Escrow**: Server releases the actual amount from
  escrow. Remaining funds are returned to the client.
- **Processor hold**: Server captures the actual
  amount from the hold. The remaining hold is
  released.

# Receipt

## Receipt Fields

The `Payment-Receipt` header for an "upto" payment
MUST include the following additional fields beyond
those defined in {{I-D.httpauth-payment}}:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `charged_amount` | string | Yes | Actual amount settled, in base units. |
| `max_amount` | string | Yes | Originally authorized maximum. |
| `remaining` | string | Yes | Unused authorization (`max_amount` minus `charged_amount`). |
| `units_consumed` | string | No | Units of metered resource consumed (when `unit` was specified). |

### Example Receipt

Decoded `Payment-Receipt`:

~~~json
{
  "status": "success",
  "method": "example",
  "timestamp": "2025-01-15T12:00:30Z",
  "reference": "tx_abc123",
  "charged_amount": "3500",
  "max_amount": "10000",
  "remaining": "6500",
  "units_consumed": "1247"
}
~~~

## Client Verification

Clients SHOULD verify that `charged_amount` does not
exceed `max_amount` in the receipt. If this invariant
is violated, the client SHOULD flag the transaction
and alert the user.

# Security Considerations

## Maximum Amount Enforcement

The most critical security property of the "upto"
intent is that the server MUST NOT settle more than
`max_amount`. This invariant MUST be enforced by the
payment method's cryptographic binding, not solely by
server-side policy.

Payment method specifications implementing "upto"
MUST define a mechanism that makes it cryptographically
impossible for the server to settle more than the
authorized maximum. For example:

- Signed authorizations where the signature covers
  `max_amount` and the settlement contract enforces
  the cap.
- Escrow mechanisms where the locked amount equals
  `max_amount`.

## Server Trust

Unlike "charge" where the amount is fixed and
verifiable, "upto" requires the client to trust the
server's reported actual usage. Malicious servers
could inflate usage to charge the full `max_amount`.

Mitigations:

- Clients SHOULD set `max_amount` conservatively.
- Clients SHOULD track historical usage patterns and
  flag anomalies.
- Payment methods MAY define mechanisms for usage
  proofs or attestations.
- Reputation systems and service-level agreements
  provide additional accountability.

## Amount Verification

Clients MUST verify before authorizing:

1. The `max_amount` is acceptable for the expected
   usage.
2. The `currency` is as expected.
3. The `recipient` is expected (when present).
4. The validity window (`expires`) is appropriate.

## Replay Protection

Servers MUST implement replay protection. Each
challenge `id` MUST be single-use. Servers MUST NOT
accept the same credential twice. This is especially
important for "upto" since replay could result in
double-charging.

## Partial Execution Charging

If request execution fails partway through, the server
MUST charge only for work actually completed. Servers
MUST NOT charge `max_amount` for partially fulfilled
requests. Clients SHOULD verify `units_consumed` in
the receipt is consistent with the response received.

## Transport Security

All Payment authentication flows MUST use TLS 1.2 or
later per {{I-D.httpauth-payment}}.

# IANA Considerations

## Payment Intent Registration

This document registers the "upto" intent in the
"HTTP Payment Intents" registry established by
{{I-D.httpauth-payment}}:

| Intent | Description | Reference |
|--------|-------------|-----------|
| `upto` | Metered payment up to authorized maximum | This document |

Contact: Ankit Singh (<01100001.singh@gmail.com>)

--- back

# Full Protocol Example

## AI Inference Request

A client requests an AI inference endpoint that bills
per token consumed.

**Step 1: Initial Request**

~~~http
GET /v1/completions?prompt=Hello HTTP/1.1
Host: api.example.com
~~~

**Step 2: Payment Challenge**

~~~http
HTTP/1.1 402 Payment Required
Cache-Control: no-store
Content-Type: application/problem+json
WWW-Authenticate: Payment id="uP3tOkEnMaX7bIlL",
    realm="api.example.com",
    method="example",
    intent="upto",
    expires="2025-01-15T12:05:00Z",
    request="eyJtYXhfYW1vdW50IjoiMTAwMDAiLCJjdXJyZW5jeSI6InVzZCIsInVuaXQiOiJ0b2tlbnMifQ"

{
  "type":
    "https://paymentauth.org/problems/payment-required",
  "title": "Payment Required",
  "status": 402,
  "detail": "Metered payment required. Max: 10000."
}
~~~

Decoded `request`:

~~~json
{
  "max_amount": "10000",
  "currency": "usd",
  "unit": "tokens"
}
~~~

**Step 3: Credential Submission**

~~~http
GET /v1/completions?prompt=Hello HTTP/1.1
Host: api.example.com
Authorization: Payment eyJjaGFsbGVuZ2UiOnsiaWQiOiJ1UDN0T2tFbk1hWDdiSWxMIiwicmVhbG0iOiJhcGkuZXhhbXBsZS5jb20iLCJtZXRob2QiOiJleGFtcGxlIiwiaW50ZW50IjoidXB0byIsInJlcXVlc3QiOiJleUp0WVhoZllXMXZkVzUwSWpvaU1UQXdNREFpTENKamRYSnlaVzVqZVNJNkluVnpaQ0lzSW5WdWFYUWlPaUowYjJ0bGJuTWlmUSIsImV4cGlyZXMiOiIyMDI1LTAxLTE1VDEyOjA1OjAwWiJ9LCJwYXlsb2FkIjp7ImF1dGhvcml6YXRpb24iOiIweGFiYzEyMy4uLiJ9fQ
~~~

**Step 4: Success with Receipt**

~~~http
HTTP/1.1 200 OK
Cache-Control: private
Content-Type: application/json
Payment-Receipt: eyJzdGF0dXMiOiJzdWNjZXNzIiwibWV0aG9kIjoiZXhhbXBsZSIsInRpbWVzdGFtcCI6IjIwMjUtMDEtMTVUMTI6MDA6MzBaIiwicmVmZXJlbmNlIjoidHhfYWJjMTIzIiwiY2hhcmdlZF9hbW91bnQiOiIzNTAwIiwibWF4X2Ftb3VudCI6IjEwMDAwIiwicmVtYWluaW5nIjoiNjUwMCIsInVuaXRzX2NvbnN1bWVkIjoiMTI0NyJ9

{
  "id": "cmpl_abc123",
  "text": "Hello! How can I help you today?",
  "usage": {
    "prompt_tokens": 5,
    "completion_tokens": 1242,
    "total_tokens": 1247
  }
}
~~~

Decoded `Payment-Receipt`:

~~~json
{
  "status": "success",
  "method": "example",
  "timestamp": "2025-01-15T12:00:30Z",
  "reference": "tx_abc123",
  "charged_amount": "3500",
  "max_amount": "10000",
  "remaining": "6500",
  "units_consumed": "1247"
}
~~~

# Acknowledgments
{:numbered="false"}

The authors thank the contributors to the MPP
specification suite for their feedback on metered
payment semantics.
