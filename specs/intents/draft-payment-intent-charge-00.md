---
title: Charge Intent for HTTP Payment Authentication
abbrev: Payment Intent Charge
docname: draft-payment-intent-charge-00
category: info
ipr: trust200902
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

This document defines the abstract semantics of the "charge" intent.
Payment method specifications define how to implement this intent using
their specific payment infrastructure.

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

The `request` parameter for a "charge" intent is a JSON object with
shared fields defined by this specification and optional method-specific
extensions in the `methodDetails` field.

## Shared Fields

All payment methods implementing the "charge" intent MUST support these
shared fields, enabling clients to parse and display payment requests
consistently across methods.

### Required Fields

| Field | Type | Description |
|-------|------|-------------|
| `amount` | string | Payment amount in base units (smallest denomination) |
| `currency` | string | Currency or asset identifier (see {{currency-formats}}) |

### Optional Fields

| Field | Type | Description |
|-------|------|-------------|
| `recipient` | string | Payment recipient in method-native format |
| `expires` | string | Expiry timestamp in ISO 8601 format |
| `description` | string | Human-readable payment description |
| `externalId` | string | Merchant's reference (order ID, invoice number, etc.) |
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

Payment method specifications MUST document which currency formats they
support and how to interpret amounts for each format.

## Method Extensions

Payment methods MAY define additional fields in the `methodDetails` object.
These fields are method-specific and MUST be documented in the payment
method specification. Clients that do not recognize a payment method
SHOULD ignore `methodDetails` but MUST still be able to display the
shared fields to users.

## Examples

### Traditional Payment Processor (Stripe)

~~~ json
{
  "amount": "5000",
  "currency": "usd",
  "description": "Premium API access",
  "externalId": "order_12345",
  "methodDetails": {
    "businessNetwork": "bn_1MqDcVKA5fEO2tZvKQm9g8Yj",
    "destination": "acct_1MqE1vKB6gFP3uYw"
  }
}
~~~

### Blockchain Payment (Tempo)

~~~ json
{
  "amount": "1000000",
  "currency": "0x20c0000000000000000000000000000000000001",
  "recipient": "0x742d35Cc6634C0532925a3b844Bc9e7595f8fE00",
  "expires": "2025-01-06T12:00:00Z",
  "methodDetails": {
    "chainId": 42431,
    "feePayer": true
  }
}
~~~

### Lightning Network

~~~ json
{
  "amount": "100000",
  "currency": "sat",
  "expires": "2025-01-15T12:05:00Z",
  "methodDetails": {
    "invoice": "lnbc1000n1pj9..."
  }
}
~~~

Payment method specifications define the complete `methodDetails` schema
for their implementation of the "charge" intent.

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
