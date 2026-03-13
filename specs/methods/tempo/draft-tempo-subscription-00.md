---
title: Tempo subscription Intent for HTTP Payment Authentication
abbrev: Tempo Subscription
docname: draft-tempo-subscription-00
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

This document defines the "subscription" intent for the "tempo" payment method
in the Payment HTTP Authentication Scheme {{I-D.httpauth-payment}}. It
specifies how clients grant servers recurring payment authorization with
periodic limits on the Tempo blockchain.

--- middle

# Introduction

The `subscription` intent represents a recurring payment authorization. The
payer grants the server permission to charge a specified amount per period
(e.g., daily, weekly, monthly).

This specification defines the request schema, credential format, and
settlement procedures for subscriptions on Tempo.

**Important**: Tempo Transactions cannot fulfill subscription intents because
ERC-20 style approvals do not support periodic limit semantics. Only Key
Authorization credentials are valid for subscriptions.

## Subscription Flow

The following diagram illustrates the Tempo subscription flow:

~~~
   Client                        Server                     Tempo Network
      |                             |                             |
      |  (1) GET /api/resource      |                             |
      |-------------------------->  |                             |
      |                             |                             |
      |  (2) 402 Payment Required   |                             |
      |      intent="subscription"  |                             |
      |<--------------------------  |                             |
      |                             |                             |
      |  (3) Sign keyAuthorization  |                             |
      |      (periodic limits)      |                             |
      |                             |                             |
      |  (4) Authorization: Payment |                             |
      |-------------------------->  |                             |
      |                             |  (5) Register + charge      |
      |                             |-------------------------->  |
      |                             |  (6) First period paid      |
      |                             |<--------------------------  |
      |  (7) 200 OK + Receipt       |                             |
      |<--------------------------  |                             |
      |                             |                             |
      |         ... 30 days ...     |                             |
      |                             |  (8) Charge next period     |
      |                             |-------------------------->  |
      |                             |  (9) Transfer complete      |
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

Access Key
: A delegated signing key. Access keys may have an expiry timestamp and
  a per-token spending limit. For subscriptions, access keys include
  periodic limits that reset after each billing period.

AccountKeychain Precompile
: The Tempo precompile contract that manages access key registration,
  spending limits, and periodic limit enforcement. The precompile tracks
  spending per period and resets limits automatically.

2D Nonce
: Tempo's nonce system where each account has multiple independent nonce
  lanes (`nonce_key`), enabling parallel transaction submission.

# Request Schema

The `request` parameter in the `WWW-Authenticate` challenge contains a
base64url-encoded JSON object.

## Shared Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `amount` | string | REQUIRED | Amount per period in base units |
| `currency` | string | REQUIRED | TIP-20 token address |
| `period` | string | REQUIRED | Billing period |
| `expires` | string | REQUIRED | Subscription end timestamp in ISO 8601 format |

## Period Values

The `period` field accepts the following values:

| Value | Description |
|-------|-------------|
| `"day"` | Daily billing (86400 seconds) |
| `"week"` | Weekly billing (604800 seconds) |
| `"month"` | Monthly billing (~30 days, 2592000 seconds) |
| `"year"` | Yearly billing (~365 days, 31536000 seconds) |
| `"<seconds>"` | Custom period in seconds as a string (e.g., `"2592000"`) |

## Method Details

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `methodDetails.chainId` | number | OPTIONAL | Tempo chain ID (default: 42431) |
| `methodDetails.validFrom` | string | OPTIONAL | Start timestamp in ISO 8601 format |

**Example:**

~~~json
{
  "amount": "10000000",
  "currency": "0x20c0000000000000000000000000000000000001",
  "period": "month",
  "expires": "2026-01-06T00:00:00Z",
  "methodDetails": {
    "chainId": 42431,
    "validFrom": "2025-01-06T00:00:00Z"
  }
}
~~~

This requests a subscription for 10.00 alphaUSD (10000000 base units) per
month, expiring on January 6, 2026.

The client fulfills this by signing a Key Authorization with:

- Expiry = `expires`
- Periodic spending limit = `amount` per `period` for the specified `currency`

# Credential Schema

The credential in the `Authorization` header contains a base64url-encoded
JSON object per {{I-D.httpauth-payment}}.

## Credential Structure

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `challenge` | object | REQUIRED | Echo of the challenge from the server |
| `payload` | object | REQUIRED | Tempo-specific payload object |
| `source` | string | OPTIONAL | Payer identifier as a DID (e.g., `did:pkh:eip155:42431:0x...`) |

## Key Authorization Payload (type="keyAuthorization")

Subscriptions MUST use `type="keyAuthorization"`. The `signature` field
contains the complete signed Key Authorization serialized as RLP and
hex-encoded with `0x` prefix. The authorization is signed by the root
account and grants the access key permission to sign transactions on its
behalf with periodic spending limits.

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

**Note**: Tempo Transactions (`type="transaction"`) and transaction hashes
(`type="hash"`) cannot fulfill subscription intents because ERC-20 style
approvals do not support periodic limit semantics.

# Settlement Procedure

## Periodic Charging via AccountKeychain

For `intent="subscription"` fulfilled via key authorization, the client
signs an authorization granting the server permission to charge periodically:

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
      |                             |      - transfer(amt) call   |
      |                             |                             |
      |                             |  (3) eth_sendRawTxSync      |
      |                             |-------------------------->  |
      |                             |                             |
      |                             |  (4) Key registered +       |
      |                             |      transfer executed      |
      |                             |<--------------------------  |
      |                             |                             |
      |  (5) 200 OK                 |                             |
      |      Payment-Receipt:       |                             |
      |      <txHash>               |                             |
      |<--------------------------  |                             |
      |                             |                             |
      |         ... 30 days pass ...                              |
      |                             |                             |
      |                             |  (6) Construct tx with:     |
      |                             |      - transfer(amt) call   |
      |                             |      (key already registered)|
      |                             |                             |
      |                             |  (7) eth_sendRawTxSync      |
      |                             |-------------------------->  |
      |                             |                             |
      |                             |  (8) Transfer executed      |
      |                             |<--------------------------  |
      |                             |                             |
      |         ... repeat each period until expiry ...           |
      |                             |                             |
~~~

1. Client submits credential containing signed key authorization
2. Server constructs transaction with `keyAuthorization` and first `transfer`
3. Transaction registers the key and executes the first charge
4. Server returns receipt (subscription is now active)
5. When each period elapses, server charges using the registered key
6. Process repeats each period until authorization expires

## Periodic Limit Enforcement

The AccountKeychain precompile enforces periodic spending limits:

1. **Period tracking**: The precompile tracks when each period started
   and how much has been spent in the current period.

2. **Automatic reset**: When a new period begins (based on the configured
   period duration), the spending counter resets to zero.

3. **Limit enforcement**: Each transfer is checked against the remaining
   allowance for the current period. Transfers exceeding the limit revert.

4. **Expiry enforcement**: After the authorization expiry timestamp, all
   transfers using the key are rejected.

## Receipt Generation

Upon successful settlement, servers MUST return a `Payment-Receipt` header
per {{I-D.httpauth-payment}}.

The receipt payload for Tempo subscription:

| Field | Type | Description |
|-------|------|-------------|
| `method` | string | `"tempo"` |
| `reference` | string | Transaction hash of the key registration transaction |
| `status` | string | `"success"` or `"failed"` |
| `timestamp` | string | ISO 8601 settlement time |

# Security Considerations

## Access Key Security

Access keys for subscriptions present additional security considerations:

**Periodic Limit Boundaries**: Clients SHOULD understand that periodic limits
reset at fixed intervals. A server could charge the full period amount just
before a reset, then charge again immediately after. Clients accepting
subscriptions implicitly accept this behavior.

**Destination Scoping**: Clients SHOULD include destination restrictions to
limit the addresses the key can transfer to. This prevents key compromise
from enabling transfers to attacker-controlled addresses.

**Spending Limits**: Access key spending limits are enforced by the
AccountKeychain precompile onchain. Servers cannot exceed the authorized
per-period limits even if compromised.

**Key Revocation**: Users can revoke access keys at any time via the
AccountKeychain precompile. Servers SHOULD handle revocation gracefully
and notify the user that their subscription has been cancelled.

## Amount Verification

Clients MUST parse and verify the `request` payload before signing:

1. Verify `amount` is reasonable for the service per period
2. Verify `currency` is the expected token address
3. Verify `period` matches expectations
4. Verify `expires` is not unreasonably far in the future

## No Transaction or Hash Fulfillment

Unlike `charge` and `authorize` intents, the `subscription` intent does NOT
support `type="transaction"` or `type="hash"` credentials. Servers MUST
reject subscription credentials with these types.

This restriction exists because:

- ERC-20 `approve` does not support periodic limits
- Periodic limit enforcement requires the AccountKeychain precompile
- Only Key Authorization credentials can configure periodic limits

# IANA Considerations

## Payment Intent Registration

This document registers the following payment intent in the "HTTP Payment
Intents" registry established by {{I-D.httpauth-payment}}:

| Intent | Applicable Methods | Description | Reference |
|--------|-------------------|-------------|-----------|
| `subscription` | `tempo` | Recurring payment authorization with periodic limits | This document |

--- back

# Example

**Challenge:**

~~~http
HTTP/1.1 402 Payment Required
WWW-Authenticate: Payment id="qT8wErYuI3oPlKjH6gFdSa",
  realm="api.example.com",
  method="tempo",
  intent="subscription",
  request="eyJhbW91bnQiOiIxMDAwMDAwMCIsImN1cnJlbmN5IjoiMHgyMGMwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAxIiwicGVyaW9kIjoibW9udGgiLCJleHBpcmVzIjoiMjAyNi0wMS0wNlQwMDowMDowMFoiLCJtZXRob2REZXRhaWxzIjp7ImNoYWluSWQiOjQyNDMxfX0"
~~~

The `request` decodes to:

~~~json
{
  "amount": "10000000",
  "currency": "0x20c0000000000000000000000000000000000001",
  "period": "month",
  "expires": "2026-01-06T00:00:00Z",
  "methodDetails": {
    "chainId": 42431
  }
}
~~~

This requests a subscription for 10.00 alphaUSD (10000000 base units) per month.

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

Note: Periodic limit enforcement for subscriptions is configured when
registering the key with the AccountKeychain precompile.

# Acknowledgements

The authors thank the Tempo community for their feedback on this
specification.
