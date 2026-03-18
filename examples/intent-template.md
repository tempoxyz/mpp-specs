---
title: "{name}" Intent for HTTP Payment Authentication
abbrev: "{name}" Intent
docname: draft-payment-intent-{name}-00
version: 00
category: std
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

This document defines the "{name}" payment intent for use with the Payment
HTTP Authentication Scheme [I-D.httpauth-payment]. The "{name}" intent
represents [one-sentence description of what this intent does].

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

[Describe the payment pattern this intent represents. Include:]
- What problem does it solve?
- When would a server use this intent?
- How is it different from existing intents?

### 1.1. Use Cases

[List 3-5 concrete use cases for this intent]

- **Use case 1**: Description
- **Use case 2**: Description
- **Use case 3**: Description

### 1.2. Relationship to Payment Methods

[Explain how payment methods would implement this intent]

| Method | Implementation |
|--------|----------------|
| Example1 | How Example1 would implement this |
| Example2 | How Example2 would implement this |

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

The "{name}" intent represents [formal definition].

### 3.2. Properties

| Property | Value |
|----------|-------|
| **Intent Identifier** | `{name}` |
| **Payment Timing** | [Immediate / Deferred / Recurring] |
| **Idempotency** | [Single-use / Reusable] |
| **Reversibility** | [Method-dependent / Revocable / Final] |

### 3.3. Flow

```
   Client                           Server                    Payment Network
      │                                │                              │
      │  (1) GET /resource             │                              │
      ├───────────────────────────────>│                              │
      │                                │                              │
      │  (2) 402 Payment Required      │                              │
      │      intent="{name}"           │                              │
      │<───────────────────────────────┤                              │
      │                                │                              │
      │  [Describe remaining flow]     │                              │
      │                                │                              │
```

### 3.4. [Additional Semantic Properties]

[Describe any special semantic properties: atomicity, ordering, etc.]

---

## 4. Request Schema

The `request` parameter for a "{name}" intent MUST include:

### 4.1. Required Fields

| Field | Type | Description |
|-------|------|-------------|
| `field1` | string | Description |
| `field2` | number | Description |

### 4.2. Optional Fields

| Field | Type | Description |
|-------|------|-------------|
| `optionalField` | string | Description |

### 4.3. Example

```json
{
  "field1": "value",
  "field2": 1000
}
```

---

## 5. Credential Requirements

### 5.1. Payload

The credential `payload` for a "{name}" intent MUST contain:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `proof` | object | Yes | Method-specific proof |

### 5.2. Proof Types

[Describe what types of proofs are acceptable]

| Proof Type | Description | Example Methods |
|------------|-------------|-----------------|
| Type1 | Description | Methods that use it |

### 5.3. [Reusability / Validity]

[Describe if credentials can be reused, validity windows, etc.]

---

## 6. Verification

### 6.1. Server Responsibilities

Servers verifying a "{name}" credential MUST:

1. Verify the `id` matches an outstanding challenge
2. Verify the challenge has not expired
3. [Additional verification steps]

### 6.2. Settlement

[Describe settlement semantics: when is payment finalized?]

---

## 7. Security Considerations

### 7.1. [Threat 1]

[Describe threat and mitigation]

### 7.2. [Threat 2]

[Describe threat and mitigation]

### 7.3. [Threat 3]

[Describe threat and mitigation]

---

## 8. IANA Considerations

### 8.1. Payment Intent Registration

This document registers the "{name}" intent in the "HTTP Payment Intents"
registry established by [I-D.httpauth-payment]:

| Intent | Description | Reference |
|--------|-------------|-----------|
| `{name}` | [Brief description] | This document |

---

## 9. References

### 9.1. Normative References

- **[RFC2119]** Bradner, S., "Key words for use in RFCs to Indicate
  Requirement Levels", BCP 14, RFC 2119, March 1997.

- **[RFC8174]** Leiba, B., "Ambiguity of Uppercase vs Lowercase in
  RFC 2119 Key Words", BCP 14, RFC 8174, May 2017.

- **[I-D.httpauth-payment]** Moxey, J., "The 'Payment' HTTP Authentication
  Scheme", draft-httpauth-payment-00.

### 9.2. Informative References

[Add any informative references]

---

## Authors' Addresses

Your Name
Your Organization
Email: you@example.com
