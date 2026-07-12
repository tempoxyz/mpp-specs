---
title: '"dpx" Payment Method for HTTP Payment Authentication'
abbrev: '"dpx" Payment Method'
docname: draft-dpx-charge-00
version: 00
category: info
ipr: noModificationTrust200902
submissiontype: IETF
consensus: true
author:
  - name: Victoria Case
    ins: V. Case
    email: case@untitledfinancial.com
    org: Untitled_ LuxPerpetua Technologies, Inc.

normative:
  RFC2119:
  RFC8174:
  RFC9110:
  I-D.httpauth-payment:
    title: "The 'Payment' HTTP Authentication Scheme"
    target: https://datatracker.ietf.org/doc/draft-ryan-httpauth-payment/
    author:
      - name: Jake Moxey
    date: 2026-01
  I-D.payment-intent-charge:
    title: "'charge' Intent for HTTP Payment Authentication"
    target: https://datatracker.ietf.org/doc/draft-payment-intent-charge/
    author:
      - name: Jake Moxey
      - name: Brendan Ryan
      - name: Tom Meagher
    date: 2026
  I-D.evm-charge:
    title: EVM Charge Intent for HTTP Payment Authentication
    target: https://paymentauth.org/draft-evm-charge-00.html

informative:
  DPX-AGENT:
    title: DPX Settlement Agent
    target: https://agent.untitledfinancial.com
  DPX-ORACLE:
    title: DPX Stability Oracle
    target: https://stability.untitledfinancial.com
  DPX-DOCS:
    title: DPX Protocol Documentation
    target: https://docs.untitledfinancial.com
  DPX-MCP:
    title: DPX MCP Server
    target: https://mcp.untitledfinancial.com/mcp
  EIP-20:
    title: ERC-20 Token Standard
    target: https://eips.ethereum.org/EIPS/eip-20
---

## Abstract

This document defines the "dpx" payment method for use with the Payment
HTTP Authentication Scheme [I-D.httpauth-payment]. It specifies how clients
and servers exchange payments using DPX — a cross-border settlement rail for
autonomous agents and institutional flows, operating on Base mainnet with
USDC as the primary settlement asset.

DPX extends the `charge` intent with oracle-gated authorization: servers
verify payment against a 9-layer Stability Oracle signal before confirming
the response. This enables condition-aware, real-time-priced payment flows
where the fee reflects live macro, FX, and geopolitical risk conditions.

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
5. [Supported Intents](#5-supported-intents)
6. [Intent: "charge"](#6-intent-charge)
7. [Verification Procedure](#7-verification-procedure)
8. [Settlement Procedure](#8-settlement-procedure)
9. [Security Considerations](#9-security-considerations)
10. [IANA Considerations](#10-iana-considerations)
11. [References](#11-references)
12. [Appendix A: Examples](#appendix-a-examples)
13. [Authors' Addresses](#authors-addresses)

---

## 1. Introduction

DPX is a cross-border settlement rail designed for agent-to-agent and
institutional payment flows. It implements the HTTP 402 `charge` intent
using USDC on Base mainnet as the settlement asset, with the fee amount
determined dynamically by a Stability Oracle that signals real-world
macro, FX, and geopolitical conditions.

This specification defines how a DPX server issues a payment challenge
(402 response), how a client constructs a credential proving payment, and
how the server verifies that payment before returning the protected resource.

DPX extends standard EVM-based charge flows in two ways:

1. **Oracle-gated authorization**: the server checks a 9-layer Stability
   Oracle before confirming the response. If conditions are UNSTABLE, the
   server MAY hold the request and return a 503 with a `Retry-After` header
   rather than a 402.

2. **Autonomous agent origination**: clients MAY supply a natural-language
   payment instruction in lieu of structured parameters; the DPX Settlement
   Agent parses and executes the instruction using an AI synthesis layer.

### 1.1. Payment Flow

```
   Client (Agent or Institutional)              DPX Settlement Agent
      │                                                 │
      │  (1) GET /intelligence/48h-call                 │
      ├────────────────────────────────────────────────>│
      │                                                 │
      │  (2) 402 Payment Required                       │
      │      WWW-Authenticate: Payment method="dpx"     │
      │      (amount, asset, recipient, expires, quoteId│
      │<────────────────────────────────────────────────┤
      │                                                 │
      │  (3) Client calls ERC-20 approve() + settle()   │
      │      on DPXSettlementRouter v2.0 (Base mainnet) │
      │                                                 │
      │  (4) GET /intelligence/48h-call                 │
      │      Authorization: Payment <credential>        │
      │      (txHash, quoteId, sender)                  │
      ├────────────────────────────────────────────────>│
      │                                                 │
      │  (5) Server verifies tx on Base + oracle signal │
      │                                                 │
      │  (6) 200 OK                                     │
      │      Payment-Receipt: <receipt>                 │
      │<────────────────────────────────────────────────┤
```

### 1.2. Relationship to the EVM Payment Method

The "dpx" method is an application-layer extension of the EVM charge
pattern [I-D.evm-charge]. It uses the same on-chain execution model
(ERC-20 `approve` + contract call) but routes through the
DPXSettlementRouter contract, which enforces oracle-gated fee validation
and settlement finality. The router address and USDC contract are fixed
per network (see Section 6.1).

---

## 2. Requirements Language

The key words "MUST", "MUST NOT", "REQUIRED", "SHALL", "SHALL NOT",
"SHOULD", "SHOULD NOT", "RECOMMENDED", "NOT RECOMMENDED", "MAY", and
"OPTIONAL" in this document are to be interpreted as described in
BCP 14 [RFC2119] [RFC8174] when, and only when, they appear in all
capitals, as shown here.

---

## 3. Terminology

**Settlement Agent**
: The DPX server component that issues challenges, verifies credentials,
  and coordinates with the Stability Oracle. Reachable at
  `agent.untitledfinancial.com`.

**Stability Oracle**
: A 9-layer signal pipeline that produces a stability score (0–100) and
  status (STABLE / CAUTION / UNSTABLE) from climate, macro, FX, energy,
  geopolitical, ESG, and supply-chain indicators.

**DPXSettlementRouter**
: The on-chain contract (Base mainnet: `0xe333551E18ef0471A71d7e8e761212766aa5AD4f`)
  through which clients execute settlement. Accepts USDC, EURC, and USDT.

**quoteId**
: A server-issued binding quote identifier, valid for 300 seconds. Clients
  MUST use this value when calling `router.settle()`.

**Intelligence Fee**
: The USDC amount charged for oracle signal access and AI synthesis. Computed
  dynamically based on settlement amount and current oracle conditions.

**Oracle Hold**
: A temporary suspension of settlement authorization when the Stability
  Oracle reports UNSTABLE conditions. The server returns 503 with
  `Retry-After` during holds.

---

## 4. Method Identifier

This specification registers the following payment method identifier:

```
dpx
```

The identifier is case-sensitive and MUST be lowercase.

---

## 5. Supported Intents

| Intent | Support | Reference |
|--------|---------|-----------|
| `charge` | REQUIRED | Section 6 |

---

## 6. Intent: "charge"

### 6.1. Request Schema

For `intent="charge"`, the `request` parameter contains:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `amount` | string | REQUIRED | Intelligence fee in USDC atomic units (6 decimals) |
| `asset` | string | REQUIRED | Asset identifier — MUST be `eip155:8453/erc20:0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` (USDC on Base) |
| `recipient` | string | REQUIRED | Fee collector address in CAIP-10 format |
| `expires` | string | REQUIRED | ISO 8601 expiry timestamp (300 seconds from challenge issuance) |
| `quoteId` | string | REQUIRED | Binding quote identifier — MUST be passed to `router.settle()` |
| `routerAddress` | string | REQUIRED | DPXSettlementRouter contract address on Base mainnet |
| `grossAmountRaw` | string | REQUIRED | Full settlement amount in USDC atomic units |
| `oracleScore` | number | OPTIONAL | Stability Oracle score at time of quote (0–100) |
| `oracleStatus` | string | OPTIONAL | Oracle status at time of quote: `STABLE`, `CAUTION`, or `UNSTABLE` |

**Example:**

```json
{
  "amount": "50000",
  "asset": "eip155:8453/erc20:0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  "recipient": "eip155:8453:0x1E05306A20A738917EFa010f5BE3fb5EE7290dD8",
  "expires": "2026-07-06T09:05:00Z",
  "quoteId": "dpx-settle-a1b2c3d4-e5f6-7890",
  "routerAddress": "0xe333551E18ef0471A71d7e8e761212766aa5AD4f",
  "grossAmountRaw": "25000000000",
  "oracleScore": 82,
  "oracleStatus": "STABLE"
}
```

### 6.2. On-Chain Execution

Before submitting a credential, the client MUST execute two on-chain
transactions on Base mainnet (chain ID 8453):

1. **Approve**: Call `approve(routerAddress, grossAmountRaw)` on the USDC
   contract (`0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`).

2. **Settle**: Call `router.settle(recipient, grossAmountRaw, isCrossCurrency,
   quoteIdBytes32, tokenAddress)` on the DPXSettlementRouter. The ABI is:

```
function settle(
  address recipient,
  uint256 grossAmount,
  bool isCrossCurrency,
  bytes32 quoteId,
  address tokenAddress
) external returns (uint256 netAmount)
```

The client is responsible for gas. DPX does not hold funds or pay gas
on the client's behalf.

### 6.3. Credential Payload

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `type` | string | REQUIRED | MUST be `"dpx-settlement"` |
| `txHash` | string | REQUIRED | Transaction hash of the `settle()` call on Base mainnet |
| `quoteId` | string | REQUIRED | The `quoteId` from the challenge request, echoed back |
| `sender` | string | OPTIONAL | CAIP-10 address of the paying wallet |

**Example:**

```json
{
  "type": "dpx-settlement",
  "txHash": "0xabc123def456...",
  "quoteId": "dpx-settle-a1b2c3d4-e5f6-7890",
  "sender": "eip155:8453:0xSenderAddress"
}
```

### 6.4. Natural Language Extension (OPTIONAL)

Clients MAY use the DPX Settlement Agent's natural language interface
in lieu of structured on-chain execution. When the `nl` field is present
in the credential payload, the Settlement Agent interprets the instruction
via its AI synthesis layer:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `type` | string | REQUIRED | MUST be `"dpx-nl"` |
| `text` | string | REQUIRED | Plain English payment instruction |
| `execute` | boolean | OPTIONAL | If `true`, agent executes Mercury payment directly |

This path is intended for agentic callers that communicate intent in
natural language rather than constructing structured transactions.

---

## 7. Verification Procedure

Servers MUST verify a "dpx" charge credential as follows:

1. **Quote validity**: Verify the `quoteId` matches an outstanding challenge
   issued by this server and has not expired (TTL: 300 seconds).

2. **Transaction existence**: Query Base mainnet for the `txHash`. The
   transaction MUST be confirmed (at least 1 block confirmation).

3. **Contract match**: Verify the transaction `to` address matches the
   DPXSettlementRouter (`0xe333551E18ef0471A71d7e8e761212766aa5AD4f`).

4. **Amount match**: Decode the `settle()` calldata and verify `grossAmount`
   is greater than or equal to the `grossAmountRaw` from the challenge.

5. **Quote ID match**: Verify the `quoteIdBytes32` in the calldata encodes
   the same `quoteId` as the challenge.

6. **Oracle check**: Query the Stability Oracle. If oracle status is
   UNSTABLE, the server SHOULD return 503 with `Retry-After: 300` rather
   than 200, even if payment is verified.

7. **Replay prevention**: Mark the `txHash` as consumed. Subsequent
   requests using the same `txHash` MUST be rejected with 402.

---

## 8. Settlement Procedure

### 8.1. Settlement Timing

Settlement is immediate on-chain. The `router.settle()` call transfers
the net amount (gross minus fees) to the recipient in the same transaction.
The intelligence fee is retained by the fee collector address.

### 8.2. Finality

A credential is considered final when the Base mainnet transaction has
at least 1 confirmation. Servers MAY require additional confirmations
for high-value settlements.

### 8.3. Oracle Holds

When the Stability Oracle reports UNSTABLE conditions, servers MUST NOT
authorize settlement even if payment has been received. In this case:

- The server returns 503 with `Retry-After: 300`
- The server SHOULD include `X-DPX-Oracle-Status: UNSTABLE` and
  `X-DPX-Oracle-Score: <score>` response headers
- The client SHOULD retry after the `Retry-After` interval
- The settlement is not lost — the `quoteId` remains valid until expiry

### 8.4. Failure Handling

If `router.settle()` reverts on-chain, the credential is invalid and the
server MUST return 402. The client must obtain a fresh quote and retry.

---

## 9. Security Considerations

### 9.1. Transport Security

All communication MUST use TLS 1.2 or higher. DPX credentials contain
transaction hashes that could be replayed; HTTPS prevents interception.

### 9.2. Replay Protection

Servers MUST persist consumed `txHash` values for at least the maximum
quote TTL (300 seconds) beyond transaction confirmation. Duplicate
`txHash` submissions MUST be rejected with 402.

### 9.3. Quote Expiry

Challenges MUST expire within 300 seconds of issuance. Servers MUST
reject credentials referencing expired `quoteId` values. Clients MUST
obtain a fresh quote if the quote has expired before on-chain execution.

### 9.4. Oracle Manipulation

The Stability Oracle signal is computed from external data sources. Servers
SHOULD implement fallback behavior if the Oracle is unreachable, defaulting
to the last known score rather than failing open.

### 9.5. Gas Price Risk

Because clients pay gas for on-chain execution, network congestion may
cause transactions to fail. Clients SHOULD use appropriate gas price
estimation and SHOULD implement retry logic with fresh quotes.

### 9.6. Private Key Security

The `recipient` address (fee collector) is a hot wallet. Operators SHOULD
implement sweep logic to move accumulated fees to cold storage and SHOULD
NOT hold large balances at the fee collector address.

---

## 10. IANA Considerations

### 10.1. Payment Method Registration

This specification registers the "dpx" payment method in the Payment
Method Registry per Section 12.3 of [I-D.httpauth-payment]:

| Field | Value |
|-------|-------|
| Method Identifier | `dpx` |
| Description | Cross-border settlement rail for autonomous agents; USDC on Base mainnet, oracle-gated |
| Reference | This document |
| Contact | case@untitledfinancial.com |

---

## 11. References

### 11.1. Normative References

- **[RFC2119]** Bradner, S., "Key words for use in RFCs to Indicate
  Requirement Levels", BCP 14, RFC 2119, March 1997.

- **[RFC8174]** Leiba, B., "Ambiguity of Uppercase vs Lowercase in
  RFC 2119 Key Words", BCP 14, RFC 8174, May 2017.

- **[RFC9110]** Fielding, R., et al., "HTTP Semantics", RFC 9110, June 2022.

- **[I-D.httpauth-payment]** Moxey, J., "The 'Payment' HTTP Authentication
  Scheme", draft-httpauth-payment-00.

- **[I-D.payment-intent-charge]** Moxey, J., et al., "'charge' Intent for
  HTTP Payment Authentication", draft-payment-intent-charge-00.

- **[I-D.evm-charge]** "EVM Charge Intent for HTTP Payment Authentication",
  draft-evm-charge-00.

### 11.2. Informative References

- **[DPX-AGENT]** "DPX Settlement Agent", https://agent.untitledfinancial.com

- **[DPX-ORACLE]** "DPX Stability Oracle", https://stability.untitledfinancial.com

- **[DPX-DOCS]** "DPX Protocol Documentation", https://docs.untitledfinancial.com

- **[EIP-20]** "ERC-20 Token Standard", https://eips.ethereum.org/EIPS/eip-20

---

## Appendix A: Examples

### A.1. Standard Charge Flow

**Step 1 — Initial request:**

```http
GET /intelligence/48h-call HTTP/1.1
Host: intelligence.untitledfinancial.com
```

**Step 2 — 402 challenge:**

```http
HTTP/1.1 402 Payment Required
WWW-Authenticate: Payment id="chal_a1b2c3",
  realm="intelligence.untitledfinancial.com",
  method="dpx",
  intent="charge",
  request="eyJhbW91bnQiOiI1MDAwMCIsImFzc2V0IjoiZWlwMTU1OjgyNDMvZXJjMjA6MHg4MzM..."
```

Decoded `request`:

```json
{
  "amount": "50000",
  "asset": "eip155:8453/erc20:0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  "recipient": "eip155:8453:0x1E05306A20A738917EFa010f5BE3fb5EE7290dD8",
  "expires": "2026-07-06T09:05:00Z",
  "quoteId": "dpx-settle-a1b2c3d4-e5f6-7890",
  "routerAddress": "0xe333551E18ef0471A71d7e8e761212766aa5AD4f",
  "grossAmountRaw": "25000000000",
  "oracleScore": 82,
  "oracleStatus": "STABLE"
}
```

**Step 3 — Client executes on Base mainnet:**

```
approve(0xe333551E18ef0471A71d7e8e761212766aa5AD4f, 25000000000)
router.settle(recipient, 25000000000, false, quoteIdBytes32, usdcAddress)
→ txHash: 0xabc123...
```

**Step 4 — Credentialed request:**

```http
GET /intelligence/48h-call HTTP/1.1
Host: intelligence.untitledfinancial.com
Authorization: Payment eyJ0eXBlIjoiZHB4LXNldHRsZW1lbnQiLCJ0eEhhc2giOiIweGFiYzEyMyJ9...
```

Decoded credential:

```json
{
  "type": "dpx-settlement",
  "txHash": "0xabc123def456...",
  "quoteId": "dpx-settle-a1b2c3d4-e5f6-7890",
  "sender": "eip155:8453:0xSenderAddress"
}
```

**Step 5 — 200 response:**

```http
HTTP/1.1 200 OK
Content-Type: application/json
Payment-Receipt: eyJzdGF0dXMiOiJzZXR0bGVkIiwic2V0dGxlbWVudElkIjoiZHB4LXNldHRsZS1hMWIyYzNkNC1lNWY2LTc4OTAifQ==
X-DPX-Oracle-Status: STABLE
X-DPX-Oracle-Score: 82
```

### A.2. Oracle Hold (503)

```http
HTTP/1.1 503 Service Unavailable
Retry-After: 300
X-DPX-Oracle-Status: UNSTABLE
X-DPX-Oracle-Score: 31
Content-Type: application/json

{
  "error": "Oracle conditions UNSTABLE — settlement held",
  "retryAfter": 300,
  "oracleScore": 31,
  "hint": "Conditions improving. Retry in 5 minutes with the same quoteId."
}
```

### A.3. Natural Language Charge (Agentic)

```http
POST /nl HTTP/1.1
Host: agent.untitledfinancial.com
Authorization: Payment <credential>
Content-Type: application/json

{
  "text": "Pay $50,000 to 0xRecipient for Q3 treasury rebalancing",
  "execute": true,
  "mercuryAccountId": "acct_abc123",
  "mercuryRecipientId": "rec_xyz789"
}
```

---

## Authors' Addresses

Victoria Case
Untitled_ LuxPerpetua Technologies, Inc.
Email: case@untitledfinancial.com
