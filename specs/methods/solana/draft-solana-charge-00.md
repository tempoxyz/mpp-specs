---
title: Solana Charge Intent for HTTP Payment Authentication
abbrev: Solana Charge
docname: draft-solana-charge-00
version: 00
category: info
ipr: trust200902
submissiontype: independent
consensus: false

author:
  - name: Ludo Galabru
    ins: L. Galabru
    email: ludo.galabru@solana.org
    org: Solana Foundation

  - name: Ilan Gitter
    ins: I. Gitter
    email: ilan.gitter@solana.org
    org: Solana Foundation

normative:
  RFC2119:
  RFC3339:
  RFC4648:
  RFC8174:
  RFC8259:
  RFC8785:
  RFC9457:
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
  SOLANA-DOCS:
    title: "Solana Documentation"
    target: https://solana.com/docs
    author:
      - org: Solana Foundation
    date: 2026
  SPL-TOKEN:
    title: "SPL Token Program"
    target: https://solana.com/docs/tokens
    author:
      - org: Solana Foundation
    date: 2026
  SPL-TOKEN-2022:
    title: "SPL Token-2022 Program"
    target: https://solana.com/docs/tokens/extensions 
    author:
      - org: Solana Foundation
    date: 2026
  BASE58:
    title: "Base58 Encoding Scheme"
    target: https://datatracker.ietf.org/doc/html/draft-msporny-base58-03
    author:
      - name: Manu Sporny
    date: 2026
---

--- abstract

This document defines the "charge" intent for the "solana" payment
method within the Payment HTTP Authentication Scheme
{{I-D.httpauth-payment}}. The client constructs and signs a native SOL
or SPL token transfer on the Solana blockchain; the server verifies the
payment and presents the transaction signature as proof of payment.

Two credential types are supported: `type="transaction"` (default),
where the client sends the signed transaction to the server for
broadcast, and `type="signature"` (fallback), where the client
broadcasts the transaction itself and presents the on-chain transaction
signature for server verification.

--- middle

# Introduction

HTTP Payment Authentication {{I-D.httpauth-payment}} defines a
challenge-response mechanism that gates access to resources behind
payments. This document registers the "charge" intent for the
"solana" payment method.

Solana is a high-throughput blockchain with sub-second finality
and low transaction fees {{SOLANA-DOCS}}. This specification
supports payments in both native SOL and SPL tokens (including
Token-2022 {{SPL-TOKEN-2022}}), making it suitable for
micropayment use cases where fast confirmation and low overhead
are important.

## Server-Broadcast Flow (Default)

The default flow uses `type="transaction"` credentials. The client
signs the transaction and sends it to the server, which broadcasts
it to the Solana network:

~~~
   Client                     Server              Solana Network
      |                          |                        |
      |  (1) GET /resource       |                        |
      |----------------------->  |                        |
      |                          |                        |
      |  (2) 402 Payment Required|                        |
      |      (recipient, amount, |                        |
      |       feePayerKey?)      |                        |
      |<-----------------------  |                        |
      |                          |                        |
      |  (3) Build tx, set fee   |                        |
      |      payer, sign         |                        |
      |                          |                        |
      |  (4) Authorization:      |                        |
      |      Payment <credential>|                        |
      |      (signed tx bytes)   |                        |
      |----------------------->  |                        |
      |                          |  (5) Co-sign (if fee   |
      |                          |      payer) + send     |
      |                          |----------------------> |
      |                          |  (6) Confirmation      |
      |                          |<---------------------- |
      |                          |                        |
      |  (7) 200 OK + Receipt    |                        |
      |<-----------------------  |                        |
      |                          |                        |
~~~

In this model the server controls transaction broadcast, enabling
fee sponsorship ({{fee-sponsorship}}) and server-side retry logic.
When `feePayer` is `true`, the challenge includes `feePayerKey`
so the client sets the server as fee payer. The server co-signs
with its fee payer key before broadcasting.

## Client-Broadcast Flow (Fallback) {#client-broadcast-flow}

The fallback flow uses `type="signature"` credentials. The client
broadcasts the transaction itself and presents the confirmed
transaction signature:

~~~
   Client                     Server              Solana Network
      |                          |                        |
      |  (1) GET /resource       |                        |
      |----------------------->  |                        |
      |                          |                        |
      |  (2) 402 Payment Required|                        |
      |      (recipient, amount) |                        |
      |<-----------------------  |                        |
      |                          |                        |
      |  (3) Build & sign tx     |                        |
      |                          |                        |
      |  (4) Send transaction    |                        |
      |----------------------------------------------->   |
      |  (5) Confirmation        |                        |
      |<-----------------------------------------------   |
      |                          |                        |
      |  (6) Authorization:      |                        |
      |      Payment <credential>|                        |
      |      (tx signature)      |                        |
      |----------------------->  |                        |
      |                          |  (7) getTransaction    |
      |                          |----------------------> |
      |                          |  (8) Parsed tx data    |
      |                          |<---------------------- |
      |                          |                        |
      |  (9) 200 OK + Receipt    |                        |
      |<-----------------------  |                        |
      |                          |                        |
~~~

This flow is useful when the client cannot or does not wish to
delegate broadcast to the server. The server verifies the payment
by fetching and inspecting the on-chain transaction via RPC.

## Relationship to the Charge Intent

This document inherits the shared request semantics of the
"charge" intent from {{I-D.payment-intent-charge}}. It defines
only the Solana-specific `methodDetails`, `payload`, and
verification procedures for the "solana" payment method.

# Requirements Language

{::boilerplate bcp14-tagged}

# Terminology

Transaction Signature
: A base58-encoded {{BASE58}} unique identifier for a Solana
  transaction, produced by the first signer. Serves as both
  the transaction identifier and proof of payment in this
  specification.

SPL Token
: A fungible token on Solana conforming to the SPL Token
  program {{SPL-TOKEN}} or the Token-2022 program
  {{SPL-TOKEN-2022}}.

Associated Token Account (ATA)
: A deterministically derived token account for a given
  owner and mint, per the Associated Token Program. The
  address is a Program Derived Address (PDA) seeded by
  the owner's public key, the token mint, and the token
  program ID.

Lamports
: The smallest unit of native SOL. 1 SOL = 1,000,000,000
  lamports.

Base Units
: The smallest transferable unit of an SPL token, determined
  by the token's decimal precision. For example, USDC uses
  6 decimals, so 1 USDC = 1,000,000 base units.

Fee Payer
: An account that pays Solana transaction fees. When the server
  acts as fee payer, it adds its signature to the transaction
  before broadcasting, covering the transaction fee on behalf
  of the client.

# Intent Identifier

The intent identifier for this specification is "charge".
It MUST be lowercase.

# Intent: "charge"

The "charge" intent represents a one-time payment gating access
to a resource. The client builds and signs a Solana transfer
transaction, then either sends the signed transaction bytes to
the server for broadcast (`type="transaction"`) or broadcasts the
transaction itself and sends the on-chain signature
(`type="signature"`). The server verifies the transfer details
and returns a receipt.

# Encoding Conventions {#encoding}

All JSON {{RFC8259}} objects carried in auth-params or HTTP
headers in this specification MUST be serialized using the JSON
Canonicalization Scheme (JCS) {{RFC8785}} before encoding. JCS
produces a deterministic byte sequence, which is required for
any digest or signature operations defined by the base spec
{{I-D.httpauth-payment}}.

The resulting bytes MUST then be encoded using base64url
{{RFC4648}} Section 5 without padding characters (`=`).
Implementations MUST NOT append `=` padding when encoding,
and MUST accept input with or without padding when decoding.

This encoding convention applies to: the `request` auth-param
in `WWW-Authenticate`, the credential token in `Authorization`,
and the receipt token in `Payment-Receipt`.

# Request Schema

## Shared Fields

The `request` auth-param of the `WWW-Authenticate: Payment`
header contains a JCS-serialized, base64url-encoded JSON
object (see {{encoding}}). The following shared fields are
included in that object:

amount
: REQUIRED. The payment amount in base units, encoded as a
  decimal string. For native SOL, the amount is in lamports.
  For SPL tokens, the amount is in the token's smallest unit
  (e.g., for USDC with 6 decimals, "1000000" represents
  1 USDC). The value MUST be a positive integer.

currency
: REQUIRED. Identifies the unit for `amount`. For native SOL,
  MUST be the string "SOL" (uppercase). For SPL tokens, SHOULD
  be a human-readable identifier (e.g., "USDC") or MAY be the
  token mint address. Payment method specifications MUST
  document which currency formats they support.

description
: OPTIONAL. A human-readable memo describing the resource or
  service being paid for.

recipient
: REQUIRED. The base58-encoded public key of the account
  receiving the payment. For native SOL transfers, this is the
  destination account. For SPL token transfers, this is the
  owner of the destination associated token account, not the
  ATA address itself.

externalId
: OPTIONAL. Merchant's reference (e.g., order ID, invoice
  number), per {{I-D.payment-intent-charge}}. May be used
  for reconciliation or idempotency. When present, clients
  SHOULD include this value as a Memo Program instruction
  in the transaction, making it visible on-chain for
  auditing and reconciliation. Servers MAY verify the memo
  matches the `externalId` from the challenge.

## Method Details

The following fields are nested under `methodDetails` in
the request JSON:

network
: OPTIONAL. Identifies which Solana cluster the payment
  should be made on. MUST be one of "mainnet-beta",
  "devnet", or "localnet". Defaults to "mainnet-beta"
  if omitted. Clients MUST reject challenges whose
  network does not match their configured cluster.

splToken
: OPTIONAL. The base58-encoded mint address of the SPL
  token to transfer. If omitted, the payment is in native
  SOL. When present, `decimals` MUST also be present.

decimals
: Conditionally REQUIRED. The number of decimal places
  for the SPL token. MUST be present when `splToken` is
  present; MUST be absent when `splToken` is absent. Used
  by the client to construct a `TransferChecked` instruction
  and by the server to verify the transfer amount.

tokenProgram
: OPTIONAL. The base58-encoded program ID of the token
  program governing the SPL token. MUST be either the
  Token Program
  (`TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA`) or
  the Token-2022 Program
  (`TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb`).
  If omitted, clients MUST determine the correct token
  program by fetching the mint account from the network
  and inspecting its owner program. Servers SHOULD
  include this field as a hint to avoid the extra RPC
  lookup, but clients MUST NOT fail if the field is
  absent — they MUST resolve it from the mint. MUST NOT
  be present when `splToken` is absent.

reference
: REQUIRED. A server-generated unique identifier for this
  payment challenge, encoded as a string. The server uses
  this value to correlate incoming credentials with issued
  challenges and to enforce single-use semantics. MUST
  be unique per challenge.

feePayer
: OPTIONAL. A boolean indicating whether the server will
  pay transaction fees on behalf of the client. Defaults
  to `false` if omitted. When `true`, the `feePayerKey`
  field MUST also be present. See {{fee-sponsorship}}.

feePayerKey
: Conditionally REQUIRED. The base58-encoded public key
  of the server's fee payer account. MUST be present when
  `feePayer` is `true`; MUST be absent when `feePayer` is
  `false` or omitted. The client uses this key as the
  transaction fee payer when constructing the transaction.

feePayerFee
: OPTIONAL. An additional amount in base units that the
  client MUST include as a separate transfer to the
  `feePayerKey` address to compensate the server for
  transaction fees. When present, the client MUST add
  a native SOL transfer instruction for this amount
  to the fee payer's account, in addition to the primary
  payment transfer. This allows servers to recover the
  cost of sponsoring transaction fees. MUST NOT be
  present when `feePayer` is `false` or omitted.

recentBlockhash
: OPTIONAL. A base58-encoded recent blockhash for the
  client to use when constructing the transaction. When
  provided, clients SHOULD use this blockhash instead of
  fetching one from an RPC node. This avoids an extra
  RPC round-trip and ensures the server can verify
  blockhash freshness. If omitted, clients MUST fetch
  a recent blockhash themselves.

### Native SOL Example

~~~json
{
  "amount": "10000000",
  "currency": "SOL",
  "recipient": "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU",
  "description": "Weather API access",
  "methodDetails": {
    "network": "mainnet-beta",
    "reference": "f47ac10b-58cc-4372-a567-0e02b2c3d479"
  }
}
~~~

This requests a transfer of 0.01 SOL (10,000,000 lamports).

### SPL Token Example

~~~json
{
  "amount": "1000000",
  "currency": "USDC",
  "recipient": "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU",
  "description": "Premium API call",
  "methodDetails": {
    "network": "mainnet-beta",
    "splToken": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    "decimals": 6,
    "reference": "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
  }
}
~~~

This requests a transfer of 1 USDC (1,000,000 base units).

### Fee Sponsorship Example

~~~json
{
  "amount": "10000000",
  "currency": "SOL",
  "recipient": "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU",
  "description": "Weather API access",
  "methodDetails": {
    "network": "mainnet-beta",
    "reference": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
    "feePayer": true,
    "feePayerKey": "9aE3Fg7HjKLmNpQr5TuVwXyZ2AbCdEf8GhIjKlMnOp1R"
  }
}
~~~

This requests a transfer of 0.01 SOL where the server pays
transaction fees.

# Credential Schema

The `Authorization` header carries a single base64url-encoded
JSON token (no auth-params). The decoded object contains the
following top-level fields:

challenge
: REQUIRED. An echo of the challenge auth-params from the
  `WWW-Authenticate` header: `id`, `realm`, `method`,
  `intent`, `request`, and (if present) `expires`. This
  binds the credential to the exact challenge that was
  issued.

source
: OPTIONAL. A payer identifier string, as defined by
  {{I-D.httpauth-payment}}. Solana implementations MAY
  use the payer's base58-encoded public key or a DID.

payload
: REQUIRED. A JSON object containing the Solana-specific
  credential fields. The `type` field determines which
  additional fields are present. Two payload types are
  defined: `"transaction"` (default) and `"signature"`
  (fallback).

## Transaction Payload (type="transaction") {#transaction-payload}

When `type` is `"transaction"`, the client sends the signed
transaction bytes to the server for broadcast. The `transaction`
field contains the base64-encoded serialized signed transaction.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `type` | string | REQUIRED | `"transaction"` |
| `transaction` | string | REQUIRED | Base64-encoded serialized signed transaction bytes |

The transaction MUST be a valid Solana versioned transaction
containing the transfer instruction(s) matching the challenge
parameters. The client MUST sign the transaction with the
transfer authority key. When `feePayer` is `false` or absent,
the client MUST also be the fee payer and the transaction MUST
be fully signed. When `feePayer` is `true`, the transaction
MUST set the server's `feePayerKey` as fee payer, and the
client signs only as transfer authority; the server adds the
fee payer signature before broadcasting (see
{{fee-sponsorship}}).

Example (decoded):

~~~json
{
  "challenge": {
    "id": "kM9xPqWvT2nJrHsY4aDfEb",
    "realm": "api.example.com",
    "method": "solana",
    "intent": "charge",
    "request": "eyJ...",
    "expires": "2026-03-15T12:05:00Z"
  },
  "payload": {
    "type": "transaction",
    "transaction": "AQAAAA...base64-encoded-signed-tx..."
  }
}
~~~

## Signature Payload (type="signature") {#signature-payload}

When `type` is `"signature"`, the client has already broadcast
the transaction to the Solana network. The `signature` field
contains the base58-encoded transaction signature for the
server to verify on-chain.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `type` | string | REQUIRED | `"signature"` |
| `signature` | string | REQUIRED | Base58-encoded Solana transaction signature |

Example (decoded):

~~~json
{
  "challenge": {
    "id": "kM9xPqWvT2nJrHsY4aDfEb",
    "realm": "api.example.com",
    "method": "solana",
    "intent": "charge",
    "request": "eyJ...",
    "expires": "2026-03-15T12:05:00Z"
  },
  "payload": {
    "type": "signature",
    "signature": "5UfDuX7hXbPjGUpTmt9PHRLsNGJe4dEny..."
  }
}
~~~

## Limitations of type="signature" {#signature-limitations}

The `type="signature"` credential has the following limitations:

- MUST NOT be used when `feePayer` is `true` in the challenge
  request. Since the client has already broadcast the
  transaction, the server cannot add its fee payer signature.
  Servers MUST reject `type="signature"` credentials when
  the challenge specifies `feePayer: true`.

- The server cannot modify or enhance the transaction (e.g.,
  add priority fees, adjust compute units, or retry with
  different parameters).

# Fee Sponsorship {#fee-sponsorship}

When a challenge includes `feePayer: true` in `methodDetails`,
the server commits to paying Solana transaction fees on behalf
of the client. This section describes the fee sponsorship
mechanism.

## Server-Paid Fees

When `feePayer` is `true`:

1. **Client constructs transaction**: The client builds the
   transfer transaction with the server's `feePayerKey` set
   as the transaction fee payer. The client's account is the
   transfer authority but NOT the fee payer.

2. **Client partially signs**: The client signs the transaction
   with only its own key (the transfer authority). The fee
   payer signature slot remains empty.

3. **Client sends credential**: The client sends the partially
   signed transaction as a `type="transaction"` credential.

4. **Server adds fee payer signature**: The server verifies the
   transaction contents, then signs with the fee payer key to
   complete the transaction.

5. **Server broadcasts**: The fully signed transaction
   (containing both the client's transfer authority signature
   and the server's fee payer signature) is broadcast to the
   Solana network.

## Client-Paid Fees

When `feePayer` is `false` or omitted, the client MUST set
itself as the fee payer and fully sign the transaction. The
server broadcasts the transaction as-is without adding any
signatures.

## Server Requirements

When acting as fee payer, servers:

- MUST maintain sufficient SOL balance in the fee payer
  account to cover transaction fees
- MUST verify the transaction contents before signing
  (see {{transaction-verification}})
- MAY recover fee costs through pricing or other business
  logic
- SHOULD implement rate limiting to mitigate fee
  exhaustion attacks (see {{fee-payer-risks}})

## Client Requirements

- When `feePayer` is `true`: clients MUST set `feePayerKey`
  from `methodDetails` as the transaction fee payer and MUST
  sign only with the transfer authority key. Clients MUST
  use `type="transaction"` credentials.
- When `feePayer` is `false` or omitted: clients MUST set
  themselves as the fee payer and fully sign the transaction.
  Clients MAY use either `type="transaction"` or
  `type="signature"` credentials.

# Verification Procedure {#verification}

Upon receiving a request with a credential, the server MUST:

1. Decode the base64url credential and parse the JSON.

2. Verify that `payload.type` is present and is either
   `"transaction"` or `"signature"`.

3. Look up the stored challenge using
   `credential.challenge.id`. If no matching challenge
   is found, reject the request.

4. Verify that all fields in `credential.challenge`
   exactly match the stored challenge auth-params.

5. If `payload.type` is `"signature"` and the challenge
   specifies `feePayer: true`, reject the request (see
   {{signature-limitations}}).

6. Proceed with type-specific verification:
   - For `type="transaction"`: see {{transaction-verification}}.
   - For `type="signature"`: see {{signature-verification}}.

## Transaction Credential Verification {#transaction-verification}

For credentials with `type="transaction"`:

1. Decode the base64 `payload.transaction` value.

2. If `feePayer` is `true`, deserialize the transaction,
   add the server's fee payer signature using the
   `feePayerKey`, and re-serialize. The transaction
   MUST have the server's `feePayerKey` set as the fee
   payer account.

3. Simulate the transaction using the `simulateTransaction`
   RPC method. If simulation fails, reject the credential.
   This catches invalid transactions without spending fees,
   which is especially important in fee payer mode (see
   {{transaction-simulation}}).

4. Broadcast the transaction to the Solana network using
   `sendTransaction`.

5. Wait for confirmation at the required commitment level.

6. Fetch the confirmed transaction using `getTransaction`
   with `jsonParsed` encoding and verify the transfer
   details match the challenge request, as described in
   {{sol-verification}} or {{spl-verification}}.

7. Record the transaction signature as consumed to
   prevent replay (see {{replay-protection}}).

8. Return the resource with a Payment-Receipt header.

## Signature Credential Verification {#signature-verification}

For credentials with `type="signature"`:

1. Verify that `payload.signature` is present and is a
   valid base58-encoded string.

2. Verify the transaction signature has not been
   previously consumed (see {{replay-protection}}).

3. Fetch the transaction from the Solana network using
   the RPC `getTransaction` method with `jsonParsed`
   encoding and the `confirmed` commitment level.

4. Verify the transaction was successful (no error in
   the transaction metadata).

5. Verify the transfer details match the challenge
   request, as described in {{sol-verification}} or
   {{spl-verification}}.

6. Mark the transaction signature as consumed to
   prevent replay.

7. Return the resource with a Payment-Receipt header.

Note: both credential types reuse the same on-chain
transfer verification logic defined in
{{sol-verification}} and {{spl-verification}}.

## Native SOL Verification {#sol-verification}

For native SOL payments (no `splToken` in `methodDetails`),
the server MUST:

1. Locate a System Program `transfer` instruction in the
   transaction's parsed instructions.

2. Verify the `destination` field matches the `recipient`
   from the challenge request.

3. Verify the `lamports` field matches the `amount` from
   the challenge request.

If no matching System Program transfer instruction is found,
the server MUST reject the credential.

## SPL Token Verification {#spl-verification}

For SPL token payments (`splToken` present in
`methodDetails`), the server MUST:

1. Locate a `transferChecked` instruction from the
   appropriate token program (Token Program or
   Token-2022) in the transaction's parsed instructions.

2. Verify the `mint` field matches the `splToken` from
   `methodDetails`.

3. Verify the `tokenAmount.amount` field matches the
   `amount` from the challenge request.

4. Derive the expected destination associated token
   account from the `recipient`, `splToken`, and
   `tokenProgram` in the challenge request. Verify the
   `destination` field in the instruction matches this
   derived ATA address.

If no matching `transferChecked` instruction is found,
the server MUST reject the credential.

## Replay Protection {#replay-protection}

Servers MUST maintain a set of consumed transaction
signatures. Before accepting a credential, the server
MUST check whether the signature has already been
consumed. After successful verification, the server
MUST atomically mark the signature as consumed.

The transaction signature is globally unique on the
Solana network, making it a natural replay prevention
token. A signature that has been consumed MUST NOT be
accepted again, even if presented with a different
challenge ID.

For `type="transaction"` credentials, the transaction
signature is derived after broadcast. For
`type="signature"` credentials, the signature is
provided directly by the client.

# Settlement Procedure

Two settlement flows are supported, corresponding to
the two credential types.

## Server-Broadcast Settlement (type="transaction")

For `type="transaction"` credentials, the client signs
the transaction and sends it to the server. The server
optionally adds a fee payer signature and broadcasts:

~~~
   Client                        Server                   Solana Network
      |                             |                           |
      |  (1) Authorization:         |                           |
      |      Payment <credential>   |                           |
      |      (signed tx bytes)      |                           |
      |-------------------------->  |                           |
      |                             |                           |
      |                             |  (2) If feePayer: true,   |
      |                             |      co-sign as fee payer |
      |                             |                           |
      |                             |  (3) simulateTransaction  |
      |                             |------------------------>  |
      |                             |  (4) Simulation OK        |
      |                             |<------------------------  |
      |                             |                           |
      |                             |  (5) sendTransaction      |
      |                             |------------------------>  |
      |                             |  (6) Confirmation         |
      |                             |<------------------------  |
      |                             |                           |
      |                             |  (7) getTransaction       |
      |                             |      (verify transfer)    |
      |                             |------------------------>  |
      |                             |  (8) Parsed tx data       |
      |                             |<------------------------  |
      |                             |                           |
      |  (9) 200 OK + Receipt       |                           |
      |<--------------------------  |                           |
      |                             |                           |
~~~

1. Client submits credential containing signed transaction
   bytes.
2. If `feePayer` is `true`, the server co-signs with its
   fee payer key.
3. Server simulates the transaction to catch failures
   without spending fees.
4. Server broadcasts the transaction to Solana.
5. Transaction reaches the required commitment level.
6. Server fetches the confirmed transaction and verifies
   the transfer details match the challenge request.
7. Server records the signature as consumed and returns
   the resource with a Payment-Receipt header whose
   `reference` field is the transaction signature.

## Client-Broadcast Settlement (type="signature")

For `type="signature"` credentials, the client broadcasts
the transaction itself and presents the confirmed signature:

~~~
   Client                     Server              Solana Network
      |                          |                        |
      |  (1) Build & sign tx     |                        |
      |                          |                        |
      |  (2) sendTransaction     |                        |
      |----------------------------------------------->   |
      |                          |                        |
      |  (3) Poll confirmation   |                        |
      |----------------------------------------------->   |
      |  (4) Confirmed           |                        |
      |<-----------------------------------------------   |
      |                          |                        |
      |  (5) Authorization:      |                        |
      |      Payment <credential>|                        |
      |      (tx signature)      |                        |
      |----------------------->  |                        |
      |                          |  (6) getTransaction    |
      |                          |----------------------> |
      |                          |  (7) Verified          |
      |                          |<---------------------- |
      |                          |                        |
      |  (8) 200 OK + Receipt    |                        |
      |<-----------------------  |                        |
~~~

1. Client builds a transfer transaction and signs it.
2. Client sends the transaction to the Solana network.
3. Client polls for confirmation status.
4. Transaction reaches `confirmed` commitment level.
5. Client presents the transaction signature as the
   credential.
6. Server fetches the transaction via RPC and verifies
   transfer details.
7. Server confirms the payment matches the challenge.
8. Server returns the resource with a Payment-Receipt.

## Client Transaction Construction

### Native SOL

The client MUST construct a transaction containing a
System Program `transfer` instruction with:

- `source`: the client's signing account
- `destination`: the `recipient` from the challenge
- `lamports`: the `amount` from the challenge

### SPL Tokens

The client MUST construct a transaction containing:

1. An idempotent Associated Token Account creation
   instruction for the recipient's ATA, ensuring
   payment succeeds even if the recipient has never
   held the token. The payer covers the rent-exempt
   minimum (~0.002 SOL) if the account does not exist.

2. A `transferChecked` instruction on the appropriate
   token program with:
   - `source`: the client's associated token account
   - `mint`: the `splToken` from `methodDetails`
   - `destination`: the recipient's derived ATA
   - `authority`: the client's signing account
   - `amount`: the `amount` from the challenge
   - `decimals`: the `decimals` from `methodDetails`

### Fee Payer Configuration

When `feePayer` is `true` in the challenge:

- The client MUST set the server's `feePayerKey` as the
  transaction fee payer.
- The client MUST sign the transaction only with its own
  key (transfer authority).
- The fee payer signature slot MUST be left empty for the
  server to fill.

When `feePayer` is `false` or absent:

- The client MUST set itself as the transaction fee payer.
- The client MUST fully sign the transaction.

Clients SHOULD set a compute unit limit and priority
fee appropriate for current network conditions.

## Confirmation Requirements

For `type="signature"` credentials, clients MUST wait for
at least the `confirmed` commitment level before presenting
the credential. Servers MUST fetch the transaction with at
least `confirmed` commitment. Servers MAY require
`finalized` commitment for high-value transactions.

For `type="transaction"` credentials, the server controls
the broadcast and confirmation process. Servers MUST wait
for at least `confirmed` commitment before returning the
receipt.

## Finality

Solana provides two commitment levels relevant to
payment verification:

- `confirmed`: optimistic confirmation from a
  supermajority of validators (~400ms). Sufficient
  for most payment use cases.
- `finalized`: deterministic finality after ~31 slots
  (~12 seconds). Required for high-value transactions
  where rollback risk is unacceptable.

In theory, a `confirmed` transaction could be rolled
back if validators shift consensus to a competing fork
that excludes the confirmed block. In practice, this
has never occurred on Solana mainnet. The `confirmed`
level is RECOMMENDED as the default for payment
verification to minimize latency.

## Receipt Generation

Upon successful verification, the server MUST include
a `Payment-Receipt` header in the 200 response.

The receipt payload for Solana charge:

| Field | Type | Description |
|-------|------|-------------|
| `method` | string | `"solana"` |
| `challengeId` | string | The challenge `id` from `WWW-Authenticate` |
| `reference` | string | The transaction signature (base58-encoded) |
| `status` | string | `"success"` |
| `timestamp` | string | {{RFC3339}} verification time |

Example (decoded):

~~~json
{
  "method": "solana",
  "challengeId": "kM9xPqWvT2nJrHsY4aDfEb",
  "reference": "5UfDuX7hXbPjGUpTmt9PHRLsNGJe4dEny...",
  "status": "success",
  "timestamp": "2026-03-10T21:00:00Z"
}
~~~

# Error Responses

When rejecting a credential, the server MUST return HTTP
402 (Payment Required) with a fresh
`WWW-Authenticate: Payment` challenge per
{{I-D.httpauth-payment}}. The server SHOULD include a
response body conforming to RFC 9457 {{RFC9457}} Problem
Details, with `Content-Type: application/problem+json`.
The following problem types are defined for this intent:

https://paymentauth.org/problems/solana/malformed-credential
: HTTP 402. The credential token could not be decoded, the
  JSON could not be parsed, or required fields (`challenge`,
  `payload`, `payload.type`) are absent or have the wrong
  type. A fresh challenge MUST be included in
  `WWW-Authenticate`.

https://paymentauth.org/problems/solana/unknown-challenge
: HTTP 402. The value of `credential.challenge.id` does
  not match any challenge issued by this server, or the
  challenge has already been consumed. A fresh challenge
  MUST be included in `WWW-Authenticate`.

https://paymentauth.org/problems/solana/invalid-credential-type
: HTTP 402. The `payload.type` is `"signature"` but the
  challenge specifies `feePayer: true`, which requires
  `type="transaction"`. A fresh challenge MUST be included
  in `WWW-Authenticate`.

https://paymentauth.org/problems/solana/transaction-not-found
: HTTP 402. The transaction signature could not be fetched
  from the Solana network. The transaction may not yet be
  confirmed, or may not exist. A fresh challenge MUST be
  included in `WWW-Authenticate`.

https://paymentauth.org/problems/solana/transaction-failed
: HTTP 402. The transaction was found on-chain but contains
  an error in its metadata, indicating it failed during
  execution. A fresh challenge MUST be included in
  `WWW-Authenticate`.

https://paymentauth.org/problems/solana/transfer-mismatch
: HTTP 402. The on-chain transfer does not match the
  challenge parameters. This includes: wrong recipient,
  wrong amount, wrong token mint, or missing transfer
  instruction. A fresh challenge MUST be included in
  `WWW-Authenticate`.

https://paymentauth.org/problems/solana/signature-consumed
: HTTP 402. The transaction signature has already been
  used to fulfill a previous challenge. A fresh challenge
  MUST be included in `WWW-Authenticate`.

https://paymentauth.org/problems/solana/broadcast-failed
: HTTP 402. The server attempted to broadcast a
  `type="transaction"` credential but the Solana network
  rejected it (e.g., invalid signature, insufficient
  funds, expired blockhash). A fresh challenge MUST be
  included in `WWW-Authenticate`.

Example error response body:

~~~json
{
  "type": "https://paymentauth.org/problems/solana/transfer-mismatch",
  "title": "Transfer Mismatch",
  "status": 402,
  "detail": "Destination token account does not belong to expected recipient"
}
~~~

# Security Considerations

## Transport Security

All communication MUST use TLS 1.2 or higher. Solana
credentials MUST only be transmitted over HTTPS
connections.

## Transaction Signature Uniqueness

Each Solana transaction has a unique signature derived
from the signer's private key and the transaction
message (which includes a recent blockhash). This
ensures that transaction signatures are globally unique
and serve as natural replay prevention tokens.

## Replay Protection

Servers MUST track consumed transaction signatures and
reject any signature that has already been accepted.
The check-and-consume operation MUST be atomic to
prevent race conditions where concurrent requests
present the same signature.

## Amount Verification

Clients MUST parse and verify the `request` payload
before signing any transaction:

1. Verify `amount` is reasonable for the service
2. Verify `currency` matches the expected asset
3. Verify `recipient` is the expected party
4. If `splToken` is present, verify it is the
   expected token mint address

Malicious servers could request excessive amounts or
direct payments to unexpected recipients.

## RPC Trust

The server relies on its Solana RPC endpoint to
provide accurate transaction data. Servers SHOULD
use trusted RPC providers or run their own validator
nodes. A compromised RPC endpoint could return
fabricated transaction data, causing the server to
accept payments that were never made.

## Associated Token Account Creation

When paying with SPL tokens, the client creates the
recipient's associated token account if it does not
exist. This costs approximately 0.002 SOL in rent.
Malicious servers could exploit this to drain small
amounts of SOL from clients by requesting payments
to recipients that have never held the token. Clients
SHOULD be aware of this additional cost.

## Confirmation Level Trade-offs

Accepting transactions at `confirmed` commitment
provides faster settlement but carries a small risk
of the transaction being dropped before finalization.
Servers handling high-value transactions SHOULD
require `finalized` commitment. Servers MUST
document which commitment level they require.

## Front-running

For `type="signature"` credentials, because the client
broadcasts the transaction before presenting the
credential, the transaction is visible on-chain. A
malicious party monitoring the mempool or chain could
attempt to front-run by presenting the same signature
to the server. The challenge binding (the credential
echoes the challenge `id`) and single-use signature
enforcement mitigate this: only the party that received
the challenge can construct a valid credential for it.

For `type="transaction"` credentials, front-running is
not a concern because the transaction is not broadcast
until the server receives and validates the credential.

## Fee Payer Risks {#fee-payer-risks}

Servers acting as fee payers accept financial risk in
exchange for providing a seamless payment experience.

Denial of Service via Bad Transactions
: Malicious clients could submit valid-looking
  transactions that fail on-chain (e.g., insufficient
  token balance, wrong program invocation), causing the
  server to pay transaction fees without receiving
  payment. Each failed transaction costs the server
  approximately 5,000 lamports (0.000005 SOL) in base
  fees, which can accumulate under sustained attack.

Mitigation Strategies
: Servers SHOULD implement the following protections:

  - **Rate limiting**: Limit the number of fee-sponsored
    transactions per client address, per IP address, or
    per time window.
  - **Transaction simulation**: Use the `simulateTransaction`
    RPC method to verify the transaction will succeed
    before signing and broadcasting. This catches most
    failure modes without spending fees.
  - **Balance verification**: Before signing, verify via
    RPC that the client has sufficient balance to cover
    the transfer amount.
  - **Client authentication**: Require client identity
    verification (e.g., API keys, OAuth tokens) before
    accepting fee-sponsored transactions.

ATA Rent Drain
: When the fee payer funds the creation of an Associated
  Token Account (ATA) for the recipient, it pays
  approximately 0.002 SOL in rent. The recipient can
  close the ATA at any time to reclaim this rent, then
  the next payment to the same recipient re-creates the
  ATA at the fee payer's expense. A malicious or
  opportunistic recipient can repeat this cycle to drain
  the fee payer's SOL balance. Servers SHOULD verify via
  RPC that the recipient's ATA already exists before
  signing a fee-sponsored transaction that includes an
  ATA creation instruction. Alternatively, servers MAY
  require recipients to maintain their own ATAs, or
  factor the ATA rent cost into the payment amount.

Fee Payer Balance Exhaustion
: Servers MUST monitor their fee payer account balance
  and reject new fee-sponsored requests when the balance
  is insufficient to cover transaction fees. The server
  SHOULD return a standard 402 response with a fresh
  challenge that has `feePayer` set to `false`, allowing
  the client to pay its own fees as a fallback.

## Transaction Simulation

For `type="transaction"` credentials, servers SHOULD simulate
the transaction using the `simulateTransaction` RPC method
before broadcasting. Simulation detects failures such as
insufficient funds, invalid instructions, or exceeded compute
limits without consuming fees or landing a failed transaction
on-chain. This is especially important when the server acts
as fee payer ({{fee-sponsorship}}), as a failed broadcast
wastes the fee payer's SOL.

Servers MUST reject the credential if simulation indicates
an error, returning a fresh 402 challenge.

## Transaction Payload Security

For `type="transaction"` credentials, the server MUST
thoroughly verify the transaction contents before
signing (as fee payer) or broadcasting. A malicious
client could craft a transaction that transfers funds
FROM the server's fee payer account rather than simply
paying fees. Servers MUST verify that the only
instructions in the transaction are the expected
transfer instruction(s) and, optionally, compute
budget instructions.

# IANA Considerations

## Payment Method Registration

This document requests registration of the following
entry in the "HTTP Payment Methods" registry established
by {{I-D.httpauth-payment}}:

| Method Identifier | Description | Reference |
|-------------------|-------------|-----------|
| `solana` | Solana blockchain native SOL and SPL token transfer | This document |

## Payment Intent Registration

This document requests registration of the following
entry in the "HTTP Payment Intents" registry established
by {{I-D.httpauth-payment}}:

| Intent | Applicable Methods | Description | Reference |
|--------|-------------------|-------------|-----------|
| `charge` | `solana` | One-time SOL or SPL token transfer | This document |

--- back

# Examples

## Native SOL Charge (Server-Broadcast)

**Challenge:**

~~~http
HTTP/1.1 402 Payment Required
WWW-Authenticate: Payment id="kM9xPqWvT2nJrHsY4aDfEb",
  realm="api.example.com",
  method="solana",
  intent="charge",
  request="eyJhbW91bnQiOiIxMDAwMDAwMCIsImN1cnJlbmN5IjoiU09MIiwiZGVzY3JpcHRpb24iOiJXZWF0aGVyIEFQSSBhY2Nlc3MiLCJtZXRob2REZXRhaWxzIjp7Im5ldHdvcmsiOiJtYWlubmV0LWJldGEiLCJyZWZlcmVuY2UiOiJmNDdhYzEwYi01OGNjLTQzNzItYTU2Ny0wZTAyYjJjM2Q0NzkifSwicmVjaXBpZW50IjoiN3hLWHRnMkNXODdkOTdUWEpTRHBiRDVqQmtoZVRxQTgzVFpSdUpvc2dBc1UifQ",
  expires="2026-03-15T12:05:00Z"
Cache-Control: no-store
~~~

Decoded `request`:

~~~json
{
  "amount": "10000000",
  "currency": "SOL",
  "description": "Weather API access",
  "methodDetails": {
    "network": "mainnet-beta",
    "reference": "f47ac10b-58cc-4372-a567-0e02b2c3d479"
  },
  "recipient": "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU"
}
~~~

**Credential (type="transaction"):**

~~~http
GET /weather HTTP/1.1
Host: api.example.com
Authorization: Payment eyJjaGFsbGVuZ2UiOnsiaWQiOiJrTTl4UHFXdlQybkpySHNZNGFEZkViIiwicmVhbG0iOiJhcGkuZXhhbXBsZS5jb20iLCJtZXRob2QiOiJzb2xhbmEiLCJpbnRlbnQiOiJjaGFyZ2UiLCJyZXF1ZXN0IjoiZXlKLi4uIiwiZXhwaXJlcyI6IjIwMjYtMDMtMTVUMTI6MDU6MDBaIn0sInBheWxvYWQiOnsidHlwZSI6InRyYW5zYWN0aW9uIiwidHJhbnNhY3Rpb24iOiJBUUFBQUEuLi4ifX0
~~~

Decoded credential:

~~~json
{
  "challenge": {
    "id": "kM9xPqWvT2nJrHsY4aDfEb",
    "realm": "api.example.com",
    "method": "solana",
    "intent": "charge",
    "request": "eyJ...",
    "expires": "2026-03-15T12:05:00Z"
  },
  "payload": {
    "type": "transaction",
    "transaction": "AQAAA..."
  }
}
~~~

**Response:**

~~~http
HTTP/1.1 200 OK
Payment-Receipt: eyJjaGFsbGVuZ2VJZCI6ImtNOXhQcVd2VDJuSnJIc1k0YURmRWIiLCJtZXRob2QiOiJzb2xhbmEiLCJyZWZlcmVuY2UiOiI1VWZEdVg3aFhiUGpHVXBUbXQ5UEhSTHNOR0plNGRFbnkuLi4iLCJzdGF0dXMiOiJzdWNjZXNzIiwidGltZXN0YW1wIjoiMjAyNi0wMy0xMFQyMTowMDowMFoifQ
Content-Type: application/json

{"temperature": 72, "condition": "sunny"}
~~~

Decoded receipt:

~~~json
{
  "method": "solana",
  "challengeId": "kM9xPqWvT2nJrHsY4aDfEb",
  "reference": "5UfDuX7hXbPjGUpTmt9PHRLsNGJe4dEny...",
  "status": "success",
  "timestamp": "2026-03-10T21:00:00Z"
}
~~~

## SPL Token (USDC) Charge

**Challenge:**

~~~http
HTTP/1.1 402 Payment Required
WWW-Authenticate: Payment id="xN7aPqWvR3mKsHtY5bCgFd",
  realm="api.example.com",
  method="solana",
  intent="charge",
  request="eyJhbW91bnQiOiIxMDAwMDAwIiwiY3VycmVuY3kiOiJVU0RDIiwiZGVzY3JpcHRpb24iOiJQcmVtaXVtIEFQSSBjYWxsIiwibWV0aG9kRGV0YWlscyI6eyJkZWNpbWFscyI6NiwibmV0d29yayI6Im1haW5uZXQtYmV0YSIsInJlZmVyZW5jZSI6ImExYjJjM2Q0LWU1ZjYtNzg5MC1hYmNkLWVmMTIzNDU2Nzg5MCIsInNwbFRva2VuIjoiRVBqRldkZDVBdWZxU1NxZU0ycU4xeHp5YmFwQzhHNHdFR0drWnd5VER0MXYifSwicmVjaXBpZW50IjoiN3hLWHRnMkNXODdkOTdUWEpTRHBiRDVqQmtoZVRxQTgzVFpSdUpvc2dBc1UifQ",
  expires="2026-03-15T12:05:00Z"
Cache-Control: no-store
~~~

Decoded `request`:

~~~json
{
  "amount": "1000000",
  "currency": "USDC",
  "description": "Premium API call",
  "methodDetails": {
    "decimals": 6,
    "network": "mainnet-beta",
    "reference": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "splToken": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"
  },
  "recipient": "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU"
}
~~~

## Client-Broadcast Fallback (type="signature")

~~~http
GET /weather HTTP/1.1
Host: api.example.com
Authorization: Payment eyJjaGFsbGVuZ2UiOnsiaWQiOiJrTTl4UHFXdlQybkpySHNZNGFEZkViIiwicmVhbG0iOiJhcGkuZXhhbXBsZS5jb20iLCJtZXRob2QiOiJzb2xhbmEiLCJpbnRlbnQiOiJjaGFyZ2UiLCJyZXF1ZXN0IjoiZXlKLi4uIiwiZXhwaXJlcyI6IjIwMjYtMDMtMTVUMTI6MDU6MDBaIn0sInBheWxvYWQiOnsidHlwZSI6InNpZ25hdHVyZSIsInNpZ25hdHVyZSI6IjVVZkR1WDdoWGJQakdVcFRtdDlQSFJMc05HSmU0ZEVueS4uLiJ9fQ
~~~

Decoded credential:

~~~json
{
  "challenge": {
    "id": "kM9xPqWvT2nJrHsY4aDfEb",
    "realm": "api.example.com",
    "method": "solana",
    "intent": "charge",
    "request": "eyJ...",
    "expires": "2026-03-15T12:05:00Z"
  },
  "payload": {
    "type": "signature",
    "signature": "5UfDuX7hXbPjGUpTmt9PHRLsNGJe4dEny..."
  }
}
~~~

## Fee Sponsorship Example

**Challenge with fee sponsorship:**

~~~json
{
  "amount": "10000000",
  "currency": "SOL",
  "recipient": "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU",
  "description": "Weather API access",
  "methodDetails": {
    "network": "mainnet-beta",
    "reference": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
    "feePayer": true,
    "feePayerKey": "9aE3Fg7HjKLmNpQr5TuVwXyZ2AbCdEf8GhIjKlMnOp1R"
  }
}
~~~

**Credential (partially signed, server pays fees):**

~~~json
{
  "challenge": {
    "id": "kM9xPqWvT2nJrHsY4aDfEb",
    "realm": "api.example.com",
    "method": "solana",
    "intent": "charge",
    "request": "eyJ...",
    "expires": "2026-03-15T12:05:00Z"
  },
  "payload": {
    "type": "transaction",
    "transaction": "AQAAA...partially-signed-tx..."
  }
}
~~~

The server receives the partially signed transaction, adds the
fee payer signature using the `feePayerKey` account, and
broadcasts the fully signed transaction.

# Acknowledgements

The author thanks the Solana developer community and the
MPP working group for their input on this specification.
