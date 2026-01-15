# IETF Payment Authentication Scheme

## Overview

This repository contains the specification for the HTTP "Payment" Authentication Scheme (draft-ietf-httpauth-payment) and its payment method extensions. This protocol enables HTTP 402 "Payment Required" responses to carry structured payment challenges that clients can fulfill.

## Repository Structure

| File | Description |
|------|-------------|
| `draft-ietf-httpauth-payment.md` | Core protocol specification (the parent spec) |
| `draft-tempo-payment-method.md` | Tempo blockchain payment method extension |
| `draft-stripe-payment-method.md` | Stripe payment method extension |
| `gen.sh` | Script to generate HTML/XML from markdown specs |

## Key Concepts

### The Payment Protocol Flow

```
Client                                            Server
   │                                                 │
   │  (1) GET /resource                              │
   ├────────────────────────────────────────────────>│
   │                                                 │
   │  (2) 402 Payment Required                       │
   │      WWW-Authenticate: Payment id="..",         │
   │        method="..", intent="..", request=".."   │
   │<────────────────────────────────────────────────┤
   │                                                 │
   │  (3) Client fulfills payment challenge          │
   │                                                 │
   │  (4) GET /resource                              │
   │      Authorization: Payment <credential>        │
   ├────────────────────────────────────────────────>│
   │                                                 │
   │  (5) 200 OK                                     │
   │      Payment-Receipt: <receipt>                 │
   │<────────────────────────────────────────────────┤
```

### Core Headers

- **WWW-Authenticate: Payment** - Server challenge with payment requirements
- **Authorization: Payment** - Client credential with payment proof
- **Payment-Receipt** - Settlement confirmation
- **Payment-Authorization** - Reusable authorization token

### Challenge Parameters

| Parameter | Required | Description |
|-----------|----------|-------------|
| `id` | Yes | Unique challenge ID (128+ bits entropy) |
| `realm` | Yes | Protection space identifier |
| `method` | Yes | Payment method (e.g., "tempo", "stripe") |
| `intent` | Yes | Payment type (e.g., "charge", "authorize", "subscription") |
| `request` | Yes | Base64url-encoded JSON with method-specific data |
| `expires` | No | RFC 3339 expiry timestamp |
| `description` | No | Human-readable description |

### Credential Structure

```json
{
  "id": "challenge-id",
  "source": "did:pkh:...",  // optional payer identifier
  "payload": { /* method-specific */ }
}
```

## Writing Payment Method Extensions

Payment method specifications MUST define:

1. **Method Identifier** - Unique lowercase string (e.g., "tempo", "lightning", "solana")
2. **Request Schema** - JSON structure for the `request` parameter  
3. **Credential Schema** - JSON structure for `payload` in credentials
4. **Verification Procedure** - How servers validate proofs
5. **Settlement Procedure** - How payment is finalized
6. **Security Considerations** - Method-specific threats and mitigations

### Template for New Payment Methods

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

## 1. Introduction

[Describe the payment network and how it integrates with the Payment scheme]

## 2. Method Identifier

```
{method-name}
```

## 3. Payment Intents

### 3.1. Intent: "charge"
[Define one-time payment semantics]

### 3.2. Intent: "authorize" (optional)
[Define authorization semantics if supported]

## 4. Request Schema

[Define the JSON structure for WWW-Authenticate request parameter]

## 5. Credential Schema

[Define the JSON structure for Authorization payload]

## 6. Verification Procedure

[How servers verify the payment proof]

## 7. Settlement Procedure

[How payment is finalized on the network]

## 8. Security Considerations

[Method-specific security concerns]

## Appendix: Examples

[Concrete examples with real values]
```

## Build Commands

```bash
# Generate HTML specs
./gen.sh

# Prerequisites
pip install xml2rfc
# Node.js for mmark
```

## Testing Implementations

When building server or client implementations:

1. **Server**: Return 402 with WWW-Authenticate: Payment header on protected resources
2. **Client**: Parse challenge, construct credential, submit with Authorization: Payment
3. **Verify**: Challenge ID binding, expiry checking, method-specific proof validation

## Resources

- [HTTP 402 Status Code](https://httpwg.org/specs/rfc9110.html#status.402)
- [HTTP Authentication](https://httpwg.org/specs/rfc7235.html)
- [W3C Decentralized Identifiers](https://www.w3.org/TR/did-core/)
- [Tempo Documentation](https://docs.tempo.xyz)
- [Viem Documentation](https://viem.sh)
