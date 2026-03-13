---
title: Tempo authorize Intent for HTTP Payment Authentication
abbrev: Tempo Authorize
docname: draft-tempo-authorize-00
version: 00
category: info
ipr: trust200902
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
    email: thomas@tempo.xyz
    organization: Tempo Labs

normative:
  RFC2119:
  RFC4648:
  RFC8174:
  RFC8259:
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

This document defines the "authorize" intent for the "tempo" payment method
in the Payment HTTP Authentication Scheme {{I-D.httpauth-payment}}. It
specifies how clients grant servers spending limits with expiry on the
Tempo blockchain.

--- middle

# Introduction

The `authorize` intent represents a payment authorization. The payer grants
the server permission to charge up to the specified amount before the
expiry timestamp.

This specification defines the request schema, credential formats, and
settlement procedures for authorization on Tempo.

## Authorize Flow

The following diagram illustrates the Tempo authorize flow:

~~~
   Client                        Server                     Tempo Network
      |                             |                             |
      |  (1) GET /api/resource      |                             |
      |-------------------------->  |                             |
      |                             |                             |
      |  (2) 402 Payment Required   |                             |
      |      intent="authorize"     |                             |
      |<--------------------------  |                             |
      |                             |                             |
      |  (3) Sign keyAuthorization  |                             |
      |      or approve tx          |                             |
      |                             |                             |
      |  (4) Authorization: Payment |                             |
      |-------------------------->  |                             |
      |                             |  (5) Store keyAuth or       |
      |                             |      broadcast approve      |
      |  (6) 200 OK (approved)      |                             |
      |<--------------------------  |                             |
      |                             |                             |
      |         ... later ...       |                             |
      |                             |  (7) Charge with keyAuth    |
      |                             |      or transferFrom        |
      |                             |-------------------------->  |
      |                             |  (8) Transfer complete      |
      |                             |<--------------------------  |
      |                             |                             |
~~~

# Requirements Language

{::boilerplate bcp14-tagged}

# Terminology

TIP-20
: Tempo's enshrined token standard, implemented as precompiles rather
  than smart contracts. TIP-20 tokens use 6 decimal places and provide
  `transfer`, `transferFrom`, and `approve` operations.

Tempo Transaction
: An EIP-2718 transaction with type prefix `0x76`, supporting batched
  calls, multiple signature types (secp256k1, P256, WebAuthn), 2D nonces,
  and validity windows.

Access Key
: A delegated signing key. Access keys may have an expiry timestamp and
  a per-token spending limit. The server holds the access key and can
  sign transactions on behalf of the payer within the authorized limits.

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
base64url-encoded JSON object.

## Shared Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `amount` | string | REQUIRED | Maximum spend amount in base units |
| `currency` | string | REQUIRED | TIP-20 token address |
| `expires` | string | REQUIRED | Expiry timestamp in ISO 8601 format |
| `recipient` | string | OPTIONAL | Authorized spender address (required for transaction fulfillment) |

## Method Details

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `methodDetails.chainId` | number | OPTIONAL | Tempo chain ID (default: 42431) |
| `methodDetails.feePayer` | boolean | OPTIONAL | If `true`, server pays transaction fees (default: `false`) |
| `methodDetails.validFrom` | string | OPTIONAL | Start timestamp in ISO 8601 format |

**Example:**

~~~json
{
  "amount": "50000000",
  "currency": "0x20c0000000000000000000000000000000000001",
  "expires": "2025-02-05T12:00:00Z",
  "methodDetails": {
    "chainId": 42431,
    "feePayer": true,
    "validFrom": "2025-01-06T00:00:00Z"
  }
}
~~~

The client fulfills this by either:

1. Signing a Tempo Transaction with `approve(recipient, amount)` on the
   specified `currency` (token address), with `validBefore` set to `expires`
   and optionally `validAfter` set to `methodDetails.validFrom`. The
   `recipient` field MUST be present in the request when using transaction
   fulfillment.

2. Signing a Key Authorization with expiry = `expires` and a spending limit
   = `amount` for the specified token.

If `methodDetails.feePayer` is `true`, the client signs with
`fee_payer_signature` set to `0x00` and `fee_token` empty. If `feePayer`
is `false` or omitted, the client MUST NOT sign a key authorization; the
client MUST sign a transaction with `fee_token` set to pay fees themselves.

# Credential Schema

The credential in the `Authorization` header contains a base64url-encoded
JSON object per {{I-D.httpauth-payment}}.

## Credential Structure

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `challenge` | object | REQUIRED | Echo of the challenge from the server |
| `payload` | object | REQUIRED | Tempo-specific payload object |
| `source` | string | OPTIONAL | Payer identifier as a DID (e.g., `did:pkh:eip155:42431:0x...`) |

## Transaction Payload (type="transaction")

When `type` is `"transaction"`, `signature` contains the complete signed
Tempo Transaction (type 0x76) serialized as RLP and hex-encoded with
`0x` prefix. The transaction MUST contain an `approve(spender, amount)`
call on the TIP-20 token.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `signature` | string | REQUIRED | Hex-encoded RLP-serialized signed transaction |
| `type` | string | REQUIRED | `"transaction"` |

**Example:**

~~~json
{
  "challenge": {
    "id": "nR5tYuLpS8mWvXzQ1eCgHj",
    "realm": "api.example.com",
    "method": "tempo",
    "intent": "authorize",
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

The transaction contains `approve(recipient, amount)` on the TIP-20 token.
The server broadcasts this transaction to register the allowance onchain,
then later calls `transferFrom` to collect payment.

## Key Authorization Payload (type="keyAuthorization")

When `type` is `"keyAuthorization"`, `signature` contains the complete signed
Key Authorization serialized as RLP and hex-encoded with `0x` prefix. The
authorization is signed by the root account and grants the access key
permission to sign transactions on its behalf.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `signature` | string | REQUIRED | Hex-encoded RLP-serialized signed key authorization |
| `type` | string | REQUIRED | `"keyAuthorization"` |

**Example:**

~~~json
{
  "challenge": {
    "id": "nR5tYuLpS8mWvXzQ1eCgHj",
    "realm": "api.example.com",
    "method": "tempo",
    "intent": "authorize",
    "request": "eyJ...",
    "expires": "2025-02-05T12:05:00Z"
  },
  "payload": {
    "signature": "0xf8b2...signed authorization bytes...",
    "type": "keyAuthorization"
  },
  "source": "did:pkh:eip155:42431:0x1234567890abcdef1234567890abcdef12345678"
}
~~~

## Hash Payload (type="hash")

When `type` is `"hash"`, the client has already broadcast an `approve`
transaction to the Tempo network. The `hash` field contains the transaction
hash for the server to verify onchain.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `hash` | string | REQUIRED | Transaction hash with `0x` prefix |
| `type` | string | REQUIRED | `"hash"` |

**Example:**

~~~json
{
  "challenge": {
    "id": "nR5tYuLpS8mWvXzQ1eCgHj",
    "realm": "api.example.com",
    "method": "tempo",
    "intent": "authorize",
    "request": "eyJ...",
    "expires": "2025-02-05T12:05:00Z"
  },
  "payload": {
    "hash": "0x9f8e7d6c5b4a3210fedcba0987654321fedcba0987654321fedcba0987654321",
    "type": "hash"
  },
  "source": "did:pkh:eip155:42431:0x1234567890abcdef1234567890abcdef12345678"
}
~~~

The client constructs and broadcasts an `approve(recipient, amount)` transaction
to Tempo, then submits the hash. The server verifies the approval was registered
onchain before granting access.

# Settlement Procedure

## Settlement via Allowance (Transaction)

For `intent="authorize"` fulfilled via transaction, the client signs an
`approve` transaction granting the server a spending allowance. If
`feePayer: true`, the server adds its fee payer signature before broadcasting:

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
      |                                |  (4) Approval granted          |
      |                                |<-------------------------------|
      |                                |                                |
      |  (5) 200 OK                    |                                |
      |      Payment-Receipt: <txHash> |                                |
      |<-------------------------------|                                |
      |                                |                                |
      |         ... later, when service is consumed ...                 |
      |                                |                                |
      |                                |  (6) transferFrom(client,      |
      |                                |      server, amount)           |
      |                                |------------------------------->|
      |                                |                                |
      |                                |  (7) Transfer executed         |
      |                                |<-------------------------------|
      |                                |                                |
~~~

1. Client submits credential containing signed `approve` transaction
2. If `feePayer: true`, server adds fee sponsorship (signs with `0x78` domain)
3. Server broadcasts transaction; approval registered onchain
4. Server returns receipt (approval is now active)
5. Later, when the server needs to charge, it calls `transferFrom`
6. Charges can occur up to the approved limit before expiry

## Settlement via Key Authorization

For `intent="authorize"` fulfilled via key authorization, the client signs
an authorization granting the server permission to charge up to a limit:

~~~
   Client                        Server                     Tempo Network
      |                             |                             |
      |  (1) Authorization:         |                             |
      |      Payment <credential>   |                             |
      |      (signed keyAuth)       |                             |
      |-------------------------->  |                             |
      |                             |                             |
      |                             |  (2) Store keyAuth          |
      |                             |                             |
      |  (3) 200 OK                 |                             |
      |      (approval active)      |                             |
      |<--------------------------  |                             |
      |                             |                             |
      |         ... later, when service is consumed ...           |
      |                             |                             |
      |                             |  (4) Construct tx with:     |
      |                             |      - keyAuthorization     |
      |                             |      - transfer(amt) call   |
      |                             |                             |
      |                             |  (5) eth_sendRawTxSync      |
      |                             |-------------------------->  |
      |                             |                             |
      |                             |  (6) Key registered +       |
      |                             |      transfer executed      |
      |                             |<--------------------------  |
      |                             |                             |
~~~

1. Client submits credential containing signed key authorization
2. Server stores the authorization for future use
3. Server grants access (approval is now active)
4. Later, when the server needs to charge, it constructs a transaction
   with the `keyAuthorization` and `transfer` call
5. Charges can occur up to the authorized limit before expiry

## Receipt Generation

Upon successful settlement, servers MUST return a `Payment-Receipt` header
per {{I-D.httpauth-payment}}.

The receipt payload for Tempo authorize:

| Field | Type | Description |
|-------|------|-------------|
| `method` | string | `"tempo"` |
| `reference` | string | Transaction hash of the approval transaction (if applicable) |
| `status` | string | `"success"` or `"failed"` |
| `timestamp` | string | ISO 8601 settlement time |

# Security Considerations

## Access Key Security

Access keys present additional security considerations:

**Destination Scoping**: For `authorize` intent, clients SHOULD include
destination restrictions to limit the addresses the key can transfer to.
This prevents key compromise from enabling transfers to attacker-controlled
addresses.

**Spending Limits**: Access key spending limits are enforced by the
AccountKeychain precompile onchain. Servers cannot exceed the authorized
limits even if compromised.

**Key Revocation**: Users can revoke access keys at any time via the
AccountKeychain precompile. Servers SHOULD handle revocation gracefully
by requesting new authorization.

## Amount Verification

Clients MUST parse and verify the `request` payload before signing:

1. Verify `amount` is reasonable for the service
2. Verify `currency` is the expected token address
3. Verify `expires` is not unreasonably far in the future

## Source Verification

If a credential includes the optional `source` field (a DID identifying the
payer), servers MUST NOT trust this value without verification.

Servers MUST verify the payer identity by:

- For `type="transaction"`: Recovering the signer address from the
  transaction signature using standard ECDSA recovery
- For `type="keyAuthorization"`: Deriving the address from the `publicKey`
  field in the key authorization
- For `type="hash"`: Retrieving the `from` address from the transaction
  receipt onchain

# IANA Considerations

## Payment Intent Registration

This document registers the following payment intent in the "HTTP Payment
Intents" registry established by {{I-D.httpauth-payment}}:

| Intent | Applicable Methods | Description | Reference |
|--------|-------------------|-------------|-----------|
| `authorize` | `tempo` | Payment authorization with spending limits | This document |

--- back

# Example

**Challenge:**

~~~http
HTTP/1.1 402 Payment Required
WWW-Authenticate: Payment id="nR5tYuLpS8mWvXzQ1eCgHj",
  realm="api.example.com",
  method="tempo",
  intent="authorize",
  request="eyJhbW91bnQiOiI1MDAwMDAwMCIsImN1cnJlbmN5IjoiMHgyMGMwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAxIiwiZXhwaXJlcyI6IjIwMjUtMDItMDVUMTI6MDA6MDBaIiwibWV0aG9kRGV0YWlscyI6eyJjaGFpbklkIjo0MjQzMX19"
~~~

The `request` decodes to:

~~~json
{
  "amount": "50000000",
  "currency": "0x20c0000000000000000000000000000000000001",
  "expires": "2025-02-05T12:00:00Z",
  "methodDetails": {
    "chainId": 42431
  }
}
~~~

This requests approval for up to 50.00 alphaUSD (50000000 base units).

**Credential (via Key Authorization):**

~~~json
{
  "challenge": {
    "id": "nR5tYuLpS8mWvXzQ1eCgHj",
    "realm": "api.example.com",
    "method": "tempo",
    "intent": "authorize",
    "request": "eyJ...",
    "expires": "2025-02-05T12:05:00Z"
  },
  "payload": {
    "signature": "0xf8b2...signed authorization bytes...",
    "type": "keyAuthorization"
  },
  "source": "did:pkh:eip155:42431:0x1234567890abcdef1234567890abcdef12345678"
}
~~~

# Acknowledgements

The authors thank the Tempo community for their feedback on this
specification.
