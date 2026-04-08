---
title: Tempo Subscription Intent for HTTP Payment Authentication
abbrev: Tempo Subscription
docname: draft-tempo-subscription-00
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
    email: thomas@tempo.xyz
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
  I-D.payment-intent-subscription:
    title: "Subscription Intent for HTTP Payment Authentication"
    target: https://datatracker.ietf.org/doc/draft-payment-intent-subscription/
    author:
      - name: Jake Moxey
    date: 2026-04

informative:
  EIP-55:
    title: "Mixed-case checksum address encoding"
    target: https://eips.ethereum.org/EIPS/eip-55
    author:
      - name: Vitalik Buterin
    date: 2016-01
  TEMPO-ACCOUNT-KEYCHAIN:
    title: "Account Keychain Precompile"
    target: https://docs.tempo.xyz/protocol/precompiles/account-keychain
    author:
      - org: Tempo Labs
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

This document defines the "subscription" intent for the "tempo"
payment method in the Payment HTTP Authentication Scheme. It specifies
how clients grant servers permission to collect a fixed TIP-20 token
payment once per billing period using recipient-scoped access keys on
the Tempo blockchain.

--- middle

# Introduction

The `subscription` intent on Tempo represents a recurring fixed-amount
TIP-20 payment. The client grants the server a recipient-scoped access
key with a per-period spending limit. Activation registers the key and
collects the first billing-period charge in the same transaction.

This specification inherits the shared `subscription` intent semantics
from {{I-D.payment-intent-subscription}} and defines Tempo-specific
request fields, payloads, and settlement behavior.

Tempo subscriptions support only key-authorization fulfillment.
Tempo transactions containing standalone `approve` calls and push-mode
hash credentials do not provide the per-period enforcement required for
this intent.

## Subscription Flow

The following diagram illustrates the Tempo subscription flow:

~~~
   Client                        Server                     Tempo Network
      │                             │                             │
      │  (1) GET /api/resource      │                             │
      │-------------------------->  │                             │
      │                             │                             │
      │  (2) 402 Payment Required   │                             │
      │      intent="subscription"  │                             │
      │<--------------------------  │                             │
      │                             │                             │
      │  (3) Sign keyAuthorization  │                             │
      │      with period limit      │                             │
      │                             │                             │
      │  (4) Authorization: Payment │                             │
      │-------------------------->  │                             │
      │                             │                             │
      │                             │  (5) Register key +         │
      │                             │      transfer first period  │
      │                             │-------------------------->  │
      │                             │                             │
      │  (6) 200 OK + Receipt       │                             │
      │<--------------------------  │                             │
      │                             │                             │
      │        ... later period ... │                             │
      │                             │                             │
      │                             │  (7) transfer next period   │
      │                             │-------------------------->  │
      │                             │                             │
      │  (8) 200 OK + Receipt       │                             │
      │<--------------------------  │                             │
      │                             │                             │
~~~

# Requirements Language

{::boilerplate bcp14-tagged}

# Terminology

TIP-20
: Tempo's enshrined token standard, implemented as precompiles rather
  than smart contracts. TIP-20 tokens use 6 decimal places and provide
  `transfer`, `transferFrom`, and `approve` operations.

Access Key
: A delegated signing key. For Tempo subscriptions, the access key is
  configured with an expiry timestamp, a per-period token spending
  limit, and a destination restriction.

AccountKeychain Precompile
: The Tempo precompile that manages access-key registration, spending
  limits, and periodic-limit enforcement {{TEMPO-ACCOUNT-KEYCHAIN}}.

# Request Schema

The `request` parameter in the `WWW-Authenticate` challenge contains a
base64url-encoded JSON object. The `request` JSON MUST be serialized
using JSON Canonicalization Scheme (JCS) {{RFC8785}} and
base64url-encoded without padding per {{I-D.httpauth-payment}}.

## Shared Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `amount` | string | REQUIRED | Fixed payment amount per billing period in base units |
| `currency` | string | REQUIRED | TIP-20 token address |
| `periodSeconds` | string | REQUIRED | Billing period duration in seconds |
| `subscriptionExpires` | string | REQUIRED | Subscription expiry timestamp in {{RFC3339}} format |
| `recipient` | string | REQUIRED | Recipient address authorized for subscription charges |
| `description` | string | OPTIONAL | Human-readable subscription description |
| `externalId` | string | OPTIONAL | Merchant's reference for the subscription |

The `amount` value MUST be a string representation of a positive
integer in base 10 with no sign, decimal point, exponent, or
surrounding whitespace. Leading zeros MUST NOT be used.

The `periodSeconds` value MUST be a string representation of a positive
integer in base 10 with no sign, decimal point, exponent, or
surrounding whitespace. Leading zeros MUST NOT be used.

## Method Details

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `methodDetails.chainId` | number | OPTIONAL | Tempo chain ID. If omitted, the default value is 42431 (Tempo mainnet). |

Challenge expiry is conveyed by the `expires` auth-param in
`WWW-Authenticate` per {{I-D.httpauth-payment}}, using {{RFC3339}}
format. Request objects MUST NOT duplicate the challenge expiry value.
The `subscriptionExpires` field instead defines when the subscription
itself expires.

The `subscriptionExpires` value MUST be strictly later than the
challenge `expires` timestamp. Servers MUST reject credentials where
`subscriptionExpires` is at or before the challenge `expires`.

**Example:**

~~~json
{
  "amount": "10000000",
  "currency": "0x20c0000000000000000000000000000000000001",
  "periodSeconds": "2592000",
  "subscriptionExpires": "2026-01-01T00:00:00Z",
  "recipient": "0x742d35Cc6634C0532925a3b844Bc9e7595f8fE00",
  "methodDetails": {
    "chainId": 42431
  }
}
~~~

The client fulfills this by signing a key authorization with:

- Expiry = `subscriptionExpires`
- Per-period spending limit = `amount`
- Billing period = `periodSeconds`
- Destination restriction = `recipient`

# Credential Schema

The credential in the `Authorization` header contains a
base64url-encoded JSON object per {{I-D.httpauth-payment}}.

## Credential Structure

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `challenge` | object | REQUIRED | Echo of the challenge from the server |
| `payload` | object | REQUIRED | Tempo-specific payload object |
| `source` | string | OPTIONAL | Payer identifier as a DID (e.g., `did:pkh:eip155:42431:0x...`) |

The `source` field, if present, SHOULD use the `did:pkh` method with
the chain ID applicable to the challenge and the payer's Ethereum
address.

## Key Authorization Payload (type="keyAuthorization")

Subscriptions on Tempo MUST use `type="keyAuthorization"`. The
`signature` field contains the complete signed key authorization
serialized as RLP and hex-encoded with `0x` prefix.

The encoded value MUST be a signed key authorization containing at
least:

- the Tempo chain ID
- the access-key identifier
- the authorization expiry
- the TIP-20 token spending limit
- the billing-period limit configuration
- the recipient restriction

The embedded signature MUST use a primitive signature type supported by
{{TIP-1020}}. Keychain wrapper signatures MUST NOT be used for this
field.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `signature` | string | REQUIRED | Hex-encoded RLP-serialized signed key authorization |
| `type` | string | REQUIRED | `"keyAuthorization"` |

**Example:**

~~~json
{
  "challenge": {
    "id": "qT8wErYuI3oPlKjH6gFdSa",
    "realm": "api.example.com",
    "method": "tempo",
    "intent": "subscription",
    "request": "eyJ...",
    "expires": "2025-02-05T12:05:00Z"
  },
  "payload": {
    "signature": "0xf8c1...signed authorization bytes...",
    "type": "keyAuthorization"
  },
  "source": "did:pkh:eip155:42431:0x1234567890abcdef1234567890abcdef12345678"
}
~~~

# Settlement Procedure

## Activation and First-Period Charge

For `intent="subscription"`, activation and the first billing-period
charge are a single atomic operation:

~~~
   Client                        Server                     Tempo Network
      |                             |                             |
      |  (1) Authorization:         |                             |
      |      Payment <credential>   |                             |
      |      (signed keyAuth)       |                             |
      |-------------------------->  |                             |
      |                             |                             |
      |                             |  (2) Construct tx with:     |
      |                             |      - keyAuthorization     |
      |                             |      - transfer(recipient,  |
      |                             |        amount)              |
      |                             |                             |
      |                             |  (3) eth_sendRawTxSync      |
      |                             |-------------------------->  |
      |                             |                             |
      |                             |  (4) Key registered +       |
      |                             |      transfer executed      |
      |                             |<--------------------------  |
      |                             |                             |
      |  (5) 200 OK                 |                             |
      |      Payment-Receipt: ...   |                             |
      |<--------------------------  |                             |
      |                             |                             |
~~~

Servers MUST treat the subscription as active only after the activation
transaction succeeds.

## Renewal

For each later billing period, the server MAY submit one transaction
using the registered access key to transfer `amount` to `recipient`.

Servers MUST NOT submit more than one successful renewal charge for the
same billing period.

## Billing Anchor and Subscription State

The billing anchor for a Tempo subscription is the settlement time of
the successful activation transaction.

Billing periods are defined as:

- Period 0: `[anchor, anchor + periodSeconds)`
- Period 1: `[anchor + periodSeconds, anchor + 2*periodSeconds)`
- Period N: `[anchor + N*periodSeconds, anchor + (N+1)*periodSeconds)`

Servers MUST maintain durable local state for each subscription,
including at least:

- subscription identifier
- billing anchor
- last charged billing-period index
- subscription expiry
- revocation status

When granting access in a later billing period, servers MUST:

- Verify the subscription has not expired or been revoked
- Determine the current billing-period index from the anchor and
  `periodSeconds`
- Verify that the current billing period has not already been charged
- Atomically record the current billing period as charged before, or
  atomically with, delivering the corresponding service

For duplicate idempotent requests, servers MUST NOT charge the same
billing period more than once.

## Source Verification

If a credential includes the optional `source` field, servers MUST NOT
trust this value without verification.

Servers MUST verify the payer identity by recovering the root signer
address from the signed key authorization using
{{TIP-1020}}-compatible verification semantics over the encoded key
authorization payload.

## Receipt Generation

Upon successful activation or renewal, servers MUST return a
`Payment-Receipt` header per {{I-D.httpauth-payment}}. Servers MUST NOT
include a `Payment-Receipt` header on error responses.

The receipt payload for Tempo subscription:

| Field | Type | Description |
|-------|------|-------------|
| `method` | string | `"tempo"` |
| `reference` | string | Transaction hash of the settlement transaction |
| `status` | string | `"success"` |
| `timestamp` | string | {{RFC3339}} settlement time |
| `externalId` | string | OPTIONAL. Echoed from the challenge request |

# Security Considerations

## Destination Scoping

Tempo subscription access keys MUST be restricted to the `recipient`
address in the request. Servers MUST reject credentials that do not
enforce this restriction.

## Amount and Period Verification

Clients MUST parse and verify the `request` payload before signing:

1. Verify `amount` is reasonable for the service
2. Verify `currency` is the expected TIP-20 token address
3. Verify `periodSeconds` matches expectations
4. Verify `recipient` is controlled by the expected party
5. Verify `subscriptionExpires` is acceptable

## Revocation

Users can revoke subscription access keys at any time via the
AccountKeychain precompile {{TEMPO-ACCOUNT-KEYCHAIN}}. Servers SHOULD
handle revocation gracefully by returning a fresh subscription
challenge.

## Duplicate Charge Prevention

On-chain periodic limits prevent overspending within a billing period,
but they do not by themselves make HTTP service delivery idempotent
{{TEMPO-ACCOUNT-KEYCHAIN}}. Servers MUST implement durable local state
to prevent duplicate renewal charges caused by retries or concurrent
requests.

## Caching

Responses to subscription challenges (402 Payment Required) MUST include
`Cache-Control: no-store` to prevent sensitive payment data from being
cached by intermediaries.

Responses containing `Payment-Receipt` headers MUST include
`Cache-Control: private` to prevent shared caches from storing payment
receipts.

# IANA Considerations

## Payment Intent Registration

This document registers the following payment intent in the "HTTP
Payment Intents" registry established by {{I-D.httpauth-payment}}:

| Intent | Applicable Methods | Description | Reference |
|--------|-------------------|-------------|-----------|
| `subscription` | `tempo` | Recurring fixed-amount TIP-20 payment | This document |

Contact: Tempo Labs (<contact@tempo.xyz>)

--- back

# Example

**Challenge:**

~~~http
HTTP/1.1 402 Payment Required
Cache-Control: no-store
WWW-Authenticate: Payment id="qT8wErYuI3oPlKjH6gFdSa",
  realm="api.example.com",
  method="tempo",
  intent="subscription",
  expires="2025-02-05T12:05:00Z",
  request="<base64url-encoded JSON below>"
~~~

The `request` decodes to:

~~~json
{
  "amount": "10000000",
  "currency": "0x20c0000000000000000000000000000000000001",
  "periodSeconds": "2592000",
  "subscriptionExpires": "2026-01-01T00:00:00Z",
  "recipient": "0x742d35Cc6634C0532925a3b844Bc9e7595f8fE00",
  "methodDetails": {
    "chainId": 42431
  }
}
~~~

This requests a recurring payment of 10.00 alphaUSD every 2,592,000
seconds until 2026-01-01T00:00:00Z.

**Credential:**

~~~json
{
  "challenge": {
    "id": "qT8wErYuI3oPlKjH6gFdSa",
    "realm": "api.example.com",
    "method": "tempo",
    "intent": "subscription",
    "request": "eyJ...",
    "expires": "2025-02-05T12:05:00Z"
  },
  "payload": {
    "signature": "0xf8c1...signed authorization bytes...",
    "type": "keyAuthorization"
  },
  "source": "did:pkh:eip155:42431:0x1234567890abcdef1234567890abcdef12345678"
}
~~~

# ABNF Collected

~~~ abnf
tempo-subscription-challenge = "Payment" 1*SP
  "id=" quoted-string ","
  "realm=" quoted-string ","
  "method=" DQUOTE "tempo" DQUOTE ","
  "intent=" DQUOTE "subscription" DQUOTE ","
  "request=" base64url-nopad

tempo-subscription-credential = "Payment" 1*SP base64url-nopad

; Base64url encoding without padding per RFC 4648 Section 5
base64url-nopad = 1*( ALPHA / DIGIT / "-" / "_" )
~~~

# Acknowledgements

The authors thank the MPP community for their feedback on this
specification.
