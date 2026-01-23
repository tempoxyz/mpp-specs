---
title: authorize Intent for HTTP Payment Authentication
abbrev: Payment Intent Authorize
docname: draft-payment-intent-authorize-00
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

This document defines the "authorize" payment intent for use with the
Payment HTTP Authentication Scheme {{I-D.httpauth-payment}}. The "authorize"
intent represents a pre-authorization where the payer grants the server
permission to charge up to a specified amount within a time window,
without immediate payment.

--- middle

# Introduction

The "authorize" intent enables pre-authorized payments where the payer
grants the server permission to charge up to a specified amount at a
later time. This is useful for:

- **Metered billing**: Pay-per-use APIs where total cost is unknown upfront
- **Delayed fulfillment**: Services where delivery occurs after authorization
- **Spending caps**: User-controlled limits on automated spending

Unlike the "charge" intent which requires immediate payment, "authorize"
creates a payment capability that the server can exercise later.

## Relationship to Payment Methods

Payment methods implement "authorize" using their native authorization
mechanisms:

| Method | Implementation |
|--------|----------------|
| Tempo | Access Keys with spending limits |
| Stripe | SetupIntent + saved PaymentMethod |
| EVM | ERC-20 `approve()` or EIP-3009 authorization |

# Requirements Language

{::boilerplate bcp14-tagged}

# Intent Semantics

## Definition

The "authorize" intent represents a request for the payer to grant
permission for the server to initiate payments up to a specified limit,
within a specified time window.

## Properties

| Property | Value |
|----------|-------|
| **Intent Identifier** | `authorize` |
| **Payment Timing** | Deferred (server-initiated later) |
| **Idempotency** | Reusable within limits |
| **Reversibility** | Revocable before use |

## Flow

~~~
   Client                           Server                    Payment Network
      │                                │                              │
      │  (1) GET /resource             │                              │
      ├───────────────────────────────>│                              │
      │                                │                              │
      │  (2) 402 Payment Required      │                              │
      │      intent="authorize"        │                              │
      │<───────────────────────────────┤                              │
      │                                │                              │
      │  (3) Sign authorization        │                              │
      │                                │                              │
      │  (4) Authorization: Payment    │                              │
      ├───────────────────────────────>│                              │
      │                                │                              │
      │                                │  (5) Register authorization  │
      │                                ├─────────────────────────────>│
      │                                │                              │
      │  (6) 200 OK (authorized)       │                              │
      │<───────────────────────────────┤                              │
      │                                │                              │
      │        ... later ...           │                              │
      │                                │                              │
      │  (7) GET /resource             │                              │
      ├───────────────────────────────>│                              │
      │                                │  (8) Charge via auth         │
      │                                ├─────────────────────────────>│
      │                                │                              │
      │  (9) 200 OK + Receipt          │                              │
      │<───────────────────────────────┤                              │
      │                                │                              │
~~~

## Non-Atomicity

Unlike "charge", the "authorize" intent is non-atomic:

- Authorization registration is separate from payment collection
- Multiple charges may occur against a single authorization
- Total charges MUST NOT exceed the authorized limit

# Request Schema

## Required Fields

| Field | Type | Description |
|-------|------|-------------|
| `limit` | string/number | Maximum amount that may be charged |
| `expires` | string | Authorization expiry timestamp |

## Recommended Fields

| Field | Type | Description |
|-------|------|-------------|
| `currency` or `asset` | string | Currency/asset identifier |
| `recipient` | string | Payment recipient (for methods that require it) |

## Example

~~~ json
{
  "limit": "100000000",
  "asset": "0x20c0000000000000000000000000000000000001",
  "expires": "2025-02-15T00:00:00Z"
}
~~~

# Credential Requirements

## Payload

The credential `payload` for an "authorize" intent contains the
authorization grant. The format is method-specific:

| Authorization Type | Description | Example Methods |
|-------------------|-------------|-----------------|
| Signed Key Auth | Delegated signing key | Tempo Access Keys |
| Token Approval | On-chain approval | EVM ERC-20 approve |
| Saved Payment Method | Stored card/account | Stripe SetupIntent |

## Reusability

Unlike "charge" credentials, "authorize" credentials may enable multiple
subsequent charges. The authorization persists until:

- The expiry timestamp is reached
- The spending limit is exhausted
- The payer explicitly revokes it

# Authorization Lifecycle

## Registration

When the server receives an "authorize" credential:

1. Verify the authorization signature/proof
2. Store the authorization for future use
3. Return success (200) to indicate authorization accepted
4. Optionally return `Payment-Authorization` for session reuse

## Charging

When charging against an authorization:

1. Verify the authorization is still valid (not expired, not revoked)
2. Verify sufficient limit remains
3. Execute the charge via method-specific mechanism
4. Decrement the remaining limit
5. Return `Payment-Receipt` with charge details

## Revocation

Payers SHOULD be able to revoke authorizations before expiry. Revocation
mechanisms are method-specific:

| Method | Revocation Mechanism |
|--------|---------------------|
| Tempo | Remove Access Key from account |
| EVM | Set approval to zero |
| Stripe | Detach PaymentMethod from Customer |

## Expiry

Servers MUST NOT charge against expired authorizations. Servers SHOULD
provide a mechanism for payers to query authorization status.

# Security Considerations

## Limit Verification

Clients MUST verify the requested limit is acceptable before signing.
Authorizations grant future spending capability without further user
interaction.

## Expiry Windows

Clients SHOULD prefer short authorization windows. Long-lived
authorizations increase risk if credentials are compromised.

Recommended maximum windows:

| Use Case | Recommended Max |
|----------|-----------------|
| Single session | 1 hour |
| Daily usage | 24 hours |
| Monthly billing | 30 days |

## Revocation Capability

Payment methods implementing "authorize" SHOULD provide revocation
mechanisms. Payers MUST be able to revoke authorizations if they suspect
compromise.

## Authorization Scope

Authorizations SHOULD be scoped as narrowly as possible:

- Specific recipient address (not "any address")
- Specific asset/currency
- Reasonable limits and expiry

## Server Accountability

Servers holding authorizations are responsible for:

- Secure storage of authorization data
- Not exceeding authorized limits
- Providing transaction records to payers
- Honoring revocation requests

# IANA Considerations

## Payment Intent Registration

This document registers the "authorize" intent in the "HTTP Payment
Intents" registry established by {{I-D.httpauth-payment}}:

| Intent | Description | Reference |
|--------|-------------|-----------|
| `authorize` | Pre-authorization for future charges | This document |
