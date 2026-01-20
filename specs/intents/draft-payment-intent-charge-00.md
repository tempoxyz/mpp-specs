---
title: "charge" Intent for HTTP Payment Authentication
docName: draft-payment-intent-charge-00
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

This document defines the "charge" payment intent for use with the Payment
HTTP Authentication Scheme [I-D.httpauth-payment]. The "charge" intent
represents a one-time payment where the payer provides proof of payment
immediately in exchange for resource access.

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
6. [Verification](#6-verification)
7. [Security Considerations](#7-security-considerations)
8. [IANA Considerations](#8-iana-considerations)
9. [References](#9-references)
10. [Authors' Addresses](#authors-addresses)

---

## 1. Introduction

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

### 1.1. Relationship to Payment Methods

This document defines the abstract semantics of the "charge" intent.
Payment method specifications define how to implement this intent using
their specific payment infrastructure.

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

The "charge" intent represents a request for immediate, one-time payment
of a specified amount in exchange for resource access.

### 3.2. Properties

| Property | Value |
|----------|-------|
| **Intent Identifier** | `charge` |
| **Payment Timing** | Immediate (before or with request) |
| **Idempotency** | Single-use per challenge |
| **Reversibility** | Method-dependent |

### 3.3. Flow

1. Server issues a 402 response with `intent="charge"`
2. Client fulfills the payment (method-specific)
3. Client submits credential with proof of payment
4. Server verifies payment and grants access
5. Server returns `Payment-Receipt` header

### 3.4. Atomicity

The "charge" intent implies atomic exchange: the server SHOULD NOT
provide partial access if payment verification fails. Either the full
resource is provided (payment succeeded) or access is denied (payment
failed).

---

## 4. Request Schema

The `request` parameter for a "charge" intent MUST include sufficient
information for the client to complete payment. At minimum, payment
method specifications MUST define:

### 4.1. Required Fields

| Field | Type | Description |
|-------|------|-------------|
| `amount` | string/number | Payment amount (method-specific format) |

### 4.2. Recommended Fields

| Field | Type | Description |
|-------|------|-------------|
| `currency` or `asset` | string | Currency/asset identifier |
| `recipient` | string | Payment recipient (method-specific format) |
| `expires` | string | Expiry timestamp for this request |

### 4.3. Example

```json
{
  "amount": "1000",
  "currency": "USD",
  "recipient": "acct_123",
  "expires": "2025-01-15T12:05:00Z"
}
```

Payment method specifications define the complete schema for their
implementation of the "charge" intent.

---

## 5. Credential Requirements

### 5.1. Payload

The credential `payload` for a "charge" intent MUST contain proof that
payment has been made or authorized. The proof type is method-specific:

| Proof Type | Description | Example Methods |
|------------|-------------|-----------------|
| Preimage | Hash preimage proving invoice payment | Lightning |
| Signature | Signed transaction authorization | Tempo, EVM |
| Confirmation | Payment processor confirmation ID | Stripe |
| Transaction | Transaction hash on public ledger | Bitcoin, Ethereum |

### 5.2. Single-Use

Each credential MUST be usable only once per challenge. Servers MUST
reject replayed credentials.

---

## 6. Verification

### 6.1. Server Responsibilities

Servers verifying a "charge" credential MUST:

1. Verify the `id` matches an outstanding challenge
2. Verify the challenge has not expired
3. Verify the payment proof using method-specific procedures
4. Verify the payment amount matches the request
5. Verify the payment recipient matches the request

### 6.2. Settlement

Settlement semantics are method-specific:

- **Immediate settlement**: Payment is final upon verification
  (e.g., Lightning preimage, confirmed blockchain transaction)
- **Deferred settlement**: Server submits payment after verification
  (e.g., signed authorization submitted to chain)
- **Processor settlement**: External processor handles settlement
  (e.g., Stripe PaymentIntent)

---

## 7. Security Considerations

### 7.1. Amount Verification

Clients MUST verify the requested amount is appropriate for the resource
before authorizing payment. Malicious servers could request excessive
amounts.

### 7.2. Recipient Verification

Clients SHOULD verify the payment recipient when possible. For methods
that support recipient verification (e.g., known merchant addresses),
clients SHOULD warn users about unknown recipients.

### 7.3. Replay Protection

Servers MUST implement replay protection. Each challenge `id` MUST be
single-use. Servers MUST NOT accept the same credential twice.

### 7.4. Finality

The finality of a "charge" payment depends on the payment method:

- Some methods provide instant finality (Lightning)
- Some methods may have delayed finality (blockchain confirmations)
- Some methods may be reversible (card chargebacks)

Servers SHOULD understand the finality guarantees of their accepted
payment methods and adjust resource access accordingly.

---

## 8. IANA Considerations

### 8.1. Payment Intent Registration

This document registers the "charge" intent in the "HTTP Payment Intents"
registry established by [I-D.httpauth-payment]:

| Intent | Description | Reference |
|--------|-------------|-----------|
| `charge` | One-time immediate payment | This document |

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
