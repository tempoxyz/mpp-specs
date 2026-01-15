---
title: Lightning Network Payment Method for HTTP Payment Authentication
docName: draft-lightning-payment-method-00
category: std
ipr: trust200902
submissionType: IETF
consensus: true

author:
  - fullname: Georgios Konstantopoulos
    email: georgios@tempo.xyz
    organization: Tempo Labs
---

## Abstract

This document defines the "lightning" payment method for use with the Payment
HTTP Authentication Scheme [I-D.ietf-httpauth-payment]. It specifies how
clients and servers exchange Bitcoin payments over the Lightning Network
using BOLT11 invoices, supporting one-time charges and optional hold invoice
flows for escrow-like payment patterns.

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
13. [Appendix A: Examples](#appendix-a-examples)
14. [Acknowledgements](#acknowledgements)
15. [Authors' Addresses](#authors-addresses)

---

## 1. Introduction

The Lightning Network is a layer-2 payment protocol built on top of Bitcoin
that enables fast, low-cost payments through a network of payment channels.
Payments are secured using Hash Time-Locked Contracts (HTLCs), where the
payer locks funds that can only be claimed by revealing a secret preimage.

This specification defines how Lightning Network payments integrate with
the Payment HTTP Authentication Scheme [I-D.ietf-httpauth-payment]. The
unique property of Lightning payments is that settlement is atomic: the
revelation of the payment preimage simultaneously proves payment and
constitutes settlement.

### 1.1. Lightning Payment Flow

The following diagram illustrates the Lightning-specific payment flow:

```
   Client                                            Server
      │                                                 │
      │  (1) GET /resource                              │
      ├────────────────────────────────────────────────>│
      │                                                 │
      │  (2) 402 Payment Required                       │
      │      WWW-Authenticate: Payment method="lightning",
      │        intent="charge", request=<base64url>     │
      │<────────────────────────────────────────────────┤
      │                                                 │
      │  (3) Client pays BOLT11 invoice via             │
      │      Lightning Network                          │
      │                                                 │
      │  (4) GET /resource                              │
      │      Authorization: Payment <credential>        │
      │      (contains preimage)                        │
      ├────────────────────────────────────────────────>│
      │                                                 │
      │  (5) Server verifies preimage matches           │
      │      payment_hash from invoice                  │
      │                                                 │
      │  (6) 200 OK                                     │
      │      Payment-Receipt: <receipt>                 │
      │<────────────────────────────────────────────────┤
      │                                                 │
```

### 1.2. Relationship to the Payment Scheme

This document is a payment method specification as defined in Section 10.1
of [I-D.ietf-httpauth-payment]. It defines the `request` and `payload`
structures for the `lightning` payment method, along with verification and
settlement procedures.

---

## 2. Requirements Language

The key words "MUST", "MUST NOT", "REQUIRED", "SHALL", "SHALL NOT",
"SHOULD", "SHOULD NOT", "RECOMMENDED", "NOT RECOMMENDED", "MAY", and
"OPTIONAL" in this document are to be interpreted as described in
BCP 14 [RFC2119] [RFC8174] when, and only when, they appear in all
capitals, as shown here.

---

## 3. Terminology

**BOLT11 Invoice**
: A payment request format defined by the Lightning Network specification
  (BOLT #11). It encodes the payment amount, destination, payment hash,
  expiry, and other metadata in a bech32-encoded string prefixed with `ln`.

**Payment Hash**
: A 256-bit SHA256 hash included in the BOLT11 invoice. The payer must
  reveal the preimage of this hash to claim payment.

**Preimage**
: A 32-byte secret value whose SHA256 hash equals the payment hash. 
  Possession of the preimage proves payment was completed.

**HTLC (Hash Time-Locked Contract)**
: The cryptographic construct used by Lightning Network to route payments.
  Funds are locked by a hash and can only be claimed by revealing the
  preimage before a timeout.

**Hold Invoice**
: A special type of Lightning invoice where the receiver delays settlement
  (revelation of the preimage) until some condition is met, enabling
  escrow-like payment patterns.

**Millisatoshi (msat)**
: The smallest unit in Lightning Network, equal to 1/1000 of a satoshi
  (1 satoshi = 100,000,000th of a Bitcoin).

---

## 4. Method Identifier

This specification registers the following payment method identifier:

```
lightning
```

The identifier is case-sensitive and MUST be lowercase. No sub-methods
are defined by this specification.

---

## 5. Payment Intents

This specification defines two payment intents for use with the `lightning`
payment method.

### 5.1. Intent: "charge"

A one-time payment using a standard BOLT11 invoice. The client pays the
invoice through the Lightning Network and presents the preimage as proof
of payment.

**Fulfillment mechanism:**

1. Server generates a BOLT11 invoice with a random payment hash
2. Client pays the invoice via Lightning Network
3. Client receives the preimage upon successful payment
4. Client presents the preimage as the credential

The preimage revelation is both the proof and the settlement—these are
atomic and inseparable in Lightning payments.

### 5.2. Intent: "hodl" (OPTIONAL)

A conditional payment using a hold invoice. The server generates a hold
invoice and the client pays it, but settlement is delayed until the server
explicitly settles or cancels the invoice.

**Fulfillment mechanism:**

1. Server generates a hold invoice (payment hash without knowing preimage)
2. Client generates a random preimage and provides its hash to the server
3. Client pays the hold invoice, locking funds in HTLCs
4. Server performs some action (e.g., delivers goods)
5. Client reveals the preimage to settle, or the invoice times out

This intent enables escrow-like patterns where payment is conditional on
delivery or other criteria.

**Note:** Hold invoices lock liquidity across the payment route. Servers
SHOULD use short expiry times and clients SHOULD be aware of the
implications.

---

## 6. Request Schema

The `request` parameter in the `WWW-Authenticate` challenge contains a
base64url-encoded JSON object.

### 6.1. Charge Request

For `intent="charge"`, the request contains a BOLT11 invoice:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `invoice` | string | REQUIRED | BOLT11-encoded payment request |
| `amount_msat` | string | OPTIONAL | Amount in millisatoshis if not encoded in invoice |

The `invoice` field contains the full BOLT11 payment request string. If
the invoice does not include an amount (e.g., for donations), the server
MAY specify `amount_msat` to indicate the required payment.

**Example:**

```json
{
  "invoice": "lnbc15u1p3xnhl2pp5jptserfk3zk4qy42tlucycrfwxhydvlemu9pqr93tuzlv9cc7g3sdqsvfhkcap3xyhx7un8cqzpgxqzjcsp5f8c52y2stc300gl6s4xswtjpc37hrnnr3c9wvtgjfuvqmpm35evq9qyyssqy4lgd8tj637qcjp05rdpxxykjenthxftej7a2zzmwrmrl70fyj9hvj0rewhzj7jfyuwkwcg9g2jpwtk3wkjtwnkdks84hsnu8xps5vsq4gj5hs"
}
```

This invoice requests 1500 satoshis (15u = 15 microsatoshis × 100,000,000).

### 6.2. Hold Request

For `intent="hodl"`, the request contains a hold invoice:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `invoice` | string | REQUIRED | BOLT11-encoded hold invoice |
| `amount_msat` | string | OPTIONAL | Amount in millisatoshis if not encoded |
| `payment_hash` | string | REQUIRED | 32-byte hex-encoded payment hash |

The `payment_hash` is provided separately to enable verification that the
client knows the corresponding preimage.

**Example:**

```json
{
  "invoice": "lnbc10u1p3xnhl2pp5qqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqypqdq5xysxxatsyp3k7enxv4jsxqzpusp5zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zygs9qyyssqjcyg23vr8w4c6hj0m35jh7yue7tr6lxwrkyc4r8v8e9dsa6g8ew8rn5m8wk4gfa4ayxc7a6q8vsdf6e5h3v2rpq0dz2xqzpulq8y0qpsxmf3v",
  "payment_hash": "0001020304050607080900010203040506070809000102030405060708090102"
}
```

---

## 7. Credential Schema

The credential payload contains proof of payment.

### 7.1. Charge Credential

For `intent="charge"`:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `type` | string | REQUIRED | MUST be "preimage" |
| `preimage` | string | REQUIRED | 32-byte hex-encoded payment preimage |

**Example:**

```json
{
  "id": "xK9mPqWvT2nJrHsY4aDfEb",
  "source": "did:pkh:bip122:000000000019d6689c085ae165831e93:bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh",
  "payload": {
    "type": "preimage",
    "preimage": "0102030405060708091011121314151617181920212223242526272829303132"
  }
}
```

### 7.2. Hold Credential

For `intent="hodl"`, the credential indicates the client has paid the hold
invoice and is ready for the server to perform its action:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `type` | string | REQUIRED | MUST be "hodl_paid" |
| `payment_hash` | string | REQUIRED | 32-byte hex-encoded payment hash |

The preimage is revealed later when the client settles the payment.

**Example:**

```json
{
  "id": "nR5tYuLpS8mWvXzQ1eCgHj",
  "payload": {
    "type": "hodl_paid",
    "payment_hash": "0001020304050607080900010203040506070809000102030405060708090102"
  }
}
```

---

## 8. Verification Procedure

### 8.1. Charge Verification

Servers MUST perform the following verification steps for `intent="charge"`:

1. **Parse the credential**: Decode the base64url credential and extract
   the `payload.preimage` field.

2. **Verify preimage format**: The preimage MUST be exactly 32 bytes
   (64 hex characters).

3. **Compute payment hash**: Calculate `SHA256(preimage)`.

4. **Extract invoice payment hash**: Parse the BOLT11 invoice from the
   original request and extract the payment hash (tagged field `p`).

5. **Compare hashes**: The computed hash MUST equal the invoice's payment
   hash. If they differ, reject the credential with a 401 response.

6. **Verify invoice not expired**: Check the invoice's timestamp plus
   expiry time (tagged field `x`, default 3600 seconds) has not passed.

7. **Verify challenge binding**: Confirm the credential's `id` field
   matches the challenge ID from the original 402 response.

8. **Check for replay**: Verify this preimage has not been used before.
   Servers MUST maintain a record of used preimages.

### 8.2. Hold Verification

For `intent="hodl"`, servers verify that the HTLC has been accepted:

1. **Check HTLC status**: Query the Lightning node to confirm the hold
   invoice has an accepted (locked) HTLC.

2. **Verify payment hash**: Confirm the HTLC's payment hash matches the
   one in the original request.

3. **Verify amount**: If specified, confirm the locked amount meets or
   exceeds the required amount.

---

## 9. Settlement Procedure

### 9.1. Charge Settlement

For standard charge payments, **settlement is atomic with verification**.
The existence of a valid preimage proves that:

1. The client paid the invoice
2. The server (or previous hop) received the funds

There is no separate settlement step. The preimage IS the settlement.
Servers SHOULD return a receipt containing:

| Field | Type | Description |
|-------|------|-------------|
| `method` | string | "lightning" |
| `payment_hash` | string | 32-byte hex payment hash |
| `amount_msat` | string | Amount paid in millisatoshis |
| `settled_at` | string | ISO 8601 timestamp |

### 9.2. Hold Settlement

For hold invoices, settlement is a separate step:

1. **Server performs action**: After verifying the HTLC is locked, the
   server performs whatever action was requested (e.g., ships goods).

2. **Server settles invoice**: When ready to receive payment, the server
   calls `SettleInvoice(preimage)` on its Lightning node.

3. **Alternatively, server cancels**: If the action cannot be completed,
   the server calls `CancelInvoice(payment_hash)` to release the locked
   funds back to the client.

The settlement or cancellation propagates through the Lightning Network
automatically.

---

## 10. Security Considerations

### 10.1. Invoice Expiry

BOLT11 invoices include an expiry time (default 3600 seconds). Servers
MUST verify that invoices have not expired before accepting credentials.
Expired invoices may have been paid to a different recipient if the
server's node has been compromised or if there's a race condition.

Servers SHOULD generate invoices with expiry times appropriate for the
expected user interaction time (typically 5-15 minutes for interactive
flows).

### 10.2. Amount Verification

When invoices include an amount, servers MUST verify the preimage
corresponds to an invoice for the correct amount. Zero-amount invoices
are useful for tips or donations but require the server to check the
actual amount paid via node APIs.

Servers SHOULD prefer invoices with encoded amounts for payment flows
where a specific amount is required.

### 10.3. Preimage Secrecy

The preimage is the sole proof of payment. Clients MUST NOT reveal
preimages to any party other than the server that issued the invoice.

Servers MUST transmit preimage credentials only over TLS-protected
connections to prevent interception.

Once a preimage is revealed, it can be used by anyone to prove payment.
Clients SHOULD treat preimages as sensitive credentials.

### 10.4. Replay Prevention

Servers MUST prevent replay of preimage credentials. Since the preimage
is deterministic for a given payment hash, the server MUST:

1. Track which invoices have been fulfilled
2. Reject credentials for already-fulfilled invoices
3. Generate unique invoices for each challenge

### 10.5. Invoice Reuse

Servers MUST NOT reuse BOLT11 invoices across multiple challenges. Each
402 response MUST contain a fresh invoice with a unique payment hash.
Invoice reuse could allow a single payment to satisfy multiple requests.

### 10.6. Hold Invoice Liquidity

Hold invoices lock liquidity across all routing nodes in the payment path.
This has several implications:

- Routing nodes may charge higher fees or refuse to route
- Long-held HTLCs tie up channel capacity
- Timeouts affect all nodes in the path

Servers using hold invoices SHOULD:

- Use the minimum hold time necessary
- Set appropriate CLTV deltas
- Monitor for channel jamming attacks

### 10.7. Preimage Source Verification

Clients obtain preimages from their Lightning node upon successful payment.
The preimage returned by the node is cryptographically bound to the payment
hash—there is no way to obtain a valid preimage without completing payment.

However, clients MUST verify they are communicating with their own node
over authenticated channels to prevent preimage theft.

---

## 11. IANA Considerations

### 11.1. Payment Method Registration

This document registers the following payment method in the "HTTP Payment
Authentication Methods" registry:

- **Method Name:** lightning
- **Reference:** This document
- **Notes:** Bitcoin Lightning Network payments via BOLT11 invoices

### 11.2. Payment Intent Registration

This document registers the following payment intents:

- **Intent Name:** charge
- **Applicable Methods:** lightning
- **Reference:** This document

- **Intent Name:** hodl
- **Applicable Methods:** lightning
- **Reference:** This document

---

## 12. References

### 12.1. Normative References

**[RFC2119]**
: Bradner, S., "Key words for use in RFCs to Indicate Requirement Levels",
  BCP 14, RFC 2119, DOI 10.17487/RFC2119, March 1997.

**[RFC8174]**
: Leiba, B., "Ambiguity of Uppercase vs Lowercase in RFC 2119 Key Words",
  BCP 14, RFC 8174, DOI 10.17487/RFC8174, May 2017.

**[I-D.ietf-httpauth-payment]**
: "HTTP Payment Authentication Scheme", Work in Progress.

### 12.2. Informative References

**[BOLT11]**
: "BOLT #11: Invoice Protocol for Lightning Payments",
  https://github.com/lightning/bolts/blob/master/11-payment-encoding.md

**[BOLT04]**
: "BOLT #4: Onion Routing Protocol",
  https://github.com/lightning/bolts/blob/master/04-onion-routing.md

---

## Appendix A: Examples

### A.1. Charge Flow

```
   Client                        Server                  Lightning Network
      │                             │                             │
      │  (1) GET /api/resource      │                             │
      ├────────────────────────────>│                             │
      │                             │                             │
      │  (2) 402 Payment Required   │                             │
      │      invoice in request     │                             │
      │<────────────────────────────┤                             │
      │                             │                             │
      │  (3) Pay invoice            │                             │
      ├──────────────────────────────────────────────────────────>│
      │  (4) Receive preimage       │                             │
      │<──────────────────────────────────────────────────────────┤
      │                             │                             │
      │  (5) Authorization: Payment │                             │
      │      (with preimage)        │                             │
      ├────────────────────────────>│                             │
      │                             │                             │
      │  (6) 200 OK + Receipt       │                             │
      │<────────────────────────────┤                             │
      │                             │                             │
```

**Challenge:**

```http
HTTP/1.1 402 Payment Required
WWW-Authenticate: Payment id="xK9mPqWvT2nJrHsY4aDfEb",
  realm="api.example.com",
  method="lightning",
  intent="charge",
  request="eyJpbnZvaWNlIjoibG5iYzE1dTFwM3huaGwycHA1anB0c2VyZmszems0cXk0MnRsdWN5Y3Jmd3hoeWR2bGVtdTlwcXI5M3R1emx2OWNjN2czc2RxdnZmaGtjYXAzeWhkNzd1bjhjcXpwZ3hxempjc3A1ZjhjNTJ5MnN0YzMwMGdsNnM0eHN3dGpwYzM3aHJubnIzYzl3dnRnamZ1dnFtcG0zNWV2cTlxeXNzcXk0bGdkOHRqNjM3cWNqcDA1cmRweHh5a2plbnRoeGZ0ZWo3YTJ6em13cm1ybDcwZnlqOWh2ajByZXdoemo3amZ5dXdrd2NnOWcyanB3dGszd2tqdHdua2RrczgyNGhzbnU4eHBzNXZzcTRnajVocyJ9"
```

The `request` decodes to:

```json
{
  "invoice": "lnbc15u1p3xnhl2pp5jptserfk3zk4qy42tlucycrfwxhydvlemu9pqr93tuzlv9cc7g3sdqsvfhkcap3xyhx7un8cqzpgxqzjcsp5f8c52y2stc300gl6s4xswtjpc37hrnnr3c9wvtgjfuvqmpm35evq9qyyssqy4lgd8tj637qcjp05rdpxxykjenthxftej7a2zzmwrmrl70fyj9hvj0rewhzj7jfyuwkwcg9g2jpwtk3wkjtwnkdks84hsnu8xps5vsq4gj5hs"
}
```

This requests a payment of 1500 satoshis.

**Credential:**

```http
GET /api/resource HTTP/1.1
Host: api.example.com
Authorization: Payment eyJpZCI6InhLOW1QcVd2VDJuSnJIc1k0YURmRWIiLCJwYXlsb2FkIjp7InR5cGUiOiJwcmVpbWFnZSIsInByZWltYWdlIjoiMDEwMjAzMDQwNTA2MDcwODA5MTAxMTEyMTMxNDE1MTYxNzE4MTkyMDIxMjIyMzI0MjUyNjI3MjgyOTMwMzEzMiJ9fQ
```

The credential decodes to:

```json
{
  "id": "xK9mPqWvT2nJrHsY4aDfEb",
  "payload": {
    "type": "preimage",
    "preimage": "0102030405060708091011121314151617181920212223242526272829303132"
  }
}
```

**Response with receipt:**

```http
HTTP/1.1 200 OK
Payment-Receipt: eyJtZXRob2QiOiJsaWdodG5pbmciLCJwYXltZW50X2hhc2giOiI5MGI1YzIzNDliMTM2YWEwNDU1MmY3ZjM4MzA0MTI5OGJhZDhjZmNlNmYwNTgwNjJjNWY4MTdmMzBjNjNkMjIzIiwiYW1vdW50X21zYXQiOiIxNTAwMDAwIiwic2V0dGxlZF9hdCI6IjIwMjYtMDEtMTVUMTI6MDA6MDBaIn0
Content-Type: application/json

{ "data": "..." }
```

The receipt decodes to:

```json
{
  "method": "lightning",
  "payment_hash": "90b5c2349b136aa04552f7f383041298bad8cfce6f058062c5f817f30c63d223",
  "amount_msat": "1500000",
  "settled_at": "2026-01-15T12:00:00Z"
}
```

### A.2. Hold Invoice Flow

```
   Client                        Server                  Lightning Network
      │                             │                             │
      │  (1) GET /api/escrow        │                             │
      ├────────────────────────────>│                             │
      │                             │                             │
      │  (2) 402 Payment Required   │                             │
      │      hold invoice           │                             │
      │<────────────────────────────┤                             │
      │                             │                             │
      │  (3) Pay hold invoice       │                             │
      ├──────────────────────────────────────────────────────────>│
      │  (4) HTLC locked            │                             │
      │<──────────────────────────────────────────────────────────┤
      │                             │                             │
      │  (5) Authorization: Payment │                             │
      │      (hodl_paid)            │                             │
      ├────────────────────────────>│                             │
      │                             │                             │
      │  (6) Server performs action │                             │
      │                             │                             │
      │  (7) Server settles invoice │                             │
      │                             ├────────────────────────────>│
      │                             │                             │
      │  (8) 200 OK + Receipt       │                             │
      │<────────────────────────────┤                             │
      │                             │                             │
```

---

## Acknowledgements

The authors thank the Lightning Network community and the developers of
LND, Core Lightning, Eclair, and other implementations for their work on
the BOLT specifications.

---

## Authors' Addresses

Georgios Konstantopoulos
Tempo Labs
Email: georgios@tempo.xyz
