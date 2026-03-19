---
title: Sui Payment Method for HTTP Payment Authentication
docName: draft-sui-payment-method-00
category: std
ipr: trust200902
submissionType: IETF
consensus: true

author:
  - fullname: funkii
    email: funkii@mission69b.com
    organization: mission69b
---

## Abstract

This document defines the "sui" payment method for use with the Payment
HTTP Authentication Scheme [I-D.ietf-httpauth-payment]. It specifies how
clients and servers exchange coin payments on the Sui blockchain,
supporting one-time charges via on-chain transaction verification.

## Status of This Memo

This Internet-Draft is submitted in full conformance with the provisions
of BCP 78 and BCP 79.

## Copyright Notice

Copyright (c) 2026 IETF Trust and the persons identified as the
document authors. All rights reserved.

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
13. [Appendix A: Examples](#appendix-a-examples)
14. [Acknowledgements](#acknowledgements)
15. [Authors' Addresses](#authors-addresses)

---

## 1. Introduction

Sui is a high-performance Layer 1 blockchain using an object-centric
data model and parallel transaction execution. This specification
defines how Sui's payment primitives integrate with the Payment HTTP
Authentication Scheme [I-D.ietf-httpauth-payment].

Sui supports fungible token transfers via the `sui::coin` module.
The most common payment asset is USDC, deployed as a coin type on
Sui mainnet. All coin amounts are denominated in the smallest
indivisible unit of the coin (e.g., 1 USDC = 1,000,000 base units
with 6 decimal places).

This specification supports one-time charges where the client
executes a coin transfer transaction on-chain and provides the
transaction digest for server-side verification.

### 1.1. Sui Payment Flow

```
   Client                          Server                Sui Network
      |                               |                       |
      |  (1) POST /resource           |                       |
      |------------------------------>|                       |
      |                               |                       |
      |  (2) 402 Payment Required     |                       |
      |      WWW-Authenticate:        |                       |
      |        Payment method="sui",  |                       |
      |        intent="charge",       |                       |
      |        request=<base64url>    |                       |
      |<------------------------------|                       |
      |                               |                       |
      |  (3) Build, sign, and execute |                       |
      |      coin transfer tx         |                       |
      |---------------------------------------------->        |
      |                               |                       |
      |  (4) Transaction finalized    |                       |
      |<----------------------------------------------        |
      |                               |                       |
      |  (5) POST /resource           |                       |
      |      Authorization: Payment   |                       |
      |        <credential w/ digest> |                       |
      |------------------------------>|                       |
      |                               |  (6) getTransaction   |
      |                               |      Block(digest)    |
      |                               |--------------------->  |
      |                               |  (7) Tx data +        |
      |                               |      balanceChanges   |
      |                               |<---------------------  |
      |                               |                       |
      |  (8) 200 OK                   |                       |
      |      Payment-Receipt:         |                       |
      |        <receipt w/ digest>    |                       |
      |<------------------------------|                       |
```

### 1.2. Relationship to the Payment Scheme

This document is a payment method specification as defined in
[I-D.ietf-httpauth-payment]. It defines the `request` and
`payload` structures for the `sui` payment method, along with
verification and settlement procedures.

---

## 2. Requirements Language

The key words "MUST", "MUST NOT", "REQUIRED", "SHALL", "SHALL NOT",
"SHOULD", "SHOULD NOT", "RECOMMENDED", "NOT RECOMMENDED", "MAY",
and "OPTIONAL" in this document are to be interpreted as described
in BCP 14 [RFC2119] [RFC8174] when, and only when, they appear in
all capitals, as shown here.

---

## 3. Terminology

**MIST**
: The smallest unit of SUI. 1 SUI = 1,000,000,000 MIST.

**Coin Type**
: A fully qualified Move type identifier for a fungible token on
  Sui, e.g., `0x2::sui::SUI` for native SUI or a USDC coin type.
  Coin types follow the format
  `{package_id}::{module}::{type_name}`.

**Transaction Digest**
: A base58-encoded hash that uniquely identifies a finalized
  transaction on Sui. Used as the transaction ID.

**Balance Changes**
: A list of balance mutations returned by the Sui RPC when
  querying a transaction with `showBalanceChanges: true`. Each
  entry includes `coinType`, `owner`, and `amount`.

**Object-Centric Model**
: Sui's data model where assets are independent objects owned by
  addresses, enabling parallel execution of non-overlapping
  transactions.

---

## 4. Method Identifier

This specification registers the following payment method
identifier:

```
sui
```

The identifier is case-sensitive and MUST be lowercase.

---

## 5. Payment Intents

This specification defines one payment intent for use with the
`sui` payment method.

### 5.1. Intent: "charge"

A one-time payment of the specified amount. The client executes
the transaction on-chain and provides the transaction digest for
server verification.

**Fulfillment mechanism:**

1. **Coin Transfer**: The payer builds a transaction using
   `splitCoins` and `transferObjects` on the specified coin type,
   executes it on-chain, and returns the resulting transaction
   digest.

---

## 6. Request Schema

The `request` parameter in the `WWW-Authenticate` challenge
contains a base64url-encoded JSON object.

### 6.1. Charge Request

For `intent="charge"`, the request specifies a one-time payment:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `amount` | string | REQUIRED | Amount in base units (smallest unit of the coin type) |
| `currency` | string | REQUIRED | Fully qualified Sui coin type |
| `recipient` | string | REQUIRED | Recipient Sui address (0x-prefixed, 64 hex chars) |

**Notes:**

- The `amount` field is always a string to support arbitrary
  precision.
- `currency` is the full Move type path, e.g.,
  `0xdba3...::usdc::USDC` for USDC on Sui mainnet.
- `recipient` MUST be a valid Sui address, normalized to lowercase
  with `0x` prefix.

**Example (USDC transfer):**

```json
{
  "amount": "10000",
  "currency": "0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC",
  "recipient": "0x742d35cc6634c0532925a3b844bc9e7595f8fe00000000000000000000000000"
}
```

This requests a transfer of 0.01 USDC (10,000 base units with
6 decimal places).

---

## 7. Credential Schema

The `payload` field in the Authorization credential contains the
transaction digest proving on-chain settlement.

### 7.1. Digest Payload

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `digest` | string | REQUIRED | Sui transaction digest (base58-encoded) |

The client MUST execute the coin transfer transaction on-chain
before submitting the credential. The `digest` field contains the
finalized transaction digest returned by the Sui network.

**Example:**

```json
{
  "digest": "65JFz7FMgLnZakYGVfBRKDpX33nizRoV43c7jQAsqF99"
}
```

---

## 8. Verification Procedure

Servers MUST perform the following verification steps:

### 8.1. Transaction Retrieval

1. Call the Sui JSON-RPC method `sui_getTransactionBlock` with the
   provided `digest`, requesting `showEffects: true` and
   `showBalanceChanges: true`.
2. If the transaction is not found, the server SHOULD retry with
   exponential backoff (up to 5 attempts) to account for RPC node
   indexing latency.

### 8.2. Status Verification

1. Verify `effects.status.status` equals `"success"`.
2. If the transaction failed on-chain, reject the credential.

### 8.3. Balance Change Verification

1. Iterate over the `balanceChanges` array.
2. Find an entry where:
   - `coinType` matches the `currency` from the challenge request.
   - `owner` is an `AddressOwner` matching the `recipient` from
     the challenge request (normalized, case-insensitive).
   - `amount` is a positive number (credit to recipient).
3. Verify the transferred amount (as a raw integer) is greater
   than or equal to the requested `amount`.
4. If no matching balance change is found, reject the credential.

---

## 9. Settlement Procedure

The Sui charge method uses a client-broadcast settlement model.
The client executes and finalizes the transaction before submitting
the credential.

### 9.1. Client Settlement

1. Client builds a `Transaction` containing:
   - `splitCoins` to extract the payment amount from available
     coin objects of the specified `currency`.
   - `transferObjects` to send the split coin to `recipient`.
2. Client signs and executes the transaction via
   `signAndExecuteTransaction`.
3. Client waits for transaction finality (~400ms on Sui).
4. Client submits the credential with `payload.digest` set to
   the transaction digest.

### 9.2. Server Verification

1. Server retrieves the transaction from Sui RPC (see Section 8).
2. Server verifies balance changes match the challenge parameters.
3. Server returns 200 with a `Payment-Receipt` header.

### 9.3. Receipt Generation

Upon successful verification, servers MUST return a
`Payment-Receipt` header per [I-D.ietf-httpauth-payment].

| Field | Type | Description |
|-------|------|-------------|
| `method` | string | `"sui"` |
| `reference` | string | Transaction digest (base58) |
| `status` | string | `"success"` |
| `timestamp` | string | ISO 8601 verification time |

**Example receipt:**

```json
{
  "method": "sui",
  "reference": "65JFz7FMgLnZakYGVfBRKDpX33nizRoV43c7jQAsqF99",
  "status": "success",
  "timestamp": "2026-01-15T11:30:00Z"
}
```

---

## 10. Security Considerations

### 10.1. Transaction Finality

Sui provides immediate finality for executed transactions. Once a
transaction digest is returned by the network, the transaction
cannot be reverted. This eliminates the risk of settlement
reversal after credential acceptance.

### 10.2. RPC Node Latency

There may be a delay between transaction execution and RPC node
indexing. Servers SHOULD implement retry logic with exponential
backoff when retrieving transactions. A reasonable strategy is
up to 5 attempts with delays of 1, 2, 3, 4, and 5 seconds.

### 10.3. Replay Protection

Each Sui transaction has a unique digest derived from its content
and signer. The same transaction cannot be executed twice on-chain.
Servers MUST track used challenge IDs to prevent credential replay
(reusing the same digest for multiple challenge responses).

### 10.4. Amount Verification

Clients MUST verify the challenge parameters before signing:

1. Verify `amount` is reasonable for the service.
2. Verify `currency` is the expected coin type.
3. Verify `recipient` is the expected party.

### 10.5. Address Validation

Servers MUST normalize Sui addresses (lowercase, 0x-prefixed,
zero-padded to 66 characters) before comparison. Clients SHOULD
use `isValidSuiAddress()` to validate recipient addresses before
building transactions.

### 10.6. Coin Merging

When a client holds multiple coin objects of the same type, they
MUST merge coins before splitting the payment amount. Failure to
merge may result in insufficient balance errors even when the
total balance is sufficient.

---

## 11. IANA Considerations

### 11.1. Payment Method Registration

This specification registers the following payment method in the
"HTTP Payment Method" registry:

- **Method Identifier**: `sui`
- **Reference**: This document
- **Description**: Sui blockchain coin transfers

Contact: mission69b (<funkii@mission69b.com>)

---

## 12. References

### 12.1. Normative References

- [I-D.ietf-httpauth-payment] The "Payment" HTTP Authentication
  Scheme
- [RFC2119] Key words for use in RFCs
- [RFC8174] Ambiguity of Uppercase vs Lowercase in RFC 2119

### 12.2. Informative References

- Sui Documentation: https://docs.sui.io
- Sui JSON-RPC API: https://docs.sui.io/references/sui-api
- Sui Coin Standard:
  https://docs.sui.io/standards/coin

---

## Appendix A: Examples

### A.1. Charge (USDC Transfer)

**Challenge:**

```http
HTTP/1.1 402 Payment Required
WWW-Authenticate: Payment id="t2k_abc123def456",
  realm="mpp.example.com",
  method="sui",
  intent="charge",
  request="eyJhbW91bnQiOiIxMDAwMCIsImN1cnJlbmN5IjoiMHhkYmEzNDY3MmUzMGNiMDY1YjFmOTNlM2FiNTUzMTg3NjhmZDZmZWY2NmMxNTk0MmM5ZjdjYjg0NmUyZjkwMGU3Ojp1c2RjOjpVU0RDIiwicmVjaXBpZW50IjoiMHg3NDJkMzVjYzY2MzRjMDUzMjkyNWEzYjg0NGJjOWU3NTk1ZjhmZTAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwIn0"
```

The `request` decodes to:

```json
{
  "amount": "10000",
  "currency": "0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC",
  "recipient": "0x742d35cc6634c0532925a3b844bc9e7595f8fe00000000000000000000000000"
}
```

This requests a transfer of 0.01 USDC (10,000 base units with
6 decimal places).

**Credential:**

```http
POST /resource HTTP/1.1
Host: mpp.example.com
Authorization: Payment eyJjaGFsbGVuZ2UiOnsiaWQiOiJ0MmtfYWJjMTIzZGVmNDU2IiwicmVhbG0iOiJtcHAuZXhhbXBsZS5jb20iLCJtZXRob2QiOiJzdWkiLCJpbnRlbnQiOiJjaGFyZ2UifSwicGF5bG9hZCI6eyJkaWdlc3QiOiI2NUpGejdGTWdMblpha1lHVmZCUktEcFgzM25pelJvVjQzYzdqUUFzcUY5OSJ9fQ
```

The credential decodes to:

```json
{
  "challenge": {
    "id": "t2k_abc123def456",
    "realm": "mpp.example.com",
    "method": "sui",
    "intent": "charge"
  },
  "payload": {
    "digest": "65JFz7FMgLnZakYGVfBRKDpX33nizRoV43c7jQAsqF99"
  }
}
```

**Response with receipt:**

```http
HTTP/1.1 200 OK
Payment-Receipt: eyJtZXRob2QiOiJzdWkiLCJyZWZlcmVuY2UiOiI2NUpGejdGTWdMblpha1lHVmZCUktEcFgzM25pelJvVjQzYzdqUUFzcUY5OSIsInN0YXR1cyI6InN1Y2Nlc3MiLCJ0aW1lc3RhbXAiOiIyMDI2LTAxLTE1VDExOjMwOjAwWiJ9
Content-Type: application/json

{ "data": "..." }
```

The receipt decodes to:

```json
{
  "method": "sui",
  "reference": "65JFz7FMgLnZakYGVfBRKDpX33nizRoV43c7jQAsqF99",
  "status": "success",
  "timestamp": "2026-01-15T11:30:00Z"
}
```

---

## Acknowledgements

The authors thank the Sui community, Mysten Labs, and the t2000
contributors for their work on the reference implementation
(`@t2000/mpp-sui`).

---

## Authors' Addresses

funkii
mission69b
Email: funkii@mission69b.com
