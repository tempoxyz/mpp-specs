---
title: Stripe authorize Intent for HTTP Payment Authentication
abbrev: Stripe Authorize
docname: draft-stripe-authorize-00
version: 00
category: info
ipr: trust200902
submissiontype: IETF
consensus: true

author:
  - name: Brendan Ryan
    ins: B. Ryan
    email: brendan@tempo.xyz
    organization: Tempo Labs
  - name: Steve Kaliski
    ins: S. Kaliski
    email: stevekaliski@stripe.com
    organization: Stripe

normative:
  RFC2119:
  RFC8174:
  RFC7235:
  I-D.httpauth-payment:
    title: "The 'Payment' HTTP Authentication Scheme"
    target: https://datatracker.ietf.org/doc/draft-ietf-httpauth-payment/
    author:
      - name: Jake Moxey
    date: 2026-01

informative:
  STRIPE-API:
    target: https://stripe.com/docs/api
    title: Stripe API Reference
    author:
      - org: Stripe, Inc.
---

--- abstract

This document defines the "authorize" intent for the Stripe payment method
within the Payment HTTP Authentication Scheme {{I-D.httpauth-payment}}.
It specifies how clients and servers exchange payment authorizations for
deferred capture using Stripe Payment Tokens (SPTs) with
`capture_method=manual`.

--- middle

# Introduction

This specification defines the "authorize" intent for use with the Stripe
payment method in the Payment HTTP Authentication Scheme
{{I-D.httpauth-payment}}. The authorize intent enables payment
authorizations where the server holds funds without immediately capturing
them, allowing for deferred settlement.

Stripe provides authorization through PaymentIntents with
`capture_method=manual`. This allows servers to authorize a maximum amount
and capture the actual amount (up to the authorized limit) within a
7-day window for card payments.

## Stripe Authorize Flow

The following diagram illustrates the Stripe authorize payment flow:

~~~
   Client                                            Server
      |                                                 |
      |  (1) GET /resource                              |
      |------------------------------------------------>|
      |                                                 |
      |  (2) 402 Payment Required                       |
      |      WWW-Authenticate: Payment method="stripe", |
      |        intent="authorize", request=<base64url>  |
      |<------------------------------------------------|
      |                                                 |
      |  (3) Client creates SPT via Stripe.js or API    |
      |      (may involve 3DS, biometrics, etc.)        |
      |                                                 |
      |  (4) GET /resource                              |
      |      Authorization: Payment <credential>        |
      |------------------------------------------------>|
      |                                                 |
      |  (5) Server creates PaymentIntent with          |
      |      capture_method=manual via Stripe API       |
      |                                                 |
      |  (6) 200 OK                                     |
      |      Payment-Receipt: <authorization details>   |
      |<------------------------------------------------|
      |                                                 |
      |         ... up to 7 days later ...              |
      |                                                 |
      |  (7) Server captures authorized funds           |
      |      stripe.paymentIntents.capture(pi_xxx)      |
      |                                                 |
~~~

## Relationship to the Payment Scheme

This document is a payment method intent specification as defined in
Section 10.1 of {{I-D.httpauth-payment}}. It defines the `request` and
`payload` structures for the `authorize` intent of the `stripe` payment
method, along with verification and settlement procedures.

# Requirements Language

{::boilerplate bcp14-tagged}

# Terminology

Stripe Payment Token (SPT)
: A single-use token (prefixed with `spt_`) that represents authorization
  to charge a payment method. SPTs are created by clients using Stripe.js
  or the Stripe API and consumed by servers to process payments.

Authorization
: A hold placed on funds in a customer's account without immediately
  capturing (transferring) those funds. The hold reserves the funds for
  later capture.

Capture
: The process of transferring previously authorized funds from the
  customer's account to the merchant's account.

Authorization Window
: The period during which an authorization remains valid and can be
  captured. For cards, this is typically 7 days.

# Intent Identifier

This specification defines the following intent for the `stripe` payment
method:

~~~
authorize
~~~

The intent identifier is case-sensitive and MUST be lowercase.

# Intent: "authorize"

A payment authorization for future capture. The payer grants the server
permission to charge up to the specified amount at a later time.

**Required parameters:**

- Maximum amount (spending limit)
- Optional: Expiry timestamp

**Fulfillment mechanism:**

1. **Stripe Payment Token with Authorization**: The payer creates an SPT,
   which the server uses to create a PaymentIntent with
   `capture_method=manual`. The server can capture the authorized funds
   within 7 days (for cards) or according to the payment method's
   authorization window.

# Request Schema

The `request` parameter in the `WWW-Authenticate` challenge contains a
base64url-encoded JSON object with the following fields:

## Shared Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `amount` | string | REQUIRED | Maximum authorization amount in smallest currency unit |
| `currency` | string | REQUIRED | Three-letter ISO currency code |
| `expires` | string | OPTIONAL | Authorization expiry in ISO 8601 format |
| `description` | string | OPTIONAL | Human-readable payment description |
| `externalId` | string | OPTIONAL | Merchant's identifier |

## Method Details

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `methodDetails.destination` | string | OPTIONAL | Stripe account ID to receive funds |
| `methodDetails.businessNetwork` | string | OPTIONAL | Business Network ID for B2B payments |
| `methodDetails.captureMethod` | string | OPTIONAL | Capture method (default: `"manual"`) |
| `methodDetails.metadata` | object | OPTIONAL | Key-value pairs for additional context |

**Example:**

~~~ json
{
  "amount": "100000",
  "currency": "usd",
  "expires": "2025-02-05T12:00:00Z",
  "description": "AI agent compute authorization",
  "methodDetails": {
    "businessNetwork": "bn_1MqDcVKA5fEO2tZvKQm9g8Yj",
    "captureMethod": "manual"
  }
}
~~~

The client fulfills this by creating an SPT that the server will use with
`capture_method=manual`:

~~~ javascript
const spt = await stripe.createPaymentToken({
  amount: 100000,
  currency: 'usd'
});
~~~

# Credential Schema

The `payload` field in the Payment credential contains a base64url-encoded
JSON object with the following fields:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `spt` | string | REQUIRED | Stripe Payment Token ID |
| `externalId` | string | OPTIONAL | Client's reference ID |

**Example:**

~~~ json
{
  "spt": "spt_1N4Zv32eZvKYlo2CPhVPkJlW"
}
~~~

# Verification Procedure {#authorize-verification}

Servers MUST verify Payment credentials for authorize intent:

1. Extract the `spt` from the credential payload
2. Verify the challenge ID matches the one issued
3. Verify the challenge has not expired
4. Verify the SPT has not been previously used (replay protection)
5. Validate the SPT exists and is valid via Stripe API (optional pre-check)

## Challenge Binding

Servers MUST verify that the credential corresponds to the exact challenge
issued. This includes validating:

- Challenge ID
- Amount (if specified in request)
- Currency
- Business Network (if specified)
- Any custom metadata

# Settlement Procedure {#authorize-settlement}

## Authorization

**Deferred settlement:**

1. Server receives and verifies the credential ({{authorize-verification}})
2. Server creates a PaymentIntent with `capture_method=manual`:

~~~ javascript
const paymentIntent = await stripe.paymentIntents.create({
  amount: request.amount,
  currency: request.currency,
  payment_method_data: {
    type: 'card',
    token: credential.spt
  },
  confirm: true,
  capture_method: 'manual',
  metadata: {
    challenge_id: challenge.id
  }
});
~~~

3. Server stores the PaymentIntent ID for later capture
4. Server returns 200 with `Payment-Receipt` containing authorization details

## Capture

Server may capture funds later (within the authorization window):

~~~ javascript
const capture = await stripe.paymentIntents.capture(
  paymentIntent.id,
  { amount_to_capture: actualAmount }
);
~~~

The `amount_to_capture` MAY be less than the authorized amount but MUST
NOT exceed it. Any uncaptured amount is automatically released back to
the customer.

## 7-Day Capture Window

For card payments, Stripe enforces a 7-day authorization window:

- Authorizations MUST be captured within 7 days
- Uncaptured authorizations automatically expire after 7 days
- Expired authorizations release the held funds back to the customer
- Some payment methods have different authorization windows

Servers SHOULD track authorization expiry and capture or cancel
authorizations before they expire to maintain a clean payment state.

## Partial Capture

Servers MAY capture less than the authorized amount:

~~~ javascript
// Authorized: $1000.00 (100000 cents)
// Capture only: $750.00 (75000 cents)
const capture = await stripe.paymentIntents.capture(
  paymentIntent.id,
  { amount_to_capture: 75000 }
);
// Remaining $250.00 is automatically released
~~~

## Authorization Cancellation

Servers MAY cancel an authorization to immediately release held funds:

~~~ javascript
const cancellation = await stripe.paymentIntents.cancel(paymentIntent.id);
~~~

# Security Considerations

## SPT Single-Use Constraint

SPTs are single-use tokens. Servers MUST track used SPTs and reject
replayed tokens. Stripe automatically prevents SPT reuse at the API level,
but servers SHOULD implement their own replay protection by storing
challenge IDs and verifying they haven't been previously fulfilled.

## Amount Verification

Clients MUST verify the authorization amount in the challenge matches their
expectation before creating an SPT. The SPT itself does not encode the
amount, so clients must trust the challenge parameters.

**Verification checklist:**

1. Verify the `amount` matches the expected maximum authorization
2. Verify the `currency` matches the expected currency
3. Verify the `description` matches the expected service
4. Verify the challenge hasn't expired
5. Verify the server's identity (TLS certificate validation)

## Authorization Expiry Management

Servers MUST implement proper authorization lifecycle management:

- Track authorization expiry timestamps
- Capture or cancel before expiry
- Handle authorization expiry errors gracefully
- Notify clients when authorizations are about to expire

## PCI DSS Compliance

Stripe's SPT model ensures clients never handle raw payment method details,
significantly reducing PCI DSS compliance scope. Servers using this
specification inherit Stripe's PCI Level 1 certification.

## 3D Secure and Strong Customer Authentication

Stripe.js automatically handles 3D Secure challenges when required by
the customer's bank or EU Strong Customer Authentication regulations.
Clients MUST use Stripe.js or equivalent SDKs that support challenge flows.

## Credential Storage

Clients MUST NOT log or persist SPTs. SPTs are bearer tokens that grant
payment authorization.

Servers MUST NOT store SPTs after processing. Instead, store the resulting
Stripe PaymentIntent ID for later capture operations.

## HTTPS Requirement

All communication MUST use TLS 1.2 or higher. Stripe Payment Tokens MUST
only be transmitted over HTTPS connections.

# IANA Considerations

## Payment Intent Registration

This specification registers the "authorize" intent for the "stripe"
payment method in the Payment Intent Registry per Section 13.4 of
{{I-D.httpauth-payment}}:

- **Intent**: authorize
- **Method**: stripe
- **Specification**: [this document]

--- back

# ABNF Collected

~~~ abnf
stripe-authorize-challenge = "Payment" 1*SP
  "id=" quoted-string ","
  "realm=" quoted-string ","
  "method=" DQUOTE "stripe" DQUOTE ","
  "intent=" DQUOTE "authorize" DQUOTE ","
  "request=" base64url

stripe-authorize-credential = "Payment" 1*SP base64url
~~~

# Examples

## Authorize Example (HTTP Transport)

**Step 1: Client requests resource**

~~~ http
GET /api/agent/compute HTTP/1.1
Host: api.example.com
~~~

**Step 2: Server issues authorization challenge**

~~~ http
HTTP/1.1 402 Payment Required
WWW-Authenticate: Payment id="auth_1a2b3c4d5e",
  realm="api.example.com",
  method="stripe",
  intent="authorize",
  request="eyJhbW91bnQiOiIxMDAwMDAiLCJjdXJyZW5jeSI6InVzZCIsImV4cGlyZXMiOiIyMDI1LTAyLTA1VDEyOjAwOjAwWiIsImRlc2NyaXB0aW9uIjoiQUkgYWdlbnQgY29tcHV0ZSBhdXRob3JpemF0aW9uIn0"
Cache-Control: no-store
Content-Type: application/json

{
  "error": "payment_required",
  "message": "This resource requires payment authorization"
}
~~~

Decoded request:
~~~ json
{
  "amount": "100000",
  "currency": "usd",
  "expires": "2025-02-05T12:00:00Z",
  "description": "AI agent compute authorization"
}
~~~

**Step 3: Client creates SPT and submits credential**

~~~ http
GET /api/agent/compute HTTP/1.1
Host: api.example.com
Authorization: Payment eyJjaGFsbGVuZ2UiOnsiaWQiOiJhdXRoXzFhMmIzYzRkNWUiLCJyZWFsbSI6ImFwaS5leGFtcGxlLmNvbSIsIm1ldGhvZCI6InN0cmlwZSIsImludGVudCI6ImF1dGhvcml6ZSIsInJlcXVlc3QiOiIuLi4iLCJleHBpcmVzIjoiMjAyNS0wMS0xNVQxMjowNTowMFoifSwicGF5bG9hZCI6eyJzcHQiOiJzcHRfMU40WnYzMmVadktZbG8yQ1BoVlBrSmxXIn19

~~~

Decoded credential:
~~~ json
{
  "challenge": {
    "id": "auth_1a2b3c4d5e",
    "realm": "api.example.com",
    "method": "stripe",
    "intent": "authorize",
    "request": "eyJhbW91bnQiOiIxMDAwMDAiLCJjdXJyZW5jeSI6InVzZCIsImV4cGlyZXMiOiIyMDI1LTAyLTA1VDEyOjAwOjAwWiIsImRlc2NyaXB0aW9uIjoiQUkgYWdlbnQgY29tcHV0ZSBhdXRob3JpemF0aW9uIn0",
    "expires": "2025-01-15T12:05:00Z"
  },
  "payload": {
    "spt": "spt_1N4Zv32eZvKYlo2CPhVPkJlW"
  }
}
~~~

**Step 4: Server authorizes payment and returns resource**

~~~ http
HTTP/1.1 200 OK
Payment-Receipt: eyJ0eXBlIjoiYXV0aG9yaXplIiwicGF5bWVudEludGVudElkIjoicGlfMU40WnYzMmVadktZbG8yQ1BoVlBrSmxXIiwiYW1vdW50IjoxMDAwMDAsImN1cnJlbmN5IjoidXNkIiwic3RhdHVzIjoicmVxdWlyZXNfY2FwdHVyZSIsImNhcHR1cmVCZWZvcmUiOiIyMDI1LTAxLTIyVDEyOjAwOjAwWiJ9
Content-Type: application/json

{
  "status": "authorized",
  "message": "Payment authorized. You may proceed with compute tasks."
}
~~~

Decoded receipt:
~~~ json
{
  "type": "authorize",
  "paymentIntentId": "pi_1N4Zv32eZvKYlo2CPhVPkJlW",
  "amount": "100000",
  "currency": "usd",
  "status": "requires_capture",
  "captureBefore": "2025-01-22T12:00:00Z"
}
~~~

**Step 5: Server captures funds later**

After the compute tasks complete, the server captures the actual amount used:

~~~ javascript
// Authorized: $1000.00, Actual usage: $423.50
const capture = await stripe.paymentIntents.capture(
  'pi_1N4Zv32eZvKYlo2CPhVPkJlW',
  { amount_to_capture: 42350 }
);
~~~

# Acknowledgements

TBD
