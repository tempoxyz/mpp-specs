---
title: Stripe Subscription Intent for HTTP Payment Authentication
abbrev: Stripe Subscription
docname: draft-stripe-subscription-00
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
  I-D.payment-intent-subscription:
    title: "Subscription Intent for HTTP Payment Authentication"
    target: https://datatracker.ietf.org/doc/draft-payment-intent-subscription/
    author:
      - name: Jake Moxey
    date: 2026-04

informative:
  STRIPE-BILLING-OVERVIEW:
    target: https://docs.stripe.com/billing/subscriptions/overview
    title: How subscriptions work
    author:
      - org: Stripe, Inc.
  STRIPE-BILLING-CANCEL:
    target: https://docs.stripe.com/billing/subscriptions/cancel
    title: Cancel subscriptions
    author:
      - org: Stripe, Inc.
  STRIPE-BILLING-WEBHOOKS:
    target: https://docs.stripe.com/billing/subscriptions/webhooks
    title: Using webhooks with subscriptions
    author:
      - org: Stripe, Inc.
  STRIPE-SUBSCRIPTIONS-API:
    target: https://docs.stripe.com/api/subscriptions/create
    title: Create a subscription
    author:
      - org: Stripe, Inc.
  STRIPE-METADATA:
    target: https://docs.stripe.com/api/metadata
    title: Metadata
    author:
      - org: Stripe, Inc.
  STRIPE-SETUP-FUTURE:
    target: https://docs.stripe.com/payments/setup-intents
    title: Set up future payments
    author:
      - org: Stripe, Inc.
---

--- abstract

This document defines the `subscription` intent for the `stripe`
payment method within the Payment HTTP Authentication Scheme
{{I-D.httpauth-payment}}. It specifies a constrained Stripe Billing
profile for fixed-price recurring subscriptions whose activation
succeeds only when the first invoice is paid synchronously.

--- middle

# Introduction

This specification defines the `subscription` intent for use with the
`stripe` payment method in the Payment HTTP Authentication Scheme
{{I-D.httpauth-payment}}. It profiles Stripe Billing as a narrow,
canonical mapping of the shared `subscription` intent defined in
{{I-D.payment-intent-subscription}}.

This document is intentionally not a specification for all Stripe
subscription features. Stripe Billing supports richer behaviors such as
trials, prorations, discounts, usage-based billing, and flexible
schedule changes. This method supports only the subset that preserves
the shared subscription semantics exactly. Servers MUST reject request
objects or Stripe configurations that would broaden those semantics.

This profile models the recurring payment agreement, not the full Stripe
Billing object surface. Quantities or seat counts, plan schedules,
prorations, billing-anchor resets, and other commercial-policy behavior
remain out of scope even though Stripe can support them.

## Stripe Subscription Flow

The following diagram illustrates the Stripe subscription flow:

~~~
   Client                          Server                          Stripe
      |                               |                               |
      |  (1) GET /resource            |                               |
      |---------------------------->  |                               |
      |                               |                               |
      |  (2) 402 Payment Required     |                               |
      |      intent="subscription"    |                               |
      |<----------------------------- |                               |
      |                               |                               |
      |  (3) Collect payment method   |                               |
      |      and create credential    |                               |
      |                               |                               |
      |  (4) Authorization: Payment   |                               |
      |---------------------------->  |                               |
      |                               |                               |
      |                               |  (5) Create or reuse         |
      |                               |      customer, price, and    |
      |                               |      subscription            |
      |                               |---------------------------->  |
      |                               |                               |
      |                               |  (6) First invoice paid      |
      |                               |<----------------------------  |
      |                               |                               |
      |  (7) 200 OK + Receipt         |                               |
      |<----------------------------  |                               |
      |                               |                               |
      |        ... later period ...   |                               |
      |                               |                               |
      |                               |  (8) Renewal invoice paid    |
      |                               |      and recorded            |
      |                               |<----------------------------  |
      |                               |                               |
      |  (9) 200 OK + Receipt         |                               |
      |<----------------------------  |                               |
      |                               |                               |
~~~

# Requirements Language

{::boilerplate bcp14-tagged}

# Terminology

Stripe Customer
: A Stripe object representing the payer for a subscription.

Stripe Price
: A Stripe object that defines the fixed recurring amount, currency,
  and cadence for a subscription item.

Stripe Subscription
: A Stripe Billing object representing the recurring commercial
  relationship. In this profile it MUST contain exactly one fixed-price
  recurring item.

First Invoice
: The initial Stripe invoice created for the subscription at activation
  time. Activation succeeds only after this invoice is paid.

# Request Schema

The `request` parameter in the `WWW-Authenticate` challenge contains a
base64url-encoded JSON object. The `request` JSON MUST be serialized
using JSON Canonicalization Scheme (JCS) {{RFC8785}} and
base64url-encoded without padding per {{I-D.httpauth-payment}}.

## Request Fields

The Stripe `subscription` profile uses the shared `amount`, `currency`,
`periodSeconds`, `description`, and `externalId` fields from
{{I-D.payment-intent-subscription}}. It
additionally defines the following request constraints:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `amount` | string | REQUIRED | Fixed payment amount per billing period in the currency's smallest unit |
| `currency` | string | REQUIRED | Lowercase ISO 4217 currency code |
| `periodSeconds` | string | REQUIRED | Billing period duration in seconds |
| `description` | string | OPTIONAL | Human-readable subscription description |
| `externalId` | string | OPTIONAL | Merchant's reference for the subscription |
| `recipient` | string | MUST NOT | This profile identifies the merchant by the challenged Stripe account and `methodDetails.networkId`, not by a request-native recipient field |

The `amount` value MUST be a string representation of a positive
integer in base 10 with no sign, decimal point, exponent, or
surrounding whitespace. Leading zeros MUST NOT be used.

The `periodSeconds` value MUST be a string representation of a positive
integer in base 10 with no sign, decimal point, exponent, or
surrounding whitespace. Leading zeros MUST NOT be used.

Servers MUST reject request objects that include `recipient` or
`subscriptionExpires`.

## Method Details

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `methodDetails.networkId` | string | REQUIRED | Stripe Business Network Profile ID for the challenged merchant |
| `methodDetails.paymentMethodTypes` | []string | REQUIRED | Stripe payment method types accepted for synchronous activation and future off-session recurring invoices |
| `methodDetails.metadata` | object | OPTIONAL | Stripe metadata as a string key/value map |

Servers MUST include only payment method types that can complete this
profile's activation flow synchronously and can also be reused for
future off-session recurring charges under the challenged account.
Servers MUST reject payment method types that require an asynchronous
first-invoice settlement path or customer action after the credential is
submitted.

If `methodDetails.metadata` is present, every key and value MUST be a
JSON string and the object MUST satisfy Stripe metadata limits
{{STRIPE-METADATA}}. Metadata MUST NOT affect payment authorization,
amount, period, recipient, invoice validation, cancellation, or
access-control decisions.

**Example:**

~~~json
{
  "amount": "5000",
  "currency": "usd",
  "periodSeconds": "604800",
  "description": "Weekly Pro plan",
  "externalId": "sub_12345",
  "methodDetails": {
    "networkId": "profile_1MqDcVKA5fEO2tZvKQm9g8Yj",
    "paymentMethodTypes": ["card", "link"],
    "metadata": {
      "plan": "weekly-pro"
    }
  }
}
~~~

## Constrained Stripe Billing Profile

This method defines a constrained profile of Stripe Billing. Servers
MUST either implement this profile exactly or reject the request.

Servers MUST create or reuse exactly one Stripe Customer and exactly one
Stripe Subscription containing exactly one recurring Stripe Price. The
Price MUST have a fixed `unit_amount`, fixed `currency`, and fixed
recurring cadence for the full life of the subscription.

The `periodSeconds` field MUST map exactly to a Stripe recurring cadence
using one of the following forms:

- `week`, where `periodSeconds = interval_count * 604800`
- `day`, where `periodSeconds = interval_count * 86400`

If `periodSeconds` is divisible by both values, servers SHOULD prefer
the `week` representation. Servers MUST reject any `periodSeconds`
value that would require approximation, calendar-month interpretation,
calendar-year interpretation, or an unsupported Stripe interval count.

This profile supports only a fixed quantity of 1 for the single
subscription item. Servers MUST reject any request or server-side
configuration that would vary quantity during the active lifetime of the
subscription.

When creating a Stripe Subscription for this profile, servers MUST use
the following create Subscription parameters {{STRIPE-SUBSCRIPTIONS-API}}:

- `collection_method=charge_automatically`
- `payment_behavior=error_if_incomplete`
- `proration_behavior=none`
- exactly one subscription item with `quantity=1`
- no `add_invoice_items`
- no `billing_cycle_anchor` other than immediate activation
- no `backdate_start_date`
- no `cancel_at` or `cancel_at_period_end` at activation
- no `pending_invoice_item_interval`
- no subscription schedule

Servers MUST create the subscription using an idempotency key bound to
the challenge ID, payer, payment method, amount, currency, and
`periodSeconds`. If an idempotent retry returns an existing Stripe
Subscription, the server MUST verify that the existing object still
matches this profile before treating the retry as successful.

## Unsupported Stripe Billing Features

Servers implementing this profile MUST disable or reject the following
features:

- free trials
- paid trials
- prorations
- discounts or coupons
- automatic tax
- additional invoice items
- pending invoice items
- usage-based billing
- metered add-ons
- mid-cycle plan changes
- quantity changes during an active subscription
- pause or resume controls
- asynchronous first-invoice settlement
- customer-action-required first-invoice flows
- manual invoice collection

# Credential Schema

The Payment credential is a base64url-encoded JSON object containing
`challenge` and `payload` fields per {{I-D.httpauth-payment}}. For
Stripe subscription, the `payload` object contains the following fields:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `paymentMethod` | string | REQUIRED | Stripe PaymentMethod ID to use for the first invoice and future recurring charges |
| `customer` | string | OPTIONAL | Existing Stripe Customer ID if the merchant already has one for the payer |

The `paymentMethod` MUST reference a Stripe PaymentMethod whose type is
included in `methodDetails.paymentMethodTypes` and which is suitable for
future off-session recurring charges under the challenged Stripe
account.

Before submitting a credential, the client or Stripe-native collection
flow MUST have obtained any authorization, mandate, or setup required by
Stripe for future off-session recurring charges {{STRIPE-SETUP-FUTURE}}.
Servers MUST reject PaymentMethods that are not reusable for the
challenged merchant and subscription terms.

**Example:**

~~~json
{
  "paymentMethod": "pm_1Qabc32eZvKYlo2C7b8H1234",
  "customer": "cus_S7x1Pq5R9n2Lm4"
}
~~~

# Verification Procedure

Servers MUST verify Payment credentials for Stripe subscription intent:

1. Verify the challenge ID matches the one issued
2. Verify the challenge has not expired
3. Decode the request object and verify it matches this constrained
   profile, including exact `periodSeconds` support
4. Extract the `paymentMethod` and optional `customer` from the
   credential payload
5. Verify the Stripe PaymentMethod exists, is reusable by the
   challenged merchant, has a type allowed by the challenge, and can
   support both the profile's synchronous first-invoice activation flow
   and future off-session recurring charges
6. Verify the credential has not been replayed for the same challenge

Servers MUST complete challenge validation before creating or mutating
Stripe objects.

# Settlement Procedure

## Activation and First-Period Charge

For `intent="subscription"`, the server MUST:

1. Create or reuse a Stripe Customer for the payer
2. Attach or select the challenged `paymentMethod` for that Customer
3. Create or reuse a Stripe Price whose amount, currency, and recurring
   cadence exactly match the request
4. Create a Stripe Subscription with exactly one recurring item,
   quantity 1, the creation parameters defined above, and no
   unsupported features
5. Verify the first invoice and its PaymentIntent completed
   synchronously
6. Treat activation as successful only after the first invoice for that
   subscription is paid and validated
7. Initialize durable local subscription state for later renewals
8. Return success (200) with a `Payment-Receipt` for the first invoice,
   including a `subscriptionId`

Servers MUST NOT treat the subscription as active, grant access, or
return a success receipt while the first invoice is unpaid, requires
additional customer action, or remains incomplete.

If Stripe cannot pay the first invoice synchronously, including because
the invoice requires customer action, remains incomplete, enters
processing, or depends on asynchronous settlement, the server MUST treat
activation as failed and return `402 Payment Required` with a fresh
challenge. The server MUST NOT expose a protocol continuation state for
that incomplete Stripe Subscription.

The canonical billing anchor for this profile is the start timestamp of
the first paid Stripe invoice period. Servers MUST use that anchor when
mapping later Stripe invoices to the shared `periodSeconds` billing
periods.

Before activating a subscription or recording a renewal, servers MUST
validate the paid Stripe invoice. The invoice MUST:

- belong to the expected Stripe Subscription and Customer
- have status `paid`
- contain exactly one subscription line item
- have no invoice items outside the subscription item
- have no discounts, tax, credits, or prorations that change the amount
- match the challenged `amount` and `currency`
- map to exactly one canonical billing period derived from the billing
  anchor and `periodSeconds`
- not have already been recorded for another billing period or
  subscription

## Renewal

Later billing periods are fulfilled by Stripe renewal invoices. Servers
MUST use durable local state to map Stripe invoices and webhook events
onto canonical billing periods derived from the activation anchor and
`periodSeconds`.

Servers MUST treat a later billing period as paid only after they
observe a successful paid Stripe invoice for that subscription and
record that canonical billing period durably.

Servers MUST NOT grant more than one newly paid billing period because
of duplicate webhooks, retries, concurrent requests, or later
collection of older unpaid invoices. If a Stripe recovery or retry flow
cannot be mapped exactly to the shared one-charge-per-period invariant,
servers MUST disable that flow or reject the request.

Implementations MUST process Stripe invoice events idempotently by
recording the Stripe event ID, invoice ID, subscription ID, and
canonical billing-period index. A duplicate webhook or API retry MUST
return the previously recorded result without creating a second local
payment record or granting another billing period.

Servers MUST NOT rely on `invoice.created` delivery or acknowledgement
for access decisions. Access can be granted only after a validated paid
invoice has been durably recorded. If webhook delivery, invoice
finalization, or automatic collection is delayed, the corresponding
billing period remains unpaid until a later validated paid invoice is
recorded.

## Cancellation

Payers MUST be able to cancel Stripe subscriptions. For this profile,
the default cancellation effective time is the end of the current paid
canonical billing period.

When a payer cancels, the server MUST set the Stripe Subscription to
cancel at the period end corresponding to the last paid canonical
billing period, and MUST record that cancellation effective time in
durable local state. The server MAY cancel immediately only if the
application separately handles any already-paid access period without
creating an additional charge.

Servers MUST treat `customer.subscription.deleted` and equivalent
Stripe cancellation state as revocation for future renewals. Servers
MUST NOT collect or record renewal invoices for billing periods whose
start time is at or after the cancellation effective time.

Servers MUST prevent pending invoice items from being collected after
cancellation. If any pending invoice item, proration, credit, tax, or
other non-profile invoice component exists for the Customer or
Subscription, the server MUST remove it before cancellation or reject
the subscription as no longer conforming to this profile.

## Receipt Generation

Upon successful activation or renewal, servers MUST return a
`Payment-Receipt` header per {{I-D.httpauth-payment}}. Servers MUST NOT
include a `Payment-Receipt` header on error responses.

The receipt payload for Stripe subscription:

| Field | Type | Description |
|-------|------|-------------|
| `method` | string | `"stripe"` |
| `reference` | string | Stripe invoice ID whose successful payment activated or renewed the subscription |
| `status` | string | `"success"` |
| `subscriptionId` | string | Server-issued opaque identifier for the subscription |
| `stripeSubscription` | string | Stripe subscription ID |
| `timestamp` | string | {{RFC3339}} time the invoice was recorded as paid |
| `externalId` | string | OPTIONAL. Echoed from the challenge request |

# Security Considerations

## Reject Unsupported Features

Stripe Billing supports features whose semantics are broader than the
shared `subscription` intent. Servers MUST reject or disable those
features rather than silently approximating the requested subscription.

## Invoice Status Versus Access

Servers MUST NOT grant access based only on a Stripe subscription's
high-level status. Stripe can report an `active` subscription while
other invoices remain open or while retry logic is still in progress
{{STRIPE-BILLING-OVERVIEW}}. Access decisions MUST use the canonical
per-period accounting required by
{{I-D.payment-intent-subscription}} together with successfully paid
invoices.

## Webhook Authenticity and Ordering

Implementations using Stripe webhooks MUST verify webhook authenticity,
handle duplicate deliveries safely, and tolerate out-of-order event
arrival {{STRIPE-BILLING-WEBHOOKS}}.

## Duplicate Charge Prevention

Stripe invoices and webhooks do not by themselves guarantee that the
same HTTP billing period will be applied only once. Servers MUST keep
durable local state sufficient to prevent duplicate activation or
renewal accounting across retries, concurrent requests, and webhook
replays.

# IANA Considerations

The `subscription` payment intent is registered by
{{I-D.payment-intent-subscription}}. This document does not register it
again.

--- back

# Examples

This section is non-normative.

## Activation

**Challenge:**

~~~http
HTTP/1.1 402 Payment Required
Cache-Control: no-store
WWW-Authenticate: Payment id="qT8wErYuI3oPlKjH6gFdSa",
  realm="api.example.com",
  method="stripe",
  intent="subscription",
  expires="2026-01-15T12:05:00Z",
  request="<base64url-encoded JSON below>"
~~~

The `request` decodes to:

~~~json
{
  "amount": "5000",
  "currency": "usd",
  "periodSeconds": "604800",
  "description": "Weekly Pro plan",
  "methodDetails": {
    "networkId": "profile_1MqDcVKA5fEO2tZvKQm9g8Yj",
    "paymentMethodTypes": ["card", "link"]
  }
}
~~~

**Credential payload:**

~~~json
{
  "paymentMethod": "pm_1Qabc32eZvKYlo2C7b8H1234",
  "customer": "cus_S7x1Pq5R9n2Lm4"
}
~~~

The server creates or reuses a Stripe Customer, creates or reuses a
weekly fixed-price Stripe Price, creates a Stripe Subscription, and
waits for the first invoice to be paid. Once Stripe reports the first
invoice as paid, the `Payment-Receipt` payload decodes to:

~~~json
{
  "method": "stripe",
  "reference": "in_1QabdK2eZvKYlo2C0L9n4321",
  "status": "success",
  "subscriptionId": "c3ViX3N0cmlwZV8wMQ",
  "stripeSubscription": "sub_1Qabd52eZvKYlo2CgP0Lm789",
  "timestamp": "2026-01-15T12:03:10Z"
}
~~~

## Rejected Unsupported Cadence

If a request uses a `periodSeconds` value that cannot be represented as
an exact whole number of Stripe `day` or `week` intervals, the server
rejects it rather than approximating. For example, the following request
is invalid for this profile because `90000` seconds is not an exact
whole number of days or weeks:

~~~json
{
  "amount": "5000",
  "currency": "usd",
  "periodSeconds": "90000",
  "methodDetails": {
    "networkId": "profile_1MqDcVKA5fEO2tZvKQm9g8Yj",
    "paymentMethodTypes": ["card"]
  }
}
~~~

# Acknowledgements

The authors thank the MPP community for their feedback on this
specification.
