---
title: "authorize" Intent for HTTP Payment Authentication
docName: draft-payment-intent-authorize-00
version: 00
category: info
ipr: trust200902
submissionType: IETF
consensus: true

author:
  - fullname: Jake Moxey
    email: jake@tempo.xyz
    organization: Tempo Labs
---

## Abstract

This document defines the "authorize" payment intent for use with the
Payment HTTP Authentication Scheme [I-D.httpauth-payment]. The "authorize"
intent represents a pre-authorization where the payer grants the server
permission to charge up to a specified amount within a time window,
without immediate payment.

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
6. [Authorization Lifecycle](#6-authorization-lifecycle)
7. [Security Considerations](#7-security-considerations)
8. [IANA Considerations](#8-iana-considerations)
9. [References](#9-references)
10. [Authors' Addresses](#authors-addresses)

---

## 1. Introduction

The "authorize" intent enables pre-authorized payments where the payer
grants the server permission to charge up to a specified amount at a
later time. This is useful for:

- **Metered billing**: Pay-per-use APIs where total cost is unknown upfront
- **Delayed fulfillment**: Services where delivery occurs after authorization
- **Spending caps**: User-controlled limits on automated spending

Unlike the "charge" intent which requires immediate payment, "authorize"
creates a payment capability that the server can exercise later.

### 1.1. Relationship to Payment Methods

Payment methods implement "authorize" using their native authorization
mechanisms:

| Method | Implementation |
|--------|----------------|
| Tempo | Access Keys with spending limits |
| Stripe | SetupIntent + saved PaymentMethod |
| EVM | ERC-20 `approve()` or EIP-3009 authorization |

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

The "authorize" intent represents a request for the payer to grant
permission for the server to initiate payments up to a specified limit,
within a specified time window.

### 3.2. Properties

| Property | Value |
|----------|-------|
| **Intent Identifier** | `authorize` |
| **Payment Timing** | Deferred (server-initiated later) |
| **Idempotency** | Reusable within limits |
| **Reversibility** | Revocable before use |

### 3.3. Flow

```
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
```

### 3.4. Non-Atomicity

Unlike "charge", the "authorize" intent is non-atomic:

- Authorization registration is separate from payment collection
- Multiple charges may occur against a single authorization
- Total charges MUST NOT exceed the authorized limit

---

## 4. Request Schema

### 4.1. Required Fields

| Field | Type | Description |
|-------|------|-------------|
| `limit` | string/number | Maximum amount that may be charged |
| `expires` | string | Authorization expiry timestamp |

### 4.2. Recommended Fields

| Field | Type | Description |
|-------|------|-------------|
| `currency` or `asset` | string | Currency/asset identifier |
| `recipient` | string | Payment recipient (for methods that require it) |

### 4.3. Example

```json
{
  "limit": "100000000",
  "asset": "0x20c0000000000000000000000000000000000001",
  "expires": "2025-02-15T00:00:00Z"
}
```

---

## 5. Credential Requirements

### 5.1. Payload

The credential `payload` for an "authorize" intent contains the
authorization grant. The format is method-specific:

| Authorization Type | Description | Example Methods |
|-------------------|-------------|-----------------|
| Signed Key Auth | Delegated signing key | Tempo Access Keys |
| Token Approval | On-chain approval | EVM ERC-20 approve |
| Saved Payment Method | Stored card/account | Stripe SetupIntent |

### 5.2. Reusability

Unlike "charge" credentials, "authorize" credentials may enable multiple
subsequent charges. The authorization persists until:

- The expiry timestamp is reached
- The spending limit is exhausted
- The payer explicitly revokes it

---

## 6. Authorization Lifecycle

### 6.1. Registration

When the server receives an "authorize" credential:

1. Verify the authorization signature/proof
2. Store the authorization for future use
3. Return success (200) to indicate authorization accepted
4. Optionally return `Payment-Authorization` for session reuse

### 6.2. Charging

When charging against an authorization:

1. Verify the authorization is still valid (not expired, not revoked)
2. Verify sufficient limit remains
3. Execute the charge via method-specific mechanism
4. Decrement the remaining limit
5. Return `Payment-Receipt` with charge details

### 6.3. Revocation

Payers SHOULD be able to revoke authorizations before expiry. Revocation
mechanisms are method-specific:

| Method | Revocation Mechanism |
|--------|---------------------|
| Tempo | Remove Access Key from account |
| EVM | Set approval to zero |
| Stripe | Detach PaymentMethod from Customer |

### 6.4. Expiry

Servers MUST NOT charge against expired authorizations. Servers SHOULD
provide a mechanism for payers to query authorization status.

---

## 7. Security Considerations

### 7.1. Limit Verification

Clients MUST verify the requested limit is acceptable before signing.
Authorizations grant future spending capability without further user
interaction.

### 7.2. Expiry Windows

Clients SHOULD prefer short authorization windows. Long-lived
authorizations increase risk if credentials are compromised.

Recommended maximum windows:

| Use Case | Recommended Max |
|----------|-----------------|
| Single session | 1 hour |
| Daily usage | 24 hours |
| Monthly billing | 30 days |

### 7.3. Revocation Capability

Payment methods implementing "authorize" SHOULD provide revocation
mechanisms. Payers MUST be able to revoke authorizations if they suspect
compromise.

### 7.4. Authorization Scope

Authorizations SHOULD be scoped as narrowly as possible:

- Specific recipient address (not "any address")
- Specific asset/currency
- Reasonable limits and expiry

### 7.5. Server Accountability

Servers holding authorizations are responsible for:

- Secure storage of authorization data
- Not exceeding authorized limits
- Providing transaction records to payers
- Honoring revocation requests

---

## 8. IANA Considerations

### 8.1. Payment Intent Registration

This document registers the "authorize" intent in the "HTTP Payment
Intents" registry established by [I-D.httpauth-payment]:

| Intent | Description | Reference |
|--------|-------------|-----------|
| `authorize` | Pre-authorization for future charges | This document |

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
