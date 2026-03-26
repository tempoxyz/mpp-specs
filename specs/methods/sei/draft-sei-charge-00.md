---
title: Sei Charge Intent for HTTP Payment Authentication
abbrev: Sei Charge
docname: draft-sei-charge-00
version: 00
category: info
ipr: trust200902
submissiontype: independent
consensus: false

author:
  - name: Kartik Bhat
    ins: K. Bhat
    email: kartik@sei.io
    org: Sei Labs

normative:
  RFC2119:
  RFC3339:
  RFC4648:
  RFC8174:
  RFC8259:
  RFC8785:
  I-D.payment-intent-charge:
    title: "'charge' Intent for HTTP Payment Authentication"
    target: https://datatracker.ietf.org/doc/draft-payment-intent-charge/
    author:
      - name: Jake Moxey
      - name: Brendan Ryan
      - name: Tom Meagher
    date: 2026
  I-D.httpauth-payment:
    title: "The 'Payment' HTTP Authentication Scheme"
    target: https://datatracker.ietf.org/doc/draft-ietf-httpauth-payment/
    author:
      - name: Jake Moxey
    date: 2026-01

informative:
  EIP-1559:
    title: "Fee market change for ETH 1.0 chain"
    target: https://eips.ethereum.org/EIPS/eip-1559
    author:
      - name: Vitalik Buterin
      - name: Eric Conner
      - name: Rick Dudley
      - name: Matthew Slipper
      - name: Ian Norden
      - name: Abdelhamid Bakhta
    date: 2021-04
  EIP-55:
    title: "Mixed-case checksum address encoding"
    target: https://eips.ethereum.org/EIPS/eip-55
    author:
      - name: Vitalik Buterin
    date: 2016-01
  ERC-20:
    title: "Token Standard"
    target: https://eips.ethereum.org/EIPS/eip-20
    author:
      - name: Fabian Vogelsteller
      - name: Vitalik Buterin
    date: 2015-11
  SEI-DOCS:
    title: "Sei Documentation"
    target: https://www.docs.sei.io
    author:
      - org: Sei Labs
    date: 2026
---

--- abstract

This document defines the "charge" intent for the "sei" payment method
within the Payment HTTP Authentication Scheme {{I-D.httpauth-payment}}.
The client constructs and signs an ERC-20 token transfer on the Sei
blockchain; the server verifies the payment and presents the transaction
hash as proof of payment.

Two credential types are supported: `type="transaction"`, where the
client sends the signed transaction to the server for broadcast, and
`type="hash"`, where the client broadcasts the transaction itself and
presents the on-chain transaction hash for server verification.

--- middle

# Introduction

HTTP Payment Authentication {{I-D.httpauth-payment}} defines a
challenge-response mechanism that gates access to resources behind
payments. This document registers the "charge" intent for the
"sei" payment method.

Sei is an EVM-compatible Layer 1 blockchain with approximately 400ms
block finality {{SEI-DOCS}}. It supports standard Ethereum JSON-RPC
and ERC-20 token transfers {{ERC-20}}, making it compatible with
existing Ethereum tooling (viem, ethers, etc.).

This specification inherits the shared request semantics of the
"charge" intent from {{I-D.payment-intent-charge}}. It defines
only the Sei-specific `methodDetails`, `payload`, and verification
procedures.

## Charge Flow

~~~
   Client                        Server                     Sei Network
      |                             |                             |
      |  (1) GET /api/resource      |                             |
      |-------------------------->  |                             |
      |                             |                             |
      |  (2) 402 Payment Required   |                             |
      |      intent="charge"        |                             |
      |<--------------------------  |                             |
      |                             |                             |
      |  (3) Sign ERC-20 transfer   |                             |
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

ERC-20
: The standard token interface on EVM-compatible chains {{ERC-20}}.
  Tokens expose `transfer(address,uint256)` and emit `Transfer` events
  on successful transfers.

Sei Transaction
: An EIP-1559 (type 2) transaction {{EIP-1559}} submitted to the Sei
  EVM. Sei transactions use standard Ethereum RLP encoding and signing.

# Request Schema

The `request` parameter in the `WWW-Authenticate` challenge contains a
base64url-encoded JSON object. The JSON MUST be serialized using JSON
Canonicalization Scheme (JCS) {{RFC8785}} before base64url encoding,
per {{I-D.httpauth-payment}}.

## Shared Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `amount` | string | REQUIRED | Amount in base units (stringified number) |
| `currency` | string | REQUIRED | ERC-20 token contract address (e.g., `"0x3894..."`) |
| `recipient` | string | REQUIRED | Recipient address, EIP-55 encoded {{EIP-55}} |
| `description` | string | OPTIONAL | Human-readable payment description |
| `externalId` | string | OPTIONAL | Merchant's reference (order ID, invoice number, etc.) |

Challenge expiry is conveyed by the `expires` auth-param in
`WWW-Authenticate` per {{I-D.httpauth-payment}}.

## Method Details

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `methodDetails.chainId` | number | OPTIONAL | Sei chain ID (default: 1329) |

Supported chain IDs:

| Chain ID | Network |
|----------|---------|
| 1329 | Sei Mainnet |
| 713715 | Sei Testnet |

**Example:**

~~~json
{
  "amount": "1000000",
  "currency": "0x3894085Ef7Ff0f0aeDf52E2A2704928d1Ec074F1",
  "recipient": "0x742d35Cc6634C0532925a3b844Bc9e7595f8fE00",
  "methodDetails": {
    "chainId": 1329
  }
}
~~~

The client fulfills this by signing an EIP-1559 transaction calling
`transfer(address,uint256)` on the specified `currency` token contract,
with the `recipient` and `amount` as arguments.

# Credential Schema

The credential in the `Authorization` header contains a base64url-encoded
JSON object per {{I-D.httpauth-payment}}.

## Credential Structure

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `challenge` | object | REQUIRED | Echo of the challenge from the server |
| `payload` | object | REQUIRED | Sei-specific payload object |
| `source` | string | OPTIONAL | Payer identifier as a DID (e.g., `did:pkh:eip155:1329:0x...`) |

The `source` field, if present, SHOULD use the `did:pkh` method with the
chain ID applicable to the challenge and the payer's Ethereum address.

## Transaction Payload (type="transaction")

When `type` is `"transaction"`, `signature` contains the signed EIP-1559
transaction, RLP-encoded and hex-prefixed with `0x`. The transaction MUST
contain a `transfer(address,uint256)` call on the ERC-20 token specified
in the challenge.

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
    "method": "sei",
    "intent": "charge",
    "request": "eyJ...",
    "expires": "2026-02-05T12:05:00Z"
  },
  "payload": {
    "signature": "0x02f8...signed transaction bytes...",
    "type": "transaction"
  },
  "source": "did:pkh:eip155:1329:0x1234567890abcdef1234567890abcdef12345678"
}
~~~

## Hash Payload (type="hash")

When `type` is `"hash"`, the client has already broadcast the transaction
to the Sei network. The `hash` field contains the transaction hash for
the server to verify on-chain.

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
    "method": "sei",
    "intent": "charge",
    "request": "eyJ...",
    "expires": "2026-02-05T12:05:00Z"
  },
  "payload": {
    "hash": "0x1a2b3c4d5e6f7890abcdef1234567890abcdef1234567890abcdef1234567890",
    "type": "hash"
  },
  "source": "did:pkh:eip155:1329:0x1234567890abcdef1234567890abcdef12345678"
}
~~~

# Settlement Procedure

## Transaction Settlement

For credentials with `type="transaction"`, the server broadcasts the
signed transaction to the Sei network:

~~~
   Client                           Server                        Sei Network
      |                                |                                |
      |  (1) Authorization:            |                                |
      |      Payment <credential>      |                                |
      |------------------------------->|                                |
      |                                |                                |
      |                                |  (2) eth_sendRawTransaction    |
      |                                |------------------------------->|
      |                                |                                |
      |                                |  (3) Transfer executed         |
      |                                |      (~400ms finality)         |
      |                                |<-------------------------------|
      |                                |                                |
      |  (4) 200 OK                    |                                |
      |      Payment-Receipt: <base64url-receipt> |                     |
      |<-------------------------------|                                |
      |                                |                                |
~~~

1. Client submits credential containing signed ERC-20 `transfer` transaction
2. Server broadcasts transaction via `eth_sendRawTransaction`
3. Transaction included in block (~400ms finality)
4. Server returns a receipt whose `reference` field is the transaction hash

## Hash Settlement

For credentials with `type="hash"`, the client has already broadcast the
transaction. The server verifies the transaction on-chain:

~~~
   Client                        Server                     Sei Network
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

## Transaction Verification {#transaction-verification}

### Transaction Credential Verification

Before broadcasting a transaction credential, servers MUST verify:

1. Deserialize the RLP-encoded EIP-1559 transaction from `payload.signature`
2. Verify the transaction `to` address matches the `currency` token contract
3. Verify the transaction calldata begins with the `transfer(address,uint256)`
   function selector (`0xa9059cbb`)
4. Decode the calldata and verify the `recipient` matches the challenge request
5. Decode the calldata and verify the `amount` matches the challenge request
6. Verify the transaction `chainId` matches the challenge `methodDetails.chainId`
   (or the default 1329)

### Hash Credential Verification

For hash credentials, servers MUST fetch the transaction receipt via
`eth_getTransactionReceipt` and verify:

1. The transaction receipt `status` is `0x1` (success)
2. The receipt contains a `Transfer(address,address,uint256)` event log
   (topic `0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef`)
3. The log `address` matches the `currency` token contract
4. The `from` parameter in the log matches the `source` (payer address)
5. The `to` parameter in the log matches the `recipient` in the challenge
6. The `value` parameter in the log matches the `amount` in the challenge

## Receipt Generation

Upon successful settlement, servers MUST return a `Payment-Receipt` header
per {{I-D.httpauth-payment}}. Servers MUST NOT include a
`Payment-Receipt` header on error responses; failures are communicated via
HTTP status codes and Problem Details.

The receipt payload for Sei charge:

| Field | Type | Description |
|-------|------|-------------|
| `method` | string | `"sei"` |
| `reference` | string | Transaction hash of the settlement transaction |
| `status` | string | `"success"` |
| `timestamp` | string | {{RFC3339}} settlement time |
| `externalId` | string | OPTIONAL. Echoed from the challenge request |

# Security Considerations

## Transaction Replay

EIP-1559 transactions include chain ID, nonce, and gas parameters that
prevent replay attacks:

- Chain ID binding prevents cross-chain replay
- Nonce consumption prevents same-chain replay
- The `expires` auth-param limits the temporal window for credential use

## Amount Verification

Clients MUST parse and verify the `request` payload before signing:

1. Verify `amount` is reasonable for the service
2. Verify `currency` is the expected token address
3. Verify `recipient` is controlled by the expected party
4. Verify `chainId` matches the expected network

## Hash Credential Risks

When accepting `type="hash"` credentials, servers cannot control
transaction parameters. Servers SHOULD apply stricter verification
and MAY reject hash credentials if policy requires server-controlled
broadcast.

# IANA Considerations

## Payment Method Registration

This document registers the following payment method in the "HTTP Payment
Methods" registry established by {{I-D.httpauth-payment}}:

| Method Identifier | Description | Reference |
|-------------------|-------------|-----------|
| `sei` | Sei blockchain ERC-20 token transfer | This document |

Contact: Sei Labs (<contact@sei.io>)

## Payment Intent Registration

This document registers the following payment intent in the "HTTP Payment
Intents" registry established by {{I-D.httpauth-payment}}:

| Intent | Applicable Methods | Description | Reference |
|--------|-------------------|-------------|-----------|
| `charge` | `sei` | One-time ERC-20 transfer | This document |

--- back

# ABNF Collected

~~~ abnf
sei-charge-challenge = "Payment" 1*SP
  "id=" quoted-string ","
  "realm=" quoted-string ","
  "method=" DQUOTE "sei" DQUOTE ","
  "intent=" DQUOTE "charge" DQUOTE ","
  "request=" base64url-nopad

sei-charge-credential = "Payment" 1*SP base64url-nopad

; Base64url encoding without padding per RFC 4648 Section 5
base64url-nopad = 1*( ALPHA / DIGIT / "-" / "_" )
~~~

# Example

**Challenge:**

~~~http
HTTP/1.1 402 Payment Required
WWW-Authenticate: Payment id="kM9xPqWvT2nJrHsY4aDfEb",
  realm="api.example.com",
  method="sei",
  intent="charge",
  request="eyJhbW91bnQiOiIxMDAwMDAwIiwiY3VycmVuY3kiOiIweDM4OTQwODVFZjdGZjBmMGFlRGY1MkUyQTI3MDQ5MjhkMUVjMDc0RjEiLCJyZWNpcGllbnQiOiIweDc0MmQzNUNjNjYzNEMwNTMyOTI1YTNiODQ0QmM5ZTc1OTVmOGZFMDAiLCJtZXRob2REZXRhaWxzIjp7ImNoYWluSWQiOjEzMjl9fQ",
  expires="2026-01-06T12:00:00Z"
Cache-Control: no-store
~~~

The `request` decodes to:

~~~json
{
  "amount": "1000000",
  "currency": "0x3894085Ef7Ff0f0aeDf52E2A2704928d1Ec074F1",
  "recipient": "0x742d35Cc6634C0532925a3b844Bc9e7595f8fE00",
  "methodDetails": {
    "chainId": 1329
  }
}
~~~

This requests a transfer of 1.00 USDC (1000000 base units, 6 decimals).

**Credential:**

~~~http
GET /api/resource HTTP/1.1
Host: api.example.com
Authorization: Payment eyJjaGFsbGVuZ2UiOnsiaWQiOiJrTTl4UHFXdlQybkpySHNZNGFEZkViIn0sInBheWxvYWQiOnsic2lnbmF0dXJlIjoiMHgwMmY4Li4uIiwidHlwZSI6InRyYW5zYWN0aW9uIn0sInNvdXJjZSI6ImRpZDpwa2g6ZWlwMTU1OjEzMjk6MHgxMjM0NTY3ODkwYWJjZGVmMTIzNDU2Nzg5MGFiY2RlZjEyMzQ1Njc4In0
~~~

# Known Tokens

The following ERC-20 tokens are available on Sei mainnet (chain ID 1329):

| Token | Address | Decimals |
|-------|---------|----------|
| USDC | `0x3894085Ef7Ff0f0aeDf52E2A2704928d1Ec074F1` | 6 |
| USDT | `0xB75D0B03c06A926e488e2659DF1A861F860bD3d1` | 6 |

# Acknowledgements

The authors thank the Sei community for their feedback on this
specification.
