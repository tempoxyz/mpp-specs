---
title: "{Network}" Payment Method for HTTP Payment Authentication
abbrev: "{Network}" Payment Method
docname: draft-{network}-payment-method-00
version: 00
category: info
ipr: noModificationTrust200902
submissiontype: IETF
consensus: true

author:
  - name: Your Name
    ins: Y. Name
    email: you@example.com
    org: Your Organization
---

## Abstract

This document defines the "{network}" payment method for use with the Payment
HTTP Authentication Scheme [I-D.httpauth-payment]. It specifies how clients
and servers exchange payments using [Network Name]'s payment infrastructure.

## Status of This Memo

This Internet-Draft is submitted in full conformance with the provisions
of BCP 78 and BCP 79.

## Copyright Notice

Copyright (c) 2025 IETF Trust and the persons identified as the document
authors. All rights reserved.

## Table of Contents

1. [Introduction](#1-introduction)
2. [Requirements Language](#2-requirements-language)
3. [Terminology](#3-terminology)
4. [Method Identifier](#4-method-identifier)
5. [Supported Intents](#5-supported-intents)
6. [Intent: "charge"](#6-intent-charge)
7. [Intent: "authorize"](#7-intent-authorize)
8. [Intent: "subscription"](#8-intent-subscription)
9. [Verification Procedure](#9-verification-procedure)
10. [Settlement Procedure](#10-settlement-procedure)
11. [Security Considerations](#11-security-considerations)
12. [IANA Considerations](#12-iana-considerations)
13. [References](#13-references)
14. [Appendix A: Examples](#appendix-a-examples)
15. [Authors' Addresses](#authors-addresses)

---

## 1. Introduction

[Describe the payment network/infrastructure this method uses]

This specification supports the following intents:

- **charge**: [How this method implements one-time payments]
- **authorize**: [How this method implements pre-authorization] (optional)
- **subscription**: [How this method implements recurring payments] (optional)

### 1.1. Payment Flow

```
   Client                                            Server
      │                                                 │
      │  (1) GET /resource                              │
      ├────────────────────────────────────────────────>│
      │                                                 │
      │  (2) 402 Payment Required                       │
      │      WWW-Authenticate: Payment method="{network}"
      │<────────────────────────────────────────────────┤
      │                                                 │
      │  (3) [Method-specific payment process]          │
      │                                                 │
      │  (4) GET /resource                              │
      │      Authorization: Payment <credential>        │
      ├────────────────────────────────────────────────>│
      │                                                 │
      │  (5) [Server verifies/settles]                  │
      │                                                 │
      │  (6) 200 OK                                     │
      │      Payment-Receipt: <receipt>                 │
      │<────────────────────────────────────────────────┤
```

### 1.2. Relationship to the Payment Scheme

This document is a payment method specification as defined in Section 9.1
of [I-D.httpauth-payment]. It defines the `request` and `payload`
structures for the "{network}" payment method.

---

## 2. Requirements Language

The key words "MUST", "MUST NOT", "REQUIRED", "SHALL", "SHALL NOT",
"SHOULD", "SHOULD NOT", "RECOMMENDED", "NOT RECOMMENDED", "MAY", and
"OPTIONAL" in this document are to be interpreted as described in
BCP 14 [RFC2119] [RFC8174] when, and only when, they appear in all
capitals, as shown here.

---

## 3. Terminology

**[Term 1]**
: Definition of term 1

**[Term 2]**
: Definition of term 2

**[Term 3]**
: Definition of term 3

---

## 4. Method Identifier

This specification registers the following payment method identifier:

```
{network}
```

The identifier is case-sensitive and MUST be lowercase.

## 5. Supported Intents

This method supports the following intents:

| Intent | Support | Reference |
|--------|---------|-----------|
| `charge` | REQUIRED | Section 6 |
| `authorize` | OPTIONAL | Section 7 |
| `subscription` | OPTIONAL | Section 8 |

---

## 6. Intent: "charge"

### 6.1. Request Schema

For `intent="charge"`, the `request` parameter contains:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `amount` | string | REQUIRED | Amount in [units] |
| `asset` | string | REQUIRED | Asset identifier |
| `recipient` | string | REQUIRED | Recipient address/identifier |
| `expires` | string | REQUIRED | Expiry timestamp |

**Example:**

```json
{
  "amount": "1000000",
  "asset": "USD",
  "recipient": "acct_123",
  "expires": "2025-01-15T12:05:00Z"
}
```

### 6.2. Credential Payload

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `type` | string | REQUIRED | Payload type identifier |
| `proof` | string | REQUIRED | Method-specific proof |

**Example:**

```json
{
  "type": "transaction",
  "proof": "0xabc123..."
}
```

### 6.3. Verification

To verify a "charge" credential:

1. [Step 1]
2. [Step 2]
3. [Step 3]

### 6.4. Settlement

[Describe how payment is finalized for charge]

---

## 7. Intent: "authorize"

[If your method supports authorize, describe it here. Otherwise, remove this section.]

### 7.1. Request Schema

[Define request schema for authorize]

### 7.2. Credential Payload

[Define payload schema for authorize]

### 7.3. Verification

[Describe verification for authorize]

### 7.4. Charging Against Authorization

[Describe how the server charges against the authorization later]

---

## 8. Intent: "subscription"

[If your method supports subscription, describe it here. Otherwise, remove this section.]

### 8.1. Request Schema

[Define request schema for subscription]

### 8.2. Credential Payload

[Define payload schema for subscription]

### 8.3. Verification

[Describe verification for subscription]

### 8.4. Recurring Charges

[Describe how recurring charges work]

---

## 9. Verification Procedure

[General verification procedure applicable to all intents]

Servers MUST:

1. Verify the `id` matches an outstanding challenge
2. Verify the challenge has not expired
3. [Method-specific verification steps]

---

## 10. Settlement Procedure

[Describe how payment settlement works]

### 10.1. Settlement Timing

[Immediate vs deferred settlement]

### 10.2. Finality

[When is payment considered final?]

### 10.3. Failure Handling

[What happens if settlement fails?]

---

## 11. Security Considerations

### 11.1. Transport Security

All communication MUST use TLS 1.2 or higher. [Method] credentials MUST
only be transmitted over HTTPS connections.

### 11.2. Credential Security

[Describe credential handling requirements]

### 11.3. Replay Protection

[Describe replay protection mechanism]

### 11.4. [Method-specific Threat 1]

[Describe threat and mitigation]

### 11.5. [Method-specific Threat 2]

[Describe threat and mitigation]

---

## 12. IANA Considerations

### 12.1. Payment Method Registration

This specification registers the "{network}" payment method in the Payment
Method Registry per Section 12.3 of [I-D.httpauth-payment]:

| Field | Value |
|-------|-------|
| Method Identifier | `{network}` |
| Description | [Brief description] |
| Reference | This document |
| Contact | [Contact info] |

---

## 13. References

### 13.1. Normative References

- **[RFC2119]** Bradner, S., "Key words for use in RFCs to Indicate
  Requirement Levels", BCP 14, RFC 2119, March 1997.

- **[RFC8174]** Leiba, B., "Ambiguity of Uppercase vs Lowercase in
  RFC 2119 Key Words", BCP 14, RFC 8174, May 2017.

- **[I-D.httpauth-payment]** Moxey, J., "The 'Payment' HTTP Authentication
  Scheme", draft-httpauth-payment-00.

- **[I-D.payment-intent-charge]** Moxey, J., "'charge' Intent for HTTP
  Payment Authentication", draft-payment-intent-charge-00.

### 13.2. Informative References

[Add network-specific references: API docs, protocol specs, etc.]

---

## Appendix A: Examples

### A.1. Charge Example

**Challenge:**

```http
HTTP/1.1 402 Payment Required
WWW-Authenticate: Payment id="abc123",
  realm="api.example.com",
  method="{network}",
  intent="charge",
  request="[base64url-encoded request]"
```

**Credential:**

```http
GET /resource HTTP/1.1
Host: api.example.com
Authorization: Payment [base64url-encoded credential]
```

**Response:**

```http
HTTP/1.1 200 OK
Payment-Receipt: [base64url-encoded receipt]
```

### A.2. [Additional Examples]

[Add more examples as needed]

---

## Authors' Addresses

Your Name
Your Organization
Email: you@example.com
