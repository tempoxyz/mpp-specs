---
name: http-payment-auth-extension
description: Creates payment method extensions for the HTTP Payment Authentication Scheme. Use when adding support for new payment networks (Visa, Stripe, blockchains like Tempo or Base) to the protocol.
---

# HTTP Payment Auth Extension Author

Create payment method specifications for new payment networks.

## Payment Networks

Payment method extensions can be written for any payment network, including:

- **Traditional payments**: Visa, Mastercard, Stripe, PayPal
- **Blockchains**: Tempo, Base, Ethereum, Solana, Polygon
- **Layer 2 networks**: Lightning Network, Arbitrum, Optimism
- **Regional systems**: PIX, UPI, SEPA

## What is a Payment Method Extension?

A payment method extension defines how a specific payment network integrates with the HTTP Payment Authentication Scheme. It specifies:

- How servers format payment requests
- How clients create payment proofs
- How servers verify and settle payments

## Required Sections

Every payment method spec MUST define:

1. **Method Identifier** - Lowercase ASCII string (e.g., `stripe`, `tempo`, `lightning`)
2. **Payment Intents** - Supported intents (`charge`, `authorize`, `subscription`)
3. **Request Schema** - JSON for WWW-Authenticate `request` parameter
4. **Credential Schema** - JSON for Authorization `payload` field
5. **Verification Procedure** - How to validate proofs
6. **Settlement Procedure** - How payment is finalized
7. **Security Considerations** - Method-specific threats

## Reference Specifications

Before writing a new extension, study the existing specs:

| Specification | Description |
|---------------|-------------|
| [draft-ietf-httpauth-payment.md](draft-ietf-httpauth-payment.md) | Core protocol (parent spec) |
| [draft-tempo-payment-method.md](draft-tempo-payment-method.md) | Tempo blockchain extension |
| [draft-stripe-payment-method.md](draft-stripe-payment-method.md) | Stripe extension |

## IETF Submission Template

Follow IETF markdown conventions with proper frontmatter:

```markdown
---
title: {Network} Payment Method for HTTP Payment Authentication
docName: draft-{network}-payment-method-00
category: std
ipr: trust200902
submissionType: IETF
consensus: true

author:
  - fullname: Your Name
    email: your@email.com
    organization: Your Org
---

## Abstract

This document defines the "{method}" payment method for use with the Payment
HTTP Authentication Scheme [I-D.ietf-httpauth-payment].

## Status of This Memo

This Internet-Draft is submitted in full conformance with the provisions
of BCP 78 and BCP 79.

## Copyright Notice

Copyright (c) 2026 IETF Trust and the persons identified as the document
authors. All rights reserved.

## Table of Contents

1. [Introduction](#1-introduction)
2. [Requirements Language](#2-requirements-language)
3. [Terminology](#3-terminology)
4. [Method Identifier](#4-method-identifier)
5. [Payment Intents](#5-payment-intents)
6. [Request Schema](#6-request-schema)
7. [Credential Schema](#7-credential-schema)
8. [Verification Procedure](#8-verification-procedure)
9. [Settlement Procedure](#9-settlement-procedure)
10. [Security Considerations](#10-security-considerations)
11. [IANA Considerations](#11-iana-considerations)
12. [References](#12-references)
13. [Appendix: Examples](#appendix-examples)
14. [Authors' Addresses](#authors-addresses)

---

## 1. Introduction

{Describe the payment network and its key features relevant to HTTP payments.
Reference the parent spec [I-D.ietf-httpauth-payment].}

## 2. Requirements Language

The key words "MUST", "MUST NOT", "REQUIRED", "SHALL", "SHALL NOT",
"SHOULD", "SHOULD NOT", "RECOMMENDED", "NOT RECOMMENDED", "MAY", and
"OPTIONAL" in this document are to be interpreted as described in
BCP 14 [RFC2119] [RFC8174] when, and only when, they appear in all
capitals, as shown here.

## 3. Terminology

{Define network-specific terms used in this document.}

## 4. Method Identifier

This specification registers the following payment method identifier:

```
{method-name}
```

The identifier is case-sensitive and MUST be lowercase.

## 5. Payment Intents

### 5.1. Intent: "charge"

{Define one-time payment semantics for this network.}

### 5.2. Intent: "authorize" (if supported)

{Define authorization semantics.}

## 6. Request Schema

For `intent="charge"`:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `amount` | string | REQUIRED | Amount in base units |
| `asset` | string | REQUIRED | Asset/currency identifier |
| `destination` | string | REQUIRED | Recipient identifier |
| `expires` | string | REQUIRED | ISO 8601 expiry timestamp |

## 7. Credential Schema

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `type` | string | REQUIRED | Proof type identifier |

## 8. Verification Procedure

{Step-by-step verification process.}

## 9. Settlement Procedure

{Step-by-step settlement process.}

## 10. Security Considerations

### 10.1. Replay Protection
### 10.2. Amount Verification

## 11. IANA Considerations

This document registers "{method}" in the HTTP Payment Methods registry.

## 12. References

### 12.1. Normative References

- **[I-D.ietf-httpauth-payment]** "The Payment HTTP Authentication Scheme"
- **[RFC2119]** Key words for use in RFCs
- **[RFC8174]** Ambiguity of Uppercase vs Lowercase in RFC 2119 Key Words

## Appendix: Examples

### Example: Charge Flow

{Show complete request/response with realistic values.}

## Authors' Addresses

{Author name and contact information.}
```

## Workflow for New Payment Methods

### Step 1: Research the Payment Network

Look up official documentation for:
- Authentication/authorization mechanisms
- Transaction or payment request formats
- Verification APIs or cryptographic proofs
- Settlement confirmation methods
- Finality guarantees

### Step 2: Define Request Schema

What does a client need to construct a valid payment?

```json
{
  "amount": "string (base units)",
  "asset": "string (currency/token identifier)",
  "destination": "string (recipient)",
  "expires": "string (ISO 8601)"
}
```

### Step 3: Define Credential Schema

What proof does the client provide?

```json
{
  "type": "token | signature | preimage | transaction"
}
```

### Step 4: Write Verification Procedure

How does the server validate the proof?
- Signature or token verification
- Amount/recipient validation
- Expiry checks
- Replay protection

### Step 5: Write Settlement Procedure

How is payment finalized?
- API calls or transaction broadcast
- Confirmation requirements
- Receipt generation

### Step 6: Document Security Considerations

- Replay attacks
- Credential theft
- Finality delays
- Key/token management

## Example Extension Outline

```markdown
## Method Identifier
`example`

## Request Schema (charge)
| Field | Type | Description |
|-------|------|-------------|
| `amount` | string | Payment amount in base units |
| `currency` | string | Currency code (e.g., "USD") |
| `destination` | string | Recipient account identifier |
| `expires` | string | ISO 8601 expiry |

## Credential Schema
| Field | Type | Description |
|-------|------|-------------|
| `type` | string | "token" |
| `token` | string | Single-use payment token |

## Verification
1. Validate token format
2. Call payment network API to verify token
3. Confirm amount and destination match request
4. Mark token as consumed

## Settlement
1. Call payment network settlement API
2. Await confirmation
3. Return transaction reference as receipt
```
