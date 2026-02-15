---
title: The "Payment" HTTP Authentication Scheme
abbrev: Payment Auth Scheme
docname: draft-ryan-httpauth-payment-00
version: 00
category: exp
ipr: trust200902
submissiontype: independent

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
  RFC4648:
  RFC5234:
  RFC8126:
  RFC8174:
  RFC8259:
  RFC8446:
  RFC9110:
  RFC9111:

informative:
  RFC9457:
  RFC9530:
---

--- abstract

This document defines the "Payment" HTTP authentication scheme,
enabling HTTP resources to require a payment challenge to be
fulfilled before access. The scheme extends HTTP Authentication,
using the HTTP 402 "Payment Required" status code.

The protocol is payment-method agnostic, supporting any payment
network or currency through registered payment method identifiers.
Specific payment methods are defined in separate specifications.

--- middle

# Introduction

HTTP 402 "Payment Required" was reserved in HTTP/1.1 {{RFC9110}}
for future use but never standardized. This specification defines
the "Payment" authentication scheme that gives 402 its semantics,
enabling resources to require a payment challenge to be fulfilled
before access.

The protocol separates the HTTP mechanics (this document) from
concrete payment methods (defined in companion specifications).
A payment method specification registers an identifier, defines
request and payload schemas, and specifies verification procedures.

# Requirements Language

{::boilerplate bcp14-tagged}

# Terminology

Payment Challenge
: A `WWW-Authenticate` header with scheme "Payment" indicating the
  payment requirements for accessing a resource.

Payment Credential
: An `Authorization` header with scheme "Payment" containing
  payment authorization data.

Payment Method
: A mechanism for transferring value, identified by a registered
  identifier in the "HTTP Payment Methods" registry.

Payment Intent
: The type of payment request, identified by a registered value
  in the "HTTP Payment Intents" registry.

# Protocol Overview

~~~
   Client                                       Server
      │                                            │
      │  (1) GET /resource                         │
      ├───────────────────────────────────────────>│
      │                                            │
      │  (2) 402 Payment Required                  │
      │      WWW-Authenticate: Payment id="..",    │
      │        method="..", intent="..",            │
      │        request=".."                        │
      │<───────────────────────────────────────────┤
      │                                            │
      │  (3) Client fulfills payment challenge     │
      │                                            │
      │  (4) GET /resource                         │
      │      Authorization: Payment <credential>   │
      ├───────────────────────────────────────────>│
      │                                            │
      │  (5) 200 OK                                │
      │<───────────────────────────────────────────┤
      │                                            │
~~~

1. Client requests a protected resource.
2. Server responds with 402 and a Payment challenge describing the
   payment requirements.
3. Client fulfills the payment via the specified payment method.
4. Client retries the request with a Payment credential.
5. Server verifies the credential and grants access.

Servers MUST return 402 with a `WWW-Authenticate: Payment` header
when payment is required. Servers MUST NOT return 402 without
including at least one Payment challenge.

## Relationship to 401 and 403

- **402** indicates a payment barrier.
- **401** is reserved for authentication failures unrelated to
  payment.
- **403** indicates the payment succeeded but access is denied
  by policy.

# The Payment Authentication Scheme

## Challenge (WWW-Authenticate)

The Payment challenge is sent in the `WWW-Authenticate` header
per {{RFC9110}}:

~~~abnf
challenge   = "Payment" 1*SP auth-params
auth-params = auth-param *( OWS "," OWS auth-param )
auth-param  = token BWS "=" BWS ( token / quoted-string )
~~~

### Required Parameters

id
: Unique challenge identifier. Servers MUST bind this value to
  the challenge parameters to enable verification. Clients MUST
  include this value unchanged in the credential.

realm
: Protection space identifier per {{RFC9110}}.

method
: Payment method identifier. MUST be a registered value in the
  "HTTP Payment Methods" registry ({{payment-method-registry}}).

intent
: Payment intent type. MUST be a registered value in the "HTTP
  Payment Intents" registry ({{payment-intent-registry}}).

request
: Base64url-encoded {{RFC4648}} JSON {{RFC8259}} containing
  payment-method-specific data. The structure is defined by the
  payment method specification. Padding characters MUST NOT be
  included.

### Optional Parameters

expires
: Timestamp indicating when this challenge expires, formatted
  as an {{RFC3339}} date-time string. Clients MUST NOT submit
  credentials for expired challenges.

description
: Human-readable description of the payment purpose. MUST NOT
  be relied upon for payment verification.

Unknown parameters MUST be ignored by clients.

### Example

~~~http
HTTP/1.1 402 Payment Required
Cache-Control: no-store
WWW-Authenticate: Payment id="x7Tg2pLqR9mKvNwY3hBcZa",
    realm="api.example.com",
    method="example",
    intent="charge",
    expires="2025-01-15T12:05:00Z",
    request="eyJhbW91bnQiOiIxMDAwIiwiY3VycmVuY3kiOiJ1c2Qi
    LCJyZWNpcGllbnQiOiJhY2N0XzEyMyJ9"
~~~

Decoded `request`:

~~~json
{
  "amount": "1000",
  "currency": "usd",
  "recipient": "acct_123"
}
~~~

## Credentials (Authorization)

The Payment credential is sent in the `Authorization` header as
a base64url-encoded JSON object without padding per {{RFC4648}}
Section 5:

~~~abnf
credentials     = "Payment" 1*SP base64url-nopad
base64url-nopad = 1*( ALPHA / DIGIT / "-" / "_" )
~~~

The decoded JSON object contains:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `challenge` | object | Yes | Echoed challenge parameters |
| `payload` | object | Yes | Method-specific payment proof |

The `challenge` object echoes the parameters from the original
challenge (`id`, `realm`, `method`, `intent`, `request`, and any
optional parameters that were present).

The `payload` object contains method-specific data needed to
verify the payment. Its structure is defined by the payment
method specification.

### Example

Decoded credential:

~~~json
{
  "challenge": {
    "id": "x7Tg2pLqR9mKvNwY3hBcZa",
    "realm": "api.example.com",
    "method": "example",
    "intent": "charge",
    "request": "eyJhbW91bnQiOiIxMDAwIiwiY3Vycm
        VuY3kiOiJ1c2QiLCJyZWNpcGllbnQiOiJhY2N0
        XzEyMyJ9",
    "expires": "2025-01-15T12:05:00Z"
  },
  "payload": {
    "proof": "0xabc123..."
  }
}
~~~

## Multiple Challenges

Servers MAY return multiple Payment challenges in a single 402
response, each with a different payment method or configuration.
Clients MUST send only one `Authorization: Payment` header in
the subsequent request.

# Payment Methods {#payment-methods}

## Method Identifier Format

~~~abnf
payment-method-id = method-name [ ":" sub-method ]
method-name       = 1*LOWERALPHA
sub-method        = 1*( LOWERALPHA / DIGIT / "-" )
LOWERALPHA        = %x61-7A  ; a-z
~~~

Method identifiers are case-sensitive and MUST be lowercase.

## Method Specifications

Payment method specifications MUST define:

1. A unique method identifier
2. The JSON schema for the `request` parameter
3. The JSON schema for credential `payload`
4. Verification and settlement procedures
5. Security considerations specific to the method

# Payment Intents {#payment-intents}

Payment intents describe the type of payment being requested.
Intent identifiers use the syntax:

~~~abnf
intent = 1*( ALPHA / DIGIT / "-" )
~~~

Intents are defined in separate specifications that register
their identifier in the "HTTP Payment Intents" registry.

# Security Considerations

## Transport Security

This specification REQUIRES TLS 1.3 {{RFC8446}} or later for
all Payment authentication flows.

Servers MUST NOT issue Payment challenges over unencrypted HTTP.
Clients MUST NOT send Payment credentials over unencrypted HTTP.

## Credential Handling

Payment credentials are bearer tokens that authorize financial
transactions. Servers and intermediaries MUST NOT log Payment
credentials or include them in error messages. Implementations
MUST treat Payment credentials with the same care as passwords
or session tokens.

## Replay Protection

Payment methods used with this specification MUST provide
single-use proof semantics. A payment proof MUST be usable
exactly once.

## Amount Verification {#amount-verification}

Clients MUST verify before authorizing payment that the
requested amount, recipient, and currency are expected and
reasonable. Clients MUST NOT rely on the `description`
parameter for payment verification.

## Caching

Servers MUST send `Cache-Control: no-store` {{RFC9111}} with
402 responses to prevent challenge replay.

## Privacy

Servers MUST NOT require user accounts for payment. Payment
methods SHOULD support pseudonymous payments where possible.

# IANA Considerations

## Authentication Scheme Registration

This document registers the "Payment" authentication scheme in
the "Hypertext Transfer Protocol (HTTP) Authentication Scheme
Registry" established by {{RFC9110}}:

- **Authentication Scheme Name**: Payment
- **Reference**: This document
- **Notes**: Used with HTTP 402 for proof-of-payment flows

## Payment Method Registry {#payment-method-registry}

This document establishes the "HTTP Payment Methods" registry.
This registry uses the "Specification Required" policy defined
in {{RFC8126}}.

Registration requests must include:

- **Method Identifier**: Unique lowercase ASCII string
- **Description**: Brief description of the payment method
- **Reference**: Reference to the specification document
- **Contact**: Contact information for the registrant

The registry is initially empty.

## Payment Intent Registry {#payment-intent-registry}

This document establishes the "HTTP Payment Intents" registry.
This registry uses the "Specification Required" policy defined
in {{RFC8126}}.

Registration requests must include:

- **Intent Identifier**: Unique lowercase ASCII string
- **Description**: Brief description of the intent semantics
- **Reference**: Reference to the specification document
- **Contact**: Contact information for the registrant

The registry is initially empty.

--- back

# Acknowledgements

TBD
