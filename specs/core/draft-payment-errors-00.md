---
title: Structured Error Taxonomy for HTTP Payment Authentication
abbrev: Payment Errors
docname: draft-payment-errors-00
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

informative:
  RFC7807:
---

--- abstract

This document defines a structured error taxonomy for the
Payment HTTP Authentication Scheme
{{I-D.httpauth-payment}}. It extends the core error
handling with fine-grained error codes, a JSON error
response body schema, and mappings from error codes to
HTTP status codes. The taxonomy enables clients to
programmatically distinguish between retryable,
permanent, and transient payment failures.

--- middle

# Introduction

The core Payment authentication scheme
{{I-D.httpauth-payment}} defines a small set of
problem types for payment failures. As payment-enabled
services grow in complexity, clients require more
granular error information to implement robust retry
logic, surface meaningful diagnostics to users, and
distinguish between failures that are within the
client's control and those that are not.

This document defines an extended error taxonomy that
complements the core problem types. It specifies a
structured JSON error response body, enumerates
standard error codes, and maps each code to an
appropriate HTTP status code.

## Motivation

Clients interacting with payment-gated resources need
to answer three questions when a payment fails:

1. **What went wrong?** A machine-readable error code.
2. **Why?** A human-readable explanation.
3. **What now?** Whether to retry, fix the request, or
   abort.

The error taxonomy defined here answers all three.

## Scope

This extension:

- DOES: Define standard error codes and their
  semantics for payment failures.
- DOES: Specify a JSON response body schema for
  error responses.
- DOES: Map error codes to HTTP status codes.
- DOES NOT: Replace the Problem Details format
  {{RFC9457}} used by the core specification.
- DOES NOT: Define payment-method-specific errors.

## Relationship to Core Specification

This document extends {{I-D.httpauth-payment}}.
The error codes defined here are a superset of the
core problem types. Implementations of this extension
MUST also implement the core specification. The error
response body defined here is carried within the
Problem Details {{RFC9457}} `detail` and extended
fields, maintaining compatibility with the core
error format.

# Requirements Language

{::boilerplate bcp14-tagged}

# Terminology

Error Code
: A machine-readable string identifying a specific
  category of payment failure.

Retryable Error
: An error where the client MAY retry the same
  request after corrective action or after a delay.

Permanent Error
: An error where the client MUST NOT retry the same
  request without modification.

Transient Error
: An error caused by a temporary condition on the
  server or payment network. The client SHOULD retry
  after a delay.

# Error Response Schema

## Response Body

When a payment-related error occurs, servers SHOULD
return a JSON {{RFC8259}} response body conforming to
Problem Details {{RFC9457}} with the following
extended fields.

The response MUST include `Content-Type:
application/problem+json`.

### Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `type` | string | Yes | Problem type URI per {{RFC9457}}. |
| `title` | string | Yes | Short human-readable summary. |
| `status` | integer | Yes | HTTP status code. |
| `code` | string | Yes | Machine-readable error code from this taxonomy. |
| `reason` | string | Yes | Stable machine-readable reason within the error code. |
| `detail` | string | Yes | Human-readable explanation specific to this occurrence. |
| `retry_after` | integer | No | Seconds the client SHOULD wait before retrying. |

The `type` field MUST use the base URI
`https://paymentauth.org/problems/` followed by the
error code value.

The `code` field MUST be one of the error codes
defined in {{error-codes}}.

The `reason` field MUST be a stable, lowercase,
hyphen-delimited string suitable for programmatic
matching. Servers SHOULD use the reason values
defined in this specification. Servers MAY define
additional reason values prefixed with `x-`.

The `retry_after` field, when present, indicates the
minimum number of seconds the client SHOULD wait
before retrying. Servers SHOULD include this field
for retryable and transient errors.

### Example

~~~json
{
  "type":
    "https://paymentauth.org/problems/insufficient-balance",
  "title": "Insufficient Balance",
  "status": 402,
  "code": "insufficient_balance",
  "reason": "below-minimum",
  "detail":
    "Account balance is 50 but 100 is required.",
  "retry_after": 30
}
~~~

# Error Codes {#error-codes}

## Overview

The following table summarizes all error codes, their
HTTP status code mapping, and retry classification.

| Code | HTTP Status | Class | Description |
|------|-------------|-------|-------------|
| `insufficient_balance` | 402 | Retryable | Payer lacks sufficient funds. |
| `expired_challenge` | 402 | Retryable | Challenge has expired. |
| `invalid_signature` | 400 | Permanent | Cryptographic signature is invalid. |
| `amount_mismatch` | 400 | Permanent | Payment amount does not match request. |
| `unsupported_method` | 400 | Permanent | Payment method not accepted. |
| `network_error` | 503 | Transient | Payment network unreachable. |
| `settlement_failed` | 503 | Transient | Settlement could not complete. |
| `rate_limited` | 402 | Retryable | Too many payment attempts. |

## HTTP Status Code Mapping

Servers MUST use the following HTTP status codes based
on the error classification:

- **402 Payment Required**: Retryable errors where the
  client MAY retry after corrective action (e.g.,
  funding the account, requesting a fresh challenge).
  Servers MUST include a fresh `WWW-Authenticate:
  Payment` challenge with 402 responses.
- **400 Bad Request**: Permanent errors where the
  request is malformed or fundamentally invalid. The
  client MUST NOT retry without modifying the request.
- **503 Service Unavailable**: Transient errors caused
  by temporary infrastructure failures. The client
  SHOULD retry after the period indicated by
  `retry_after` or the `Retry-After` HTTP header.

## insufficient_balance

The payer's account or wallet does not contain
sufficient funds to fulfill the payment request.

- **HTTP Status**: 402
- **Class**: Retryable
- **Corrective Action**: Client funds the account and
  retries with a fresh challenge.

Servers MUST NOT disclose the payer's actual balance
in the `detail` field. Servers MAY indicate the
required amount.

### Example

~~~http
HTTP/1.1 402 Payment Required
Cache-Control: no-store
Content-Type: application/problem+json
WWW-Authenticate: Payment id="nR5tYuIoP8qWe",
    realm="api.example.com",
    method="example",
    intent="charge",
    request="eyJhbW91bnQiOiIxMDAwIiwiY3VycmVuY3kiOiJ1c2QifQ"

{
  "type":
    "https://paymentauth.org/problems/insufficient-balance",
  "title": "Insufficient Balance",
  "status": 402,
  "code": "insufficient_balance",
  "reason": "below-minimum",
  "detail": "Insufficient funds for this payment.",
  "retry_after": 60
}
~~~

## expired_challenge

The challenge referenced by the credential has
expired per its `expires` parameter.

- **HTTP Status**: 402
- **Class**: Retryable
- **Corrective Action**: Client requests a fresh
  challenge and retries.

### Example

~~~http
HTTP/1.1 402 Payment Required
Cache-Control: no-store
Content-Type: application/problem+json
WWW-Authenticate: Payment id="aB3cDeFgH7iJk",
    realm="api.example.com",
    method="example",
    intent="charge",
    request="eyJhbW91bnQiOiI1MDAiLCJjdXJyZW5jeSI6InVzZCJ9"

{
  "type":
    "https://paymentauth.org/problems/expired-challenge",
  "title": "Challenge Expired",
  "status": 402,
  "code": "expired_challenge",
  "reason": "ttl-exceeded",
  "detail": "The payment challenge has expired."
}
~~~

## invalid_signature

The cryptographic signature or proof provided in the
credential payload is invalid. This includes malformed
signatures, wrong signing keys, and tampered data.

- **HTTP Status**: 400
- **Class**: Permanent
- **Corrective Action**: Client MUST construct a new
  credential with a valid signature.

Servers MUST NOT disclose which specific aspect of the
signature validation failed beyond what is necessary
for the client to correct the error.

### Example

~~~http
HTTP/1.1 400 Bad Request
Cache-Control: no-store
Content-Type: application/problem+json

{
  "type":
    "https://paymentauth.org/problems/invalid-signature",
  "title": "Invalid Signature",
  "status": 400,
  "code": "invalid_signature",
  "reason": "verification-failed",
  "detail": "The payment proof signature is invalid."
}
~~~

## amount_mismatch

The payment amount in the credential does not match
the amount specified in the challenge request.

- **HTTP Status**: 400
- **Class**: Permanent
- **Corrective Action**: Client MUST construct a new
  credential matching the challenge amount.

### Example

~~~http
HTTP/1.1 400 Bad Request
Cache-Control: no-store
Content-Type: application/problem+json

{
  "type":
    "https://paymentauth.org/problems/amount-mismatch",
  "title": "Amount Mismatch",
  "status": 400,
  "code": "amount_mismatch",
  "reason": "wrong-amount",
  "detail":
    "Payment amount does not match the request."
}
~~~

## unsupported_method

The payment method specified in the credential is not
accepted by the server for this resource.

- **HTTP Status**: 400
- **Class**: Permanent
- **Corrective Action**: Client MUST select a
  different payment method from the server's
  advertised challenges.

### Example

~~~http
HTTP/1.1 400 Bad Request
Cache-Control: no-store
Content-Type: application/problem+json

{
  "type":
    "https://paymentauth.org/problems/unsupported-method",
  "title": "Unsupported Payment Method",
  "status": 400,
  "code": "unsupported_method",
  "reason": "method-not-accepted",
  "detail":
    "The payment method is not accepted."
}
~~~

## network_error

The payment network or settlement infrastructure is
temporarily unreachable. The payment itself may be
valid but cannot be verified or settled at this time.

- **HTTP Status**: 503
- **Class**: Transient
- **Corrective Action**: Client SHOULD retry after
  the indicated delay.

### Example

~~~http
HTTP/1.1 503 Service Unavailable
Cache-Control: no-store
Retry-After: 30
Content-Type: application/problem+json

{
  "type":
    "https://paymentauth.org/problems/network-error",
  "title": "Payment Network Unavailable",
  "status": 503,
  "code": "network_error",
  "reason": "upstream-timeout",
  "detail":
    "Payment network is temporarily unavailable.",
  "retry_after": 30
}
~~~

## settlement_failed

Payment verification succeeded but settlement could
not be completed. This may occur due to gas
estimation failures, nonce conflicts, or processor
downtime.

- **HTTP Status**: 503
- **Class**: Transient
- **Corrective Action**: Client SHOULD retry after
  the indicated delay. The server MAY issue a fresh
  challenge on retry.

Servers MUST NOT grant resource access when settlement
fails. Servers MUST NOT disclose internal settlement
infrastructure details.

### Example

~~~http
HTTP/1.1 503 Service Unavailable
Cache-Control: no-store
Retry-After: 60
Content-Type: application/problem+json

{
  "type":
    "https://paymentauth.org/problems/settlement-failed",
  "title": "Settlement Failed",
  "status": 503,
  "code": "settlement_failed",
  "reason": "settlement-timeout",
  "detail":
    "Payment settlement could not be completed.",
  "retry_after": 60
}
~~~

## rate_limited

The client has issued too many payment attempts in a
short period. The server is throttling requests to
protect against abuse.

- **HTTP Status**: 402
- **Class**: Retryable
- **Corrective Action**: Client MUST wait for the
  indicated period before retrying.

Servers MUST include either `retry_after` in the
response body or the `Retry-After` HTTP header
(or both) when returning this error.

### Example

~~~http
HTTP/1.1 402 Payment Required
Cache-Control: no-store
Retry-After: 120
Content-Type: application/problem+json
WWW-Authenticate: Payment id="xY9zAbCdE4fGh",
    realm="api.example.com",
    method="example",
    intent="charge",
    request="eyJhbW91bnQiOiIxMDAiLCJjdXJyZW5jeSI6InVzZCJ9"

{
  "type":
    "https://paymentauth.org/problems/rate-limited",
  "title": "Rate Limited",
  "status": 402,
  "code": "rate_limited",
  "reason": "too-many-attempts",
  "detail":
    "Too many payment attempts. Try again later.",
  "retry_after": 120
}
~~~

# Client Behavior

## Error Classification

Clients SHOULD use the `code` field to determine the
error class and appropriate response:

1. **Retryable (402)**: Request a fresh challenge,
   take corrective action if possible, and retry.
2. **Permanent (400)**: Do not retry. Fix the request
   or select a different payment method.
3. **Transient (503)**: Wait for `retry_after` seconds
   and retry the original request.

## Retry Strategy

Clients SHOULD implement exponential backoff when
retrying transient errors. The initial delay SHOULD be
the value of `retry_after` if present, or 5 seconds
otherwise. Clients MUST NOT retry more than 3 times
for the same payment attempt without user intervention.

## Unknown Error Codes

Clients that encounter an unrecognized `code` value
MUST fall back to the HTTP status code for
classification:

- 4xx: Treat as permanent.
- 5xx: Treat as transient.
- 402: Treat as retryable.

# Security Considerations

## Information Disclosure

Error responses MUST NOT leak internal server state,
infrastructure details, or implementation specifics.
In particular:

- `detail` MUST NOT include stack traces, internal
  error identifiers, or database states.
- `detail` MUST NOT disclose the payer's balance,
  transaction history, or account details.
- `reason` values MUST be drawn from a fixed
  vocabulary and MUST NOT contain dynamic data.

Servers SHOULD use generic messages in `detail` and
reserve specific diagnostics for server-side logging.

## Enumeration Attacks

Distinct error codes for different failure modes
could allow attackers to probe payment infrastructure.
Servers MAY collapse multiple internal failure reasons
into a single error code when the distinction would
reveal sensitive information.

For example, a server MAY return `invalid_signature`
for both "wrong signing key" and "tampered payload"
rather than exposing the specific failure.

## Replay of Error Responses

Error responses are not cryptographically bound to the
request. Intermediaries or attackers could replay
error responses to confuse clients. Clients SHOULD
correlate error responses with their outstanding
requests using the challenge `id`.

## Denial of Service

Attackers may send malformed credentials to trigger
expensive verification operations. Servers SHOULD
perform cheap syntactic validation before expensive
cryptographic verification. Servers SHOULD rate-limit
credential verification attempts per source.

# IANA Considerations

## Problem Type Registrations

This document registers the following problem type
URIs under the `https://paymentauth.org/problems/`
namespace:

| Problem Type | Title | Status | Reference |
|--------------|-------|--------|-----------|
| `insufficient-balance` | Insufficient Balance | 402 | This document |
| `expired-challenge` | Challenge Expired | 402 | This document |
| `invalid-signature` | Invalid Signature | 400 | This document |
| `amount-mismatch` | Amount Mismatch | 400 | This document |
| `unsupported-method` | Unsupported Payment Method | 400 | This document |
| `network-error` | Payment Network Unavailable | 503 | This document |
| `settlement-failed` | Settlement Failed | 503 | This document |
| `rate-limited` | Rate Limited | 402 | This document |

Contact: Ankit Singh (<01100001.singh@gmail.com>)

--- back

# JSON Schema for Error Response

The following JSON Schema defines the structure of
the payment error response body.

~~~json
{
  "$schema":
    "https://json-schema.org/draft/2020-12/schema",
  "title": "Payment Error Response",
  "type": "object",
  "required": [
    "type", "title", "status",
    "code", "reason", "detail"
  ],
  "properties": {
    "type": {
      "type": "string",
      "format": "uri"
    },
    "title": {
      "type": "string"
    },
    "status": {
      "type": "integer"
    },
    "code": {
      "type": "string",
      "enum": [
        "insufficient_balance",
        "expired_challenge",
        "invalid_signature",
        "amount_mismatch",
        "unsupported_method",
        "network_error",
        "settlement_failed",
        "rate_limited"
      ]
    },
    "reason": {
      "type": "string",
      "pattern": "^[a-z][a-z0-9-]*$"
    },
    "detail": {
      "type": "string"
    },
    "retry_after": {
      "type": "integer",
      "minimum": 0
    }
  }
}
~~~

# Acknowledgments
{:numbered="false"}

The authors thank the contributors to the MPP
specification suite, whose operational experience
with payment error handling informed this taxonomy.
