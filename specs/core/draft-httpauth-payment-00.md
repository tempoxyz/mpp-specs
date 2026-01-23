---
title: The "Payment" HTTP Authentication Scheme
abbrev: Payment Auth Scheme
docname: draft-httpauth-payment-00
version: 00
category: std
ipr: trust200902
submissiontype: IETF
consensus: true

author:
  - name: Jake Moxey
    ins: J. Moxey
    email: jake@tempo.xyz
    organization: Tempo Labs

normative:
  RFC2119:
  RFC3339:
  RFC3629:
  RFC4648:
  RFC5234:
  RFC6750:
  RFC7235:
  RFC8126:
  RFC8174:
  RFC8259:
  RFC8446:
  RFC9110:
  RFC9111:
  RFC9457:

informative:
  W3C-DID:
    title: "Decentralized Identifiers (DIDs) v1.0"
    target: https://www.w3.org/TR/did-core/
    author:
      - org: W3C
  W3C-PMI:
    title: "Payment Method Identifiers"
    target: https://www.w3.org/TR/payment-method-id/
    author:
      - org: W3C
---

--- abstract

This document defines the "Payment" HTTP authentication scheme, enabling
HTTP resources to require a payment challenge to be fulfilled before access.
The scheme extends HTTP Authentication, using the HTTP 402 "Payment Required"
status code.

The protocol is payment-method agnostic, supporting any payment network
or currency through registered payment method identifiers. Specific
payment methods are defined in separate payment method specifications.

--- middle

# Introduction

HTTP 402 "Payment Required" was reserved in HTTP/1.1 {{RFC9110}} for future
use but never standardized. This specification defines the "Payment"
authentication scheme that gives 402 its semantics, enabling resources to
require a payment challenge to be fulfilled before access.

## Relationship to Payment Method Specifications

This specification defines the abstract protocol framework. Concrete
payment methods are defined in payment method specifications that:

- Register a payment method identifier
- Define the `request` schema for that method
- Define the `payload` schema for that method
- Specify verification and settlement procedures

# Requirements Language

{::boilerplate bcp14-tagged}

# Terminology

Payment Challenge
: A `WWW-Authenticate` header with scheme "Payment" indicating the
  payment requirements for accessing a resource.

Payment Credential
: An `Authorization` header with scheme "Payment" containing payment
  authorization data.

Payment Method
: A mechanism for transferring value, identified by a registered
  identifier.

Payment Intent
: The type of payment request, identified by a registered value in the
  IANA "HTTP Payment Intents" registry. Intents are defined by separate
  intent specifications.

Request
: Method-specific data in the challenge enabling payment completion.
  Encoded as base64url JSON in the `request` parameter.

Payload
: Method-specific data in the credential proving payment.

# Protocol Overview

## Request Flow

~~~
   Client                                            Server
      │                                                 │
      │  (1) GET /resource                              │
      ├────────────────────────────────────────────────>│
      │                                                 │
      │  (2) 402 Payment Required                       │
      │      WWW-Authenticate: Payment id="..",         │
      │        method="..", intent="..", request=".."   │
      │<────────────────────────────────────────────────┤
      │                                                 │
      │  (3) Client fulfills payment challenge          │
      │      (signs transaction, pays invoice, etc.)    │
      │                                                 │
      │  (4) GET /resource                              │
      │      Authorization: Payment <credential>        │
      ├────────────────────────────────────────────────>│
      │                                                 │
      │  (5) Server verifies and settles                │
      │                                                 │
      │  (6) 200 OK                                     │
      │      Payment-Receipt: <receipt>                 │
      │<────────────────────────────────────────────────┤
      │                                                 │
~~~

## Status Codes

| Code | Meaning |
|------|---------|
| 402  | Resource requires payment; see `WWW-Authenticate` |
| 200  | Payment verified; resource provided |
| 400  | Malformed payment credential or proof |
| 401  | Valid format but payment verification failed |
| 403  | Payment verified but access denied (policy) |

Servers MUST return 402 with a `WWW-Authenticate: Payment` header when
payment is required. Servers SHOULD NOT return 402 without this header.

## Relationship to 401 Unauthorized

This specification uses 402 (Payment Required) for the initial payment
challenge, diverging from the traditional 401 pattern used by other HTTP
authentication schemes. This distinction is intentional:

- **402** indicates the resource requires payment (economic barrier)
- **401** indicates authentication/authorization failure (credential barrier)

When a client submits an invalid Payment credential, servers MUST return
401 (Unauthorized) with a `WWW-Authenticate: Payment` header containing a
fresh challenge.

## Usage of 402 Payment Required

The 402 (Payment Required) status code was reserved by {{RFC9110}} for future
use. This specification defines semantics for 402 within the context of the
Payment authentication scheme.

### When to Return 402

Servers SHOULD return 402 when:

- The resource requires payment as a precondition for access
- The server can provide a Payment challenge that the client may fulfill
- Payment is the primary barrier to access (not authentication or authorization)

Servers MAY return 402 when:

- Offering optional paid features or premium content
- Indicating that a previously-paid resource requires additional payment
- The payment requirement applies to a subset of request methods

### When NOT to Return 402

Servers SHOULD NOT return 402 when:

- The client lacks authentication credentials (use 401)
- The client is authenticated but lacks authorization (use 403)
- The resource does not exist (use 404)
- No Payment challenge can be constructed for the request

Servers MUST NOT return 402 without including a `WWW-Authenticate` header
containing at least one Payment challenge.

### Interaction with Other Authentication Schemes

When a resource requires both authentication and payment, servers SHOULD:

1. First verify authentication credentials
2. Return 401 if authentication fails
3. Return 402 with a Payment challenge only after successful authentication

This ordering prevents information leakage about payment requirements to
unauthenticated clients.

# The Payment Authentication Scheme

## Challenge (WWW-Authenticate)

The Payment challenge is sent in the `WWW-Authenticate` header per
{{RFC7235}}. The challenge uses the auth-param syntax defined in Section 2.1
of {{RFC7235}}:

~~~abnf
challenge       = "Payment" [ 1*SP auth-params ]
auth-params     = auth-param *( OWS "," OWS auth-param )
auth-param      = token BWS "=" BWS ( token / quoted-string )
~~~

### Required Parameters

**`id`**: Unique identifier for this payment challenge. Servers MUST
  generate a cryptographically random value with at least 128 bits of
  entropy for each challenge. Clients MUST include this value in the
  credential to correlate the response with the challenge. Servers
  MUST reject credentials with unknown, expired, or already-used `id`
  values.

**`realm`**: Protection space identifier per {{RFC7235}}. Servers MUST
  include this parameter to define the scope of the payment requirement.

**`method`**: Payment method identifier ({{payment-methods}}). MUST be a lowercase
  ASCII string.

**`intent`**: Payment intent type ({{payment-intents}}). The value MUST be a
  registered entry in the IANA "HTTP Payment Intents" registry.

**`request`**: Base64url-encoded {{RFC4648}} JSON {{RFC8259}} containing
  payment-method-specific data needed to complete payment. Structure is
  defined by the payment method specification. Padding characters ("=")
  MUST NOT be included.

### Optional Parameters

**`expires`**: Timestamp indicating when this challenge expires, formatted
  as an {{RFC3339}} date-time string (e.g., `"2025-01-15T12:00:00Z"`).
  Servers SHOULD include this parameter. Clients MUST NOT submit
  credentials for expired challenges.

**`description`**: Human-readable description of the resource or payment
  purpose. This parameter is for display purposes only and MUST NOT be
  relied upon for payment verification (see {{amount-verification}}).

Unknown parameters MUST be ignored by clients.

### Example Challenge

~~~http
HTTP/1.1 402 Payment Required
Cache-Control: no-store
WWW-Authenticate: Payment id="x7Tg2pLqR9mKvNwY3hBcZa",
    realm="api.example.com",
    method="example",
    intent="charge",
    expires="2025-01-15T12:05:00Z",
    request="eyJhbW91bnQiOiIxMDAwIiwiY3VycmVuY3kiOiJVU0QiLCJyZWNpcGllbnQiOiJhY2N0XzEyMyJ9"
~~~

Example decoded `request`:

~~~json
{
  "amount": "1000",
  "currency": "USD",
  "recipient": "acct_123"
}
~~~

## Credentials (Authorization)

The Payment credential is sent in the `Authorization` header using the
b64token syntax as defined in {{RFC6750}}:

~~~abnf
credentials     = "Payment" 1*SP b64token
b64token        = 1*( ALPHA / DIGIT / "-" / "." / "_" / "~" / "+" / "/" ) *"="
~~~

The b64token value is a base64url-encoded JSON object (without padding)
containing:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | Yes | Challenge identifier (must match challenge `id`) |
| `source` | string | No | Payer identifier (RECOMMENDED: DID format per {{W3C-DID}}) |
| `payload` | object | Yes | Method-specific payment proof |

The `payload` field contains the payment-method-specific data needed to
complete the payment challenge. Payment method specifications define the
exact structure.

### Example Credential

~~~http
GET /api/data HTTP/1.1
Host: api.example.com
Authorization: Payment eyJpZCI6Ing3VGcycExxUjltS3ZOd1kzaEJjWmEiLCJwYXlsb2FkIjp7InByb29mIjoiMHhhYmMxMjMuLi4ifX0
~~~

Decoded credential:

~~~json
{
  "id": "x7Tg2pLqR9mKvNwY3hBcZa",
  "payload": {
    "proof": "0xabc123..."
  }
}
~~~

## Payment-Receipt Header

Servers SHOULD include a `Payment-Receipt` header on successful responses:

~~~abnf
Payment-Receipt = b64token
~~~

The decoded JSON object contains:

| Field | Type | Description |
|-------|------|-------------|
| `status` | string | Payment status: "success" or "failed" |
| `method` | string | Payment method used |
| `timestamp` | string | ISO 8601 settlement time |
| `reference` | string | Method-specific reference (tx hash, invoice id, etc.) |

Payment method specifications MAY define additional fields for receipts.

# Payment Methods {#payment-methods}

## Method Identifier Format

Payment methods are identified by lowercase ASCII strings:

~~~abnf
payment-method-id = method-name [ ":" sub-method ]
method-name       = 1*ALPHA
sub-method        = 1*( ALPHA / DIGIT / "-" )
~~~

Method identifiers are case-sensitive and MUST be lowercase.

The optional `sub-method` component allows payment methods to specify
variants, networks, or chains. Payment method specifications MUST define
the semantics of their sub-methods.

## Method Registry

Payment methods are registered in the HTTP Payment Methods registry
({{payment-method-registry}}). Each registered method has an associated specification
that defines the `request` and `payload` schemas.

# Payment Intents {#payment-intents}

Payment intents describe the type of payment being requested.

## Intent Identifiers

~~~abnf
intent = 1*( ALPHA / DIGIT / "-" )
~~~

## Intent Specifications

Payment intents are defined in separate intent specifications that:

- Define the semantic meaning of the intent
- Specify required and optional `request` fields
- Specify `payload` requirements
- Define verification and settlement semantics
- Register the intent in the Payment Intent Registry ({{payment-intent-registry}})

See the Payment Intent Registry for registered intents.

## Intent Negotiation

If a server supports multiple intents, it MAY issue multiple challenges:

~~~http
WWW-Authenticate: Payment id="abc", realm="api.example.com", method="example", intent="charge", request="..."
WWW-Authenticate: Payment id="def", realm="api.example.com", method="example", intent="authorize", request="..."
~~~

Clients choose which challenge to respond to. Clients that do not
recognize an intent SHOULD treat the challenge as unsupported.

# Error Handling

## Error Response Format

Servers SHOULD return JSON error bodies with 402 responses:

~~~json
{
  "error": "error_code",
  "message": "Human-readable description"
}
~~~

## Error Codes

| Code | HTTP | Description |
|------|------|-------------|
| `payment_required` | 402 | Resource requires payment |
| `payment_insufficient` | 402 | Amount too low |
| `payment_expired` | 402 | Challenge or authorization expired |
| `payment_verification_failed` | 401 | Proof invalid |
| `payment_method_unsupported` | 400 | Method not accepted |
| `malformed_proof` | 400 | Invalid proof format |

## Retry Behavior

Servers SHOULD use the `Retry-After` HTTP header {{RFC9110}} to indicate
when clients may retry:

~~~http
HTTP/1.1 402 Payment Required
Retry-After: 60
WWW-Authenticate: Payment ...
~~~

# Extensibility

## Payment Method Specifications

Payment method specifications MUST define:

1. **Method Identifier**: Unique lowercase string
2. **Request Schema**: JSON structure for the `request` parameter
3. **Payload Schema**: JSON structure for credential payloads
4. **Verification Procedure**: How servers validate proofs
5. **Settlement Procedure**: How payment is finalized
6. **Security Considerations**: Method-specific threats and mitigations

## Custom Parameters

Implementations MAY define additional parameters in challenges:

- Parameters MUST use lowercase names
- Unknown parameters MUST be ignored by clients

## Size Considerations

Servers SHOULD keep challenges under 8KB. Clients MUST be able to handle
challenges of at least 4KB. Servers MUST be able to handle credentials
of at least 4KB.

# Internationalization Considerations

## Character Encoding

All string values use UTF-8 encoding {{RFC3629}}:

- The `request` and credential payloads are JSON {{RFC8259}}
- Payment method identifiers are restricted to ASCII lowercase
- The `realm` parameter SHOULD use ASCII-only values per {{RFC7235}}

## Human-Readable Text

The `description` parameter may contain localized text. Servers SHOULD
use the `Accept-Language` request header {{RFC9110}} to determine the
appropriate language.

# Security Considerations

## Threat Model

This specification assumes:

- Attackers can observe all network traffic
- Attackers can inject, modify, or replay messages
- Attackers may control malicious servers or clients

## Transport Security

Implementations MUST use TLS 1.2 {{RFC8446}} or later when transmitting
Payment challenges and credentials. Payment credentials contain sensitive
authorization data that could result in financial loss if intercepted.

Servers MUST NOT issue Payment challenges over unencrypted HTTP. Clients
MUST NOT send Payment credentials over unencrypted HTTP.

### Credential Handling

Payment credentials are bearer tokens that authorize financial transactions.
Servers and intermediaries MUST NOT log Payment credentials or include them
in error messages, debugging output, or analytics. Credential exposure could
enable replay attacks or unauthorized payments.

Implementations SHOULD treat Payment credentials with the same care as
authentication passwords or session tokens.

## Challenge Identifier Security

The challenge `id` parameter MUST be:

- **Unpredictable**: Not guessable by clients or attackers
- **Unique**: Never reused across challenges
- **Bound**: Each `id` MUST be bound to the origin, realm, and request

Servers MUST reject credentials containing invalid, expired, or
previously-used `id` values.

## Replay Protection

Payment methods MUST define their own replay protection mechanisms
(e.g., nonce consumption, preimage revelation, authorization expiry).

## Amount Verification {#amount-verification}

Clients MUST verify before authorizing payment:

1. Requested amount is reasonable for the resource
2. Recipient/address is expected
3. Currency/asset is as expected
4. Validity window is appropriate

Clients MUST NOT rely on the `description` parameter for payment
verification. Malicious servers could provide a misleading description
while the actual `request` payload requests a different amount.

## Privacy

- Servers MUST NOT require user accounts for payment
- Payment methods SHOULD support pseudonymous payments where possible
- Servers SHOULD NOT log Payment credentials in plaintext

## Credential Storage

Implementations MUST treat `Authorization: Payment` headers and
`Payment-Receipt` headers as sensitive data.

## Caching

Payment challenges contain unique identifiers and time-sensitive payment
data that MUST NOT be cached or reused. To prevent challenge replay and
stale payment information:

Servers MUST send `Cache-Control: no-store` {{RFC9111}} with 402 responses
and 401 responses containing `WWW-Authenticate: Payment` headers.

Responses containing `Payment-Receipt` headers MUST include
`Cache-Control: private` to prevent shared caches from storing
payment receipts.

## Cross-Origin Considerations

Clients (particularly browser-based wallets) SHOULD:

- Clearly display the origin requesting payment
- Require explicit user confirmation before authorizing payments
- Not automatically respond to Payment challenges

## Denial of Service

Servers SHOULD implement rate limiting on challenges issued and
credential verification attempts.

# IANA Considerations

## Authentication Scheme Registration

This document registers the "Payment" authentication scheme in the
"Hypertext Transfer Protocol (HTTP) Authentication Scheme Registry"
established by {{RFC7235}}:

- **Authentication Scheme Name**: Payment
- **Reference**: This document, {{the-payment-authentication-scheme}}
- **Notes**: Used with HTTP 402 status code for proof-of-payment flows

## Header Field Registration

This document registers the following header fields:

| Field Name | Status | Reference |
|------------|--------|-----------|
| Payment-Receipt | permanent | This document, {{payment-receipt-header}} |

## Payment Method Registry {#payment-method-registry}

This document establishes the "HTTP Payment Methods" registry. This
registry uses the "Specification Required" policy defined in {{RFC8126}}.

Registration requests must include:

- **Method Identifier**: Unique lowercase ASCII string
- **Description**: Brief description of the payment method
- **Reference**: Reference to the specification document
- **Contact**: Contact information for the registrant

## Payment Intent Registry {#payment-intent-registry}

This document establishes the "HTTP Payment Intents" registry. This
registry uses the "Specification Required" policy defined in {{RFC8126}}.

Registration requests must include:

- **Intent Identifier**: Unique lowercase ASCII string
- **Description**: Brief description of the intent semantics
- **Reference**: Reference to the specification document
- **Contact**: Contact information for the registrant

The registry is initially empty. Intent specifications register their
identifiers upon publication.

--- back

# ABNF Collected

~~~abnf
; HTTP Authentication Challenge (following RFC 7235 Section 2.1)
payment-challenge = "Payment" [ 1*SP auth-params ]
auth-params       = auth-param *( OWS "," OWS auth-param )
auth-param        = token BWS "=" BWS ( token / quoted-string )

; Required parameters: id, realm, method, intent, request
; Optional parameters: expires, description

; HTTP Authorization Credentials
payment-credentials = "Payment" 1*SP base64url-nopad

; Payment-Receipt header field value
Payment-Receipt = base64url-nopad

; Base64url encoding without padding per RFC 4648 Section 5
base64url-nopad = 1*( ALPHA / DIGIT / "-" / "_" )

; Payment method identifier
payment-method-id   = method-name [ ":" sub-method ]
method-name         = 1*ALPHA
sub-method          = 1*( ALPHA / DIGIT / "-" )

; Payment intent
intent = 1*( ALPHA / DIGIT / "-" )
~~~

# Examples

## One-Time Charge

A client requests a resource, receives a payment challenge, fulfills
the payment, and receives the resource with a receipt.

~~~
Client                                 Server
   │                                      │
   │  (1) GET /resource                   │
   ├─────────────────────────────────────>│
   │                                      │
   │  (2) 402 Payment Required            │
   │      WWW-Authenticate: Payment ...   │
   │<─────────────────────────────────────┤
   │                                      │
   │  (3) Fulfill payment challenge       │
   │      (method-specific)               │
   │                                      │
   │  (4) GET /resource                   │
   │      Authorization: Payment ...      │
   ├─────────────────────────────────────>│
   │                                      │
   │  (5) 200 OK                          │
   │      Payment-Receipt: ...            │
   │<─────────────────────────────────────┤
   │                                      │
~~~

**Challenge:**

~~~http
HTTP/1.1 402 Payment Required
Cache-Control: no-store
Content-Type: application/problem+json
WWW-Authenticate: Payment id="qB3wErTyU7iOpAsD9fGhJk",
    realm="api.example.com",
    method="invoice",
    intent="charge",
    expires="2025-01-15T12:05:00Z",
    request="eyJhbW91bnQiOiIxMDAwIiwiY3VycmVuY3kiOiJVU0QiLCJpbnZvaWNlIjoiaW52XzEyMzQ1In0"

{
  "type": "https://ietf.org/payment/problems/payment-required",
  "title": "Payment Required",
  "status": 402,
  "detail": "Payment required for access.",
  "challengeId": "qB3wErTyU7iOpAsD9fGhJk"
}
~~~

Decoded `request`:

~~~json
{
  "amount": "1000",
  "currency": "USD",
  "invoice": "inv_12345"
}
~~~

**Credential:**

~~~http
GET /resource HTTP/1.1
Host: api.example.com
Authorization: Payment eyJpZCI6InFCM3dFclR5VTdpT3BBc0Q5ZkdoSmsiLCJwYXlsb2FkIjp7InByZWltYWdlIjoiMHhhYmMxMjMuLi4ifX0
~~~

Decoded credential:

~~~json
{
  "id": "qB3wErTyU7iOpAsD9fGhJk",
  "payload": {
    "preimage": "0xabc123..."
  }
}
~~~

**Success:**

~~~http
HTTP/1.1 200 OK
Cache-Control: private
Payment-Receipt: eyJzdGF0dXMiOiJzdWNjZXNzIiwibWV0aG9kIjoiaW52b2ljZSIsInRpbWVzdGFtcCI6IjIwMjUtMDEtMTVUMTI6MDA6MDBaIiwicmVmZXJlbmNlIjoiaW52XzEyMzQ1In0
Content-Type: application/json

{"data": "..."}
~~~

## Signed Authorization

A payment method using cryptographic signatures:

**Challenge:**

~~~http
HTTP/1.1 402 Payment Required
Cache-Control: no-store
WWW-Authenticate: Payment id="zL4xCvBnM6kJhGfD8sAaWe",
    realm="api.example.com",
    method="signed",
    intent="charge",
    expires="2025-01-15T12:05:00Z",
    request="eyJhbW91bnQiOiI1MDAwIiwiYXNzZXQiOiJVU0QiLCJyZWNpcGllbnQiOiIweDc0MmQzNUNjNjYzNEMwNTMyOTI1YTNiODQ0QmM5ZTc1OTVmOGZFMDAiLCJub25jZSI6IjB4MTIzNDU2Nzg5MCJ9"
~~~

Decoded `request`:

~~~json
{
  "amount": "5000",
  "currency": "usd",
  "recipient": "0x742d35Cc6634C0532925a3b844Bc9e7595f8fE00",
  "methodDetails": {
    "nonce": "0x1234567890"
  }
}
~~~

**Credential:**

~~~json
{
  "id": "zL4xCvBnM6kJhGfD8sAaWe",
  "source": "did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK",
  "payload": {
    "signature": "0x1b2c3d4e5f..."
  }
}
~~~

## Multiple Payment Options

Server offers multiple payment methods:

~~~http
HTTP/1.1 402 Payment Required
Cache-Control: no-store
WWW-Authenticate: Payment id="pT7yHnKmQ2wErXsZ5vCbNl", realm="api.example.com", method="invoice", intent="charge", request="..."
WWW-Authenticate: Payment id="mF8uJkLpO3qRtYsA6wDcVb", realm="api.example.com", method="signed", intent="charge", request="..."
~~~

Client selects preferred method and responds accordingly.

## Failed Payment Verification

~~~http
HTTP/1.1 401 Unauthorized
Cache-Control: no-store
Content-Type: application/problem+json
WWW-Authenticate: Payment id="aB1cDeF2gHiJ3kLmN4oPqR", realm="api.example.com", method="invoice", intent="charge", request="..."

{
  "type": "https://ietf.org/payment/problems/verification-failed",
  "title": "Payment Verification Failed",
  "status": 401,
  "detail": "Invalid payment proof."
}
~~~

Note the use of 401 (not 402) for failed verification, with a fresh
challenge for retry.

# Acknowledgements

TBD
