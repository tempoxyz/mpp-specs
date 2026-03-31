---
title: Reasoning Verification Extension for HTTP Payment Authentication
abbrev: Reasoning Verification
docname: draft-payment-reasoning-verification-00
version: 00
category: info
ipr: trust200902
submissiontype: IETF
consensus: true

author:
  - name: Raul Jäger
    ins: R. Jäger
    email: raul@thoughtproof.ai
    org: ThoughtProof
---

## Abstract

This document defines the "reasoning-verification" extension for the
Payment HTTP Authentication Scheme [I-D.httpauth-payment]. It specifies
how a server MAY require adversarial multi-model verification of the
agent's decision logic before accepting a payment credential — ensuring
that the reasoning behind a payment is sound, not just that the payment
is authorized.

## Status of This Memo

This Internet-Draft is submitted in full conformance with the provisions
of BCP 78 and BCP 79.

## Copyright Notice

Copyright (c) 2026 IETF Trust and the persons identified as the document
authors. All rights reserved.

## Table of Contents

1. [Introduction](#1-introduction)
2. [Requirements Language](#2-requirements-language)
3. [Extension Overview](#3-extension-overview)
4. [Specification](#4-specification)
5. [Security Considerations](#5-security-considerations)
6. [IANA Considerations](#6-iana-considerations)
7. [References](#7-references)
8. [Authors' Addresses](#authors-addresses)

---

## 1. Introduction

Machine payments enable agents to autonomously pay for resources and
services. Current payment protocols verify authorization (can the agent
pay?) and identity (who is the agent?) — but not reasoning quality
(should the agent pay for this, given its goals?).

An authorized agent with a valid identity can still make poorly-reasoned
payments: buying overpriced resources, trading on sentiment instead of
data, or executing strategies that contradict its own stated objectives.

This extension adds a pre-payment verification step where an independent
reasoning verification service evaluates the agent's decision logic
before the payment credential is issued.

### 1.1. Motivation

In autonomous agent economies, payment authorization is necessary but
not sufficient for trust. An agent that passes identity checks
(ERC-8004), behavioral trust scoring (Maiat), and has sufficient funds
can still make decisions that are:

- Based on flawed reasoning (sentiment vs. data)
- Disproportionate to the stated objective
- Missing obvious alternatives or risk factors
- Self-contradictory

Reasoning verification catches these defects before settlement — not
after.

### 1.2. Scope

This extension:

- DOES: Define how a server can require reasoning verification before
  accepting payment credentials
- DOES: Specify the verification request/response format
- DOES: Support multiple stake levels (low → critical) with
  proportional verification depth
- DOES NOT: Define the verification algorithm (implementations vary)
- DOES NOT: Replace identity or authorization checks
- DOES NOT: Require any specific verification provider

### 1.3. Relationship to Core Specification

This document extends [I-D.httpauth-payment]. Implementations of this
extension MUST also implement the core specification.

This extension is OPTIONAL. Servers MAY require it for high-value
transactions while allowing low-value payments to proceed without
verification.

---

## 2. Requirements Language

The key words "MUST", "MUST NOT", "REQUIRED", "SHALL", "SHALL NOT",
"SHOULD", "SHOULD NOT", "RECOMMENDED", "NOT RECOMMENDED", "MAY", and
"OPTIONAL" in this document are to be interpreted as described in
BCP 14 [RFC2119] [RFC8174] when, and only when, they appear in all
capitals, as shown here.

---

## 3. Extension Overview

### 3.1. Architecture

```
   Agent                     Server                  Verifier
     │                          │                       │
     │  1. Request resource     │                       │
     │─────────────────────────>│                       │
     │                          │                       │
     │  2. 402 + Payment +      │                       │
     │     reasoning-verification│                       │
     │<─────────────────────────│                       │
     │                          │                       │
     │  3. Submit decision logic │                       │
     │──────────────────────────────────────────────────>│
     │                          │                       │
     │  4. Verification result  │                       │
     │<──────────────────────────────────────────────────│
     │                          │                       │
     │  5. Payment + verification│                       │
     │     receipt               │                       │
     │─────────────────────────>│                       │
     │                          │                       │
     │  6. Resource              │                       │
     │<─────────────────────────│                       │
```

### 3.2. Capabilities

This extension provides:

1. **Pre-payment reasoning check**: Verify that an agent's decision
   logic is sound before accepting payment
2. **Stake-proportional depth**: Micro-payments skip verification;
   high-value payments require multi-model adversarial critique
3. **Verification receipts**: Signed attestations that the reasoning
   was verified, suitable for on-chain submission

---

## 4. Specification

### 4.1. Server Challenge

When a server requires reasoning verification, it includes a
`reasoning-verification` parameter in the 402 response:

#### 4.1.1. Response

```http
HTTP/1.1 402 Payment Required
WWW-Authenticate: Payment realm="api.example.com",
  intent="charge",
  amount="1000000",
  asset="USDC",
  reasoning-verification="required",
  verification-endpoint="https://verifier.example.com/v1/check",
  stake-level="medium"
```

New parameters:

| Parameter | Required | Description |
|-----------|----------|-------------|
| `reasoning-verification` | OPTIONAL | `"required"` or `"recommended"` |
| `verification-endpoint` | CONDITIONAL | URL of the verification service (required if reasoning-verification is set) |
| `stake-level` | OPTIONAL | `"low"`, `"medium"`, `"high"`, `"critical"` — defaults to `"medium"` |

### 4.2. Verification Request

The agent submits its decision logic to the verification endpoint:

#### 4.2.1. Request

```http
POST /v1/check HTTP/1.1
Host: verifier.example.com
Content-Type: application/json

{
  "claim": "Swap $2000 USDC to ETH based on technical analysis",
  "context": "ETH at $2,184, 6% below 30d MA, RSI 34",
  "domain": "financial",
  "stakeLevel": "medium"
}
```

#### 4.2.2. Response

```http
HTTP/1.1 200 OK
Content-Type: application/json

{
  "verdict": "ALLOW",
  "confidence": 0.82,
  "objections": [],
  "durationMs": 35000
}
```

Verdicts:

| Verdict | Meaning | Action |
|---------|---------|--------|
| `ALLOW` | Reasoning is sound | Proceed with payment |
| `HOLD` | Material defects found | Do not proceed; review reasoning |
| `UNCERTAIN` | Insufficient evidence | Gather more context |
| `DISSENT` | Models strongly disagree | Require human review |

### 4.3. Payment with Verification Receipt

After receiving an ALLOW verdict, the agent includes the verification
result in the payment credential:

```http
GET /api/resource HTTP/1.1
Authorization: Payment credential="...",
  verification-verdict="ALLOW",
  verification-confidence="0.82"
```

The server MAY validate the verification result before accepting
payment. Verification services that support signed receipts (e.g.,
EdDSA JWTs) MAY include a `verification-receipt` parameter for
cryptographic verification.

### 4.4. Stake Level Thresholds

Servers SHOULD use stake levels to control verification depth:

| Stake Level | Typical Latency | Models | Cost | Threshold |
|-------------|-----------------|--------|------|-----------|
| `low` | ~15–25s | 2 | $0.01 | 0.50 |
| `medium` | ~30–45s | 3 | $0.01 | 0.60 |
| `high` | ~45–60s | 3+ | $0.10 | 0.75 |
| `critical` | ~60s+ | 4+ | $1.00 | 0.85 |

Servers MAY set `reasoning-verification="required"` only above a
certain payment amount. Payments below the threshold proceed without
verification — there is no "micro" stake level; the minimum is "low"
payments skip this extension entirely.

### 4.5. Error Handling

If the verification service is unavailable, the server SHOULD:

1. For `reasoning-verification="required"`: Reject the payment (fail closed)
2. For `reasoning-verification="recommended"`: Accept the payment
   with a warning header

```http
HTTP/1.1 200 OK
Warning: 199 - "Reasoning verification unavailable; payment accepted without verification"
```

---

## 5. Security Considerations

### 5.1. Verification Service Trust

The verification service is a trusted third party. Servers MUST only
accept verification receipts from trusted verification endpoints.
Compromised verification services could approve poorly-reasoned
payments.

### 5.2. Replay Protection

Verification receipts MUST include a timestamp and SHOULD include the
payment intent ID. Servers MUST reject receipts older than a reasonable
window (e.g., 15 minutes) to prevent replay attacks.

### 5.3. Privacy Considerations

The verification service receives the agent's decision logic, which
may contain sensitive information about trading strategy or intentions.
Agents SHOULD minimize the information shared to what is necessary for
verification. Verification services MUST NOT share decision logic with
third parties.

---

## 6. IANA Considerations

### 6.1. Payment Authentication Parameters

This document registers the following parameters in the "Payment
Authentication Parameters" registry:

| Parameter | Reference |
|-----------|-----------|
| `reasoning-verification` | This document |
| `verification-endpoint` | This document |
| `stake-level` | This document |

---

## 7. References

### 7.1. Normative References

- **[RFC2119]** Bradner, S., "Key words for use in RFCs to Indicate
  Requirement Levels", BCP 14, RFC 2119, March 1997.

- **[RFC8174]** Leiba, B., "Ambiguity of Uppercase vs Lowercase in
  RFC 2119 Key Words", BCP 14, RFC 8174, May 2017.

- **[I-D.httpauth-payment]** Ryan, B., "The 'Payment' HTTP Authentication
  Scheme", draft-httpauth-payment-00.

### 7.2. Informative References

- **[ERC-8004]** "Trustless Agents Registry",
  https://eips.ethereum.org/EIPS/eip-8004

- **[ERC-8183]** "Agentic Commerce",
  https://eips.ethereum.org/EIPS/eip-8183

- **[X402]** "x402: HTTP Payment Protocol",
  https://github.com/coinbase/x402

---

## Authors' Addresses

Raul Jäger
ThoughtProof
Email: raul@thoughtproof.ai
Web: https://thoughtproof.ai
