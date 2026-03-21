---
title: Solana Session Intent for HTTP Payment Authentication
abbrev: Solana Session
docname: draft-solana-session-00
version: 00
category: info
ipr: trust200902
submissiontype: independent
consensus: false

author:
  - name: Alexander Attar
    ins: A. Attar
    email: alexanderattar@gmail.com

normative:
  RFC2119:
  RFC3339:
  RFC4648:
  RFC8174:
  RFC8259:
  RFC8785:
  RFC9457:
  I-D.httpauth-payment:
    title: "The 'Payment' HTTP Authentication Scheme"
    target: https://datatracker.ietf.org/doc/draft-ietf-httpauth-payment/
    author:
      - name: Jake Moxey
    date: 2026-01
  I-D.solana-charge:
    title: "Solana Charge Intent for HTTP Payment Authentication"
    target: https://datatracker.ietf.org/doc/draft-solana-charge/
    author:
      - name: Ludo Galabru
      - name: Ilan Gitter
    date: 2026

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
  ED25519-PROGRAM:
    title: "Solana Ed25519 Program"
    target: https://solana.com/docs/core/programs#ed25519-program
    author:
      - org: Solana Foundation
    date: 2026
  BASE58:
    title: "Base58 Encoding Scheme"
    target: https://datatracker.ietf.org/doc/html/draft-msporny-base58-03
    author:
      - name: Manu Sporny
    date: 2023
---

--- abstract

This document defines the "session" intent for the "solana" payment
method within the Payment HTTP Authentication Scheme
{{I-D.httpauth-payment}}. The client deposits SPL tokens into an
on-chain escrow program, creating a unidirectional payment channel;
subsequent requests are authorized by off-chain Ed25519-signed
vouchers with cumulative amounts that the server verifies locally.
Settlement occurs when the channel is partially settled or closed.

Two credential types are supported: `type="channel_open"`, where
the client presents proof of the on-chain channel deposit, and
`type="voucher"`, where the client presents an off-chain signed
voucher authorizing cumulative payment.

--- middle

# Introduction

HTTP Payment Authentication {{I-D.httpauth-payment}} defines a
challenge-response mechanism that gates access to resources behind
payments. This document registers the "session" intent for the
"solana" payment method.

The Solana charge intent {{I-D.solana-charge}} handles one-time
payments where each request requires an on-chain transaction.
Sessions aggregate many payments into a single on-chain
settlement, making them suitable for high-frequency use cases
where per-request on-chain transactions would be
cost-prohibitive {{SOLANA-DOCS}}.

## Channel Open Phase {#channel-open-phase}

The client deposits SPL tokens {{SPL-TOKEN}} into an on-chain
escrow program, creating a unidirectional payment channel:

~~~
   Client                     Server              Solana Network
      |                          |                        |
      |  (1) GET /resource       |                        |
      |----------------------->  |                        |
      |                          |                        |
      |  (2) 402 Payment Required|                        |
      |      (recipient, amount, |                        |
      |       escrowProgram)     |                        |
      |<-----------------------  |                        |
      |                          |                        |
      |  (3) Build open_channel  |                        |
      |      tx, deposit SPL     |                        |
      |      tokens, sign        |                        |
      |                          |                        |
      |  (4) Send transaction    |                        |
      |----------------------------------------------->   |
      |  (5) Confirmation        |                        |
      |<-----------------------------------------------   |
      |                          |                        |
      |  (6) Authorization:      |                        |
      |      Payment <credential>|                        |
      |      (channel_open proof)|                        |
      |----------------------->  |                        |
      |                          |  (7) getTransaction    |
      |                          |----------------------> |
      |                          |  (8) Verified deposit  |
      |                          |<---------------------- |
      |                          |                        |
      |  (9) 200 OK + Receipt    |                        |
      |<-----------------------  |                        |
      |                          |                        |
~~~

The client broadcasts the channel-open transaction itself and
presents the confirmed transaction signature. The server
verifies the deposit on-chain and initializes session state.

## Active Session Phase {#active-session-phase}

Once the channel is open, subsequent requests use off-chain
Ed25519-signed vouchers with no on-chain interaction:

~~~
   Client                     Server
      |                          |
      |  (1) GET /resource       |
      |----------------------->  |
      |                          |
      |  (2) 402 Payment Required|
      |      (same session)      |
      |<-----------------------  |
      |                          |
      |  (3) Sign voucher with   |
      |      incremented amount  |
      |                          |
      |  (4) Authorization:      |
      |      Payment <credential>|
      |      (voucher + sig)     |
      |----------------------->  |
      |                          |
      |  (5) Verify Ed25519 sig  |
      |      (CPU-only, ~usec)   |
      |                          |
      |  (6) 200 OK + Receipt    |
      |<-----------------------  |
      |                          |
~~~

Verification during this phase is a single Ed25519 signature
check: pure CPU, no RPC calls, microsecond latency.

## Relationship to the Solana Charge Intent

This document shares the `method="solana"` payment method with
{{I-D.solana-charge}} but uses `intent="session"` instead of
`intent="charge"`. Both intents use the same encoding
conventions (JCS canonicalization, base64url encoding) and
follow the same shared field semantics for `amount`, `currency`,
and `recipient`.

# Requirements Language

{::boilerplate bcp14-tagged}

# Terminology

Payment Channel
: A unidirectional channel where a payer deposits tokens into
  an on-chain escrow and issues off-chain vouchers to a
  recipient. Settlement occurs when the channel is partially
  settled or closed.

Channel PDA
: A Program Derived Address on Solana that holds the escrowed
  SPL tokens and channel state. Derived deterministically from
  stable seeds (payer pubkey, recipient pubkey, channel nonce).
  The channel PDA address serves as the channel identifier
  throughout the session lifecycle.

Voucher
: An off-chain Ed25519-signed message authorizing a cumulative
  payment amount. Each voucher supersedes all previous vouchers
  for the same channel. The server grants access based on the
  delta between consecutive voucher amounts.

Cumulative Amount
: The total authorized payment from channel open to the current
  voucher. Each voucher's cumulative amount MUST be greater
  than or equal to the previous voucher's cumulative amount.

Voucher Nonce
: A monotonically increasing counter included in each voucher.
  Prevents replay of older vouchers with the same cumulative
  amount.

Escrow Program
: The on-chain Solana program that manages payment channel
  state, holds deposited tokens, and enforces settlement rules.

Base Units
: The smallest transferable unit of an SPL token, determined
  by the token's decimal precision. For example, USDC uses
  6 decimals, so 1 USDC = 1,000,000 base units.

# Intent Identifier

The intent identifier for this specification is "session".
It MUST be lowercase.

# Intent: "session"

The "session" intent represents a long-lived payment
authorization gating access to a resource over multiple
requests. The client opens a payment channel on-chain once,
then signs off-chain vouchers with monotonically increasing
cumulative amounts for each request. The server verifies each
voucher locally and grants access for the delta between the
new and previous cumulative amount. Settlement occurs
on-chain when the channel is partially settled or closed.

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
: REQUIRED. The cost per request in base units, encoded as a
  decimal string. For SPL tokens, base units are the token's
  smallest unit (e.g., for USDC with 6 decimals, "1000"
  represents 0.001 USDC per request). The value MUST be a
  positive integer that fits in a 64-bit unsigned integer
  (max 18,446,744,073,709,551,615).

currency
: REQUIRED. MUST be the base58-encoded {{BASE58}} mint address
  of the SPL token (e.g.,
  `"EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"` for
  USDC). The mint address uniquely identifies the token and
  is used by the client to construct the deposit and voucher.
  MUST NOT exceed 128 characters. Native SOL sessions are
  not supported in this version; use the charge intent
  {{I-D.solana-charge}} for native SOL payments.

description
: OPTIONAL. A human-readable memo describing the resource or
  service being paid for. MUST NOT exceed 256 characters.

recipient
: REQUIRED. The base58-encoded public key of the account
  receiving payments. This is the owner of the destination
  associated token account, not the ATA address itself.

## Method Details

The following fields are nested under `methodDetails` in
the request JSON:

network
: OPTIONAL. Identifies which Solana cluster the session
  operates on. MUST be one of "mainnet-beta", "devnet",
  or "localnet". Defaults to "mainnet-beta" if omitted.
  Clients MUST reject challenges whose network does not
  match their configured cluster.

decimals
: REQUIRED. The number of decimal places for the token
  (0-9). Used by the client for voucher amount construction
  and deposit instruction parameters.

escrowProgram
: REQUIRED. The base58-encoded program ID of the on-chain
  escrow program that manages payment channels. The client
  uses this to construct the channel-open transaction.

reference
: REQUIRED. A server-generated unique identifier for this
  payment challenge, encoded as a string. MUST NOT exceed
  128 characters. The server uses this value to correlate
  incoming credentials with issued challenges and to enforce
  single-use semantics. MUST be unique per challenge.

suggestedDeposit
: OPTIONAL. The server's recommended initial deposit amount
  in base units, encoded as a decimal string. Clients SHOULD
  use `min(suggestedDeposit, maxDeposit)` where `maxDeposit`
  is the client's configured spending limit. If omitted,
  clients MAY choose their own deposit amount.

timeout
: OPTIONAL. Channel timeout duration in seconds, encoded as
  a decimal string. After `opened_at + timeout`, the payer
  may reclaim unspent tokens via the `reclaim` instruction.
  Defaults to "3600" (1 hour) if omitted.

tokenProgram
: OPTIONAL. The base58-encoded program ID of the token
  program governing the token. MUST be either the Token
  Program (`TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA`)
  or the Token-2022 Program
  (`TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb`)
  {{SPL-TOKEN-2022}}. If omitted, clients MUST determine
  the correct token program by fetching the mint account
  from the network and inspecting its owner program.
  Servers SHOULD include this field as a hint to avoid
  the extra RPC lookup.

### Session Challenge Example

~~~json
{
  "amount": "1000",
  "currency": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  "recipient": "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU",
  "description": "LLM inference API",
  "methodDetails": {
    "network": "mainnet-beta",
    "decimals": 6,
    "escrowProgram": "MPPsession1111111111111111111111111111111",
    "reference": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
    "suggestedDeposit": "1000000",
    "timeout": "3600",
    "tokenProgram": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
  }
}
~~~

This requests a session charging 0.001 USDC (1000 base units)
per request, with a suggested initial deposit of 1 USDC
(1,000,000 base units) and a 1-hour channel timeout.

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
  defined: `"channel_open"` and `"voucher"`.

## Channel Open Payload {#channel-open-payload}

When opening a channel (`type="channel_open"`), the client
sends proof of the on-chain deposit transaction. The client
broadcasts the channel-open transaction itself and presents
the confirmed transaction signature.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `type` | string | REQUIRED | `"channel_open"` |
| `channelId` | string | REQUIRED | Base58-encoded channel PDA address |
| `signature` | string | REQUIRED | Base58-encoded transaction signature of the channel-open transaction |
| `deposit` | string | REQUIRED | Deposit amount in base units |

The `channelId` is the base58-encoded address of the channel
PDA, which serves as the unique identifier for this payment
channel throughout the session lifecycle.

Example (decoded):

~~~json
{
  "challenge": {
    "id": "kM9xPqWvT2nJrHsY4aDfEb",
    "realm": "api.example.com",
    "method": "solana",
    "intent": "session",
    "request": "eyJ...",
    "expires": "2026-03-21T12:05:00Z"
  },
  "payload": {
    "type": "channel_open",
    "channelId": "6Yd4vFHRk2pLJ9NwQxGjZ8Bt...",
    "signature": "5UfDuX7hXbPjGUpTmt9PHRLsNGJe4dEny...",
    "deposit": "1000000"
  }
}
~~~

## Voucher Payload {#voucher-payload}

For each request during an active session
(`type="voucher"`), the client presents an off-chain
Ed25519-signed voucher with a monotonically increasing
cumulative amount.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `type` | string | REQUIRED | `"voucher"` |
| `channelId` | string | REQUIRED | Base58-encoded channel PDA address |
| `cumulativeAmount` | string | REQUIRED | Cumulative payment in base units |
| `nonce` | string | REQUIRED | Monotonically increasing voucher nonce |
| `expiry` | string | REQUIRED | Voucher expiry as {{RFC3339}} timestamp |
| `signature` | string | REQUIRED | Base64-encoded Ed25519 signature over the 206-byte voucher message (see {{voucher-format}}) |

Example (decoded):

~~~json
{
  "challenge": {
    "id": "kM9xPqWvT2nJrHsY4aDfEb",
    "realm": "api.example.com",
    "method": "solana",
    "intent": "session",
    "request": "eyJ...",
    "expires": "2026-03-21T12:05:00Z"
  },
  "payload": {
    "type": "voucher",
    "channelId": "6Yd4vFHRk2pLJ9NwQxGjZ8Bt...",
    "cumulativeAmount": "5000",
    "nonce": "5",
    "expiry": "2026-03-21T13:00:00Z",
    "signature": "SGVsbG8gV29ybGQhIFRoaXMgaXMgYW4g..."
  }
}
~~~

# Voucher Format {#voucher-format}

Vouchers are structured binary messages signed with the
payer's Ed25519 keypair. The format is domain-separated and
binds to all relevant context to prevent cross-channel,
cross-program, and cross-cluster replay.

~~~
Voucher message layout (206 bytes):
  bytes[0..21]:    "mpp-solana-session-v1" (ASCII, 21 bytes)
  bytes[21..53]:   channel PDA (32 bytes)
  bytes[53..85]:   escrow program ID (32 bytes)
  bytes[85..117]:  payer pubkey (32 bytes)
  bytes[117..149]: recipient pubkey (32 bytes)
  bytes[149..181]: mint pubkey (32 bytes)
  bytes[181..189]: cumulative amount (u64 little-endian)
  bytes[189..197]: voucher nonce (u64 little-endian)
  bytes[197..205]: expiry timestamp (i64 little-endian, Unix seconds)
  bytes[205]:      cluster discriminator (0=mainnet, 1=devnet, 2=localnet)
~~~

The 21-byte ASCII domain tag `"mpp-solana-session-v1"` prevents
confusion with any other Ed25519-signed message format. The
signature is Ed25519 over the 206-byte message, signed by the
payer's keypair. The resulting 64-byte signature is base64-encoded
in the credential payload.

# Verification Procedure {#verification}

Upon receiving a request with a credential, the server MUST:

1. Decode the base64url credential and parse the JSON.

2. Verify that `payload.type` is present and is either
   `"channel_open"` or `"voucher"`.

3. Look up the stored challenge using
   `credential.challenge.id`. If no matching challenge
   is found, reject the request.

4. Verify that all fields in `credential.challenge`
   exactly match the stored challenge auth-params.

5. Proceed with type-specific verification:
   - For `type="channel_open"`: see {{channel-open-verification}}.
   - For `type="voucher"`: see {{voucher-verification}}.

## Channel Open Verification {#channel-open-verification}

For credentials with `type="channel_open"`:

1. Verify that `payload.signature` is present and is a
   valid base58-encoded string.

2. Fetch the transaction from the Solana network using
   the RPC `getTransaction` method with `jsonParsed`
   encoding and at least `confirmed` commitment level.

3. Verify the transaction was successful (no error in
   the transaction metadata).

4. Verify the transaction contains an `open_channel`
   instruction to the `escrowProgram` from the challenge.

5. Verify the channel PDA at `payload.channelId` was
   created with the correct parameters: recipient matches
   the challenge `recipient`, mint matches `currency`, and
   the deposit amount matches `payload.deposit`.

6. Initialize server-side session state for this channel:
   store the channel PDA address, payer pubkey, deposit
   amount, and set the cumulative amount and voucher nonce
   to zero.

7. Return the resource with a Payment-Receipt header.

## Voucher Verification {#voucher-verification}

For credentials with `type="voucher"`:

1. Look up the server's stored session state for the
   channel at `payload.channelId`. If no active session
   exists for this channel, reject the credential.

2. Reconstruct the 206-byte voucher message from the
   credential fields and the stored session parameters
   (channel PDA, escrow program ID, payer pubkey,
   recipient, mint, cluster).

3. Verify the Ed25519 signature in `payload.signature`
   against the reconstructed 206-byte message using the
   stored payer pubkey.

4. Verify the `cumulativeAmount` is greater than or equal
   to the server's previously-recorded cumulative amount
   for this channel.

5. Verify the `nonce` is strictly greater than the server's
   previously-recorded nonce for this channel.

6. Verify the `expiry` timestamp has not passed.

7. Atomically update the server's session state: set the
   cumulative amount to `payload.cumulativeAmount` and the
   nonce to `payload.nonce`.

8. Grant access for the delta:
   `cumulativeAmount - previousCumulativeAmount`.

9. Return the resource with a Payment-Receipt header.

The cumulative-amount update in step 7 MUST be atomic to
prevent race conditions where concurrent requests count
the same voucher delta twice. See {{server-state}}.

# Settlement Procedure

## Channel Lifecycle

The channel progresses through the following states:

### Partial Settlement {#partial-settlement}

The server MAY submit the latest voucher on-chain via the
escrow program's `settle` instruction at any time during
an active session. This transfers the delta
(`voucher.cumulativeAmount - channel.cumulativePaid`) to
the recipient's associated token account and updates the
channel's on-chain `cumulativePaid` and `voucherNonce`
fields. The channel remains open for continued use.

Servers SHOULD settle periodically to limit counterparty
risk (the amount at risk if the channel is abandoned).

### Channel Close {#channel-close}

The recipient closes the channel by submitting the latest
voucher via the escrow program's `close` instruction:

1. Verify the voucher signature on-chain (see
   {{on-chain-verification}}).
2. Transfer the final delta
   (`voucher.cumulativeAmount - channel.cumulativePaid`)
   to the recipient's associated token account.
3. Transfer the remainder
   (`channel.deposit - voucher.cumulativeAmount`) to the
   payer's associated token account.
4. Close the channel PDA and its token account.

### Timeout Reclaim {#timeout-reclaim}

If the current time exceeds `channel.expiryAt` (computed
as `openedAt + timeout`), the payer may call the escrow
program's `reclaim` instruction to recover
`channel.deposit - channel.cumulativePaid`. This works
whether `cumulativePaid` is zero or greater than zero.

### Timeout Rules {#timeout-rules}

The following rules govern which instructions are valid
relative to timestamps:

- `settle` requires: `now <= voucher.expiry` AND
  `now <= channel.expiryAt`
- `close` requires: `now <= voucher.expiry` AND
  `now <= channel.expiryAt`
- `reclaim` requires: `now > channel.expiryAt`

After `channel.expiryAt`, the recipient can no longer
settle or close. Only the payer can act, via `reclaim`.

## On-Chain Voucher Verification {#on-chain-verification}

On-chain voucher verification (for `settle` and `close`)
uses Solana's Ed25519 precompile program
(`Ed25519SigVerify111111111111111111111111111`)
{{ED25519-PROGRAM}}.

The Ed25519 precompile is NOT callable via CPI. The
correct pattern:

1. The transaction includes an Ed25519 verify instruction
   that checks the payer's signature over the 206-byte
   voucher message.

2. The escrow program reads the instructions sysvar
   (`Sysvar1nstructions1111111111111111111111111`) and
   validates that the Ed25519 instruction exists, verified
   the correct public key, and verified the correct
   message bytes.

3. If the Ed25519 instruction is missing, references a
   different key, or references different message data,
   the program MUST reject the transaction.

Incorrect Ed25519 validation enables unauthorized
withdrawal of escrowed funds. See {{ed25519-security}}.

## Channel PDA Derivation {#pda-derivation}

The channel PDA is derived from stable seeds only:

~~~
seeds = [
  "mpp-channel",
  payer_pubkey,
  recipient_pubkey,
  channel_nonce (u64 little-endian)
]
~~~

The `channel_nonce` is a sequential counter set once at
channel creation, NOT the voucher nonce. This produces a
stable PDA address that does not change as vouchers are
issued. The channel PDA address serves as the `channelId`
in credentials and receipts.

## Client Transaction Construction

### Channel Open

The client MUST construct a transaction containing an
`open_channel` instruction to the escrow program that:

1. Creates the channel PDA with the correct seeds
   (see {{pda-derivation}}).
2. Transfers SPL tokens from the client's associated
   token account to the channel's token account via
   the appropriate token program {{SPL-TOKEN}}.
3. Initializes the channel state: payer, recipient,
   mint, deposit amount, timeout, and timestamps.

The client MUST be the fee payer and MUST fully sign
the transaction. The client MUST wait for at least
`confirmed` commitment before presenting the credential.

### Voucher Signing

For each request during an active session, the client:

1. Increments the voucher nonce.
2. Computes the new cumulative amount
   (`previousCumulativeAmount + amount`).
3. Constructs the 206-byte voucher message
   (see {{voucher-format}}).
4. Signs the message with Ed25519 using the payer's
   keypair.
5. Presents the signature in a `type="voucher"`
   credential.

## Confirmation Requirements

For `type="channel_open"` credentials, clients MUST wait
for at least the `confirmed` commitment level before
presenting the credential. Servers MUST fetch the
transaction with at least `confirmed` commitment.

## Finality

Solana provides two commitment levels relevant to
payment verification:

- `confirmed`: optimistic confirmation from a
  supermajority of validators (~400ms). Sufficient
  for most payment use cases.
- `finalized`: deterministic finality after ~31 slots
  (~12 seconds). Required for high-value transactions
  where rollback risk is unacceptable.

The `confirmed` level is RECOMMENDED as the default for
channel-open verification to minimize latency. Servers
MAY require `finalized` commitment for channels with
large deposits.

## Receipt Generation

Upon successful verification, the server MUST include
a `Payment-Receipt` header in the 200 response.

The receipt payload for Solana session:

| Field | Type | Description |
|-------|------|-------------|
| `method` | string | `"solana"` |
| `challengeId` | string | The challenge `id` from `WWW-Authenticate` |
| `reference` | string | For `channel_open`: the transaction signature (base58). For `voucher`: the channel PDA address (base58). |
| `status` | string | `"success"` |
| `timestamp` | string | {{RFC3339}} verification time |

For `type="channel_open"`, the `reference` is the on-chain
transaction signature. For `type="voucher"`, the `reference`
is the channel PDA address, since no on-chain transaction
occurs during voucher verification.

Example receipt for a voucher credential (decoded):

~~~json
{
  "method": "solana",
  "challengeId": "kM9xPqWvT2nJrHsY4aDfEb",
  "reference": "6Yd4vFHRk2pLJ9NwQxGjZ8Bt...",
  "status": "success",
  "timestamp": "2026-03-21T12:04:58Z"
}
~~~

# Server State Requirements {#server-state}

Servers MUST track per-channel session state. The following
fields are required:

- Channel PDA address (`channelId`)
- Payer pubkey
- Recipient pubkey
- Mint pubkey
- Deposit amount
- Highest cumulative amount received
- Highest voucher nonce received

The cumulative-amount and nonce update MUST be atomic to
prevent race conditions where concurrent requests count
the same voucher delta twice. In-process locks (e.g.,
mutexes) are NOT safe across multiple server instances.
Horizontally-scaled deployments MUST use an external
atomic store (e.g., Redis with WATCH/MULTI, PostgreSQL
with row-level locks, or equivalent).

# Error Responses

When rejecting a credential, the server MUST return HTTP
402 (Payment Required) with a fresh
`WWW-Authenticate: Payment` challenge per
{{I-D.httpauth-payment}}. The server SHOULD include a
response body conforming to RFC 9457 {{RFC9457}} Problem
Details, with `Content-Type: application/problem+json`.
Servers MUST use the standard problem types defined in
{{I-D.httpauth-payment}}: `malformed-credential`,
`invalid-challenge`, and `verification-failed`. The
`detail` field SHOULD contain a human-readable
description of the specific failure.

All error responses MUST include a fresh challenge in
`WWW-Authenticate`.

Example error response body:

~~~json
{
  "type": "https://paymentauth.org/problems/verification-failed",
  "title": "Invalid Voucher",
  "status": 402,
  "detail": "Voucher nonce 3 is not greater than previously accepted nonce 5"
}
~~~

# Security Considerations

## Transport Security

All communication MUST use TLS 1.2 or higher. Session
credentials MUST only be transmitted over HTTPS
connections.

## Voucher Replay Protection

Each voucher carries a monotonically increasing nonce and
cumulative amount. The server MUST reject vouchers with a
nonce less than or equal to the highest previously-accepted
nonce for the channel. The domain-separated voucher format
(206 bytes with ASCII prefix, program ID, and cluster
discriminator) prevents cross-channel, cross-program, and
cross-cluster replay. A voucher accepted for one channel
cannot be replayed against a different channel, program,
or cluster because the signed message includes all of
these identifiers.

## Ed25519 On-Chain Verification {#ed25519-security}

The Solana Ed25519 precompile is NOT callable via CPI.
On-chain voucher verification (settle, close) MUST use
the instructions sysvar pattern described in
{{on-chain-verification}}. If this is implemented
incorrectly, an attacker can call settle or close with
arbitrary voucher data, bypassing signature verification
entirely. This is the single highest-risk component of
the escrow program.

Implementations MUST include adversarial tests that
verify the following cases are rejected:

- Missing Ed25519 verify instruction
- Ed25519 instruction verifying a different public key
- Ed25519 instruction verifying different message data

## Escrow Program Security

The escrow program MUST verify:

- Only the payer can deposit and reclaim
- Only the recipient can settle and close
- Voucher signatures match the channel's payer pubkey
- Cumulative amounts only increase
- Voucher nonces strictly increase
- Timeout rules are enforced per {{timeout-rules}}

## Counterparty Risk

During an active session, the server carries risk equal to
the cumulative authorized amount minus the last on-chain
settlement. If the payer's signing key is compromised or
the payer disappears, the server holds the latest voucher
as its claim on escrowed funds. Servers SHOULD settle
periodically to reduce exposure. The timeout mechanism
ensures the payer can recover funds if the recipient
disappears or refuses to close the channel.

## Client-Side Verification

Clients MUST verify the challenge before depositing:

1. `recipient` is the expected party
2. `amount` per request is reasonable for the service
3. `currency` matches the expected token
4. `escrowProgram` is the expected program
5. `suggestedDeposit` is within acceptable limits

Malicious servers could request excessive deposits,
direct payments to unexpected recipients, or specify
rogue escrow programs.

## RPC Trust

The server relies on its Solana RPC endpoint to provide
accurate transaction data for channel-open verification.
A compromised RPC could return fabricated transaction
data, causing the server to accept deposits that were
never made. Servers SHOULD use trusted RPC providers
or run their own nodes.

# IANA Considerations

## Payment Method Registration

This document uses the `solana` method identifier
registered by {{I-D.solana-charge}}.

## Payment Intent Registration

This document requests registration of the following
entry in the "HTTP Payment Intents" registry established
by {{I-D.httpauth-payment}}:

| Intent | Applicable Methods | Description | Reference |
|--------|-------------------|-------------|-----------|
| `session` | `solana` | Streaming SPL token payments via payment channels | This document |

--- back

# Examples

The following examples illustrate the complete HTTP exchange
for each credential type. Base64url values are shown with
their decoded JSON below.

## Session Open (Channel Deposit)

A session charging 0.001 USDC per request. The client
deposits 1 USDC.

**1. Challenge (402 response):**

~~~http
HTTP/1.1 402 Payment Required
WWW-Authenticate: Payment id="kM9xPqWvT2nJrHsY4aDfEb",
  realm="api.example.com",
  method="solana",
  intent="session",
  request="eyJhbW91bnQiOiIxMDAwIiwiY3VycmVuY3kiOiJFUGpG
    V2RkNUF1ZnFTU3FlTTJxTjF4enliYXBDOEc0d0VHR2tad3lURH
    QxdiIsImRlc2NyaXB0aW9uIjoiTExNIGluZmVyZW5jZSBBUEki
    LCJtZXRob2REZXRhaWxzIjp7Im5ldHdvcmsiOiJtYWlubmV0LW
    JldGEiLCJkZWNpbWFscyI6NiwiZXNjcm93UHJvZ3JhbSI6Ik1Q
    UHNlc3Npb24xMTExMTExMTExMTExMTExMTExMTExMTExMTExMT
    ExIiwicmVmZXJlbmNlIjoiZjQ3YWMxMGItNThjYy00MzcyLWE1
    NjctMGUwMmIyYzNkNDc5Iiwic3VnZ2VzdGVkRGVwb3NpdCI6Ij
    EwMDAwMDAiLCJ0aW1lb3V0IjoiMzYwMCJ9LCJyZWNpcGllbnQi
    OiI3eEtYdGcyQ1c4N2Q5N1RYSlNEcGJENWpCa2hlVHFBODNUWl
    J1Sm9zZ0FzVSJ9",
  expires="2026-03-21T12:05:00Z"
Cache-Control: no-store
~~~

Decoded `request`:

~~~json
{
  "amount": "1000",
  "currency": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  "description": "LLM inference API",
  "methodDetails": {
    "network": "mainnet-beta",
    "decimals": 6,
    "escrowProgram": "MPPsession1111111111111111111111111111111",
    "reference": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
    "suggestedDeposit": "1000000",
    "timeout": "3600"
  },
  "recipient": "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU"
}
~~~

**2. Credential (channel open proof):**

~~~http
GET /inference HTTP/1.1
Host: api.example.com
Authorization: Payment <base64url-encoded credential>
~~~

Decoded credential:

~~~json
{
  "challenge": {
    "id": "kM9xPqWvT2nJrHsY4aDfEb",
    "realm": "api.example.com",
    "method": "solana",
    "intent": "session",
    "request": "<base64url-encoded request>",
    "expires": "2026-03-21T12:05:00Z"
  },
  "payload": {
    "type": "channel_open",
    "channelId": "6Yd4vFHRk2pLJ9NwQxGjZ8Bt...",
    "signature": "5UfDuX7hXbPjGUpTmt9PHRLsNGJe4dEny...",
    "deposit": "1000000"
  }
}
~~~

**3. Response (with receipt):**

~~~http
HTTP/1.1 200 OK
Payment-Receipt: <base64url-encoded receipt>
Content-Type: application/json

{"model": "llama-3", "output": "Hello! How can I help?"}
~~~

Decoded receipt:

~~~json
{
  "method": "solana",
  "challengeId": "kM9xPqWvT2nJrHsY4aDfEb",
  "reference": "5UfDuX7hXbPjGUpTmt9PHRLsNGJe4dEny...",
  "status": "success",
  "timestamp": "2026-03-21T12:04:58Z"
}
~~~

## Session Voucher (Subsequent Request)

After the channel is open, the client signs a voucher
for each subsequent request. No on-chain transaction
occurs.

Decoded credential:

~~~json
{
  "challenge": {
    "id": "nR8yQsXwU3oKtIsZ5bEgFc",
    "realm": "api.example.com",
    "method": "solana",
    "intent": "session",
    "request": "<base64url-encoded request>",
    "expires": "2026-03-21T12:10:00Z"
  },
  "payload": {
    "type": "voucher",
    "channelId": "6Yd4vFHRk2pLJ9NwQxGjZ8Bt...",
    "cumulativeAmount": "2000",
    "nonce": "2",
    "expiry": "2026-03-21T13:00:00Z",
    "signature": "SGVsbG8gV29ybGQhIFRoaXMgaXMgYW4g..."
  }
}
~~~

This is the second request in the session. The cumulative
amount is 2000 base units (0.002 USDC), representing a
delta of 1000 (0.001 USDC) from the previous voucher.

Decoded receipt:

~~~json
{
  "method": "solana",
  "challengeId": "nR8yQsXwU3oKtIsZ5bEgFc",
  "reference": "6Yd4vFHRk2pLJ9NwQxGjZ8Bt...",
  "status": "success",
  "timestamp": "2026-03-21T12:05:02Z"
}
~~~

# Acknowledgements

The author thanks the Tempo team for the session method
design that this specification adapts for Solana, and the
Solana Foundation for the charge intent specification that
this document builds upon.
