---
title: "subscription" Intent for HTTP Payment Authentication
docName: draft-payment-intent-subscription-00
version: 00
category: std
ipr: trust200902
submissionType: IETF
consensus: true

author:
  - fullname: Jake Moxey
    email: jake@tempo.xyz
    organization: Tempo Labs
---

## Abstract

This document defines the "subscription" payment intent for use with the
Payment HTTP Authentication Scheme [I-D.httpauth-payment]. The
"subscription" intent represents a recurring payment authorization where
the payer grants the server permission to charge a specified amount on
a periodic basis.

## Status of This Memo

This Internet-Draft is submitted in full conformance with the provisions
of BCP 78 and BCP 79.

## Copyright Notice

Copyright (c) 2025 IETF Trust and the persons identified as the document
authors. All rights reserved.

## Table of Contents

1. [Introduction](#1-introduction)
2. [Requirements Language](#2-requirements-language)
3. [Intent Semantics](#3-intent-semantics)
4. [Request Schema](#4-request-schema)
5. [Credential Requirements](#5-credential-requirements)
6. [Subscription Lifecycle](#6-subscription-lifecycle)
7. [Security Considerations](#7-security-considerations)
8. [IANA Considerations](#8-iana-considerations)
9. [References](#9-references)
10. [Authors' Addresses](#authors-addresses)

---

## 1. Introduction

The "subscription" intent enables recurring payments where the payer
authorizes periodic charges. Unlike "authorize" which grants a total
spending limit, "subscription" grants a per-period spending limit that
resets each billing cycle.

Common use cases:

- **SaaS subscriptions**: Monthly/annual service fees
- **API subscriptions**: Per-month API access
- **Streaming services**: Recurring content access
- **Metered services**: Usage-based billing with periodic caps

### 1.1. Relationship to "authorize"

The "subscription" intent is conceptually similar to "authorize" but
with periodic limit resets:

| Intent | Limit Scope | Resets |
|--------|-------------|--------|
| `authorize` | Total until expiry | Never |
| `subscription` | Per period | Each period |

### 1.2. Relationship to Payment Methods

Payment methods implement "subscription" using their native recurring
payment mechanisms:

| Method | Implementation |
|--------|----------------|
| Tempo | Access Keys with periodic spending limits |
| Stripe | Stripe Subscriptions API |
| Traditional | Recurring card-on-file charges |

---

## 2. Requirements Language

The key words "MUST", "MUST NOT", "REQUIRED", "SHALL", "SHALL NOT",
"SHOULD", "SHOULD NOT", "RECOMMENDED", "NOT RECOMMENDED", "MAY", and
"OPTIONAL" in this document are to be interpreted as described in
BCP 14 [RFC2119] [RFC8174] when, and only when, they appear in all
capitals, as shown here.

---

## 3. Intent Semantics

### 3.1. Definition

The "subscription" intent represents a request for the payer to grant
permission for the server to initiate recurring payments of a specified
amount per billing period.

### 3.2. Properties

| Property | Value |
|----------|-------|
| **Intent Identifier** | `subscription` |
| **Payment Timing** | Recurring (server-initiated per period) |
| **Idempotency** | Reusable within period limits |
| **Reversibility** | Cancellable |

### 3.3. Flow

```
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
```

### 3.4. Billing Periods

Standard billing periods:

| Period | Duration | Seconds |
|--------|----------|---------|
| `day` | 1 day | 86400 |
| `week` | 7 days | 604800 |
| `month` | ~30 days | 2592000 |
| `year` | ~365 days | 31536000 |

Payment method specifications MAY define custom period formats.

---

## 4. Request Schema

### 4.1. Required Fields

| Field | Type | Description |
|-------|------|-------------|
| `amount` | string/number | Amount per billing period |
| `period` | string/number | Billing period (name or seconds) |

### 4.2. Recommended Fields

| Field | Type | Description |
|-------|------|-------------|
| `currency` or `asset` | string | Currency/asset identifier |
| `expires` | string | Subscription end date (optional) |
| `cycles` | number | Maximum number of billing cycles |

### 4.3. Example

```json
{
  "amount": "10000000",
  "asset": "0x20c0000000000000000000000000000000000001",
  "period": "month",
  "expires": "2026-01-15T00:00:00Z"
}
```

Or with explicit period in seconds:

```json
{
  "amount": "9900",
  "currency": "USD",
  "period": 2592000,
  "cycles": 12
}
```

---

## 5. Credential Requirements

### 5.1. Payload

The credential `payload` for a "subscription" intent contains the
recurring authorization grant. The format is method-specific:

| Authorization Type | Description | Example Methods |
|-------------------|-------------|-----------------|
| Periodic Key Auth | Key with periodic limits | Tempo |
| Subscription Setup | Recurring billing setup | Stripe |
| Signed Mandate | Recurring payment mandate | SEPA, ACH |

### 5.2. Persistence

Subscription authorizations persist across billing periods until:

- The subscription end date is reached
- The maximum cycles are exhausted
- The payer cancels the subscription
- Payment fails (method-specific retry policies apply)

---

## 6. Subscription Lifecycle

### 6.1. Activation

When the server receives a "subscription" credential:

1. Verify the subscription authorization
2. Create the subscription record
3. Optionally charge the first period immediately
4. Return success with subscription details

### 6.2. Renewal

At each billing period boundary:

1. Server initiates charge for the period amount
2. If successful, continue subscription
3. If failed, apply retry policy (method-specific)
4. Notify payer of payment status

### 6.3. Cancellation

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

### 6.4. Modification

Some payment methods support subscription modification:

- Upgrade/downgrade amount
- Change billing period
- Update payment method

Modifications require payer consent for increases.

---

## 7. Security Considerations

### 7.1. Recurring Charge Awareness

Clients MUST clearly communicate to users that they are authorizing
recurring charges. User interfaces SHOULD:

- Display the amount per period prominently
- Show the total commitment if cycles are limited
- Indicate when the subscription expires (or if it's perpetual)

### 7.2. Period Amount Verification

Clients MUST verify:

- The amount per period is acceptable
- The billing period matches expectations
- The total commitment is understood

### 7.3. Cancellation Rights

Payers MUST have clear cancellation mechanisms. Servers MUST:

- Provide documentation on how to cancel
- Honor cancellation requests promptly
- Not impose unreasonable cancellation barriers

### 7.4. Failed Payment Handling

Servers SHOULD define clear policies for failed payments:

- Number of retry attempts
- Grace period before service suspension
- Notification to payer

### 7.5. Price Changes

If a server intends to change subscription pricing:

- Existing subscriptions SHOULD continue at original price
- Price increases require new authorization
- Payers MUST be notified of upcoming changes

---

## 8. IANA Considerations

### 8.1. Payment Intent Registration

This document registers the "subscription" intent in the "HTTP Payment
Intents" registry established by [I-D.httpauth-payment]:

| Intent | Description | Reference |
|--------|-------------|-----------|
| `subscription` | Recurring periodic payment authorization | This document |

---

## 9. References

### 9.1. Normative References

- **[RFC2119]** Bradner, S., "Key words for use in RFCs to Indicate
  Requirement Levels", BCP 14, RFC 2119, March 1997.

- **[RFC8174]** Leiba, B., "Ambiguity of Uppercase vs Lowercase in
  RFC 2119 Key Words", BCP 14, RFC 8174, May 2017.

- **[I-D.httpauth-payment]** Moxey, J., "The 'Payment' HTTP Authentication
  Scheme", draft-httpauth-payment-00.

---

## Authors' Addresses

Jake Moxey
Tempo Labs
Email: jake@tempo.xyz
