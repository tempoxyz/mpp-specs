---
title: Tempo Payment Method for HTTP Payment Authentication
docName: draft-tempo-payment-method-00
category: std
ipr: trust200902
submissionType: IETF
consensus: true

author:
  - fullname: Jake Moxey
    email: jake@tempo.xyz
    organization: Tempo Labs
---

## Abstract

This document defines the "tempo" payment method for use with the Payment
HTTP Authentication Scheme [I-D.ietf-httpauth-payment]. It specifies how
clients and servers exchange TIP-20 token payments on the Tempo blockchain,
supporting one-time charges, payment authorizations, and recurring subscriptions.

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
14. [Appendix A: ABNF Collected](#appendix-a-abnf-collected)
15. [Appendix B: Examples](#appendix-b-examples)
16. [Acknowledgements](#acknowledgements)
17. [Authors' Addresses](#authors-addresses)

---

## 1. Introduction

The Tempo blockchain is a payments-focused EVM network with native support
for stablecoin transactions, account abstraction, and programmable payment
authorization. This specification defines how Tempo's payment primitives
integrate with the Payment HTTP Authentication Scheme
[I-D.ietf-httpauth-payment].

Tempo provides two mechanisms for authorizing payments:

1. **Tempo Transactions**: EIP-2718 type 0x76 transactions with TIP-20
   token operations (`transfer`, `approve`)

2. **Access Keys**: Delegated signing keys with spending limits and expiry


This specification supports three payment intents:

- **charge**: One-time TIP-20 token transfer
- **authorize**: Payment authorization with spending limits
- **subscription**: Recurring payment authorization with periodic limits

### 1.1. Tempo Payment Flow

The following diagram illustrates the Tempo-specific payment flow:

```
   Client                                            Server
      │                                                 │
      │  (1) GET /resource                              │
      ├────────────────────────────────────────────────>│
      │                                                 │
      │  (2) 402 Payment Required                       │
      │      WWW-Authenticate: Payment method="tempo",  │
      │        intent="charge", request=<base64url>     │
      │<────────────────────────────────────────────────┤
      │                                                 │
      │  (3) Client signs Tempo Transaction or          │
      │      Key Authorization                          │
      │                                                 │
      │  (4) GET /resource                              │
      │      Authorization: Payment <credential>        │
      ├────────────────────────────────────────────────>│
      │                                                 │
      │  (5) Server broadcasts transaction via          │
      │      eth_sendRawTransactionSync                 │
      │                                                 │
      │  (6) 200 OK                                     │
      │      Payment-Receipt: <receipt with txHash>     │
      │<────────────────────────────────────────────────┤
      │                                                 │
```

### 1.2. Relationship to the Payment Scheme

This document is a payment method specification as defined in Section 10.1
of [I-D.ietf-httpauth-payment]. It defines the `request` and `payload`
structures for the `tempo` payment method, along with verification and
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

**TIP-20**
: Tempo's enshrined token standard, implemented as precompiles rather
  than smart contracts. TIP-20 tokens use 6 decimal places and provide
  `transfer`, `transferFrom`, and `approve` operations.

**Tempo Transaction**
: An EIP-2718 transaction with type prefix `0x76`, supporting batched
  calls, multiple signature types (secp256k1, P256, WebAuthn), 2D nonces,
  and validity windows.

**Access Key**
: A delegated signing key. Access keys may have an expiry timestamp and 
  a per-token spending limit.

**2D Nonce**
: Tempo's nonce system where each account has multiple independent nonce
  lanes (`nonce_key`), enabling parallel transaction submission.

**Fee Payer**
: An account that pays transaction fees on behalf of another account.
  Tempo Transactions support fee payment via a separate signature
  domain (`0x78`), allowing the server to pay for fees while the client
  only signs the payment authorization.

---

## 4. Method Identifier

This specification registers the following payment method identifier:

```
tempo
```

The identifier is case-sensitive and MUST be lowercase. No sub-methods
are defined by this specification.

---

## 5. Payment Intents

This specification defines three payment intents for use with the `tempo`
payment method. These intents are registered in the Payment Intent Registry
per Section 13.4 of [I-D.ietf-httpauth-payment].

### 5.1. Intent: "charge"

A one-time payment of the specified amount. The server may submit the
signed transaction any time before the `expires` timestamp.

**Fulfillment mechanisms:**

1. **Tempo Transaction with `transfer`**: The payer signs a Tempo
   Transaction calling `transfer(recipient, amount)` on the specified
   TIP-20 token.

### 5.2. Intent: "authorize"

A payment authorization. The payer grants the server permission
to charge up to the specified amount before the expiry timestamp.

**Required parameters:**

- Expiry timestamp (MUST be a reasonable future time)
- Maximum amount (spending limit)

**Fulfillment mechanisms:**

1. **Tempo Transaction with `approve`**: The payer signs a Tempo
   Transaction calling `approve(spender, amount)` on the TIP-20 token,
   with `validBefore` set to the requested expiry.

2. **Access Key with expiry and limit**: The payer provisions an access
   key with the requested expiry timestamp and a spending limit for the
   specified token and amount.

### 5.3. Intent: "subscription"

A recurring payment authorization. The payer grants the server permission
to charge a specified amount per period (e.g., daily, weekly, monthly).

**Required parameters:**

- Period duration in seconds
- Maximum amount per period
- Optional: Expiry timestamp

**Fulfillment mechanism:**

- **Access Key with periodic limits**: The payer provisions an access key
  with a recurring spending limit. The limit resets after each period.

---

## 6. Request Schema

The `request` parameter in the `WWW-Authenticate` challenge contains a
base64url-encoded JSON object. The schema is determined by the `intent`
parameter in the challenge. Clients parse the request and construct the
appropriate Tempo Transaction or Key Authorization to fulfill it.

### 6.1. Charge Request

For `intent="charge"`, the request specifies a one-time payment:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `amount` | string | REQUIRED | Amount in base units (stringified number) |
| `asset` | string | REQUIRED | TIP-20 token address |
| `destination` | string | REQUIRED | Recipient address |
| `expires` | string | REQUIRED | Expiry timestamp in ISO 8601 format |
| `feePayer` | boolean | OPTIONAL | If `true`, server will pay transaction fees (default: `false`) |

**Example:**

```json
{
  "amount": "1000000",
  "asset": "0x20c0000000000000000000000000000000000001",
  "destination": "0x742d35Cc6634C0532925a3b844Bc9e7595f8fE00",
  "expires": "2025-01-06T12:00:00Z",
  "feePayer": true
}
```

The client fulfills this by signing a Tempo Transaction with
`transfer(destination, amount)` on the specified `asset`, with `validBefore`
set to `expires`. The client SHOULD use a dedicated `nonceKey` (2D nonce lane)
for payment transactions to avoid blocking other account activity if the
transaction is not immediately settled.

If `feePayer` is `true`, the client signs with `fee_payer_signature` set to
`0x00` and `fee_token` empty, allowing the server to sponsor fees. If
`feePayer` is `false` or omitted, the client MUST set `fee_token` and pay
fees themselves.

### 6.2. Authorize Request

For `intent="authorize"`, the request specifies a payment authorization:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `asset` | string | REQUIRED | TIP-20 token address |
| `destination` | string | OPTIONAL | Authorized spender address (required for transaction fulfillment) |
| `expires` | string | REQUIRED | Expiry timestamp in ISO 8601 format |
| `feePayer` | boolean | OPTIONAL | If `true`, server will pay transaction fees (default: `false`) |
| `limit` | string | REQUIRED | Maximum spend amount in base units (stringified number) |
| `validFrom` | string | OPTIONAL | Start timestamp in ISO 8601 format |

**Example:**

```json
{
  "asset": "0x20c0000000000000000000000000000000000001",
  "expires": "2025-02-05T12:00:00Z",
  "feePayer": true,
  "limit": "50000000"
}
```

The client fulfills this by either:

1. Signing a Tempo Transaction with `approve(destination, limit)` on the
   specified `asset`, with `validBefore` set to `expires` and optionally
   `validAfter` set to `validFrom`. The `destination` field MUST be present
   in the request when using transaction fulfillment. The client SHOULD use
   a dedicated `nonceKey` (2D nonce lane) for payment transactions.
2. Signing a Key Authorization with expiry = `expires` and a spending limit
   = `limit` for the specified `asset`

If `feePayer` is `true`, the client signs with `fee_payer_signature` set to
`0x00` and `fee_token` empty. If `feePayer` is `false` or omitted, the client
MUST NOT sign a key authorization; the client MUST sign a transaction with
`fee_token` set to pay fees themselves.

### 6.3. Subscription Request

For `intent="subscription"`, the request specifies recurring authorization:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `amount` | string | REQUIRED | Amount per period in base units (stringified number) |
| `asset` | string | REQUIRED | TIP-20 token address |
| `expires` | string | REQUIRED | Total expiry timestamp in ISO 8601 format |
| `period` | string | REQUIRED | Period duration in seconds (stringified number) |
| `validFrom` | string | OPTIONAL | Start timestamp in ISO 8601 format |

**Example:**

```json
{
  "amount": "10000000",
  "asset": "0x20c0000000000000000000000000000000000001",
  "expires": "2026-01-06T00:00:00Z",
  "period": "2592000"
}
```

The `period` value `2592000` represents 30 days in seconds.

The client fulfills this by signing a Key Authorization with:
- Expiry = `expires`
- Periodic spending limit = `amount` per `period` for the specified `asset`

Tempo Transactions cannot fulfill subscription intents because ERC-20 style
approvals do not support periodic limit semantics.

---

## 7. Credential Schema

The credential in the `Authorization` header contains a base64url-encoded
JSON object per Section 5.2 of [I-D.ietf-httpauth-payment].

### 7.1. Credential Structure

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | REQUIRED | Challenge ID from the server's `WWW-Authenticate` header |
| `source` | string | OPTIONAL | Payer identifier as a DID (e.g., `did:pkh:eip155:42431:0x...`) |
| `payload` | object | REQUIRED | Tempo-specific payload object |

The `source` field, if present, SHOULD use the `did:pkh` method with the
Tempo chain ID (42431 for Moderato testnet) and the payer's
Ethereum address.

### 7.2. Payload Structure

The `payload` object contains:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `type` | string | REQUIRED | Fulfillment type: `"transaction"` or `"keyAuthorization"` |
| `signature` | string | REQUIRED | Hex-encoded RLP-serialized signed data |

### 7.3. Transaction Payload

When `type` is `"transaction"`, `signature` contains the complete signed
Tempo Transaction (type 0x76) serialized as RLP and hex-encoded with
`0x` prefix. The transaction MUST contain the appropriate TIP-20 call:

- For `charge`: `transfer(recipient, amount)`
- For `authorize`: `approve(spender, amount)`

**Example:**

```json
{
  "id": "kM9xPqWvT2nJrHsY4aDfEb",
  "payload": {
    "signature": "0x76f901...signed transaction bytes...",
    "type": "transaction"
  },
  "source": "did:pkh:eip155:42431:0x1234567890abcdef1234567890abcdef12345678"
}
```

### 7.4. Key Authorization Payload

When `type` is `"keyAuthorization"`, `signature` contains the complete signed
Key Authorization serialized as RLP and hex-encoded with `0x` prefix. The
authorization is signed by the root account and grants the access key
permission to sign transactions on its behalf.

**Example:**

```json
{
  "id": "kM9xPqWvT2nJrHsY4aDfEb",
  "payload": {
    "signature": "0xf8...signed authorization bytes...",
    "type": "keyAuthorization"
  }
}
```

---

## 8. Verification Procedure

Servers MUST verify credentials before granting access or initiating
settlement.

### 8.1. Credential Verification

For all credentials:

1. Decode the base64url credential and parse as JSON
2. Verify `id` matches a valid, unexpired, unused challenge
3. Verify `type` is `"transaction"` or `"keyAuthorization"`
4. Decode the hex-encoded `payload` field

### 8.2. Payload Verification

For `type="transaction"`, servers MUST deserialize and verify the Tempo
Transaction per [TEMPO-TX-SPEC].

For `type="keyAuthorization"`, servers MUST deserialize and verify the
Key Authorization per [TEMPO-TX-SPEC].

Servers SHOULD additionally verify that the transaction or authorization
parameters match the original request (asset, amount, destination, expiry).

---

## 9. Settlement Procedure

Settlement converts a verified credential into actual token transfer.

### 9.1. Fee Payment

When a request includes `feePayer: true`, the server commits to paying
transaction fees on behalf of the client. This allows clients to complete
payments without holding fee tokens.

#### 9.1.1. Server-Paid Fees

When `feePayer: true`:

1. **Client signs with placeholder**: The client signs the Tempo Transaction
   with `fee_payer_signature` set to a placeholder value (`0x00`) and
   `fee_token` left empty. The client uses signature domain `0x76`.

2. **Server receives credential**: The server extracts the client-signed
   transaction from the credential payload.

3. **Server adds fee payment signature**: The server selects a `fee_token` (any
   USD-denominated TIP-20 stablecoin) and signs the transaction using
   signature domain `0x78`. This signature commits to the transaction
   including the `fee_token` and client's address.

4. **Server broadcasts**: The final transaction contains both signatures:
   - Client's signature (authorizing the payment)
   - Server's `fee_payer_signature` (committing to pay fees)

#### 9.1.2. Client-Paid Fees

When `feePayer: false` or omitted, the client MUST set `fee_token` to a
valid USD TIP-20 token address and pay fees themselves. The server
broadcasts the transaction as-is without adding a fee payer signature.

#### 9.1.3. Server Requirements

When acting as fee payer, servers:

- MUST maintain sufficient balance of a USD TIP-20 token to pay
  transaction fees
- MAY use any USD-denominated TIP-20 token with sufficient AMM
  liquidity as the fee token
- MAY recover fee costs through pricing or other business logic

#### 9.1.4. Client Requirements

- When `feePayer: true`: Clients MUST sign with `fee_payer_signature` set
  to `0x00` and `fee_token` empty or `0x80` (RLP null)
- When `feePayer: false` or omitted: Clients MUST set `fee_token` to a
  valid USD TIP-20 token and have sufficient balance to pay fees

### 9.2. Charge Settlement (Transaction)

For `intent="charge"` fulfilled via transaction, the client signs a
transaction containing the `transfer` call. If `feePayer: true`, the server
adds its fee payer signature before broadcasting:

```
   Client                           Server                        Tempo Network
      │                                │                                │
      │  (1) Authorization:            │                                │
      │      Payment <credential>      │                                │
      ├───────────────────────────────>│                                │
      │                                │                                │
      │                                │  (2) If feePayer: true,        │
      │                                │      add fee payment signature │
      │                                │                                │
      │                                │  (3) eth_sendRawTxSync         │
      │                                ├───────────────────────────────>│
      │                                │                                │
      │                                │  (4) Transfer executed         │
      │                                │      (~500ms finality)         │
      │                                │<───────────────────────────────┤
      │                                │                                │
      │  (5) 200 OK                    │                                │
      │      Payment-Receipt: <txHash> │                                │
      │<───────────────────────────────┤                                │
      │                                │                                │
```

1. Client submits credential containing signed `transfer` transaction
2. If `feePayer: true`, server adds fee sponsorship (signs with `0x78` domain)
3. Server broadcasts transaction to Tempo
4. Transaction included in block with immediate finality (~500ms)
5. Server returns receipt with transaction hash

### 9.3. Subscription Settlement (Key Authorization)

For `intent="subscription"` fulfilled via key authorization, the client
signs an authorization granting the server permission to charge periodically:

```
   Client                        Server                     Tempo Network
      │                             │                             │
      │  (1) Authorization:         │                             │
      │      Payment <credential>   │                             │
      │      (signed keyAuth)       │                             │
      ├────────────────────────────>│                             │
      │                             │                             │
      │                             │  (2) Construct tx with:     │
      │                             │      - keyAuthorization     │
      │                             │      - transfer(amt) call   │
      │                             │                             │
      │                             │  (3) eth_sendRawTxSync      │
      │                             ├────────────────────────────>│
      │                             │                             │
      │                             │  (4) Key registered +       │
      │                             │      transfer executed      │
      │                             │<────────────────────────────┤
      │                             │                             │
      │  (5) 200 OK                 │                             │
      │      Payment-Receipt:       │                             │
      │      <txHash>               │                             │
      │<────────────────────────────┤                             │
      │                             │                             │
      │         ... 30 days pass ...                              │
      │                             │                             │
      │                             │  (6) Construct tx with:     │
      │                             │      - transfer(amt) call   │
      │                             │      (key already registered)│
      │                             │                             │
      │                             │  (7) eth_sendRawTxSync      │
      │                             ├────────────────────────────>│
      │                             │                             │
      │                             │  (8) Transfer executed      │
      │                             │<────────────────────────────┤
      │                             │                             │
      │         ... repeat each period until expiry ...           │
      │                             │                             │
```

1. Client submits credential containing signed key authorization
2. Server constructs transaction with `keyAuthorization` and first `transfer`
3. Transaction registers the key and executes the first charge
4. Server returns receipt (subscription is now active)
5. When each period elapses, server charges using the registered key
6. Process repeats each period until authorization expires

### 9.4. Authorize Settlement (Transaction)

For `intent="authorize"` fulfilled via transaction, the client signs an
`approve` transaction granting the server a spending allowance. If
`feePayer: true`, the server adds its fee payer signature before broadcasting:

```
   Client                           Server                        Tempo Network
      │                                │                                │
      │  (1) Authorization:            │                                │
      │      Payment <credential>      │                                │
      ├───────────────────────────────>│                                │
      │                                │                                │
      │                                │  (2) If feePayer: true,        │
      │                                │      add fee payment signature │
      │                                │                                │
      │                                │  (3) eth_sendRawTxSync         │
      │                                ├───────────────────────────────>│
      │                                │                                │
      │                                │  (4) Approval granted          │
      │                                │<───────────────────────────────┤
      │                                │                                │
      │  (5) 200 OK                    │                                │
      │      Payment-Receipt: <txHash> │                                │
      │<───────────────────────────────┤                                │
      │                                │                                │
      │         ... later, when service is consumed ...                 │
      │                                │                                │
      │                                │  (6) transferFrom(client,      │
      │                                │      server, amount)           │
      │                                ├───────────────────────────────>│
      │                                │                                │
      │                                │  (7) Transfer executed         │
      │                                │<───────────────────────────────┤
      │                                │                                │
```

1. Client submits credential containing signed `approve` transaction
2. If `feePayer: true`, server adds fee sponsorship (signs with `0x78` domain)
3. Server broadcasts transaction; approval registered on-chain
4. Server returns receipt (approval is now active)
5. Later, when the server needs to charge, it calls `transferFrom`
6. Charges can occur up to the approved limit before expiry

### 9.5. Authorize Settlement (Key Authorization)

For `intent="authorize"` fulfilled via key authorization, the client signs
an authorization granting the server permission to charge up to a limit:

```
   Client                        Server                     Tempo Network
      │                             │                             │
      │  (1) Authorization:         │                             │
      │      Payment <credential>   │                             │
      │      (signed keyAuth)       │                             │
      ├────────────────────────────>│                             │
      │                             │                             │
      │                             │  (2) Store keyAuth          │
      │                             │                             │
      │  (3) 200 OK                 │                             │
      │      (approval active)      │                             │
      │<────────────────────────────┤                             │
      │                             │                             │
      │         ... later, when service is consumed ...           │
      │                             │                             │
      │                             │  (4) Construct tx with:     │
      │                             │      - keyAuthorization     │
      │                             │      - transfer(amt) call   │
      │                             │                             │
      │                             │  (5) eth_sendRawTxSync      │
      │                             ├────────────────────────────>│
      │                             │                             │
      │                             │  (6) Key registered +       │
      │                             │      transfer executed      │
      │                             │<────────────────────────────┤
      │                             │                             │
```

1. Client submits credential containing signed key authorization
2. Server stores the authorization for future use
3. Server grants access (approval is now active)
4. Later, when the server needs to charge, it constructs a transaction
   with the `keyAuthorization` and `transfer` call
5. Charges can occur up to the authorized limit before expiry

### 9.6. Receipt Generation

Upon successful settlement, servers MUST return a `Payment-Receipt` header
per Section 5.3 of [I-D.ietf-httpauth-payment].

The receipt payload for Tempo:

| Field | Type | Description |
|-------|------|-------------|
| `method` | string | `"tempo"` |
| `reference` | string | Transaction hash of the settlement transaction |
| `status` | string | `"success"` or `"failed"` |
| `timestamp` | string | ISO 8601 settlement time |

**Example receipt payload:**

```json
{
  "method": "tempo",
  "reference": "0x1234567890abcdef...",
  "status": "success",
  "timestamp": "2026-01-06T12:00:00Z"
}
```

---

## 10. Internationalization Considerations

### 10.1. Address Encoding

All Ethereum addresses in request and payload structures MUST be encoded
as hexadecimal strings with `0x` prefix. Addresses are case-insensitive
per [EIP-55], but implementations SHOULD use checksummed addresses for
display purposes.

---

## 11. Security Considerations

### 11.1. Transaction Replay

Tempo Transactions include chain ID, nonce, and optional `validBefore`/
`validAfter` timestamps that prevent replay attacks:

- Chain ID binding prevents cross-chain replay
- Nonce consumption prevents same-chain replay
- Validity windows limit temporal replay windows

### 11.2. Access Key Security

Access keys present additional security considerations:

**Short Expiry for Charges**: Access keys used for `charge` intent MUST
have expiry within 5 minutes to minimize exposure window. Servers MUST
reject access keys with longer expiry for charge intents.

**Destination Scoping**: For `authorize` and `subscription` intents, clients
SHOULD include destination restrictions to limit the addresses the key
can transfer to. This prevents key compromise from enabling transfers to
attacker-controlled addresses.

**Spending Limits**: Access key spending limits are enforced by the
AccountKeychain precompile on-chain. Servers cannot exceed the authorized
limits even if compromised.

**Key Revocation**: Users can revoke access keys at any time via the
AccountKeychain precompile. Servers SHOULD handle revocation gracefully
by requesting new authorization.

### 11.3. Amount Verification

Clients MUST parse and verify the `request` payload before signing:

1. Verify `amount` is reasonable for the service
2. Verify `token` is the expected token address
3. Verify `recipient` is controlled by the expected party
4. For `authorize`: verify `expiry` is not unreasonably far in the future
5. For `subscription`: verify `period` and `amount` match expectations

### 11.4. Source Verification

If a credential includes the optional `source` field (a DID identifying the
payer), servers MUST NOT trust this value without verification. The `source`
field is client-provided metadata and could be forged.

Servers MUST verify the payer identity by:

- For `type="transaction"`: Recovering the signer address from the
  transaction signature using standard ECDSA recovery
- For `type="keyAuthorization"`: Deriving the address from the `publicKey`
  field in the key authorization

If `source` is present, servers SHOULD verify that the recovered address
matches the address in the DID (e.g., for `did:pkh:eip155:42431:0xABC...`,
verify the recovered address equals `0xABC...`). Servers MUST reject
credentials where the `source` does not match the recovered signer.

### 11.5. Server-Paid Fees

Servers acting as fee payers accept financial risk in exchange for
providing a seamless payment experience.

**Denial of Service**: Malicious clients could submit valid-looking
credentials that fail on-chain, causing the server to pay fees without
receiving payment. Servers SHOULD implement rate limiting and MAY require
client authentication before accepting payment credentials.

**Fee Token Exhaustion**: Servers MUST monitor their fee token balance
and reject new payment requests when balance is insufficient. Servers
SHOULD alert operators when fee token balance falls below a threshold.

---

## 12. IANA Considerations

### 12.1. Payment Method Registration

This document registers the following payment method in the "HTTP Payment
Methods" registry established by [I-D.ietf-httpauth-payment]:

- **Method Identifier**: `tempo`
- **Description**: Tempo Network TIP-20 token payments
- **Reference**: This document
- **Contact**: jake@tempo.xyz

### 12.2. Payment Intent Registrations

This document registers the following payment intents in the "HTTP Payment
Intents" registry established by [I-D.ietf-httpauth-payment]:

| Intent | Applicable Methods | Description | Reference |
|--------|-------------------|-------------|-----------|
| `charge` | `tempo` | One-time TIP-20 transfer | This document, Section 5.1 |
| `authorize` | `tempo` | Payment authorization | This document, Section 5.2 |
| `subscription` | `tempo` | Recurring payment authorization | This document, Section 5.3 |

Note: `charge` is already registered as a base intent by
[I-D.ietf-httpauth-payment]. This document extends its definition for
the `tempo` method.

---

## 13. References

### 13.1. Normative References

**[I-D.ietf-httpauth-payment]**
: Moxey, J., "The 'Payment' HTTP Authentication Scheme",
  draft-ietf-httpauth-payment-01, January 2026.

**[RFC2119]**
: Bradner, S., "Key words for use in RFCs to Indicate Requirement
  Levels", BCP 14, RFC 2119, DOI 10.17487/RFC2119, March 1997.

**[RFC4648]**
: Josefsson, S., "The Base16, Base32, and Base64 Data Encodings",
  RFC 4648, DOI 10.17487/RFC4648, October 2006.

**[RFC8174]**
: Leiba, B., "Ambiguity of Uppercase vs Lowercase in RFC 2119 Key
  Words", BCP 14, RFC 8174, DOI 10.17487/RFC8174, May 2017.

**[RFC8259]**
: Bray, T., Ed., "The JavaScript Object Notation (JSON) Data
  Interchange Format", STD 90, RFC 8259, DOI 10.17487/RFC8259,
  December 2017.

### 13.2. Informative References

**[EIP-2718]**
: Zoltu, M., "Typed Transaction Envelope", EIP-2718, October 2020.

**[EIP-55]**
: Buterin, V. "Mixed-case checksum address encoding",
  EIP-55, January 2016.

**[TEMPO-TX-SPEC]**
: Tempo Labs, "Tempo Transaction Specification",
  https://docs.tempo.xyz/protocol/transactions/spec-tempo-transaction.

---

## Appendix A: ABNF Collected

This appendix collects the ABNF grammar for Tempo payment method
structures.

```abnf
; Request JSON structures (intent-specific)

; Charge request
charge-request = "{" charge-members "}"
charge-members = charge-amount "," charge-asset "," charge-destination ","
                 charge-expires
charge-amount = %s"amount" ":" number-string
charge-asset = %s"asset" ":" eth-address
charge-destination = %s"destination" ":" eth-address
charge-expires = %s"expires" ":" number-string

; Authorize request
authorize-request = "{" authorize-members "}"
authorize-members = authorize-asset "," [ authorize-destination "," ]
authorize-expires "," authorize-limit [ "," authorize-valid-from ]
authorize-asset = %s"asset" ":" eth-address
authorize-destination = %s"destination" ":" eth-address
authorize-expires = %s"expires" ":" number-string
authorize-limit = %s"limit" ":" number-string
authorize-valid-from = %s"validFrom" ":" number-string

; Subscription request
subscription-request = "{" subscription-members "}"
subscription-members = sub-amount "," sub-asset "," sub-expires ","
                       sub-period [ "," sub-valid-from ]
sub-amount = %s"amount" ":" number-string
sub-asset = %s"asset" ":" eth-address
sub-expires = %s"expires" ":" number-string
sub-period = %s"period" ":" number-string
sub-valid-from = %s"validFrom" ":" number-string

; Credential JSON structure
credential = "{" credential-members "}"
credential-members = credential-id "," credential-payload [ "," credential-source ]

credential-id = %s"id" ":" quoted-string
credential-payload = %s"payload" ":" payload-object
credential-source = %s"source" ":" quoted-string

; Payload object structure
payload-object = "{" payload-members "}"
payload-members = payload-signature "," payload-type
payload-signature = %s"signature" ":" hex-string
payload-type = %s"type" ":" ( %s"\"transaction\"" / %s"\"keyAuthorization\"" )

; Primitives
eth-address = DQUOTE "0x" 40HEXDIG DQUOTE
hex-string = DQUOTE "0x" *HEXDIG DQUOTE
number-string = DQUOTE 1*DIGIT DQUOTE
quoted-string = DQUOTE *VCHAR DQUOTE
```

---

## Appendix B: Examples

The examples in this appendix use alphaUSD (`0x20c0000000000000000000000000000000000001`)
as an illustrative TIP-20 asset. This is not a real token address.

### B.1. Charge

```
   Client                        Server                     Tempo Network
      │                             │                             │
      │  (1) GET /api/resource      │                             │
      ├────────────────────────────>│                             │
      │                             │                             │
      │  (2) 402 Payment Required   │                             │
      │      intent="charge"        │                             │
      │<────────────────────────────┤                             │
      │                             │                             │
      │  (3) Sign transfer tx       │                             │
      │                             │                             │
      │  (4) Authorization: Payment │                             │
      ├────────────────────────────>│                             │
      │                             │  (5) Broadcast tx           │
      │                             ├────────────────────────────>│
      │                             │  (6) Transfer complete      │
      │                             │<────────────────────────────┤
      │  (7) 200 OK + Receipt       │                             │
      │<────────────────────────────┤                             │
      │                             │                             │
```

**Challenge:**

```http
HTTP/1.1 402 Payment Required
WWW-Authenticate: Payment id="kM9xPqWvT2nJrHsY4aDfEb",
  realm="api.example.com",
  method="tempo",
  intent="charge",
  request="eyJhbW91bnQiOiIxMDAwMDAwIiwiYXNzZXQiOiIweDIwYzAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAiLCJkZXN0aW5hdGlvbiI6IjB4NzQyZDM1Q2M2NjM0QzA1MzI5MjVhM2I4NDRCYzllNzU5NWY4ZkUwMCIsImV4cGlyZXMiOiIyMDI1LTAxLTA2VDEyOjAwOjAwWiJ9"
```

The `request` decodes to:

```json
{
  "amount": "1000000",
  "asset": "0x20c0000000000000000000000000000000000001",
  "destination": "0x742d35Cc6634C0532925a3b844Bc9e7595f8fE00",
  "expires": "2025-01-06T12:00:00Z"
}
```

This requests a transfer of 1.00 alphaUSD (1000000 base units).

**Credential (via Transaction):**

```http
GET /api/resource HTTP/1.1
Host: api.example.com
Authorization: Payment eyJpZCI6ImtNOXhQcVd2VDJuSnJIc1k0YURmRWIiLCJ0eXBlIjoidHJhbnNhY3Rpb24iLCJwYXlsb2FkIjoiMHg3NmY5MDEuLi4ifQ
```

The credential decodes to:

```json
{
  "id": "kM9xPqWvT2nJrHsY4aDfEb",
  "payload": {
    "signature": "0x76f901...signed transaction bytes...",
    "type": "transaction"
  },
  "source": "did:pkh:eip155:42431:0x1234567890abcdef1234567890abcdef12345678"
}
```

The client constructs a Tempo Transaction calling `transfer(destination, amount)`
on the asset, fills in `nonce`, `nonceKey`, and `signature`, then RLP-serializes.

**Response with receipt:**

```http
HTTP/1.1 200 OK
Payment-Receipt: eyJtZXRob2QiOiJ0ZW1wbyIsInR4SGFzaCI6IjB4MTIzNDU2Nzg5MGFiY2RlZi4uLiIsImJsb2NrTnVtYmVyIjoxMjM0NTY3OCwiYW1vdW50IjoiMTAwMDAwMCJ9
Content-Type: application/json

{ "data": "..." }
```

### B.2. Authorize

```
   Client                        Server                     Tempo Network
      │                             │                             │
      │  (1) GET /api/resource      │                             │
      ├────────────────────────────>│                             │
      │                             │                             │
      │  (2) 402 Payment Required   │                             │
      │      intent="authorize"       │                             │
      │<────────────────────────────┤                             │
      │                             │                             │
      │  (3) Sign keyAuthorization  │                             │
      │                             │                             │
      │  (4) Authorization: Payment │                             │
      ├────────────────────────────>│                             │
      │                             │  (5) Store keyAuth          │
      │  (6) 200 OK (approved)      │                             │
      │<────────────────────────────┤                             │
      │                             │                             │
      │         ... later ...       │                             │
      │                             │  (7) Charge with keyAuth    │
      │                             ├────────────────────────────>│
      │                             │  (8) Transfer complete      │
      │                             │<────────────────────────────┤
      │                             │                             │
```

**Challenge:**

```http
HTTP/1.1 402 Payment Required
WWW-Authenticate: Payment id="nR5tYuLpS8mWvXzQ1eCgHj",
  realm="api.example.com",
  method="tempo",
  intent="authorize",
  request="eyJhc3NldCI6IjB4MjBjMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMCIsImV4cGlyZXMiOiIyMDI1LTAyLTA1VDEyOjAwOjAwWiIsImxpbWl0IjoiNTAwMDAwMDAifQ"
```

The `request` decodes to:

```json
{
  "asset": "0x20c0000000000000000000000000000000000001",
  "expires": "2025-02-05T12:00:00Z",
  "limit": "50000000"
}
```

This requests approval for up to 50.00 alphaUSD (50000000 base units).

**Credential (via Key Authorization):**

```json
{
  "id": "nR5tYuLpS8mWvXzQ1eCgHj",
  "payload": {
    "signature": "0xf8b2...signed authorization bytes...",
    "type": "keyAuthorization"
  },
  "source": "did:pkh:eip155:42431:0x1234567890abcdef1234567890abcdef12345678"
}
```

**Credential (via Transaction):**

Alternatively, when the request includes a `destination` field, the client
may fulfill the approval using a Tempo Transaction with an `approve` call:

```json
{
  "id": "nR5tYuLpS8mWvXzQ1eCgHj",
  "payload": {
    "signature": "0x76f901...signed transaction bytes...",
    "type": "transaction"
  },
  "source": "did:pkh:eip155:42431:0x1234567890abcdef1234567890abcdef12345678"
}
```

The transaction contains `approve(destination, limit)` on the TIP-20 asset.
The server broadcasts this transaction to register the allowance on-chain,
then later calls `transferFrom` to collect payment.

### B.3. Subscription

```
   Client                        Server                     Tempo Network
      │                             │                             │
      │  (1) GET /api/resource      │                             │
      ├────────────────────────────>│                             │
      │                             │                             │
      │  (2) 402 Payment Required   │                             │
      │      intent="subscription"  │                             │
      │<────────────────────────────┤                             │
      │                             │                             │
      │  (3) Sign keyAuthorization  │                             │
      │      (periodic limits)      │                             │
      │                             │                             │
      │  (4) Authorization: Payment │                             │
      ├────────────────────────────>│                             │
      │                             │  (5) Register + charge      │
      │                             ├────────────────────────────>│
      │                             │  (6) First period paid      │
      │                             │<────────────────────────────┤
      │  (7) 200 OK + Receipt       │                             │
      │<────────────────────────────┤                             │
      │                             │                             │
      │         ... 30 days ...     │                             │
      │                             │  (8) Charge next period     │
      │                             ├────────────────────────────>│
      │                             │  (9) Transfer complete      │
      │                             │<────────────────────────────┤
      │                             │                             │
```

**Challenge:**

```http
HTTP/1.1 402 Payment Required
WWW-Authenticate: Payment id="qT8wErYuI3oPlKjH6gFdSa",
  realm="api.example.com",
  method="tempo",
  intent="subscription",
  request="eyJhbW91bnQiOiIxMDAwMDAwMCIsImFzc2V0IjoiMHgyMGMwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwIiwiZXhwaXJlcyI6IjIwMjYtMDEtMDZUMDA6MDA6MDBaIiwicGVyaW9kIjoiMjU5MjAwMCJ9"
```

The `request` decodes to:

```json
{
  "amount": "10000000",
  "asset": "0x20c0000000000000000000000000000000000001",
  "expires": "2026-01-06T00:00:00Z",
  "period": "2592000"
}
```

This requests a subscription for 10.00 alphaUSD (10000000 base units) per
30 days (2592000 seconds).

**Credential:**

```json
{
  "id": "qT8wErYuI3oPlKjH6gFdSa",
  "payload": {
    "signature": "0xf8c1...signed authorization bytes...",
    "type": "keyAuthorization"
  }
}
```

Note: Periodic limit enforcement for subscriptions is configured when
registering the key with the AccountKeychain precompile.

---

## Acknowledgements

The authors thank the Tempo community for their feedback on this
specification.

---

## Authors' Addresses

Jake Moxey
Tempo Labs
Email: jake@tempo.xyz
