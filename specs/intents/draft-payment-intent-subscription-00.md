---
title: Subscription Intent for HTTP Payment Authentication
abbrev: Payment Intent Subscription
docname: draft-payment-intent-subscription-00
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
    target: https://datatracker.ietf.org/doc/draft-ietf-httpauth-payment/
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

This document defines the "subscription" payment intent for use with the
Payment HTTP Authentication Scheme. The "subscription" intent
represents a recurring fixed-amount payment where the payer grants the
server permission to charge the same amount once per billing period
until a specified expiry time.

--- middle

# Introduction

The "subscription" intent enables recurring fixed-amount payments. A
successful subscription activation creates an authorization for the
server to collect the same payment amount once per billing period until
the subscription expires or is cancelled.

This intent is useful for recurring API plans, content subscriptions,
and other services with a stable price per billing period.

## Relationship to Payment Methods

Payment methods implement "subscription" using method-specific recurring
authorization mechanisms. This document defines the abstract semantics
and shared request fields. Payment method specifications define how
those semantics are enforced.

# Requirements Language

{::boilerplate bcp14-tagged}

# Terminology

Subscription
: A recurring payment authorization for a fixed amount charged once per
  billing period.

Billing Period
: A fixed-duration window during which at most one subscription charge
  may be collected.

Activation
: The successful initial registration of a subscription, which also
  collects the first billing-period charge.

Renewal
: A later charge that collects the subscription amount for a subsequent
  billing period.

Cancellation
: The act of ending a subscription before `subscriptionExpires`,
  preventing future renewals.

Subscription Identifier
: A server-issued opaque identifier for an activated subscription,
  used by clients to re-authenticate into that subscription on later
  requests.

# Intent Semantics

## Definition

The "subscription" intent represents a request for a recurring
fixed-amount payment of `amount`, charged once per billing period until
`subscriptionExpires` or cancellation.

## Properties

| Property | Value |
|----------|-------|
| **Intent Identifier** | `subscription` |
| **Payment Timing** | Recurring (initial charge at activation, then once per period) |
| **Idempotency** | Credential single-use; subscription grant reusable across billing periods |
| **Reversibility** | Cancellable before expiry |

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
      │  (3) Sign subscription grant   │                              │
      │                                │                              │
      │  (4) Authorization: Payment    │                              │
      ├───────────────────────────────>│                              │
      │                                │                              │
      │                                │  (5) Activate subscription   │
      │                                │      + collect first charge  │
      │                                ├─────────────────────────────>│
      │                                │                              │
      │  (6) 200 OK + Receipt          │                              │
      │<───────────────────────────────┤                              │
      │                                │                              │
      │        ... later period ...    │                              │
      │                                │                              │
      │                                │  (7) Collect renewal         │
      │                                ├─────────────────────────────>│
      │                                │                              │
      │  (8) 200 OK + Receipt          │                              │
      │<───────────────────────────────┤                              │
      │                                │                              │
~~~

# Request Schema

The `request` parameter for a "subscription" intent is a JSON object
with shared fields defined by this specification and optional
method-specific extensions in the `methodDetails` field. The `request`
JSON MUST be serialized using JSON Canonicalization Scheme (JCS)
{{RFC8785}} and base64url-encoded without padding per
{{I-D.httpauth-payment}}.

## Shared Fields

All payment methods implementing the "subscription" intent MUST support
these shared fields. Payment methods MAY elevate OPTIONAL fields to
REQUIRED in their method specification.

### Required Fields

| Field | Type | Description |
|-------|------|-------------|
| `amount` | string | Fixed payment amount per billing period in base units |
| `currency` | string | Currency or asset identifier (see {{currency-formats}}) |
| `periodSeconds` | string | Billing period duration in seconds |
| `subscriptionExpires` | string | Subscription expiry timestamp in {{RFC3339}} format |

The `amount` value MUST be a string representation of a positive
integer in base 10 with no sign, decimal point, exponent, or
surrounding whitespace. Leading zeros MUST NOT be used.

The `periodSeconds` value MUST be a string representation of a positive
integer in base 10 with no sign, decimal point, exponent, or
surrounding whitespace. Leading zeros MUST NOT be used.

`periodSeconds` defines fixed-duration billing periods measured in
elapsed seconds. It does not, by itself, encode calendar-month or
calendar-year alignment.

### Optional Fields

| Field | Type | Description |
|-------|------|-------------|
| `recipient` | string | Payment recipient in method-native format |
| `description` | string | Human-readable subscription description |
| `externalId` | string | Merchant's reference for the subscription |
| `subscriptionId` | string | Server-issued opaque identifier for an existing subscription |
| `methodDetails` | object | Method-specific extension data |

The `subscriptionId` field is absent during initial activation. Servers
MAY include it when issuing a challenge tied to an existing
subscription.

Servers issuing `intent="subscription"` challenges SHOULD include the
`expires` auth-param in `WWW-Authenticate` per {{I-D.httpauth-payment}},
using {{RFC3339}} format. Request objects MUST NOT duplicate the
challenge expiry value. The `subscriptionExpires` field instead defines
when the subscription itself expires.

If the challenge includes `expires`, the `subscriptionExpires` value
MUST be strictly later than the challenge `expires` timestamp. Servers
MUST reject credentials where `subscriptionExpires` is at or before the
challenge `expires`.

The first billing period begins when the subscription is activated.
Payment methods MAY define additional activation controls in
`methodDetails`, but MUST define exact activation semantics if they do
so.

The billing anchor for a subscription is the time activation succeeds.
Billing periods are contiguous fixed-duration windows derived by adding
`periodSeconds` to that anchor.

## Currency Formats {#currency-formats}

The `currency` field supports multiple formats to accommodate different
payment networks:

| Format | Example | Description |
|--------|---------|-------------|
| ISO 4217 | `"usd"`, `"eur"` | Fiat currencies (lowercase) |
| Token address | `"0x20c0..."` | On-chain token contract address |
| Method-defined | (varies) | Payment method-specific currency identifiers |

Payment method specifications MUST document which currency formats they
support and how to interpret amounts for each format.

## Method Extensions

Payment methods MAY define additional fields in the `methodDetails`
object. These fields are method-specific and MUST be documented in the
payment method specification.

## Examples

### Traditional Payment Processor

~~~ json
{
  "amount": "9900",
  "currency": "usd",
  "periodSeconds": "2592000",
  "subscriptionExpires": "2026-01-01T00:00:00Z",
  "description": "Pro plan"
}
~~~

### Blockchain Payment (Tempo)

~~~ json
{
  "amount": "10000000",
  "currency": "0x20c0000000000000000000000000000000000001",
  "periodSeconds": "2592000",
  "subscriptionExpires": "2026-01-01T00:00:00Z",
  "recipient": "0x742d35Cc6634C0532925a3b844Bc9e7595f8fE00",
  "methodDetails": {
    "chainId": 4217
  }
}
~~~

# Credential Requirements

## Payload

The credential `payload` for a "subscription" intent contains the
subscription authorization grant. The format is method-specific:

| Authorization Type | Description | Example Methods |
|-------------------|-------------|-----------------|
| Periodic key auth | Delegated key with per-period limits | Tempo |
| Subscription setup | Processor-managed recurring payment setup | Stripe |
| Signed mandate | Recurring debit mandate | ACH, SEPA |

## Single-Use

Each "subscription" credential MUST be usable only once per challenge.
Servers MUST reject replayed credentials.

A successfully activated subscription may be reused for later billing
periods until:

- The `subscriptionExpires` timestamp is reached
- The payer explicitly cancels it
- The payment method revokes or invalidates the authorization

# Subscription Lifecycle

## Activation

When the server receives a "subscription" credential, it MUST:

1. Verify the subscription authorization proof
2. Activate the subscription
3. Collect the first billing-period charge
4. Initialize durable subscription state for later renewals
5. Return success (200) with a `Payment-Receipt` for the first charge,
   including a `subscriptionId`

## Renewal

For each later billing period, the server MAY collect one renewal
charge for `amount` using the method-specific recurring authorization.

If the server grants access for a later billing period, it MUST ensure
that the renewal charge for that period has been collected before, or
atomically with, delivering the corresponding service.

Servers MUST NOT collect more than one renewal charge for the same
billing period.

If one or more billing periods elapse without a successful renewal
charge, the subscription intent authorizes at most one charge for the
then-current billing period. Servers MUST NOT treat missed billing
periods as automatically accumulated authority for additional charges.

## Reauthentication

After successful activation, the server MUST return a `subscriptionId`
in the `Payment-Receipt`. The value MUST be a base64url {{RFC4648}}
string without padding and MUST be unique within the server's
subscription namespace.

Clients SHOULD retain the `subscriptionId` and, when intending to use an
existing subscription on a later request, SHOULD send it in the
`Subscription-Id` request header.

If a request is associated with an existing subscription, the server MAY
echo that identifier in the challenge `request.subscriptionId` field to
bind the challenge to the intended subscription.

Servers MUST authenticate or otherwise authorize the client's use of the
identified subscription before granting access or collecting a renewal
charge.

## Server Accounting and Idempotency

Servers MUST maintain durable subscription state sufficient to enforce
per-period charging rules across retries and concurrent requests.

At minimum, servers MUST track:

- Subscription identifier
- Billing anchor or equivalent current billing-period start time
- Last successfully charged billing-period index, or whether the
  current billing period has been charged
- Subscription expiry
- Cancellation or revocation status

For non-idempotent requests, clients SHOULD send an `Idempotency-Key`
header per {{I-D.ietf-httpapi-idempotency-key-header}}. Servers MUST NOT
collect the same activation or renewal charge more than once for a
duplicate idempotent request.

## Cancellation

Payers SHOULD be able to cancel subscriptions before expiry.
Cancellation mechanisms are method-specific.

For an active subscription, cancellation takes effect at the end of the
current paid billing period. Servers MUST continue honoring access
already paid for through the end of that billing period.

If there is no current paid billing period, cancellation takes effect
immediately.

Servers MUST NOT collect renewal charges for billing periods after
cancellation takes effect.

## Error Responses

When a subscription cannot be used to fulfill a request, the server
MUST return an appropriate HTTP status code:

| Condition | Status Code | Behavior |
|-----------|-------------|----------|
| Subscription expired | 402 Payment Required | Issue new challenge |
| Cancellation effective or authorization revoked | 402 Payment Required | Issue new challenge |
| Current billing period unpaid or renewal failed | 402 Payment Required | Issue new challenge |
| Invalid credential | 402 Payment Required | Issue new challenge |

For all 402 responses, the server MUST include a `WWW-Authenticate`
header with a fresh challenge. Clients receiving a 402 after a
previously valid subscription SHOULD treat the subscription as no longer
usable and initiate a new subscription flow.

# Security Considerations

## Recurring Charge Awareness

Clients MUST clearly communicate that a subscription authorizes future
recurring charges without requiring a new user action for each billing
period.

## Amount and Period Verification

Clients MUST verify before activating a subscription:

1. `amount` is acceptable for the service
2. `currency` is expected
3. `periodSeconds` matches the expected billing interval
4. `subscriptionExpires` is acceptable

Clients MUST NOT rely on the `description` field for payment
verification.

## Duplicate Charge Prevention

Servers MUST prevent duplicate activation and renewal charges caused by
retries, parallel requests, or races between charging and service
delivery.

## Server Accountability

Servers operating subscriptions are responsible for:

- Secure storage of subscription authorization data
- Not charging more than once per billing period
- Honoring cancellation and revocation
- Providing transaction or billing records to payers

## Caching

Responses to subscription challenges (402 Payment Required) MUST include
`Cache-Control: no-store` to prevent sensitive payment data from being
cached by intermediaries.

Responses containing `Payment-Receipt` headers MUST include
`Cache-Control: private` to prevent shared caches from storing payment
receipts.

# IANA Considerations

## Header Field Registration

This document registers the following header fields:

| Field Name | Status | Reference |
|------------|--------|-----------|
| `Subscription-Id` | permanent | This document |

## Payment Intent Registration

This document registers the "subscription" intent in the "HTTP Payment
Intents" registry established by {{I-D.httpauth-payment}}:

| Intent | Description | Reference |
|--------|-------------|-----------|
| `subscription` | Recurring fixed-amount payment | This document |

Contact: Tempo Labs (<contact@tempo.xyz>)

--- back

# Acknowledgements

The authors thank the MPP community for their feedback on this
specification.
