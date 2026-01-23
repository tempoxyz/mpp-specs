---
title: subscription Intent for HTTP Payment Authentication
abbrev: Payment Intent Subscription
docname: draft-payment-intent-subscription-00
category: info
ipr: trust200902
submissiontype: IETF
consensus: true

author:
  - ins: J. Moxey
    name: Jake Moxey
    org: Tempo Labs
    email: jake@tempo.xyz

normative:
  RFC2119:
  RFC8174:
  I-D.httpauth-payment:
    title: The "Payment" HTTP Authentication Scheme
    author:
      - ins: J. Moxey
    date: 2025
---

--- abstract

This document defines the "subscription" payment intent for use with the
Payment HTTP Authentication Scheme {{I-D.httpauth-payment}}. The
"subscription" intent represents a recurring payment authorization where
the payer grants the server permission to charge a specified amount on
a periodic basis.

--- middle

# Introduction

The "subscription" intent enables recurring payments where the payer
authorizes periodic charges. Unlike "authorize" which grants a total
spending limit, "subscription" grants a per-period spending limit that
resets each billing cycle.

Common use cases:

- **SaaS subscriptions**: Monthly/annual service fees
- **API subscriptions**: Per-month API access
- **Streaming services**: Recurring content access
- **Metered services**: Usage-based billing with periodic caps

## Relationship to "authorize"

The "subscription" intent is conceptually similar to "authorize" but
with periodic limit resets:

| Intent | Limit Scope | Resets |
|--------|-------------|--------|
| `authorize` | Total until expiry | Never |
| `subscription` | Per period | Each period |

## Relationship to Payment Methods

Payment methods implement "subscription" using their native recurring
payment mechanisms:

| Method | Implementation |
|--------|----------------|
| Tempo | Access Keys with periodic spending limits |
| Stripe | Stripe Subscriptions API |
| Traditional | Recurring card-on-file charges |

# Requirements Language

{::boilerplate bcp14-tagged}

# Intent Semantics

## Definition

The "subscription" intent represents a request for the payer to grant
permission for the server to initiate recurring payments of a specified
amount per billing period.

## Properties

| Property | Value |
|----------|-------|
| **Intent Identifier** | `subscription` |
| **Payment Timing** | Recurring (server-initiated per period) |
| **Idempotency** | Reusable within period limits |
| **Reversibility** | Cancellable |

## Flow

~~~
   Client                           Server                    Payment Network
      │                                │                              │
      │  (1) GET /resource             │                              │
      ├───────────────────────────────>│                              │
      │                                │                              │
      │  (2) 402 Payment Required      │                              │
      │      intent="subscription"     │                              │
      │<───────────────────────────────┤                              │
      │                                │                              │
      │  (3) Sign subscription auth    │                              │
      │                                │                              │
      │  (4) Authorization: Payment    │                              │
      ├───────────────────────────────>│                              │
      │                                │                              │
      │                                │  (5) Register subscription   │
      │                                ├─────────────────────────────>│
      │                                │                              │
      │                                │  (6) Charge first period     │
      │                                ├─────────────────────────────>│
      │                                │                              │
      │  (7) 200 OK + Receipt          │                              │
      │<───────────────────────────────┤                              │
      │                                │                              │
      │        ... 30 days ...         │                              │
      │                                │                              │
      │                                │  (8) Charge next period      │
      │                                ├─────────────────────────────>│
      │                                │                              │
~~~

## Billing Periods

The `period` field MUST be specified as an integer number of seconds.
For interoperability, the following named constants are defined:

| Period Name | Duration | Seconds |
|-------------|----------|---------|
| daily | 1 day | 86400 |
| weekly | 7 days | 604800 |
| monthly | 30 days | 2592000 |
| yearly | 365 days | 31536000 |

These are fixed durations, not calendar periods. A "monthly" period is
exactly 30 days (2592000 seconds), not a calendar month. Payment method
specifications SHOULD use these constants for common billing cycles.

# Request Schema

## Required Fields

| Field | Type | Description |
|-------|------|-------------|
| `amount` | string | Amount per billing period (base units) |
| `period` | integer | Billing period in seconds |

## Recommended Fields

| Field | Type | Description |
|-------|------|-------------|
| `currency` | string | Currency identifier |
| `expires` | string | Subscription end date (optional) |
| `cycles` | number | Maximum number of billing cycles |

## Example

~~~ json
{
  "amount": "10000000",
  "currency": "0x20c0000000000000000000000000000000000001",
  "period": 2592000,
  "expires": "2026-01-15T00:00:00Z"
}
~~~

This example represents a monthly subscription (30 days) for 10.00 units.

# Credential Requirements

## Payload

The credential `payload` for a "subscription" intent contains the
recurring authorization grant. The format is method-specific:

| Authorization Type | Description | Example Methods |
|-------------------|-------------|-----------------|
| Periodic Key Auth | Key with periodic limits | Tempo |
| Subscription Setup | Recurring billing setup | Stripe |
| Signed Mandate | Recurring payment mandate | SEPA, ACH |

## Persistence

Subscription authorizations persist across billing periods until:

- The subscription end date is reached
- The maximum cycles are exhausted
- The payer cancels the subscription
- Payment fails (method-specific retry policies apply)

# Subscription Lifecycle

## Activation

When the server receives a "subscription" credential:

1. Verify the subscription authorization
2. Create the subscription record
3. Optionally charge the first period immediately
4. Return success with subscription details

## Renewal

At each billing period boundary:

1. Server initiates charge for the period amount
2. If successful, continue subscription
3. If failed, apply retry policy (method-specific)
4. Notify payer of payment status

## Cancellation

Payers MUST be able to cancel subscriptions. Cancellation:

- Stops future charges
- Does NOT refund past charges (unless method-specific)
- Takes effect at end of current period (unless immediate)

Cancellation mechanisms are method-specific:

| Method | Cancellation |
|--------|-------------|
| Tempo | Remove periodic Access Key |
| Stripe | Cancel Subscription via API |
| Traditional | Contact merchant |

## Modification

Some payment methods support subscription modification:

- Upgrade/downgrade amount
- Change billing period
- Update payment method

Modifications require payer consent for increases.

# Security Considerations

## Recurring Charge Awareness

Clients MUST clearly communicate to users that they are authorizing
recurring charges. User interfaces SHOULD:

- Display the amount per period prominently
- Show the total commitment if cycles are limited
- Indicate when the subscription expires (or if it's perpetual)

## Period Amount Verification

Clients MUST verify:

- The amount per period is acceptable
- The billing period matches expectations
- The total commitment is understood

## Cancellation Rights

Payers MUST have clear cancellation mechanisms. Servers MUST:

- Provide documentation on how to cancel
- Honor cancellation requests promptly
- Not impose unreasonable cancellation barriers

## Failed Payment Handling

Retry policies for failed subscription payments are defined by payment
method specifications. Servers SHOULD define clear policies including:

- Number of retry attempts
- Grace period before service suspension
- Notification to payer

## Price Changes

If a server intends to change subscription pricing:

- Existing subscriptions SHOULD continue at original price
- Price increases require new authorization
- Payers MUST be notified of upcoming changes

# IANA Considerations

## Payment Intent Registration

This document registers the "subscription" intent in the "HTTP Payment
Intents" registry established by {{I-D.httpauth-payment}}:

| Intent | Description | Reference |
|--------|-------------|-----------|
| `subscription` | Recurring periodic payment authorization | This document |
