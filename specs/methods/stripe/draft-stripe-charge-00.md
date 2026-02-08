---
title: Stripe charge Intent for HTTP Payment Authentication
abbrev: Stripe Charge
docname: draft-stripe-charge-00
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

This document defines the "charge" intent for the Stripe payment method
within the Payment HTTP Authentication Scheme {{I-D.httpauth-payment}}.
It specifies how clients and servers exchange one-time payments using
Stripe Payment Tokens (SPTs).

--- middle

# Introduction

This specification defines the "charge" intent for use with the Stripe
payment method in the Payment HTTP Authentication Scheme
{{I-D.httpauth-payment}}. The charge intent enables one-time payments
where the server processes the payment immediately upon receiving a
Stripe Payment Token (SPT).

Stripe provides payment processing through SPTs, which are single-use
tokens that represent payment authorization. SPTs abstract away the
complexity of payment method details (cards, bank accounts, wallets)
and provide a unified interface for payment acceptance.

## Stripe Charge Flow

The following diagram illustrates the Stripe charge payment flow:

~~~
   Client                                            Server
      |                                                 |
      |  (1) GET /resource                              |
      |------------------------------------------------>|
      |                                                 |
      |  (2) 402 Payment Required                       |
      |      WWW-Authenticate: Payment method="stripe", |
      |        intent="charge", request=<base64url>     |
      |<------------------------------------------------|
      |                                                 |
      |  (3) Client creates SPT via Stripe.js or API    |
      |      (may involve 3DS, biometrics, etc.)        |
      |                                                 |
      |  (4) GET /resource                              |
      |      Authorization: Payment <credential>        |
      |------------------------------------------------>|
      |                                                 |
      |  (5) Server creates PaymentIntent or Charge     |
      |      via Stripe API using SPT                   |
      |                                                 |
      |  (6) 200 OK                                     |
      |      Payment-Receipt: <receipt with charge_id>  |
      |<------------------------------------------------|
      |                                                 |
~~~

## Relationship to the Payment Scheme

This document is a payment method intent specification as defined in
Section 9.1 of {{I-D.httpauth-payment}}. It defines the `request` and
`payload` structures for the `charge` intent of the `stripe` payment
method, along with verification and settlement procedures.

# Requirements Language

{::boilerplate bcp14-tagged}

# Terminology

Stripe Payment Token (SPT)
: A single-use token (prefixed with `spt_`) that represents authorization
  to charge a payment method. SPTs are created by clients using Stripe.js
  or the Stripe API and consumed by servers to process payments.

Business Network
: A Stripe-managed network of connected accounts that can transact with
  each other. Business Networks enable payments between merchants and
  their suppliers, partners, or service providers.

Connected Account
: A Stripe account connected to a platform account, enabling the platform
  to process payments on behalf of the connected account.

Payment Intent
: A Stripe API object that tracks the lifecycle of a customer payment,
  from creation through settlement. Not to be confused with the HTTP
  Payment Auth protocol's "payment intent" parameter.

# Intent Identifier

This specification defines the following intent for the `stripe` payment
method:

~~~
charge
~~~

The intent identifier is case-sensitive and MUST be lowercase.

# Intent: "charge"

A one-time payment of the specified amount. The server processes the
payment immediately upon receiving the SPT.

**Fulfillment mechanism:**

1. **Stripe Payment Token (SPT)**: The payer creates an SPT using Stripe.js
   or the Stripe API, which the server uses to create a Charge or
   PaymentIntent via the Stripe API.

# Request Schema

The `request` parameter in the `WWW-Authenticate` challenge contains a
base64url-encoded JSON object with the following fields:

## Shared Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `amount` | string | REQUIRED | Amount in smallest currency unit (e.g., cents) |
| `currency` | string | REQUIRED | Three-letter ISO currency code (e.g., `"usd"`) |
| `description` | string | OPTIONAL | Human-readable payment description |
| `externalId` | string | OPTIONAL | Merchant's identifier (e.g., order ID, cart ID) |

## Method Details

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `methodDetails.destination` | string | OPTIONAL | Stripe account ID to receive funds (Connect) |
| `methodDetails.businessNetwork` | string | OPTIONAL | Business Network ID for B2B payments |
| `methodDetails.metadata` | object | OPTIONAL | Key-value pairs for additional context |

**Example:**

~~~ json
{
  "amount": "5000",
  "currency": "usd",
  "description": "Premium API access for 1 month",
  "externalId": "order_12345",
  "methodDetails": {
    "businessNetwork": "bn_1MqDcVKA5fEO2tZvKQm9g8Yj",
    "destination": "acct_1MqE1vKB6gFP3uYw"
  }
}
~~~

The client fulfills this by creating an SPT using Stripe.js:

~~~ javascript
const spt = await stripe.createPaymentToken({
  amount: '5000',
  currency: 'usd'
});
// Returns: { id: 'spt_1N...' }
~~~

# Credential Schema

The `payload` field in the Payment credential contains a base64url-encoded
JSON object with the following fields:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `spt` | string | REQUIRED | Stripe Payment Token ID (starts with `spt_`) |
| `externalId` | string | OPTIONAL | Client's reference ID |

**Example:**

~~~ json
{
  "spt": "spt_1N4Zv32eZvKYlo2CPhVPkJlW",
  "externalId": "client_order_789"
}
~~~

# Verification Procedure {#charge-verification}

Servers MUST verify Payment credentials for charge intent:

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

# Settlement Procedure {#charge-settlement}

**Synchronous settlement:**

1. Server receives and verifies the credential ({{charge-verification}})
2. Server creates a Stripe PaymentIntent or Charge:

~~~ javascript
const paymentIntent = await stripe.paymentIntents.create({
  amount: request.amount,
  currency: request.currency,
  payment_method_data: {
    type: 'card',
    token: credential.spt
  },
  confirm: true,
  description: request.description,
  metadata: {
    challenge_id: challenge.id,
    external_id: request.externalId
  }
});
~~~

3. If successful, server returns 200 with `Payment-Receipt` header
4. If failed, server returns 402 with new challenge

**Settlement timing:**

Stripe processes payments asynchronously. Card payments typically settle
within seconds, but bank transfers may take several business days. Servers
SHOULD return 200 immediately after API confirmation, even if final
settlement is pending.

## Business Network Settlement

When `businessNetwork` is specified, payments flow through Stripe's
Business Network infrastructure:

~~~ javascript
const paymentIntent = await stripe.paymentIntents.create({
  amount: request.amount,
  currency: request.currency,
  payment_method_data: {
    type: 'card',
    token: credential.spt
  },
  confirm: true,
  transfer_data: {
    destination: request.destination
  },
  metadata: {
    business_network: request.businessNetwork,
    challenge_id: challenge.id
  }
});
~~~

Business Networks enable:

- Automatic routing between network participants
- Consolidated reporting and reconciliation
- Network-specific terms and pricing

# Security Considerations

## SPT Single-Use Constraint

SPTs are single-use tokens. Servers MUST track used SPTs and reject
replayed tokens. Stripe automatically prevents SPT reuse at the API level,
but servers SHOULD implement their own replay protection by storing
challenge IDs and verifying they haven't been previously fulfilled.

## Amount Verification

Clients MUST verify the payment amount in the challenge matches their
expectation before creating an SPT. The SPT itself does not encode the
amount, so clients must trust the challenge parameters.

**Verification checklist:**

1. Verify the `amount` matches the expected cost
2. Verify the `currency` matches the expected currency
3. Verify the `description` matches the expected service
4. Verify the challenge hasn't expired
5. Verify the server's identity (TLS certificate validation)

## Business Network Authorization

When using Business Networks, clients SHOULD verify:

- The `businessNetwork` ID is expected
- The `destination` account (if specified) is authorized to receive payment
- The payment terms are acceptable

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
Stripe PaymentIntent ID or Charge ID.

## HTTPS Requirement

All communication MUST use TLS 1.2 or higher. Stripe Payment Tokens MUST
only be transmitted over HTTPS connections.

# IANA Considerations

## Payment Intent Registration

This specification registers the "charge" intent for the "stripe" payment
method in the Payment Intent Registry per Section 12.4 of
{{I-D.httpauth-payment}}:

- **Intent**: charge
- **Method**: stripe
- **Specification**: [this document]

--- back

# ABNF Collected

~~~ abnf
stripe-charge-challenge = "Payment" 1*SP
  "id=" quoted-string ","
  "realm=" quoted-string ","
  "method=" DQUOTE "stripe" DQUOTE ","
  "intent=" DQUOTE "charge" DQUOTE ","
  "request=" base64url

stripe-charge-credential = "Payment" 1*SP base64url
~~~

# Examples

## Charge Example (HTTP Transport)

**Step 1: Client requests resource**

~~~ http
GET /api/generate HTTP/1.1
Host: api.example.com
~~~

**Step 2: Server issues payment challenge**

~~~ http
HTTP/1.1 402 Payment Required
WWW-Authenticate: Payment id="ch_1a2b3c4d5e",
  realm="api.example.com",
  method="stripe",
  intent="charge",
  request="eyJhbW91bnQiOiI1MDAwIiwiY3VycmVuY3kiOiJ1c2QiLCJkZXNjcmlwdGlvbiI6IkFJIGdlbmVyYXRpb24ifQ"
Cache-Control: no-store
Content-Type: application/problem+json

{
  "type": "https://paymentauth.org/problems/payment-required",
  "title": "Payment Required",
  "status": 402,
  "detail": "This resource requires payment"
}
~~~

Decoded request:
~~~ json
{
  "amount": "5000",
  "currency": "usd",
  "description": "AI generation"
}
~~~

**Step 3: Client creates SPT and submits credential**

~~~ http
GET /api/generate HTTP/1.1
Host: api.example.com
Authorization: Payment eyJpZCI6ImNoXzFhMmIzYzRkNWUiLCJwYXlsb2FkIjoiZXlKemNIUWlPaUp6Y0hSZk1VNDBXBLJ9

~~~

Decoded credential:
~~~ json
{
  "challenge": {
    "id": "ch_1a2b3c4d5e",
    "realm": "api.example.com",
    "method": "stripe",
    "intent": "charge",
    "request": "eyJhbW91bnQiOiI1MDAwIiwiY3VycmVuY3kiOiJ1c2QiLCJkZXNjcmlwdGlvbiI6IkFJIGdlbmVyYXRpb24ifQ",
    "expires": "2025-01-15T12:05:00Z"
  },
  "payload": {
    "spt": "spt_1N4Zv32eZvKYlo2CPhVPkJlW"
  }
}
~~~

**Step 4: Server processes payment and returns resource**

~~~ http
HTTP/1.1 200 OK
Payment-Receipt: eyJ0eXBlIjoiY2hhcmdlIiwiY2hhcmdlSWQiOiJjaF8xTjRadjMyZVp2S1lsbzJDUGhWUGtKbFciLCJhbW91bnQiOjUwMDAsImN1cnJlbmN5IjoidXNkIiwic3RhdHVzIjoic3VjY2VlZGVkIn0
Content-Type: text/plain

Here is your generated content...
~~~

Decoded receipt:
~~~ json
{
  "type": "charge",
  "chargeId": "ch_1N4Zv32eZvKYlo2CPhVPkJlW",
  "amount": "5000",
  "currency": "usd",
  "status": "succeeded"
}
~~~

## Business Network Example

**Payment challenge:**

~~~ http
HTTP/1.1 402 Payment Required
WWW-Authenticate: Payment id="ch_b2b_payment",
  realm="supplier.example.com",
  method="stripe",
  intent="charge",
  request="eyJhbW91bnQiOiIyNTAwMDAiLCJjdXJyZW5jeSI6InVzZCIsImJ1c2luZXNzTmV0d29yayI6ImJuXzFNcURjVktBNWZFTzJ0WnZLUW05ZzhZaiIsImRlc2NyaXB0aW9uIjoiU3VwcGxpZXIgcGF5bWVudCBmb3Igb3JkZXIgIzEyMzQiLCJkZXN0aW5hdGlvbiI6ImFjY3RfMU1xRTF2S0I2Z0ZQM3VZdyJ9"
~~~

Decoded request:
~~~ json
{
  "amount": "250000",
  "currency": "usd",
  "businessNetwork": "bn_1MqDcVKA5fEO2tZvKQm9g8Yj",
  "description": "Supplier payment for order #1234",
  "destination": "acct_1MqE1vKB6gFP3uYw"
}
~~~

This payment will flow through the specified Business Network, enabling
automatic reconciliation and network-specific terms.

# Acknowledgements

TBD
