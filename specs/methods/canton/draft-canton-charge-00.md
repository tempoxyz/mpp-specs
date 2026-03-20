---
title: Canton charge Intent for HTTP Payment Authentication
abbrev: Canton Charge
docname: draft-canton-charge-00
version: 00
category: info
ipr: noModificationTrust200902
submissiontype: IETF
consensus: true

author:
  - name: Anil Karacay
    ins: A. Karacay
    email: anil@cayvox.com
    organization: Cayvox Labs

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
  CIP-56:
    title: "Canton Improvement Proposal 56: Token Standard"
    target: https://canton.network
    author:
      - org: Digital Asset
  CANTON-JSON-API:
    title: "Canton JSON Ledger API v2 Reference"
    target: https://docs.digitalasset.com/build/3.5
    author:
      - org: Digital Asset
  CIRCLE-XRESERVE:
    title: "Circle xReserve — USDCx on Canton Network"
    target: https://www.circle.com
    author:
      - org: Circle
---

--- abstract

This document defines the "charge" intent for the "canton" payment method
in the Payment HTTP Authentication Scheme {{I-D.httpauth-payment}}. It
specifies how clients and servers exchange one-time USDCx token transfers
on Canton Network using the CIP-56 TransferFactory mechanism.

Canton Network is the institutional blockchain operated by Digital Asset,
with participants including DTCC, Goldman Sachs, JPMorgan, and BNP Paribas.
Canton provides sub-transaction privacy — payment details are only visible
to the sender and receiver.

--- middle

# Introduction

The `charge` intent represents a one-time payment of a specified amount
in USDCx (Circle's USDC-backed stablecoin on Canton). The client executes
a CIP-56 TransferFactory.Transfer on the Canton ledger, then presents the
transaction reference as a credential.

This specification defines the request schema, credential formats, and
settlement procedures for charge transactions on Canton Network.

## Charge Flow

~~~
   Client                        Server                  Canton Network
      |                             |                          |
      |  (1) GET /api/resource      |                          |
      |-------------------------->  |                          |
      |                             |                          |
      |  (2) 402 Payment Required   |                          |
      |      intent="charge"        |                          |
      |      method="canton"        |                          |
      |<--------------------------  |                          |
      |                             |                          |
      |  (3) TransferFactory.Transfer                          |
      |-----------------------------------------------------> |
      |  (4) { updateId, offset }                              |
      |<----------------------------------------------------- |
      |                             |                          |
      |  (5) Authorization: Payment |                          |
      |      (updateId credential)  |                          |
      |-------------------------->  |                          |
      |                             |  (6) GET /v2/updates/{id}|
      |                             |------------------------> |
      |                             |  (7) Transaction details |
      |                             |<------------------------ |
      |  (8) 200 OK + Receipt       |                          |
      |<--------------------------  |                          |
~~~

Unlike EVM-based methods where the client signs a transaction for the
server to broadcast, Canton's model has the client submit the transaction
directly to the ledger. The server then verifies the committed transaction
by its update ID. This is possible because Canton provides deterministic
finality — once committed, transactions cannot be reversed.

## Relationship to the Payment Scheme

This document is a payment method specification as defined in Section 9.1
of {{I-D.httpauth-payment}}. It defines the `request` and `payload`
structures for the "canton" payment method.

# Requirements Language

{::boilerplate bcp14-tagged}

# Terminology

Canton Network
: The institutional blockchain operated by Digital Asset, providing
  sub-transaction privacy and deterministic finality. Participants include
  DTCC, Goldman Sachs, JPMorgan, and BNP Paribas.

Party ID
: Canton identity in the format `DisplayName::hex-fingerprint`, where
  the fingerprint is derived from the party's key pair. Example:
  `Alice::122084768362d0ce21f1ffec870e55e365a292cdf8f54c5c38ad7775b9bdd462e141`.

CIP-56
: Canton Improvement Proposal 56, the token standard defining Holding
  contracts, TransferFactory, TransferPreapproval, and TransferInstruction
  interfaces for fungible token operations.

USDCx
: Circle's USDC-backed stablecoin on Canton Network, deployed via
  xReserve {{CIRCLE-XRESERVE}}. 1:1 backed by USDC on Ethereum.
  Uses up to 10 decimal places (Numeric 10) on-chain.

TransferPreapproval
: A CIP-56 contract that pre-authorizes incoming transfers to a party.
  When active, senders can execute 1-step transfers via TransferFactory
  without per-transaction receiver approval. REQUIRED for MPP recipients.

Canton Coin (CC)
: The native utility token of Canton Network, used for validator traffic
  budgets. Not used directly in MPP payments but consumed as network fees.

JSON Ledger API v2
: Canton's HTTP API for ledger interactions {{CANTON-JSON-API}}.
  Default port 7575. All command submission and state queries use this API.

# Request Schema

The `request` parameter in the `WWW-Authenticate` challenge contains a
base64url-encoded JSON object. The JSON MUST be serialized using JSON
Canonicalization Scheme (JCS) {{RFC8785}} before base64url encoding,
per {{I-D.httpauth-payment}}.

## Shared Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `amount` | string | REQUIRED | Amount as a decimal string, up to 10 decimal places |
| `currency` | string | REQUIRED | `"USDCx"` or `"CC"` |
| `recipient` | string | REQUIRED | Recipient Canton party ID |
| `description` | string | OPTIONAL | Human-readable payment description |
| `externalId` | string | OPTIONAL | Merchant reference identifier |

Challenge expiry is conveyed by the `expires` auth-param in
`WWW-Authenticate` per {{I-D.httpauth-payment}}.

## Method Details

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `methodDetails.network` | string | REQUIRED | `"mainnet"`, `"testnet"`, or `"devnet"` |
| `methodDetails.ledgerUrl` | string | OPTIONAL | Canton JSON Ledger API endpoint |

**Example:**

~~~json
{
  "amount": "0.003000",
  "currency": "USDCx",
  "recipient": "Gateway::122084768362d0ce21f1ffec870e55e365a292cdf8f54c5c38ad7775b9bdd462e141",
  "description": "GPT-4o chat completion",
  "methodDetails": {
    "network": "mainnet"
  }
}
~~~

The client fulfills this by executing a CIP-56 TransferFactory.Transfer
on the Canton ledger. The recipient MUST have an active TransferPreapproval
contract for 1-step transfers to succeed.

## Amount Handling

All amounts MUST be represented as strings. Implementations MUST NOT use
floating-point arithmetic for amount comparison or calculation. Canton
uses Numeric 10 (10 decimal places) internally. Comparison MUST normalize
both values to the same decimal precision before lexicographic comparison.

# Credential Schema

The credential in the `Authorization` header contains a base64url-encoded
JSON object per {{I-D.httpauth-payment}}.

## Credential Structure

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `challenge` | object | REQUIRED | Echo of the challenge from the server |
| `payload` | object | REQUIRED | Canton-specific payload object |
| `source` | string | OPTIONAL | Payer identifier as Canton party ID |

## Payload

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `updateId` | string | REQUIRED | Canton transaction update ID |
| `completionOffset` | string | REQUIRED | Ledger offset at completion |
| `sender` | string | REQUIRED | Sender Canton party ID |
| `commandId` | string | REQUIRED | UUID v4 idempotency key |

**Example:**

~~~json
{
  "challenge": {
    "id": "kM9xPqWvT2nJrHsY4aDfEb",
    "realm": "mpp.caypo.xyz",
    "method": "canton",
    "intent": "charge",
    "request": "eyJ...",
    "expires": "2026-03-20T12:05:00Z"
  },
  "payload": {
    "updateId": "20260320142350001:0",
    "completionOffset": "1479200",
    "sender": "Agent::122084768362d0ce21f1ffec870e55e365a292cdf8f54c5c38ad7775b9bdd462e141",
    "commandId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
  },
  "source": "Agent::122084768362d0ce21f1ffec870e55e365a292cdf8f54c5c38ad7775b9bdd462e141"
}
~~~

# Settlement Procedure

Settlement on Canton is client-initiated. The client executes the transfer
on the ledger before presenting the credential to the server.

## Client Steps

1. Parse the `WWW-Authenticate` challenge and decode the `request` field.

2. Validate that `methodDetails.network` matches the client's configured
   Canton network. If mismatched, abort with an error.

3. Query the client's USDCx Holding contracts via
   `POST /v2/state/active-contracts` on the Canton JSON Ledger API,
   filtering by the CIP-56 Holding template.

4. Select holdings that cover the required `amount`. Prefer a single
   holding >= amount (smallest sufficient). If none, accumulate multiple
   holdings in descending order.

5. Generate a unique `commandId` using UUID v4.

6. Execute `TransferFactory.Transfer` via
   `POST /v2/commands/submit-and-wait`:

~~~json
{
  "commands": [{
    "ExerciseCommand": {
      "templateId": "Splice.Api.Token.TransferFactoryV1:TransferFactory",
      "contractId": "<selected-holding-contract-id>",
      "choice": "TransferFactory_Transfer",
      "choiceArgument": {
        "sender": "<client-party-id>",
        "receiver": "<recipient-from-challenge>",
        "amount": "<amount-from-challenge>",
        "instrumentId": "USDCx",
        "inputHoldingCids": ["<holding-contract-ids>"],
        "meta": {}
      }
    }
  }],
  "userId": "<ledger-api-user>",
  "commandId": "<uuid>",
  "actAs": ["<client-party-id>"]
}
~~~

7. Extract `updateId` and `completionOffset` from the response.

8. Construct the credential payload, base64url-encode per
   {{I-D.httpauth-payment}}, and attach to the `Authorization` header.

## Settlement Timing

Settlement is immediate. Canton provides deterministic finality — the
transfer is committed atomically before the client receives the response.
No confirmation wait is required.

## Finality

Canton transactions are final upon commitment. There are no block
reorganizations, probabilistic finality windows, or pending states.
Once `submit-and-wait` returns successfully, the transfer is irrevocable.

# Verification Procedure

Servers MUST perform the following verification steps:

1. Decode the credential and extract the `payload` object.

2. Verify `methodDetails.network` matches the server's configured network.

3. Verify `recipient` matches the server's own Canton party ID.

4. Fetch the transaction via `GET /v2/updates/transaction-by-id/{updateId}`
   on the Canton JSON Ledger API.

5. In the transaction events, locate a `CreatedEvent` where the Holding
   contract's signatories or witnessParties include the server's party ID.

6. Verify the created Holding's `amount` >= the challenged `amount`.
   Comparison MUST use string-based decimal arithmetic (no floating point).

7. Locate an `ExercisedEvent` where `actingParties` includes the
   credential's `sender` field.

8. If all checks pass, return the response with a `Payment-Receipt` header.

## Error Handling

If any verification step fails, the server MUST return HTTP 402 with a
JSON error body:

| Condition | MPP Problem Type | Description |
|-----------|-----------------|-------------|
| Network mismatch | `method_unsupported` | Client/server network differs |
| Recipient mismatch | `verification_failed` | Wrong recipient party |
| Transaction not found | `verification_failed` | updateId not on ledger |
| Insufficient amount | `insufficient_amount` | Transfer < challenged amount |
| Sender mismatch | `verification_failed` | Sender doesn't match payload |
| Holdings insufficient | `insufficient_funds` | Client lacks USDCx balance |

# Security Considerations

## Transport Security

All communication between client and server MUST use TLS 1.2 or higher.
Canton credentials MUST only be transmitted over HTTPS connections.

## Sub-Transaction Privacy

Canton provides sub-transaction privacy. Payment details including amount,
sender, and receiver are only visible to the transaction participants.
Third parties, including other Canton participants and validators, cannot
observe payment amounts or counterparty identities.

## Replay Protection

Each payment uses a unique `commandId` (UUID v4). Canton enforces command
deduplication at the participant level — submitting the same `commandId`
twice results in an `ALREADY_EXISTS` error. This prevents replay attacks
without requiring server-side nonce tracking.

## TransferPreapproval Requirement

For MPP flows, the recipient (server) MUST maintain an active
`TransferPreapproval` contract. Without it, transfers require a 2-step
process (TransferInstruction + Accept) which is incompatible with
synchronous MPP settlement. TransferPreapproval contracts require annual
renewal.

## Amount Precision

Canton uses Numeric 10 (10 decimal places). USDCx has 6 meaningful
decimal places but the on-chain representation may use up to 10.
Implementations MUST NOT use floating-point types for amount handling.

## Party ID Verification

Canton party IDs contain a cryptographic fingerprint derived from the
party's key pair. Servers SHOULD verify that the `sender` field in the
credential matches a party ID that the client is authorized to act as.

# IANA Considerations

## Payment Method Registration

This specification registers the "canton" payment method in the Payment
Method Registry per Section 12.3 of {{I-D.httpauth-payment}}:

| Field | Value |
|-------|-------|
| Method Identifier | `canton` |
| Description | Canton Network CIP-56 USDCx transfers |
| Reference | This document |
| Contact | anil@cayvox.com |

--- back

# Examples

## Charge Example

**Challenge:**

~~~http
HTTP/1.1 402 Payment Required
WWW-Authenticate: Payment id="kM9xPqWvT2nJrHsY4aDfEb",
  realm="mpp.caypo.xyz",
  method="canton",
  intent="charge",
  request="eyJhbW91bnQiOiIwLjAwMyIsImN1cnJlbmN5IjoiVVNEQ3giLC...",
  expires="2026-03-20T12:05:00Z"
~~~

**Credential:**

~~~http
GET /openai/v1/chat/completions HTTP/1.1
Host: mpp.caypo.xyz
Authorization: Payment eyJjaGFsbGVuZ2UiOnsiaWQiOiJrTTl4UHFX...
~~~

**Response:**

~~~http
HTTP/1.1 200 OK
Payment-Receipt: eyJtZXRob2QiOiJjYW50b24iLCJyZWZlcmVuY2Ui...
Content-Type: application/json

{"model":"gpt-4o","choices":[{"message":{"content":"Hello!"}}]}
~~~

# Reference Implementation

A complete reference implementation is available:

- npm: `@caypo/mpp-canton` v0.2.0 (https://www.npmjs.com/package/@caypo/mpp-canton)
- Source: https://github.com/anilkaracay/Caypo
- Gateway: https://mpp.caypo.xyz (17 services, 46 endpoints)
- Tests: 312 passing, 14 E2E on Canton DevNet (Splice v0.5.12)
- Docs: https://caypo.xyz/docs

# Authors' Addresses

Anil Karacay
Cayvox Labs
Email: anil@cayvox.com
