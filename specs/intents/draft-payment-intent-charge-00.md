---
title: charge Intent for HTTP Payment Authentication
abbrev: Payment Intent Charge
docname: draft-payment-intent-charge-00
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

This document defines the "charge" payment intent for use with the Payment
HTTP Authentication Scheme {{I-D.httpauth-payment}}. The "charge" intent
represents a one-time payment where the payer provides proof of payment
immediately in exchange for resource access.

--- middle

# Introduction

The "charge" intent is the most fundamental payment pattern: a one-time
exchange of payment for resource access. The payer provides proof of
payment (or a signed authorization to collect payment), and the server
grants access to the requested resource.

This intent applies to any payment method that supports immediate payment
verification, including:

- Invoice-based systems (preimage revelation)
- Signed transaction authorization
- Token-based payment confirmation
- Traditional payment processor confirmation

## Relationship to Payment Methods

This document defines the flow semantics of the "charge" intent. The
`request` schema is defined by each payment method specification, not
by this document. Payment method specifications define how to implement
this intent using their specific payment infrastructure, including the
exact fields and formats for payment requests.

# Requirements Language

{::boilerplate bcp14-tagged}

# Intent Semantics

## Definition

The "charge" intent represents a request for immediate, one-time payment
of a specified amount in exchange for resource access.

## Properties

| Property | Value |
|----------|-------|
| **Intent Identifier** | `charge` |
| **Payment Timing** | Immediate (before or with request) |
| **Idempotency** | Single-use per challenge |
| **Reversibility** | Method-dependent |

## Flow

1. Server issues a 402 response with `intent="charge"`
2. Client fulfills the payment (method-specific)
3. Client submits credential with proof of payment
4. Server verifies payment and grants access
5. Server returns `Payment-Receipt` header

## Atomicity

The "charge" intent implies atomic exchange: the server SHOULD NOT
provide partial access if payment verification fails. Either the full
resource is provided (payment succeeded) or access is denied (payment
failed).

# Request Schema

The `request` parameter schema is defined by each payment method
specification. This section describes common patterns that payment
methods SHOULD follow for interoperability.

## Amount Representation

The `amount` field MUST be a string containing a non-negative integer
representing the payment amount in the asset's smallest indivisible unit:

- For fiat currencies: minor units (e.g., cents for USD, pence for GBP)
- For cryptocurrencies: base units (e.g., wei for ETH, satoshis for BTC)
- For TIP-20 tokens: base units (6 decimal places, so 1.00 = "1000000")

Implementations MUST NOT use floating-point representations to avoid
precision loss with large values or decimal arithmetic errors.

## Common Fields

Payment method specifications typically include:

| Field | Type | Description |
|-------|------|-------------|
| `amount` | string | Payment amount in base units (REQUIRED) |
| `asset` | string | Asset/currency identifier (REQUIRED) |
| `recipient` | string | Payment recipient (method-specific format) |
| `expires` | string | Expiry timestamp (RFC 3339 format) |

## Example

~~~ json
{
  "amount": "100000",
  "asset": "USD",
  "recipient": "acct_123",
  "expires": "2025-01-15T12:05:00Z"
}
~~~

This example represents a payment of 1000.00 USD (100000 cents).

# Credential Requirements

## Payload

The credential `payload` for a "charge" intent MUST contain proof that
payment has been made or authorized. The proof type is method-specific:

| Proof Type | Description | Example Methods |
|------------|-------------|-----------------|
| Preimage | Hash preimage proving invoice payment | Lightning |
| Signature | Signed transaction authorization | Tempo, EVM |
| Confirmation | Payment processor confirmation ID | Stripe |
| Transaction | Transaction hash on public ledger | Bitcoin, Ethereum |

## Single-Use

Each credential MUST be usable only once per challenge. Servers MUST
reject replayed credentials.

# Verification

## Server Responsibilities

Servers verifying a "charge" credential MUST:

1. Verify the `id` matches an outstanding challenge
2. Verify the challenge has not expired
3. Verify the payment proof using method-specific procedures
4. Verify the payment amount matches the request
5. Verify the payment recipient matches the request

## Settlement

Settlement semantics are method-specific:

- **Immediate settlement**: Payment is final upon verification
  (e.g., Lightning preimage, confirmed blockchain transaction)
- **Deferred settlement**: Server submits payment after verification
  (e.g., signed authorization submitted to chain)
- **Processor settlement**: External processor handles settlement
  (e.g., Stripe PaymentIntent)

# Security Considerations

## Amount Verification

Clients MUST verify the requested amount is appropriate for the resource
before authorizing payment. Malicious servers could request excessive
amounts.

## Recipient Verification

Clients SHOULD verify the payment recipient when possible. For methods
that support recipient verification (e.g., known merchant addresses),
clients SHOULD warn users about unknown recipients.

## Replay Protection

Servers MUST implement replay protection. Each challenge `id` MUST be
single-use. Servers MUST NOT accept the same credential twice.

## Finality

The finality of a "charge" payment depends on the payment method:

- Some methods provide instant finality (Lightning)
- Some methods may have delayed finality (blockchain confirmations)
- Some methods may be reversible (card chargebacks)

Servers SHOULD understand the finality guarantees of their accepted
payment methods and adjust resource access accordingly.

# IANA Considerations

## Payment Intent Registration

This document registers the "charge" intent in the "HTTP Payment Intents"
registry established by {{I-D.httpauth-payment}}:

| Intent | Description | Reference |
|--------|-------------|-----------|
| `charge` | One-time immediate payment | This document |
