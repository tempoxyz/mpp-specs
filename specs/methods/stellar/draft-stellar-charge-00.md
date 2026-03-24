---
title: Stellar Charge Intent for HTTP Payment Authentication
abbrev: Stellar Charge
docname: draft-stellar-charge-00
version: 00
category: info
ipr: noModificationTrust200902
submissiontype: independent
consensus: false

author:
  - name: Marcelo Salloum
    ins: M. Salloum
    email: marcelo@stellar.org
    org: Stellar Development Foundation

normative:
  RFC2119:
  RFC3339:
  RFC4648:
  RFC8174:
  RFC8259:
  RFC8785:
  I-D.httpauth-payment:
    title: "The 'Payment' HTTP Authentication Scheme"
    target: >
      https://datatracker.ietf.org/doc/draft-ietf-httpauth-payment/
    author:
      - name: Brendan Ryan
      - name: Jake Moxey
    date: 2026-01
  I-D.payment-intent-charge:
    title: "'charge' Intent for HTTP Payment Authentication"
    target: >
      https://datatracker.ietf.org/doc/draft-payment-intent-charge/
    author:
      - name: Jake Moxey
      - name: Brendan Ryan
      - name: Tom Meagher
    date: 2026

informative:
  SEP-41:
    title: "SEP-41: Token Interface"
    target: https://stellar.org/protocol/sep-41
    author:
      - org: Stellar Development Foundation
    date: 2024
  CAIP-2-STELLAR:
    title: "CAIP-2: Stellar Namespace"
    target: >
      https://namespaces.chainagnostic.org/stellar/caip2
    author:
      - org: Chain Agnostic Standards Alliance
    date: 2023
  STELLAR-AUTH:
    title: "Stellar Contracts Authorization Framework"
    target: >
      https://developers.stellar.org/docs/learn/encyclopedia/security/authorization
    author:
      - org: Stellar Development Foundation
  SAC:
    title: "Stellar Asset Contract"
    target: >
      https://developers.stellar.org/docs/tokens/stellar-asset-contract
    author:
      - org: Stellar Development Foundation
  DID-PKH:
    title: "did:pkh Method Specification"
    target: https://github.com/w3c-ccg/did-pkh
    author:
      - org: W3C CCG
  STELLAR-XDR:
    title: "Stellar XDR Definitions"
    target: https://github.com/stellar/stellar-xdr
    author:
      - org: Stellar Development Foundation
  STELLAR-RPC:
    title: "Stellar RPC Reference"
    target: >
      https://developers.stellar.org/docs/data/rpc/api-reference
    author:
      - org: Stellar Development Foundation
---

--- abstract

This document defines the "charge" intent for the "stellar" payment method
in the Payment HTTP Authentication Scheme. It specifies how clients and
servers exchange one-time SEP-41 token transfers on the Stellar blockchain,
with optional server-sponsored transaction fees.

--- middle

# Introduction

The `charge` intent represents a one-time payment of a specified amount, as
defined in {{I-D.payment-intent-charge}}. The server may settle the payment
any time before the challenge `expires` auth-param timestamp.

This document specifies how to implement the `charge` intent using SEP-41
{{SEP-41}} tokens on the Stellar smart contract platform. SEP-41 {{SEP-41}}
defines a standard token interface for Stellar smart contracts, including Stellar
Asset Contracts (SAC) {{SAC}} and custom token implementations.

The `stellar` method supports two modes via the `methodDetails.feePayer`
field:

- When `feePayer` is `true`, the server sponsors transaction fees. The client
  signs only contract authorization entries; the server rebuilds the
  transaction as source and submits.

- When `feePayer` is `false`, the client builds and signs a complete,
  network-ready transaction. The server verifies and submits it without
  modification.

## Charge Flow

~~~
   Client                        Server                Stellar Network
      |                             |                         |
      |  (1) GET /resource          |                         |
      |-------------------------->  |                         |
      |                             |                         |
      |  (2) 402 Payment Required   |                         |
      |      intent="charge"        |                         |
      |<--------------------------  |                         |
      |                             |                         |
      |  (3) Sign tx or auth entries|                         |
      |                             |                         |
      |  (4) Authorization: Payment |                         |
      |-------------------------->  |                         |
      |                             |  (5) Verify + submit    |
      |                             |---------------------->  |
      |                             |  (6) Confirmed          |
      |                             |<----------------------  |
      |  (7) 200 OK + Receipt       |                         |
      |<--------------------------  |                         |
      |                             |                         |
~~~

When `feePayer` is `true`, step (3) signs only authorization entries and
step (5) includes the server rebuilding the transaction as source. When
`feePayer` is `false`, step (3) builds and signs a complete transaction
and the server submits it without modification.

# Requirements Language

{::boilerplate bcp14-tagged}

# Terminology

SEP-41 Token
: A Stellar smart contract implementing the SEP-41 {{SEP-41}} token
  interface, exposing `transfer`, `balance`, and related functions.
  Identified by a C-prefixed Stellar smart contract address. Stellar Asset
  Contracts (SAC) {{SAC}} are a common SEP-41 {{SEP-41}} implementation
  that wrap classic Stellar assets.

Authorization Entry
: A signed data structure scoping a Stellar smart contract invocation to a
  specific invoker and ledger sequence range. See {{STELLAR-AUTH}}.

Fee Sponsorship
: An arrangement where the server pays Stellar network fees on behalf of
  the client. The client signs only authorization entries; the server acts
  as the transaction source account.

DEFAULT_LEDGER_CLOSE_TIME
: The normative fallback value for the average Stellar ledger close time:
  5 seconds. Used to convert wall-clock expiry to a ledger sequence number
  when network-provided estimates are unavailable.

CAIP-2 Network Identifier
: A chain identifier per the CAIP-2 Stellar namespace
  {{CAIP-2-STELLAR}} (e.g., `stellar:pubnet`).

# Request Schema {#request-schema}

The `request` parameter in the `WWW-Authenticate` challenge contains a
base64url-encoded JSON object. The JSON MUST be serialized using the JSON
Canonicalization Scheme (JCS) {{RFC8785}} before base64url encoding, per
{{I-D.httpauth-payment}}.

This specification implements the shared request fields defined in
{{I-D.payment-intent-charge}}.

## Shared Fields

| Field | Type | Presence | Description |
|-------|------|----------|-------------|
| `amount` | string | REQUIRED | Stringified non-negative integer in the SEP-41 {{SEP-41}} token's base units |
| `currency` | string | REQUIRED | SEP-41 {{SEP-41}} token contract address (C-prefixed Stellar smart contract ID) |
| `recipient` | string | REQUIRED | Stellar account address of the payment recipient |
| `description` | string | OPTIONAL | Human-readable payment description |
| `externalId` | string | OPTIONAL | Merchant reference (order ID, invoice number, etc.) |

Challenge expiry is conveyed by the `expires` auth-param in
`WWW-Authenticate` per {{I-D.httpauth-payment}}.

## Method Details

| Field | Type | Presence | Description |
|-------|------|----------|-------------|
| `methodDetails.network` | string | REQUIRED | CAIP-2 Stellar chain identifier (`stellar:pubnet` or `stellar:testnet`) |
| `methodDetails.feePayer` | boolean | OPTIONAL | If `true`, server pays transaction fees (default: `false`) |

If `methodDetails.feePayer` is `true`, the server sponsors transaction
fees per {{sponsored}}. If `false` or omitted, the client MUST build a
fully signed, network-ready transaction per {{unsponsored}}.

**Example:**

~~~json
{
  "amount": "10000000",
  "currency": "CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4W",
  "recipient": "GBHEGW3KWOY2OFH767EDALFGCUTBOEVBDQMCKU",
  "description": "API access fee",
  "methodDetails": {
    "network": "stellar:testnet",
    "feePayer": true
  }
}
~~~

# Credential Schema {#credential-schema}

The credential in the `Authorization` header contains a base64url-encoded
JSON object per {{I-D.httpauth-payment}}.

## Credential Structure

| Field | Type | Presence | Description |
|-------|------|----------|-------------|
| `challenge` | object | REQUIRED | Echo of the challenge |
| `payload` | object | REQUIRED | Stellar-specific payload |
| `source` | string | OPTIONAL | Payer DID |

The `source` field, if present, SHOULD use the `did:pkh` method {{DID-PKH}}
with the CAIP-2 network identifier and the payer's Stellar address (e.g.,
`did:pkh:stellar:testnet:GABC...`).

## Payload Structure

| Field | Type | Presence | Description |
|-------|------|----------|-------------|
| `transaction` | string | REQUIRED | Base64-encoded XDR |

`transaction`
: Base64-encoded XDR of a Stellar transaction as defined in
  {{STELLAR-XDR}}. The transaction MUST contain exactly one operation of
  type `invokeHostFunction`.

  When `feePayer` is `true`: the transaction source account MUST be set to
  the all-zeros Stellar account
  (`GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF`). The server
  replaces it with its own address at settlement. Authorization entries
  MUST be signed by the client.

  When `feePayer` is `false`: the transaction MUST be fully signed and
  network-ready, including valid sequence number, fee, `timeBounds`, and
  source account. The server MUST submit this transaction without
  modification.

**Example:**

~~~json
{
  "challenge": {
    "id": "kM9xPqWvT2nJrHsY4aDfEb",
    "realm": "api.example.com",
    "method": "stellar",
    "intent": "charge",
    "request": "eyJ...",
    "expires": "2025-02-05T12:05:00Z"
  },
  "payload": {
    "transaction": "AAAAAgAAAABriIN4..."
  },
  "source": "did:pkh:stellar:testnet:GABC..."
}
~~~

# Ledger Expiration {#ledger-expiration}

Stellar uses ledger sequence numbers for transaction and authorization
entry expiration rather than wall-clock timestamps. Clients MUST derive the
ledger expiration from the challenge `expires` auth-param as follows.

If `expires` is absent, clients SHOULD default to 5 minutes from the
current time.

~~~
ledgerExpiration =
  currentLedger +
  ceil((expires - now) / DEFAULT_LEDGER_CLOSE_TIME)
~~~

where `DEFAULT_LEDGER_CLOSE_TIME` is 5 seconds. `currentLedger` MUST be
obtained from the Stellar network via Stellar RPC `getLatestLedger`
{{STELLAR-RPC}}.

When `feePayer` is `true`, clients MUST set the authorization entry
expiration ledger to this value.

When `feePayer` is `false`, clients MUST set the transaction
`timeBounds.maxTime` to the `expires` timestamp. The transaction MUST NOT
be valid beyond the challenge expiry.

# Fee Payment {#fee-payment}

## Server-Sponsored Fees {#sponsored}

When `methodDetails.feePayer` is `true`:

1. The client obtains `currentLedger` via Stellar RPC `getLatestLedger`
   and computes the authorization entry expiration per
   {{ledger-expiration}}.

2. The client builds an `invokeHostFunction` transaction with the all-zeros
   source account, containing a single operation calling
   `transfer(from, to, amount)` on the SEP-41 {{SEP-41}} token contract.
   The client simulates the transaction to identify the required
   authorization entries.

3. The client signs the authorization entries using credential type
   `sorobanCredentialsAddress`. The client MUST NOT sign the full
   transaction.

4. The client encodes the transaction with signed authorization entries as
   base64 XDR and places it in `payload.transaction`.

5. Upon receiving the credential, the server verifies it per
   {{verification}}, rebuilds the transaction with itself as source
   account, and submits it per {{settlement}}.

Servers acting as fee sponsors:

- MUST maintain sufficient XLM balance to cover fees.
- MAY reject new challenges when XLM balance is below a safe operational
  threshold.

## Client-Paid Fees {#unsponsored}

When `methodDetails.feePayer` is `false` or absent:

1. The client sets `timeBounds.maxTime` to the `expires` auth-param value,
   or 5 minutes from the current time if `expires` is absent. The
   transaction MUST NOT be valid beyond the challenge expiry. See
   {{ledger-expiration}}.

2. The client builds a fully signed `invokeHostFunction` transaction
   containing a single operation calling `transfer(from, to, amount)` on
   the SEP-41 {{SEP-41}} token contract, including sequence number, fee,
   and `timeBounds`.

3. The client encodes the complete, signed transaction as base64 XDR in
   `payload.transaction`.

4. Upon receiving the credential, the server verifies it per
   {{verification}} and submits the transaction without modification per
   {{settlement}}.

# Verification {#verification}

Before settling a charge credential, servers MUST enforce all of the
following checks. If any check fails, the server MUST return a
`verification-failed` error per {{I-D.httpauth-payment}}.

If the Stellar RPC is unavailable for a required simulation step, servers
MUST treat this as a server error (HTTP 5xx) rather than a
`verification-failed` response, and MUST NOT settle the credential.

## Common Checks

1. The challenge `id` matches an outstanding, unsettled challenge issued
   by this server, and the current time is before the challenge `expires`
   auth-param.

2. The decoded transaction contains exactly one `invokeHostFunction`
   operation with function type `hostFunctionTypeInvokeContract`.

3. The invoked function is `transfer(from, to, amount)` on the contract
   matching `currency`. The `to` argument MUST equal `recipient` and the
   `amount` argument MUST equal `amount` (as i128) from the challenge
   request.

4. The transaction's network passphrase MUST correspond to
   `methodDetails.network`.

5. The server MUST simulate the transaction via Stellar RPC. The
   simulation MUST succeed and MUST emit events showing only the expected
   balance changes: a decrease of `amount` for the payer and an increase
   of `amount` for the recipient. Any other balance change MUST cause
   verification to fail.

## Sponsored Flow Additional Checks

6. The transaction source account is the all-zeros account
   (`GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF`).

7. Authorization entries MUST use credential type
   `sorobanCredentialsAddress` only, and MUST NOT contain
   `subInvocations` beyond the single SEP-41 {{SEP-41}} token transfer.

8. The authorization entry expiration MUST NOT exceed `currentLedger +
   ceil((expires - now) / DEFAULT_LEDGER_CLOSE_TIME)`.

9. The server's address MUST NOT appear as the `from` argument or in
    any authorization entry.

## Unsponsored Flow Additional Checks

6. `timeBounds.maxTime` MUST NOT exceed the `expires` timestamp from the
   challenge.

# Settlement Procedure {#settlement}

## Sponsored Flow

1. Parse the base64 XDR transaction from `payload.transaction`.

2. Extract all operations and authorization entries.

3. Rebuild a new transaction with:
   - Source account: the server's Stellar address.
   - Operations: copied from the client's transaction.
   - Authorization entries: copied from the client's transaction.

4. Sign the rebuilt transaction with the server's key.

5. Submit via Stellar RPC `sendTransaction` {{STELLAR-RPC}}.

6. Verify the submission returns `PENDING` status, then poll until
   `SUCCESS` or `FAILED`.

7. On `SUCCESS`, return a receipt per {{receipt}}. On `FAILED`, the server
   MUST return a `settlement-failed` error per
   {{I-D.httpauth-payment}}. The credential was valid but the on-chain
   transaction failed (e.g., insufficient funds or sequence number
   conflict).

## Unsponsored Flow

1. Verify the transaction per {{verification}}.

2. Submit the received transaction as-is via Stellar RPC
   `sendTransaction` {{STELLAR-RPC}}. The server MUST NOT modify the
   transaction.

3. Poll until `SUCCESS` or `FAILED`.

4. On `SUCCESS`, return a receipt per {{receipt}}. On `FAILED`, the server
   MUST return a `settlement-failed` error per
   {{I-D.httpauth-payment}}. The credential was valid but the on-chain
   transaction failed (e.g., insufficient funds or sequence number
   conflict).

## Receipt {#receipt}

Upon successful settlement, servers MUST return a `Payment-Receipt` header
per {{I-D.httpauth-payment}}.

The receipt payload fields:

| Field | Type | Presence | Description |
|-------|------|----------|-------------|
| `method` | string | REQUIRED | `"stellar"` |
| `reference` | string | REQUIRED | Transaction hash |
| `status` | string | REQUIRED | `"success"` |
| `timestamp` | string | REQUIRED | {{RFC3339}} settlement time |
| `externalId` | string | OPTIONAL | Echoed from request |

# Security Considerations {#security}

## Facilitator Safety

When `feePayer` is `true`, the server rebuilds and signs the transaction. A
malicious client could craft a transaction to drain the server's account.

Servers MUST verify their own address does not appear as the `from`
transfer argument or in any authorization entry before signing. Servers
MUST re-simulate the rebuilt transaction and MUST reject any credential
whose simulation emits unexpected balance changes.

## Replay Protection

Authorization entry expiration (keyed to ledger sequence) and Stellar
sequence number consumption prevent transaction replay. Servers MUST reject
credentials referencing an expired or already-settled challenge `id`.

## Amount and Asset Verification

Clients MUST decode and verify the challenge `request` before signing.
Clients MUST verify that `amount`, `currency`, and `recipient` match their
expectations prior to authorizing any transfer.

## Simulation Integrity

The simulation requirement in {{verification}} ensures the transaction
behaves as specified. Servers MUST treat any unexpected balance change as a
verification failure, regardless of whether it favors the server or a third
party.

## Fee Exhaustion

Servers offering fee sponsorship are exposed to denial-of-service attacks
where adversaries submit valid-looking credentials that fail on-chain,
causing the server to pay fees without receiving payment. Servers SHOULD
implement rate limiting and MAY require client authentication before
issuing sponsored challenges.

# IANA Considerations {#iana}

## Payment Method Registration

This document registers the following payment method in the "HTTP Payment
Methods" registry established by {{I-D.httpauth-payment}}:

| Method Identifier | Description | Reference |
|-------------------|-------------|-----------|
| `stellar` | Stellar SEP-41 {{SEP-41}} token transfer | This document |

Contact: Stellar Development Foundation (<developers@stellar.org>)

## Payment Intent Registration

This document registers the following payment intent in the "HTTP Payment
Intents" registry established by {{I-D.httpauth-payment}}:

| Intent | Applicable Methods | Description | Reference |
|--------|-------------------|-------------|-----------|
| `charge` | `stellar` | One-time SEP-41 {{SEP-41}} token transfer | This document |

--- back

# ABNF Collected

~~~ abnf
stellar-charge-challenge = "Payment" 1*SP
  "id=" quoted-string ","
  "realm=" quoted-string ","
  "method=" DQUOTE "stellar" DQUOTE ","
  "intent=" DQUOTE "charge" DQUOTE ","
  "request=" base64url-nopad

stellar-charge-credential = "Payment" 1*SP base64url-nopad

; Base64url encoding without padding per RFC 4648 Section 5
base64url-nopad = 1*( ALPHA / DIGIT / "-" / "_" )
~~~

# Examples

## Sponsored Flow

**Challenge:**

~~~http
HTTP/1.1 402 Payment Required
WWW-Authenticate: Payment
  id="kM9xPqWvT2nJrHsY4aDfEb",
  realm="api.example.com",
  method="stellar",
  intent="charge",
  request="eyJhbW91bnQiOiIxMDAwMDAwMCIsImN1cnJlb...",
  expires="2025-02-05T12:05:00Z"
Cache-Control: no-store
~~~

The `request` decodes to:

~~~json
{
  "amount": "10000000",
  "currency": "CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4W",
  "recipient": "GBHEGW3KWOY2OFH767EDALFGCUTBOEVBDQMCKU",
  "methodDetails": {
    "network": "stellar:testnet",
    "feePayer": true
  }
}
~~~

This requests a transfer of 1.0 USDC (10000000 base units, assuming 7
decimal places).

**Credential:**

~~~http
GET /api/resource HTTP/1.1
Host: api.example.com
Authorization: Payment eyJjaGFsbGVuZ2Ui...
~~~

**Receipt:**

~~~json
{
  "method": "stellar",
  "reference": "a1b2c3d4e5f6789012345678901234567890",
  "status": "success",
  "timestamp": "2025-02-05T12:04:32Z"
}
~~~

## Unsponsored Flow

**Challenge:**

~~~http
HTTP/1.1 402 Payment Required
WWW-Authenticate: Payment
  id="pT7yHnKmQ2wErXsZ5vCbNl",
  realm="api.example.com",
  method="stellar",
  intent="charge",
  request="eyJhbW91bnQiOiIxMDAwMDAwMCIsImN1cnJlb...",
  expires="2025-02-05T12:05:00Z"
Cache-Control: no-store
~~~

The `request` decodes to:

~~~json
{
  "amount": "10000000",
  "currency": "CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4W",
  "recipient": "GBHEGW3KWOY2OFH767EDALFGCUTBOEVBDQMCKU",
  "methodDetails": {
    "network": "stellar:testnet",
    "feePayer": false
  }
}
~~~

**Credential:**

~~~http
GET /api/resource HTTP/1.1
Host: api.example.com
Authorization: Payment eyJjaGFsbGVuZ2Ui...
~~~

**Receipt:**

~~~json
{
  "method": "stellar",
  "reference": "b2c3d4e5f6789012345678901234567890ab",
  "status": "success",
  "timestamp": "2025-02-05T12:04:41Z"
}
~~~

# Acknowledgements

The author thanks the Stellar community for their input and
feedback on this specification.
