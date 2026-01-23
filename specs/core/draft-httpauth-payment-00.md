---
title: The "Payment" HTTP Authentication Scheme
docName: draft-httpauth-payment-00
category: std
ipr: trust200902
submissionType: IETF
consensus: true

author:
  - fullname: Jake Moxey
    email: jake@tempo.xyz
    organization: Tempo Labs
---

## Abstract

This document defines the "Payment" HTTP authentication scheme, enabling
HTTP resources to require a payment challenge to be fulfilled before access.
The scheme extends HTTP Authentication, using the HTTP 402 "Payment Required"
status code.

The protocol is payment-method agnostic, supporting any payment network
or currency through registered payment method identifiers. Specific
payment methods are defined in separate payment method specifications.

## Status of This Memo

This Internet-Draft is submitted in full conformance with the provisions
of BCP 78 and BCP 79.

## Copyright Notice

Copyright (c) 2025 IETF Trust and the persons identified as the document
authors. All rights reserved.

## 1. Introduction

HTTP 402 "Payment Required" was reserved in HTTP/1.1 [RFC9110] for future
use but never standardized. This specification defines the "Payment"
authentication scheme that gives 402 its semantics, enabling resources to
require a payment challenge to be fulfilled before access.

### 1.1. Relationship to Payment Method Specifications

This specification defines the abstract protocol framework. Concrete
payment methods are defined in payment method specifications that:

- Register a payment method identifier
- Define the `request` schema for that method
- Define the `payload` schema for that method
- Specify verification and settlement procedures

---

## 2. Requirements Language

The key words "MUST", "MUST NOT", "REQUIRED", "SHALL", "SHALL NOT",
"SHOULD", "SHOULD NOT", "RECOMMENDED", "NOT RECOMMENDED", "MAY", and
"OPTIONAL" in this document are to be interpreted as described in
BCP 14 [RFC2119] [RFC8174] when, and only when, they appear in all
capitals, as shown here.

---

## 3. Terminology

**Payment Challenge**
: A `WWW-Authenticate` header with scheme "Payment" indicating the
  payment requirements for accessing a resource.

**Payment Credential**
: An `Authorization` header with scheme "Payment" containing payment
  authorization data.

**Payment Method**
: A mechanism for transferring value, identified by a registered
  identifier.

**Payment Intent**
: The type of payment request, identified by a registered value in the
  IANA "HTTP Payment Intents" registry. Intents are defined by separate
  intent specifications.

**Request**
: Method-specific data in the challenge enabling payment completion.
  Encoded as base64url JSON in the `request` parameter.

**Payload**
: Method-specific data in the credential proving payment.

---

## 4. Protocol Overview

### 4.1. Request Flow

```
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
```

### 4.2. Status Codes

| Code | Meaning |
|------|---------|
| 402  | Resource requires payment; see `WWW-Authenticate` |
| 200  | Payment verified; resource provided |
| 400  | Malformed payment credential or proof |
| 401  | Valid format but payment verification failed |
| 403  | Payment verified but access denied (policy) |

Servers MUST return 402 with a `WWW-Authenticate: Payment` header when
payment is required. Servers SHOULD NOT return 402 without this header.

### 4.3. Relationship to 401 Unauthorized

This specification uses 402 (Payment Required) for the initial payment
challenge, diverging from the traditional 401 pattern used by other HTTP
authentication schemes. This distinction is intentional:

- **402** indicates the resource requires payment (economic barrier)
- **401** indicates authentication/authorization failure (credential barrier)

When a client submits an invalid Payment credential, servers MUST return
401 (Unauthorized) with a `WWW-Authenticate: Payment` header containing a
fresh challenge.

### 4.4. Usage of 402 Payment Required

The 402 (Payment Required) status code was reserved by [RFC9110] for future
use. This specification defines semantics for 402 within the context of the
Payment authentication scheme.

#### 4.4.1. When to Return 402

Servers SHOULD return 402 when:

- The resource requires payment as a precondition for access
- The server can provide a Payment challenge that the client may fulfill
- Payment is the primary barrier to access (not authentication or authorization)

Servers MAY return 402 when:

- Offering optional paid features or premium content
- Indicating that a previously-paid resource requires additional payment
- The payment requirement applies to a subset of request methods

#### 4.4.2. When NOT to Return 402

Servers SHOULD NOT return 402 when:

- The client lacks authentication credentials (use 401)
- The client is authenticated but lacks authorization (use 403)
- The resource does not exist (use 404)
- No Payment challenge can be constructed for the request

Servers MUST NOT return 402 without including a `WWW-Authenticate` header
containing at least one Payment challenge.

#### 4.4.3. Interaction with Other Authentication Schemes

When a resource requires both authentication and payment, servers SHOULD:

1. First verify authentication credentials
2. Return 401 if authentication fails
3. Return 402 with a Payment challenge only after successful authentication

This ordering prevents information leakage about payment requirements to
unauthenticated clients.

---

## 5. The Payment Authentication Scheme

### 5.1. Challenge (WWW-Authenticate)

The Payment challenge is sent in the `WWW-Authenticate` header per
[RFC7235]. The challenge uses the auth-param syntax defined in Section 2.1
of [RFC7235]:

```abnf
challenge       = "Payment" [ 1*SP auth-params ]
auth-params     = auth-param *( OWS "," OWS auth-param )
auth-param      = token BWS "=" BWS ( token / quoted-string )
```

#### 5.1.1. Required Parameters

**`id`**: Unique challenge identifier. Servers MUST bind this value to the
  challenge parameters (Section 5.1.3) to enable verification. Clients MUST
  include this value unchanged in the credential.

**`realm`**: Protection space identifier per [RFC7235]. Servers MUST
  include this parameter to define the scope of the payment requirement.

**`method`**: Payment method identifier (Section 6). MUST be a lowercase
  ASCII string.

**`intent`**: Payment intent type (Section 7). The value MUST be a
  registered entry in the IANA "HTTP Payment Intents" registry.

**`request`**: Base64url-encoded [RFC4648] JSON [RFC8259] containing
  payment-method-specific data needed to complete payment. Structure is
  defined by the payment method specification. Padding characters ("=")
  MUST NOT be included.

#### 5.1.2. Optional Parameters

**`digest`**: Content digest of the request body, formatted per [RFC9530].
  Servers SHOULD include this parameter when the payment challenge applies
  to a request with a body (e.g., POST, PUT, PATCH). When present, clients
  MUST submit the credential with a request body whose digest matches this
  value. See Section 5.1.5 for body binding requirements.

**`expires`**: Timestamp indicating when this challenge expires, formatted
  as an [RFC3339] date-time string (e.g., `"2025-01-15T12:00:00Z"`).
  Servers SHOULD include this parameter. Clients MUST NOT submit
  credentials for expired challenges.

**`description`**: Human-readable description of the resource or payment
  purpose. This parameter is for display purposes only and MUST NOT be
  relied upon for payment verification (see Section 11.5).

Unknown parameters MUST be ignored by clients.

#### 5.1.3. Challenge Binding

Servers MUST bind the challenge `id` to the challenge parameters (Sections
5.1.1 and 5.1.2) to prevent request integrity attacks where a client could
sign or submit a payment different from what the server intended. Servers
MUST verify that credentials present an `id` matching the expected binding.

The binding mechanism is implementation-defined. Servers MAY use stateful
storage (e.g., database lookup) or stateless verification (e.g., HMAC,
authenticated encryption) to validate the binding.

#### 5.1.4. Example Challenge

```http
HTTP/1.1 402 Payment Required
Cache-Control: no-store
WWW-Authenticate: Payment id="x7Tg2pLqR9mKvNwY3hBcZa",
    realm="api.example.com",
    method="example",
    intent="charge",
    expires="2025-01-15T12:05:00Z",
    request="eyJhbW91bnQiOiIxMDAwIiwiY3VycmVuY3kiOiJVU0QiLCJyZWNpcGllbnQiOiJhY2N0XzEyMyJ9"
```

Example decoded `request`:

```json
{
  "amount": "1000",
  "currency": "USD",
  "recipient": "acct_123"
}
```

#### 5.1.5. Request Body Binding

Servers SHOULD include the `digest` parameter when issuing challenges for
requests with bodies. The digest value is computed per [RFC9530]:

```http
WWW-Authenticate: Payment id="...",
    realm="api.example.com",
    method="example",
    intent="charge",
    digest="sha-256=:X48E9qOokqqrvdts8nOJRJN3OWDUoyWxBf7kbu9DBPE=:",
    expires="2025-01-15T12:05:00Z",
    request="..."
```

When verifying a credential with a `digest` parameter, servers MUST:

1. Compute the digest of the current request body per [RFC9530]
2. Compare it with the `digest` value from the challenge
3. Reject the credential if the digests do not match


### 5.2. Credentials (Authorization)

The Payment credential is sent in the `Authorization` header using the
b64token syntax as defined in [RFC6750]:

```abnf
credentials     = "Payment" 1*SP b64token
b64token        = 1*( ALPHA / DIGIT / "-" / "." / "_" / "~" / "+" / "/" ) *"="
```

The b64token value is a base64url-encoded JSON object (without padding)
containing:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `challenge` | object | Yes | Echoed challenge parameters |
| `source` | string | No | Payer identifier (RECOMMENDED: DID format per [W3C-DID]) |
| `payload` | object | Yes | Method-specific payment proof |

The `challenge` object contains the parameters from the original challenge,
enabling stateless server verification:

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

#### 5.2.1. Example Credential

```http
GET /api/data HTTP/1.1
Host: api.example.com
Authorization: Payment eyJjaGFsbGVuZ2UiOnsiaWQiOiJ4N1RnMnBMcVI5bUt2TndZM2hCY1phIiwicmVhbG0iOiJhcGkuZXhhbXBsZS5jb20iLCJtZXRob2QiOiJleGFtcGxlIiwiaW50ZW50IjoiY2hhcmdlIiwicmVxdWVzdCI6ImV5SmhiVzkxYm5RaU9pSXhNREF3SWl3aVkzVnljbVZ1WTNraU9pSlZVMFFpTENKeVpXTnBjR2xsYm5RaU9pSmhZMk4wWHpFeU15SjkiLCJleHBpcmVzIjoiMjAyNS0wMS0xNVQxMjowNTowMFoifSwicGF5bG9hZCI6eyJwcm9vZiI6IjB4YWJjMTIzLi4uIn19
```

Decoded credential:

```json
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
```

### 5.3. Payment-Receipt Header

Servers SHOULD include a `Payment-Receipt` header on successful responses:

```abnf
Payment-Receipt = b64token
```

The decoded JSON object contains:

| Field | Type | Description |
|-------|------|-------------|
| `status` | string | Payment status: "success" or "failed" |
| `method` | string | Payment method used |
| `timestamp` | string | ISO 8601 settlement time |
| `reference` | string | Method-specific reference (tx hash, invoice id, etc.) |

Payment method specifications MAY define additional fields for receipts.


---

## 6. Payment Methods

### 6.1. Method Identifier Format

Payment methods are identified by lowercase ASCII strings:

```abnf
payment-method-id = method-name [ ":" sub-method ]
method-name       = 1*ALPHA
sub-method        = 1*( ALPHA / DIGIT / "-" )
```

Method identifiers are case-sensitive and MUST be lowercase.

The optional `sub-method` component allows payment methods to specify
variants, networks, or chains. Payment method specifications MUST define
the semantics of their sub-methods.

### 6.2. Method Registry

Payment methods are registered in the HTTP Payment Methods registry
(Section 12.3). Each registered method has an associated specification
that defines the `request` and `payload` schemas.

---

## 7. Payment Intents

Payment intents describe the type of payment being requested.

### 7.1. Intent Identifiers

```abnf
intent = 1*( ALPHA / DIGIT / "-" )
```

### 7.2. Intent Specifications

Payment intents are defined in separate intent specifications that:

- Define the semantic meaning of the intent
- Specify required and optional `request` fields
- Specify `payload` requirements
- Define verification and settlement semantics
- Register the intent in the Payment Intent Registry (Section 12.4)

See the Payment Intent Registry for registered intents.

### 7.3. Intent Negotiation

If a server supports multiple intents, it MAY issue multiple challenges:

```http
WWW-Authenticate: Payment id="abc", realm="api.example.com", method="example", intent="charge", request="..."
WWW-Authenticate: Payment id="def", realm="api.example.com", method="example", intent="authorize", request="..."
```

Clients choose which challenge to respond to. Clients that do not
recognize an intent SHOULD treat the challenge as unsupported.

---

## 8. Error Handling

### 8.1. Error Response Format

Servers SHOULD return JSON error bodies with 402 responses:

```json
{
  "error": "error_code",
  "message": "Human-readable description"
}
```

### 8.2. Error Codes

| Code | HTTP | Description |
|------|------|-------------|
| `payment_required` | 402 | Resource requires payment |
| `payment_insufficient` | 402 | Amount too low |
| `payment_expired` | 402 | Challenge or authorization expired |
| `payment_verification_failed` | 401 | Proof invalid |
| `payment_method_unsupported` | 400 | Method not accepted |
| `malformed_proof` | 400 | Invalid proof format |

### 8.3. Retry Behavior

Servers SHOULD use the `Retry-After` HTTP header [RFC9110] to indicate
when clients may retry:

```http
HTTP/1.1 402 Payment Required
Retry-After: 60
WWW-Authenticate: Payment ...
```

---

## 9. Extensibility

### 9.1. Payment Method Specifications

Payment method specifications MUST define:

1. **Method Identifier**: Unique lowercase string
2. **Request Schema**: JSON structure for the `request` parameter
3. **Payload Schema**: JSON structure for credential payloads
4. **Verification Procedure**: How servers validate proofs
5. **Settlement Procedure**: How payment is finalized
6. **Security Considerations**: Method-specific threats and mitigations

### 9.2. Custom Parameters

Implementations MAY define additional parameters in challenges:

- Parameters MUST use lowercase names
- Unknown parameters MUST be ignored by clients

### 9.3. Size Considerations

Servers SHOULD keep challenges under 8KB. Clients MUST be able to handle
challenges of at least 4KB. Servers MUST be able to handle credentials
of at least 4KB.

---

## 10. Internationalization Considerations

### 10.1. Character Encoding

All string values use UTF-8 encoding [RFC3629]:

- The `request` and credential payloads are JSON [RFC8259]
- Payment method identifiers are restricted to ASCII lowercase
- The `realm` parameter SHOULD use ASCII-only values per [RFC7235]

### 10.2. Human-Readable Text

The `description` parameter may contain localized text. Servers SHOULD
use the `Accept-Language` request header [RFC9110] to determine the
appropriate language.

---

## 11. Security Considerations

### 11.1. Threat Model

This specification assumes:

- Attackers can observe all network traffic
- Attackers can inject, modify, or replay messages
- Attackers may control malicious servers or clients

### 11.2. Transport Security

Implementations MUST use TLS 1.2 [RFC8446] or later when transmitting
Payment challenges and credentials. Payment credentials contain sensitive
authorization data that could result in financial loss if intercepted.

Servers MUST NOT issue Payment challenges over unencrypted HTTP. Clients
MUST NOT send Payment credentials over unencrypted HTTP.

### 11.3. Challenge Identifier Security

The challenge `id` is a self-contained, cryptographically-bound identifier
(Section 5.1.3). The `id` MUST be:

- **Tamper-proof**: The HMAC-SHA-256 construction prevents modification
  of challenge parameters.
- **Context-bound**: The identifier is cryptographically bound to `realm`,
  `method`, `intent`, `request`, and `expires`.

Servers MUST reject credentials where:

- The `challenge.id` fails HMAC verification.
- The `challenge.expires` timestamp has passed.
- The `challenge.realm` does not match the expected realm for the resource.

#### 11.3.1. Delimiter Security

The newline-delimited encoding specified in Section 5.1.3.1 prevents
concatenation ambiguity attacks. The delimiter is unambiguous because
none of the challenge parameter fields can contain newline characters.

Implementations MUST use the exact encoding specified in Section 5.1.3.1.

### 11.4. Replay Protection

Payment methods used with this specification MUST provide single-use
proof semantics. A payment proof MUST be usable exactly once; subsequent
attempts to use the same proof MUST be rejected by the payment method
infrastructure.


### 11.5. Amount Verification

Clients MUST verify before authorizing payment:

1. Requested amount is reasonable for the resource
2. Recipient/address is expected
3. Currency/asset is as expected
4. Validity window is appropriate

Clients MUST NOT rely on the `description` parameter for payment
verification. Malicious servers could provide a misleading description
while the actual `request` payload requests a different amount.

### 11.6. Privacy

- Servers MUST NOT require user accounts for payment
- Payment methods SHOULD support pseudonymous payments where possible
- Servers SHOULD NOT log Payment credentials in plaintext

### 11.7. Credential Storage

Implementations MUST treat `Authorization: Payment` headers and
`Payment-Receipt` headers as sensitive data.

### 11.8. Caching

Payment challenges contain unique identifiers and time-sensitive payment
data that MUST NOT be cached or reused. To prevent challenge replay and
stale payment information:

Servers MUST send `Cache-Control: no-store` [RFC9111] with 402 responses
and 401 responses containing `WWW-Authenticate: Payment` headers.

Responses containing `Payment-Receipt` headers MUST include
`Cache-Control: private` to prevent shared caches from storing
payment receipts.

### 11.9. Cross-Origin Considerations

Clients (particularly browser-based wallets) SHOULD:

- Clearly display the origin requesting payment
- Require explicit user confirmation before authorizing payments
- Not automatically respond to Payment challenges

### 11.10. Denial of Service

Servers SHOULD implement rate limiting on challenges issued and
credential verification attempts.

---

## 12. IANA Considerations

### 12.1. Authentication Scheme Registration

This document registers the "Payment" authentication scheme in the
"Hypertext Transfer Protocol (HTTP) Authentication Scheme Registry"
established by [RFC7235]:

- **Authentication Scheme Name**: Payment
- **Reference**: This document, Section 5
- **Notes**: Used with HTTP 402 status code for proof-of-payment flows

### 12.2. Header Field Registration

This document registers the following header fields:

| Field Name | Status | Reference |
|------------|--------|-----------|
| Payment-Receipt | permanent | This document, Section 5.3 |

### 12.3. Payment Method Registry

This document establishes the "HTTP Payment Methods" registry. This
registry uses the "Specification Required" policy defined in [RFC8126].

Registration requests must include:

- **Method Identifier**: Unique lowercase ASCII string
- **Description**: Brief description of the payment method
- **Reference**: Reference to the specification document
- **Contact**: Contact information for the registrant

### 12.4. Payment Intent Registry

This document establishes the "HTTP Payment Intents" registry. This
registry uses the "Specification Required" policy defined in [RFC8126].

Registration requests must include:

- **Intent Identifier**: Unique lowercase ASCII string
- **Description**: Brief description of the intent semantics
- **Reference**: Reference to the specification document
- **Contact**: Contact information for the registrant

The registry is initially empty. Intent specifications register their
identifiers upon publication.

---

## 13. References

### 13.1. Normative References

- **[RFC2119]** Bradner, S., "Key words for use in RFCs to Indicate
  Requirement Levels", BCP 14, RFC 2119, March 1997.

- **[RFC3339]** Klyne, G. and C. Newman, "Date and Time on the Internet:
  Timestamps", RFC 3339, July 2002.

- **[RFC3629]** Yergeau, F., "UTF-8, a transformation format of ISO
  10646", STD 63, RFC 3629, November 2003.

- **[RFC4648]** Josefsson, S., "The Base16, Base32, and Base64 Data
  Encodings", RFC 4648, October 2006.

- **[RFC5234]** Crocker, D., Ed. and P. Overell, "Augmented BNF for
  Syntax Specifications: ABNF", STD 68, RFC 5234, January 2008.

- **[RFC6750]** Jones, M. and D. Hardt, "The OAuth 2.0 Authorization
  Framework: Bearer Token Usage", RFC 6750, October 2012.

- **[RFC7235]** Fielding, R., Ed. and J. Reschke, Ed., "Hypertext
  Transfer Protocol (HTTP/1.1): Authentication", RFC 7235, June 2014.

- **[RFC8126]** Cotton, M., Leiba, B., and T. Narten, "Guidelines for
  Writing an IANA Considerations Section in RFCs", BCP 26, RFC 8126,
  June 2017.

- **[RFC8174]** Leiba, B., "Ambiguity of Uppercase vs Lowercase in
  RFC 2119 Key Words", BCP 14, RFC 8174, May 2017.

- **[RFC8259]** Bray, T., Ed., "The JavaScript Object Notation (JSON)
  Data Interchange Format", STD 90, RFC 8259, December 2017.

- **[RFC8446]** Rescorla, E., "The Transport Layer Security (TLS)
  Protocol Version 1.3", RFC 8446, August 2018.

- **[RFC9110]** Fielding, R., Ed., Nottingham, M., Ed., and J. Reschke,
  Ed., "HTTP Semantics", STD 97, RFC 9110, June 2022.

- **[RFC9111]** Fielding, R., Ed., Nottingham, M., Ed., and J. Reschke,
  Ed., "HTTP Caching", STD 98, RFC 9111, June 2022.

- **[RFC9421]** Backman, A., Ed., Richer, J., Ed., and M. Sporny,
  "HTTP Message Signatures", RFC 9421, February 2024.

- **[RFC9530]** Polli, R. and L. Pardue, "Digest Fields", RFC 9530,
  February 2024.

### 13.2. Informative References

- **[W3C-DID]** W3C, "Decentralized Identifiers (DIDs) v1.0",
  <https://www.w3.org/TR/did-core/>.

- **[W3C-PMI]** W3C, "Payment Method Identifiers",
  <https://www.w3.org/TR/payment-method-id/>.

---

## Appendix A: ABNF Collected

```abnf
; HTTP Authentication Challenge (following RFC 7235 Section 2.1)
payment-challenge = "Payment" [ 1*SP auth-params ]
auth-params       = auth-param *( OWS "," OWS auth-param )
auth-param        = token BWS "=" BWS ( token / quoted-string )

; Required parameters: id, realm, method, intent, request
; Optional parameters: expires, description

; HTTP Authorization Credentials (following RFC 6750 b64token)
payment-credentials   = "Payment" 1*SP b64token

; Payment-Receipt header field value
Payment-Receipt       = b64token

; Payment method identifier
payment-method-id   = method-name [ ":" sub-method ]
method-name         = 1*ALPHA
sub-method          = 1*( ALPHA / DIGIT / "-" )

; Payment intent
intent = 1*( ALPHA / DIGIT / "-" )
```

---

## Appendix B: Examples

### B.1. One-Time Charge

A client requests a resource, receives a payment challenge, fulfills
the payment, and receives the resource with a receipt.

```
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
```

**Challenge:**

```http
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
```

Decoded `request`:

```json
{
  "amount": "1000",
  "currency": "USD",
  "invoice": "inv_12345"
}
```

**Credential:**

```http
GET /resource HTTP/1.1
Host: api.example.com
Authorization: Payment eyJpZCI6InFCM3dFclR5VTdpT3BBc0Q5ZkdoSmsiLCJwYXlsb2FkIjp7InByZWltYWdlIjoiMHhhYmMxMjMuLi4ifX0
```

Decoded credential:

```json
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
```

**Success:**

```http
HTTP/1.1 200 OK
Cache-Control: private
Payment-Receipt: eyJzdGF0dXMiOiJzdWNjZXNzIiwibWV0aG9kIjoiaW52b2ljZSIsInRpbWVzdGFtcCI6IjIwMjUtMDEtMTVUMTI6MDA6MDBaIiwicmVmZXJlbmNlIjoiaW52XzEyMzQ1In0
Content-Type: application/json

{"data": "..."}
```

### B.2. Signed Authorization

A payment method using cryptographic signatures:

**Challenge:**

```http
HTTP/1.1 402 Payment Required
Cache-Control: no-store
WWW-Authenticate: Payment id="zL4xCvBnM6kJhGfD8sAaWe",
    realm="api.example.com",
    method="signed",
    intent="charge",
    expires="2025-01-15T12:05:00Z",
    request="eyJhbW91bnQiOiI1MDAwIiwiYXNzZXQiOiJVU0QiLCJyZWNpcGllbnQiOiIweDc0MmQzNUNjNjYzNEMwNTMyOTI1YTNiODQ0QmM5ZTc1OTVmOGZFMDAiLCJub25jZSI6IjB4MTIzNDU2Nzg5MCJ9"
```

Decoded `request`:

```json
{
  "amount": "5000",
  "asset": "USD",
  "recipient": "0x742d35Cc6634C0532925a3b844Bc9e7595f8fE00",
  "nonce": "0x1234567890"
}
```

**Credential:**

```json
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
```

### B.3. Multiple Payment Options

Server offers multiple payment methods:

```http
HTTP/1.1 402 Payment Required
Cache-Control: no-store
WWW-Authenticate: Payment id="pT7yHnKmQ2wErXsZ5vCbNl", realm="api.example.com", method="invoice", intent="charge", request="..."
WWW-Authenticate: Payment id="mF8uJkLpO3qRtYsA6wDcVb", realm="api.example.com", method="signed", intent="charge", request="..."
```

Client selects preferred method and responds accordingly.

### B.4. Failed Payment Verification

```http
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
```

Note the use of 401 (not 402) for failed verification, with a fresh
challenge for retry.

---

## Acknowledgements

TBD

---

## Authors' Addresses

Jake Moxey
Tempo Labs
Email: jake@tempo.xyz

---
