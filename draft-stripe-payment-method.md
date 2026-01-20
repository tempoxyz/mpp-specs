---
title: Stripe Payment Method for HTTP Payment Authentication
docName: draft-stripe-payment-method-00
category: std
ipr: trust200902
submissionType: IETF
consensus: true

author:
  - fullname: Brendan Ryan
    email: brendanryan@stripe.com
    organization: Stripe
---

## Abstract

This document defines the "stripe" payment method for use with the Payment
HTTP Authentication Scheme [I-D.ietf-httpauth-payment]. It specifies how
clients and servers exchange payments using Stripe's payment infrastructure,
supporting one-time charges, payment authorizations, and recurring subscriptions
through Stripe Payment Tokens (SPTs).

## Status of This Memo

This Internet-Draft is submitted in full conformance with the provisions
of BCP 78 and BCP 79.

## Copyright Notice

Copyright (c) 2026 IETF Trust and the persons identified as the document
authors. All rights reserved.

## Table of Contents

1. [Introduction](#1-introduction)
2. [Requirements Language](#2-requirements-language)
3. [Terminology](#3-terminology)
4. [Method Identifier](#4-method-identifier)
5. [Payment Intents](#5-payment-intents)
6. [Request Schema](#6-request-schema)
7. [Credential Schema](#7-credential-schema)
8. [Verification Procedure](#8-verification-procedure)
9. [Settlement Procedure](#9-settlement-procedure)
10. [Internationalization Considerations](#10-internationalization-considerations)
11. [Security Considerations](#11-security-considerations)
12. [IANA Considerations](#12-iana-considerations)
13. [References](#13-references)
14. [Appendix A: ABNF Collected](#appendix-a-abnf-collected)
15. [Appendix B: Examples](#appendix-b-examples)
16. [Acknowledgements](#acknowledgements)
17. [Authors' Addresses](#authors-addresses)

---

## 1. Introduction

Stripe is a technology company that builds economic infrastructure for the
internet. This specification defines how Stripe's payment infrastructure
integrates with the Payment HTTP Authentication Scheme
[I-D.ietf-httpauth-payment].

Stripe provides payment processing through Stripe Payment Tokens (SPTs),
which are single-use tokens that represent payment authorization. SPTs
abstract away the complexity of payment method details (cards, bank accounts,
wallets) and provide a unified interface for payment acceptance.

This specification supports three payment intents:

- **charge**: One-time payment via Stripe Payment Token
- **authorize**: Payment authorization for future capture
- **subscription**: Recurring payment authorization

### 1.1. Stripe Payment Flow

The following diagram illustrates the Stripe-specific payment flow:

```
   Client                                            Server
      │                                                 │
      │  (1) GET /resource                              │
      ├────────────────────────────────────────────────>│
      │                                                 │
      │  (2) 402 Payment Required                       │
      │      WWW-Authenticate: Payment method="stripe", │
      │        intent="charge", request=<base64url>     │
      │<────────────────────────────────────────────────┤
      │                                                 │
      │  (3) Client creates SPT via Stripe.js or API    │
      │      (may involve 3DS, biometrics, etc.)        │
      │                                                 │
      │  (4) GET /resource                              │
      │      Authorization: Payment <credential>        │
      ├────────────────────────────────────────────────>│
      │                                                 │
      │  (5) Server processes payment via Stripe API    │
      │      (PaymentIntent, Charge, or Subscription)   │
      │                                                 │
      │  (6) 200 OK                                     │
      │      Payment-Receipt: <receipt with charge_id>  │
      │<────────────────────────────────────────────────┤
      │                                                 │
```

### 1.2. Relationship to the Payment Scheme

This document is a payment method specification as defined in Section 10.1
of [I-D.ietf-httpauth-payment]. It defines the `request` and `payload`
structures for the `stripe` payment method, along with verification and
settlement procedures.

---

## 2. Requirements Language

The key words "MUST", "MUST NOT", "REQUIRED", "SHALL", "SHALL NOT",
"SHOULD", "SHOULD NOT", "RECOMMENDED", "NOT RECOMMENDED", "MAY", and
"OPTIONAL" in this document are to be interpreted as described in
BCP 14 [RFC2119] [RFC8174] when, and only when, they appear in all
capitals, as shown here.

---

## 3. Terminology

**Stripe Payment Token (SPT)**
: A single-use token (prefixed with `spt_`) that represents authorization
  to charge a payment method. SPTs are created by clients using Stripe.js
  or the Stripe API and consumed by servers to process payments.

**Business Network**
: A Stripe-managed network of connected accounts that can transact with
  each other. Business Networks enable payments between merchants and
  their suppliers, partners, or service providers.

**Connected Account**
: A Stripe account connected to a platform account, enabling the platform
  to process payments on behalf of the connected account.

**Payment Intent**
: A Stripe API object that tracks the lifecycle of a customer payment,
  from creation through settlement. Not to be confused with the HTTP
  Payment Auth protocol's "payment intent" parameter.

**Setup Intent**
: A Stripe API object that represents an intent to collect payment method
  details for future use, without creating an immediate charge.

---

## 4. Method Identifier

This specification registers the following payment method identifier:

```
stripe
```

The identifier is case-sensitive and MUST be lowercase. No sub-methods
are defined by this specification.

---

## 5. Payment Intents

This specification defines three payment intents for use with the `stripe`
payment method. These intents are registered in the Payment Intent Registry
per Section 13.4 of [I-D.ietf-httpauth-payment].

### 5.1. Intent: "charge"

A one-time payment of the specified amount. The server may process the
payment immediately upon receiving the SPT.

**Fulfillment mechanism:**

1. **Stripe Payment Token (SPT)**: The payer creates an SPT using Stripe.js
   or the Stripe API, which the server uses to create a Charge or
   PaymentIntent via the Stripe API.

### 5.2. Intent: "authorize"

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

### 5.3. Intent: "subscription"

A recurring payment authorization. The payer grants the server permission
to charge a specified amount on a recurring basis.

**Required parameters:**

- Period duration (day, week, month, year)
- Amount per period
- Optional: Expiry timestamp or number of billing cycles

**Fulfillment mechanism:**

1. **Stripe Setup Intent**: The payer completes a SetupIntent, providing
   a payment method that can be charged on a recurring basis. The server
   creates a Stripe Subscription that automatically charges the payment
   method according to the specified schedule.

---

## 6. Request Schema

The `request` parameter in the `WWW-Authenticate` challenge contains a
base64url-encoded JSON object. The schema is determined by the `intent`
parameter in the challenge. Clients parse the request and construct the
appropriate Stripe Payment Token or Setup Intent to fulfill it.

### 6.1. Charge Request

For `intent="charge"`, the request specifies a one-time payment:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `amount` | number | REQUIRED | Amount in smallest currency unit (e.g., cents) |
| `currency` | string | REQUIRED | Three-letter ISO currency code (e.g., "usd") |
| `description` | string | OPTIONAL | Human-readable payment description |
| `destination` | string | OPTIONAL | Stripe account ID to receive funds (for Connect platforms) |
| `businessNetwork` | string | OPTIONAL | Business Network ID for B2B payments |
| `externalId` | string | OPTIONAL | Merchant's identifier (e.g., order ID, cart ID) |
| `metadata` | object | OPTIONAL | Key-value pairs for additional context |

**Example:**

```json
{
  "amount": 5000,
  "currency": "usd",
  "description": "Premium API access for 1 month",
  "businessNetwork": "bn_1MqDcVKA5fEO2tZvKQm9g8Yj",
  "externalId": "order_12345"
}
```

The client fulfills this by creating an SPT using Stripe.js:

```javascript
const spt = await stripe.createPaymentToken({
  amount: 5000,
  currency: 'usd'
});
// Returns: { id: 'spt_1N...' }
```

### 6.2. Authorize Request

For `intent="authorize"`, the request specifies a payment authorization:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `amount` | number | REQUIRED | Maximum authorization amount in smallest currency unit |
| `currency` | string | REQUIRED | Three-letter ISO currency code |
| `description` | string | OPTIONAL | Human-readable payment description |
| `destination` | string | OPTIONAL | Stripe account ID to receive funds |
| `businessNetwork` | string | OPTIONAL | Business Network ID for B2B payments |
| `externalId` | string | OPTIONAL | Merchant's identifier |
| `expiresAt` | string | OPTIONAL | Authorization expiry in ISO 8601 format |
| `metadata` | object | OPTIONAL | Key-value pairs for additional context |

**Example:**

```json
{
  "amount": 100000,
  "currency": "usd",
  "description": "AI agent compute authorization",
  "businessNetwork": "bn_1MqDcVKA5fEO2tZvKQm9g8Yj",
  "expiresAt": "2025-02-05T12:00:00Z"
}
```

The client fulfills this by creating an SPT that the server will use with
`capture_method=manual`:

```javascript
const spt = await stripe.createPaymentToken({
  amount: 100000,
  currency: 'usd'
});
```

### 6.3. Subscription Request

For `intent="subscription"`, the request specifies a recurring payment:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `amount` | number | REQUIRED | Amount per billing period in smallest currency unit |
| `currency` | string | REQUIRED | Three-letter ISO currency code |
| `interval` | string | REQUIRED | Billing interval: "day", "week", "month", or "year" |
| `intervalCount` | number | OPTIONAL | Number of intervals between billings (default: 1) |
| `description` | string | OPTIONAL | Human-readable subscription description |
| `destination` | string | OPTIONAL | Stripe account ID to receive funds |
| `businessNetwork` | string | OPTIONAL | Business Network ID for B2B payments |
| `externalId` | string | OPTIONAL | Merchant's identifier |
| `billingCycles` | number | OPTIONAL | Number of billing cycles before subscription ends |
| `metadata` | object | OPTIONAL | Key-value pairs for additional context |

**Example:**

```json
{
  "amount": 9900,
  "currency": "usd",
  "interval": "month",
  "description": "Premium API subscription",
  "businessNetwork": "bn_1MqDcVKA5fEO2tZvKQm9g8Yj"
}
```

The client fulfills this by creating a Setup Intent:

```javascript
const setupIntent = await stripe.confirmSetup({
  elements,
  confirmParams: {
    return_url: 'https://example.com/setup-complete'
  }
});
// Returns setup_intent_id that client includes in credential
```

---

## 7. Credential Schema

The `payload` field in the Payment credential contains a base64url-encoded
JSON object with Stripe-specific payment authorization data.

### 7.1. Charge Credential

For `intent="charge"`, the credential contains an SPT:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `spt` | string | REQUIRED | Stripe Payment Token ID (starts with `spt_`) |
| `externalId` | string | OPTIONAL | Client's reference ID |

**Example:**

```json
{
  "spt": "spt_1N4Zv32eZvKYlo2CPhVPkJlW",
  "externalId": "client_order_789"
}
```

### 7.2. Authorize Credential

For `intent="authorize"`, the credential contains an SPT:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `spt` | string | REQUIRED | Stripe Payment Token ID |
| `externalId` | string | OPTIONAL | Client's reference ID |

**Example:**

```json
{
  "spt": "spt_1N4Zv32eZvKYlo2CPhVPkJlW"
}
```

### 7.3. Subscription Credential

For `intent="subscription"`, the credential contains a Setup Intent ID:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `setupIntentId` | string | REQUIRED | Stripe Setup Intent ID (starts with `seti_`) |
| `paymentMethodId` | string | REQUIRED | Stripe Payment Method ID (starts with `pm_`) |
| `externalId` | string | OPTIONAL | Client's reference ID |

**Example:**

```json
{
  "setupIntentId": "seti_1N4Zv32eZvKYlo2CPhVPkJlW",
  "paymentMethodId": "pm_1N4Zv32eZvKYlo2CaBcDefGh",
  "externalId": "client_sub_456"
}
```

---

## 8. Verification Procedure

Servers MUST verify Payment credentials according to the intent:

### 8.1. Charge Verification

1. Extract the `spt` from the credential payload
2. Verify the challenge ID matches the one issued
3. Verify the challenge has not expired
4. Verify the SPT has not been previously used (replay protection)
5. Validate the SPT exists and is valid via Stripe API (optional pre-check)

### 8.2. Authorize Verification

Same as charge verification (Section 8.1).

### 8.3. Subscription Verification

1. Extract the `setupIntentId` and `paymentMethodId` from the credential
2. Verify the challenge ID matches
3. Verify the challenge has not expired
4. Retrieve the Setup Intent via Stripe API
5. Verify the Setup Intent status is `succeeded`
6. Verify the payment method is attached and valid

### 8.4. Challenge Binding

Servers MUST verify that the credential corresponds to the exact challenge
issued. This includes validating:

- Challenge ID
- Amount (if specified in request)
- Currency
- Business Network (if specified)
- Any custom metadata

---

## 9. Settlement Procedure

### 9.1. Charge Settlement

**Synchronous settlement:**

1. Server receives and verifies the credential (Section 8.1)
2. Server creates a Stripe PaymentIntent or Charge:

```javascript
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
```

3. If successful, server returns 200 with `Payment-Receipt` header
4. If failed, server returns 401 with new challenge

**Settlement timing:**

Stripe processes payments asynchronously. Card payments typically settle
within seconds, but bank transfers may take several business days. Servers
SHOULD return 200 immediately after API confirmation, even if final
settlement is pending.

### 9.2. Authorize Settlement

**Deferred settlement:**

1. Server receives and verifies the credential (Section 8.2)
2. Server creates a PaymentIntent with `capture_method=manual`:

```javascript
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
```

3. Server stores the PaymentIntent ID for later capture
4. Server returns 200 with `Payment-Receipt` containing authorization details
5. Server may capture funds later:

```javascript
const capture = await stripe.paymentIntents.capture(
  paymentIntent.id,
  { amount_to_capture: actualAmount }
);
```

**Authorization window:**

- Cards: 7 days
- Other payment methods: varies by payment method

### 9.3. Subscription Settlement

**Recurring settlement:**

1. Server receives and verifies the credential (Section 8.3)
2. Server creates a Stripe Subscription:

```javascript
const subscription = await stripe.subscriptions.create({
  customer: customerId,
  items: [{
    price_data: {
      currency: request.currency,
      product: productId,
      recurring: {
        interval: request.interval,
        interval_count: request.intervalCount || 1
      },
      unit_amount: request.amount
    }
  }],
  default_payment_method: credential.paymentMethodId,
  metadata: {
    challenge_id: challenge.id,
    external_id: request.externalId
  }
});
```

3. Server returns 200 with `Payment-Receipt` containing subscription ID
4. Stripe automatically charges the payment method on each billing cycle

**Subscription lifecycle:**

Servers MUST handle subscription events via webhooks:
- `invoice.payment_succeeded`: Billing cycle completed successfully
- `invoice.payment_failed`: Billing cycle payment failed
- `customer.subscription.deleted`: Subscription cancelled

### 9.4. Business Network Settlement

When `businessNetwork` is specified, payments flow through Stripe's
Business Network infrastructure:

```javascript
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
```

Business Networks enable:
- Automatic routing between network participants
- Consolidated reporting and reconciliation
- Network-specific terms and pricing

---

## 10. Internationalization Considerations

### 10.1. Currency Support

Stripe supports 135+ currencies. Servers MUST specify currency using
three-letter ISO 4217 codes (e.g., "usd", "eur", "jpy").

### 10.2. Payment Method Localization

SPTs abstract payment method details, but servers SHOULD consider:
- Regional payment method preferences (e.g., SEPA in Europe, ACH in US)
- Currency conversion for cross-border payments
- Local regulatory requirements

### 10.3. Description Localization

The `description` field SHOULD be localized to the customer's language
when possible. Clients MAY include an `Accept-Language` header to indicate
language preference.

---

## 11. Security Considerations

### 11.1. SPT Single-Use Constraint

SPTs are single-use tokens. Servers MUST track used SPTs and reject
replayed tokens. Stripe automatically prevents SPT reuse at the API level,
but servers SHOULD implement their own replay protection by storing
challenge IDs and verifying they haven't been previously fulfilled.

### 11.2. Amount Verification

Clients MUST verify the payment amount in the challenge matches their
expectation before creating an SPT. The SPT itself does not encode the
amount, so clients must trust the challenge parameters.

**Verification checklist:**

1. Verify the `amount` matches the expected cost
2. Verify the `currency` matches the expected currency
3. Verify the `description` matches the expected service
4. Verify the challenge hasn't expired
5. Verify the server's identity (TLS certificate validation)

### 11.3. Business Network Authorization

When using Business Networks, clients SHOULD verify:
- The `businessNetwork` ID is expected
- The `destination` account (if specified) is authorized to receive payment
- The payment terms are acceptable

### 11.4. PCI DSS Compliance

Stripe's SPT model ensures clients never handle raw payment method details,
significantly reducing PCI DSS compliance scope. Servers using this
specification inherit Stripe's PCI Level 1 certification.

### 11.5. 3D Secure and Strong Customer Authentication

Stripe.js automatically handles 3D Secure challenges when required by
the customer's bank or EU Strong Customer Authentication regulations.
Clients MUST use Stripe.js or equivalent SDKs that support challenge flows.

### 11.6. Credential Storage

Clients MUST NOT log or persist SPTs. SPTs are bearer tokens that grant
payment authorization.

Servers MUST NOT store SPTs after processing. Instead, store the resulting
Stripe PaymentIntent ID, Charge ID, or Subscription ID.

### 11.7. HTTPS Requirement

All communication MUST use TLS 1.2 or higher. Stripe Payment Tokens MUST
only be transmitted over HTTPS connections.

---

## 12. IANA Considerations

### 12.1. Payment Method Registration

This specification registers the "stripe" payment method in the Payment
Method Registry per Section 13.2 of [I-D.ietf-httpauth-payment]:

- **Method ID**: stripe
- **Specification**: [this document]
- **Intents**: charge, authorize, subscription

### 12.2. Business Network Registry

This specification requests creation of a "Stripe Business Network"
registry for tracking registered Business Network IDs. Registration
policy: First Come First Served.

---

## 13. References

### 13.1. Normative References

**[RFC2119]**
: Bradner, S., "Key words for use in RFCs to Indicate Requirement Levels",
  BCP 14, RFC 2119, March 1997.

**[RFC8174]**
: Leiba, B., "Ambiguity of Uppercase vs Lowercase in RFC 2119 Key Words",
  BCP 14, RFC 8174, May 2017.

**[RFC7235]**
: Fielding, R., Ed. and J. Reschke, Ed., "Hypertext Transfer Protocol
  (HTTP/1.1): Authentication", RFC 7235, June 2014.

**[I-D.ietf-httpauth-payment]**
: Moxey, J., "The 'Payment' HTTP Authentication Scheme",
  draft-ietf-httpauth-payment-01, January 2025.

### 13.2. Informative References

**[STRIPE-API]**
: Stripe, Inc., "Stripe API Reference",
  https://stripe.com/docs/api

---

## Appendix A: ABNF Collected

```abnf
stripe-challenge = "Payment" 1*SP
  "id=" quoted-string ","
  "realm=" quoted-string ","
  "method=" DQUOTE "stripe" DQUOTE ","
  "intent=" intent ","
  "request=" base64url

stripe-credential = "Payment" 1*SP base64url

intent = "charge" / "authorize" / "subscription"
```

---

## Appendix B: Examples

### B.1. Charge Example (HTTP Transport)

**Step 1: Client requests resource**

```http
GET /api/generate HTTP/1.1
Host: api.example.com
```

**Step 2: Server issues payment challenge**

```http
HTTP/1.1 402 Payment Required
WWW-Authenticate: Payment id="ch_1a2b3c4d5e",
  realm="api.example.com",
  method="stripe",
  intent="charge",
  request="eyJhbW91bnQiOjUwMDAsImN1cnJlbmN5IjoidXNkIiwiZGVzY3JpcHRpb24iOiJBSSBnZW5lcmF0aW9uIn0"
Cache-Control: no-store
Content-Type: application/json

{
  "error": "payment_required",
  "message": "This resource requires payment"
}
```

Decoded request:
```json
{
  "amount": 5000,
  "currency": "usd",
  "description": "AI generation"
}
```

**Step 3: Client creates SPT and submits credential**

```http
GET /api/generate HTTP/1.1
Host: api.example.com
Authorization: Payment eyJpZCI6ImNoXzFhMmIzYzRkNWUiLCJwYXlsb2FkIjoiZXlKemNIUWlPaUp6Y0hSZk1VNDBXBLJ9

```

Decoded credential:
```json
{
  "id": "ch_1a2b3c4d5e",
  "payload": "eyJzcHQiOiJzcHRfMU40WnYzMmVadktZbG8yQ1BoVlBrSmxXIn0"
}
```

Decoded payload:
```json
{
  "spt": "spt_1N4Zv32eZvKYlo2CPhVPkJlW"
}
```

**Step 4: Server processes payment and returns resource**

```http
HTTP/1.1 200 OK
Payment-Receipt: eyJ0eXBlIjoiY2hhcmdlIiwiY2hhcmdlSWQiOiJjaF8xTjRadjMyZVp2S1lsbzJDUGhWUGtKbFciLCJhbW91bnQiOjUwMDAsImN1cnJlbmN5IjoidXNkIiwic3RhdHVzIjoic3VjY2VlZGVkIn0
Content-Type: text/plain

Here is your generated content...
```

Decoded receipt:
```json
{
  "type": "charge",
  "chargeId": "ch_1N4Zv32eZvKYlo2CPhVPkJlW",
  "amount": 5000,
  "currency": "usd",
  "status": "succeeded"
}
```

### B.2. Business Network Example

**Payment challenge:**

```http
HTTP/1.1 402 Payment Required
WWW-Authenticate: Payment id="ch_b2b_payment",
  realm="supplier.example.com",
  method="stripe",
  intent="charge",
  request="eyJhbW91bnQiOjI1MDAwMCwiY3VycmVuY3kiOiJ1c2QiLCJidXNpbmVzc05ldHdvcmsiOiJibl8xTXFEY1ZLQTVMRU8ydFp2S1FtOWc4WWoiLCJkZXNjcmlwdGlvbiI6IlN1cHBsaWVyIHBheW1lbnQgZm9yIG9yZGVyICMxMjM0In0"
```

Decoded request:
```json
{
  "amount": 250000,
  "currency": "usd",
  "businessNetwork": "bn_1MqDcVKA5fEO2tZvKQm9g8Yj",
  "description": "Supplier payment for order #1234",
  "destination": "acct_1MqE1vKB6gFP3uYw"
}
```

This payment will flow through the specified Business Network, enabling
automatic reconciliation and network-specific terms.

### B.3. Subscription Example

**Payment challenge:**

```http
HTTP/1.1 402 Payment Required
WWW-Authenticate: Payment id="sub_setup_123",
  realm="saas.example.com",
  method="stripe",
  intent="subscription",
  request="eyJhbW91bnQiOjk5MDAsImN1cnJlbmN5IjoidXNkIiwiaW50ZXJ2YWwiOiJtb250aCIsImRlc2NyaXB0aW9uIjoiUHJlbWl1bSBBUEkgc3Vic2NyaXB0aW9uIn0"
```

Decoded request:
```json
{
  "amount": 9900,
  "currency": "usd",
  "interval": "month",
  "description": "Premium API subscription"
}
```

**Client response with Setup Intent:**

```http
GET /api/subscribe HTTP/1.1
Host: saas.example.com
Authorization: Payment eyJpZCI6InN1Yl9zZXR1cF8xMjMiLCJwYXlsb2FkIjoiZXlKelpYUjFjRWx1ZEdWdWRFbGtJam9pYzJWMGFWOHhUalJhZGpNeVpWcDJTMWxzYnpKRFVHaFdVR3RLYkZjaUxDSndZWGx0Wlc1MFRYV9In0
```

Decoded payload:
```json
{
  "setupIntentId": "seti_1N4Zv32eZvKYlo2CPhVPkJlW",
  "paymentMethodId": "pm_1N4Zv32eZvKYlo2CaBcDefGh"
}
```

---

## Authors' Addresses

Brendan Ryan
Stripe
Email: brendanryan@stripe.com
