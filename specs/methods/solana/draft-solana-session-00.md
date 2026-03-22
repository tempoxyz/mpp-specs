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
  - name: Ludo Galabru
    ins: L. Galabru
    email: ludo.galabru@solana.org
    org: Solana Foundation

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
  BASE58:
    title: "Base58 Encoding Scheme"
    target: https://datatracker.ietf.org/doc/html/draft-msporny-base58-03
    author:
      - name: Manu Sporny
    date: 2021
---

--- abstract

This document defines the "session" intent for the "solana"
payment method within the Payment HTTP Authentication Scheme
{{I-D.httpauth-payment}}. Sessions enable metered, streaming,
or repeated-use access to resources through off-chain vouchers
backed by an on-chain escrow. The client opens a payment
channel by depositing into a channel program, authorizes
incremental spend via signed vouchers, and settles on-chain
when the session closes.

--- middle

# Introduction

HTTP Payment Authentication {{I-D.httpauth-payment}} defines
a challenge-response mechanism that gates access to resources
behind payments. This document registers the "session" intent
for the "solana" payment method.

The `session` intent establishes a unidirectional
streaming payment channel using on-chain escrow and
off-chain signed vouchers. This enables high-frequency,
low-cost payments by batching many off-chain voucher
updates into periodic on-chain settlement.

Unlike the `charge` intent, which settles a full
on-chain transaction per request, the `session` intent
allows clients to pay incrementally as service is
consumed. This makes sessions suitable for streaming,
metered APIs, and any use case where per-request
on-chain settlement would be prohibitively expensive
or slow.

## Solana-Specific Capabilities

This specification leverages Solana-specific capabilities:

- **Escrow via channel program**: Deposits are held by an
  on-chain program (not the server), enabling trustless
  settlement and client-initiated forced close.

- **Atomic multi-instruction transactions**: Channel open
  can include the deposit transfer, escrow initialization,
  and initial voucher in a single transaction. Similarly,
  close can settle and refund atomically.

- **Fee payer separation**: The server can sponsor all
  on-chain operations (open, topUp, settle, close) so the
  client never needs SOL for transaction fees.

- **Ed25519 native verification**: Voucher signatures can
  be verified on-chain using Solana's native `ed25519`
  program, enabling trustless settlement without
  reimplementing signature verification in the channel
  program.

- **Passkey-compatible P256 verification**:
  Implementations can support delegated voucher signers
  using Solana's native `secp256r1` verification
  program, enabling WebAuthn/passkey-backed session
  authorization without requiring the funding key to
  sign each voucher.

## Session Flow

~~~
  Client                      Server             Solana
     |                           |                  |
     |  (1) GET /resource        |                  |
     |-------------------------> |                  |
     |                           |                  |
     |  (2) 402 (pricing, asset) |                  |
     |<------------------------- |                  |
     |                           |                  |
     |  (3) open (deposit tx     |                  |
     |       + initial voucher)  |                  |
     |-------------------------> |                  |
     |                           | (4) co-sign +    |
     |                           |     broadcast    |
     |                           |----------------> |
     |  (5) 200 OK + Receipt     |                  |
     |<------------------------- |                  |
     |                           |                  |
     |  (6) voucher (cumulative: |                  |
     |       100)                |  no on-chain tx  |
     |-------------------------> |                  |
     |  (7) 200 OK + Receipt     |                  |
     |<------------------------- |                  |
     |                           |                  |
     |  (8) voucher (cumulative: |                  |
     |       200)                |  no on-chain tx  |
     |-------------------------> |                  |
     |  (9) 200 OK + Receipt     |                  |
     |<------------------------- |                  |
     |        ...                |                  |
     |                           |                  |
     |  (10) close (final        |                  |
     |        voucher)           |                  |
     |-------------------------> |                  |
     |                           | (11) settle +    |
     |                           |      refund      |
     |                           |----------------> |
     |  (12) 204 + Receipt       |                  |
     |<------------------------- |                  |
     |                           |                  |
~~~

Steps 6–9 are off-chain: the client signs a voucher
authorizing cumulative spend, the server verifies the
signature and serves the resource. No on-chain
transaction occurs per request.

When fee sponsorship is enabled, the server co-signs
as fee payer on steps 4 and 11 — the client never
needs SOL for transaction fees.

## Relationship to the Charge Intent

The "charge" intent (defined separately) handles one-time
payments. The "session" intent handles metered, streaming,
or repeated-use payments within a single channel. Both
intents share the same `solana` method identifier and
encoding conventions.

# Requirements Language

{::boilerplate bcp14-tagged}

# Terminology

Payment Channel
: A unidirectional payment relationship between a payer
  and payee, consisting of an on-chain escrow account
  managed by a channel program and a sequence of
  off-chain vouchers. The channel is identified by a
  unique `channelId`.

Channel Program
: A Solana program that manages channel escrow accounts.
  It enforces deposit, settlement, and withdrawal rules.
  The program address is declared in the challenge so
  clients can verify they are interacting with the
  expected program.

Voucher
: A signed message authorizing a cumulative payment
  amount for a specific channel. Vouchers are
  monotonically increasing in amount.

Cumulative Amount
: The total amount authorized from channel open, not a
  per-request delta. For example, if the first voucher
  authorizes 100 and the second authorizes 250, the
  payee may claim up to 250 total, not 350.

Authorized Signer
: The key permitted to sign vouchers for a channel.
  Defaults to the payer unless the channel open binds a
  delegated signer in channel state.

Grace Period
: A time window after a client requests forced close,
  during which the server can still settle outstanding
  vouchers before funds are returned to the client.

# Intent Identifier

The intent identifier for this specification is "session".
It MUST be lowercase.

# Encoding Conventions

This specification uses the same encoding conventions
as the Solana charge intent: JCS-serialized {{RFC8785}}
JSON, base64url-encoded {{RFC4648}} without padding.

# Channel Program Interface

The channel program manages escrow accounts and
enforces settlement rules. This section defines the
logical interface that conforming channel programs
MUST implement.

## Channel State

Each channel is represented by an on-chain account
(typically a PDA derived from payer, payee, asset,
and a salt) with the following logical fields:

| Field | Type | Description |
|-------|------|-------------|
| `payer` | Pubkey | Client who deposited funds |
| `payee` | Pubkey | Server authorized to settle |
| `token` | Pubkey | Token mint (or system program for SOL) |
| `authorizedSigner` | Pubkey | Voucher signer (payer if not delegated) |
| `deposit` | u64 | Total amount deposited |
| `settled` | u64 | Cumulative amount settled to payee |
| `closeRequestedAt` | i64 | Unix timestamp of close request (0 if none) |
| `finalized` | bool | Whether channel is closed |

The `channelId` is the base58-encoded address of the
channel account (PDA). Channel programs MUST derive
the channel PDA deterministically from channel
parameters and the program ID. At minimum, the seed
set MUST bind the PDA to:

- the payer public key;
- the payee public key;
- the asset identifier (SOL or mint address);
- a client-chosen salt or nonce; and
- the authorized signer public key (or payer if no
  delegation is used).

Clients and servers MUST derive the expected
`channelId` from the channel program ID and the seed
components above and MUST verify that the open
transaction creates and funds exactly that PDA.
Relying on a client-declared `channelId` string alone
is NOT sufficient.

Channel programs MUST use Solana's canonical PDA
derivation procedure and MUST reject non-canonical
addresses or user-supplied bump values that do not
match the canonical derivation for the channel seeds.

## Instructions

### open

Creates the channel account and transfers the initial
deposit from the payer to the escrow.

Solana allows the channel creation, token transfer,
and any initial setup to be composed in a single
atomic transaction with multiple instructions.

The payer authority for the funding transfer MUST be a
signer on the transaction.

### settle

Payee presents a signed voucher. The program verifies
the Ed25519 signature (via Solana's `ed25519` program
or in-program verification), checks that
`cumulativeAmount > settled` and
`cumulativeAmount <= deposit`, then transfers the
delta (`cumulativeAmount - settled`) to the payee.

The server MAY call settle at any time to claim
accumulated funds without closing the channel.

The payee authority for settlement MUST be a signer on
the transaction.

### topUp

Payer transfers additional funds to the escrow. The
program increases `deposit` accordingly. If
`closeRequestedAt > 0`, topUp MUST reset it to 0
(cancelling any pending forced close).

The payer authority for the additional funding transfer
MUST be a signer on the transaction.

### requestClose

Payer initiates a forced close. The program sets
`closeRequestedAt = Clock::get().unix_timestamp`.
This starts a grace period during which the payee
can still call settle or close.

The payer authority requesting close MUST be a signer
on the transaction.

### withdraw

Payer recovers remaining funds after the grace
period has expired. The program verifies
`Clock::get().unix_timestamp >= closeRequestedAt + GRACE_PERIOD`,
transfers `deposit - settled` to the payer, and
marks the channel as finalized.

The payer authority receiving the refund MUST be a
signer on the transaction.

### close

Payee closes the channel by settling any final delta
authorized by a voucher and refunding the remainder to
the payer in a single atomic transaction. If no new
delta exists beyond the on-chain `settled` watermark,
the close path MAY omit voucher verification and act
as a refund-only cooperative close.

Solana's multi-instruction transactions allow the
settle + refund + account cleanup to happen
atomically, ensuring neither party can be cheated
during close.

The payee authority initiating cooperative close MUST
be a signer on the transaction. Fee-payer signatures
MUST NOT be treated as satisfying payer or payee
authority checks.

## Grace Period

The grace period (RECOMMENDED: 15 minutes) protects
the payee. If the payer calls requestClose while the
payee has unsubmitted vouchers, the payee has until
the grace period expires to call settle or close.

Without a grace period, the payer could withdraw
funds immediately after receiving service, before
the server has time to settle.

## Access Control

| Instruction | Caller |
|-------------|--------|
| open | Anyone (payer signs the deposit transfer) |
| settle | Payee only |
| topUp | Payer only |
| requestClose | Payer only |
| withdraw | Payer only (after grace period) |
| close | Payee only |

# Request Schema

## Shared Fields

amount
: REQUIRED. Price per unit of service in base units,
  encoded as a decimal string. For native SOL, the
  amount is in lamports. For SPL tokens, the amount is
  in the token's smallest unit.

unitType
: OPTIONAL. Unit being priced (for example,
  `"request"`, `"token"`, or `"byte"`).

suggestedDeposit
: OPTIONAL. Suggested initial channel deposit in base
  units. Clients MAY deposit less or more depending on
  expected usage.

recipient
: REQUIRED. Base58-encoded public key of the server's
  account that will receive settlement funds.

currency
: REQUIRED. `"sol"` for native SOL, or a base58-encoded
  SPL token mint address.

description
: OPTIONAL. Human-readable description of the service
  or resource being paid for.

externalId
: OPTIONAL. Merchant reference for reconciliation or
  audit correlation.

## Method Details

network
: OPTIONAL. Solana cluster identifier. MUST be one of
  "mainnet-beta", "devnet", or "localnet". Defaults to
  "mainnet-beta".

channelProgram
: REQUIRED. Base58-encoded address of the on-chain
  channel program. Clients MUST verify this matches
  their expected program before depositing funds.

channelId
: OPTIONAL. Existing channel identifier to resume. When
  present, clients SHOULD verify the referenced channel
  is open and sufficiently funded before reuse.

decimals
: Conditionally REQUIRED. Token decimal places (0–9).
  MUST be present when `currency` is a mint address.

tokenProgram
: OPTIONAL. Base58-encoded token program ID for the
  mint in `currency`. MUST be either the SPL Token
  Program or the Token-2022 Program when present. If
  omitted for a mint-based `currency`, clients MUST
  determine the correct token program from on-chain
  state before constructing token instructions.

feePayer
: OPTIONAL. If `true`, the server sponsors transaction
  fees for open, topUp, and close operations. When
  `true`, `feePayerKey` MUST also be present.

feePayerKey
: Conditionally REQUIRED. Base58-encoded public key
  of the server's fee payer account.

minVoucherDelta
: OPTIONAL. Minimum amount increase between accepted
  vouchers.

ttlSeconds
: OPTIONAL. Suggested session duration in seconds.

gracePeriodSeconds
: OPTIONAL. Grace period for forced close
  (RECOMMENDED: 900, i.e. 15 minutes).

For the `session` intent, `amount` specifies the price
per unit of service, not a total charge. When
`unitType` is present, clients can estimate cost
before a session begins:

~~~
total = amount × units_consumed
~~~

# Credential Schema

The credential payload uses a discriminated union on
the `action` field. Four actions are defined.

## Action: "open"

Opens a new payment channel.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `action` | string | REQUIRED | `"open"` |
| `channelId` | string | REQUIRED | Base58 channel account address |
| `payer` | string | REQUIRED | Base58 public key of the depositor |
| `authorizationPolicy` | object | OPTIONAL | Voucher signer policy |
| `depositAmount` | string | REQUIRED | Initial deposit in base units |
| `transaction` | string | REQUIRED | Base64-encoded signed (or partially signed) transaction |
| `expiresAt` | string | OPTIONAL | Session expiration (ISO 8601) |
| `capabilities` | object | OPTIONAL | Implementation-specific extensions |
| `voucher` | object | REQUIRED | Signed initial voucher (see {{voucher-format}}) |

The `transaction` contains the open instruction(s).
When `feePayer` is `true`, the client partially signs
(transfer authority only) and the server co-signs as
fee payer before broadcasting — same pattern as the
charge intent's pull mode.

Servers MUST derive `payer`, `channelId`,
`depositAmount`, `authorizationPolicy`, delegated signer
settings, and all program-relevant open parameters
from the signed transaction and confirmed on-chain
state. Servers MUST NOT trust these values solely
because they appear in the HTTP payload.

## Action: "voucher"

Submits a new voucher authorizing additional spend.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `action` | string | REQUIRED | `"voucher"` |
| `channelId` | string | REQUIRED | Existing channel identifier |
| `voucher` | object | REQUIRED | Signed voucher (see {{voucher-format}}) |

This action is entirely off-chain. No transaction
is broadcast.

## Action: "topUp"

Adds funds to an existing channel.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `action` | string | REQUIRED | `"topUp"` |
| `channelId` | string | REQUIRED | Existing channel identifier |
| `additionalAmount` | string | REQUIRED | Amount to add in base units |
| `transaction` | string | REQUIRED | Base64-encoded signed topUp transaction |

## Action: "close"

Requests cooperative close.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `action` | string | REQUIRED | `"close"` |
| `channelId` | string | REQUIRED | Existing channel identifier |
| `voucher` | object | OPTIONAL | Final signed voucher (see {{voucher-format}}) |

If `voucher` is present, the server settles the final
delta on-chain and refunds the remainder atomically.
If the highest amount has already been settled on-chain,
the server MAY close without a new voucher.

# Voucher Format {#voucher-format}

## Voucher Data

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `channelId` | string | REQUIRED | Channel this voucher authorizes |
| `cumulativeAmount` | string | REQUIRED | Total authorized spend (base units) |
| `expiresAt` | string | OPTIONAL | Voucher expiration (ISO 8601) |

All other channel context (payer, recipient, token,
network, program, and signer policy) is established
by the on-chain channel state and the deterministic
PDA derivation defined above. The voucher only needs
to identify the channel and authorize a cumulative
amount because `channelId` is already bound to that
context. Implementations MUST NOT accept vouchers for
channels whose identity cannot be recomputed from the
program ID and channel open parameters.

## Signed Voucher

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `voucher` | object | REQUIRED | Voucher data (above) |
| `signer` | string | REQUIRED | Base58 public key of the voucher signer |
| `signature` | string | REQUIRED | Base58-encoded Ed25519 signature |
| `signatureType` | string | REQUIRED | `"ed25519"` |

## Voucher Signing

1. Serialize the voucher data object using JCS
   {{RFC8785}} to produce deterministic bytes.

2. Sign the bytes using Ed25519 with the payer's
   keypair (or a delegated signer's keypair if the
   channel's `authorizedSigner` is set).

3. Encode the signature as base58.

## Voucher Verification

The server MUST verify each voucher:

1. Deserialize and canonicalize the voucher data.

2. Verify the Ed25519 signature against the `signer`
   public key.

3. Verify the `signer` matches the channel's
   `authorizedSigner` (or `payer` if no delegation).

4. Verify `channelId` matches the active channel.

5. Verify `cumulativeAmount > acceptedCumulative`
   (cumulative increase), unless the submission is an
   idempotent retry handled per
   "Concurrency and Idempotency".

6. Verify the channel is not finalized.

7. Verify `closeRequestedAt == 0`. Servers MUST reject
   new voucher acceptance on channels with a pending
   forced close unless the voucher is being used only
   to settle or cooperatively close the channel.

8. Verify `cumulativeAmount <= escrowedAmount` (does
   not exceed deposit).

9. If `expiresAt` is present, verify the voucher has
   not expired (with configurable clock skew
   tolerance).

10. Persist the new `acceptedCumulative` amount to
    durable storage BEFORE serving the resource.

## On-Chain Voucher Verification

When the server calls settle or close on the channel
program, the voucher signature MUST be verified
on-chain. On Solana, this can be done by:

- Including an `ed25519` program instruction in the
  same transaction that verifies the signature before
  the settle instruction executes.

- Or implementing Ed25519 verification directly in
  the channel program (higher compute cost).

The first approach is preferred as it uses Solana's
native signature verification at minimal compute
cost.

When using instruction introspection to consume a
native signature-verification instruction, channel
programs MUST:

- validate the Instructions sysvar account address;
- use checked instruction-loading helpers provided by
  the Solana SDK;
- correlate the verified message bytes to the exact
  `channelId`, `cumulativeAmount`, and signer accepted
  by the `settle` or `close` instruction in the same
  transaction; and
- reject signature-verification instructions that are
  replayed, unrelated, or positioned such that the
  channel program cannot unambiguously determine which
  verified message they authorize.

# Authorized Signer

By default, the payer signs vouchers directly. This
matches the default channel model: the funding key is
also the voucher-signing key, and the deposit is the
hard cap enforced by the channel.

Implementations MAY support delegated signing where
the payer authorizes a separate keypair (for example,
a session key) to sign vouchers on their behalf. The
`authorizedSigner` field in the channel state records
the delegated public key. The server verifies
vouchers against this key instead of the payer's.

This enables use cases like browser sessions where an
ephemeral key signs vouchers without repeated wallet
confirmations.

Implementations MAY additionally support delegated
signers on other curves that Solana can verify
through native programs, such as `secp256r1` for
passkeys. Such extensions MUST define:

- a distinct `signatureType` value;
- the exact signed message format;
- the exact Solana verification program used on-chain;
  and
- how the delegated signer is bound into the channel's
  PDA derivation and open transaction.

# Fee Sponsorship

When `feePayer` is `true` in the challenge:

- **Open**: The client builds the open transaction
  with the server's `feePayerKey` as fee payer,
  partially signs (deposit transfer authority only),
  and sends via `transaction` in the open credential.
  The server co-signs and broadcasts.

- **TopUp**: Same pattern — client partially signs,
  server co-signs.

- **Settle/Close**: The server initiates these
  operations and always pays the fee.

This ensures clients never need SOL for transaction
fees during the entire session lifecycle.

# Server State Management

## Per-Channel State

The server MUST maintain the following state for
each open channel:

| Field | Description |
|-------|-------------|
| `channelId` | Channel account address |
| `status` | `"open"` or `"closed"` |
| `payer` | Payer public key |
| `authorizationPolicy` | Voucher signer policy |
| `escrowedAmount` | Total deposited (from on-chain) |
| `acceptedCumulative` | Highest voucher amount accepted |
| `spentAmount` | Cumulative amount charged for delivered service |
| `settledOnChain` | Highest cumulative amount already settled on-chain |
| `closeRequestedAt` | Pending forced-close timestamp, if any |

The available off-chain balance is computed as:

~~~
available = acceptedCumulative - spentAmount
~~~

The on-chain settlement watermark is distinct:

~~~
unsettled = spentAmount - settledOnChain
~~~

## Debit Processing

For each request on an open channel:

1. Compute `cost` from the challenged `amount`,
   `unitType`, and any implementation-specific metering
   policy.
2. Compute `available = acceptedCumulative - spentAmount`.
3. If `available < cost`: return 402 requesting a
   new voucher or topUp.
4. Persist `spentAmount += cost` BEFORE serving.
5. Serve the resource with a receipt.

## Partial Settlement

The server MAY call the channel program's settle
instruction at any time to claim accumulated funds
without closing the channel. This is useful for:

- Reducing counterparty risk on long-running sessions
- Freeing up server working capital
- Periodic reconciliation

After settlement, the channel account's `settled`
field on-chain reflects
the claimed amount. The server MUST update
`settledOnChain` after confirmation and continues
accepting vouchers for amounts above the new settled
baseline.

## Crash Safety

Servers MUST persist metering state increments
BEFORE delivering the response. Servers SHOULD
support idempotency keys for exactly-once delivery.
More precisely, servers MUST persist both:

- `acceptedCumulative` BEFORE relying on new voucher
  balance; and
- `spentAmount` BEFORE or atomically with delivering
  the metered service.

Servers SHOULD use transactional storage or
write-ahead logging to ensure recovery after process
or machine crashes.

## Concurrency and Idempotency

Servers MUST serialize voucher acceptance and debit
processing per `channelId`. Voucher updates arriving
on different HTTP connections or multiplexed streams
MUST be processed atomically with respect to:

- `acceptedCumulative`;
- `spentAmount`; and
- `closeRequestedAt`.

Servers MUST treat voucher submissions idempotently:

- Resubmitting a voucher with the same
  `cumulativeAmount` as the highest accepted voucher
  MUST succeed and MUST NOT change channel state.
- Submitting a voucher with lower `cumulativeAmount`
  than the highest accepted voucher SHOULD return the
  current receipt state and MUST NOT reduce channel
  state.
- Clients MAY safely retry voucher submissions after
  network failures.

Clients SHOULD include an `Idempotency-Key` header on
metered HTTP requests. Servers SHOULD cache
`(challengeId, idempotencyKey)` pairs and MUST NOT
increment `spentAmount` twice for a duplicate
idempotent request.

# Settlement Procedure

## Open

1. Verify the open transaction contains the expected
   channel program instructions (create PDA +
   initialize channel + deposit transfer).
2. Recompute the expected PDA from the transaction's
   payer, payee, asset, authorized signer, salt, and
   channel program ID. Verify it equals the declared
   `channelId`.
3. Verify the transaction's fee payer matches the
   challenge policy:
   - if `feePayer` is `true`, the fee payer MUST equal
     `feePayerKey`;
   - otherwise the payer funds the transaction.
4. Verify the transaction does not include unrelated
   writable accounts or instructions that could
   redirect funds or mutate channel parameters.
   The server SHOULD reject transactions that route
   value through unexpected external programs.
5. If fee payer mode: co-sign and broadcast.
   Otherwise: broadcast as-is.
6. Verify channel state on-chain after confirmation:
   - payer matches transaction signer;
   - payee matches the challenged recipient;
   - token/asset matches the challenge currency;
   - deposit matches the requested amount;
   - authorized signer matches the open parameters;
   - channel is not finalized; and
   - `closeRequestedAt == 0`.
7. Verify the initial voucher against the confirmed
   channel state.
8. Create server-side channel state.
9. Return 200 with receipt.

## Voucher Update (No Settlement)

1. Verify voucher signature and monotonicity.
2. Verify the channel is open and has no pending
   forced close.
3. Persist `acceptedCumulative`.
4. Debit `cost` from available balance by persisting
   `spentAmount`.
5. Return 200 with receipt.

## TopUp

1. If fee payer mode: co-sign and broadcast.
   Otherwise: broadcast as-is.
2. Verify the top-up transaction targets the expected
   channel PDA and channel program and only increases
   deposit for that channel.
3. Verify deposit increase on-chain.
4. Increase `escrowedAmount`.
5. If the program cleared `closeRequestedAt`, clear it
   in server-side state as well.
6. Return 204 with receipt.

## Close (Cooperative)

1. If a final voucher is provided and authorizes an
   amount above `settledOnChain`, verify it.
2. Build and broadcast a close transaction:
   settle any final delta + refund remainder
   (atomic).
3. Mark channel as `"closed"`.
4. Persist final `settledOnChain` and terminal
   accounting state after confirmation.
5. Return 204 with receipt containing `txHash`.

## Forced Close (Client-Initiated)

If the server becomes unresponsive, the client can
force-close the channel:

1. Client calls requestClose on the channel program.
2. Grace period begins (RECOMMENDED: 15 minutes).
3. During the grace period, the server MAY still
   call settle with the latest voucher.
4. After the grace period, the client calls withdraw
   to recover `deposit - settled`.

This ensures the client can always recover unspent
funds, even if the server disappears.

# Receipt Format

Receipts are returned in the `Payment-Receipt` header.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `method` | string | REQUIRED | `"solana"` |
| `intent` | string | REQUIRED | `"session"` |
| `reference` | string | REQUIRED | Channel identifier |
| `status` | string | REQUIRED | `"success"` |
| `timestamp` | string | REQUIRED | RFC 3339 timestamp |
| `challengeId` | string | OPTIONAL | Challenge identifier for audit correlation |
| `acceptedCumulative` | string | REQUIRED | Highest voucher amount accepted |
| `spent` | string | REQUIRED | Total amount charged so far |

For close actions, the receipt MAY additionally
include:

| Field | Type | Description |
|-------|------|-------------|
| `txHash` | string | Settlement transaction signature |
| `spent` | string | Total amount settled |
| `refunded` | string | Amount refunded to client |

For streaming responses, servers SHOULD include the
receipt in the initial response headers and SHOULD
emit a final receipt when the stream completes. When
balance is exhausted mid-stream, servers SHOULD pause
delivery and request a higher voucher or top-up
rather than serving beyond the authorized balance.

## Voucher Submission Transport

Voucher updates and top-up requests SHOULD be
submitted to the same resource URI that requires
payment. This allows session payment to compose with
arbitrary protected endpoints without a dedicated
payment control plane route.

Clients MAY use `HEAD` for voucher-only or top-up-only
requests when no response body is required. Servers
SHOULD support such requests where practical.

# Error Responses

Servers MUST use the standard problem types defined
in {{I-D.httpauth-payment}}: `malformed-credential`,
`invalid-challenge`, and `verification-failed`. The
`detail` field SHOULD describe the specific failure
(e.g., "Amount exceeds
deposit", "Channel not found").

All error responses MUST include a fresh challenge in
`WWW-Authenticate`.

# Security Considerations

## Transport Security

All communication MUST use TLS 1.2 or higher.

## Escrow Safety

Funds are held by the channel program, not the
server. The server can only claim funds by presenting
valid voucher signatures to the program. The client
can always recover unspent funds via forced close
after the grace period.

## Voucher Replay Protection

Vouchers are bound to a specific channel via
`channelId` and ordered by `cumulativeAmount`. A voucher
from one channel
cannot be replayed in another.

This replay protection depends on deterministic PDA
derivation. The channel address MUST be bound to the
channel program ID and channel open parameters so that
vouchers cannot be replayed across different channel
program deployments or different Solana clusters.

## Cumulative Amount Safety

Vouchers authorize cumulative totals (not deltas).
A compromised voucher only authorizes up to its
stated amount. The channel program enforces that
settlements never exceed the deposit.

## Grace Period Security

The grace period prevents a race condition where the
payer withdraws before the server can settle. Without
it, a malicious payer could use the service, then
immediately withdraw. The server has the grace period
to submit any outstanding vouchers.

TopUp cancels pending close requests, preventing a
grief attack where the payer requests close
repeatedly to disrupt the session.

Servers MUST stop accepting new service vouchers once
`closeRequestedAt` is set. During the grace period,
the server MAY use the latest previously accepted
voucher to settle or cooperatively close the channel,
but SHOULD NOT continue serving new metered content
unless the close request is cancelled by a confirmed
top-up.

## Delegated Signer Risks

If delegated signing is used, a compromised delegated
key can authorize spend up to the delegation's limit.
Implementations SHOULD use short TTLs for delegated
keys and provide mechanisms to revoke them.

## Channel Program Trust

Clients MUST verify the `methodDetails.channelProgram`
in the challenge matches a known, audited program
before depositing funds. A malicious server could
specify a program that steals deposits.

## CPI and Program-ID Validation

Channel programs frequently rely on external Solana
programs, including the System Program, SPL Token or
Token-2022, Associated Token Program, and native
signature-verification programs. Implementations MUST
validate every external program account used in CPI
against the expected canonical program ID before
invocation. Implementations MUST NOT allow
user-controlled program accounts to influence escrow,
settlement, refund, or signature-verification CPIs.

If multiple token-program variants are supported,
implementations MUST bind the chosen token-program
variant into channel creation and subsequent account
validation. A channel opened for one token-program
variant MUST NOT be settled or refunded through a
different token-program account.

## Account Ownership Validation

Before deserializing or mutating any account,
implementations MUST validate the expected owner for:

- the channel PDA account;
- any escrow SOL or token-holding account;
- any mint account referenced by the channel; and
- any payer or payee token account used for settlement
  or refund.

Servers performing off-chain verification SHOULD also
verify account ownership and program ownership against
RPC state before accepting an open, top-up, settle, or
close flow as valid.

## Channel Exhaustion

A malicious client could open many channels with
small deposits, consuming on-chain storage. Channel
programs SHOULD require a minimum deposit that
covers the rent cost of the channel account.

Servers SHOULD also enforce a minimum economically
useful deposit to avoid channel spam with balances too
small to justify signature verification, storage, and
settlement overhead.

## Denial of Service

To mitigate voucher flooding and channel griefing:

- servers SHOULD rate-limit voucher submissions per
  channel;
- servers SHOULD perform cheap format and monotonicity
  checks before expensive signature verification;
- servers MAY enforce a minimum voucher delta; and
- servers SHOULD refuse channels with prolonged
  inactivity or uneconomic deposit sizes.

## Clock Skew

Voucher expiration depends on timestamp comparison.
Servers MUST allow configurable clock skew tolerance
(RECOMMENDED: 30 seconds).

## Solana Verification Programs

This specification uses Solana-native verification
primitives where possible. The base interoperable path
is Ed25519, using either:

- an `ed25519` verification instruction in the same
  transaction as `settle` or `close`, with the channel
  program reading the instruction sysvar to confirm
  success; or
- direct in-program verification if compute budget and
  implementation constraints permit.

Implementations that support delegated `secp256r1`
passkey signers SHOULD use Solana's native
`Secp256r1SigVerify1111111111111111111111111`
verification program and MUST define a distinct
`signatureType` and wire format for that extension.

# IANA Considerations

## Payment Intent Registration

This document requests registration of the following
entry in the "HTTP Payment Intents" registry:

| Intent | Applicable Methods | Description | Reference |
|--------|-------------------|-------------|-----------|
| `session` | `solana` | Metered Solana payments via off-chain vouchers | This document |

--- back

# Acknowledgements

The authors thank the Tempo team for their input on this 
specification.
