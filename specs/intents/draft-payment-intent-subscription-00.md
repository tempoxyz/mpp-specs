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

Standard billing periods:

| Period | Duration | Seconds |
|--------|----------|---------|
| `day` | 1 day | 86400 |
| `week` | 7 days | 604800 |
| `month` | ~30 days | 2592000 |
| `year` | ~365 days | 31536000 |

Payment method specifications MAY define custom period formats.

# Request Schema

The `request` parameter for a "subscription" intent is a JSON object with
shared fields defined by this specification and optional method-specific
extensions in the `methodDetails` field.

## Shared Fields

All payment methods implementing the "subscription" intent MUST support these
shared fields, enabling clients to parse and display subscription requests
consistently across methods.

### Required Fields

| Field | Type | Description |
|-------|------|-------------|
| `amount` | string | Amount per billing period in base units |
| `currency` | string | Currency or asset identifier (see {{currency-formats}}) |
| `period` | string | Billing period: `"day"`, `"week"`, `"month"`, `"year"`, or seconds as string |

### Optional Fields

| Field | Type | Description |
|-------|------|-------------|
| `recipient` | string | Payment recipient in method-native format |
| `expires` | string | Subscription end date in ISO 8601 format |
| `cycles` | number | Maximum number of billing cycles |
| `description` | string | Human-readable subscription description |
| `externalId` | string | Merchant's reference (subscription ID, etc.) |
| `methodDetails` | object | Method-specific extension data |

## Currency Formats {#currency-formats}

The `currency` field supports multiple formats to accommodate different
payment networks:

| Format | Example | Description |
|--------|---------|-------------|
| ISO 4217 | `"usd"`, `"eur"` | Fiat currencies (lowercase) |
| Token address | `"0x20c0..."` | ERC-20, TIP-20, or similar token contracts |
| Well-known symbol | `"sat"`, `"btc"`, `"eth"` | Native blockchain assets |

Clients can detect the format:

- Starts with `0x`: Token contract address
- Three lowercase letters: ISO 4217 currency code
- Otherwise: Well-known symbol or method-specific identifier

## Period Formats

The `period` field supports named periods or explicit durations:

| Value | Duration |
|-------|----------|
| `"day"` | 1 day (86400 seconds) |
| `"week"` | 7 days (604800 seconds) |
| `"month"` | ~30 days (2592000 seconds) |
| `"year"` | ~365 days (31536000 seconds) |
| `"86400"` | Explicit seconds as string |

Payment method specifications MAY define additional period formats.

## Method Extensions

Payment methods MAY define additional fields in the `methodDetails` object.
These fields are method-specific and MUST be documented in the payment
method specification.

## Examples

### Traditional Payment Processor (Stripe)

~~~ json
{
  "amount": "9900",
  "currency": "usd",
  "period": "month",
  "description": "Pro Plan",
  "methodDetails": {
    "trialDays": 14,
    "cancelAtPeriodEnd": false
  }
}
~~~

### Blockchain Payment (Tempo)

~~~ json
{
  "amount": "10000000",
  "currency": "0x20c0000000000000000000000000000000000001",
  "period": "month",
  "expires": "2026-01-06T00:00:00Z",
  "methodDetails": {
    "chainId": 42431
  }
}
~~~

### With Explicit Period and Cycle Limit

~~~ json
{
  "amount": "5000",
  "currency": "usd",
  "period": "604800",
  "cycles": 52,
  "description": "Weekly digest subscription"
}
~~~

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

Servers SHOULD define clear policies for failed payments:

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
