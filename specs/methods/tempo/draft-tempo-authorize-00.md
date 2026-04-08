---
title: Tempo authorize Intent for HTTP Payment Authentication
abbrev: Tempo Authorize
docname: draft-tempo-authorize-00
version: 00
category: info
ipr: noModificationTrust200902
submissiontype: IETF
consensus: true

author:
  - name: Jake Moxey
    ins: J. Moxey
    email: jake@tempo.xyz
    org: Tempo Labs
  - name: Brendan Ryan
    ins: B. Ryan
    email: brendan@tempo.xyz
    org: Tempo Labs
  - name: Tom Meagher
    ins: T. Meagher
    email: thomas@tempo.xyz
    org: Tempo Labs

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
  I-D.payment-intent-authorize:
    title: "Authorize Intent for HTTP Payment Authentication"
    target: https://datatracker.ietf.org/doc/draft-payment-intent-authorize/
    author:
      - name: Jake Moxey
    date: 2026-03

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
  EIP-20:
    title: "ERC-20 Token Standard"
    target: https://eips.ethereum.org/EIPS/eip-20
    author:
      - name: Fabian Vogelsteller
      - name: Vitalik Buterin
    date: 2015-11
  TEMPO-TX-SPEC:
    title: "Tempo Transaction Specification"
    target: https://docs.tempo.xyz/protocol/transactions/spec-tempo-transaction
    author:
      - org: Tempo Labs
  TIP-1020:
    title: "TIP-1020: Signature Verification Precompile"
    target: https://docs.tempo.xyz/protocol/tips/tip-1020
    author:
      - org: Tempo Labs
---

--- abstract

This document defines the "authorize" intent for the "tempo" payment method
in the Payment HTTP Authentication Scheme. It specifies how clients grant
servers spending limits with expiry on the Tempo blockchain.

--- middle

# Introduction

The `authorize` intent represents a payment authorization. The payer grants
the server permission to charge up to the specified amount before the
authorization expiry timestamp.

This specification defines the request schema, credential formats, and
settlement procedures for authorization on Tempo. It inherits the shared
`authorize` intent semantics from {{I-D.payment-intent-authorize}} and
defines Tempo-specific request fields, payloads, and settlement behavior.

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
base64url-encoded JSON object. The `request` JSON MUST be serialized
using JSON Canonicalization Scheme (JCS) {{RFC8785}} and
base64url-encoded without padding per {{I-D.httpauth-payment}}.

## Shared Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `amount` | string | REQUIRED | Amount in base units (stringified non-negative integer, no leading zeros) |
| `currency` | string | REQUIRED | TIP-20 token address |
| `authorizationExpires` | string | REQUIRED | Authorization expiry timestamp in {{RFC3339}} format |
| `recipient` | string | OPTIONAL | Authorized spender address; REQUIRED for `type="transaction"` fulfillment, OPTIONAL for `type="keyAuthorization"` |
| `description` | string | OPTIONAL | Human-readable authorization description |
| `externalId` | string | OPTIONAL | Merchant's reference (order ID, etc.) |

## Method Details

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `methodDetails.chainId` | number | OPTIONAL | Tempo chain ID. If omitted, the default value is 42431 (Tempo mainnet). |
| `methodDetails.feePayer` | boolean | OPTIONAL | If `true`, server pays transaction fees (default: `false`) |
| `methodDetails.validFrom` | string | OPTIONAL | Start timestamp in {{RFC3339}} format |

Challenge expiry is conveyed by the `expires` auth-param in
`WWW-Authenticate` per {{I-D.httpauth-payment}}, using {{RFC3339}}
format. Request objects MUST NOT duplicate the challenge expiry value.
The `authorizationExpires` field instead defines when the authorization
itself expires.

The `authorizationExpires` value MUST be strictly later than the
challenge `expires` timestamp. Servers MUST reject credentials where
`authorizationExpires` is at or before the challenge `expires`.

**Example:**

~~~json
{
  "amount": "50000000",
  "currency": "0x20c0000000000000000000000000000000000001",
  "authorizationExpires": "2025-02-05T12:00:00Z",
  "methodDetails": {
    "chainId": 42431,
    "feePayer": true,
    "validFrom": "2025-01-06T00:00:00Z"
  }
}
~~~

The client fulfills this by either:

1. Signing a Tempo Transaction with `approve(recipient, amount)` on the
   specified `currency` (token address), with `validBefore` set to no later
   than the challenge `expires` auth-param and optionally `validAfter` set to
   `methodDetails.validFrom`. The `recipient` field MUST be present in the
   request when using transaction fulfillment.

2. Signing a Key Authorization with expiry = `authorizationExpires` and a
   spending limit = `amount` for the specified token.

If `methodDetails.feePayer` is `true`, the client signs with
`fee_payer_signature` set to `0x00` and `fee_token` empty. If `feePayer`
is `false` or omitted, the client MUST NOT sign a key authorization; the
client MUST sign a transaction with `fee_token` set to pay fees themselves.

For transaction-based fulfillment, Tempo's `approve` operation does not
natively expire after registration. Servers MUST NOT charge via an approval
after `authorizationExpires`, and payers SHOULD revoke unused approvals when
stronger onchain enforcement is desired.

# Credential Schema

The credential in the `Authorization` header contains a base64url-encoded
JSON object per {{I-D.httpauth-payment}}.

## Credential Structure

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `challenge` | object | REQUIRED | Echo of the challenge from the server |
| `payload` | object | REQUIRED | Tempo-specific payload object |
| `source` | string | OPTIONAL | Payer identifier as a DID (e.g., `did:pkh:eip155:42431:0x...`) |

The `source` field, if present, SHOULD use the `did:pkh` method with
the chain ID applicable to the challenge and the payer's Ethereum
address.

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
permission to sign transactions on its behalf. The encoded value MUST be a
signed key authorization containing `chainId`, `keyType`, `keyId`,
`expiry`, and token spending limits. The embedded signature MUST use a
primitive signature type supported by {{TIP-1020}}. Keychain wrapper
signatures MUST NOT be used for this field.

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
      |      (authorization active)    |                                |
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
4. Server returns success (approval is now active)
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

## Authorization State Management

On-chain approvals and access-key limits do not by themselves make HTTP
service delivery idempotent. Servers MUST maintain durable local state for
each registered authorization, including the remaining amount the server is
willing to consume for HTTP resource delivery.

When consuming authorized value, servers MUST:

- Verify the authorization has not expired or been revoked
- Verify the local remaining amount is sufficient
- Verify the on-chain approval or access-key limit is still sufficient
- Atomically decrement local remaining amount before, or atomically with,
  delivering the corresponding service

For duplicate idempotent requests, servers MUST NOT decrement local state
more than once.

## Receipt Generation

Registration responses for `intent="authorize"` MUST NOT include a
`Payment-Receipt` header. Servers MUST return a `Payment-Receipt` header
only on later successful responses that actually consume authorized value,
per {{I-D.httpauth-payment}}.

The receipt payload for Tempo authorize:

| Field | Type | Description |
|-------|------|-------------|
| `method` | string | `"tempo"` |
| `reference` | string | Transaction hash of the settlement transaction that consumed authorized value |
| `status` | string | `"success"` |
| `timestamp` | string | {{RFC3339}} settlement time |

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
3. Verify `authorizationExpires` is not unreasonably far in the future

## Source Verification

If a credential includes the optional `source` field (a DID identifying the
payer), servers MUST NOT trust this value without verification.

Servers MUST verify the payer identity by:

- For `type="transaction"`: Recovering the signer address from the
  transaction signature using standard ECDSA recovery
- For `type="keyAuthorization"`: Recovering the root signer address from the
  signed key authorization using {{TIP-1020}}-compatible verification
  semantics over the encoded key authorization payload
- For `type="hash"`: Retrieving the `from` address from the transaction
  receipt onchain

## Caching

Responses to authorization challenges (402 Payment Required) and
responses that consume authorized value SHOULD include
`Cache-Control: no-store` to prevent sensitive payment data from being
cached by intermediaries.

# IANA Considerations

## Payment Intent Registration

This document registers the following payment intent in the "HTTP Payment
Intents" registry established by {{I-D.httpauth-payment}}:

| Intent | Applicable Methods | Description | Reference |
|--------|-------------------|-------------|-----------|
| `authorize` | `tempo` | Pre-authorization for future TIP-20 charges | This document |

--- back

# Example

**Challenge:**

~~~http
HTTP/1.1 402 Payment Required
WWW-Authenticate: Payment id="nR5tYuLpS8mWvXzQ1eCgHj",
  realm="api.example.com",
  method="tempo",
  intent="authorize",
  expires="2025-02-05T12:05:00Z",
  request="<base64url-encoded JSON below>"
~~~

The `request` decodes to:

~~~json
{
  "amount": "50000000",
  "currency": "0x20c0000000000000000000000000000000000001",
  "authorizationExpires": "2025-02-05T12:00:00Z",
  "methodDetails": {
    "chainId": 42431,
    "feePayer": true
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

# ABNF Collected

~~~ abnf
tempo-authorize-challenge = "Payment" 1*SP
  "id=" quoted-string ","
  "realm=" quoted-string ","
  "method=" DQUOTE "tempo" DQUOTE ","
  "intent=" DQUOTE "authorize" DQUOTE ","
  "request=" base64url-nopad

tempo-authorize-credential = "Payment" 1*SP base64url-nopad

; Base64url encoding without padding per RFC 4648 Section 5
base64url-nopad = 1*( ALPHA / DIGIT / "-" / "_" )
~~~

# Acknowledgements

The authors thank the MPP community for their feedback on this
specification.


