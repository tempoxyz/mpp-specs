---
title: Tempo Payment Method for HTTP Payment Authentication
abbrev: Tempo Payment Method
docname: draft-tempo-payment-method-00
version: 00
category: info
ipr: trust200902
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

This document defines the "tempo" payment method for use with the Payment
HTTP Authentication Scheme {{I-D.httpauth-payment}}. It specifies how
clients and servers exchange TIP-20 token payments on the Tempo blockchain,
supporting one-time charges, payment authorizations, and recurring subscriptions.

--- middle

# Introduction

The Tempo blockchain is a payments-focused EVM network with native support
for stablecoin transactions, account abstraction, and programmable payment
authorization. This specification defines how Tempo's payment primitives
integrate with the Payment HTTP Authentication Scheme
{{I-D.httpauth-payment}}.

Tempo provides two mechanisms for authorizing payments:

1. **Tempo Transactions**: EIP-2718 type 0x76 transactions with TIP-20
   token operations (`transfer`, `approve`)

2. **Access Keys**: Delegated signing keys with spending limits and expiry


This specification supports three payment intents:

- **charge**: One-time TIP-20 token transfer
- **authorize**: Payment authorization with spending limits
- **subscription**: Recurring payment authorization with periodic limits

## Tempo Payment Flow

The following diagram illustrates the Tempo-specific payment flow:

~~~
   Client                                            Server
      |                                                 |
      |  (1) GET /resource                              |
      |------------------------------------------------>|
      |                                                 |
      |  (2) 402 Payment Required                       |
      |      WWW-Authenticate: Payment method="tempo",  |
      |        intent="charge", request=<base64url>     |
      |<------------------------------------------------|
      |                                                 |
      |  (3) Client signs Tempo Transaction or          |
      |      Key Authorization, or broadcasts tx        |
      |      and obtains hash                           |
      |                                                 |
      |  (4) GET /resource                              |
      |      Authorization: Payment <credential>        |
      |------------------------------------------------>|
      |                                                 |
      |  (5) Server broadcasts transaction or verifies  |
      |      client-broadcast                           |
      |                                                 |
      |  (6) 200 OK                                     |
      |      Payment-Receipt: <receipt with txHash>     |
      |<------------------------------------------------|
      |                                                 |
~~~

## Relationship to the Payment Scheme

This document is a payment method specification as defined in Section 10.1
of {{I-D.httpauth-payment}}. It defines the `request` and `payload`
structures for the `tempo` payment method, along with verification and
settlement procedures.

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
  a per-token spending limit.

2D Nonce
: Tempo's nonce system where each account has multiple independent nonce
  lanes (`nonce_key`), enabling parallel transaction submission.

Fee Payer
: An account that pays transaction fees on behalf of another account.
  Tempo Transactions support fee payment via a separate signature
  domain (`0x78`), allowing the server to pay for fees while the client
  only signs the payment authorization.

# Method Identifier

This specification registers the following payment method identifier:

~~~
tempo
~~~

The identifier is case-sensitive and MUST be lowercase. No sub-methods
are defined by this specification.

# Payment Intents

This specification defines three payment intents for use with the `tempo`
payment method. These intents are registered in the Payment Intent Registry
per Section 13.4 of {{I-D.httpauth-payment}}.

## Intent: "charge"

A one-time payment of the specified amount. The server may submit the
signed transaction any time before the `expires` timestamp.

**Fulfillment mechanisms:**

1. **Tempo Transaction with `transfer`**: The payer signs a Tempo
   Transaction calling `transfer(recipient, amount)` on the specified
   TIP-20 token.

## Intent: "authorize"

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

## Intent: "subscription"

A recurring payment authorization. The payer grants the server permission
to charge a specified amount per period (e.g., daily, weekly, monthly).

**Required parameters:**

- Period duration in seconds
- Maximum amount per period
- Optional: Expiry timestamp

**Fulfillment mechanism:**

- **Access Key with periodic limits**: The payer provisions an access key
  with a recurring spending limit. The limit resets after each period.

Tempo Transactions cannot fulfill subscription intents because ERC-20 style
approvals do not support periodic limit semantics.

# Request Schema

The `request` parameter in the `WWW-Authenticate` challenge contains a
base64url-encoded JSON object. The schema uses shared fields defined by
the intent specifications (charge, authorize, subscription), with
Tempo-specific extensions in the `methodDetails` field.

Clients parse the request and construct the appropriate Tempo Transaction
or Key Authorization to fulfill it. For shared field definitions, see
the corresponding intent specification.

## Charge Request

For `intent="charge"`, the request uses the shared charge schema
(see draft-payment-intent-charge) with the following Tempo-specific
method details:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `methodDetails.chainId` | number | OPTIONAL | Tempo chain ID (default: 42431) |
| `methodDetails.feePayer` | boolean | OPTIONAL | If `true`, server pays transaction fees (default: `false`) |

**Example:**

~~~json
{
  "amount": "1000000",
  "currency": "0x20c0000000000000000000000000000000000001",
  "recipient": "0x742d35Cc6634C0532925a3b844Bc9e7595f8fE00",
  "expires": "2025-01-06T12:00:00Z",
  "methodDetails": {
    "chainId": 42431,
    "feePayer": true
  }
}
~~~

The client fulfills this by signing a Tempo Transaction with
`transfer(recipient, amount)` on the specified `currency` (token address),
with `validBefore` set to `expires`. The client SHOULD use a dedicated
`nonceKey` (2D nonce lane) for payment transactions to avoid blocking
other account activity if the transaction is not immediately settled.

If `methodDetails.feePayer` is `true`, the client signs with
`fee_payer_signature` set to `0x00` and `fee_token` empty, allowing the
server to sponsor fees. If `feePayer` is `false` or omitted, the client
MUST set `fee_token` and pay fees themselves.

## Authorize Request

For `intent="authorize"`, the request uses the shared authorize schema
(see draft-payment-intent-authorize) with the following Tempo-specific
method details:

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
    "feePayer": true
  }
}
~~~

The client fulfills this by either:

1. Signing a Tempo Transaction with `approve(recipient, amount)` on the
   specified `currency` (token address), with `validBefore` set to `expires`
   and optionally `validAfter` set to `methodDetails.validFrom`. The
   `recipient` field MUST be present in the request when using transaction
   fulfillment. The client SHOULD use a dedicated `nonceKey` (2D nonce lane)
   for payment transactions.
2. Signing a Key Authorization with expiry = `expires` and a spending limit
   = `amount` for the specified token

If `methodDetails.feePayer` is `true`, the client signs with
`fee_payer_signature` set to `0x00` and `fee_token` empty. If `feePayer`
is `false` or omitted, the client MUST NOT sign a key authorization; the
client MUST sign a transaction with `fee_token` set to pay fees themselves.

## Subscription Request

For `intent="subscription"`, the request uses the shared subscription
schema (see draft-payment-intent-subscription) with the following
Tempo-specific method details:

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
    "chainId": 42431
  }
}
~~~

The `period` value `"month"` represents approximately 30 days (2592000 seconds).
Explicit seconds may also be specified as a string (e.g., `"2592000"`).

The client fulfills this by signing a Key Authorization with:
- Expiry = `expires`
- Periodic spending limit = `amount` per `period` for the specified `asset`

Tempo Transactions cannot fulfill subscription intents because ERC-20 style
approvals do not support periodic limit semantics.

# Credential Schema

The credential in the `Authorization` header contains a base64url-encoded
JSON object per Section 5.2 of {{I-D.httpauth-payment}}.

## Credential Structure

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | REQUIRED | Challenge ID from the server's `WWW-Authenticate` header |
| `payload` | object | REQUIRED | Tempo-specific payload object |
| `source` | string | OPTIONAL | Payer identifier as a DID (e.g., `did:pkh:eip155:42431:0x...`) |

The `source` field, if present, SHOULD use the `did:pkh` method with the
Tempo chain ID (42431 for Moderato testnet) and the payer's
Ethereum address.

## Payload Structure

The `payload` object contains:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `hash` | string | CONDITIONAL | Transaction hash (required for `hash` type) |
| `signature` | string | CONDITIONAL | Hex-encoded RLP-serialized signed data (required for `transaction` and `keyAuthorization`) |
| `type` | string | REQUIRED | Fulfillment type: `"transaction"`, `"keyAuthorization"`, or `"hash"` |

Either `signature` or `hash` MUST be present, depending on the `type`.

## Transaction Payload

When `type` is `"transaction"`, `signature` contains the complete signed
Tempo Transaction (type 0x76) serialized as RLP and hex-encoded with
`0x` prefix. The transaction MUST contain the appropriate TIP-20 call:

- For `charge`: `transfer(recipient, amount)`
- For `authorize`: `approve(spender, amount)`

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

## Key Authorization Payload

When `type` is `"keyAuthorization"`, `signature` contains the complete signed
Key Authorization serialized as RLP and hex-encoded with `0x` prefix. The
authorization is signed by the root account and grants the access key
permission to sign transactions on its behalf.

**Example:**

~~~json
{
  "challenge": {
    "id": "kM9xPqWvT2nJrHsY4aDfEb",
    "realm": "api.example.com",
    "method": "tempo",
    "intent": "subscription",
    "request": "eyJ...",
    "expires": "2025-02-05T12:05:00Z"
  },
  "payload": {
    "signature": "0xf8...signed authorization bytes...",
    "type": "keyAuthorization"
  }
}
~~~

## Hash Payload

When `type` is `"hash"`, the client has already broadcast the transaction
to the Tempo network. The `hash` field contains the transaction hash for
the server to verify onchain. This allows clients who prefer to manage
their own transaction submission (e.g., for gas management or privacy
reasons) to still use the Payment scheme.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `hash` | string | REQUIRED | Transaction hash with `0x` prefix |
| `type` | string | REQUIRED | `"hash"` |

**Applicable intents:**

- `charge`: The hash references a `transfer` transaction
- `authorize`: The hash references an `approve` transaction

Note: `subscription` intent cannot use hash payloads because it requires
a key authorization, not a transaction.

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

# Verification Procedure

Servers MUST verify credentials before granting access or initiating
settlement.

## Credential Verification

For all credentials:

1. Decode the base64url credential and parse as JSON
2. Verify `id` matches a valid, unexpired, unused challenge
3. Verify `type` is `"transaction"`, `"keyAuthorization"`, or `"hash"`
4. For `transaction` and `keyAuthorization`: decode the hex-encoded `signature` field
5. For `hash`: validate the `hash` field format (66 hex characters with `0x` prefix)

## Payload Verification

For `type="transaction"`, servers MUST deserialize and verify the Tempo
Transaction per {{TEMPO-TX-SPEC}}.

For `type="keyAuthorization"`, servers MUST deserialize and verify the
Key Authorization per {{TEMPO-TX-SPEC}}.

For `type="hash"`, servers MUST verify the transaction onchain per
{{hash-verification}}.

Servers SHOULD additionally verify that the transaction or authorization
parameters match the original request (asset, amount, destination, expiry).

## Hash Verification {#hash-verification}

For `type="hash"`, servers MUST verify the transaction onchain:

1. Call `eth_getTransactionReceipt(hash)` to retrieve the transaction receipt
2. Verify the transaction status is `1` (success)
3. Verify the transaction `chainId` matches the expected chain ID
4. Parse the transaction receipt logs to verify the operation matches the intent:
   - For `charge`: verify a `Transfer(from, to, amount)` event on the correct
     asset with the expected `to` (destination) and `amount`
   - For `authorize`: verify an `Approval(owner, spender, amount)` event on
     the correct asset with the expected `spender` and `amount`
5. Verify the `from` address matches the expected payer (if `source` is provided)
6. Verify the transaction block timestamp is within the challenge validity window
7. For `authorize` intent, servers SHOULD verify the payer's token balance is
   sufficient for expected future charges

If the transaction is not yet confirmed (receipt not available), servers
SHOULD return `202 Accepted` with a `Retry-After` header.
Servers MAY poll up to a reasonable timeout (e.g., 30 seconds) before responding.

# Settlement Procedure

Settlement converts a verified credential into actual token transfer.

## Fee Payment

When a request includes `feePayer: true`, the server commits to paying
transaction fees on behalf of the client. This allows clients to complete
payments without holding fee tokens.

### Server-Paid Fees

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

### Client-Paid Fees

When `feePayer: false` or omitted, the client MUST set `fee_token` to a
valid USD TIP-20 token address and pay fees themselves. The server
broadcasts the transaction as-is without adding a fee payer signature.

### Server Requirements

When acting as fee payer, servers:

- MUST maintain sufficient balance of a USD TIP-20 token to pay
  transaction fees
- MAY use any USD-denominated TIP-20 token with sufficient AMM
  liquidity as the fee token
- MAY recover fee costs through pricing or other business logic

### Client Requirements

- When `feePayer: true`: Clients MUST sign with `fee_payer_signature` set
  to `0x00` and `fee_token` empty or `0x80` (RLP null)
- When `feePayer: false` or omitted: Clients MUST set `fee_token` to a
  valid USD TIP-20 token and have sufficient balance to pay fees

## Charge Settlement (Transaction)

For `intent="charge"` fulfilled via transaction, the client signs a
transaction containing the `transfer` call. If `feePayer: true`, the server
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
      |      Payment-Receipt: <txHash> |                                |
      |<-------------------------------|                                |
      |                                |                                |
~~~

1. Client submits credential containing signed `transfer` transaction
2. If `feePayer: true`, server adds fee sponsorship (signs with `0x78` domain)
3. Server broadcasts transaction to Tempo
4. Transaction included in block with immediate finality (~500ms)
5. Server returns receipt with transaction hash

## Subscription Settlement (Key Authorization)

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

## Authorize Settlement (Transaction)

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

## Authorize Settlement (Key Authorization)

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

## Hash Settlement

For credentials with `type="hash"`, the client has already broadcast
the transaction. The server verifies the transaction onchain rather
than broadcasting it:

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
      |      <txHash>               |                             |
      |<--------------------------  |                             |
      |                             |                             |
~~~

1. Client constructs and broadcasts transaction directly to Tempo
2. Client waits for transaction confirmation (optional but recommended)
3. Client submits credential with the transaction hash
4. Server queries the transaction receipt from Tempo
5. Server verifies the receipt confirms successful execution
6. Server verifies receipt matches the original request
7. Server returns receipt (payment confirmed)

This flow is useful when:
- The client wants to control transaction timing or gas settings
- The client is using a wallet that handles broadcasting internally

**Limitations:**
- Cannot be used with `feePayer: true` (client must pay their own fees)
- Cannot be used for `subscription` intent (requires key authorization)
- Server cannot modify or enhance the transaction

## Receipt Generation

Upon successful settlement, servers MUST return a `Payment-Receipt` header
per Section 5.3 of {{I-D.httpauth-payment}}.

The receipt payload for Tempo:

| Field | Type | Description |
|-------|------|-------------|
| `method` | string | `"tempo"` |
| `reference` | string | Transaction hash of the settlement transaction |
| `status` | string | `"success"` or `"failed"` |
| `timestamp` | string | ISO 8601 settlement time |

**Example receipt payload:**

~~~json
{
  "method": "tempo",
  "reference": "0x1234567890abcdef...",
  "status": "success",
  "timestamp": "2026-01-06T12:00:00Z"
}
~~~

# Internationalization Considerations

## Address Encoding

All Ethereum addresses in request and payload structures MUST be encoded
as hexadecimal strings with `0x` prefix. Addresses are case-insensitive
per {{EIP-55}}, but implementations SHOULD use checksummed addresses for
display purposes.

# Security Considerations

## Transaction Replay

Tempo Transactions include chain ID, nonce, and optional `validBefore`/
`validAfter` timestamps that prevent replay attacks:

- Chain ID binding prevents cross-chain replay
- Nonce consumption prevents same-chain replay
- Validity windows limit temporal replay windows

## Access Key Security

Access keys present additional security considerations:

**Short Expiry for Charges**: Access keys used for `charge` intent MUST
have expiry within 5 minutes to minimize exposure window. Servers MUST
reject access keys with longer expiry for charge intents.

**Destination Scoping**: For `authorize` and `subscription` intents, clients
SHOULD include destination restrictions to limit the addresses the key
can transfer to. This prevents key compromise from enabling transfers to
attacker-controlled addresses.

**Spending Limits**: Access key spending limits are enforced by the
AccountKeychain precompile onchain. Servers cannot exceed the authorized
limits even if compromised.

**Key Revocation**: Users can revoke access keys at any time via the
AccountKeychain precompile. Servers SHOULD handle revocation gracefully
by requesting new authorization.

## Amount Verification

Clients MUST parse and verify the `request` payload before signing:

1. Verify `amount` is reasonable for the service
2. Verify `token` is the expected token address
3. Verify `recipient` is controlled by the expected party
4. For `authorize`: verify `expiry` is not unreasonably far in the future
5. For `subscription`: verify `period` and `amount` match expectations

## Source Verification

If a credential includes the optional `source` field (a DID identifying the
payer), servers MUST NOT trust this value without verification. The `source`
field is client-provided metadata and could be forged.

Servers MUST verify the payer identity by:

- For `type="transaction"`: Recovering the signer address from the
  transaction signature using standard ECDSA recovery
- For `type="keyAuthorization"`: Deriving the address from the `publicKey`
  field in the key authorization
- For `type="hash"`: Retrieving the `from` address from the transaction
  receipt onchain

If `source` is present, servers SHOULD verify that the recovered/retrieved
address matches the address in the DID (e.g., for `did:pkh:eip155:42431:0xABC...`,
verify the address equals `0xABC...`). Servers MUST reject credentials where
the `source` does not match the payer address.

## Server-Paid Fees

Servers acting as fee payers accept financial risk in exchange for
providing a seamless payment experience.

**Denial of Service**: Malicious clients could submit valid-looking
credentials that fail onchain, causing the server to pay fees without
receiving payment. Servers SHOULD implement rate limiting and MAY require
client authentication before accepting payment credentials.

**Fee Token Exhaustion**: Servers MUST monitor their fee token balance
and reject new payment requests when balance is insufficient. Servers
SHOULD alert operators when fee token balance falls below a threshold.

# IANA Considerations

## Payment Method Registration

This document registers the following payment method in the "HTTP Payment
Methods" registry established by {{I-D.httpauth-payment}}:

- **Method Identifier**: `tempo`
- **Description**: Tempo Network TIP-20 token payments
- **Reference**: This document
- **Contact**: jake@tempo.xyz

## Payment Intent Registrations

This document registers the following payment intents in the "HTTP Payment
Intents" registry established by {{I-D.httpauth-payment}}:

| Intent | Applicable Methods | Description | Reference |
|--------|-------------------|-------------|-----------|
| `charge` | `tempo` | One-time TIP-20 transfer | This document, Section 5.1 |
| `authorize` | `tempo` | Payment authorization | This document, Section 5.2 |
| `subscription` | `tempo` | Recurring payment authorization | This document, Section 5.3 |

Note: `charge` is already registered as a base intent by
{{I-D.httpauth-payment}}. This document extends its definition for
the `tempo` method.

--- back

# ABNF Collected

This appendix collects the ABNF grammar for Tempo payment method
structures.

~~~abnf
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
payload-members = ( signature-payload / hash-payload )

; Signature-based payload (transaction or keyAuthorization)
signature-payload = payload-type-sig "," payload-signature
payload-type-sig = %s"type" ":" ( %s"\"transaction\"" / %s"\"keyAuthorization\"" )
payload-signature = %s"signature" ":" hex-string

; Hash-based payload (client-broadcast)
hash-payload = payload-type-hash "," payload-hash
payload-type-hash = %s"type" ":" %s"\"hash\""
payload-hash = %s"hash" ":" tx-hash

; Primitives
eth-address = DQUOTE "0x" 40HEXDIG DQUOTE
tx-hash = DQUOTE "0x" 64HEXDIG DQUOTE
hex-string = DQUOTE "0x" *HEXDIG DQUOTE
number-string = DQUOTE 1*DIGIT DQUOTE
quoted-string = DQUOTE *VCHAR DQUOTE
~~~

# Examples

The examples in this appendix use alphaUSD (`0x20c0000000000000000000000000000000000001`)
as an illustrative TIP-20 asset. This is not a real token address.

## Charge

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

**Challenge:**

~~~http
HTTP/1.1 402 Payment Required
WWW-Authenticate: Payment id="kM9xPqWvT2nJrHsY4aDfEb",
  realm="api.example.com",
  method="tempo",
  intent="charge",
  request="eyJhbW91bnQiOiIxMDAwMDAwIiwiYXNzZXQiOiIweDIwYzAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAiLCJkZXN0aW5hdGlvbiI6IjB4NzQyZDM1Q2M2NjM0QzA1MzI5MjVhM2I4NDRCYzllNzU5NWY4ZkUwMCIsImV4cGlyZXMiOiIyMDI1LTAxLTA2VDEyOjAwOjAwWiJ9"
~~~

The `request` decodes to:

~~~json
{
  "amount": "1000000",
  "currency": "0x20c0000000000000000000000000000000000001",
  "recipient": "0x742d35Cc6634C0532925a3b844Bc9e7595f8fE00",
  "expires": "2025-01-06T12:00:00Z",
  "methodDetails": {
    "chainId": 42431
  }
}
~~~

This requests a transfer of 1.00 alphaUSD (1000000 base units).

**Credential (Signed Transaction):**

~~~http
GET /api/resource HTTP/1.1
Host: api.example.com
Authorization: Payment eyJpZCI6ImtNOXhQcVd2VDJuSnJIc1k0YURmRWIiLCJ0eXBlIjoidHJhbnNhY3Rpb24iLCJwYXlsb2FkIjoiMHg3NmY5MDEuLi4ifQ
~~~

The credential decodes to:

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

The client constructs a Tempo Transaction calling `transfer(recipient, amount)`
on the token, fills in `nonce`, `nonceKey`, and `signature`, then RLP-serializes.

**Credential (Transaction Hash):**

Alternatively, the client can broadcast the transaction themselves and submit
the hash:

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

The client constructs and broadcasts the `transfer` transaction to Tempo,
waits for confirmation, then submits the transaction hash. The server
verifies the transaction onchain matches the request parameters.

**Response with receipt:**

~~~http
HTTP/1.1 200 OK
Payment-Receipt: eyJtZXRob2QiOiJ0ZW1wbyIsInR4SGFzaCI6IjB4MTIzNDU2Nzg5MGFiY2RlZi4uLiIsImJsb2NrTnVtYmVyIjoxMjM0NTY3OCwiYW1vdW50IjoiMTAwMDAwMCJ9
Content-Type: application/json

{ "data": "..." }
~~~

## Authorize

~~~
   Client                        Server                     Tempo Network
      |                             |                             |
      |  (1) GET /api/resource      |                             |
      |-------------------------->  |                             |
      |                             |                             |
      |  (2) 402 Payment Required   |                             |
      |      intent="authorize"       |                             |
      |<--------------------------  |                             |
      |                             |                             |
      |  (3) Sign keyAuthorization  |                             |
      |                             |                             |
      |  (4) Authorization: Payment |                             |
      |-------------------------->  |                             |
      |                             |  (5) Store keyAuth          |
      |  (6) 200 OK (approved)      |                             |
      |<--------------------------  |                             |
      |                             |                             |
      |         ... later ...       |                             |
      |                             |  (7) Charge with keyAuth    |
      |                             |-------------------------->  |
      |                             |  (8) Transfer complete      |
      |                             |<--------------------------  |
      |                             |                             |
~~~

**Challenge:**

~~~http
HTTP/1.1 402 Payment Required
WWW-Authenticate: Payment id="nR5tYuLpS8mWvXzQ1eCgHj",
  realm="api.example.com",
  method="tempo",
  intent="authorize",
  request="eyJhc3NldCI6IjB4MjBjMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMCIsImV4cGlyZXMiOiIyMDI1LTAyLTA1VDEyOjAwOjAwWiIsImxpbWl0IjoiNTAwMDAwMDAifQ"
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

**Credential (via Transaction):**

Alternatively, when the request includes a `recipient` field, the client
may fulfill the approval using a Tempo Transaction with an `approve` call:

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

**Credential (via Transaction Hash):**

The client can also broadcast an `approve` transaction themselves:

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

The client constructs and broadcasts an `approve(destination, limit)` transaction
to Tempo, then submits the hash. The server verifies the approval was registered
onchain before granting access.

## Subscription

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

**Challenge:**

~~~http
HTTP/1.1 402 Payment Required
WWW-Authenticate: Payment id="qT8wErYuI3oPlKjH6gFdSa",
  realm="api.example.com",
  method="tempo",
  intent="subscription",
  request="eyJhbW91bnQiOiIxMDAwMDAwMCIsImFzc2V0IjoiMHgyMGMwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwIiwiZXhwaXJlcyI6IjIwMjYtMDEtMDZUMDA6MDA6MDBaIiwicGVyaW9kIjoiMjU5MjAwMCJ9"
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

This requests a subscription for 10.00 alphaUSD (10000000 base units) per
month.

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
  }
}
~~~

Note: Periodic limit enforcement for subscriptions is configured when
registering the key with the AccountKeychain precompile.

# Acknowledgements

The authors thank the Tempo community for their feedback on this
specification.


