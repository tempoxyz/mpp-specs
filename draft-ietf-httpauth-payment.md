---
title: The "Payment" HTTP Authentication Scheme
docName: draft-ietf-httpauth-payment-01
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
HTTP resources to require a payment challenge to be fulfilled before access. The scheme
extends HTTP Authentication, using the HTTP 402 "Payment
Required" status code.

The protocol is payment-method agnostic, supporting any payment network
or currency through registered payment method identifiers. Specific
payment methods (blockchain networks, traditional payment rails) are
defined in separate payment method specifications.

## Status of This Memo

This Internet-Draft is submitted in full conformance with the provisions
of BCP 78 and BCP 79.

## Copyright Notice

Copyright (c) 2025 IETF Trust and the persons identified as the document
authors. All rights reserved.

## Table of Contents

1. [Introduction](#1-introduction)
2. [Requirements Language](#2-requirements-language)
3. [Terminology](#3-terminology)
4. [Protocol Overview](#4-protocol-overview)
5. [The Payment Authentication Scheme](#5-the-payment-authentication-scheme)
6. [Payment Methods](#6-payment-methods)
7. [Payment Intents](#7-payment-intents)
8. [Error Handling](#8-error-handling)
9. [Discovery](#9-discovery)
10. [Extensibility](#10-extensibility)
11. [Internationalization Considerations](#11-internationalization-considerations)
12. [Security Considerations](#12-security-considerations)
13. [IANA Considerations](#13-iana-considerations)
14. [References](#14-references)
15. [Appendix A: ABNF Collected](#appendix-a-abnf-collected)
16. [Appendix B: Examples](#appendix-b-examples)
17. [Appendix C: Payment Method Examples](#appendix-c-payment-method-examples)
18. [Acknowledgements](#acknowledgements)
19. [Authors' Addresses](#authors-addresses)

---

## 1. Introduction

HTTP 402 "Payment Required" was reserved in HTTP/1.1 [RFC9110] for future
use but never standardized. This specification defines the "Payment"
authentication scheme that gives 402 its semantics, enabling resources to
require a payment challenge to be fulfilled before access.

### 1.1. Relationship to Payment Method Specifications

This specification defines the abstract protocol framework. Concrete
payment methods are defined in payment method specifications that:

- Register a payment method identifier
- Define the `WWW-Authenticate` format for that method
- Define the `Authorization` format for that method
- Specify verification procedures

See Section 6.2 for registered payment method 
specifications.

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
: An `Authorization` header with scheme "Payment" containing payment authorization
  data.

**Payment Method**
: A mechanism for transferring value, identified by a registered
  identifier (e.g., "tempo", "x402", "lightning", "solana").

**Payment Intent**
: The type of payment request (e.g., "charge", "authorization").
  Defines the relationship between payer and payee.

**Request**
: Method-specific data in the challenge enabling payment completion
  (e.g., invoice, address, authorization parameters). Encoded as
  base64url JSON in the `request` parameter.

**Payload**
: Method-specific data in the credential proving payment
  (e.g., signature, preimage, transaction ID).

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
      │  (3) Client handles a payment challenge         │
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
fresh challenge. This allows clients to distinguish between "payment needed"
(402) and "payment attempt failed" (401).

Servers MAY also use 401 with `WWW-Authenticate: Payment` for resources
that accept either traditional authentication or payment, allowing clients
to choose their preferred mechanism.

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

The following parameters are defined for the Payment scheme:

#### 5.1.1. Required Parameters

**`id`**: Unique identifier for this payment challenge. Servers MUST
  generate a cryptographically random value with at least 128 bits of
  entropy for each challenge. Clients MUST include this value in the
  credential to correlate the response with the challenge. Servers
  MUST reject credentials with unknown, expired, or already-used `id`
  values.

**`realm`**: Protection space identifier per [RFC7235]. Servers MUST
  include this parameter to define the scope of the payment requirement.
  The realm value is a case-sensitive string that identifies the
  protection space. Clients MAY use the realm to determine whether
  cached payment authorizations apply. Examples:
  - `realm="api.example.com"` — entire API
  - `realm="api.example.com/v1"` — API version scope
  - `realm="Premium Content"` — access tier
  - `realm="Acme Corp Image Generation"` — branded service

**`method`**: Payment method identifier (Section 6). MUST be a lowercase
  ASCII string. Examples: "tempo", "lightning", "solana".

**`intent`**: Payment intent type (Section 7). Values: "charge",
"approval".

**`request`**: Base64url-encoded [RFC4648] JSON [RFC8259] containing
  payment-method-specific data needed to complete payment (e.g., invoice,
  address, payment authorization parameters). Structure is defined by the
  payment method specification. Padding characters ("=") MUST NOT be
  included.

#### 5.1.2. Optional Parameters

**`expires`**: Timestamp indicating when this challenge expires, formatted
  as an [RFC3339] date-time string (e.g., `"2025-01-15T12:00:00Z"`).
  Servers SHOULD include this parameter to indicate challenge validity.
  Clients MUST NOT submit credentials for expired challenges. Servers
  MUST reject credentials for challenges past their expiry time. If omitted,
  the server determines expiry policy; clients SHOULD assume challenges
  are short-lived.

**`description`**: Human-readable description of the resource or payment
  purpose. This parameter is for display purposes only and MUST NOT be
  relied upon for payment verification (see Section 12.5).

Unknown parameters MUST be ignored by clients.

#### 5.1.3. Example Challenge

```http
HTTP/1.1 402 Payment Required
WWW-Authenticate: Payment id="x7Tg2pLqR9mKvNwY3hBcZa",
    realm="api.example.com",
    method="tempo",
    intent="charge",
    expires="2025-01-15T12:05:00Z",
    request="eyJhbW91bnQiOiIxMDAwMDAwIiwiYXNzZXQiOiIweDIwYzAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAiLCJkZXN0aW5hdGlvbiI6IjB4NzQyZDM1Q2M2NjM0QzA1MzI5MjVhM2I4NDRCYzllNzU5NWY4ZkUwMCIsImV4cGlyZXMiOiIxNzM2MTUwNDAwMDAwIn0"
```

Example decoded `request` with `method="tempo", intent="charge"`:

```json
{
  "amount": "1000000",
  "asset": "0x20c0000000000000000000000000000000000000",
  "destination": "0x742d35Cc6634C0532925a3b844Bc9e7595f8fE00",
  "expires": "1736150400000"
}
```

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
| `id` | string | Yes | Challenge identifier (must match challenge `id`) |
| `source` | string | No | Payer identifier as a DID [W3C-DID] (e.g., `"did:key:z6Mk..."`) |
| `payload` | object | Yes | Payload to fulfil the payment challenge (method-specific) |

**`source`**: An OPTIONAL Decentralized Identifier [W3C-DID] identifying the
  payer. Clients MAY include this field to enable servers to associate
  payments with a persistent identity across requests. The DID method
  SHOULD be appropriate for the payment method (e.g., `did:pkh` for
  blockchain addresses, `did:key` for ephemeral keys). Servers MUST NOT
  require this field unless the payment method specification mandates it.
  See Section 12.6 for privacy considerations.

The `payload` field contains the payment-method-specific data needed to complete the payment challenge
(e.g., signature, preimage, transaction ID).

Payment method specifications define the exact structure of `payload`.

#### 5.2.1. Example Credential 

```http
GET /api/data HTTP/1.1
Host: api.example.com
Authorization: Payment eyJpZCI6Ing3VGcycExxUjltS3ZOd1kzaEJjWmEiLCJzb3VyY2UiOiJkaWQ6cGtoOmVpcDE1NTo0MjQzMToweDEyMzQ1Njc4OTBhYmNkZWYxMjM0NTY3ODkwYWJjZGVmMTIzNDU2NzgiLCJwYXlsb2FkIjp7InR5cGUiOiJ0cmFuc2FjdGlvbiIsInNpZ25hdHVyZSI6IjB4NzZmOTAxLi4uc2lnbmVkIHRyYW5zYWN0aW9uIGJ5dGVzLi4uIn19
```

Decoded credential:

```json
{
  "id": "x7Tg2pLqR9mKvNwY3hBcZa",
  "source": "did:pkh:eip155:42431:0x1234567890abcdef1234567890abcdef12345678",
  "payload": {
    "type": "transaction",
    "signature": "0x76f901...signed transaction bytes..."
  }
}
```

The `source` field is optional; clients MAY omit it for anonymous payments.

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
| `reference` | string | Method-specific reference (tx hash, etc.) |

### 5.4. Payment-Authorization Header

Servers MAY include a `Payment-Authorization` header on successful responses
to indicate that a credential may be reused for subsequent requests. The
header value can be used directly as the `Authorization` header value for
subsequent requests:

```abnf
Payment-Authorization = "Payment" 1*SP b64token *( OWS "," OWS auth-param )
auth-param            = token BWS "=" BWS ( token / quoted-string )
```

The credential portion (`Payment` followed by `b64token`) is directly usable
as an `Authorization` header value. The following parameters are appended:

| Parameter | Required | Description |
|-----------|----------|-------------|
| `expires` | Yes | RFC 3339 timestamp after which the authorization expires |
| `realm` | No | Protection space scope (defaults to challenge realm) |

**Example:**

```http
HTTP/1.1 200 OK
Content-Type: application/json
Payment-Receipt: eyJzdGF0dXMiOiJzdWNjZXNzIiwibWV0aG9kIjoidGVtcG8iLCJ0aW1lc3RhbXAiOiIyMDI1LTAxLTE1VDEyOjAwOjAwWiIsInJlZmVyZW5jZSI6IjB4YWJjMTIzLi4uIn0
Payment-Authorization: Payment eyJpZCI6Ing3VGcycExxUjltS3ZOd1kzaEJjWmEifQ, expires="2025-01-16T12:00:00Z"
```

Subsequent requests reuse the credential directly:

```http
GET /api/data HTTP/1.1
Host: api.example.com
Authorization: Payment eyJpZCI6Ing3VGcycExxUjltS3ZOd1kzaEJjWmEifQ
```

The server MAY return a different token in `Payment-Authorization` than
the original credential (e.g., a access token optimized for reuse).

#### 5.4.1. Client Behavior

Clients that receive a `Payment-Authorization` header SHOULD:

1. Extract the credential portion (`Payment <b64token>`) for reuse
2. Cache it along with the `expires` timestamp and `realm`
3. Use the cached credential as the `Authorization` header for subsequent
   requests to the same realm
4. Stop reusing the credential after the `expires` timestamp
5. Retain the `Payment-Receipt` separately for audit purposes

When a cached authorization expires, clients MUST obtain a new challenge
and submit a fresh credential.

#### 5.4.2. Server Behavior

Servers that issue `Payment-Authorization` MUST:

1. Track which authorizations are valid and not yet expired
2. Accept the issued credential for requests within the authorized realm
3. Return 401 (Unauthorized) with a fresh challenge if the authorization
   has expired or been revoked
4. NOT require re-payment for requests within the authorization window

Servers MAY issue a credential in `Payment-Authorization` that differs from
the original payment credential. This allows servers to issue access tokens,
reduce credential size, or implement other optimizations.

Servers MAY revoke authorizations before their expiry time. When an
authorization is revoked, the server MUST return 401 with a fresh
challenge.

### 5.5. Reusing Credentials

Payment credentials are generally single-use unless the server explicitly
grants reuse via the `Payment-Authorization` header.

Clients MUST NOT reuse Payment credentials across different challenges
unless the server has returned a `Payment-Authorization` header indicating
the credential may be reused.

For repeated access to the same resource, clients SHOULD:

1. Check for a cached `Payment-Authorization` that covers the realm
2. If valid, reuse the cached credential
3. Otherwise, request a new challenge and generate a fresh credential

The scope of credential validity is determined by:

- **Origin**: Credentials are bound to the origin (scheme, host, port)
  that issued the challenge
- **Realm**: Credentials are bound to the protection space (`realm`) for
  which they were issued
- **Authorization**: If `Payment-Authorization` was returned, the credential
  is valid until the authorization `expires` timestamp

---

## 6. Payment Methods

### 6.1. Method Identifier Format

Payment methods are identified by lowercase ASCII strings. Method
identifiers SHOULD follow the patterns established by W3C Payment Method
Identifiers [W3C-PMI]:

```abnf
payment-method-id = method-name [ ":" sub-method ]
method-name       = 1*ALPHA
sub-method        = 1*( ALPHA / DIGIT / "-" )
```

Method identifiers are case-sensitive and MUST be lowercase.

The optional `sub-method` component allows payment methods to specify
variants, networks, or chains. Payment method specifications MUST define
the semantics of their sub-methods.

### 6.2. Registered Methods

| Identifier | Description | Specification |
|------------|-------------|---------------|
| `tempo` | Tempo Network | [Tempo Payment Method] |
| `x402` | x402 | [x402 Payment Method] |

Additional payment methods (blockchain networks, traditional payment
processors, mobile wallets) may be registered per Section 13.3. See
Appendix C for illustrative examples of potential payment methods.

---

## 7. Payment Intents

Payment intents describe the type of payment proof being requested. This
specification defines base intents that apply across all payment methods.
Payment method specifications MAY define additional method-specific intents.

### 7.1. Intent Identifiers

Intent identifiers follow this syntax:

```abnf
intent      = 1*( ALPHA / DIGIT / "-" )
```

The base intent `charge` is defined by this specification.
Payment method specifications MAY define additional intents by registering
them in the Payment Intent Registry (Section 13.4).

### 7.2. Base Intent: "charge"

A one-time payment of the specified amount. The payer pushes payment
immediately.

### 7.3. Payment Method Intents

Payment method specifications MAY define additional intents by registering
them in the Payment Intent Registry (Section 13.4).

Examples of payment method intents:

| Intent | Applicable Methods | Description |
|--------|-------------------|-------------|
| `approve` | `tempo`, `x402` | Pre-authorize future charges |
| `subscription` | `tempo` | Recurring payment authorization |
| `hodl` | `lightning` | Hold invoice; payment held until released |

Clients that do not recognize a payment method intent SHOULD treat the
challenge as unsupported and MAY fall back to other offered challenges.

### 7.4. Intent Negotiation

If a server supports multiple intents, it MAY issue multiple challenges:

```http
WWW-Authenticate: Payment id="kM9xPqWvT2nJrHsY4aDfEb", realm="api.example.com", method="tempo", intent="charge", request="..."
WWW-Authenticate: Payment id="nR5tYuLpS8mWvXzQ1eCgHj", realm="api.example.com", method="tempo", intent="approve", request="..."
```

Clients choose which challenge to respond to.

---

## 8. Error Handling

### 8.1. Error Response Format

Servers SHOULD return JSON error bodies with 402 responses:

```jsonc
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

Servers SHOULD use the `Retry-After` HTTP header [RFC9110] to indicate when
clients may retry:

```http
HTTP/1.1 402 Payment Required
Retry-After: 60
WWW-Authenticate: Payment id="x7Tg2pLqR9mKvNwY3hBcZa", realm="api.example.com", method="tempo", ...
```

The `Retry-After` value is in seconds. Absence of this header indicates the
client may retry immediately with a corrected payment. Servers SHOULD omit
the header when retry will not succeed (e.g., fundamental policy issues).

---

## 9. Discovery

### 9.1. Well-Known Endpoint

Servers MAY expose payment capabilities at:

```
GET /.well-known/payment
```

#### 9.1.1. Request

The client issues a GET request to `/.well-known/payment`. The request
SHOULD include an `Accept` header with `application/json`:

```http
GET /.well-known/payment HTTP/1.1
Host: api.example.com
Accept: application/json
```

#### 9.1.2. Response

The server responds with a JSON object describing its payment capabilities.
The response MUST use `Content-Type: application/json`.

**Response Schema:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `version` | integer | REQUIRED | Schema version. Currently `1`. |
| `realm` | string | OPTIONAL | Default realm for payment challenges. |
| `methods` | object | REQUIRED | Map of supported payment methods. |

**Method Object Schema:**

Each key in `methods` is a registered payment method identifier. The value
is an object with:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `intents` | array | REQUIRED | Supported intent types (e.g., `["charge", "approval"]`). |
| `assets` | array | REQUIRED | Accepted asset identifiers (method-specific format). |

**Example Response:**

```http
HTTP/1.1 200 OK
Content-Type: application/json
Cache-Control: max-age=3600

{
  "version": 1,
  "realm": "api.example.com",
  "methods": {
    "tempo": {
      "intents": ["charge", "approve", "subscription"],
      "assets": ["0x20c0000000000000000000000000000000000000"]
    },
    "lightning": {
      "intents": ["charge"],
      "assets": ["BTC"],
    }
  }
}
```

### 9.2. DNS Discovery

Servers MAY advertise payment support via DNS TXT records:

```
_payment.api.example.com. TXT "v=payment1; methods=tempo,evm"
```

---

## 10. Extensibility

### 10.1. Payment Method Specifications

Payment method specifications MUST define:

1. **Method Identifier**: Unique lowercase string
2. **Request Schema**: JSON structure for the `request` parameter
3. **Payload Schema**: JSON structure for credential payloads
4. **Verification Procedure**: How servers validate proofs
5. **Settlement Procedure**: How payment is finalized
6. **Security Considerations**: Method-specific threats and mitigations

### 10.2. Custom Parameters

Implementations MAY define additional parameters in challenges:

- Parameters MUST use lowercase names
- Parameters SHOULD be documented
- Unknown parameters MUST be ignored by clients

### 10.3. Custom Headers

Implementations MAY define additional headers:

- Headers MUST follow RFC 6648 (no "X-" prefix)
- Headers MUST be documented
- Headers SHOULD remain optional

---

## 11. Internationalization Considerations

### 11.1. Character Encoding

All string values in the Payment scheme use UTF-8 encoding [RFC3629]:

- The `request` and credential payloads are JSON [RFC8259], which mandates
  UTF-8 encoding
- Payment method identifiers are restricted to ASCII lowercase letters
- The `realm` and `description` parameters may contain UTF-8 text

### 11.2. Human-Readable Text

The `description` parameter and error messages may contain localized text.
Servers SHOULD use the `Accept-Language` request header [RFC9110] to
determine the appropriate language for human-readable content.

The `realm` parameter carries data that can be considered textual; however,
[RFC7235] does not define a way to reliably transport non-US-ASCII
characters. Implementations SHOULD use ASCII-only values for `realm` to
ensure interoperability.

### 11.3. Payment Method Considerations

Payment method specifications may define additional internationalization
requirements for their specific `request` and `payload` structures.

---

## 12. Security Considerations

### 12.1. Threat Model

This specification assumes:

- Attackers can observe all network traffic
- Attackers can inject, modify, or replay messages
- Attackers may control malicious servers or clients

### 12.2. Transport Security

Implementations MUST use TLS 1.3 [RFC8446] or later when transmitting
Payment challenges and credentials. Payment credentials contain sensitive
authorization data that could result in financial loss if intercepted.

Servers MUST NOT issue Payment challenges over unencrypted HTTP. Clients
MUST NOT send Payment credentials over unencrypted HTTP.

Implementations SHOULD be aware of intermediaries (proxies, TLS termination
points) that may have access to Payment headers. Organizations deploying
payment-enabled services should ensure appropriate trust boundaries.

### 12.3. Challenge Identifier Security

The challenge `id` parameter MUST be:

- **Unpredictable**: Not guessable by clients or attackers
- **Unique**: Never reused across challenges
- **Bound**: Each `id` MUST be bound to:
  - The origin that issued it
  - The resource or realm it protects
  - The payment parameters in `request`

Servers MUST reject credentials containing:
- Invalid `id` values
- Expired `id` values
- Previously-used `id` values (for single-use intents)

### 12.4. Replay Protection

Payment methods MUST define their own replay protection mechanisms
(e.g., on-chain nonce consumption, preimage revelation, authorization
expiry). This specification does not mandate a specific approach.

Payment method specifications SHOULD define expiry semantics in the `request`
payload. Servers SHOULD reject credentials for expired challenges.

### 12.5. Amount Verification

Clients MUST verify before authorizing payment:

1. Requested amount is reasonable for the resource
2. Recipient/address is expected
3. Currency/asset is as expected
4. Validity window is appropriate

Blind authorization of payments is dangerous.

Clients MUST NOT rely on the `description` parameter for payment
verification. The `description` is human-readable metadata that is not
cryptographically bound to the payment data in `request`. Malicious servers
could provide a misleading description (e.g., "Pay 1 USD") while the
actual `request` payload requests a different amount. Clients MUST decode
and verify the `request` parameter directly.

### 12.6. Privacy

- Servers MUST NOT require user accounts for payment
- Payment methods SHOULD support pseudonymous payments where possible
- Servers SHOULD NOT log Payment credentials or receipts in plaintext
- Servers SHOULD NOT include Payment headers in analytics or telemetry
- Payment privacy depends on the underlying payment method

### 12.7. Credential Storage and Logging

Implementations MUST treat `Authorization: Payment` headers and
`Payment-Receipt` headers as sensitive data:

- Servers MUST NOT log these headers in plaintext access logs
- Clients SHOULD protect stored wallet keys used to generate credentials
- Implementations SHOULD exclude Payment headers from debug output

### 12.8. Caching

Servers SHOULD send appropriate cache-control headers with 402 responses:

```http
HTTP/1.1 402 Payment Required
Cache-Control: no-store
WWW-Authenticate: Payment ...
```

The `no-store` directive prevents caching of payment challenges, which
may contain time-sensitive or single-use payment parameters.

Similarly, responses with `Payment-Receipt` or `Payment-Authorization`
headers SHOULD include `Cache-Control: private` to prevent intermediary
caching of payment confirmation and authorization data.

### 12.9. Cross-Origin Considerations

Payment challenges may be triggered by cross-origin requests. Clients
(particularly browser-based wallets) SHOULD:

- Clearly display the origin requesting payment
- Require explicit user confirmation before authorizing payments
- Not automatically respond to Payment challenges without user interaction

Servers SHOULD use appropriate CORS headers to control which origins
may trigger payment flows.

### 12.10. Denial of Service

Servers SHOULD implement rate limiting on:

- 402 challenges issued
- Credential verification attempts
- Settlement requests

### 12.11. Settlement Finality

The `Payment-Receipt` header indicates the server's assertion that payment
was received, but is not a cryptographic proof of settlement. The actual
settlement finality depends on the underlying payment Authentication method:

- Some methods provide instant finality (e.g., Lightning preimage reveal)
- Others may have delayed finality (e.g., blockchain confirmations)
- Some may be reversible (e.g., traditional payment chargebacks)

Clients and servers should understand the finality guarantees of their
chosen payment method as documented in the payment method specification.

### 12.12. Authorization Reuse

When servers issue `Payment-Authorization` headers to allow credential
reuse, additional security considerations apply:

**Credential Theft**: Reusable credentials are higher-value targets. If an
attacker captures a credential with valid authorization, they can reuse it
until expiry. Mitigations:

- Servers SHOULD use short authorization windows (minutes to hours, not days)
- Clients MUST store cached credentials securely
- TLS is REQUIRED to prevent credential interception

**Revocation**: Servers MUST be able to revoke authorizations before expiry.
Common revocation triggers include:

- Anomalous usage patterns (rate, geography, resource access)
- User-initiated session termination
- Security incidents

When revoking, servers return 401 with a fresh challenge. Clients MUST NOT
assume authorization validity solely based on the `expires` timestamp.

**Authorization Scope**: The `realm` in `Payment-Authorization` defines the
scope of reuse. Servers MUST NOT issue authorizations that grant access
beyond what the original payment covered. Clients SHOULD verify the realm
matches expectations before reusing credentials.

**Replay Window**: Unlike single-use credentials, reusable credentials have
a replay window equal to the authorization lifetime. Servers MUST use
server-side state to track authorization validity rather than relying solely
on timestamp checks.

---

## 13. IANA Considerations

### 13.1. Authentication Scheme Registration

This document registers the "Payment" authentication scheme in the
"Hypertext Transfer Protocol (HTTP) Authentication Scheme Registry"
established by [RFC7235]:

- **Authentication Scheme Name**: Payment
- **Reference**: This document, Section 5
- **Notes**: Used with HTTP 402 status code for proof-of-payment flows

### 13.2. Header Field Registration

This document registers the following header fields in the "Hypertext
Transfer Protocol (HTTP) Field Name Registry":

| Field Name | Status | Reference |
|------------|--------|-----------|
| Payment-Receipt | permanent | This document, Section 5.3 |
| Payment-Authorization | permanent | This document, Section 5.4 |

### 13.3. Payment Method Registry

This document establishes the "HTTP Payment Methods" registry. This
registry uses the "Specification Required" policy defined in [RFC8126].

Registration requests must include:

- **Method Identifier**: Unique lowercase ASCII string
- **Description**: Brief description of the payment method
- **Reference**: Reference to the specification document
- **Contact**: Contact information for the registrant

Initial registry contents:

| Identifier | Description | Reference | Contact |
|------------|-------------|-----------|---------|
| `tempo` | Tempo Network | [Tempo Payment Method] | TBD |
| `x402` | x402 | [x402 Payment Method] | TBD |

### 13.4. Payment Intent Registry

This document establishes the "HTTP Payment Intents" registry. This
registry uses the "Specification Required" policy defined in [RFC8126].

Registration requests for extension intents must include:

- **Intent Identifier**: Unique lowercase ASCII string
- **Applicable Methods**: Payment methods that support this intent
- **Description**: Brief description of the intent semantics
- **Reference**: Reference to the specification document
- **Contact**: Contact information for the registrant

Initial registry contents:

| Intent | Applicable Methods | Description | Reference |
|--------|-------------------|-------------|-----------|
| `charge` | (all) | One-time payment charge | This document, Section 7.2 |

### 13.5. Well-Known URI Registration

This document registers the following well-known URI in the "Well-Known
URIs" registry established by [RFC8615]:

- **URI Suffix**: payment
- **Change Controller**: IETF
- **Reference**: This document, Section 9.1
- **Status**: permanent
- **Related Information**: None

---

## 14. References

### 14.1. Normative References

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

- **[RFC8615]** Nottingham, M., "Well-Known Uniform Resource Identifiers
  (URIs)", RFC 8615, May 2019.

- **[RFC9110]** Fielding, R., Ed., Nottingham, M., Ed., and J. Reschke,
  Ed., "HTTP Semantics", STD 97, RFC 9110, June 2022.

### 14.2. Informative References

- **[RFC6648]** Saint-Andre, P., et al., "Deprecating the 'X-' Prefix
  and Similar Constructs in Application Protocols", BCP 178, RFC 6648,
  June 2012.

- **[Tempo Payment Method]** "Payment Authentication Method: Tempo", Work in Progress.

- **[x402 Payment Method]** "X402 Protocol Specification", <https://github.com/coinbase/x402/blob/main/specs/x402-specification-v2.md>.

- **[W3C-DID]** W3C, "Decentralized Identifiers (DIDs) v1.0",
  <https://www.w3.org/TR/did-core/>.

- **[W3C-PMI]** W3C, "Payment Method Identifiers",
  <https://www.w3.org/TR/payment-method-id/>.

---

## Appendix A: ABNF Collected

This appendix collects all ABNF defined in this document per [RFC5234].
Core rules (ALPHA, DIGIT, SP, HTAB, DQUOTE, OWS, BWS, token, quoted-string,
b64token) are imported from [RFC9110], [RFC7235], and [RFC6750].

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

; Payment-Authorization header field value
Payment-Authorization = "Payment" 1*SP b64token *( OWS "," OWS auth-param )

; Payment method identifier
payment-method-id   = method-name [ ":" sub-method ]
method-name         = 1*ALPHA
sub-method          = 1*( ALPHA / DIGIT / "-" )
```

---

## Appendix B: Examples

### B.1. Tempo Charge

One-time payment using a signed Tempo transaction:

```
Client                                 Server                           Tempo Network
   │                                      │                                  │
   │  (1) GET /resource                   │                                  │
   ├─────────────────────────────────────>│                                  │
   │                                      │                                  │
   │  (2) 402 Payment Required            │                                  │
   │      method="tempo"                  │                                  │
   │      intent="charge"                 │                                  │
   │      request={transaction details}   │                                  │
   │<─────────────────────────────────────┤                                  │
   │                                      │                                  │
   │  (3) Sign transaction                │                                  │
   │                                      │                                  │
   │                                      │                                  │
   │  (4) GET /resource                   │                                  │
   │      Authorization: Payment          │                                  │
   │      payload={signature}             │                                  │
   ├─────────────────────────────────────>│                                  │
   │                                      │                                  │
   │                                      │  (5) Submit signed transaction   │
   │                                      ├─────────────────────────────────>│
   │                                      │                                  │
   │                                      │  (6) Transaction confirmed       │
   │                                      │                                  │
   │                                      │<─────────────────────────────────┤
   │                                      │                                  │
   │  (7) 200 OK + Payment-Receipt        │                                  │
   │<─────────────────────────────────────┤                                  │
   │                                      │                                  │
```

**Challenge:**

```http
HTTP/1.1 402 Payment Required
Cache-Control: no-store
WWW-Authenticate: Payment id="qB3wErTyU7iOpAsD9fGhJk",
    realm="api.example.com/v1",
    method="tempo",
    intent="charge",
    expires="2025-01-15T12:05:00Z",
    request="eyJ0cmFuc2FjdGlvbiI6eyJ0byI6IjB4MjBjMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMCIsImRhdGEiOiIweGE5MDU5Y2JiLi4uIiwidmFsaWRCZWZvcmUiOjE3MDQxMTA0MDAwMDB9fQ"
Content-Type: application/json

{"error": "payment_required", "message": "Payment required for API access"}
```

Decoded `request`:

```jsonc
{
  "transaction": {
    "to": "0x20c0000000000000000000000000000000000000",
    "data": "0xa9059cbb...",
    "validBefore": "0x59682000"
  }
}
```

The `transaction` object contains the Tempo transaction fields for the
client to sign. The `data` field is encoded TIP-20 `transfer(to, amount)`.

**Request with Payment:**

```http
GET /api/data HTTP/1.1
Host: api.example.com
Authorization: Payment eyJtZXRob2QiOiJ0ZW1wbyIsImlkIjoiY2hfdGVtcG9fMDAxIiwicGF5bG9hZCI6eyJ0eGlkIjoiMHhhYmMxMjMuLi4iLCJzaWduYXR1cmUiOiIweC4uLiJ9fQ
```

Decoded credential:

```jsonc
{
  "method": "tempo",
  "id": "qB3wErTyU7iOpAsD9fGhJk",
  "payload": {
    "txid": "0xabc123...",
    "signature": "0x..."
  }
}
```

**Success (with reusable authorization):**

```http
HTTP/1.1 200 OK
Cache-Control: private
Payment-Receipt: eyJzdGF0dXMiOiJzdWNjZXNzIiwibWV0aG9kIjoidGVtcG8iLCJyZWZlcmVuY2UiOiIweGFiYzEyMy4uLiJ9
Payment-Authorization: Payment eyJpZCI6InFCM3dFclR5VTdpT3BBc0Q5ZkdoSmsiLCJ0eXBlIjoic2Vzc2lvbiJ9, expires="2025-01-15T13:00:00Z"
Content-Type: application/json

{"data": "..."}
```

The client extracts the credential portion and reuses it for subsequent
requests:

```http
GET /api/other-resource HTTP/1.1
Host: api.example.com
Authorization: Payment eyJpZCI6InFCM3dFclR5VTdpT3BBc0Q5ZkdoSmsiLCJ0eXBlIjoic2Vzc2lvbiJ9
```

### B.2. Tempo Authorization

Authorize the server to charge future payments within limits using Tempo
access keys:

```
Client                                 Server                           Tempo Network
   │                                      │                                  │
   │  (1) GET /resource                   │                                  │
   ├─────────────────────────────────────>│                                  │
   │                                      │                                  │
   │  (2) 402 Payment Required            │                                  │
   │      method="tempo"                  │                                  │
   │      intent="approval"               │                                  │
   │      request={keyId, limits, expiry} │                                  │
   │<─────────────────────────────────────┤                                  │
   │                                      │                                  │
   │  (3) Sign access key authorization   │                                  │
   │                                      │                                  │
   │                                      │                                  │
   │  (4) GET /resource                   │                                  │
   │      Authorization: Payment          │                                  │
   │      payload={signed authorization}  │                                  │
   ├─────────────────────────────────────>│                                  │
   │                                      │                                  │
   │                                      │  (5) Register access key         │
   │                                      ├─────────────────────────────────>│
   │                                      │                                  │
   │                                      │  (6) Key registered              │
   │                                      │<─────────────────────────────────┤
   │                                      │                                  │
   │  (7) 200 OK + Payment-Receipt        │                                  │
   │      (key provisioned)               │                                  │
   │<─────────────────────────────────────┤                                  │
   │                                      │                                  │
   │                                      │                                  │
   │  --- Future requests ---             │                                  │
   │                                      │                                  │
   │  (8) GET /resource                   │                                  │
   ├─────────────────────────────────────>│                                  │
   │                                      │                                  │
   │                                      │  (9) Charge via access key       │
   │                                      │                                  │
   │                                      ├─────────────────────────────────>│
   │                                      │                                  │
   │  (10) 200 OK                         │                                  │
   │<─────────────────────────────────────┤                                  │
   │                                      │                                  │
```

**Challenge:**

```http
HTTP/1.1 402 Payment Required
Cache-Control: no-store
WWW-Authenticate: Payment id="zL4xCvBnM6kJhGfD8sAaWe",
    realm="api.example.com/v1",
    method="tempo",
    intent="approval",
    expires="2025-01-15T12:05:00Z",
    description="Authorize API usage",
    request="eyJhdXRob3JpemF0aW9uIjp7ImtleUlkIjoiMHhzZXJ2ZXJrZXkuLi4iLCJleHBpcnkiOjE3MDY3NDU2MDAwMDAsImxpbWl0cyI6W3sidG9rZW4iOiIweDIwYzAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAiLCJhbW91bnQiOiIxMDAwMDAwMDAiLCJwZXJpb2QiOjg2NDAwfV19fQ"
```

Decoded `request`:

```jsonc
{
  "authorization": {
    "chainId": "0xa5bd",
    "keyId": "0x0ab24fa...",
    "keyType": "0x01",
    "expiry": "0x65b8d980",
    "limits": [
      {
        "token": "0x20c0000000000000000000000000000000000000",
        "amount": "0x5f5e100" // 100 USD
      }
    ]
  }
}
```

The `authorization` object contains the access key authorization for the
client to sign.

**Request with Authorization:**

```http
GET /api/v1/data HTTP/1.1
Host: api.example.com
Authorization: Payment eyJtZXRob2QiOiJ0ZW1wbyIsImlkIjoiY2hfdGVtcG9fMDAyIiwicGF5bG9hZCI6IjB4Li4uIn0
```

Decoded credential:

```jsonc
{
  "method": "tempo",
  "id": "zL4xCvBnM6kJhGfD8sAaWe",
  "payload": "0x..." // RLP-encoded Tempo key authorization
}
```

**Success:**

```http
HTTP/1.1 200 OK
Cache-Control: private
Payment-Receipt: eyJzdGF0dXMiOiJzdWNjZXNzIiwibWV0aG9kIjoidGVtcG8iLCJyZWZlcmVuY2UiOiIweHR4aGFzaC4uLiIsImtleUlkIjoiMHhzZXJ2ZXJrZXkuLi4iLCJleHBpcnkiOjE3MDY3NDU2MDAwMDB9
Content-Type: application/json

{"message": "Access key provisioned", "keyId": "0xserverkey..."}
```

### B.3. Multiple Payment Options

Servers MAY offer multiple payment methods or intents. Each option gets
its own `WWW-Authenticate` header:

```http
HTTP/1.1 402 Payment Required
Cache-Control: no-store
WWW-Authenticate: Payment id="pT7yHnKmQ2wErXsZ5vCbNl", realm="api.example.com", method="tempo", intent="charge", request="eyJ0cmFuc2FjdGlvbiI6ey4uLn19"
WWW-Authenticate: Payment id="mF8uJkLpO3qRtYsA6wDcVb", realm="api.example.com", method="tempo", intent="approval", request="eyJhdXRob3JpemF0aW9uIjp7Li4ufX0"
WWW-Authenticate: Payment id="hG9iKlMnO4pQrStU7vWxYz", realm="api.example.com", method="lightning", intent="charge", request="eyJpbnZvaWNlIjoibG5iYy4uLiJ9"
```

Client selects preferred method/intent and responds accordingly.

### B.4. Failed Payment Verification

When a client submits an invalid payment credential:

```http
HTTP/1.1 401 Unauthorized
Cache-Control: no-store
WWW-Authenticate: Payment id="aB1cDeF2gHiJ3kLmN4oPqR", realm="api.example.com", method="tempo", intent="charge", request="..."
Content-Type: application/json

{"error": "payment_verification_failed", "message": "Signature verification failed"}
```

Note the use of 401 (not 402) to indicate the payment attempt failed,
with a fresh challenge for retry.

---

## Appendix C: Payment Method Examples

This appendix provides illustrative examples of how various payment
methods could be implemented. These are non-normative and intended to
guide future payment method specifications.

### C.1. Ethereum (EVM Chains)

EVM-compatible chains using EIP-3009 `transferWithAuthorization`:

```
Client                                 Server                          Blockchain
   │                                      │                                  │
   │  (1) GET /resource                   │                                  │
   ├─────────────────────────────────────>│                                  │
   │                                      │                                  │
   │  (2) 402 Payment Required            │                                  │
   │      method="ethereum:8453"          │                                  │
   │<─────────────────────────────────────┤                                  │
   │                                      │                                  │
   │  (3) Sign EIP-712 typed data         │                                  │
   │      (transferWithAuthorization)     │                                  │
   │                                      │                                  │
   │  (4) GET /resource                   │                                  │
   │      Authorization: Payment ...      │                                  │
   ├─────────────────────────────────────>│                                  │
   │                                      │                                  │
   │                                      │  (5) Submit signed transfer      │
   │                                      ├─────────────────────────────────>│
   │                                      │                                  │
   │                                      │  (6) Transaction confirmed       │
   │                                      │<─────────────────────────────────┤
   │                                      │                                  │
   │  (7) 200 OK + Payment-Receipt        │                                  │
   │<─────────────────────────────────────┤                                  │
   │                                      │                                  │
```

**Challenge:**

```http
WWW-Authenticate: Payment id="sT5uVwXy6zAbCdEf7gHiJk",
    realm="api.example.com",
    method="ethereum:8453",
    intent="charge",
    request="eyJ0cmFuc2ZlciI6eyJmcm9tIjoiMHgwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwIiwidG8iOiIweGFiYzEyMy4uLiIsInZhbHVlIjoiMTAwMDAwMCIsInZhbGlkQWZ0ZXIiOjAsInZhbGlkQmVmb3JlIjoxNzA0MTEwNDAwLCJub25jZSI6IjB4MTIzLi4uIn19"
```

Decoded `request`:

```json
{
  "transfer": {
    "token": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    "to": "0xabc123...",
    "value": "1000000",
    "validAfter": 0,
    "validBefore": 1704110400,
    "nonce": "0x123..."
  }
}
```

Decoded credential `payload`:

```json
{
  "signature": "0x...",
  "from": "0x..."
}
```

### C.2. Lightning Network

Bitcoin Lightning using BOLT11 invoices:

```
Client                                 Server                     Lightning Network
   │                                      │                                  │
   │  (1) GET /resource                   │                                  │
   ├─────────────────────────────────────>│                                  │
   │                                      │                                  │
   │  (2) 402 Payment Required            │                                  │
   │      method="lightning"              │                                  │
   │      request={invoice, payment_hash}    │                                  │
   │<─────────────────────────────────────┤                                  │
   │                                      │                                  │
   │  (3) Pay BOLT11 invoice              │                                  │
   ├──────────────────────────────────────┼─────────────────────────────────>│
   │                                      │                                  │
   │  (4) Receive preimage                │                                  │
   │<─────────────────────────────────────┼──────────────────────────────────┤
   │                                      │                                  │
   │  (5) GET /resource                   │                                  │
   │      Authorization: Payment          │                                  │
   │      payload={preimage}              │                                  │
   ├─────────────────────────────────────>│                                  │
   │                                      │                                  │
   │                                      │  (6) Verify preimage matches     │
   │                                      │      payment_hash                │
   │                                      │                                  │
   │  (7) 200 OK + Payment-Receipt        │                                  │
   │<─────────────────────────────────────┤                                  │
   │                                      │                                  │
```

**Challenge:**

```http
WWW-Authenticate: Payment id="lM8nOpQr9sTuVwXy0zAbCd",
    realm="api.example.com",
    method="lightning",
    intent="charge",
    request="eyJpbnZvaWNlIjoibG5iYzE1MDB1MXB3NWtqaHBwNXh3eXE5cXFxcXFxcXFxcXFxcXFxcXFxcXEuLi4iLCJhbW91bnRNc2F0IjoiMTUwMDAwMCIsImRlc2NyaXB0aW9uIjoiQVBJIGFjY2VzcyJ9"
```

Decoded `request`:

```json
{
  "invoice": "lnbc1500u1pw5kjhpp5xwyq9qqqqqqqqqqqqqqqqqqqq...",
  "amountMsat": "1500000",
  "description": "API access",
  "expiry": 3600
}
```

Decoded credential `payload`:

```json
{
  "preimage": "0123456789abcdef..."
}
```

The preimage proves payment of the invoice.

### C.3. Apple Pay

Tokenized card payment via Apple Pay:

```
Client                        Apple Pay                Server              Processor
   │                              │                       │                     │
   │  (1) GET /resource           │                       │                     │
   ├──────────────────────────────┼──────────────────────>│                     │
   │                              │                       │                     │
   │  (2) 402 Payment Required    │                       │                     │
   │      method="applepay"       │                       │                     │
   │<─────────────────────────────┼───────────────────────┤                     │
   │                              │                       │                     │
   │  (3) Show payment sheet      │                       │                     │
   ├─────────────────────────────>│                       │                     │
   │                              │                       │                     │
   │  (4) User authenticates      │                       │                     │
   │      (Face ID / Touch ID)    │                       │                     │
   │                              │                       │                     │
   │  (5) PKPaymentToken          │                       │                     │
   │<─────────────────────────────┤                       │                     │
   │                              │                       │                     │
   │  (6) GET /resource           │                       │                     │
   │      Authorization: Payment  │                       │                     │
   │      payload={token}         │                       │                     │
   ├──────────────────────────────┼──────────────────────>│                     │
   │                              │                       │                     │
   │                              │                       │  (7) Decrypt token  │
   │                              │                       ├────────────────────>│
   │                              │                       │                     │
   │                              │                       │  (8) Charge result  │
   │                              │                       │<────────────────────┤
   │                              │                       │                     │
   │  (9) 200 OK + Payment-Receipt│                       │                     │
   │<─────────────────────────────┼───────────────────────┤                     │
   │                              │                       │                     │
```

**Challenge:**

```http
WWW-Authenticate: Payment id="eF3gHiJk4lMnOpQr5sTuVw",
    realm="api.example.com",
    method="applepay",
    intent="charge",
    request="eyJtZXJjaGFudElkIjoibWVyY2hhbnQuY29tLmV4YW1wbGUuYXBpIiwiYW1vdW50IjoiMTAuMDAiLCJjdXJyZW5jeSI6IlVTRCIsImNvdW50cnlDb2RlIjoiVVMiLCJzdXBwb3J0ZWROZXR3b3JrcyI6WyJ2aXNhIiwibWFzdGVyQ2FyZCJdfQ"
```

Decoded `request`:

```json
{
  "merchantId": "merchant.com.example.api",
  "amount": "10.00",
  "currency": "USD",
  "countryCode": "US",
  "supportedNetworks": ["visa", "masterCard"],
  "merchantCapabilities": ["supports3DS"]
}
```

Decoded credential `payload`:

```json
{
  "token": {
    "paymentData": "<encrypted card data>",
    "paymentMethod": {
      "network": "Visa",
      "type": "debit",
      "displayName": "Visa 1234"
    },
    "transactionIdentifier": "ABC123..."
  }
}
```

Server decrypts token via payment processor (Stripe, Adyen, etc.).

### C.4. Stripe Charge

```
Client                                 Server                           Stripe API
   │                                      │                                  │
   │  (1) GET /resource                   │                                  │
   ├─────────────────────────────────────>│                                  │
   │                                      │                                  │
   │                                      │  (2) Create PaymentIntent        │
   │                                      ├─────────────────────────────────>│
   │                                      │                                  │
   │                                      │  (3) client_secret               │
   │                                      │<─────────────────────────────────┤
   │                                      │                                  │
   │  (4) 402 Payment Required            │                                  │
   │      method="stripe"                 │                                  │
   │      request={client_secret, amount}    │                                  │
   │<─────────────────────────────────────┤                                  │
   │                                      │                                  │
   │  (5) Confirm payment (Stripe.js)     │                                  │
   ├──────────────────────────────────────┼─────────────────────────────────>│
   │                                      │                                  │
   │  (6) Payment confirmed               │                                  │
   │<─────────────────────────────────────┼──────────────────────────────────┤
   │                                      │                                  │
   │  (7) GET /resource                   │                                  │
   │      Authorization: Payment          │                                  │
   │      payload={paymentIntentId}       │                                  │
   ├─────────────────────────────────────>│                                  │
   │                                      │                                  │
   │                                      │  (8) Verify PaymentIntent status │
   │                                      ├─────────────────────────────────>│
   │                                      │                                  │
   │                                      │  (9) status: succeeded           │
   │                                      │<─────────────────────────────────┤
   │                                      │                                  │
   │  (10) 200 OK + Payment-Receipt       │                                  │
   │<─────────────────────────────────────┤                                  │
   │                                      │                                  │
```

**Challenge:**

```http
WWW-Authenticate: Payment id="xY6zAbCd7eFgHiJk8lMnOp",
    realm="api.example.com",
    method="stripe",
    intent="charge",
    request="eyJwYXltZW50SW50ZW50IjoicGlfM01xMllaQTJlWnZLWWxvMk8iLCJjbGllbnRTZWNyZXQiOiJwaV8zTXEyWVpBMmVadktZbG8yT19zZWNyZXRfLi4uIiwiYW1vdW50IjoxMDAwLCJjdXJyZW5jeSI6InVzZCJ9"
```

Decoded `request`:

```json
{
  "paymentIntent": "pi_3Mq2YZA2eZvKYlo2O",
  "clientSecret": "pi_3Mq2YZA2eZvKYlo2O_secret_...",
  "amount": 1000,
  "currency": "usd"
}
```

Decoded credential `payload`:

```json
{
  "paymentIntentId": "pi_3Mq2YZA2eZvKYlo2O",
  "paymentMethodId": "pm_..."
}
```

Server confirms payment via Stripe API.

### C.5. Stripe Authorization

Stripe SetupIntent for recurring/metered billing:

```
Client                                 Server                           Stripe API
   │                                      │                                  │
   │  (1) GET /resource                   │                                  │
   ├─────────────────────────────────────>│                                  │
   │                                      │                                  │
   │                                      │  (2) Create SetupIntent          │
   │                                      ├─────────────────────────────────>│
   │                                      │                                  │
   │                                      │  (3) client_secret               │
   │                                      │<─────────────────────────────────┤
   │                                      │                                  │
   │  (4) 402 Payment Required            │                                  │
   │      method="stripe"                 │                                  │
   │      intent="approval"               │                                  │
   │<─────────────────────────────────────┤                                  │
   │                                      │                                  │
   │  (5) Confirm setup (Stripe.js)       │                                  │
   │      User enters card details        │                                  │
   ├──────────────────────────────────────┼─────────────────────────────────>│
   │                                      │                                  │
   │  (6) SetupIntent confirmed           │                                  │
   │<─────────────────────────────────────┼──────────────────────────────────┤
   │                                      │                                  │
   │  (7) GET /resource                   │                                  │
   │      Authorization: Payment          │                                  │
   │      payload={setupIntentId}         │                                  │
   ├─────────────────────────────────────>│                                  │
   │                                      │                                  │
   │                                      │  (8) Attach PaymentMethod to     │
   │                                      │      Customer for future use     │
   │                                      ├─────────────────────────────────>│
   │                                      │                                  │
   │  (9) 200 OK + Payment-Receipt        │                                  │
   │<─────────────────────────────────────┤                                  │
   │                                      │                                  │
   │                                      │                                  │
   │  --- Future requests ---             │                                  │
   │                                      │                                  │
   │  (10) GET /resource                  │                                  │
   ├─────────────────────────────────────>│                                  │
   │                                      │                                  │
   │                                      │  (11) Charge saved PaymentMethod │
   │                                      ├─────────────────────────────────>│
   │                                      │                                  │
   │  (12) 200 OK                         │                                  │
   │<─────────────────────────────────────┤                                  │
   │                                      │                                  │
```

**Challenge:**

```http
HTTP/1.1 402 Payment Required
Cache-Control: no-store
WWW-Authenticate: Payment id="qR9sTuVw0xYzAbCd1eFgHi",
    realm="api.example.com",
    method="stripe",
    intent="approval",
    description="Authorize monthly API usage",
    request="eyJzZXR1cEludGVudCI6InNldGlfMUFCQzEyMyIsImNsaWVudFNlY3JldCI6InNldGlfMUFCQzEyM19zZWNyZXRfLi4uIiwidXNhZ2UiOiJvZmZfc2Vzc2lvbiIsImxpbWl0cyI6eyJhbW91bnQiOjEwMDAwLCJjdXJyZW5jeSI6InVzZCIsInBlcmlvZCI6Im1vbnRoIn19"
```

Decoded `request`:

```json
{
  "setupIntent": "seti_1ABC123",
  "clientSecret": "seti_1ABC123_secret_...",
  "usage": "off_session",
  "limits": {
    "amount": 10000,
    "currency": "usd",
    "period": "month"
  }
}
```

Decoded credential `payload`:

```json
{
  "setupIntentId": "seti_1ABC123",
  "paymentMethodId": "pm_..."
}
```

After authorization, the server can charge the saved PaymentMethod for
future requests without additional user interaction, up to the specified
limits.

### C.6. x402

The x402 protocol can be wrapped as a payment
method for backwards compatibility with existing x402 implementations.
This example follows x402 Protocol Specification v2.

```
Client                                 Server                          Facilitator
   │                                      │                                  │
   │  (1) GET /resource                   │                                  │
   ├─────────────────────────────────────>│                                  │
   │                                      │                                  │
   │  (2) 402 Payment Required            │                                  │
   │      method="x402"                   │                                  │
   │      request={x402 PaymentRequired}  │                                  │
   │<─────────────────────────────────────┤                                  │
   │                                      │                                  │
   │  (3) Create x402 PaymentPayload      │                                  │
   │      (EIP-3009 signature, etc.)      │                                  │
   │                                      │                                  │
   │  (4) GET /resource                   │                                  │
   │      Authorization: Payment          │                                  │
   │      payload={x402 PaymentPayload}   │                                  │
   ├─────────────────────────────────────>│                                  │
   │                                      │                                  │
   │                                      │  (5) POST /verify                │
   │                                      ├─────────────────────────────────>│
   │                                      │                                  │
   │                                      │  (6) VerifyResponse {isValid}    │
   │                                      │<─────────────────────────────────┤
   │                                      │                                  │
   │                                      │  (7) POST /settle                │
   │                                      ├─────────────────────────────────>│
   │                                      │                                  │
   │                                      │  (8) SettlementResponse          │
   │                                      │<─────────────────────────────────┤
   │                                      │                                  │
   │  (9) 200 OK + Payment-Receipt        │                                  │
   │<─────────────────────────────────────┤                                  │
   │                                      │                                  │
```

**Challenge:**

```http
HTTP/1.1 402 Payment Required
Cache-Control: no-store
WWW-Authenticate: Payment id="jK2lMnOp3qRsTuVw4xYzAb",
    realm="api.example.com",
    method="x402",
    intent="charge",
    request="eyJ4NDAyVmVyc2lvbiI6MiwicmVzb3VyY2UiOnsidXJsIjoiL2FwaS9kYXRhIiwiZGVzY3JpcHRpb24iOiJBUEkgYWNjZXNzIn0sImFjY2VwdHMiOlt7InNjaGVtZSI6ImV4YWN0IiwibmV0d29yayI6ImVpcDE1NTo4NDUzIiwiYW1vdW50IjoiMTAwMDAwMCIsImFzc2V0IjoiMHg4MzM1ODlmQ0Q2ZURiNkUwOGY0YzdDMzJENGY3MWI1NGJkQTAyOTEzIiwicGF5VG8iOiIweGFiYzEyMy4uLiIsIm1heFRpbWVvdXRTZWNvbmRzIjo2MH1dfQ"
```

Decoded `request` (x402 v2 PaymentRequired structure):

```json
{
  "x402Version": 2,
  "resource": {
    "url": "/api/data",
    "description": "API access"
  },
  "accepts": [
    {
      "scheme": "exact",
      "network": "eip155:8453",
      "amount": "1000000",
      "asset": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
      "payTo": "0xabc123...",
      "maxTimeoutSeconds": 60
    }
  ]
}
```

Decoded credential `payload` (x402 v2 PaymentPayload structure):

```json
{
  "x402Version": 2,
  "resource": {
    "url": "/api/data",
    "description": "API access"
  },
  "accepted": {
    "scheme": "exact",
    "network": "eip155:8453",
    "amount": "1000000",
    "asset": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    "payTo": "0xabc123...",
    "maxTimeoutSeconds": 60
  },
  "payload": {
    "signature": "0x...",
    "authorization": {
      "from": "0x...",
      "to": "0xabc123...",
      "value": "1000000",
      "validAfter": "0",
      "validBefore": "1704110400",
      "nonce": "0x..."
    }
  }
}
```

The `payload.authorization` follows EIP-3009 `transferWithAuthorization`
format for the "exact" scheme on EVM networks.

This approach allows:
- Servers to accept both native Payment scheme clients and x402 clients
- Gradual migration from x402 to the Payment authentication scheme
- Reuse of existing x402 facilitator infrastructure for verification and
  settlement

---

## Acknowledgements

TBD

---

## Authors' Addresses

Jake Moxey
Tempo Labs
Email: jake@tempo.xyz

---

**License:** This specification is released into the public domain (CC0 1.0 Universal).
