---
title: Authorize Intent for HTTP Payment Authentication
abbrev: Payment Intent Authorize
docname: draft-payment-intent-authorize-00
version: 00
category: info
ipr: noModificationTrust200902
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

normative:
  RFC2119:
  RFC3339:
  RFC4648:
  RFC8174:
  RFC8259:
  RFC8785:
  I-D.httpauth-payment:
    title: "The 'Payment' HTTP Authentication Scheme"
    target: https://datatracker.ietf.org/doc/draft-httpauth-payment/
    author:
      - name: Jake Moxey
    date: 2026-01
  I-D.ietf-httpapi-idempotency-key-header:
    title: "The Idempotency-Key HTTP Header Field"
    target: https://datatracker.ietf.org/doc/draft-ietf-httpapi-idempotency-key-header/
    author:
      - name: Jayadeba Jena
    date: 2024-06
---

--- abstract

This document defines the "authorize" payment intent for use with the
Payment HTTP Authentication Scheme. The "authorize" intent represents a
payment authorization where the payer approves a maximum amount that a
server can later capture before an expiry time.

--- middle

# Introduction

The "authorize" intent enables delayed payment capture. The payer
authorizes a maximum amount, and the payment method creates a hold,
escrow, or equivalent authorization. The server can later capture one or
more amounts against that authorization, subject to the authorized maximum
and expiry.

This is useful for:

Delayed fulfillment:
: Services where delivery or shipment occurs after payment authorization.

Metered billing:
: Services where final cost is unknown when the payer authorizes payment.

Spending caps:
: User-controlled limits on future server-initiated captures.

Unlike the "charge" intent, successful authorization is not itself a
payment capture. A successful authorization response MUST NOT imply that
the recipient has received funds.

## Relationship to Payment Methods

This document defines the abstract authorize semantics and shared request
fields. Payment method specifications define how an authorization is
created, how captures are executed, how unused authorizations are voided,
and which method-specific policy applies to refund requests.

# Requirements Language

{::boilerplate bcp14-tagged}

# Terminology

Authorization
: A method-enforced hold, escrow, or equivalent capability allowing a
  server or operator to capture up to a maximum amount before an expiry.

Capture
: A method-specific operation that consumes part or all of an
  authorization and transfers captured value to the recipient.

Void
: A method-specific operation that closes an authorization and releases
  any uncaptured value.

Recipient
: The method-native destination that receives captured value.

Operator
: A method-specific entity authorized to drive the payment lifecycle,
  such as registering the authorization, capturing value, or voiding
  unused value. Some methods use the server as the operator; others use a
  payment processor, contract, or facilitator.

# Intent Semantics

## Definition

The "authorize" intent requests the payer to authorize a maximum amount
for future capture. The client does not need to know whether the payment
method implements capture as a single capture, multiple captures, escrow
release, card network capture, or another method-specific mechanism.

## Properties

| Property | Value |
|----------|-------|
| Intent Identifier | `authorize` |
| Payment Timing | Deferred capture |
| Capture Count | Method-specific; one or more captures MAY occur |
| Idempotency | Credential single-use; authorization lifecycle method-specific |
| Reversibility | Uncaptured value can be voided; captured value refund is method/policy-specific |

## Authorization Flow

~~~
   Client                      Server / Operator             Payment Method
      |                              |                              |
      |  (1) GET /resource           |                              |
      |----------------------------->|                              |
      |                              |                              |
      |  (2) 402 Payment Required    |                              |
      |      intent="authorize"      |                              |
      |<-----------------------------|                              |
      |                              |                              |
      |  (3) Create method-specific  |                              |
      |      authorization credential|                              |
      |                              |                              |
      |  (4) Authorization: Payment  |                              |
      |----------------------------->|                              |
      |                              |  (5) Create hold/escrow/auth  |
      |                              |----------------------------->|
      |                              |                              |
      |  (6) 200 OK                  |  (authorization active)       |
      |      optional metadata       |<-----------------------------|
      |<-----------------------------|                              |
      |                              |                              |
~~~

## Capture Flow

Captures are method-specific operations. They can occur synchronously with
resource delivery, after resource delivery, or as part of a separate
fulfillment workflow.

~~~
   Client                      Server / Operator             Payment Method
      |                              |                              |
      |  (1) Request fulfillment     |                              |
      |----------------------------->|                              |
      |                              |                              |
      |                              |  (2) capture(amount)          |
      |                              |----------------------------->|
      |                              |                              |
      |  (3) 200 OK                  |  (capture confirmed)          |
      |      Payment-Receipt         |<-----------------------------|
      |<-----------------------------|                              |
      |                              |                              |
~~~

The core intent deliberately does not expose payment method capture
capabilities, such as whether the method performs one capture or multiple
captures. The payer authorizes a maximum amount; the payment method and
server enforce the capture lifecycle.

## Void Flow

~~~
   Server / Operator             Payment Method
          |                            |
          |  void(authorization)       |
          |--------------------------->|
          |                            |
          |  uncaptured value released |
          |<---------------------------|
          |                            |
~~~

Void closes the authorization and releases any uncaptured value according
to method-specific rules. Void does not refund captured value.

## Refund Requests

Refunds are out of scope for the core authorize lifecycle. Clients MAY
request a refund through method-defined or merchant-defined channels.
Servers MAY honor refund requests depending on payment method capability,
merchant policy, and applicable rules. The "authorize" intent does not
require partial refunds or on-protocol refund execution.

# Request Schema

The `request` parameter for an "authorize" intent is a JSON object with
shared fields defined by this specification and optional method-specific
extensions in the `methodDetails` field. The `request` JSON MUST be
serialized using JSON Canonicalization Scheme (JCS) {{RFC8785}} and
base64url-encoded without padding per {{I-D.httpauth-payment}}.

## Shared Fields

All payment methods implementing the "authorize" intent MUST support these
shared fields. Payment methods MAY elevate OPTIONAL fields to REQUIRED in
their method specification.

### Required Fields

| Field | Type | Description |
|-------|------|-------------|
| `amount` | string | Maximum authorization amount in base units (stringified non-negative integer, no leading zeros) |
| `currency` | string | Currency or asset identifier (see {{currency-formats}}) |
| `authorizationExpires` | string | Authorization expiry timestamp in {{RFC3339}} format |

The `amount` value MUST be a string representation of a non-negative
integer in base 10 with no sign, decimal point, exponent, or surrounding
whitespace. Leading zeros MUST NOT be used except for the value `"0"`.

### Optional Fields

| Field | Type | Description |
|-------|------|-------------|
| `recipient` | string | Captured-value destination in method-native format |
| `description` | string | Human-readable authorization description |
| `externalId` | string | Merchant reference, order ID, or cart ID |
| `methodDetails` | object | Method-specific extension data |

Challenge expiry is conveyed by the `expires` auth-param in
`WWW-Authenticate` per {{I-D.httpauth-payment}}, using {{RFC3339}}
format. Request objects MUST NOT duplicate the challenge expiry value.
The `authorizationExpires` field instead defines when the authorization
itself expires.

Servers issuing an "authorize" challenge MUST include the `expires`
auth-param.

The `authorizationExpires` value MUST be strictly later than the
challenge `expires` timestamp. Servers MUST reject credentials where
`authorizationExpires` is at or before the challenge `expires`.

## Currency Formats {#currency-formats}

The `currency` field supports multiple formats to accommodate different
payment networks:

| Format | Example | Description |
|--------|---------|-------------|
| ISO 4217 | `"usd"`, `"eur"` | Fiat currencies (lowercase) |
| Token address | `"0x20c0..."` | ERC-20, TIP-20, or similar token contracts |
| Method-defined | (varies) | Payment method-specific currency identifiers |

Payment method specifications MUST document which currency formats they
support and how to interpret amounts for each format.

## Examples

### Stripe

~~~json
{
  "amount": "100000",
  "currency": "usd",
  "authorizationExpires": "2026-05-14T12:00:00Z",
  "recipient": "acct_merchant",
  "description": "Pre-authorization for metered API usage",
  "methodDetails": {
    "networkId": "profile_1MqDcVKA5fEO2tZvKQm9g8Yj",
    "paymentMethodTypes": ["card", "link"]
  }
}
~~~

### Tempo

~~~json
{
  "amount": "50000000",
  "currency": "0x20c0000000000000000000000000000000000001",
  "authorizationExpires": "2026-05-14T12:00:00Z",
  "recipient": "0x742d35Cc6634C0532925a3b844Bc9e7595f8fE00",
  "methodDetails": {
    "chainId": 42431,
    "escrowContract": "0x1234567890abcdef1234567890abcdef12345678",
    "operator": "0xA1B2C3D4E5F6A1B2C3D4E5F6A1B2C3D4E5F6A1B2"
  }
}
~~~

# Credential Requirements

The credential `payload` for an "authorize" intent contains
method-specific authorization material. Each credential MUST be usable
only once for a challenge. Servers MUST reject replayed credentials.

Successful credential processing creates an authorization. The
authorization persists until:

- The `authorizationExpires` timestamp is reached
- The authorized amount is fully captured
- The authorization is voided
- A method-specific terminal state occurs

# Authorization Lifecycle

## Registration

When the server receives an "authorize" credential, it MUST:

1. Verify the challenge ID and challenge expiry.
2. Verify the method-specific authorization credential.
3. Create or confirm the method-specific hold, escrow, or authorization.
4. Store durable state sufficient to correlate later captures and voids.
5. Return success only after the authorization is active.

Registration responses for `intent="authorize"` MUST NOT include a
`Payment-Receipt` header. `Payment-Receipt` is reserved for successful
responses that actually consume or capture authorized value.

## Authorization Metadata

Payment methods MAY return method-specific authorization metadata in a
successful registration response body. Such metadata can include an
authorization identifier, status, expiry, captured amount, remaining
amount, or method reference. The core authorize intent does not define a
mandatory authorization metadata schema, and clients MUST NOT rely on a
method returning a core-defined authorization handle.

## Captures

Servers MUST enforce the following invariants across all captures for an
authorization:

- The cumulative captured amount MUST NOT exceed `amount`.
- Captures MUST NOT occur after `authorizationExpires`.
- Capture execution MUST be idempotent with respect to method-specific
  retry behavior.
- Captured value MUST be directed to the `recipient` or the
  method-specific destination bound by the original authorization.

Payment methods MAY use cumulative capture semantics, per-capture
idempotency keys, processor idempotency keys, or other mechanisms to
prevent duplicate capture.

## Server Accounting and Idempotency

Servers MUST maintain durable authorization state sufficient to enforce
remaining limits across concurrent requests and retries.

At minimum, servers MUST track:

- Authorization identifier
- Authorized amount
- Cumulative captured amount
- Authorization expiry
- Terminal state, if any

For retried HTTP requests, clients SHOULD send an `Idempotency-Key`
header per {{I-D.ietf-httpapi-idempotency-key-header}}. Servers MUST NOT
capture or consume authorized amount more than once for a duplicate
idempotent request.

## Void

Servers SHOULD provide a way to void an unused or partially used
authorization. Void closes the authorization and releases uncaptured value
according to method-specific rules. Void MUST NOT alter captured value.

## Refund Requests

Clients MAY request a refund through method-defined or merchant-defined
channels. A successful refund request is not guaranteed by this intent and
does not change the core authorization lifecycle.

## Non-Normative Protocol Examples

The following non-normative examples illustrate possible wire shapes.
Method specifications define the exact payload fields, response bodies,
and any void or refund-request interfaces.

### Authorization Challenge

~~~http
HTTP/1.1 402 Payment Required
WWW-Authenticate: Payment id="auth_1a2b3c4d5e",
  realm="api.example.com",
  method="example",
  intent="authorize",
  expires="2026-05-13T12:05:00Z",
  request="<base64url-encoded request>"
Cache-Control: no-store
Content-Type: application/json

{
  "type": "https://paymentauth.org/problems/payment-required",
  "title": "Payment Required",
  "status": 402,
  "detail": "This resource requires payment authorization"
}
~~~

Decoded request:

~~~json
{
  "amount": "100000",
  "currency": "usd",
  "authorizationExpires": "2026-05-14T12:00:00Z",
  "recipient": "merchant_123"
}
~~~

### Authorization Credential

~~~http
GET /resource HTTP/1.1
Host: api.example.com
Authorization: Payment <base64url-encoded credential>
~~~

Decoded credential:

~~~json
{
  "challenge": {
    "id": "auth_1a2b3c4d5e",
    "realm": "api.example.com",
    "method": "example",
    "intent": "authorize",
    "request": "eyJ...",
    "expires": "2026-05-13T12:05:00Z"
  },
  "payload": {
    "type": "method-specific"
  }
}
~~~

### Authorization Active

Registration responses MUST NOT include `Payment-Receipt`. The response
body below is illustrative metadata, not a required core schema.

~~~http
HTTP/1.1 200 OK
Cache-Control: no-store
Content-Type: application/json

{
  "authorization": {
    "id": "pauth_123",
    "status": "authorized",
    "amount": "100000",
    "capturedAmount": "0",
    "remainingAmount": "100000",
    "currency": "usd",
    "recipient": "merchant_123",
    "authorizationExpires": "2026-05-14T12:00:00Z"
  }
}
~~~

### Capture Receipt

When a response consumes or captures authorized value, the server returns a
`Payment-Receipt` header. The decoded receipt shape is method-specific.

~~~http
HTTP/1.1 200 OK
Payment-Receipt: eyJtZXRob2QiOiJleGFtcGxlIiwiaW50ZW50IjoiYXV0aG9yaXplIiwic3RhdHVzIjoic3VjY2VzcyJ9
Cache-Control: no-store
Content-Type: application/json

{
  "result": "resource response"
}
~~~

Decoded receipt:

~~~json
{
  "method": "example",
  "intent": "authorize",
  "reference": "cap_456",
  "authorizationId": "pauth_123",
  "capturedAmount": "25000",
  "delta": "25000",
  "status": "success",
  "timestamp": "2026-05-13T12:10:00Z"
}
~~~

### Authorization Exhausted or Closed

When an authorization cannot cover the request, the server returns a fresh
challenge.

~~~http
HTTP/1.1 402 Payment Required
WWW-Authenticate: Payment id="auth_6f7g8h9i0j",
  realm="api.example.com",
  method="example",
  intent="authorize",
  expires="2026-05-13T12:20:00Z",
  request="eyJ..."
Cache-Control: no-store
Content-Type: application/problem+json

{
  "type": "https://paymentauth.org/problems/authorization-exhausted",
  "title": "Authorization Exhausted",
  "status": 402,
  "detail": "The previous authorization cannot cover this request"
}
~~~

### Method-Defined Void

Void is a method-specific or server-operator operation. A method that
exposes void over HTTP might use a shape like this:

~~~http
POST /payments/authorizations/pauth_123/void HTTP/1.1
Host: api.example.com
Idempotency-Key: void_123
~~~

~~~http
HTTP/1.1 200 OK
Cache-Control: no-store
Content-Type: application/json

{
  "authorizationId": "pauth_123",
  "status": "voided",
  "releasedAmount": "75000"
}
~~~

### Out-of-Band Refund Request

Refund requests are merchant-defined or method-defined and do not change
the core authorization semantics:

~~~http
POST /payments/authorizations/pauth_123/refund-requests HTTP/1.1
Host: api.example.com
Content-Type: application/json

{
  "reason": "requested_by_customer"
}
~~~

~~~http
HTTP/1.1 202 Accepted
Content-Type: application/json

{
  "refundRequestId": "rr_123",
  "status": "pending_review"
}
~~~

## Error Responses

When an authorization cannot be used to fulfill a request, the server
MUST return an appropriate HTTP status code:

| Condition | Status Code | Behavior |
|-----------|-------------|----------|
| Authorization expired | 402 Payment Required | Issue new challenge |
| Authorized amount exhausted | 402 Payment Required | Issue new challenge |
| Authorization voided or closed | 402 Payment Required | Issue new challenge |
| Invalid credential | 402 Payment Required | Issue new challenge |

For all 402 responses, the server MUST include a `WWW-Authenticate`
header with a fresh challenge. Clients receiving a 402 after a previously
valid authorization SHOULD initiate a new authorization flow.

# Security Considerations

## Limit Verification

Clients MUST verify the requested limit is acceptable before authorizing.
Authorizations allow future captures without further user interaction.

Clients MUST verify:

- The `amount` and `currency`
- The `recipient`, when exposed by the method
- The authorization expiry
- Method-specific lifecycle authority, processor, or escrow identifiers
  when present

## Destination and Lifecycle Authority

Some methods distinguish between the destination that receives captured
funds and an authority that can drive authorization, capture, or void
operations. For example, an on-chain method might use a recipient address
for settlement and a separate operator address for lifecycle operations.
Where a method exposes separate roles, clients SHOULD display them when
they differ. Method specifications MUST define which role fields are bound
by the payer's authorization and MUST ensure lifecycle authority cannot
redirect captured value to a different destination.

## Expiry Windows

Clients SHOULD prefer short authorization windows. Long-lived
authorizations increase risk if credentials are compromised or merchant
systems behave incorrectly.

## Refund Expectations

Clients MUST NOT assume that captured value can be refunded through the
Payment Authentication protocol. Refund rights and procedures are
method-specific and policy-specific.

## Caching

Responses to authorization challenges (402 Payment Required), responses
that establish authorizations, and responses that consume authorized value
SHOULD include `Cache-Control: no-store` to prevent sensitive payment data
from being cached by intermediaries.

# IANA Considerations

## Payment Intent Registration

This document registers the "authorize" intent in the "HTTP Payment
Intents" registry established by {{I-D.httpauth-payment}}:

| Intent | Description | Reference |
|--------|-------------|-----------|
| `authorize` | Authorization for deferred capture | This document |

Contact: Tempo Labs (<contact@tempo.xyz>)

--- back

# Acknowledgements

The authors thank the MPP community for their feedback on this
specification.
