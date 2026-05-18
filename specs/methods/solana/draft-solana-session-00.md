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
  - name: Jo
    ins: Desormeaux
    email: jo.desormeaux@solana.org
    org: Solana Foundation
  - name: Michael Assaf
    ins: M. Assaf
    email: michael@moonsonglabs.com
    org: Moonsong Labs

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
  can include the channel-PDA creation, escrow ATA
  creation, deposit transfer, and splits commitment in
  a single transaction. Similarly, cooperative close
  can bundle `settleAndFinalize` and `distribute` so
  the merchant payout, payer refund, treasury sweep,
  and PDA tombstone all land atomically.

- **Fee payer separation**: The server can sponsor the
  cooperative on-chain operations it submits (open,
  topUp, settle, settleAndFinalize, distribute) so the
  client never needs SOL for transaction fees during
  the normal session lifecycle. Escape-route
  instructions (requestClose, finalize, withdrawPayer)
  are client-submitted and self-funded.

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
     |  (2) 402 (pricing, asset, |                  |
     |       splits, grace)      |                  |
     |<------------------------- |                  |
     |                           |                  |
     |  (3) open (deposit tx,    |                  |
     |       no initial voucher) |                  |
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
     |        voucher, optional) |                  |
     |-------------------------> |                  |
     |                           | (11) settleAnd-  |
     |                           | Finalize +       |
     |                           | distribute       |
     |                           |----------------> |
     |  (12) 200 OK + Receipt    |                  |
     |<------------------------- |                  |
     |                           |                  |
~~~

Steps 6–9 are off-chain: the client signs a voucher
authorizing cumulative spend, the server verifies the
signature and serves the resource. No on-chain
transaction occurs per request.

Step 11 typically bundles `settleAndFinalize` and
`distribute` in the same transaction so the
merchant payout, payer refund, treasury sweep, and
PDA tombstone all land atomically.

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

This specification uses two distinct encoding regimes:

1. **HTTP envelope canonicalization.** Challenge
   payloads (`request` auth-param), credential
   payloads (`Authorization: Payment` header bodies),
   and receipts use the same encoding as the Solana
   charge intent: JCS-serialized {{RFC8785}} JSON,
   base64url-encoded {{RFC4648}} without padding.

2. **On-chain signed-payload encoding.** The bytes
   the payer's Ed25519 key signs to authorize spend
   are produced by Borsh-encoding the on-chain
   `Voucher` struct (see {{on-chain-voucher-encoding}}).
   These bytes are the exact message verified by
   Solana's native `ed25519` precompile and read back
   by the channel program via the Instructions
   sysvar. Using a fixed-layout binary encoding here
   removes the need to repack between the HTTP JSON
   shape and the precompile message, and makes the
   on-chain verification a single byte-equality
   check.

JCS produces deterministic JSON bytes for header
canonicalization but is unnecessary for the inner
signed payload: the on-chain Borsh layout is
deterministic by construction.

# Channel Program Interface

The channel program manages escrow accounts and
enforces settlement rules. This section defines the
logical interface that conforming channel programs
MUST implement.

## Channel State

Each channel is represented by an on-chain account
(typically a PDA derived from payer, payee, mint,
authorized signer, and a salt) with the following
logical fields:

| Field | Type | Storage | Description |
|-------|------|---------|-------------|
| `discriminator` | u8 | Account state | Non-zero account-type tag (`Channel`); rejected when 0 so zero-initialized PDAs cannot impersonate a channel |
| `version` | u8 | Account state | Account-layout version; lets implementations evolve fields without colliding with `ClosedChannel` |
| `bump` | u8 | Account state | Canonical PDA bump |
| `status` | u8 | Account state | `Open` / `Closing` / `Finalized` enum value |
| `salt` | u64 | Seed + Account state | PDA disambiguator. Persisted so the channel PDA can re-derive its own seeds for self-signed CPIs (refunds, distribution) without off-chain inputs |
| `deposit` | u64 | Account state | Total amount currently escrowed |
| `settled` | u64 | Account state | Cumulative amount authorized for distribution (voucher watermark) |
| `paidOut` | u64 | Account state | Cumulative amount already distributed to the merchant side; `paidOut <= settled` |
| `closureStartedAt` | i64 | Account state | Unix timestamp when `requestClose` was called (0 if not set; cleared on `Finalized`) |
| `payerWithdrawnAt` | i64 | Account state | Unix timestamp of the payer refund (0 if not yet); guards against double-refund when both `withdrawPayer` and `distribute` can pay the payer |
| `gracePeriod` | u32 | Account state | Seconds between `requestClose` and permissionless `finalize`. Per-channel, set at `open`, so a single program deployment can host channels with differing dispute windows |
| `distributionHash` | [u8;32] | Account state | Hash digest of the canonical splits preimage committed at `open`; `distribute` MUST re-verify this hash before paying recipients |
| `payer` | Pubkey | Seed + Account state | Client who deposited funds |
| `payee` | Pubkey | Seed + Account state | Server authorized to settle; receives the implicit-remainder share on `distribute` |
| `authorizedSigner` | Pubkey | Seed + Account state | Voucher signer (payer if not delegated) |
| `mint` | Pubkey | Seed + Account state | SPL Token or Token-2022 mint. Stored (not seed-only) so refund / distribution CPIs can be validated without re-binding seeds |

The `channelId` is the base58-encoded address of the
channel account (PDA). Channel programs MUST derive
the channel PDA deterministically from channel
parameters and the program ID. At minimum, the seed
set MUST bind the PDA to:

- the payer public key;
- the payee public key;
- the mint address (native SOL is unsupported; see
  {{native-sol}});
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

Creates the channel account, transfers the initial
deposit from the payer, and commits a hash of the
distribution splits preimage. The payer MUST be a
signer.

| Parameter | Type | Description |
|-----------|------|-------------|
| `salt` | u64 | PDA disambiguator |
| `deposit` | u64 | Initial deposit in base units; MUST be non-zero |
| `gracePeriod` | u32 | Forced-close grace period in seconds; stored per-channel |
| `distributionSplits` | `(Pubkey, u16)[]` | Splits preimage; canonical encoding hashed into `distributionHash` (see {{splits-canonicalization}}) |

`open` MUST reject the instruction when the target
PDA already exists with the `ClosedChannel`
discriminator; reopening a previously finalized
channel PDA is forbidden regardless of seed inputs.
`open` MUST reject any `distributionSplits` whose
preimage is malformed, whose total share exceeds
10000 bps, which contains duplicate recipients, or
which lists the derived channel PDA as a recipient.
Mints carrying Token-2022 extensions outside the
allow-list (see {{token-extension-policy}}) MUST be
rejected.

`open` does NOT carry an initial voucher; the first
voucher is exchanged off-chain after confirmation.

### settle

Advances the on-chain `settled` watermark using a
payer-signed voucher. Permissionless; authority is
the voucher signature.

| Parameter | Type | Description |
|-----------|------|-------------|
| `voucher` | `VoucherArgs` | On-chain voucher payload (see {{on-chain-voucher-encoding}}) |

The submitter MUST bundle a Solana native `ed25519`
precompile instruction immediately before `settle`
in the same transaction. The program reads the
verified message bytes via the Instructions sysvar,
asserts they byte-equal the `voucher` argument, and
asserts the precompile-recorded signer equals
`authorizedSigner`. The program then verifies
`settled < voucher.cumulativeAmount <= deposit` and
writes `settled = voucher.cumulativeAmount`. No
token transfer occurs in `settle`.

### topUp

Payer transfers additional funds to the escrow.

| Parameter | Type | Description |
|-----------|------|-------------|
| `amount` | u64 | Amount to add in base units; MUST be non-zero |

`topUp` requires `status == Open` and MUST be
rejected when `status == Closing`. Implementations
of this specification do NOT clear `closureStartedAt`
via `topUp`. The payer MUST be a signer.

### requestClose

Payer initiates a forced close. Sets
`closureStartedAt = Clock::get().unix_timestamp`,
`status = Closing`. Requires `status == Open`. The
payer MUST be a signer.

### finalize

Permissionless post-grace crank. Transitions
`Closing -> Finalized` once
`now >= closureStartedAt + gracePeriod`, clears
`closureStartedAt`, and freezes `settled`. No
token transfer occurs.

### settleAndFinalize

Payee-initiated cooperative close. Optionally
applies one final voucher (using the same
precompile-verified path as `settle`), then
transitions the channel to `Finalized`.

| Parameter | Type | Description |
|-----------|------|-------------|
| `voucher` | `VoucherArgs` | Final voucher payload (used when `hasVoucher != 0`) |
| `hasVoucher` | u8 | `0` skips voucher verification; non-zero applies `voucher` |

The payee MUST be a signer. Callable from `Open`
and from `Closing` while `now < closureStartedAt + gracePeriod`;
after the grace deadline use `finalize` instead. No
token transfer occurs.

### distribute

Pays the merchant-side pool out of escrow according
to the splits preimage committed at `open`.
Permissionless; authority is the on-chain hash
commitment.

| Parameter | Type | Description |
|-----------|------|-------------|
| `distributionSplits` | `(Pubkey, u16)[]` | Splits preimage (see {{splits-canonicalization}}); rehashed and MUST equal `distributionHash` |

Recipient token accounts are supplied as the dynamic
account tail, in the same order as the preimage
entries. Each MUST be the canonical ATA for
`(recipient, channel.mint, channel.tokenProgram)`.

For `pool = settled - paidOut`:

- recipient `i`: `floor(pool * bps[i] / 10000)`;
- payee: `floor(pool * (10000 - Σ bps) / 10000)`.

`paidOut` is incremented by the total distributed.

From `Open`, `distribute` requires `pool > 0`,
leaves flooring residual in the escrow ATA, and
keeps the channel `Open`. From `Finalized`,
`distribute` additionally — when
`payerWithdrawnAt == 0` — transfers
`deposit - settled` to the payer, stamps
`payerWithdrawnAt`, sweeps residual to the treasury
ATA, closes the escrow ATA, and tombstones the
channel PDA (see {{tombstoning}}). `distribute`
MUST NOT be callable from `Closing`.

### withdrawPayer

One-shot payer refund in `Finalized` that does NOT
tombstone the PDA. The program requires
`status == Finalized` and `payerWithdrawnAt == 0`,
transfers `deposit - settled` to the payer, and
stamps `payerWithdrawnAt`. The payer MUST be a
signer.

### Tombstoning {#tombstoning}

The `Finalized` branch of `distribute` performs
tombstoning. The program MUST NOT fully deallocate
the channel account; it MUST realloc the account
data to 1 byte and write the `ClosedChannel`
discriminator at offset 0. The rent difference
between the pre-tombstone balance and the 1-byte
tombstone rent-exempt minimum MUST be returned to
the payer. `withdrawPayer` MUST NOT tombstone.

Implementations MUST NOT treat a fee-payer
signature as satisfying payer or payee authority
checks on any authority-gated instruction above.

## Grace Period

The grace period (RECOMMENDED: 15 minutes) protects
the payee. If the payer calls `requestClose` while
the payee has unsubmitted vouchers, the payee has
until the grace period expires to call `settle`
followed by `settleAndFinalize` (or to bundle a
voucher into `settleAndFinalize` directly).

Without a grace period, the payer could
`requestClose`, immediately call `finalize`, and
sweep funds before the server has time to settle.

## Access Control

| Instruction | Caller | Gating |
|-------------|--------|--------|
| open | Payer | Payer signs the deposit transfer |
| settle | Anyone (permissionless crank) | Precompile-verified Ed25519 voucher from `authorizedSigner` |
| topUp | Payer | Payer signs the additional transfer; rejected when `status != Open` |
| requestClose | Payer | Payer signer equals channel `payer` |
| finalize | Anyone (permissionless crank) | `status == Closing` and elapsed grace period |
| settleAndFinalize | Payee | Payee signer equals channel `payee` |
| distribute | Anyone (permissionless crank) | On-chain hash commitment to splits preimage |
| withdrawPayer | Payer | Payer signer equals channel `payer` and `status == Finalized` |

# Request Schema

## Shared Fields

amount
: REQUIRED. Price per unit of service in the token's
  smallest unit, encoded as a decimal string.

unitType
: OPTIONAL. Unit being priced (for example,
  `"request"`, `"token"`, or `"byte"`).

suggestedDeposit
: OPTIONAL. Suggested initial channel deposit in base
  units. Clients MAY deposit less or more depending on
  expected usage.

minimumDeposit
: OPTIONAL. Hard floor on initial channel deposit in
  base units. Enforced at the HTTP layer (not on
  chain). Servers MUST reject `POST /channel/open`
  payloads with `depositAmount < minimumDeposit`.
  Implementations SHOULD set this above the rent
  cost of the channel account plus a minimum
  economically useful balance to avoid spam.

recipient
: REQUIRED. Base58-encoded public key of the server's
  account that will receive settlement funds.

currency
: REQUIRED. Base58-encoded SPL token mint address.
  Native SOL is not supported (see {{native-sol}});
  clients wishing to pay in SOL MUST wrap it to wSOL
  (`So11111111111111111111111111111111111111112`)
  before opening a channel. {#native-sol}

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
  (RECOMMENDED: 900). Stored per-channel in
  `Channel.gracePeriod` at `open`.

distributionSplits
: OPTIONAL. Ordered list of `{recipient, shareBps}`
  entries the merchant proposes to bind into the
  channel at `open`. The payee receives the implicit
  remainder share `10000 − Σ shareBps`; the explicit
  list therefore covers only co-recipients, not the
  payee itself.

  Each entry MUST have `shareBps > 0`. The list MUST
  satisfy `0 ≤ Σ shareBps ≤ 10000`. The list size is
  bounded by an implementation-defined
  `MAX_DISTRIBUTION_RECIPIENTS` (RECOMMENDED: 32).

  When omitted, the channel behaves as a vanilla
  two-party channel in which the payee receives the
  full distributed pool.

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
| `payee` | string | REQUIRED | Base58 public key of the channel payee (matches `recipient` in the 402 challenge) |
| `mint` | string | REQUIRED | Base58 SPL Token / Token-2022 mint (matches `currency` in the 402 challenge) |
| `authorizedSigner` | string | REQUIRED | Base58 public key bound into the PDA seeds as the voucher signer; equals `payer` when no delegation is used |
| `salt` | string | REQUIRED | Decimal u64 PDA disambiguator |
| `depositAmount` | string | REQUIRED | Initial deposit in base units; MUST satisfy `depositAmount >= methodDetails.minimumDeposit` |
| `gracePeriodSeconds` | integer | REQUIRED | Grace-period seconds bound into channel state at `open`; MUST match `methodDetails.gracePeriodSeconds` (or the server-policy default) |
| `distributionSplits` | array | OPTIONAL | Splits preimage (see `methodDetails.distributionSplits`); MUST byte-match the splits proposed in the 402 challenge |
| `authorizationPolicy` | object | OPTIONAL | Voucher signer policy. When present, MUST be consistent with `authorizedSigner` |
| `transaction` | string | REQUIRED | Base64-encoded (standard alphabet, padded) signed or partially signed transaction |
| `expiresAt` | string | OPTIONAL | Session expiration (RFC 3339) |
| `capabilities` | object | OPTIONAL | Implementation-specific extensions |

The `transaction` contains the open instruction(s).
When `feePayer` is `true`, the client partially signs
(transfer authority only) and the server co-signs as
fee payer before broadcasting — same pattern as the
charge intent's pull mode.

`Action: "open"` MUST NOT carry an initial voucher.
The first voucher is exchanged off-chain in a
subsequent metered request, after the channel is
confirmed on-chain. This keeps the open path
focused on channel construction and avoids burning
on-chain compute on a signature for a single
request's worth of authorization.

`Action: "open"` MUST NOT carry a `bump` field. The
channel PDA's canonical bump is derived on-chain via
`find_program_address` and validated by the program's
direct address check, so any wire-supplied bump is
redundant. Servers MUST reject open envelopes that
include a `bump` field using the `malformed-credential`
problem type. Silently accepting and ignoring a wire
`bump` is forbidden because a client whose derivation
is buggy can compute a wrong bump that nonetheless
pairs with the canonical PDA address — a mismatch the
on-chain address check cannot catch.

Servers MUST derive `payer`, `channelId`,
`depositAmount`, `authorizationPolicy`, delegated signer
settings, the distribution splits commitment, and
all other program-relevant open parameters from the
signed transaction and confirmed on-chain state.
Servers MUST NOT trust these values solely because
they appear in the HTTP payload. Servers MUST also
strictly validate that the on-chain `distributionSplits`,
`payee`, and `mint` exactly match what was proposed
in the 402 challenge; failing to do so allows a
malicious client to redirect the merchant-side
payout.

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

`Action: "close"` is a request for the server to
broadcast `settleAndFinalize` (optionally bundled
with `distribute` in the same transaction). Unlike
`Action: "open"` and `Action: "topUp"`, the
close credential does NOT carry a pre-signed
transaction: cooperative close requires the payee
signature, which the server controls, and the
server constructs and broadcasts the transaction
itself.

When `voucher` is present, it MUST strictly advance
the on-chain watermark
(`settled < voucher.cumulativeAmount`). A supplied
voucher at or below the current on-chain `settled`
is invalid and MUST cause `settleAndFinalize` to
reject; clients SHOULD omit `voucher` instead when
no additional settlement is needed. When `voucher`
is omitted, the server finalizes at the current
on-chain `settled` watermark.

See {{close-cooperative}} for the full settlement
procedure, including how `settleAndFinalize` and
`distribute` are bundled.

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

## Voucher Signing {#on-chain-voucher-encoding}

The signed voucher payload is 48 bytes in fixed
Borsh layout:

| Offset | Length | Field | Encoding |
|--------|--------|-------|----------|
| 0 | 32 | `channelId` | Raw Solana address bytes |
| 32 | 8 | `cumulativeAmount` | u64 little-endian |
| 40 | 8 | `expiresAt` | i64 little-endian; `0` = no expiration |

Signing:

1. Serialize the voucher data into the layout above.
2. Sign with Ed25519 using `authorizedSigner`'s key.
3. Encode the signature as base58 for the HTTP
   `signature` field.

The Borsh bytes are authoritative for signature
verification. The HTTP JSON shape is a transport
view; clients and servers MUST NOT influence what
bytes are signed via the JSON. The same layout is
the on-chain argument for `settle` and (without the
`hasVoucher` byte) for `settleAndFinalize`.

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

6. Verify the channel account discriminator is not
   `ClosedChannel` (i.e., the channel has not been
   tombstoned by `distribute`).

7. Verify `status == Open` (i.e., `closureStartedAt == 0`
   and the channel has not yet been finalized).
   Servers MUST reject new voucher acceptance on
   channels with a pending forced close unless the
   voucher is being used only to drive
   `settleAndFinalize`.

8. Verify `cumulativeAmount <= escrowedAmount` (does
   not exceed deposit).

9. If `expiresAt` is present, verify the voucher has
   not expired (with configurable clock skew
   tolerance).

10. Persist the new `acceptedCumulative` amount to
    durable storage BEFORE serving the resource.

## On-Chain Voucher Verification

When the channel program executes `settle` or
`settleAndFinalize` (with a voucher), the voucher
signature MUST be verified on-chain. On Solana, this
can be done by:

- Including an `ed25519` program instruction in the
  same transaction that verifies the signature
  immediately before the channel instruction
  executes.

- Or implementing Ed25519 verification directly in
  the channel program (higher compute cost).

The first approach is preferred as it uses Solana's
native signature verification at minimal compute
cost. The precompile instruction MUST immediately
precede the channel instruction in the same
transaction.

When using instruction introspection to consume a
native signature-verification instruction, channel
programs MUST:

- validate the Instructions sysvar account address;
- use checked instruction-loading helpers provided by
  the Solana SDK;
- correlate the verified message bytes to the exact
  on-chain voucher payload accepted by the channel
  instruction in the same transaction
  (see {{on-chain-voucher-encoding}}); the bytes the
  precompile recorded MUST byte-equal the channel
  instruction's voucher argument, and the precompile-
  recorded signer MUST equal `authorizedSigner`;
- reject signature-verification instructions that are
  replayed, unrelated, or positioned such that the
  channel program cannot unambiguously determine which
  verified message they authorize.

# Distribution Splits {#splits-canonicalization}

Channels MAY commit a multi-recipient split of the
merchant-side pool at `open`. The split is a list
of `(recipient, shareBps)` entries; the payee
receives the implicit-remainder share
`10000 − Σ shareBps` and is NOT listed explicitly.

## Canonical Preimage

The byte layout hashed at `open` and re-hashed at
`distribute`:

~~~
count (u32 LE) || [ recipient (32 bytes) || shareBps (u16 LE) ] × count
~~~

- `count == 0` is legal; the payee receives 100% of
  the pool.
- Every active entry MUST have `shareBps > 0`.
- `0 ≤ Σ shareBps ≤ 10000`.
- Recipients MUST be unique and MUST NOT equal the
  channel PDA itself.
- The list size is bounded by an
  implementation-defined `MAX_DISTRIBUTION_RECIPIENTS`
  (RECOMMENDED: 32).

## Hash Algorithm

Implementations MUST use a collision-resistant hash
with a 32-byte digest. The chosen algorithm MUST be
fixed at deployment and documented for clients so
they can reproduce it. Blake3 is RECOMMENDED; the
specific hash implementation (e.g., the `sol_blake3`
syscall versus a bundled library) is an
implementation detail that does not affect wire
compatibility.

## Distribution Math

For `pool = settled − paidOut`:

- recipient `i`: `floor(pool * shareBps[i] / 10000)`;
- payee: `floor(pool * (10000 − Σ shareBps) / 10000)`.

Flooring residual remains in the escrow ATA while
`status == Open`. At the `Finalized` branch of
`distribute`, residual is swept to the protocol
treasury ATA before the escrow ATA is closed.
The treasury account is a deployment-level address
documented out of band by the channel program.

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
| `closureStartedAt` | Pending forced-close timestamp, if any |

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
- `closureStartedAt`.

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
   channel program instruction (the reference
   implementation composes channel-PDA creation,
   escrow ATA creation, deposit transfer, and the
   `distributionHash` commitment in a single `open`
   instruction).
2. Recompute the expected PDA from the transaction's
   payer, payee, mint, authorized signer, and salt
   plus the channel program ID. Verify it equals the
   declared `channelId`.
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
5. Verify `depositAmount >= methodDetails.minimumDeposit`
   (when set) and that the on-chain `distributionHash`
   matches the digest of the canonical preimage of
   the splits proposed in the 402 challenge.
6. If fee payer mode: co-sign and broadcast.
   Otherwise: broadcast as-is.
7. Verify channel state on-chain after confirmation:
   - payer matches transaction signer;
   - payee matches the challenged recipient;
   - mint matches the challenge currency;
   - deposit matches the requested amount;
   - authorized signer matches the open parameters;
   - `gracePeriod` matches the challenge policy;
   - `distributionHash` matches the proposed splits;
   - channel is not finalized; and
   - `closureStartedAt` is `0`.
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
3. Verify the on-chain deposit increase after
   confirmation.
4. Increase `escrowedAmount` in server-side state.
5. Return 200 with receipt.

`topUp` is callable only while `status == Open` and
MUST NOT clear `closureStartedAt`. Once forced close
is requested, the paths forward are
`settleAndFinalize` (within grace) or `finalize`
(after grace).

## Close (Cooperative) {#close-cooperative}

1. If a final voucher is provided, verify it (it
   MUST strictly advance the on-chain watermark).
2. Build and broadcast `settleAndFinalize`. The
   server SHOULD bundle `distribute` in the same
   transaction so the merchant-side payout, payer
   refund, treasury sweep, and PDA tombstone all
   land atomically.
3. Mark the channel as `"closed"` in server-side
   state.
4. Persist final `settledOnChain` and terminal
   accounting state after confirmation.
5. Return 200 with receipt containing `txHash` and
   (if `distribute` ran) the refunded amount.

## Forced Close (Client-Initiated)

If the server becomes unresponsive, the client can
force-close the channel:

1. Client submits `requestClose` directly to RPC.
2. Grace period begins (per-channel `gracePeriod`).
3. During the grace period, the server MAY still
   call `settleAndFinalize` with the latest
   voucher.
4. After the grace period, any party submits
   `finalize` (permissionless) to transition the
   channel to `Finalized`.
5. The payer MAY submit `withdrawPayer` to recover
   `deposit - settled` immediately. Independently,
   any party MAY submit `distribute` with the
   splits preimage; the merchant side is paid, any
   pending payer refund is also paid, residual is
   swept to treasury, and the PDA is tombstoned.

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

Because `topUp` MUST NOT clear `closureStartedAt`,
servers MUST guard the equivalent grief vector at
the HTTP layer by rate-limiting `requestClose`
retries and refusing to extend service after a
forced-close broadcast.

Servers MUST stop accepting new service vouchers
once `closureStartedAt` is set. During the grace
period, the server MAY use the latest previously
accepted voucher to drive `settleAndFinalize` (and,
optionally, `distribute`). Servers MUST NOT resume
metered service after `closureStartedAt` is set.

## Delegated Signer Risks

If delegated signing is used, a compromised delegated
key can authorize spend up to the delegation's limit.
The `authorizedSigner` is bound into the PDA seed set
at open time and cannot be changed without closing and
reopening the channel. If a delegated signing key is
compromised, the payer's only recourse is to call
`requestClose`, but the attacker retains the ability
to sign vouchers up to the full deposit cap throughout
the entire grace period before funds can be recovered.
Implementations MUST treat delegated keys as
short-lived, single-session credentials with TTLs on
the order of minutes to bound exposure in the event
of a key compromise.

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

## Token-2022 Extension Policy {#token-extension-policy}

Implementations MUST enforce a closed allow-list of
permitted Token-2022 extensions at `open` and
re-validate it on every token-touching instruction.
Extension presence alone is disqualifying;
unlisted, unknown, or malformed extensions MUST be
rejected before any token movement.

The RECOMMENDED mint allow-list:

- `MetadataPointer`
- `TokenMetadata`
- `GroupPointer`
- `TokenGroup`
- `GroupMemberPointer`
- `TokenGroupMember`

The RECOMMENDED token-account allow-list:

- `ImmutableOwner`

All other extensions MUST be rejected:

| Extension | Reason |
|-----------|--------|
| `NonTransferable` | No transfer from escrow can succeed |
| `PermanentDelegate` | Delegate can move escrow arbitrarily |
| `DefaultAccountState` | Destination ATAs may be born non-`Initialized` |
| `ConfidentialTransferMint` | Channel program does not produce confidential-transfer proofs |
| `TransferFeeConfig` | Withheld fees desync `deposit` / `settled` from escrow |
| `TransferHook` | Hook program can revert any transfer |
| `InterestBearing` | Visible amount changes over time |
| `ScaledUiAmountConfig` | Display-vs-raw divergence breaks exact distribution |
| `Pausable` | Mint-level pause can block escrow release |
| `CpiGuard` / `MemoTransfer` (account) | Distribution CPIs use neither delegate flow nor memos |
| `MintCloseAuthority` | Mint identity can be recreated while channels reference it |

Implementations MUST NOT resolve transfer-hook extra
accounts, route through fee withholding, or honor
pause flags.

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
  transaction as `settle` or `settleAndFinalize`, with
  the channel program reading the Instructions sysvar
  to confirm success; or
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
