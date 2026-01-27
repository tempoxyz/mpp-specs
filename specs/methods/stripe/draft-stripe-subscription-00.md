---
title: Stripe subscription Intent for HTTP Payment Authentication
abbrev: Stripe Subscription
docname: draft-stripe-subscription-00
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

This document defines the "subscription" intent for the Stripe payment
method within the Payment HTTP Authentication Scheme
{{I-D.httpauth-payment}}. It specifies how clients and servers establish
recurring payment authorizations using Stripe Setup Intents.

--- middle

# Introduction

This specification defines the "subscription" intent for use with the
Stripe payment method in the Payment HTTP Authentication Scheme
{{I-D.httpauth-payment}}. The subscription intent enables recurring
payment authorizations where the server can charge a payment method on
a scheduled basis.

Stripe provides recurring payment capabilities through Setup Intents,
which collect and validate payment method details for future use without
creating an immediate charge. The server then creates a Stripe
Subscription that automatically charges the payment method according to
the specified schedule.

## Stripe Subscription Flow

The following diagram illustrates the Stripe subscription payment flow:

~~~
   Client                                            Server
      |                                                 |
      |  (1) GET /api/subscribe                         |
      |------------------------------------------------>|
      |                                                 |
      |  (2) 402 Payment Required                       |
      |      WWW-Authenticate: Payment method="stripe", |
      |        intent="subscription", request=<base64>  |
      |<------------------------------------------------|
      |                                                 |
      |  (3) Client completes Setup Intent via          |
      |      Stripe.js (collects payment method)        |
      |                                                 |
      |  (4) GET /api/subscribe                         |
      |      Authorization: Payment <credential>        |
      |------------------------------------------------>|
      |                                                 |
      |  (5) Server verifies Setup Intent succeeded     |
      |      Creates Stripe Subscription                |
      |                                                 |
      |  (6) 200 OK                                     |
      |      Payment-Receipt: <subscription details>    |
      |<------------------------------------------------|
      |                                                 |
      |     ... recurring billing cycle ...             |
      |                                                 |
      |  (7) Stripe webhook: invoice.payment_succeeded  |
      |                                                 |
~~~

## Relationship to the Payment Scheme

This document is a payment method intent specification as defined in
Section 10.1 of {{I-D.httpauth-payment}}. It defines the `request` and
`payload` structures for the `subscription` intent of the `stripe`
payment method, along with verification and settlement procedures.

# Requirements Language

{::boilerplate bcp14-tagged}

# Terminology

Setup Intent
: A Stripe API object that represents an intent to collect payment method
  details for future use, without creating an immediate charge.

Payment Method
: A Stripe object representing a customer's payment instrument (card,
  bank account, wallet, etc.). Payment Methods are identified by IDs
  prefixed with `pm_`.

Subscription
: A Stripe API object that represents a recurring billing agreement.
  Subscriptions automatically create invoices and charge the customer's
  payment method according to the configured schedule.

Invoice
: A Stripe object representing a billing document for a subscription
  period. Invoices are automatically created by subscriptions and
  trigger payment collection.

Webhook
: A server-to-server HTTP callback that Stripe sends to notify servers
  of events such as successful payments or failed charges.

# Intent Identifier

This specification defines the following intent for the `stripe` payment
method:

~~~
subscription
~~~

The intent identifier is case-sensitive and MUST be lowercase.

# Intent: "subscription"

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

# Request Schema

The `request` parameter in the `WWW-Authenticate` challenge contains a
base64url-encoded JSON object with the following fields:

## Shared Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `amount` | string | REQUIRED | Amount per billing period in smallest currency unit |
| `currency` | string | REQUIRED | Three-letter ISO currency code |
| `period` | string | REQUIRED | Billing period: `"day"`, `"week"`, `"month"`, or `"year"` |
| `cycles` | number | OPTIONAL | Number of billing cycles before subscription ends |
| `description` | string | OPTIONAL | Human-readable subscription description |
| `externalId` | string | OPTIONAL | Merchant's identifier |

## Method Details

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `methodDetails.destination` | string | OPTIONAL | Stripe account ID to receive funds |
| `methodDetails.businessNetwork` | string | OPTIONAL | Business Network ID for B2B payments |
| `methodDetails.intervalCount` | number | OPTIONAL | Number of intervals between billings (default: 1) |
| `methodDetails.trialDays` | number | OPTIONAL | Number of trial days before first charge |
| `methodDetails.metadata` | object | OPTIONAL | Key-value pairs for additional context |

**Example:**

~~~ json
{
  "amount": "9900",
  "currency": "usd",
  "period": "month",
  "description": "Premium API subscription",
  "methodDetails": {
    "businessNetwork": "bn_1MqDcVKA5fEO2tZvKQm9g8Yj",
    "trialDays": 14
  }
}
~~~

The client fulfills this by completing a Setup Intent:

~~~ javascript
const setupIntent = await stripe.confirmSetup({
  elements,
  confirmParams: {
    return_url: 'https://example.com/setup-complete'
  }
});
// Returns setup_intent_id that client includes in credential
~~~

# Credential Schema

The `payload` field in the Payment credential contains a base64url-encoded
JSON object with the following fields:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `setupIntentId` | string | REQUIRED | Stripe Setup Intent ID (starts with `seti_`) |
| `paymentMethodId` | string | REQUIRED | Stripe Payment Method ID (starts with `pm_`) |
| `externalId` | string | OPTIONAL | Client's reference ID |

**Example:**

~~~ json
{
  "setupIntentId": "seti_1N4Zv32eZvKYlo2CPhVPkJlW",
  "paymentMethodId": "pm_1N4Zv32eZvKYlo2CaBcDefGh",
  "externalId": "client_sub_456"
}
~~~

# Verification Procedure {#subscription-verification}

Servers MUST verify Payment credentials for subscription intent:

1. Extract the `setupIntentId` and `paymentMethodId` from the credential
2. Verify the challenge ID matches
3. Verify the challenge has not expired
4. Retrieve the Setup Intent via Stripe API
5. Verify the Setup Intent status is `succeeded`
6. Verify the payment method is attached and valid

## Challenge Binding

Servers MUST verify that the credential corresponds to the exact challenge
issued. This includes validating:

- Challenge ID
- Amount (if specified in request)
- Currency
- Period
- Business Network (if specified)
- Any custom metadata

# Settlement Procedure {#subscription-settlement}

## Creating the Subscription

**Recurring settlement:**

1. Server receives and verifies the credential ({{subscription-verification}})
2. Server creates a Stripe Subscription:

~~~ javascript
const subscription = await stripe.subscriptions.create({
  customer: customerId,
  items: [{
    price_data: {
      currency: request.currency,
      product: productId,
      recurring: {
        interval: request.period,
        interval_count: request.methodDetails?.intervalCount || 1
      },
      unit_amount: parseInt(request.amount)
    }
  }],
  default_payment_method: credential.paymentMethodId,
  trial_period_days: request.methodDetails?.trialDays,
  metadata: {
    challenge_id: challenge.id,
    external_id: request.externalId
  }
});
~~~

3. Server returns 200 with `Payment-Receipt` containing subscription ID
4. Stripe automatically charges the payment method on each billing cycle

## Webhook Handling

Servers MUST handle subscription lifecycle events via webhooks.

### Required Webhook Events

Servers MUST implement handlers for the following webhook events:

**invoice.payment_succeeded**

Triggered when a subscription invoice is successfully paid:

~~~ javascript
app.post('/webhooks/stripe', async (req, res) => {
  const event = stripe.webhooks.constructEvent(
    req.body,
    req.headers['stripe-signature'],
    webhookSecret
  );
  
  if (event.type === 'invoice.payment_succeeded') {
    const invoice = event.data.object;
    const subscriptionId = invoice.subscription;
    
    // Grant access for the new billing period
    await grantSubscriptionAccess(subscriptionId, invoice.period_end);
  }
  
  res.json({ received: true });
});
~~~

**invoice.payment_failed**

Triggered when a subscription payment fails:

~~~ javascript
if (event.type === 'invoice.payment_failed') {
  const invoice = event.data.object;
  const subscriptionId = invoice.subscription;
  
  // Notify customer of payment failure
  await notifyPaymentFailure(subscriptionId, invoice);
  
  // Optionally revoke or limit access
  if (invoice.next_payment_attempt === null) {
    await revokeSubscriptionAccess(subscriptionId);
  }
}
~~~

**customer.subscription.deleted**

Triggered when a subscription is cancelled:

~~~ javascript
if (event.type === 'customer.subscription.deleted') {
  const subscription = event.data.object;
  
  // Revoke access
  await revokeSubscriptionAccess(subscription.id);
  
  // Clean up subscription data
  await cleanupSubscription(subscription.id);
}
~~~

### Additional Webhook Events

Servers SHOULD also handle:

- `customer.subscription.updated`: Subscription plan or status changed
- `customer.subscription.trial_will_end`: Trial period ending soon
- `invoice.upcoming`: Next invoice will be generated soon
- `invoice.finalized`: Invoice is ready for payment

## Subscription Management

### Cancellation

Clients may request subscription cancellation. Servers SHOULD provide
an endpoint to cancel subscriptions:

~~~ javascript
const cancelledSubscription = await stripe.subscriptions.cancel(
  subscriptionId
);
~~~

Or cancel at period end:

~~~ javascript
const subscription = await stripe.subscriptions.update(
  subscriptionId,
  { cancel_at_period_end: true }
);
~~~

### Upgrading/Downgrading

Servers MAY allow subscription changes by updating the subscription:

~~~ javascript
const updatedSubscription = await stripe.subscriptions.update(
  subscriptionId,
  {
    items: [{
      id: subscriptionItemId,
      price: newPriceId
    }],
    proration_behavior: 'create_prorations'
  }
);
~~~

# Security Considerations

## Setup Intent Validation

Servers MUST validate that the Setup Intent has succeeded before creating
a subscription. A Setup Intent in any other status (e.g., `requires_action`,
`requires_payment_method`) indicates the payment method is not ready for
recurring charges.

## Payment Method Ownership

Servers SHOULD verify the payment method belongs to the expected customer
before creating a subscription. This prevents attackers from using stolen
payment method IDs.

## Webhook Security

Servers MUST verify webhook signatures to ensure events originate from
Stripe:

~~~ javascript
const event = stripe.webhooks.constructEvent(
  req.body,
  req.headers['stripe-signature'],
  process.env.STRIPE_WEBHOOK_SECRET
);
~~~

Servers MUST NOT trust webhook payloads without signature verification.

## Subscription Fraud Prevention

Servers SHOULD implement fraud prevention measures:

1. Rate limit subscription creation per customer
2. Verify customer identity before creating high-value subscriptions
3. Monitor for unusual subscription patterns
4. Implement proper refund policies

## PCI DSS Compliance

Stripe's Setup Intent flow ensures clients never handle raw payment
method details, significantly reducing PCI DSS compliance scope. Servers
using this specification inherit Stripe's PCI Level 1 certification.

## 3D Secure and Strong Customer Authentication

Stripe.js automatically handles 3D Secure challenges when required by
the customer's bank or EU Strong Customer Authentication regulations.
Clients MUST use Stripe.js or equivalent SDKs that support challenge flows.

## Credential Storage

Clients MUST NOT log or persist Setup Intent IDs after submission.

Servers MUST store only the resulting Subscription ID and Payment Method
ID for ongoing subscription management.

## HTTPS Requirement

All communication MUST use TLS 1.2 or higher. Webhook endpoints MUST
use HTTPS.

# IANA Considerations

## Payment Intent Registration

This specification registers the "subscription" intent for the "stripe"
payment method in the Payment Intent Registry per Section 13.4 of
{{I-D.httpauth-payment}}:

- **Intent**: subscription
- **Method**: stripe
- **Specification**: [this document]

--- back

# ABNF Collected

~~~ abnf
stripe-subscription-challenge = "Payment" 1*SP
  "id=" quoted-string ","
  "realm=" quoted-string ","
  "method=" DQUOTE "stripe" DQUOTE ","
  "intent=" DQUOTE "subscription" DQUOTE ","
  "request=" base64url

stripe-subscription-credential = "Payment" 1*SP base64url
~~~

# Examples

## Subscription Example (HTTP Transport)

**Step 1: Client requests subscription**

~~~ http
GET /api/subscribe HTTP/1.1
Host: saas.example.com
~~~

**Step 2: Server issues subscription challenge**

~~~ http
HTTP/1.1 402 Payment Required
WWW-Authenticate: Payment id="sub_setup_123",
  realm="saas.example.com",
  method="stripe",
  intent="subscription",
  request="eyJhbW91bnQiOjk5MDAsImN1cnJlbmN5IjoidXNkIiwiaW50ZXJ2YWwiOiJtb250aCIsImRlc2NyaXB0aW9uIjoiUHJlbWl1bSBBUEkgc3Vic2NyaXB0aW9uIn0"
Cache-Control: no-store
Content-Type: application/json

{
  "error": "payment_required",
  "message": "Subscription required for this resource"
}
~~~

Decoded request:
~~~ json
{
  "amount": "9900",
  "currency": "usd",
  "period": "month",
  "description": "Premium API subscription"
}
~~~

**Step 3: Client completes Setup Intent and submits credential**

~~~ http
GET /api/subscribe HTTP/1.1
Host: saas.example.com
Authorization: Payment eyJjaGFsbGVuZ2UiOnsiaWQiOiJzdWJfc2V0dXBfMTIzIiwicmVhbG0iOiJzYWFzLmV4YW1wbGUuY29tIiwibWV0aG9kIjoic3RyaXBlIiwiaW50ZW50Ijoic3Vic2NyaXB0aW9uIiwicmVxdWVzdCI6Ii4uLiIsImV4cGlyZXMiOiIyMDI1LTAxLTE1VDEyOjA1OjAwWiJ9LCJwYXlsb2FkIjp7InNldHVwSW50ZW50SWQiOiJzZXRpXzFONFp2MzJlWnZLWWxvMkNQaFZQa0psVyIsInBheW1lbnRNZXRob2RJZCI6InBtXzFONFp2MzJlWnZLWWxvMkNhQmNEZWZHaCJ9fQ

~~~

Decoded credential:
~~~ json
{
  "challenge": {
    "id": "sub_setup_123",
    "realm": "saas.example.com",
    "method": "stripe",
    "intent": "subscription",
    "request": "eyJhbW91bnQiOjk5MDAsImN1cnJlbmN5IjoidXNkIiwiaW50ZXJ2YWwiOiJtb250aCIsImRlc2NyaXB0aW9uIjoiUHJlbWl1bSBBUEkgc3Vic2NyaXB0aW9uIn0",
    "expires": "2025-01-15T12:05:00Z"
  },
  "payload": {
    "setupIntentId": "seti_1N4Zv32eZvKYlo2CPhVPkJlW",
    "paymentMethodId": "pm_1N4Zv32eZvKYlo2CaBcDefGh"
  }
}
~~~

**Step 4: Server creates subscription and returns confirmation**

~~~ http
HTTP/1.1 200 OK
Payment-Receipt: eyJ0eXBlIjoic3Vic2NyaXB0aW9uIiwic3Vic2NyaXB0aW9uSWQiOiJzdWJfMU40WnYzMmVadktZbG8yQ1BoVlBrSmxXIiwiYW1vdW50Ijo5OTAwLCJjdXJyZW5jeSI6InVzZCIsImludGVydmFsIjoibW9udGgiLCJzdGF0dXMiOiJhY3RpdmUiLCJjdXJyZW50UGVyaW9kRW5kIjoiMjAyNS0wMi0xNVQxMjowMDowMFoifQ
Content-Type: application/json

{
  "status": "subscribed",
  "message": "Subscription created successfully",
  "subscriptionId": "sub_1N4Zv32eZvKYlo2CPhVPkJlW"
}
~~~

Decoded receipt:
~~~ json
{
  "type": "subscription",
  "subscriptionId": "sub_1N4Zv32eZvKYlo2CPhVPkJlW",
  "amount": "9900",
  "currency": "usd",
  "period": "month",
  "status": "active",
  "currentPeriodEnd": "2025-02-15T12:00:00Z"
}
~~~

## Subscription with Trial Example

**Payment challenge with trial:**

~~~ http
HTTP/1.1 402 Payment Required
WWW-Authenticate: Payment id="sub_trial_456",
  realm="saas.example.com",
  method="stripe",
  intent="subscription",
  request="eyJhbW91bnQiOiI0OTAwIiwiY3VycmVuY3kiOiJ1c2QiLCJwZXJpb2QiOiJtb250aCIsImRlc2NyaXB0aW9uIjoiUHJvIHBsYW4gd2l0aCAxNC1kYXkgdHJpYWwiLCJtZXRob2REZXRhaWxzIjp7InRyaWFsRGF5cyI6MTR9fQ"
~~~

Decoded request:
~~~ json
{
  "amount": "4900",
  "currency": "usd",
  "period": "month",
  "description": "Pro plan with 14-day trial",
  "methodDetails": {
    "trialDays": 14
  }
}
~~~

The subscription will not charge the customer until the 14-day trial ends.

# Acknowledgements

TBD
