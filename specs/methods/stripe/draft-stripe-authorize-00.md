---
title: Stripe authorize Intent for HTTP Payment Authentication
abbrev: Stripe Authorize
docname: draft-stripe-authorize-00
version: 00
category: info
ipr: noModificationTrust200902
submissiontype: IETF
consensus: true

author:
  - name: Brendan Ryan
    ins: B. Ryan
    email: brendan@tempo.xyz
    org: Tempo Labs
  - name: Steve Kaliski
    ins: S. Kaliski
    email: stevekaliski@stripe.com
    org: Stripe

normative:
  RFC2119:
  RFC3339:
  RFC8174:
  RFC8785:
  I-D.httpauth-payment:
    title: "The 'Payment' HTTP Authentication Scheme"
    target: https://datatracker.ietf.org/doc/draft-ryan-httpauth-payment/
    author:
      - name: Jake Moxey
    date: 2026-01
  I-D.payment-intent-authorize:
    title: "Authorize Intent for HTTP Payment Authentication"
    target: https://datatracker.ietf.org/doc/draft-payment-intent-authorize/
    author:
      - name: Jake Moxey
    date: 2026-03
  STRIPE-API:
    target: https://stripe.com/docs/api
    title: Stripe API Reference
    author:
      - org: Stripe, Inc.
  STRIPE-SPT:
    target: https://docs.stripe.com/agentic-commerce/concepts/shared-payment-tokens
    title: Shared payment tokens
    author:
      - org: Stripe, Inc.
---

--- abstract

This document defines the "authorize" intent for the Stripe payment method
within the Payment HTTP Authentication Scheme. It specifies how clients
grant payment authority using Shared Payment Tokens and how servers
create Stripe PaymentIntents with manual capture.

--- middle

# Introduction

The `authorize` intent for Stripe uses a Shared Payment Token (SPT) and a
Stripe PaymentIntent with manual capture. The client creates an SPT for
the maximum authorized amount using Stripe client-side flows. The server
then creates and confirms a PaymentIntent with `capture_method=manual`
and `payment_method_data[shared_payment_granted_token]` set to the SPT.
The authorization is active when the PaymentIntent reaches
`requires_capture`.

The server later captures against that PaymentIntent. Stripe may support
multiple captures for eligible card payments. If multicapture is not
available, the implementation can still satisfy the authorize intent with
a single final capture or by issuing fresh authorizations where additional
captures are required.

# Requirements Language

{::boilerplate bcp14-tagged}

# Terminology

PaymentIntent
: A Stripe API object that tracks the lifecycle of a customer payment,
  from confirmation through capture, cancellation, and refund. Not to be
  confused with the HTTP Payment Auth `intent` parameter.

Shared Payment Token (SPT)
: A single-use token (prefixed with `spt_`) that represents authorization
  to charge a payment method. SPTs are created by clients using Stripe
  client-side flows and consumed by servers when creating PaymentIntents.
  In the Stripe API, SPTs are provided as
  `payment_method_data[shared_payment_granted_token]` on PaymentIntent
  creation. See {{STRIPE-SPT}}.

Manual Capture
: A Stripe PaymentIntent configuration where confirmation authorizes the
  payment method and a later server-side capture operation captures
  funds.

# Intent Identifier

This specification defines the following intent for the `stripe` payment
method:

~~~
authorize
~~~

The intent identifier is case-sensitive and MUST be lowercase.

# Intent: "authorize"

An authorization of up to the specified amount. The server creates a
manual-capture PaymentIntent after receiving the SPT and may later
capture against that PaymentIntent.

**Fulfillment mechanism:**

1. **Shared Payment Token (SPT)**: The payer creates an SPT using Stripe
   client-side flows, which the server uses to create a PaymentIntent via
   Stripe.

## Stripe Authorize Flow

~~~
   Client                      Server                         Stripe
      |                           |                              |
      |  (1) GET /resource        |                              |
      |-------------------------->|                              |
      |                           |                              |
      |  (2) 402 Payment Required |                              |
      |<--------------------------|                              |
      |                           |                              |
      |  (3) Create SPT using Stripe client-side flows            |
      |--------------------------------------------------------->|
      |                           |                              |
      |  (4) Authorization:       |                              |
      |      Payment <credential> |  (payload contains SPT)       |
      |-------------------------->|                              |
      |                           |  (5) Create PaymentIntent     |
      |                           |      capture_method=manual    |
      |                           |      confirm=true, SPT        |
      |                           |----------------------------->|
      |                           |                              |
      |  (6) 200 OK               |                              |
      |      authorization active |                              |
      |<--------------------------|                              |
      |                           |                              |
      |         ... later ...     |                              |
      |                           |                              |
      |                           |  (7) Capture PaymentIntent    |
      |                           |----------------------------->|
      |                           |                              |
      |  (8) 200 OK + receipt     |                              |
      |<--------------------------|                              |
      |                           |                              |
~~~

## Relationship to the Payment Scheme

This document is a payment method intent specification as defined in
{{I-D.httpauth-payment}}. It defines the `request` and `payload`
structures for the `authorize` intent of the `stripe` payment method,
along with verification, authorization, capture, and void procedures.

# Request Schema

The `request` parameter in the `WWW-Authenticate` challenge contains a
base64url-encoded JSON object with the following fields. The JSON MUST be
serialized using JSON Canonicalization Scheme (JCS) {{RFC8785}} before
base64url encoding, per {{I-D.httpauth-payment}}.

## Shared Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `amount` | string | REQUIRED | Maximum authorization amount in the smallest currency unit |
| `currency` | string | REQUIRED | Three-letter ISO currency code, lowercase |
| `authorizationExpires` | string | REQUIRED | Latest intended capture time in {{RFC3339}} format |
| `recipient` | string | OPTIONAL | Stripe business or merchant identifier |
| `description` | string | OPTIONAL | Human-readable authorization description |
| `externalId` | string | OPTIONAL | Merchant reference, order ID, or cart ID |

## Method Details

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `methodDetails.networkId` | string | REQUIRED | Stripe Business Network Profile ID |
| `methodDetails.paymentMethodTypes` | []string | REQUIRED | Seller-supported payment method types |

The challenge request does not contain a PaymentIntent ID or a
PaymentIntent client secret. The client fulfills the challenge by creating
an SPT scoped to the challenged amount, currency, expiry, and seller
details. The server consumes that SPT when creating the manual-capture
PaymentIntent.

**Example:**

~~~json
{
  "amount": "100000",
  "currency": "usd",
  "recipient": "acct_merchant",
  "authorizationExpires": "2026-05-14T12:00:00Z",
  "description": "Pre-authorization for metered API usage",
  "externalId": "order_12345",
  "methodDetails": {
    "networkId": "profile_1MqDcVKA5fEO2tZvKQm9g8Yj",
    "paymentMethodTypes": ["card", "link"]
  }
}
~~~

# Credential Schema

The Payment credential is a base64url-encoded JSON object containing
`challenge` and `payload` fields per {{I-D.httpauth-payment}}. For Stripe
authorize, the `payload` object contains the following fields:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `spt` | string | REQUIRED | Shared Payment Token ID |
| `externalId` | string | OPTIONAL | Client reference ID |

**Example:**

~~~json
{
  "challenge": {
    "id": "auth_1a2b3c4d5e",
    "realm": "api.example.com",
    "method": "stripe",
    "intent": "authorize",
    "request": "eyJ...",
    "expires": "2026-05-13T12:05:00Z"
  },
  "payload": {
    "spt": "spt_1N4Zv32eZvKYlo2CPhVPkJlW"
  }
}
~~~

# Verification Procedure

Servers MUST verify Stripe authorize credentials as follows:

1. Verify the challenge ID matches an outstanding challenge.
2. Verify the challenge has not expired.
3. Extract the `spt` from the credential payload.
4. Verify the SPT has not been previously used for this challenge.
5. Verify the SPT is usable. If Stripe indicates that the SPT is
   revoked, expired, requires additional action, or is otherwise
   unusable, reject the credential.
6. Create and confirm a PaymentIntent using the SPT, with `amount`,
   `currency`, `capture_method`, merchant context, and metadata matching
   the challenge.
7. Verify the PaymentIntent has `capture_method=manual`.
8. Verify the PaymentIntent status is `requires_capture`.
9. Store durable authorization state for later capture or cancellation.

Servers MUST complete challenge validation before acting on Stripe
credential material.

# Authorization Lifecycle

## Creating the SPT

The client creates an SPT using Stripe client-side flows. This step can
use Stripe's standard card collection and authentication flow. The SPT
MUST be scoped to the challenged currency, maximum amount, expiry, and
seller details.

If creating or preparing the SPT requires additional customer action, the
client MUST complete that action before submitting the Payment credential
to the server. Clients MUST NOT submit an SPT that is not usable for
PaymentIntent creation.

~~~javascript
const spt = await stripe.sharedPayment.issuedTokens.create({
  payment_method: "pm_123",
  usage_limits: {
    currency: request.currency,
    max_amount: Number(request.amount),
    expires_at: expiresAt
  },
  seller_details: {
    network_business_profile: request.methodDetails.networkId
  }
});
~~~

## Creating the PaymentIntent

After receiving the Payment credential, the server creates and confirms a
PaymentIntent with manual capture. For example:

~~~javascript
const paymentIntent = await stripe.paymentIntents.create({
  amount: Number(request.amount),
  currency: request.currency,
  capture_method: "manual",
  payment_method_data: {
    shared_payment_granted_token: credential.spt
  },
  confirm: true,
  automatic_payment_methods: {
    enabled: true,
    allow_redirects: "never"
  },
  metadata: {
    challenge_id: challenge.id,
    external_id: request.externalId
  }
}, {
  idempotencyKey: `${challenge.id}_${credential.spt}`
});
~~~

The server MUST verify that the resulting PaymentIntent status is
`requires_capture` before accepting the authorization. If Stripe returns a
state that requires additional client action or otherwise cannot be
authorized synchronously, the server MUST reject the credential and issue
a fresh challenge.

## Capture

Captures are server-side Stripe API calls. The client does not need to
know whether the Stripe implementation performs one capture or multiple
captures.

If Stripe multicapture is available for the PaymentIntent, the server MAY
perform multiple partial captures using Stripe's supported capture
parameters and leave the PaymentIntent capturable until the final capture.

If multicapture is not available, the server MUST use a fallback that
still respects the core authorize semantics:

Single capture:
: The server delays capture until the final amount is known, then captures
  once and cancels or releases any uncaptured remainder according to
  Stripe behavior.

Fresh authorization:
: The server issues a fresh authorize challenge and creates a new
  PaymentIntent for a later fulfillment unit that cannot be captured under
  the original PaymentIntent.

Stored credential:
: Where the payer has separately consented to stored credential or
  off-session use, the server MAY create additional PaymentIntents under
  the applicable Stripe rules. This is distinct from the original
  authorize credential and MUST comply with Stripe and payment network
  requirements.

## Void

Void maps to canceling an uncaptured PaymentIntent. Servers SHOULD cancel
manual-capture PaymentIntents when no further capture is expected. Stripe
releases uncaptured funds according to payment method and network rules.

## Refund Requests

Refunds are out of band for this intent. Clients MAY request refunds
through merchant-defined channels. Servers MAY honor those requests by
creating Stripe Refunds or through other merchant policy. This
specification does not require client-side Stripe refund capability.

# Receipt Generation

Registration responses for `intent="authorize"` MUST NOT include a
`Payment-Receipt` header. Servers MUST return a `Payment-Receipt` header
only on successful responses that actually consume or capture authorized
value, per {{I-D.httpauth-payment}}.

The receipt payload for Stripe authorize:

| Field | Type | Description |
|-------|------|-------------|
| `method` | string | `"stripe"` |
| `intent` | string | `"authorize"` |
| `reference` | string | Stripe PaymentIntent ID |
| `capturedAmount` | string | Cumulative captured amount after this capture |
| `delta` | string | Amount captured by this receipt |
| `status` | string | `"success"` |
| `timestamp` | string | {{RFC3339}} capture time |
| `externalId` | string | OPTIONAL. Echoed from the challenge request or credential |

# Security Considerations

## Authorization Amount

Clients MUST verify the maximum authorization amount, currency, expiry,
and seller details before creating the SPT. A consumed SPT can produce a
manual-capture PaymentIntent that allows later server-side capture without
further client interaction, subject to Stripe and payment network rules.

## SPT Single-Use Constraint

SPTs are single-use tokens. Stripe automatically prevents SPT reuse at the
API level, and idempotency keys prevent duplicate PaymentIntent creation.
Servers MUST enforce single-use challenge IDs per
{{I-D.httpauth-payment}} and SHOULD use Stripe idempotency keys derived
from the challenge ID and SPT.

## PaymentIntent Binding

Servers MUST bind created PaymentIntents to challenge IDs using metadata
or equivalent durable state and verify the binding before later capture.
The authorize challenge does not require a PaymentIntent client secret,
and implementations MUST NOT include PaymentIntent client secrets in
`WWW-Authenticate` parameters or in the base64url-encoded challenge
`request`.

## Capture Windows

Payment method and card network rules constrain how long a Stripe
authorization can remain capturable. Servers MUST NOT advertise an
`authorizationExpires` value that they cannot honor for the selected
PaymentIntent and payment method.

## Refund Expectations

Clients MUST NOT assume refunds can be initiated directly by the client.
Refunds require merchant or platform action and are subject to Stripe,
payment network, and merchant policy.

# IANA Considerations

## Payment Intent Registration

This document registers the following payment intent in the "HTTP Payment
Intents" registry established by {{I-D.httpauth-payment}}:

| Intent | Applicable Methods | Description | Reference |
|--------|-------------------|-------------|-----------|
| `authorize` | `stripe` | Manual-capture Stripe PaymentIntent authorization | This document |

--- back

# ABNF Collected

~~~abnf
stripe-authorize-challenge = "Payment" 1*SP
  "id=" quoted-string ","
  "realm=" quoted-string ","
  "method=" DQUOTE "stripe" DQUOTE ","
  "intent=" DQUOTE "authorize" DQUOTE ","
  "request=" base64url-nopad

stripe-authorize-credential = "Payment" 1*SP base64url-nopad

; Base64url encoding without padding per RFC 4648 Section 5
base64url-nopad = 1*( ALPHA / DIGIT / "-" / "_" )
~~~

# Example

**Challenge:**

~~~http
HTTP/1.1 402 Payment Required
WWW-Authenticate: Payment id="auth_1a2b3c4d5e",
  realm="api.example.com",
  method="stripe",
  intent="authorize",
  expires="2026-05-13T12:05:00Z",
  request="<base64url-encoded JSON below>"
Cache-Control: no-store
~~~

Decoded request:

~~~json
{
  "amount": "100000",
  "currency": "usd",
  "recipient": "acct_merchant",
  "authorizationExpires": "2026-05-14T12:00:00Z",
  "description": "Pre-authorization for metered API usage",
  "externalId": "order_12345",
  "methodDetails": {
    "networkId": "profile_1MqDcVKA5fEO2tZvKQm9g8Yj",
    "paymentMethodTypes": ["card", "link"]
  }
}
~~~

**Client creates SPT:**

~~~javascript
const spt = await stripe.sharedPayment.issuedTokens.create({
  payment_method: "pm_123",
  usage_limits: {
    currency: "usd",
    max_amount: 100000,
    expires_at: 1778760000
  },
  seller_details: {
    network_business_profile: "profile_1MqDcVKA5fEO2tZvKQm9g8Yj"
  }
});
~~~

**Credential:**

~~~json
{
  "challenge": {
    "id": "auth_1a2b3c4d5e",
    "realm": "api.example.com",
    "method": "stripe",
    "intent": "authorize",
    "request": "eyJ...",
    "expires": "2026-05-13T12:05:00Z"
  },
  "payload": {
    "spt": "spt_1N4Zv32eZvKYlo2CPhVPkJlW"
  }
}
~~~

**Authorization active response:**

~~~http
HTTP/1.1 200 OK
Cache-Control: no-store
Content-Type: application/json

{
  "authorization": {
    "id": "pi_1N4Zv32eZvKYlo2CPhVPkJlW",
    "method": "stripe",
    "status": "authorized",
    "amount": "100000",
    "capturedAmount": "0",
    "remainingAmount": "100000",
    "currency": "usd",
    "recipient": "acct_merchant",
    "authorizationExpires": "2026-05-14T12:00:00Z"
  }
}
~~~

## Capture Examples

### Multicapture Implementation

If Stripe multicapture is available, the server can capture less than the
full authorized amount while leaving the PaymentIntent capturable for
later captures.

Decoded first capture receipt:

~~~json
{
  "method": "stripe",
  "intent": "authorize",
  "reference": "pi_1N4Zv32eZvKYlo2CPhVPkJlW",
  "capturedAmount": "25000",
  "delta": "25000",
  "status": "success",
  "timestamp": "2026-05-13T12:10:00Z",
  "externalId": "order_12345"
}
~~~

Decoded later capture receipt:

~~~json
{
  "method": "stripe",
  "intent": "authorize",
  "reference": "pi_1N4Zv32eZvKYlo2CPhVPkJlW",
  "capturedAmount": "60000",
  "delta": "35000",
  "status": "success",
  "timestamp": "2026-05-13T12:30:00Z",
  "externalId": "order_12345"
}
~~~

### Single-Capture Fallback

If Stripe multicapture is not available, the server can delay capture
until the final amount is known and then perform one capture. In this
example, the server captures 60.00 USD from a 100.00 USD authorization;
Stripe releases uncaptured value according to PaymentIntent and network
rules.

~~~json
{
  "method": "stripe",
  "intent": "authorize",
  "reference": "pi_1N4Zv32eZvKYlo2CPhVPkJlW",
  "capturedAmount": "60000",
  "delta": "60000",
  "status": "success",
  "timestamp": "2026-05-13T12:30:00Z",
  "externalId": "order_12345"
}
~~~

### Fresh-Authorization Fallback

If a later fulfillment unit cannot be captured under the original
PaymentIntent, the server issues a fresh 402 challenge and creates a new
PaymentIntent.

~~~http
HTTP/1.1 402 Payment Required
WWW-Authenticate: Payment id="auth_next_1",
  realm="api.example.com",
  method="stripe",
  intent="authorize",
  expires="2026-05-13T13:05:00Z",
  request="<base64url-encoded request for the next authorization>"
Cache-Control: no-store
~~~

## Void Example

If no capture is needed, or no additional capture is expected, the server
cancels the uncaptured PaymentIntent.

~~~json
{
  "authorizationId": "pi_1N4Zv32eZvKYlo2CPhVPkJlW",
  "status": "voided",
  "releasedAmount": "40000"
}
~~~

## Out-of-Band Refund Request Example

After capture, the client MAY request a refund through a merchant-defined
interface. The merchant can honor the request by creating a Stripe Refund,
but this is outside the core authorize lifecycle.

~~~http
POST /payments/stripe/authorizations/pi_1N4Zv32eZvKYlo2CPhVPkJlW/refund-requests HTTP/1.1
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
  "refundRequestId": "rr_456",
  "status": "pending_review"
}
~~~

# Acknowledgements

The authors thank the Tempo and Stripe communities for their feedback on
this specification.
