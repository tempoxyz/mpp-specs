---
title: Authorize Intent for HTTP Payment Authentication
abbrev: Payment Intent Authorize
docname: draft-payment-intent-authorize-00
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
    target: https://datatracker.ietf.org/doc/draft-httpauth-payment/
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

This document defines the "authorize" payment intent for use with the
Payment HTTP Authentication Scheme. The "authorize" intent represents a
pre-authorization where the payer grants the server permission to charge
up to a specified amount within a time window, without immediate payment.

--- middle

# Introduction

The "authorize" intent enables pre-authorized payments where the payer
grants the server permission to charge up to a specified amount at a
later time. This is useful for:

Metered billing:
: Pay-per-use APIs where total cost is unknown upfront

Delayed fulfillment:
: Services where delivery occurs after authorization

Spending caps:
: User-controlled limits on automated spending

Unlike the "charge" intent which requires immediate payment, "authorize"
creates a payment capability that the server can exercise later.

## Relationship to Payment Methods

Payment methods implement "authorize" using method-specific
authorization mechanisms. This document defines the abstract semantics
and shared request fields; payment method specifications define how
those semantics are enforced.

# Requirements Language

{::boilerplate bcp14-tagged}

# Terminology

Authorization
: A grant of permission for a server to initiate payments up to a
  specified limit within a specified time window, without requiring
  immediate payment.

Spending Limit
: The maximum amount that can be charged against an authorization
  before it is exhausted.

Revocation
: The act of canceling an authorization before its natural expiry,
  preventing further charges.

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
| **Idempotency** | Credential single-use; authorization reusable within limits |
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

The `request` parameter for an "authorize" intent is a JSON object with
shared fields defined by this specification and optional method-specific
extensions in the `methodDetails` field. The `request` JSON MUST be
serialized using JSON Canonicalization Scheme (JCS) {{RFC8785}} and
base64url-encoded without padding per {{I-D.httpauth-payment}}.

## Shared Fields

All payment methods implementing the "authorize" intent MUST support these
shared fields, enabling clients to parse and display authorization requests
consistently across methods. Payment methods MAY elevate OPTIONAL fields
to REQUIRED in their method specification.

### Required Fields

| Field | Type | Description |
|-------|------|-------------|
| `amount` | string | Maximum authorization amount in base units (stringified non-negative integer, no leading zeros) |
| `currency` | string | Currency or asset identifier (see {{currency-formats}}) |
| `authorizationExpires` | string | Authorization expiry timestamp in {{RFC3339}} format |

The `amount` value MUST be a string representation of a non-negative
integer in base 10 with no sign, decimal point, exponent, or
surrounding whitespace. Leading zeros MUST NOT be used except for the
value `"0"`.

### Optional Fields

| Field | Type | Description |
|-------|------|-------------|
| `recipient` | string | Payment recipient in method-native format |
| `description` | string | Human-readable authorization description |
| `externalId` | string | Merchant's reference (order ID, etc.) |
| `methodDetails` | object | Method-specific extension data |

Challenge expiry is conveyed by the `expires` auth-param in
`WWW-Authenticate` per {{I-D.httpauth-payment}}, using {{RFC3339}}
format. Request objects MUST NOT duplicate the challenge expiry value.
The `authorizationExpires` field instead defines when the authorization
itself expires.

The `authorizationExpires` value MUST be strictly later than the
challenge `expires` timestamp. Servers MUST reject credentials where
`authorizationExpires` is at or before the challenge `expires`.

## Currency Formats {#currency-formats}

The `currency` field supports multiple formats to accommodate different
payment networks:

| Format | Example | Description |
|--------|---------|-------------|
| ISO 4217 | `"usd"`, `"eur"` | Fiat currencies (lowercase) |
| Token address | `"0x20c0..."` | ERC-20, TIP-20, or similar token contracts |
| Method-defined | (varies) | Payment method-specific currency identifiers |

Payment method specifications MUST document which currency formats they
support and how to interpret amounts for each format.

## Method Extensions

Payment methods MAY define additional fields in the `methodDetails` object.
These fields are method-specific and MUST be documented in the payment
method specification.

## Examples

### Traditional Payment Processor (Stripe)

~~~ json
{
  "amount": "100000",
  "currency": "usd",
  "authorizationExpires": "2025-01-22T12:00:00Z",
  "description": "Pre-authorization for metered API usage",
  "methodDetails": {
    "captureMethod": "manual"
  }
}
~~~

### Blockchain Payment (Tempo)

~~~ json
{
  "amount": "50000000",
  "currency": "0x20c0000000000000000000000000000000000001",
  "authorizationExpires": "2025-02-05T12:00:00Z",
  "methodDetails": {
    "chainId": 42431
  }
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

Each "authorize" credential MUST be usable only once per challenge.
Servers MUST reject replayed credentials.

A successfully registered authorization may enable multiple subsequent
charges. The authorization persists until:

- The `authorizationExpires` timestamp is reached
- The spending limit is exhausted
- The payer explicitly revokes it

# Authorization Lifecycle

## Registration

When the server receives an "authorize" credential:

1. Verify the authorization signature/proof
2. Store the authorization for future use
3. Initialize durable state for the authorization, including its
   remaining authorized amount
4. Return success (200) to indicate authorization accepted
5. Return success response; session reuse mechanisms are out of scope
   for this specification

Registration responses for `intent="authorize"` MUST NOT include a
`Payment-Receipt` header. `Payment-Receipt` is reserved for later
successful responses that actually consume authorized value.

## Server Accounting and Idempotency

Servers MUST maintain durable authorization state sufficient to enforce
remaining limits across concurrent requests and retries.

At minimum, servers MUST track:

- Authorization identifier
- Remaining authorized amount
- Authorization expiry
- Revocation status

When charging against an authorization, servers MUST perform the limit
check and decrement atomically before, or atomically with, delivering the
corresponding service.

For retried requests, clients SHOULD send an `Idempotency-Key` header per {{I-D.ietf-httpapi-idempotency-key-header}}.
Servers MUST NOT decrement the remaining authorized amount more than once
for a duplicate idempotent request.

## Charging

When charging against an authorization:

1. Verify the authorization is still valid (not expired, not revoked)
2. Verify sufficient limit remains
3. Execute the charge via method-specific mechanism
4. Decrement the remaining limit atomically with service delivery
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

## Error Responses

When an authorization cannot be used to fulfill a request, the server
MUST return an appropriate HTTP status code:

| Condition | Status Code | Behavior |
|-----------|-------------|----------|
| Authorization expired | 402 Payment Required | Issue new challenge |
| Spending limit exhausted | 402 Payment Required | Issue new challenge |
| Authorization revoked | 402 Payment Required | Issue new challenge |
| Invalid credential | 401 Unauthorized | Reject credential |

For all 402 responses, the server MUST include a `WWW-Authenticate`
header with a fresh challenge. Clients receiving a 402 after a
previously valid authorization SHOULD treat the authorization as
exhausted and initiate a new authorization flow.

# Security Considerations

## Limit Verification

Clients MUST verify the requested limit is acceptable before signing.
Authorizations grant future spending capability without further user
interaction.

Clients MUST verify `authorizationExpires` is not unreasonably far in the
future.

## Expiry Windows

Clients SHOULD prefer short authorization windows. Long-lived
authorizations increase risk if credentials are compromised.

Recommended maximum windows:

| Use Case | Recommended Max |
|----------|-----------------|
| Single session | 1 hour |
| Daily usage | 24 hours |
| Monthly billing | 30 days |

These values are informational guidance. Deployments SHOULD evaluate
their own risk tolerance and adjust authorization windows accordingly.

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

## Caching

Responses to authorization challenges (402 Payment Required) and
responses that consume authorized value SHOULD include
`Cache-Control: no-store` to prevent sensitive payment data from being
cached by intermediaries.

# IANA Considerations

## Payment Intent Registration

This document registers the "authorize" intent in the "HTTP Payment
Intents" registry established by {{I-D.httpauth-payment}}:

| Intent | Description | Reference |
|--------|-------------|-----------|
| `authorize` | Pre-authorization for future charges | This document |

--- back

# Acknowledgements

The authors thank the MPP community for their feedback on this
specification.


