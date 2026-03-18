---
title: Tempo charge Intent for HTTP Payment Authentication
abbrev: Tempo Charge
docname: draft-tempo-charge-00
version: 00
category: info
ipr: noModificationTrust200902
submissiontype: IETF
consensus: true

author:
  - name: Jake Moxey
    ins: J. Moxey
    email: jake@tempo.xyz
    organization: Tempo Labs
  - name: Brendan Ryan
    ins: B. Ryan
    email: brendan@tempo.xyz
    organization: Tempo Labs
  - name: Tom Meagher
    ins: T. Meagher
    email: tom@tempo.xyz
    organization: Tempo Labs

normative:
  RFC2119:
  RFC3339:
  RFC4648:
  RFC8174:
  RFC8259:
  RFC8785:
  I-D.httpauth-payment:
    title: "The 'Payment' HTTP Authentication Scheme"
    target: https://datatracker.ietf.org/doc/draft-ietf-httpauth-payment/
    author:
      - name: Jake Moxey
    date: 2026-01

informative:
  EIP-2718:
    title: "Typed Transaction Envelope"
    target: https://eips.ethereum.org/EIPS/eip-2718
    author:
      - name: Micah Zoltu
    date: 2020-10
  EIP-55:
    title: "Mixed-case checksum address encoding"
    target: https://eips.ethereum.org/EIPS/eip-55
    author:
      - name: Vitalik Buterin
    date: 2016-01
  TEMPO-TX-SPEC:
    title: "Tempo Transaction Specification"
    target: https://docs.tempo.xyz/protocol/transactions/spec-tempo-transaction
    author:
      - org: Tempo Labs
---

--- abstract

This document defines the "charge" intent for the "tempo" payment method
in the Payment HTTP Authentication Scheme {{I-D.httpauth-payment}}. It
specifies how clients and servers exchange one-time TIP-20 token transfers
on the Tempo blockchain.

--- middle

# Introduction

The `charge` intent represents a one-time payment of a specified amount.
The server may submit the signed transaction any time before the
challenge `expires` auth-param timestamp.

This specification defines the request schema, credential formats, and
settlement procedures for charge transactions on Tempo.

## Charge Flow

The following diagram illustrates the Tempo charge flow:

~~~
   Client                        Server                     Tempo Network
      |                             |                             |
      |  (1) GET /api/resource      |                             |
      |-------------------------->  |                             |
      |                             |                             |
      |  (2) 402 Payment Required   |                             |
      |      intent="charge"        |                             |
      |<--------------------------  |                             |
      |                             |                             |
      |  (3) Sign transfer tx       |                             |
      |                             |                             |
      |  (4) Authorization: Payment |                             |
      |-------------------------->  |                             |
      |                             |  (5) Broadcast tx           |
      |                             |-------------------------->  |
      |                             |  (6) Transfer complete      |
      |                             |<--------------------------  |
      |  (7) 200 OK + Receipt       |                             |
      |<--------------------------  |                             |
      |                             |                             |
~~~

# Requirements Language

{::boilerplate bcp14-tagged}

# Terminology

TIP-20
: Tempo's enshrined token standard, implemented as precompiles rather
  than smart contracts. TIP-20 tokens use 6 decimal places and provide
  `transfer`, `transferWithMemo`, `transferFrom`, and `approve` operations.

Tempo Transaction
: An EIP-2718 transaction with type prefix `0x76`, supporting batched
  calls, multiple signature types (secp256k1, P256, WebAuthn), 2D nonces,
  and validity windows.

2D Nonce
: Tempo's nonce system where each account has multiple independent nonce
  lanes (`nonce_key`), enabling parallel transaction submission.

Fee Payer
: An account that pays transaction fees on behalf of another account.
  Tempo Transactions support fee payment via a separate signature
  domain (`0x78`), allowing the server to pay for fees while the client
  only signs the payment authorization.

# Request Schema

The `request` parameter in the `WWW-Authenticate` challenge contains a
base64url-encoded JSON object. The JSON MUST be serialized using JSON
Canonicalization Scheme (JCS) {{RFC8785}} before base64url encoding,
per {{I-D.httpauth-payment}}.

## Shared Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `amount` | string | REQUIRED | Amount in base units (stringified number) |
| `currency` | string | REQUIRED | TIP-20 token address (e.g., `"0x20c0..."`) |
| `recipient` | string | REQUIRED | Recipient address |
| `description` | string | OPTIONAL | Human-readable payment description |
| `externalId` | string | OPTIONAL | Merchant's reference (order ID, invoice number, etc.) |

Challenge expiry is conveyed by the `expires` auth-param in
`WWW-Authenticate` per {{I-D.httpauth-payment}}.

## Method Details

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `methodDetails.chainId` | number | OPTIONAL | Tempo chain ID (default: 42431) |
| `methodDetails.feePayer` | boolean | OPTIONAL | If `true`, server pays transaction fees (default: `false`) |
| `methodDetails.memo` | string | OPTIONAL | A `bytes32` hex value. When present, the client MUST use `transferWithMemo` instead of `transfer`. |

**Example:**

~~~json
{
  "amount": "1000000",
  "currency": "0x20c0000000000000000000000000000000000000",
  "recipient": "0x742d35Cc6634C0532925a3b844Bc9e7595f8fE00",
  "methodDetails": {
    "chainId": 42431,
    "feePayer": true
  }
}
~~~

The client fulfills this by signing a Tempo Transaction with
`transfer(recipient, amount)` or `transferWithMemo(recipient, amount, memo)`
on the specified `currency` (token address),
with `validBefore` set to the challenge `expires` auth-param. The client SHOULD use a dedicated
`nonceKey` (2D nonce lane) for payment transactions to avoid blocking
other account activity if the transaction is not immediately settled.

If `methodDetails.feePayer` is `true`, the client signs with
`fee_payer_signature` set to `0x00` and `fee_token` empty, allowing the
server to sponsor fees. If `feePayer` is `false` or omitted, the client
MUST set `fee_token` and pay fees themselves.

# Credential Schema

The credential in the `Authorization` header contains a base64url-encoded
JSON object per {{I-D.httpauth-payment}}.

## Credential Structure

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `challenge` | object | REQUIRED | Echo of the challenge from the server |
| `payload` | object | REQUIRED | Tempo-specific payload object |
| `source` | string | OPTIONAL | Payer identifier as a DID (e.g., `did:pkh:eip155:42431:0x...`) |

The `source` field, if present, SHOULD use the `did:pkh` method with the
chain ID applicable to the challenge and the payer's Ethereum address.

## Transaction Payload (type="transaction")

When `type` is `"transaction"`, `signature` contains the complete signed
Tempo Transaction (type 0x76) serialized as RLP and hex-encoded with
`0x` prefix. The transaction MUST contain a `transfer(recipient, amount)`
or `transferWithMemo(recipient, amount, memo)` call on the TIP-20 token.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `signature` | string | REQUIRED | Hex-encoded RLP-serialized signed transaction |
| `type` | string | REQUIRED | `"transaction"` |

**Example:**

~~~json
{
  "challenge": {
    "id": "kM9xPqWvT2nJrHsY4aDfEb",
    "realm": "api.example.com",
    "method": "tempo",
    "intent": "charge",
    "request": "eyJ...",
    "expires": "2025-02-05T12:05:00Z"
  },
  "payload": {
    "signature": "0x76f901...signed transaction bytes...",
    "type": "transaction"
  },
  "source": "did:pkh:eip155:42431:0x1234567890abcdef1234567890abcdef12345678"
}
~~~

## Hash Payload (type="hash")

When `type` is `"hash"`, the client has already broadcast the transaction
to the Tempo network. The `hash` field contains the transaction hash for
the server to verify onchain.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `hash` | string | REQUIRED | Transaction hash with `0x` prefix |
| `type` | string | REQUIRED | `"hash"` |

**Example:**

~~~json
{
  "challenge": {
    "id": "kM9xPqWvT2nJrHsY4aDfEb",
    "realm": "api.example.com",
    "method": "tempo",
    "intent": "charge",
    "request": "eyJ...",
    "expires": "2025-02-05T12:05:00Z"
  },
  "payload": {
    "hash": "0x1a2b3c4d5e6f7890abcdef1234567890abcdef1234567890abcdef1234567890",
    "type": "hash"
  },
  "source": "did:pkh:eip155:42431:0x1234567890abcdef1234567890abcdef12345678"
}
~~~

# Fee Payment

When a request includes `feePayer: true`, the server commits to paying
transaction fees on behalf of the client.

## Server-Paid Fees

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

## Client-Paid Fees

When `feePayer: false` or omitted, the client MUST set `fee_token` to a
valid USD TIP-20 token address and pay fees themselves. The server
broadcasts the transaction as-is without adding a fee payer signature.

## Server Requirements

When acting as fee payer, servers:

- MUST maintain sufficient balance of a USD TIP-20 token to pay
  transaction fees
- MAY use any USD-denominated TIP-20 token with sufficient AMM
  liquidity as the fee token
- MAY recover fee costs through pricing or other business logic

## Client Requirements

- When `feePayer: true`: Clients MUST sign with `fee_payer_signature` set
  to `0x00` and `fee_token` empty or `0x80` (RLP null)
- When `feePayer: false` or omitted: Clients MUST set `fee_token` to a
  valid USD TIP-20 token and have sufficient balance to pay fees

# Settlement Procedure

For `intent="charge"` fulfilled via transaction, the client signs a
transaction containing a `transfer` or `transferWithMemo` call. If `feePayer: true`, the server
adds its fee payer signature before broadcasting:

~~~
   Client                           Server                        Tempo Network
      |                                |                                |
      |  (1) Authorization:            |                                |
      |      Payment <credential>      |                                |
      |------------------------------->|                                |
      |                                |                                |
      |                                |  (2) If feePayer: true,        |
      |                                |      add fee payment signature |
      |                                |                                |
      |                                |  (3) eth_sendRawTxSync         |
      |                                |------------------------------->|
      |                                |                                |
      |                                |  (4) Transfer executed         |
      |                                |      (~500ms finality)         |
      |                                |<-------------------------------|
      |                                |                                |
      |  (5) 200 OK                    |                                |
      |      Payment-Receipt: <base64url-receipt> |                    |
      |<-------------------------------|                                |
      |                                |                                |
~~~

1. Client submits credential containing signed `transfer` or `transferWithMemo` transaction
2. If `feePayer: true`, server adds fee sponsorship (signs with `0x78` domain)
3. Server broadcasts transaction to Tempo
4. Transaction included in block with immediate finality (~500ms)
5. Server returns a receipt whose `reference` field is the transaction digest

## Hash Settlement

For credentials with `type="hash"`, the client has already broadcast
the transaction. The server verifies the transaction onchain:

~~~
   Client                        Server                     Tempo Network
      |                             |                             |
      |  (1) Broadcast tx           |                             |
      |------------------------------------------------------>    |
      |                             |                             |
      |  (2) Transaction confirmed  |                             |
      |<------------------------------------------------------    |
      |                             |                             |
      |  (3) Authorization:         |                             |
      |      Payment <credential>   |                             |
      |      (with txHash)          |                             |
      |-------------------------->  |                             |
      |                             |                             |
      |                             |  (4) eth_getTransactionReceipt
      |                             |-------------------------->  |
      |                             |                             |
      |                             |  (5) Receipt returned       |
      |                             |<--------------------------  |
      |                             |                             |
      |                             |  (6) Verify receipt         |
      |                             |                             |
      |  (7) 200 OK                 |                             |
      |      Payment-Receipt:       |                             |
      |      <base64url-receipt>    |                             |
      |<--------------------------  |                             |
      |                             |                             |
~~~

**Limitations:**

- Cannot be used with `feePayer: true` (client must pay their own fees)
- Server cannot modify or enhance the transaction

## Transaction Verification {#transaction-verification}

Before broadcasting a transaction credential, servers MUST verify:

1. Deserialize the RLP-encoded transaction from `payload.signature`
2. Verify the transaction contains a `transfer(recipient, amount)` or
   `transferWithMemo(recipient, amount, memo)` call matching the challenge request
3. Verify the call target matches the `currency` token address
4. Verify the `amount` matches the challenge request amount
5. Verify the `recipient` matches the challenge request recipient
6. If `methodDetails.memo` is present, verify the transaction uses
   `transferWithMemo` with the matching memo value
For hash credentials, servers MUST fetch the transaction receipt and
verify the emitted `Transfer` or `TransferWithMemo` event logs match
the challenge parameters.

## Receipt Generation

Upon successful settlement, servers MUST return a `Payment-Receipt` header
per {{I-D.httpauth-payment}}. Servers MUST NOT include a
`Payment-Receipt` header on error responses; failures are communicated via
HTTP status codes and Problem Details.

The receipt payload for Tempo charge:

| Field | Type | Description |
|-------|------|-------------|
| `method` | string | `"tempo"` |
| `reference` | string | Transaction hash of the settlement transaction |
| `status` | string | `"success"` |
| `timestamp` | string | {{RFC3339}} settlement time |
| `externalId` | string | OPTIONAL. Echoed from the challenge request |

# Security Considerations

## Transaction Replay

Tempo Transactions include chain ID, nonce, and optional `validBefore`/
`validAfter` timestamps that prevent replay attacks:

- Chain ID binding prevents cross-chain replay
- Nonce consumption prevents same-chain replay
- Validity windows limit temporal replay windows

## Amount Verification

Clients MUST parse and verify the `request` payload before signing:

1. Verify `amount` is reasonable for the service
2. Verify `currency` is the expected token address
3. Verify `recipient` is controlled by the expected party

## Server-Paid Fees

Servers acting as fee payers accept financial risk in exchange for
providing a seamless payment experience.

**Denial of Service**: Malicious clients could submit valid-looking
credentials that fail onchain, causing the server to pay fees without
receiving payment. Servers SHOULD implement rate limiting and MAY require
client authentication before accepting payment credentials.

**Fee Token Exhaustion**: Servers MUST monitor their fee token balance
and reject new payment requests when balance is insufficient.

# IANA Considerations

## Payment Method Registration

This document registers the following payment method in the "HTTP Payment
Methods" registry established by {{I-D.httpauth-payment}}:

| Method Identifier | Description | Reference |
|-------------------|-------------|-----------|
| `tempo` | Tempo blockchain TIP-20 token transfer | This document |

Contact: Tempo Labs (<contact@tempo.xyz>)

## Payment Intent Registration

This document registers the following payment intent in the "HTTP Payment
Intents" registry established by {{I-D.httpauth-payment}}:

| Intent | Applicable Methods | Description | Reference |
|--------|-------------------|-------------|-----------|
| `charge` | `tempo` | One-time TIP-20 transfer | This document |

--- back

# ABNF Collected

~~~ abnf
tempo-charge-challenge = "Payment" 1*SP
  "id=" quoted-string ","
  "realm=" quoted-string ","
  "method=" DQUOTE "tempo" DQUOTE ","
  "intent=" DQUOTE "charge" DQUOTE ","
  "request=" base64url-nopad

tempo-charge-credential = "Payment" 1*SP base64url-nopad

; Base64url encoding without padding per RFC 4648 Section 5
base64url-nopad = 1*( ALPHA / DIGIT / "-" / "_" )
~~~

# Example

**Challenge:**

~~~http
HTTP/1.1 402 Payment Required
WWW-Authenticate: Payment id="kM9xPqWvT2nJrHsY4aDfEb",
  realm="api.example.com",
  method="tempo",
  intent="charge",
  request="eyJhbW91bnQiOiIxMDAwMDAwIiwiY3VycmVuY3kiOiIweDIwYzAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAiLCJyZWNpcGllbnQiOiIweDc0MmQzNUNjNjYzNEMwNTMyOTI1YTNiODQ0QmM5ZTc1OTVmOGZFMDAiLCJtZXRob2REZXRhaWxzIjp7ImNoYWluSWQiOjQyNDMxfX0",
  expires="2025-01-06T12:00:00Z"
Cache-Control: no-store
~~~

The `request` decodes to:

~~~json
{
  "amount": "1000000",
  "currency": "0x20c0000000000000000000000000000000000000",
  "recipient": "0x742d35Cc6634C0532925a3b844Bc9e7595f8fE00",
  "methodDetails": {
    "chainId": 42431
  }
}
~~~

This requests a transfer of 1.00 pathUSD (1000000 base units).

**Credential:**

~~~http
GET /api/resource HTTP/1.1
Host: api.example.com
Authorization: Payment eyJjaGFsbGVuZ2UiOnsiaWQiOiJrTTl4UHFXdlQybkpySHNZNGFEZkViIn0sInBheWxvYWQiOnsic2lnbmF0dXJlIjoiMHg3NmY5MDEuLi4iLCJ0eXBlIjoidHJhbnNhY3Rpb24ifSwic291cmNlIjoiZGlkOnBraDplaXAxNTU6NDI0MzE6MHgxMjM0NTY3ODkwYWJjZGVmMTIzNDU2Nzg5MGFiY2RlZjEyMzQ1Njc4In0
~~~

# Acknowledgements

The authors thank the Tempo community for their feedback on this
specification.
