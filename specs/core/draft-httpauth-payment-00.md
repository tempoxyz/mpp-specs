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
    org: Tempo Labs
  - name: Brendan Ryan
    ins: B. Ryan
    email: brendan@tempo.xyz
    org: Tempo Labs
  - name: Tom Meagher
    ins: T. Meagher
    email: thomas@tempo.xyz
    org: Tempo Labs
  - name: Jeff Weinstein
    ins: J. Weinstein
    email: jweinstein@stripe.com
    org: Stripe

normative:
  RFC2119:
  RFC3339:
  RFC3629:
  RFC4648:
  RFC5234:
  RFC5246:
  RFC8126:
  RFC8174:
  RFC8259:
  RFC8446:
  RFC9110:
  RFC9111:
  RFC9457:
  RFC9530:

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

## Status Codes {#response-status-codes}

The following table defines how servers MUST respond to payment-related
conditions:

| Condition | Status | Response |
|-----------|--------|----------|
| Resource requires payment, no credential provided | 402 | Fresh challenge in `WWW-Authenticate` |
| Malformed credential (invalid base64url, bad JSON) | 402 | Fresh challenge + `malformed-credential` problem |
| Unknown, expired, or already-used challenge `id` | 402 | Fresh challenge + `invalid-challenge` problem |
| Payment proof invalid or verification failed | 402 | Fresh challenge + `verification-failed` problem |
| Payment verified, access granted | 200 | Resource + optional `Payment-Receipt` |
| Payment verified, but policy denies access | 403 | No challenge (payment was valid) |

Servers MUST return 402 with a `WWW-Authenticate: Payment` header when
payment is required or when a payment credential fails validation
(see {{usage-of-402}} for details).

Error details are provided in the response body using Problem Details
{{RFC9457}} rather than in the `WWW-Authenticate` header parameters.

## Relationship to 401 Unauthorized

This specification uses 402 (Payment Required) consistently for all
payment-related challenges, including failed credential validation.
This diverges from the traditional 401 pattern used by other HTTP
authentication schemes. The distinction is intentional:

- **402** indicates a payment barrier (initial challenge or retry needed)
- **401** is reserved for authentication failures unrelated to payment
- **403** indicates the payment succeeded but access is denied by policy

This design ensures clients can distinguish payment requirements from
other authentication schemes that use 401.

## Usage of 402 Payment Required {#usage-of-402}

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
{{RFC9110}}. The challenge uses the auth-param syntax defined in Section 11
of {{RFC9110}}:

~~~abnf
challenge       = "Payment" [ 1*SP auth-params ]
auth-params     = auth-param *( OWS "," OWS auth-param )
auth-param      = token BWS "=" BWS ( token / quoted-string )
~~~

### Required Parameters

**`id`**: Unique challenge identifier. Servers MUST bind this value to the
  challenge parameters (Section 5.1.3) to enable verification. Clients MUST
  include this value unchanged in the credential.

**`realm`**: Protection space identifier per {{RFC9110}}. Servers MUST
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

**`digest`**: Content digest of the request body, formatted per [RFC9530].
  Servers SHOULD include this parameter when the payment challenge applies
  to a request with a body (e.g., POST, PUT, PATCH). When present, clients
  MUST submit the credential with a request body whose digest matches this
  value. See Section 5.1.3 for body binding requirements.

**`expires`**: Timestamp indicating when this challenge expires, formatted
  as an {{RFC3339}} date-time string (e.g., `"2025-01-15T12:00:00Z"`).
  Servers SHOULD include this parameter. Clients MUST NOT submit
  credentials for expired challenges.

**`description`**: Human-readable description of the resource or payment
  purpose. This parameter is for display purposes only and MUST NOT be
  relied upon for payment verification (see {{amount-verification}}).

Unknown parameters MUST be ignored by clients.

#### Challenge Binding

Servers SHOULD bind the challenge `id` to the challenge parameters (Sections
5.1.1 and 5.1.2) to prevent request integrity attacks where a client could
sign or submit a payment different from what the server intended. Servers
MUST verify that credentials present an `id` matching the expected binding.

The binding mechanism is implementation-defined. Servers MAY use stateful
storage (e.g., database lookup) or stateless verification (e.g., HMAC,
authenticated encryption) to validate the binding.

#### Example Challenge

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
  "currency": "usd",
  "recipient": "acct_123"
}
~~~

### Request Body Binding

Servers SHOULD include the `digest` parameter when issuing challenges for
requests with bodies. The digest value is computed per [RFC9530]:

~~~http
WWW-Authenticate: Payment id="...",
    realm="api.example.com",
    method="example",
    intent="charge",
    digest="sha-256=:X48E9qOokqqrvdts8nOJRJN3OWDUoyWxBf7kbu9DBPE=:",
    expires="2025-01-15T12:05:00Z",
    request="..."
~~~

When verifying a credential with a `digest` parameter, servers MUST:

1. Compute the digest of the current request body per [RFC9530]
2. Compare it with the `digest` value from the challenge
3. Reject the credential if the digests do not match


## Credentials (Authorization)

The Payment credential is sent in the `Authorization` header using
base64url encoding without padding per {{RFC4648}} Section 5:

~~~abnf
credentials     = "Payment" 1*SP base64url-nopad
base64url-nopad = 1*( ALPHA / DIGIT / "-" / "_" )
~~~

The base64url-nopad value is a base64url-encoded JSON object (without padding)
containing:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `challenge` | object | Yes | Echoed challenge parameters |
| `source` | string | No | Payer identifier (RECOMMENDED: DID format per [W3C-DID]) |
| `payload` | object | Yes | Method-specific payment proof |

The `challenge` object contains the parameters from the original challenge:

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Challenge identifier |
| `realm` | string | Protection space |
| `method` | string | Payment method identifier |
| `intent` | string | Payment intent type |
| `request` | string | Base64url-encoded payment request |
| `digest` | string | Content digest  |
| `expires` | string | Challenge expiration timestamp |

The `payload` field contains the payment-method-specific data needed to
complete the payment challenge. Payment method specifications define the
exact structure.

### Example Credential

~~~http
GET /api/data HTTP/1.1
Host: api.example.com
Authorization: Payment eyJjaGFsbGVuZ2UiOnsiaWQiOiJ4N1RnMnBMcVI5bUt2TndZM2hCY1phIiwicmVhbG0iOiJhcGkuZXhhbXBsZS5jb20iLCJtZXRob2QiOiJleGFtcGxlIiwiaW50ZW50IjoiY2hhcmdlIiwicmVxdWVzdCI6ImV5SmhiVzkxYm5RaU9pSXhNREF3SWl3aVkzVnljbVZ1WTNraU9pSlZVMFFpTENKeVpXTnBjR2xsYm5RaU9pSmhZMk4wWHpFeU15SjkiLCJleHBpcmVzIjoiMjAyNS0wMS0xNVQxMjowNTowMFoifSwicGF5bG9hZCI6eyJwcm9vZiI6IjB4YWJjMTIzLi4uIn19
~~~

Decoded credential:

~~~json
{
  "challenge": {
    "id": "x7Tg2pLqR9mKvNwY3hBcZa",
    "realm": "api.example.com",
    "method": "example",
    "intent": "charge",
    "request": "eyJhbW91bnQiOiIxMDAwIiwiY3VycmVuY3kiOiJVU0QiLCJyZWNpcGllbnQiOiJhY2N0XzEyMyJ9",
    "expires": "2025-01-15T12:05:00Z"
  },
  "payload": {
    "proof": "0xabc123..."
  }
}
~~~

## Payment-Receipt Header {#payment-receipt-header}

Servers SHOULD include a `Payment-Receipt` header on successful responses:

~~~abnf
Payment-Receipt = base64url-nopad
~~~

The decoded JSON object contains:

| Field | Type | Description |
|-------|------|-------------|
| `status` | string | Payment status: "success" or "failed" |
| `method` | string | Payment method used |
| `timestamp` | string | ISO 8601 settlement time |
| `reference` | string | Method-specific reference (tx hash, invoice id, etc.) |

Payment method specifications MAY define additional fields for receipts.

### Receipt Status Semantics

The `status` field indicates the final settlement status of the payment:

- **"success"**: The payment was verified and settled successfully.
- **"failed"**: The payment was submitted but failed during settlement.

Servers MUST NOT return a 200 response with a `status: "failed"` receipt
for synchronous payment flows. When verification determines that a payment
failed, servers MUST return 402 with a `verification-failed` problem
(see {{response-status-codes}}).

The `status: "failed"` value is intended for asynchronous notification
channels where the client has already received a 200 response but the
payment subsequently failed during settlement. Payment method specifications
that support asynchronous settlement MUST define how clients are notified
of failed payments.

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

Servers SHOULD return Problem Details {{RFC9457}} error bodies with 402
responses:

~~~json
{
  "type": "https://paymentauth.org/problems/payment-required",
  "title": "Payment Required",
  "status": 402,
  "detail": "Human-readable description"
}
~~~

The `type` URI SHOULD correspond to the error code from the table
below (e.g., `https://paymentauth.org/problems/verification-failed`
for `payment_verification_failed`).

## Error Codes

| Code | HTTP | Description |
|------|------|-------------|
| `payment_required` | 402 | Resource requires payment |
| `payment_insufficient` | 402 | Amount too low |
| `payment_expired` | 402 | Challenge or authorization expired |
| `payment_verification_failed` | 402 | Proof invalid |
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
- The `realm` parameter SHOULD use ASCII-only values per {{RFC9110}}

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

This specification REQUIRES TLS 1.2 {{!RFC5246}} or later for all Payment
authentication flows. TLS 1.3 {{RFC8446}} is RECOMMENDED.

Implementations MUST use TLS when transmitting Payment challenges and
credentials. Payment credentials contain sensitive authorization data
that could result in financial loss if intercepted.

Servers MUST NOT issue Payment challenges over unencrypted HTTP. Clients
MUST NOT send Payment credentials over unencrypted HTTP. Implementations
SHOULD reject Payment protocol messages received over non-TLS connections.

### Credential Handling

Payment credentials are bearer tokens that authorize financial transactions.
Servers and intermediaries MUST NOT log Payment credentials or include them
in error messages, debugging output, or analytics. Credential exposure could
enable replay attacks or unauthorized payments.

Implementations MUST treat Payment credentials with the same care as
authentication passwords or session tokens. Credentials SHOULD be stored
only in memory and cleared after use.


## Replay Protection

Payment methods used with this specification MUST provide single-use
proof semantics. A payment proof MUST be usable exactly once; subsequent
attempts to use the same proof MUST be rejected by the payment method
infrastructure.


## Idempotency and Side Effects

Servers MUST NOT perform side effects (database writes, external API
calls, resource creation) for requests that have not been paid. The
unpaid request that triggers a 402 challenge MUST NOT modify server
state beyond recording the challenge itself.

For non-idempotent methods (POST, PUT, DELETE), servers SHOULD accept
an `Idempotency-Key` header to enable safe client retries. When a client
retries a request with the same `Idempotency-Key` and a valid Payment
credential, the server SHOULD return the same response as the original
successful request without re-executing the operation.

## Concurrent Request Handling

Servers MUST ensure that concurrent requests with the same Payment
credential result in at most one successful payment settlement and one
resource delivery. Race conditions between parallel requests could
otherwise cause double-payment or double-delivery.

Implementations SHOULD use atomic operations or distributed locks when
verifying and consuming Payment credentials. The credential verification
and resource delivery SHOULD be performed as an atomic operation where
possible.

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

## Intermediary Handling of 402

HTTP intermediaries (proxies, caches, CDNs) may not recognize 402 as an
authentication challenge in the same way they handle 401. While this
specification uses `WWW-Authenticate` headers with 402 responses following
the same syntax as {{RFC9110}}, intermediaries that perform special
processing for 401 (such as stripping credentials or triggering
authentication prompts) may not apply the same behavior to 402.

Servers SHOULD NOT rely on intermediary-specific handling of 402 responses.
Clients MUST be prepared to receive 402 responses through any intermediary.

## Caching

Payment challenges contain unique identifiers and time-sensitive payment
data that MUST NOT be cached or reused. To prevent challenge replay and
stale payment information:

Servers MUST send `Cache-Control: no-store` {{RFC9111}} with 402 responses.

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
established by {{RFC9110}}:

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

; Payment method identifier (lowercase only)
payment-method-id   = method-name [ ":" sub-method ]
method-name         = 1*LOWERALPHA
sub-method          = 1*( LOWERALPHA / DIGIT / "-" )
LOWERALPHA          = %x61-7A  ; a-z

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
  "type": "https://paymentauth.org/problems/payment-required",
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
  "currency": "usd",
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
  "challenge": {
    "id": "qB3wErTyU7iOpAsD9fGhJk",
    "realm": "api.example.com",
    "method": "invoice",
    "intent": "charge",
    "request": "eyJhbW91bnQiOiIxMDAwIiwiY3VycmVuY3kiOiJVU0QiLCJpbnZvaWNlIjoiaW52XzEyMzQ1In0",
    "expires": "2025-01-15T12:05:00Z"
  },
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
  "challenge": {
    "id": "zL4xCvBnM6kJhGfD8sAaWe",
    "realm": "api.example.com",
    "method": "signed",
    "intent": "charge",
    "request": "eyJhbW91bnQiOiI1MDAwIiwiYXNzZXQiOiJVU0QiLCJyZWNpcGllbnQiOiIweDc0MmQzNUNjNjYzNEMwNTMyOTI1YTNiODQ0QmM5ZTc1OTVmOGZFMDAiLCJub25jZSI6IjB4MTIzNDU2Nzg5MCJ9",
    "expires": "2025-01-15T12:05:00Z"
  },
  "source": "did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK",
  "payload": {
    "signature": "0x1b2c3d4e5f..."
  }
}
~~~

## Multiple Payment Options

Servers MAY return multiple Payment challenges in a single 402 response,
each with a different payment method or configuration:

~~~http
HTTP/1.1 402 Payment Required
Cache-Control: no-store
WWW-Authenticate: Payment id="pT7yHnKmQ2wErXsZ5vCbNl", realm="api.example.com", method="invoice", intent="charge", request="..."
WWW-Authenticate: Payment id="mF8uJkLpO3qRtYsA6wDcVb", realm="api.example.com", method="signed", intent="charge", request="..."
~~~

When a server returns multiple challenges, clients SHOULD select one
based on their capabilities and user preferences. Clients MUST send
only one `Authorization: Payment` header in the subsequent request,
corresponding to the selected challenge.

Servers receiving multiple Payment credentials in a single request
SHOULD reject with 400 (Bad Request).

## Failed Payment Verification

~~~http
HTTP/1.1 402 Payment Required
Cache-Control: no-store
Content-Type: application/problem+json
WWW-Authenticate: Payment id="aB1cDeF2gHiJ3kLmN4oPqR", realm="api.example.com", method="invoice", intent="charge", request="..."

{
  "type": "https://paymentauth.org/problems/verification-failed",
  "title": "Payment Verification Failed",
  "status": 402,
  "detail": "Invalid payment proof."
}
~~~

The server returns 402 with a fresh challenge, allowing the client to
retry with a new payment credential.

# Acknowledgements

TBD
