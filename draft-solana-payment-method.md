---
title: Solana Payment Method for HTTP Payment Authentication
docName: draft-solana-payment-method-00
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

This document defines the "solana" payment method for use with the Payment
HTTP Authentication Scheme [I-D.ietf-httpauth-payment]. It specifies how
clients and servers exchange SPL Token payments on the Solana blockchain,
supporting one-time charges via signed transactions.

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
10. [Internationalization Considerations](#10-internationalization-considerations)
11. [Security Considerations](#11-security-considerations)
12. [IANA Considerations](#12-iana-considerations)
13. [References](#13-references)
14. [Appendix A: Examples](#appendix-a-examples)
15. [Acknowledgements](#acknowledgements)
16. [Authors' Addresses](#authors-addresses)

---

## 1. Introduction

Solana is a high-performance blockchain supporting fast, low-cost
transactions. This specification defines how Solana's payment primitives
integrate with the Payment HTTP Authentication Scheme
[I-D.ietf-httpauth-payment].

Solana supports two primary asset types for payments:

1. **Native SOL**: The native currency of the Solana network, denominated
   in lamports (1 SOL = 1,000,000,000 lamports).

2. **SPL Tokens**: Fungible tokens created using the SPL Token Program,
   identified by their mint address.

This specification supports one-time charges via signed Solana transactions.
The client signs a transaction containing the payment instruction, and the
server broadcasts it to the Solana network for settlement.

### 1.1. Solana Payment Flow

The following diagram illustrates the Solana-specific payment flow:

```
   Client                                            Server
      │                                                 │
      │  (1) GET /resource                              │
      ├────────────────────────────────────────────────>│
      │                                                 │
      │  (2) 402 Payment Required                       │
      │      WWW-Authenticate: Payment method="solana", │
      │        intent="charge", request=<base64url>     │
      │<────────────────────────────────────────────────┤
      │                                                 │
      │  (3) Client constructs and signs Solana         │
      │      transaction with transfer instruction      │
      │                                                 │
      │  (4) GET /resource                              │
      │      Authorization: Payment <credential>        │
      ├────────────────────────────────────────────────>│
      │                                                 │
      │  (5) Server broadcasts transaction via          │
      │      sendTransaction RPC                        │
      │                                                 │
      │  (6) 200 OK                                     │
      │      Payment-Receipt: <receipt with signature>  │
      │<────────────────────────────────────────────────┤
      │                                                 │
```

### 1.2. Relationship to the Payment Scheme

This document is a payment method specification as defined in Section 10.1
of [I-D.ietf-httpauth-payment]. It defines the `request` and `payload`
structures for the `solana` payment method, along with verification and
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

**Lamports**
: The smallest unit of SOL. 1 SOL = 1,000,000,000 lamports.

**SPL Token**
: A token created using the Solana Program Library Token Program. SPL
  Tokens are identified by their mint address and may have varying
  decimal places (commonly 6 or 9).

**Mint Address**
: The public key that uniquely identifies an SPL Token type. Used to
  reference which token is being transferred.

**Associated Token Account (ATA)**
: A deterministically derived token account for a given wallet and mint.
  The standard way to hold SPL Tokens.

**Recent Blockhash**
: A hash of a recent block used as a transaction timestamp. Transactions
  expire after approximately 60-90 seconds (150 blocks) if the blockhash
  becomes stale.

**Transaction Signature**
: A 64-byte Ed25519 signature over the transaction message. The first
  signature identifies the transaction and serves as the transaction ID.

**Versioned Transaction**
: Solana's transaction format supporting version 0 (with Address Lookup
  Tables) and legacy format.

---

## 4. Method Identifier

This specification registers the following payment method identifier:

```
solana
```

The identifier is case-sensitive and MUST be lowercase.

---

## 5. Payment Intents

This specification defines one payment intent for use with the `solana`
payment method.

### 5.1. Intent: "charge"

A one-time payment of the specified amount. The server submits the
signed transaction to the Solana network for settlement.

**Fulfillment mechanisms:**

1. **SOL Transfer**: For native SOL payments, the payer signs a transaction
   containing a System Program `transfer` instruction.

2. **SPL Token Transfer**: For token payments, the payer signs a transaction
   containing a Token Program `transferChecked` instruction.

---

## 6. Request Schema

The `request` parameter in the `WWW-Authenticate` challenge contains a
base64url-encoded JSON object. The schema varies based on whether the
payment is for native SOL or SPL Tokens.

### 6.1. Charge Request

For `intent="charge"`, the request specifies a one-time payment:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `amount` | string | REQUIRED | Amount in base units (lamports for SOL, smallest unit for tokens) |
| `asset` | string | REQUIRED | `"SOL"` for native SOL, or SPL Token mint address (base58) |
| `destination` | string | REQUIRED | Recipient public key (base58) |
| `expires` | string | REQUIRED | Expiry timestamp in ISO 8601 format |
| `recentBlockhash` | string | OPTIONAL | Server-provided recent blockhash (base58) |
| `memo` | string | OPTIONAL | Optional memo to include in transaction |

**Notes:**

- When `asset` is `"SOL"`, `destination` is a wallet public key.
- When `asset` is an SPL Token mint, `destination` is the Associated Token
  Account (ATA) or token account of the recipient.
- If `recentBlockhash` is provided, clients SHOULD use it. Otherwise,
  clients MUST fetch a recent blockhash from an RPC node.
- The `amount` field is always a string to support arbitrary precision.

**Example (SOL transfer):**

```json
{
  "amount": "10000000",
  "asset": "SOL",
  "destination": "5FHwkrdxNu1BLswfX9p2J6B9phYPfLMWrGgxYsGTVqUo",
  "expires": "2026-01-15T12:00:00Z"
}
```

This requests a transfer of 0.01 SOL (10,000,000 lamports).

**Example (SPL Token transfer):**

```json
{
  "amount": "1000000",
  "asset": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  "destination": "Ek8Lpds5GBpMpKTNMsxNHsCdDmv2GBU7U8vS2yCy1CY5",
  "expires": "2026-01-15T12:00:00Z",
  "recentBlockhash": "GHtXQBsoZHVnNFa9YevAzFr17DJjgHXk3ycTKD5xD3Zi"
}
```

This requests a transfer of 1.00 USDC (1,000,000 base units with 6 decimals)
to the specified token account.

---

## 7. Credential Schema

The `payload` field in the Authorization credential contains the signed
transaction.

### 7.1. Transaction Payload

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `type` | string | REQUIRED | MUST be `"transaction"` |
| `transaction` | string | REQUIRED | Base64-encoded serialized signed transaction |

**Notes:**

- The `transaction` field contains a fully signed, serialized Solana
  transaction ready for submission.
- Transactions may be legacy format or versioned (v0).
- The transaction MUST be signed by all required signers (at minimum,
  the fee payer/source account).

**Example:**

```json
{
  "type": "transaction",
  "transaction": "AQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABAAEDrGvb...base64 encoded transaction..."
}
```

---

## 8. Verification Procedure

Servers MUST perform the following verification steps before settlement:

### 8.1. Transaction Deserialization

1. Base64-decode the `transaction` field.
2. Deserialize the transaction using Solana's transaction format.
3. Verify the transaction is well-formed and not malformed.

### 8.2. Signature Verification

1. Extract all signatures from the transaction.
2. Verify each signature against the transaction message.
3. Verify the first signer (fee payer) matches the expected source account.
4. Verify the `source` field in the credential (if present) matches the
   signer's public key using the `did:pkh:solana:{pubkey}` format.

### 8.3. Instruction Verification

For SOL transfers:

1. Verify the transaction contains a System Program `transfer` instruction.
2. Verify the `from` account matches the signer.
3. Verify the `to` account matches the `destination` in the request.
4. Verify the transfer amount matches or exceeds the requested `amount`.

For SPL Token transfers:

1. Verify the transaction contains a Token Program `transfer` or
   `transferChecked` instruction.
2. Verify the source token account is owned by the signer.
3. Verify the destination token account matches the `destination` in the
   request.
4. Verify the mint address matches the `asset` in the request.
5. Verify the transfer amount matches or exceeds the requested `amount`.

### 8.4. Blockhash Verification

1. If the server provided a `recentBlockhash` in the request, verify the
   transaction uses that blockhash.
2. Verify the blockhash is recent (less than 150 blocks old) using the
   `isBlockhashValid` RPC method or by checking block height.
3. Reject transactions with stale blockhashes.

### 8.5. Expiry Verification

1. Verify the current time is before the `expires` timestamp.
2. Reject credentials submitted after expiry.

---

## 9. Settlement Procedure

After successful verification, the server settles the payment:

### 9.1. Transaction Submission

1. Submit the signed transaction using the `sendTransaction` RPC method.
2. Use appropriate commitment levels:
   - `processed`: Transaction has been received and processed.
   - `confirmed`: Transaction has been confirmed by supermajority.
   - `finalized`: Transaction has reached maximum lockout.

**Example RPC call:**

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "sendTransaction",
  "params": [
    "AQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABAAEDrGvb...",
    {
      "encoding": "base64",
      "skipPreflight": false,
      "preflightCommitment": "confirmed"
    }
  ]
}
```

### 9.2. Confirmation Polling

1. Extract the transaction signature from the `sendTransaction` response.
2. Poll `getSignatureStatuses` to monitor confirmation status.
3. Wait for desired commitment level before considering settlement complete.

**Example polling:**

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "getSignatureStatuses",
  "params": [
    ["5VERv8NMvzbJMEkV8xnrLkEaWRtSz9CosKDYjCJjBRnbJLgp8uirBgmQpjKhoR4tjF3ZpRzrFmBV6UjKdiSZkQUW"],
    { "searchTransactionHistory": true }
  ]
}
```

### 9.3. Receipt Generation

Upon successful confirmation, generate a receipt containing:

| Field | Type | Description |
|-------|------|-------------|
| `method` | string | `"solana"` |
| `status` | string | `"success"` or `"pending"` |
| `signature` | string | Transaction signature (base58) |
| `slot` | number | Slot in which transaction was confirmed |
| `confirmationStatus` | string | `"processed"`, `"confirmed"`, or `"finalized"` |
| `timestamp` | string | ISO 8601 timestamp |

**Example receipt:**

```json
{
  "method": "solana",
  "status": "success",
  "signature": "5VERv8NMvzbJMEkV8xnrLkEaWRtSz9CosKDYjCJjBRnbJLgp8uirBgmQpjKhoR4tjF3ZpRzrFmBV6UjKdiSZkQUW",
  "slot": 123456789,
  "confirmationStatus": "confirmed",
  "timestamp": "2026-01-15T11:30:00Z"
}
```

---

## 10. Internationalization Considerations

This document has no internationalization considerations beyond those
specified in [I-D.ietf-httpauth-payment].

---

## 11. Security Considerations

### 11.1. Blockhash Freshness

Blockhashes expire after approximately 60-90 seconds (150 blocks). Servers
SHOULD:

1. Provide a fresh `recentBlockhash` in the request when possible.
2. Verify blockhash validity before accepting transactions.
3. Reject transactions with stale blockhashes to prevent replay attacks.

Clients SHOULD:

1. Use server-provided blockhashes when available.
2. Fetch fresh blockhashes immediately before signing.
3. Submit credentials promptly after signing.

### 11.2. Signature Verification

Ed25519 signatures MUST be verified before transaction submission to
prevent:

1. Submitting invalid transactions that will fail and waste resources.
2. Accepting credentials from unauthorized parties.

Servers MUST verify that the transaction signer matches the expected
payer identity.

### 11.3. Transaction Simulation

Servers SHOULD simulate transactions before submission using the
`simulateTransaction` RPC method. This prevents:

1. Submitting transactions that will fail (insufficient funds, etc.).
2. Unexpected transaction behavior.

### 11.4. Double-Spend Prevention

The challenge `id` MUST be unique and bound to a specific payment request.
Servers MUST:

1. Track used challenge IDs to prevent credential replay.
2. Verify the credential's `id` matches the issued challenge.
3. Consider a credential consumed after successful settlement.

### 11.5. RPC Node Trust

Servers rely on RPC nodes for transaction submission and confirmation.
Consider:

1. Using multiple RPC nodes for redundancy.
2. Verifying transaction inclusion independently.
3. Using trusted RPC providers or running dedicated nodes.

### 11.6. Token Account Validation

For SPL Token transfers, verify:

1. The destination token account exists and is initialized.
2. The token account's mint matches the requested asset.
3. Consider creating ATAs on behalf of recipients if needed.

### 11.7. Amount Precision

Token amounts vary in decimal precision. Servers MUST:

1. Handle amounts as strings to preserve precision.
2. Validate amounts against the token's decimal configuration.
3. Reject transactions with insufficient amounts.

---

## 12. IANA Considerations

### 12.1. Payment Method Registration

This specification registers the following payment method in the
"HTTP Payment Method" registry:

- **Method Identifier**: `solana`
- **Reference**: This document
- **Description**: Solana blockchain payments (SOL and SPL Tokens)

---

## 13. References

### 13.1. Normative References

- [I-D.ietf-httpauth-payment] The "Payment" HTTP Authentication Scheme
- [RFC2119] Key words for use in RFCs
- [RFC8174] Ambiguity of Uppercase vs Lowercase in RFC 2119 Key Words

### 13.2. Informative References

- Solana Documentation: https://solana.com/docs
- SPL Token Program: https://spl.solana.com/token
- Solana Web3.js: https://solana-labs.github.io/solana-web3.js/

---

## Appendix A: Examples

### A.1. Charge (SOL Transfer)

```
   Client                        Server                     Solana Network
      │                             │                             │
      │  (1) GET /api/resource      │                             │
      ├────────────────────────────>│                             │
      │                             │                             │
      │  (2) 402 Payment Required   │                             │
      │      intent="charge"        │                             │
      │<────────────────────────────┤                             │
      │                             │                             │
      │  (3) Sign SOL transfer tx   │                             │
      │                             │                             │
      │  (4) Authorization: Payment │                             │
      ├────────────────────────────>│                             │
      │                             │  (5) sendTransaction        │
      │                             ├────────────────────────────>│
      │                             │  (6) Confirmed              │
      │                             │<────────────────────────────┤
      │  (7) 200 OK + Receipt       │                             │
      │<────────────────────────────┤                             │
      │                             │                             │
```

**Challenge:**

```http
HTTP/1.1 402 Payment Required
WWW-Authenticate: Payment id="aB3dEf7hIjKlMnOpQrStUv",
  realm="api.example.com",
  method="solana",
  intent="charge",
  request="eyJhbW91bnQiOiIxMDAwMDAwMCIsImFzc2V0IjoiU09MIiwiZGVzdGluYXRpb24iOiI1Rkh3a3JkeE51MUJMY3dmWDlwMko2QjlwaFlQZkxNV3JHZ3hZc0dUVnFVbyIsImV4cGlyZXMiOiIyMDI2LTAxLTE1VDEyOjAwOjAwWiJ9"
```

The `request` decodes to:

```json
{
  "amount": "10000000",
  "asset": "SOL",
  "destination": "5FHwkrdxNu1BLswfX9p2J6B9phYPfLMWrGgxYsGTVqUo",
  "expires": "2026-01-15T12:00:00Z"
}
```

This requests a transfer of 0.01 SOL (10,000,000 lamports).

**Credential:**

```http
GET /api/resource HTTP/1.1
Host: api.example.com
Authorization: Payment eyJpZCI6ImFCM2RFZjdoSWpLbE1uT3BRclN0VXYiLCJzb3VyY2UiOiJkaWQ6cGtoOnNvbGFuYTpHaHRYUUJzb1pIVm5ORmE5WWV2QXpGcjE3REpqZ0hYazN5Y1RLRDV4RDNaaSIsInBheWxvYWQiOnsidHlwZSI6InRyYW5zYWN0aW9uIiwidHJhbnNhY3Rpb24iOiJBUUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQkFBRURyR3ZiLi4uIn19
```

The credential decodes to:

```json
{
  "id": "aB3dEf7hIjKlMnOpQrStUv",
  "source": "did:pkh:solana:GhtXQBsoZHVnNFa9YevAzFr17DJjgHXk3ycTKD5xD3Zi",
  "payload": {
    "type": "transaction",
    "transaction": "AQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABAAEDrGvb..."
  }
}
```

**Response with receipt:**

```http
HTTP/1.1 200 OK
Payment-Receipt: eyJtZXRob2QiOiJzb2xhbmEiLCJzdGF0dXMiOiJzdWNjZXNzIiwic2lnbmF0dXJlIjoiNVZFUnY4Tk12emJKTUVrVjh4bnJMa0VhV1J0U3o5Q29zS0RZakNKakJSbmJKTGdwOHVpckJnbVFwaktob1I0dGpGM1pwUnpyRm1CVjZVaktkaVNaa1FVVyIsInNsb3QiOjEyMzQ1Njc4OSwiY29uZmlybWF0aW9uU3RhdHVzIjoiY29uZmlybWVkIiwidGltZXN0YW1wIjoiMjAyNi0wMS0xNVQxMTozMDowMFoifQ
Content-Type: application/json

{ "data": "..." }
```

The receipt decodes to:

```json
{
  "method": "solana",
  "status": "success",
  "signature": "5VERv8NMvzbJMEkV8xnrLkEaWRtSz9CosKDYjCJjBRnbJLgp8uirBgmQpjKhoR4tjF3ZpRzrFmBV6UjKdiSZkQUW",
  "slot": 123456789,
  "confirmationStatus": "confirmed",
  "timestamp": "2026-01-15T11:30:00Z"
}
```

### A.2. Charge (SPL Token Transfer)

**Challenge:**

```http
HTTP/1.1 402 Payment Required
WWW-Authenticate: Payment id="xY9zA1bC2dE3fG4hI5jK6l",
  realm="api.example.com",
  method="solana",
  intent="charge",
  request="eyJhbW91bnQiOiI1MDAwMDAwIiwiYXNzZXQiOiJFUGpGV2RkNUF1ZnFTU3FlTTJxTjF4enliYXBDOEc0d0VHR2tad3lURHQxdiIsImRlc3RpbmF0aW9uIjoiRWs4THBkczVHQnBNcEtUTk1zeE5IQ3NEZG12MkdCVTdVOHZTMnlDeTFDWTUiLCJleHBpcmVzIjoiMjAyNi0wMS0xNVQxMjowMDowMFoiLCJyZWNlbnRCbG9ja2hhc2giOiJHaHRYUUJzb1pIVm5ORmE5WWV2QXpGcjE3REpqZ0hYazN5Y1RLRDV4RDNaaSJ9"
```

The `request` decodes to:

```json
{
  "amount": "5000000",
  "asset": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  "destination": "Ek8Lpds5GBpMpKTNMsxNHsCdDmv2GBU7U8vS2yCy1CY5",
  "expires": "2026-01-15T12:00:00Z",
  "recentBlockhash": "GhtXQBsoZHVnNFa9YevAzFr17DJjgHXk3ycTKD5xD3Zi"
}
```

This requests a transfer of 5.00 USDC (5,000,000 base units with 6 decimals)
to the specified token account. The asset `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v`
is the USDC mint address on Solana mainnet.

**Credential:**

```json
{
  "id": "xY9zA1bC2dE3fG4hI5jK6l",
  "source": "did:pkh:solana:7Np41oeYqPefeNQEHSv1UDhYrehxin3NStELsSKCT4K2",
  "payload": {
    "type": "transaction",
    "transaction": "AQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACAAEEBJqq..."
  }
}
```

---

## Acknowledgements

The authors thank the Solana community for their documentation and the
developers of the Solana Web3.js library.

---

## Authors' Addresses

Georgios Konstantopoulos
Tempo Labs
Email: georgios@tempo.xyz
