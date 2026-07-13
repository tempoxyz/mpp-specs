---
title: Solana Session Intent for HTTP Payment Authentication
abbrev: Solana Session
docname: draft-solana-session-00
version: 00
category: info
ipr: noModificationTrust200902
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
  I-D.ryan-httpauth-payment-01:
    title: "The 'Payment' HTTP Authentication Scheme"
    target: https://datatracker.ietf.org/doc/draft-ryan-httpauth-payment/01/
    author:
      - name: Brendan Ryan
      - name: Jake Moxey
    date: 2026-01
  I-D.payment-intent-session:
    title: "Session Intent for HTTP Payment Authentication"
    target: https://datatracker.ietf.org/doc/draft-payment-intent-session/
    author:
      - name: Brendan Ryan
      - name: Jake Moxey
      - name: Tom Meagher
    date: 2026-06

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

This document defines the "solana" payment method implementation
of the "session" intent registered by
{{I-D.payment-intent-session}}, for use within the Payment HTTP
Authentication Scheme {{I-D.ryan-httpauth-payment-01}}. Sessions
enable metered, streaming, or repeated-use access to resources
through off-chain vouchers backed by an on-chain escrow. The
client opens a payment channel by depositing into a channel
program, authorizes incremental spend via signed vouchers, and
settles on-chain when the session closes.

--- middle

# Introduction

HTTP Payment Authentication {{I-D.ryan-httpauth-payment-01}} defines
a challenge-response mechanism that gates access to resources
behind payments. The "session" intent and its shared semantics —
lifecycle operations, accounting invariants, request fields, and
receipt shape — are registered and defined by
{{I-D.payment-intent-session}}. This document defines how the
"solana" payment method implements that intent.

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
  can bundle `settleAndSeal` and `distribute` so
  the merchant payout, payer refund, treasury sweep,
  and escrow-ATA closure all land atomically and
  immediately — no token movement is ever slot-gated
  (see {{channel-closure}}).

- **Fee payer separation**: The server / operator can
  sponsor the cooperative on-chain operations it submits
  (open, topUp, settle, settleAndSeal, distribute,
  reclaim).
  The operator funds both the transaction fees AND the
  channel rent: it acts as the `rentPayer` that funds
  the channel PDA and escrow ATA rent at `open` and
  recovers that SOL rent after close — via the
  terminal `distribute`'s fast path or a later
  permissionless `reclaim` (see
  {{channel-closure}}). The client
  (`payer`) only ever moves stablecoin and never needs
  SOL during the normal session lifecycle. Because a
  SOL-free client cannot self-fund escape-route
  instructions (requestClose, seal, withdrawPayer),
  those instructions are permissionless or
  payer-authorized but MAY be submitted by the operator
  or any party; a client that does hold SOL MAY also
  submit them itself.

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
     |                           | Seal +           |
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

Step 11 typically bundles `settleAndSeal` and
`distribute` in the same transaction so the
merchant payout, payer refund, treasury sweep, and
escrow-ATA closure all land atomically and
immediately. The channel PDA itself is deallocated
in the same instruction when the epoch window of
{{channel-closure}} has already elapsed; otherwise
it is left `Distributed` and the operator's periodic
`reclaim` sweep recovers the PDA rent after the
window.

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
   the channel's `authorizedSigner` signs to authorize
   spend are produced by Borsh-encoding the on-chain
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
authorized signer, a salt, and the open slot) with the
following logical fields. Field names use camelCase; tag and
enum-variant values (`Channel`, `Open`, `Closing`,
`Sealed`, `Distributed`) use PascalCase by convention,
matching how they appear in Rust program source.

| Field | Type | Storage | Description |
|-------|------|---------|-------------|
| `discriminator` | u8 | Account state | Non-zero account-type tag (`Channel`); rejected when 0 so zero-initialized PDAs cannot impersonate a channel |
| `version` | u8 | Account state | Account-layout version; lets implementations evolve the account layout across program versions |
| `bump` | u8 | Account state | Canonical PDA bump |
| `status` | u8 | Account state | `Open` / `Closing` / `Sealed` / `Distributed` enum value. `Distributed` is terminal and fully drained — every token leg paid, escrow ATA closed — inert to every instruction except `reclaim` and holding only the PDA's own rent (see {{channel-closure}}) |
| `salt` | u64 | Seed + Account state | PDA disambiguator. Persisted so the channel PDA can re-derive its own seeds for self-signed CPIs (refunds, distribution) without off-chain inputs |
| `deposit` | u64 | Account state | Total amount currently escrowed |
| `settled` | u64 | Account state | Cumulative amount authorized for distribution (voucher watermark) |
| `payoutWatermark` | u64 | Account state | Distribution watermark (`payoutWatermark <= settled`); `distribute` advances it to `settled` and pays cumulative floor deltas between the old and new watermark (see {{splits-canonicalization}}) |
| `closureStartedAt` | i64 | Account state | Unix timestamp when `requestClose` was called (0 if not set; cleared on `Sealed`) |
| `payerWithdrawnAt` | i64 | Account state | Unix timestamp of the payer refund (0 if not yet); guards against double-refund when both `withdrawPayer` and `distribute` can pay the payer |
| `gracePeriod` | u32 | Account state | Non-zero seconds between `requestClose` and permissionless `seal`. Per-channel, set at `open`, so a single program deployment can host channels with differing dispute windows |
| `distributionHash` | [u8;32] | Account state | Hash digest of the canonical splits preimage committed at `open`; `distribute` MUST re-verify this hash before paying recipients |
| `payer` | Pubkey | Seed + Account state | Client who deposited funds |
| `payee` | Pubkey | Seed + Account state | Server authorized to settle; receives the implicit-remainder share on `distribute` |
| `authorizedSigner` | Pubkey | Seed + Account state | Voucher signer; MAY equal `payer` or a delegated signer |
| `mint` | Pubkey | Seed + Account state | SPL Token or Token-2022 mint. Stored (not seed-only) so refund / distribution CPIs can be validated without re-binding seeds |
| `rentPayer` | Pubkey | Account state | The operator / transaction submitter that funded the channel PDA and escrow ATA rent at `open`. Recorded so the terminal `distribute` (fast path) or the permissionless `reclaim` can drain the freed SOL rent to this account without an off-chain input. Distinct from `payer`: the client (`payer`) only moves stablecoin and never needs SOL |
| `openSlot` | u64 | Seed + Account state | Client-supplied per-incarnation epoch, carried in the `open` instruction data and window-validated against the Clock sysvar (see {{channel-closure}}). A PDA seed, so the channel address itself is per-incarnation and `channelId` alone identifies an incarnation; persisted for signer-seed reconstruction and as the reclaim-gate input |

The `channelId` is the base58-encoded address of the
channel account (PDA). Channel programs MUST derive
the channel PDA deterministically from channel
parameters and the program ID. At minimum, the seed
set MUST bind the PDA to:

- the payer public key;
- the payee public key;
- the mint address (native SOL is unsupported; clients
  wishing to pay in SOL MUST wrap to wSOL before opening
  a channel);
- a client-chosen salt or nonce;
- the authorized signer public key (or payer if no
  delegation is used); and
- the client-supplied `openSlot` epoch, so that each
  incarnation of the same participant tuple derives a
  distinct address (see {{channel-closure}}).

Once a channel is opened, vouchers for that channel
MUST verify under the channel's `authorizedSigner`.
No other signer is valid for that channel.

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

`Channel` state — `deposit`, `settled`,
`payoutWatermark`, and `payerWithdrawnAt` — is
authoritative for pending settlement value. The escrow
ATA balance and the channel PDA's lamports can exceed
those values, because third parties can prefund either
address; the program does not record those surpluses in
`Channel`. Off-chain consumers MUST derive spendable
capacity and pending settlement from channel state,
never from raw escrow ATA balances or PDA lamports.

The SOL rent backing the channel PDA and escrow ATA is
funded at `open` by `rentPayer` (the operator /
transaction submitter), not by the client. The freed
SOL rent is returned to `Channel.rentPayer` at close —
the escrow-ATA rent by the `Sealed` `distribute`,
and the channel PDA's own rent either in the same
instruction (fast path) or by a later permissionless
`reclaim` (see
{{channel-closure}}). The token `deposit` and any
surplus PDA lamports are independent of this rent
accounting: the token refund of `deposit - settled`
always goes to the `payer`, while surplus PDA lamports
drain to `rentPayer` at close.

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
| `gracePeriod` | u32 | Forced-close grace period in seconds; stored per-channel; encoded as `grace_period`; MUST be non-zero |
| `openSlot` | u64 | Client-supplied per-incarnation epoch; encoded as `open_slot`; window-validated against the Clock sysvar (see {{channel-closure}}). A PDA seed: it is a derivation input for the channel address, and servers MUST include it when re-deriving or validating `channelId`. The open transaction MUST land within `OPEN_SLOT_WINDOW` (1,500 slots — ~10 min at 400 ms slots) of this slot; standard transactions are bounded tighter still by the 150-block blockhash validity, while durable-nonce transactions get the full window. A flow that misses the window MUST re-derive with a fresh `openSlot` — and therefore a fresh `channelId` — and re-sign; no other protocol message carries an on-chain deadline |
| `distributionSplits` | `(Pubkey, u16)[]` | Splits preimage; canonical encoding hashed into `distributionHash` (see {{splits-canonicalization}}) |

The reference instruction-data layout after the
instruction discriminator is:

~~~
salt (u64 LE) || deposit (u64 LE) ||
grace_period (u32 LE) || open_slot (u64 LE) ||
count (u32 LE) || entries (count × 34 bytes)
~~~

`open` takes the following leading accounts, in this
exact order:

| Index | Account | Signer | Writable | Description |
|-------|---------|--------|----------|-------------|
| 0 | `payer` | Yes | Yes | Client depositing stablecoin; signs the deposit transfer |
| 1 | `rentPayer` | Yes | Yes | Operator / transaction submitter funding the SOL rent for the channel PDA and escrow ATA. MUST be the operator / fee-payer key already in scope (the same key that co-signs `open` as fee payer); a single operator signature satisfies both the fee-payer and `rentPayer` signer roles. Recorded into `Channel.rentPayer` so its rent can be reclaimed at close. There is no separate wire field for `rentPayer`; it is derived from the existing operator / fee payer |
| 2 | `payee` | No | No | Channel payee |
| 3 | `mint` | No | No | SPL Token / Token-2022 mint |
| 4 | `authorizedSigner` | No | No | Voucher signer bound into the PDA seeds |
| 5 | `channel` | No | Yes | Channel PDA being created |

The remaining accounts (payer token account, escrow
token account, token program, system program, rent,
associated-token program, and program-internal
accounts) follow `channel` in their fixed order.
Verifiers that read `open` accounts by fixed index MUST
account for `rentPayer` at index 1 and the resulting
`+1` shift of every account after `payer`, and MUST
verify that `accounts[1]` equals the operator /
fee-payer key.

The client (`payer`) only ever moves stablecoin and
never needs SOL: `rentPayer` funds all channel rent at
`open` and recovers it after close, via the terminal
`distribute`'s fast path or a later permissionless
`reclaim` (see {{channel-closure}}).

`open` MUST validate the client-supplied `openSlot`
against the Clock sysvar:
`openSlot <= clock.slot` and
`clock.slot - openSlot <= OPEN_SLOT_WINDOW` (see
{{channel-closure}}). Future slots MUST be strictly
rejected (reference error `OpenSlotOutOfWindow`,
code 2003): a far-future `openSlot` would otherwise
break the address-never-repeats argument of
{{reincarnation-replay}} and push the reclaim gate
arbitrarily far out, permanently stranding the
operator's PDA rent.
`open` MUST reject any `distributionSplits` whose
preimage is malformed, whose total share exceeds
10000 bps, which contains duplicate recipients, or
which lists the derived channel PDA as a recipient.
Mints carrying Token-2022 extensions outside the
allow-list (see {{token-extension-policy}}) MUST be
rejected.

The `gracePeriod` parameter MUST be non-zero. Channel
programs MUST reject `grace_period == 0`.

`open` does NOT curve-check `payee`; both on-curve and
PDA payees are permitted (see {{settle-and-seal}}).

`open` is prefund-tolerant. The channel PDA allocation
and the escrow ATA creation are both idempotent: a
prefunded but still-uninitialized channel PDA (a
system-owned, data-empty account holding only lamports)
or a pre-existing canonical escrow ATA is accepted
rather than reverting. Prefunded balances are never
credited to channel state — surplus PDA lamports drain
to `rentPayer` at close, and surplus escrow tokens are
swept to the treasury by the terminal `distribute`.

Servers MUST use a `salt` that keeps concurrent live
channels between the same participants distinct.
Reusing the full seed tuple — `(payer, payee, mint,
authorizedSigner, salt, openSlot)` — of a live or
still-`Distributed` channel reverts `open` (the PDA
still holds an initialized `Channel`); resume a live
channel instead of reopening it. Reopening a fully
closed relationship is legal by design and creates a
fresh channel at a **new address**: `distribute`'s
fast path or `reclaim` removed the old PDA, and
because `openSlot` is a PDA seed, the new incarnation
(the same `salt` is fine) necessarily carries a new
`openSlot` and therefore derives a different
`channelId` (see {{channel-closure}}). A lamport
donation to a deallocated channel address cannot block
reopening, because `open` is prefund-tolerant
(Transfer + Allocate + Assign).

`open` does NOT carry an initial voucher; the first
voucher is exchanged off-chain after confirmation.

### settle

Advances the on-chain `settled` watermark using a
voucher signed by `authorizedSigner`. Permissionless;
authority is the voucher signature.

`settle` takes no instruction-data arguments; the
voucher is carried entirely by the preceding Ed25519
precompile instruction.

The submitter MUST bundle a Solana native `ed25519`
precompile instruction immediately before `settle`
in the same transaction. The program reads the
verified message bytes via the Instructions sysvar,
decodes the voucher (`magic`, `channelId`,
`cumulativeAmount`, `expiresAt`) from them (see
{{on-chain-voucher-encoding}}), asserts the `magic`
prefix matches exactly (reference error
`VoucherBadMagic`, code 238), asserts
`channelId` equals the channel PDA address (reference
error `VoucherChannelMismatch`, code 232 — because
`openSlot` is a PDA seed, this address binding also
covers cross-incarnation replay; no separate epoch
check exists), and asserts the
precompile-recorded signer equals `authorizedSigner`.
The program then verifies
`settled < cumulativeAmount <= deposit` and
writes `settled = cumulativeAmount`. No
token transfer occurs in `settle`, and `settle` is
not slot-gated.

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

### seal

Permissionless post-grace crank. Transitions
`Closing -> Sealed` once
`now >= closureStartedAt + gracePeriod`, clears
`closureStartedAt`, and freezes `settled`. No
token transfer occurs.

### settleAndSeal {#settle-and-seal}

Payee-initiated cooperative close. Optionally
applies one final voucher (using the same
precompile-verified path as `settle`), then
transitions the channel to `Sealed`.

| Parameter | Type | Description |
|-----------|------|-------------|
| `hasVoucher` | u8 | `0` seals with no settlement (full refund); non-zero verifies and settles the voucher carried by the preceding Ed25519 precompile instruction (read via the Instructions sysvar) before sealing |

The payee MUST be a signer. Callable from `Open`
and from `Closing` while `now < closureStartedAt + gracePeriod`;
after the grace deadline use `seal` instead. No
token transfer occurs.

The `payee` MAY be an on-curve address or a
program-derived address (PDA). Because cooperative
close requires a transaction signer equal to
`Channel.payee`, a PDA payee can use this path only
when its owning program invokes `settleAndSeal`
via CPI with signer seeds. The permissionless
`settle`, `seal`, and `distribute` cranks need no
payee signature.

### distribute

Pays the merchant-side pool out of escrow according
to the splits preimage committed at `open`.
Permissionless; authority is the on-chain hash
commitment.

| Parameter | Type | Description |
|-----------|------|-------------|
| `distributionSplits` | `(Pubkey, u16)[]` | Splits preimage (see {{splits-canonicalization}}); rehashed and MUST equal `distributionHash` |

`distribute` takes a fixed head of accounts (channel,
`payer`, `rentPayer`, escrow token account, payer token
account, payee token account, treasury token account,
mint, token program, and program-internal accounts)
followed by the dynamic recipient-ATA tail. The
`rentPayer` account (writable, NOT a signer) MUST be
positioned immediately after `payer` and MUST equal
`Channel.rentPayer`; at the `Sealed` branch it
receives the SOL rent freed by closing the escrow
ATA, plus every lamport of the channel PDA when the
fast path deallocates the account in place (see
{{channel-closure}}).

Recipient token accounts are supplied as the dynamic
account tail, in the same order as the preimage
entries. Each MUST be the canonical ATA for
`(recipient, channel.mint, channel.tokenProgram)`. A
`distribute` carrying enough recipient accounts to
exceed the legacy transaction account-key budget — in
practice at `MAX_DISTRIBUTION_RECIPIENTS` recipients
(RECOMMENDED 32) — MUST be sent as a version-0
transaction with an address lookup table indexing the
recipient ATAs.

Each beneficiary is paid a cumulative floor delta
keyed to `payoutWatermark`:

- recipient `i`:
  `floor(settled * shareBps[i] / 10000) − floor(payoutWatermark * shareBps[i] / 10000)`;
- payee (implicit remainder):
  `floor(settled * (10000 − Σ shareBps) / 10000) − floor(payoutWatermark * (10000 − Σ shareBps) / 10000)`.

`distribute` then advances `payoutWatermark` to
`settled`.

From `Open`, `distribute` requires
`settled > payoutWatermark`, pays the cumulative floor
deltas, leaves flooring-residual dust in the escrow
ATA, advances `payoutWatermark` to `settled`, and keeps
the channel `Open`; later distributions compute fresh
deltas from the advanced watermark, so residual value
remains claimable as a share's cumulative entitlement
crosses the next whole unit. From `Sealed`,
`distribute` additionally — when
`payerWithdrawnAt == 0` — transfers the token refund
`deposit - settled` to the payer, stamps
`payerWithdrawnAt`, sweeps the final irreducible
residual dust to the treasury ATA, and closes the
escrow ATA. None of this token movement is
slot-gated: the `Sealed` branch runs immediately
and MUST NOT emit `ChannelCloseTooEarly`. In the
same instruction, when
`clock.slot > openSlot + OPEN_SLOT_WINDOW` already
holds, the channel PDA is fully deallocated in place
(fast path); otherwise the channel is set to the
terminal `Distributed` status and its rent is recovered
later by the permissionless `reclaim` (see
{{channel-closure}}). The freed SOL — the escrow ATA
rent plus, at deallocation, every lamport of the
channel PDA, including any prefund surplus — is
drained to `Channel.rentPayer` (the operator), not
the payer; the token refund still goes to the payer.
`distribute` MUST NOT be callable from `Closing` or
`Distributed`.

On a nonzero beneficiary share whose canonical ATA is
unusable — missing or uninitialized, frozen, closed or
malformed, carrying an unsupported Token-2022 account
extension, or with a reassigned authority — that share
is redirected to the treasury ATA, a `PayoutRedirected`
event is emitted, and `payoutWatermark` still advances.
The beneficiary permanently forfeits that share;
repairing the ATA later does not reclaim it, because
future deltas only cover newly settled amounts. The
same redirect applies to the payer refund ATA at
`Sealed` (the same instruction closes the escrow
ATA, so no later crank could pay the
refund). Malformed token-account data and wrong
(non-canonical) accounts hard-fail rather than
redirecting.

### withdrawPayer

One-shot payer refund in `Sealed` that does NOT
close or deallocate the channel PDA and is NOT
slot-gated. The program requires
`status == Sealed` and `payerWithdrawnAt == 0`,
transfers `deposit - settled` to the payer, and
stamps `payerWithdrawnAt`. The payer MUST be a
signer.

### reclaim

Permissionless rent-recovery crank. Deallocates a
fully drained `Distributed` channel PDA and returns every
remaining lamport to `Channel.rentPayer`. By the
time a channel is `Distributed`, every token leg has been
paid and the escrow ATA has been closed by the
`Sealed` `distribute`; the only value left at the
address is the PDA's own SOL rent, so delaying
`reclaim` delays nobody's money.

`reclaim` takes no instruction-data arguments and no
signers, and exactly two accounts:

| Index | Account | Signer | Writable | Description |
|-------|---------|--------|----------|-------------|
| 0 | `channel` | No | Yes | Channel PDA; MUST be `Distributed`. Deallocated; all lamports drained |
| 1 | `rentPayer` | No | Yes | MUST equal the recorded `Channel.rentPayer`; receives every remaining lamport |

`reclaim` MUST require `status == Distributed`, MUST
verify the supplied `rentPayer` account equals the
recorded `Channel.rentPayer`, and MUST reject with
reference error `ChannelCloseTooEarly` (code 2414)
until `clock.slot > openSlot + OPEN_SLOT_WINDOW`; a
rejected `reclaim` is safely retryable once the
window elapses. The gate exists solely to keep the
address occupied through the epoch window — the
address-never-repeats invariant of
{{reincarnation-replay}} — not to sequence any
payment.

Because `reclaim` needs only two writable accounts
and no signers, operators SHOULD batch many
`reclaim` instructions into a single periodic sweep
transaction. `reclaim` is unnecessary for a channel
whose terminal `distribute` ran after the window had
already elapsed: the fast path deallocates directly
(see {{channel-closure}}).

### Channel Closure {#channel-closure}

Closure is two-phase: all value moves immediately,
and only the recovery of the channel PDA's own rent
waits for an epoch window.

**Phase 1 — drain (immediate).** The `Sealed`
branch of `distribute` pays the merchant-side
cumulative deltas, refunds `deposit - settled` to
the payer (when not already withdrawn), sweeps
residual dust to the treasury, and closes the escrow
ATA, returning the escrow-ATA rent to
`Channel.rentPayer`. None of this is slot-gated: the
epoch window never delays a payout or a refund.

**Phase 2 — deallocate (window-gated).** After the
drain, the channel holds only its own PDA rent. When
`clock.slot > openSlot + OPEN_SLOT_WINDOW` already
holds, `distribute` deallocates the PDA in the same
instruction (fast path): every lamport — the rent
funded at `open` plus any prefund surplus — is
drained to `Channel.rentPayer` (the operator that
funded the rent at `open`), not the payer, the
account data is zeroed, and the runtime
garbage-collects the account. Otherwise `distribute`
sets `status = Distributed`: the channel is fully drained
and inert to every instruction except `reclaim`, and
its continued existence keeps the address occupied
until the window elapses, when the permissionless
`reclaim` deallocates it identically. Once
deallocated, the address becomes reopenable as a new
incarnation. `withdrawPayer` MUST NOT close or
deallocate the channel.

Full deallocation is safe against voucher replay
because the channel address is per-incarnation by
construction: `openSlot` is a PDA seed, so `channelId`
alone identifies one incarnation and an address can
never host two channels. `openSlot` is a
client-supplied per-incarnation epoch carried in the
`open` instruction data and validated on-chain
against the Clock sysvar:

~~~
openSlot <= clock.slot
clock.slot - openSlot <= OPEN_SLOT_WINDOW
~~~

where `OPEN_SLOT_WINDOW = 1500` slots (approximately
10 minutes at 400 ms slots; the window is measured in
slots and MUST be at least the 150-block blockhash
validity, so any deliverable transaction passes it at
any slot duration). Future slots are strictly rejected
(reference error `OpenSlotOutOfWindow`, code 2003):
a far-future `openSlot` would otherwise break the
uniqueness argument below and push the reclaim gate
arbitrarily far out, permanently stranding the
operator's PDA rent.

Only `reclaim` carries the slot gate: it MUST reject
with reference error `ChannelCloseTooEarly` (code
2414) until
`clock.slot > openSlot + OPEN_SLOT_WINDOW`, and a
rejected `reclaim` is safely retryable. `distribute`
MUST NOT emit `ChannelCloseTooEarly`; when the
window has not yet elapsed, its `Sealed` branch
simply leaves the channel `Distributed` instead of
deallocating it. `withdrawPayer`, `settle`,
`settleAndSeal`, `seal`, and both branches
of `distribute` are NOT slot-gated; only the PDA
deallocation — rent recovery — waits.

Together, the open window and the occupied address
guarantee that a channel address never repeats: the
address stays occupied — live, then `Distributed` —
until some slot strictly greater than
`openSlot + OPEN_SLOT_WINDOW`, and from then on the
`openSlot` baked into the address's seeds is too
stale for `open` to ever re-derive it. A voucher
bound to an earlier incarnation can never settle
against a later one, because the later incarnation
lives at a different address. See
{{reincarnation-replay}} for the uniqueness
argument and the constraint on evolving
`OPEN_SLOT_WINDOW`.

Because the client chooses `openSlot`, it can derive
the channel address (`openSlot` is one of the PDA
derivation inputs) at transaction-build time and MAY
construct and sign vouchers before the open
transaction confirms; no post-open read-back is
required to produce a voucher. The open-landing window and the reclaim
unlock share the same `OPEN_SLOT_WINDOW` budget
measured from the supplied slot — but the only thing
the window delays is the operator's recovery of the
channel PDA's own rent (roughly 2.7 million lamports
per channel, for at most the window). Supplying the
current slot maximizes landing safety at the cost of
the full rent float; back-dating `openSlot` by `k`
slots shrinks the landing window to
`OPEN_SLOT_WINDOW − k` slots and shortens the rent
float — a close landing after the dated window even
takes `distribute`'s fast path and skips `reclaim`
entirely. Back-dating never affects payout or refund
latency, which is zero-wait either way.

Because `reclaim` takes only two writable accounts
and no signers, operators SHOULD run a periodic
sweep that batches many `reclaim` instructions per
transaction across their `Distributed` channels.

Implementations MUST NOT treat a fee-payer
signature as satisfying payer or payee authority
checks on any authority-gated instruction above.

## Grace Period

The grace period (RECOMMENDED: 15 minutes) protects
the payee. If the payer calls `requestClose` while
the payee has unsubmitted vouchers, the payee has
until the grace period expires to call `settle`
followed by `settleAndSeal` (or to bundle a
voucher into `settleAndSeal` directly).

Without a grace period, the payer could
`requestClose`, immediately call `seal`, and
sweep funds before the server has time to settle.

## Access Control

| Instruction | Caller | Gating |
|-------------|--------|--------|
| open | Payer | Payer signs the deposit transfer |
| settle | Anyone (permissionless crank) | Precompile-verified Ed25519 voucher from `authorizedSigner` |
| topUp | Payer | Payer signs the additional transfer; rejected when `status != Open` |
| requestClose | Payer | Payer signer equals channel `payer` |
| seal | Anyone (permissionless crank) | `status == Closing` and elapsed grace period |
| settleAndSeal | Payee | Payee signer equals channel `payee` |
| distribute | Anyone (permissionless crank) | On-chain hash commitment to splits preimage; never slot-gated (the `Sealed` branch deallocates the PDA in place only when the epoch window has already elapsed; see {{channel-closure}}) |
| withdrawPayer | Payer | Payer signer equals channel `payer` and `status == Sealed` |
| reclaim | Anyone (permissionless crank) | `status == Distributed`, supplied `rentPayer` equals the recorded `Channel.rentPayer`, and `clock.slot > openSlot + OPEN_SLOT_WINDOW` (see {{channel-closure}}) |

## Account Shapes and Events

Every instruction takes an exact account list and
rejects transactions with missing OR extra accounts.
The only dynamic account tail is `distribute`'s
recipient token accounts (one canonical ATA per active
preimage entry, in preimage order). Conforming
generated clients enforce the same shapes, so callers
cannot pad an instruction with unexpected accounts.

The channel program declares two events in its IDL:
`Opened` (emitted by `open`) and `PayoutRedirected`
(emitted by `distribute` when a beneficiary share is
redirected to the treasury; see {{payout-forfeiture}}).
Each event carries an 8-byte discriminator so
IDL-driven indexers can decode it without custom
tooling.

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
  Implementations SHOULD set this to a minimum
  economically useful balance to avoid spam; channel
  rent is fully recovered at close (see
  {{channel-closure}}), so the floor guards
  signature-verification and settlement overhead
  rather than storage cost.

recipient
: REQUIRED. Base58-encoded public key of the server's
  account that will receive settlement funds.

currency
: REQUIRED. Base58-encoded SPL token mint address.
  Native SOL is not supported; clients wishing to pay
  in SOL MUST wrap it to wSOL
  (`So11111111111111111111111111111111111111112`)
  before opening a channel.

description
: OPTIONAL. Human-readable description of the service
  or resource being paid for.

externalId
: OPTIONAL. Merchant reference for reconciliation or
  audit correlation.

## Method Details

network
: REQUIRED. Solana cluster identifier. MUST be one of
  "mainnet-beta", "devnet", "testnet", or "localnet".
  There is no default; the challenge MUST state the
  cluster explicitly.

channelProgram
: REQUIRED. Base58-encoded address of the on-chain
  channel program, which MUST be the program explicitly
  deployed for the selected `network`. Clients MUST
  verify this matches their expected program for that
  cluster before depositing funds.

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
: Conditionally REQUIRED. Grace period for forced close
  when `channelId` is absent (RECOMMENDED: 900).
  Stored per-channel in `Channel.gracePeriod` at
  `open`. The value MUST be greater than zero.

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

These actions map to the abstract session lifecycle
operations of {{I-D.payment-intent-session}} as
follows:

| Abstract Operation | This Method's `action` |
|--------------------|------------------------|
| Open | `open` |
| Use | `voucher` |
| Top-Up | `topUp` |
| Close | `close` |

## Action: "open"

Opens a new payment channel.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `action` | string | REQUIRED | `"open"` |
| `channelId` | string | REQUIRED | Base58 channel account address |
| `payer` | string | REQUIRED | Base58 public key of the depositor |
| `payee` | string | REQUIRED | Base58 public key of the channel payee (matches `recipient` in the 402 challenge) |
| `mint` | string | REQUIRED | Base58 SPL Token / Token-2022 mint (matches `currency` in the 402 challenge) |
| `authorizedSigner` | string | REQUIRED | Base58 public key bound into the PDA seeds as the voucher signer; MAY equal `payer` or a delegated signer |
| `salt` | string | REQUIRED | Decimal u64 PDA disambiguator |
| `depositAmount` | string | REQUIRED | Initial deposit in base units; MUST equal the decoded `open` deposit and satisfy `depositAmount >= minimumDeposit` (when the challenge sets one) |
| `gracePeriodSeconds` | integer | REQUIRED | Grace-period seconds bound into channel state at `open`; MUST be greater than zero and MUST match the challenge's `methodDetails.gracePeriodSeconds` |
| `openSlot` | string | REQUIRED | Decimal u64 per-incarnation epoch encoded into the open instruction as `open_slot`; MUST satisfy the on-chain window rule of {{channel-closure}} when the transaction executes. Also a PDA derivation input: servers MUST include it when re-deriving and validating `channelId` |
| `distributionSplits` | array | OPTIONAL | Splits preimage (see the challenge's `methodDetails.distributionSplits`); MUST byte-match the splits proposed in the 402 challenge |
| `authorizationPolicy` | object | OPTIONAL | Voucher signer policy. When present, MUST be consistent with `authorizedSigner` |
| `transaction` | string | REQUIRED | Base64-encoded (standard alphabet, padded) signed or partially signed transaction |
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

Clients SHOULD set `openSlot` to the cluster slot
observed at transaction-build time. Because the
client chooses the value — and `openSlot` is one of
the PDA derivation inputs — it can derive the
channel address before the open transaction confirms
and MAY pre-sign vouchers for the new channel
immediately; no post-open read-back is required.
Back-dating `openSlot` by `k` slots shrinks the
transaction-landing window to `OPEN_SLOT_WINDOW − k`
slots and shortens the operator's post-close rent
float (see {{channel-closure}}); it has no effect on
payout or refund latency, and a future slot is
always rejected on-chain.

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

Servers MUST treat the decoded `transaction`, not the
HTTP envelope, as the authoritative open request
before signing, paying fees, or broadcasting. Servers
MUST reject `Action: "open"` credentials when the
challenge, HTTP payload, decoded transaction, derived
PDA, escrow ATA, token program, or confirmed on-chain
state disagree. See {{open-settlement}} for the
required decoding and validation sequence.

Example `open` credential:

~~~json
{
  "action": "open",
  "channelId": "C4HnVjA7WMUtSQzAv4G6T3qBjLwK5jM7PvE2nQ5sZ3kP",
  "payer":     "9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin",
  "payee":     "FNvFqYn4yV7HsoZyHRsbsj1Vd2HFcUe2NMRJq3rJxg7c",
  "mint":      "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  "authorizedSigner":
               "9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin",
  "salt": "42",
  "depositAmount": "10000000",
  "gracePeriodSeconds": 900,
  "openSlot": "352114093",
  "transaction": "AQAB...base64..."
}
~~~

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
broadcast `settleAndSeal` (optionally bundled
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
is invalid and MUST cause `settleAndSeal` to
reject; clients SHOULD omit `voucher` instead when
no additional settlement is needed. When `voucher`
is omitted, the server seals at the current
on-chain `settled` watermark.

See {{close-cooperative}} for the full settlement
procedure, including how `settleAndSeal` and
`distribute` are bundled.

# Voucher Format {#voucher-format}

## Voucher Data

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `channelId` | string | REQUIRED | Channel this voucher authorizes |
| `cumulativeAmount` | string | REQUIRED | Total authorized spend (base units) |
| `expiresAt` | integer | OPTIONAL | Voucher expiration as a Unix timestamp in seconds (i64); `0` or omitted means no expiration. Encoded verbatim into the signed Borsh payload (see {{on-chain-voucher-encoding}}); no string/timezone conversion is performed at sign or verify time. |

All other channel context (payer, recipient, token,
program, and signer policy) is established by the
on-chain channel state and the deterministic PDA
derivation defined above. The voucher only needs to
identify the channel — `channelId` — and authorize a
cumulative amount, because `channelId` is already
bound to that context and, since `openSlot` is a PDA
seed, the address itself pins the incarnation (see
{{channel-closure}}); no separate epoch field is
carried.
Implementations MUST NOT accept vouchers for channels
whose identity cannot be recomputed from the program ID
and channel open parameters.

## Signed Voucher

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `voucher` | object | REQUIRED | Voucher data (above) |
| `signer` | string | REQUIRED | Base58 public key of the voucher signer |
| `signature` | string | REQUIRED | Base58-encoded Ed25519 signature |
| `signatureType` | string | REQUIRED | `"ed25519"` |

## Voucher Signing {#on-chain-voucher-encoding}

The signed voucher payload is 50 bytes in fixed
Borsh layout:

| Offset | Length | Field | Encoding |
|--------|--------|-------|----------|
| 0 | 2 | `magic` | The tag byte `0x56` (ASCII `V`) followed by the format-version byte `0x01` |
| 2 | 32 | `channelId` | Raw Solana address bytes |
| 34 | 8 | `cumulativeAmount` | u64 little-endian |
| 42 | 8 | `expiresAt` | i64 little-endian; `0` = no expiration |

The `magic` prefix is a domain-separation tag plus a
payload format version (`0x01`): it separates
voucher bytes from anything else the signing key
might sign and pins the format version inside the
signed bytes. The separation strength comes from the
exact 50-byte message-length pin plus the `channelId`
PDA binding, not from tag entropy: the tag byte only
needs to differ from the first byte of other
Ed25519-signable payloads (legacy transaction
messages start with a small signature count,
versioned transactions with `0x80`, offchain
messages with `0xff`). There is no epoch field:
`openSlot` is a PDA seed, so the `channelId` bytes
already bind the voucher to one incarnation of the
channel address (see {{channel-closure}}).

Signing:

1. Serialize the voucher data into the layout above.
2. Sign with Ed25519 using `authorizedSigner`'s key.
3. Encode the signature as base58 for the HTTP
   `signature` field.

The Borsh bytes are authoritative for signature
verification. The HTTP JSON shape is a transport
view; clients and servers MUST NOT influence what
bytes are signed via the JSON. The same 50-byte
layout is the precompile message the channel program
reads back on-chain for `settle` and for
`settleAndSeal` when a voucher is applied.

## Voucher Verification {#voucher-verification}

The server MUST verify each voucher:

1. Deserialize the voucher data and serialize it into
   the 50-byte layout of {{on-chain-voucher-encoding}},
   including the fixed `magic` prefix. A payload whose
   `magic` does not match exactly MUST be rejected.

2. Verify the Ed25519 signature over the Borsh voucher
   payload against the `signer` public key.

3. Verify the `signer` matches the channel's
   `authorizedSigner`.

4. Verify `voucher.channelId` matches the active
   channel PDA, re-derived from the decoded channel
   open parameters — including `openSlot` — and the
   channel program ID, never taken from the JSON
   envelope alone. Because `openSlot` is a PDA seed,
   this address binding also pins the channel
   incarnation; no separate epoch-equality check
   exists.

5. Verify `cumulativeAmount > acceptedCumulative`
   using the server's durable watermark, even when
   on-chain `settled` lags. Equal or lower amounts
   MUST be rejected for metered voucher acceptance
   unless they are exact idempotent replays handled
   per "Concurrency and Idempotency". The accepted
   increment `cumulativeAmount − acceptedCumulative`
   MUST correspond to the resource cost charged for the
   accompanying request, not merely be a positive
   advance.

6. Verify the channel account still exists, is owned
   by the channel program, and carries the `Channel`
   discriminator. A fully drained channel is `Distributed`
   and then deallocated (see {{channel-closure}});
   its address never hosts another channel, because a
   new incarnation carries a new `openSlot` seed and
   therefore a new address.

7. Verify `status == Open` (i.e., `closureStartedAt == 0`
   and the channel has not yet been sealed).
   Servers MUST reject new voucher acceptance on
   channels with a pending forced close unless the
   voucher is being used only to drive
   `settleAndSeal`.

8. Verify `cumulativeAmount <= escrowedAmount` (does
   not exceed deposit).

9. If `expiresAt` is present and non-zero, verify
   `now < expiresAt` (with configurable clock skew
   tolerance).

10. Persist the new `acceptedCumulative` amount AND the
    full `SignedVoucher` to durable storage BEFORE
    serving the resource. The numeric watermark alone is
    insufficient: on-chain `settle` / `settleAndSeal`
    require the stored signed payload.

## On-Chain Voucher Verification

When the channel program executes `settle` or
`settleAndSeal` (with a voucher), the voucher
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
- decode the on-chain voucher payload directly from
  the verified message bytes recorded by the precompile
  in the same transaction
  (see {{on-chain-voucher-encoding}}); the `magic`
  prefix MUST match exactly (reference error
  `VoucherBadMagic`, code 238), the voucher
  `channelId` MUST equal the channel PDA address
  (reference error `VoucherChannelMismatch`, code
  232) — an address binding that subsumes the epoch
  check, since `openSlot` is a PDA seed — and the
  precompile-recorded signer
  MUST equal `authorizedSigner`;
- reject signature-verification instructions that are
  replayed, unrelated, or positioned such that the
  channel program cannot unambiguously determine which
  verified message they authorize.

For the single-signature case, the canonical
`ed25519` precompile instruction totals 162 bytes: a
112-byte prefix (header, public key, and signature)
followed by the 50-byte voucher message. Its
`message_data_size` MUST be exactly 50.

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
they can reproduce it. SHA-256 is RECOMMENDED; the
specific hash implementation (e.g., the `sol_sha256`
syscall versus a bundled library) is an
implementation detail that does not affect wire
compatibility.

## Distribution Math

`distribute` pays each beneficiary the cumulative
floor delta between `payoutWatermark` and `settled`:

- recipient `i`:
  `floor(settled * shareBps[i] / 10000) − floor(payoutWatermark * shareBps[i] / 10000)`;
- payee:
  `floor(settled * (10000 − Σ shareBps) / 10000) − floor(payoutWatermark * (10000 − Σ shareBps) / 10000)`.

During `status == Open`, flooring-residual dust remains
in the escrow ATA while `payoutWatermark` advances to
`settled`; because later distributions compute deltas
from that watermark, previously residual value stays
claimable once a share's cumulative entitlement crosses
the next whole unit. At the `Sealed` branch of
`distribute`, the final cumulative delta runs once,
then the irreducible residual dust is swept to the
protocol treasury ATA before the escrow ATA is closed.
The treasury account is a deployment-level address
documented out of band by the channel program.

# Authorized Signer

By default, the payer signs vouchers directly. This
matches the default channel model: the funding key is
also the voucher-signing key, and the deposit is the
hard cap enforced by the channel.

Whether the voucher signer is the payer or a delegated
key, it MUST be a valid Ed25519 public-key point.
`open` MUST reject an `authorizedSigner` that is not a
curve point, since a non-curve value could never
produce a verifiable voucher signature.

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
  The server co-signs and broadcasts. The server's
  `feePayerKey` is also the `open` instruction's
  `rentPayer` (account index 1) and is recorded into
  `Channel.rentPayer`: the same operator signature
  covers the fee-payer and `rentPayer` signer roles, so
  the operator funds both the transaction fee and the
  channel PDA + escrow ATA rent. The operator recovers
  that SOL rent after close — through the terminal
  `distribute`'s fast path or its periodic `reclaim`
  sweep (see {{channel-closure}}); the epoch window
  floats only this rent, never the merchant payout or
  the payer refund.

- **TopUp**: Same pattern — client partially signs,
  server co-signs.

- **Settle/Close**: The server initiates these
  operations and always pays the fee.

This ensures clients never need SOL — neither for
transaction fees nor for channel rent — during the
entire session lifecycle; the client transacts in
stablecoin only.

# Server State Management

## Per-Channel State

The server MUST maintain the following state for
each open channel:

| Field | Description |
|-------|-------------|
| `channelId` | Channel account address |
| `openSlot` | On-chain `Channel.openSlot` of the channel being metered; a PDA seed, needed to re-derive and validate `channelId` and to anticipate the reclaim gate |
| `status` | `"open"` or `"closed"` |
| `payer` | Payer public key |
| `authorizationPolicy` | Voucher signer policy |
| `escrowedAmount` | Total deposited (from on-chain `Channel.deposit`) |
| `acceptedCumulative` | Highest voucher amount accepted |
| `highestVoucher` | Full highest accepted `SignedVoucher`, retained for on-chain settlement |
| `spentAmount` | Cumulative amount charged for delivered service |
| `settledOnChain` | Highest cumulative amount already settled on-chain |
| `closureStartedAt` | Pending forced-close timestamp, if any |

Server-side channel state — in particular
`acceptedCumulative` and the stored highest
`SignedVoucher` — MUST be keyed by `channelId`, not
by challenge id or HTTP session id. Because
`openSlot` is a PDA seed, the address is already
per-incarnation: reopening a closed relationship is
legal by design (see {{channel-closure}}) and
produces a new channel at a new address with its own
ledger, so `channelId` alone cannot conflate
incarnations and no `(channelId, openSlot)`
composite key is needed.

The channel program does not bind vouchers to a
cluster, so operators MUST pin each server and channel
to a single cluster and RPC endpoint and MUST NOT share
one metering ledger across clusters. A server SHOULD
verify the resolved channel matches the challenge's
`methodDetails.network` before metering.

The available off-chain balance is computed as:

~~~
available = acceptedCumulative - spentAmount
~~~

The on-chain settlement watermark is distinct:

~~~
unsettled = spentAmount - settledOnChain
~~~

## Mint Allow-List {#mint-allow-list}

Servers MUST restrict a channel's `mint` to an
explicit, server-controlled allow-list of vetted mints,
curated out of band and never derived from
client-supplied data. The server MUST set the 402
challenge `currency` only to an allow-listed mint and
MUST reject any `open` whose decoded `mint` is not on
the list. Because the open-validation binding in
{{open-settlement}} ties the decoded `open` mint to the
challenged `currency`, no off-list mint can enter a new
channel.

The server SHOULD refuse to resume or `topUp` a channel
whose `mint` has since been delisted.

This requirement exists because the channel program
does not inspect a mint's freeze or mint authority (see
{{escrow-safety}}); the server is the only gate that
keeps unvetted mints out of channels.

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
processing per channel (`channelId`; the address is
per-incarnation by construction). Voucher updates
arriving on different HTTP connections or multiplexed
streams MUST be processed atomically with respect to:

- `acceptedCumulative`;
- `spentAmount`; and
- `closureStartedAt`.

Servers MUST treat metered requests idempotently:

- Replaying an already processed request MAY return
  the cached receipt and MUST NOT change channel state
  or deliver additional service.
- Voucher submissions with `cumulativeAmount <=
  acceptedCumulative` and no matching cached
  idempotent response MUST be rejected and MUST NOT
  reduce channel state.
- Clients MAY safely retry voucher submissions after
  network failures using the same idempotency key.

Clients SHOULD include an `Idempotency-Key` header on
metered HTTP requests. Servers SHOULD cache
`(challengeId, idempotencyKey)` pairs and MUST NOT
increment `spentAmount` twice for a duplicate
idempotent request.

# Settlement Procedure

## Open {#open-settlement}

1. Decode the open transaction before signing, paying
   fees, or broadcasting. Verify it contains the
   expected channel program instruction and that the
   instruction uses the `open` discriminator (the
   reference implementation composes channel-PDA
   creation, escrow ATA creation, deposit transfer,
   and the `distributionHash` commitment in a single
   instruction).
2. Verify the instruction targets the challenged
   channel program and encodes the challenged `payer`,
   `payee`, `mint`, `authorizedSigner`, `salt`,
   `deposit`, `grace_period`, `open_slot`, and
   canonical `distributionSplits` preimage. The
   decoded `authorizedSigner` MUST equal the
   credential's `authorizedSigner` and MUST be a
   valid Ed25519 public-key point; reject non-curve
   values.
3. Recompute the expected PDA from the decoded payer,
   payee, mint, authorized signer, salt, and
   `open_slot` plus the channel program ID. Verify it
   equals both the decoded channel account and the
   declared `channelId`.
4. Verify the decoded escrow account is the associated
   token account for `(channelId, mint, tokenProgram)`.
   If the challenge supplied `tokenProgram`, the
   decoded token program MUST match it; otherwise it
   MUST be a supported token program for the mint.
5. Verify the credential's `gracePeriodSeconds` equals
   the challenge policy and is greater than zero.
   Decode the open instruction and verify its
   `grace_period` equals the same value.
6. Verify the credential's `openSlot` equals the
   decoded `open_slot` and satisfies the open-slot
   window against the server's current view of the
   cluster slot (`openSlot <= slot` and
   `slot - openSlot <= OPEN_SLOT_WINDOW`); the
   program enforces the same rule at execution (see
   {{channel-closure}}).
7. Verify the transaction's fee payer matches the
   challenge policy:
   - if `feePayer` is `true`, the fee payer MUST equal
     `feePayerKey`;
   - otherwise the payer funds the transaction.

   Verifiers that read the `open` accounts by fixed
   index MUST account for the `rentPayer` account at
   index 1 (`payer=0`, `rentPayer=1`, `payee=2`,
   `mint=3`, `authorizedSigner=4`, `channel=5`, with
   every account after `payer` shifted by `+1`) and
   MUST verify that `accounts[1]` equals the operator /
   fee-payer key. `rentPayer` is derived from the
   existing operator / fee payer and carries no separate
   wire field; a single operator signature satisfies
   both the fee-payer and `rentPayer` signer roles.
8. Validate the complete compiled message — resolving
   any version-0 address-lookup-table entries — not just
   the channel instruction. Verify the transaction does
   not include unrelated writable accounts or
   instructions that could redirect funds or mutate
   channel parameters, and that the server fee payer is
   never used as an authority, source, or writable
   account by any instruction. The server SHOULD reject
   transactions that route value through unexpected
   external programs.
9. Verify the decoded `deposit` equals
   `depositAmount`, satisfies
   `methodDetails.minimumDeposit` (when set), and that
   the resulting `distributionHash` matches the digest
   of the canonical preimage of the splits proposed in
   the 402 challenge.
10. Reject any disagreement between the challenge,
   credential payload, decoded transaction, derived
   PDA, escrow ATA, or token program.
11. If fee payer mode: co-sign and broadcast.
   Otherwise: broadcast as-is.
12. Verify channel state on-chain after confirmation:
   - payer matches transaction signer;
   - payee matches the challenged recipient;
   - mint matches the challenge currency;
   - deposit matches the requested amount;
   - `gracePeriod` is non-zero and matches the
     challenge policy;
   - `openSlot` equals the credential's `openSlot`;
   - authorized signer matches the open parameters;
   - `distributionHash` matches the proposed splits;
   - `rentPayer` equals the operator / fee-payer key
     that funded the channel rent;
   - channel is not sealed; and
   - `closureStartedAt` is `0`.
13. Create server-side channel state keyed by
   `channelId` (per-incarnation by construction, since
   `openSlot` is a PDA seed).
14. Return 200 with receipt.

## Resume

When a challenge resumes an existing channel
(`methodDetails.channelId`), the server MUST
re-authenticate the on-chain account before metering
against it — decoding the account bytes is not
sufficient. The server MUST verify the account is owned
by the channel program and that its discriminator,
`version`, `status == Open`, PDA derivation
(re-derived over the stored open parameters,
including `openSlot`), `mint` (still allow-listed),
`payee`, `authorizedSigner`, `openSlot`, and
`distributionHash` all match the active challenge
and session. Resume only ever applies to a live
channel: because `openSlot` is a PDA seed, a
deallocated address is never reoccupied — reopening
a closed relationship creates a new channel at a new
`channelId` with a fresh ledger. A resumed channel
shares one cumulative ledger across challenges,
keyed by `channelId`, so a single cumulative voucher
cannot be reused to buy multiple responses.

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
`settleAndSeal` (within grace) or `seal`
(after grace).

## Close (Cooperative) {#close-cooperative}

1. If a final voucher is provided, verify the
   `SignedVoucher` against the active channel:
   `voucher.channelId` equals the payload `channelId`
   (itself validated by re-derivation over the open
   parameters, including `openSlot`), `signer` equals
   the channel `authorizedSigner`, the Ed25519
   signature verifies over the Borsh payload,
   freshness checks pass, and
   `settled < cumulativeAmount <= deposit`.
2. Build and immediately broadcast
   `settleAndSeal` bundled with `distribute` in
   the same transaction, so the merchant-side payout,
   payer refund, treasury sweep, and escrow-ATA
   closure all land atomically. The bundle is never
   slot-gated and MUST NOT be deferred waiting for
   the epoch window. When
   `clock.slot > openSlot + OPEN_SLOT_WINDOW` already
   holds, the same `distribute` also deallocates the
   channel PDA in place; otherwise the channel is
   left `Distributed` and the operator's periodic
   `reclaim` sweep recovers the PDA rent after the
   window (see {{channel-closure}}). A bundle whose
   `distribute` carries many recipients may require a
   version-0 transaction with an address lookup
   table.
3. Mark the channel as `"closed"` in server-side
   state.
4. Persist final `settledOnChain` and terminal
   accounting state after confirmation.
5. Return 200 with receipt containing `txHash` and
   (if `distribute` ran) the refunded amount.

For deployments whose `payee` is a PDA, the server MUST
provide a working CPI signer-seed adapter for
`settleAndSeal` before opening channels, or else
refuse the channel before metering begins. A PDA payee
with no cooperative-close path can leave delivered
service uncollectible: the permissionless `settle` crank
cannot apply a new voucher once `requestClose` has moved
the channel to `Closing`.

## Forced Close (Client-Initiated)

If the server becomes unresponsive, the client can
force-close the channel:

1. The payer authorizes `requestClose` and submits it
   directly to RPC. Because the operator funds channel
   rent and the client transacts in stablecoin only, a
   SOL-free client cannot pay the transaction fee for
   this escape route on its own; such a client MUST
   obtain SOL (or a fee-paying submitter) to drive
   `requestClose`, while `seal` and `distribute` are
   permissionless and MAY be cranked by any party.
2. Grace period begins (per-channel `gracePeriod`).
3. During the grace period, the server MAY still
   call `settleAndSeal` with the latest
   voucher.
4. After the grace period, any party submits
   `seal` (permissionless) to transition the
   channel to `Sealed`.
5. The payer MAY submit `withdrawPayer` to recover
   `deposit - settled` immediately. Independently,
   any party MAY submit `distribute` with the splits
   preimage, also immediately — no token movement is
   slot-gated: the merchant side is paid, any pending
   payer refund is also paid, residual is swept to
   treasury, and the escrow ATA is closed. The
   channel PDA is deallocated in the same instruction
   when the epoch window has already elapsed, or left
   `Distributed` for a later permissionless `reclaim`; in
   both cases all freed SOL goes to `rentPayer` (see
   {{channel-closure}}).

## One-Shot Session Example

A metered API prices one request at 16 base units.
A client expecting to make a single call can still
use a session channel with no permanent on-chain
storage cost:

1. At build time the cluster slot is `S`. The client
   opens with `openSlot = S − 1400`, leaving a
   100-slot landing window (`OPEN_SLOT_WINDOW = 1500`)
   while shortening the operator's post-close rent
   float, and `depositAmount = "50000"`. Because `openSlot`
   is a PDA seed, the client derives the channel
   address from its chosen value up front and
   pre-signs the voucher `{channelId,
   cumulativeAmount: "16"}` before the open
   transaction confirms.
2. The client sends the metered request with the
   voucher; the server verifies it per
   {{voucher-verification}} and serves the resource.
3. The client sends `Action: "close"` with the same
   voucher as the final voucher; the server
   immediately broadcasts `settleAndSeal`
   bundled with `distribute`. In that one
   transaction, seconds after the open, the merchant
   side receives 16 and the payer is refunded 49984.
   The window has not yet elapsed, so the drained
   channel PDA is left `Distributed`.
4. The reclaim gate unlocks at slot
   `openSlot + 1501 = S + 101`, roughly 100 slots
   (~40 seconds) after the open landed. The
   operator's next periodic `reclaim` sweep
   deallocates the PDA and returns 100% of the
   channel rent to `rentPayer`. Nobody's payout or
   refund waited on the window — it floated only the
   operator's rent.

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
in {{I-D.ryan-httpauth-payment-01}}: `malformed-credential`,
`invalid-challenge`, and `verification-failed`. The
`detail` field SHOULD describe the specific failure
(e.g., "Amount exceeds
deposit", "Channel not found").

All error responses MUST include a fresh challenge in
`WWW-Authenticate`.

# Security Considerations

## Transport Security

All communication MUST use TLS 1.2 or higher.

## Escrow Safety {#escrow-safety}

Funds are held by the channel program, not the
server. The server can only claim funds by presenting
valid voucher signatures to the program. The client
can always recover unspent funds via forced close
after the grace period.

The channel program intentionally does NOT inspect a
mint's freeze authority or mint authority.
Hard-rejecting any mint with a live freeze authority
would exclude most real-world stablecoins (USDC, USDT,
PYUSD, EURC), all of which retain an issuer-controlled
freeze authority. The cost of allowing them is that a
live freeze authority can freeze the escrow ATA at any
point in the channel lifecycle; once frozen, every
value-moving instruction (`topUp`, `distribute`,
`withdrawPayer`) rejects, wedging both the merchant
payout leg and the payer refund leg with no
permissionless crank to unwind it until the authority
thaws. The trust decision is therefore pushed
off-chain: a merchant accepting payments in mint `M`
implicitly accepts that `M`'s freeze authority can
wedge any channel denominated in `M`, and SHOULD
allow-list (see {{mint-allow-list}}) only mints whose
freeze and mint authorities it considers acceptably
governed. This mint-issuer trust model is distinct from
the Token-2022 *extension* allow-list in
{{token-extension-policy}}.

## Payout Forfeiture {#payout-forfeiture}

`distribute` never blocks on an unusable beneficiary
account. A nonzero share whose canonical ATA is
missing, frozen, closed, malformed, carries an
unsupported Token-2022 account extension, or has a
reassigned authority is redirected to the treasury ATA
and `payoutWatermark` advances regardless, so the
beneficiary permanently forfeits that share — later
repair cannot reclaim it. The same applies to the payer
refund ATA at `Sealed`. This removes a griefing
vector (a single poisoned ATA cannot stall payouts to
the rest of the channel) at the cost of forfeitable
funds. Operators SHOULD ensure recipient, payee, and
payer ATAs exist and are healthy (initialized,
unfrozen, canonical, extension-clean) — or withdraw the
payer headroom via `withdrawPayer` beforehand — before
cranking `distribute`.

## Voucher Replay Protection

Vouchers are bound to a specific channel incarnation
via `channelId` — the address is per-incarnation,
because `openSlot` is a PDA seed — and ordered by
`cumulativeAmount`; there is no per-voucher nonce.
A voucher from one channel cannot be replayed in
another, and a voucher from a closed channel cannot
be replayed against a reopened relationship, whose
channel lives at a different address (see
{{reincarnation-replay}}).

This replay protection depends on deterministic PDA
derivation. The channel address MUST be bound to the
channel program ID and channel open parameters so that
vouchers cannot be replayed across different channel
program deployments.

Vouchers are not bound to a cluster; the same program
and seeds derive an identically-addressed channel on
another cluster, so a voucher could in principle be
replayed there. This residual cross-cluster replay is
an accepted operational risk, mitigated off-chain by
pinning each server and channel to a single cluster.

## Reincarnation Replay {#reincarnation-replay}

Terminal closure ends with full deallocation of the
channel PDA — by `distribute`'s fast path or by
`reclaim` (see {{channel-closure}}) — and the same
participant relationship can legally be reopened.
Replay protection across incarnations is address
binding by construction: `openSlot` is a PDA seed,
so every incarnation derives its own address, every
voucher signs over `channelId`, and the program only
accepts vouchers whose `channelId` equals the live
channel's address.

The channel address never repeats. An address
encodes one fixed `openSlot` in its seeds, so `open`
can only ever derive it while
`clock.slot − openSlot <= OPEN_SLOT_WINDOW`.
Incarnation N's address stays occupied — live, then
`Distributed` — until it is deallocated (by `distribute`'s
fast path or by `reclaim`) at some slot
`C > openSlot_N + OPEN_SLOT_WINDOW`; from `C` onward
the open window has permanently closed over
`openSlot_N`, so no second channel can ever exist at
that address, for any client behavior inside the
window — including adversarial choices of
`openSlot`. An old voucher can never match a later
incarnation: the later incarnation lives at a
different address, so a stale voucher fails the
address binding (wrong `channelId`) or targets a
deallocated account.

Two rules keep this argument sound:

- `OPEN_SLOT_WINDOW` is consensus-critical and MAY
  only ever be decreased in future program versions.
  Increasing it would re-arm the addresses of channels
  deallocated under the smaller window: an address
  whose `openSlot` was already too stale to re-derive
  could become derivable again, allowing a second
  channel — and the old vouchers — to land at it.
- Future `openSlot` values MUST be strictly rejected
  at `open`. Beyond breaking the inequality above, a
  far-future `openSlot` would push the reclaim gate
  arbitrarily far out, permanently stranding the
  operator's PDA rent.

## Open Transaction Binding

Servers that sponsor or submit open transactions MUST
treat the decoded transaction contents as the
committed request. A malicious client can otherwise
present a benign HTTP envelope while embedding a
different payee, distribution split, deposit, signer,
channel PDA, or grace period. Such a mismatch can make
the server sponsor or meter a channel it did not
challenge.

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

Servers MUST verify that a new channel uses the
challenged `gracePeriodSeconds`. If the transaction
sets a zero, shorter, or envelope-disagreeing
`grace_period`, the payer could request close and
recover funds before the server has time to settle
accepted vouchers.

Because `topUp` MUST NOT clear `closureStartedAt`,
servers MUST guard the equivalent grief vector at
the HTTP layer by rate-limiting `requestClose`
retries and refusing to extend service after a
forced-close broadcast.

Servers MUST stop accepting new service vouchers
once `closureStartedAt` is set. During the grace
period, the server MAY use the latest previously
accepted voucher to drive `settleAndSeal` (and,
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
small deposits. The on-chain storage cost is
transient: closure closes the escrow ATA immediately
and deallocates the channel PDA once the epoch
window has passed (fast path or `reclaim`), and the
operator (`rentPayer`) recovers all of the rent it
fronted (see {{channel-closure}}), so channel spam
does not strand rent permanently. It does, however,
tie up operator SOL while channels stay open — plus
a per-channel PDA-rent float of roughly 2.7 million
lamports for up to the window after close — and
consume server resources.

Servers SHOULD therefore still enforce a minimum
economically useful deposit to avoid channel spam
with balances too small to justify signature
verification and settlement overhead, and SHOULD
close idle low-value channels promptly to recycle
the rent float.

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
  transaction as `settle` or `settleAndSeal`, with
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

The `session` intent is registered by
{{I-D.payment-intent-session}}. This document does not
register a new payment intent; it defines how the
`solana` payment method implements the registered
`session` intent.

--- back

# Acknowledgements

The authors thank the Tempo team for their input on this 
specification.
