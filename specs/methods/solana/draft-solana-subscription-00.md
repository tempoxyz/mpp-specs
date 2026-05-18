---
title: Solana Subscription Intent for HTTP Payment Authentication
abbrev: Solana Subscription
docname: draft-solana-subscription-00
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
  I-D.payment-intent-subscription:
    title: "Subscription Intent for HTTP Payment Authentication"
    target: https://datatracker.ietf.org/doc/draft-payment-intent-subscription/
    author:
      - name: Jake Moxey
      - name: Brendan Ryan
      - name: Tom Meagher
    date: 2026-04
  I-D.ietf-httpapi-idempotency-key-header:
    title: "The Idempotency-Key HTTP Header Field"
    target: https://datatracker.ietf.org/doc/draft-ietf-httpapi-idempotency-key-header/
    author:
      - name: Jayadeba Jena
    date: 2024-06

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
    date: 2023
  SUBSCRIPTIONS-PROGRAM:
    title: "Subscriptions Solana Program"
    target: https://github.com/solana-foundation/solana-program-subscriptions
    author:
      - org: Solana Foundation
    date: 2026
---

--- abstract

This document defines the "subscription" intent for the "solana"
payment method within the Payment HTTP Authentication Scheme
{{I-D.httpauth-payment}}. Subscriptions enable recurring fixed-amount
payments where the payer grants the server permission, through an
on-chain delegation, to collect the same SPL token amount once per
billing period. The client signs an activation transaction that, in a
single atomic step, creates an on-chain subscription delegation and
collects the first billing-period charge. Subsequent renewal charges
are submitted directly by the server using the registered delegation
and require no further client interaction.

This profile inherits the shared "subscription" intent semantics from
{{I-D.payment-intent-subscription}} and defines Solana-specific request
fields, credential payloads, transaction composition, and settlement
behavior.

--- middle

# Introduction

HTTP Payment Authentication {{I-D.httpauth-payment}} defines a
challenge-response mechanism that gates access to resources behind
payments. This document registers the "subscription" intent for the
"solana" payment method.

The `subscription` intent enables a server to collect a recurring
fixed-amount payment from a client at a defined cadence. On Solana, the
authorization is materialized as on-chain state held by an audited
subscriptions program {{SUBSCRIPTIONS-PROGRAM}}. Activation atomically
creates that state and collects the first charge. Renewals are then
server-driven: at each billing-period boundary, the server submits one
transaction that pulls the next charge from the payer's token account
through the registered delegation, with no HTTP round-trip required.

This profile is intentionally narrower than a general billing
subscription. It standardizes a recurring SPL-token transfer
authorization, not price catalogs, quantities, prorations, deferred
starts, trials, metered usage, or plan changes. Those concerns belong
to the application layer.

## Solana-Specific Capabilities

This specification leverages Solana-specific capabilities:

- **On-chain delegation**: The recurring authorization is held by an
  audited program PDA (`SubscriptionDelegation`) rather than by the
  server. The server can only pull funds within the per-period limit
  encoded in the delegation; over-pulls and out-of-period pulls fail
  on-chain.

- **Atomic activation**: A single transaction can initialize the
  payer's per-mint delegation authority, create the subscription
  delegation by snapshotting an immutable on-chain plan, and execute
  the first billing-period transfer. There is no race window between
  authorization and first charge.

- **Durable on-chain accounting**: The program tracks the current
  billing-period start time and the amount already pulled in the
  current period. Period advance is automatic at transfer time. Missed
  billing periods do not accumulate additional charge capacity.

- **Fee payer separation**: The server can sponsor the activation
  transaction so the client never needs SOL for transaction fees during
  the normal subscription lifecycle. Renewal transactions are
  server-submitted and server-paid by construction.

- **Plan immutability**: Subscription terms (amount, billing period,
  mint, destinations) are published on-chain by the merchant as an
  immutable `Plan` PDA. The 402 challenge pins the `planId`, and the
  payer can inspect the plan on-chain before signing the activation.

- **Kill-switch isolation**: Each `(payer, mint)` pair has a
  `SubscriptionAuthority` PDA whose recreation (close + reopen)
  invalidates every delegation that referenced the previous instance.
  This provides a non-revocable emergency control without touching
  individual subscriptions.

## Subscription Flow

~~~
   Client                       Server                     Solana
      |                            |                          |
      |  (1) GET /resource         |                          |
      |--------------------------> |                          |
      |                            |                          |
      |  (2) 402 Payment Required  |                          |
      |      intent="subscription" |                          |
      |      (planId, amount,      |                          |
      |       periodUnit,          |                          |
      |       periodCount,         |                          |
      |       recipient, ...)      |                          |
      |<-------------------------- |                          |
      |                            |                          |
      |  (3) Inspect plan on-chain,|                          |
      |      build activation tx,  |                          |
      |      sign as subscriber    |                          |
      |                            |                          |
      |  (4) Authorization: Payment|                          |
      |      <activate credential> |                          |
      |--------------------------> |                          |
      |                            |                          |
      |                            |  (5) Co-sign (if fee     |
      |                            |      payer) + send       |
      |                            |------------------------> |
      |                            |                          |
      |                            |  (6) Confirmation:       |
      |                            |      SubscriptionCreated |
      |                            |      + first transfer    |
      |                            |<------------------------ |
      |                            |                          |
      |  (7) 200 OK + Receipt      |                          |
      |      (subscriptionId)      |                          |
      |<-------------------------- |                          |
      |                            |                          |
      |       ... later period ... |                          |
      |                            |                          |
      |                            |  (8) transfer_subscription
      |                            |      (server-driven)     |
      |                            |------------------------> |
      |                            |                          |
      |  (9) GET /resource         |                          |
      |--------------------------> |                          |
      |                            |                          |
      |  (10) 200 OK + Receipt     |                          |
      |       (renewed period)     |                          |
      |<-------------------------- |                          |
      |                            |                          |
~~~

Steps 1–7 are the activation phase: the client signs the activation
transaction, the server (optionally co-signing as fee payer) submits
it, the on-chain program creates the subscription delegation and
executes the first-period transfer in the same transaction, and the
server returns a receipt with the subscription identifier.

Step 8 is a server-driven renewal. There is no HTTP round-trip; the
server detects that the current billing period is unpaid and submits
one transfer using the registered delegation.

Steps 9–10 are a subsequent access: because the current billing period
has been charged, the server serves the resource and returns a fresh
`Payment-Receipt`. If the next request arrives while the current period
is unpaid (for example, before the server's renewal worker has run, or
after a failed renewal), the server returns `402 Payment Required` with
a fresh challenge instead.

## Relationship to Charge and Session Intents

The "charge" intent handles a single one-time payment per request
(see the companion specification for the Solana charge profile). The
"session" intent handles metered or streaming payments through an
off-chain voucher channel against an on-chain escrow.

The "subscription" intent handles recurring fixed-amount payments
with on-chain per-period accounting. Unlike "charge", subscriptions
do not require an HTTP round-trip per period: the server submits
renewals directly. Unlike "session", subscriptions do not use vouchers,
do not require an open/close lifecycle per usage burst, and do not
support metered amounts.

All three intents share the same `solana` method identifier and the
encoding conventions defined in {{encoding-conventions}}.

# Requirements Language

{::boilerplate bcp14-tagged}

# Terminology

Plan
: An immutable on-chain account (PDA) published by a merchant that
  defines a subscription's terms: token mint, amount per billing
  period, period length, allowed pullers, and recipient destinations.

Plan PDA
: The address of the `Plan` account, derived from `["plan", owner,
  plan_id]`.

Subscription Delegation
: A per-subscriber on-chain account (PDA) that snapshots the plan terms
  the subscriber agreed to and tracks current-period accounting state.
  Address: `["subscription", plan_pda, subscriber]`.

Subscription Authority
: A per-(payer, mint) on-chain PDA that holds the SPL token delegate
  authority over the payer's associated token account. The subscriptions
  program uses this PDA as the signing authority when executing pulls.
  Address: `["SubscriptionAuthority", payer, mint]`.

Puller
: A public key authorized by the plan to submit
  `transfer_subscription` instructions. The plan owner is implicitly
  authorized; up to four additional pullers MAY be enumerated in the
  plan.

Subscriber
: The funding key. Holds the SPL token balance from which the
  recurring charges are pulled. Signs the activation transaction.

Billing Anchor
: The on-chain timestamp at which the subscription was activated. All
  subsequent billing-period boundaries are derived from this anchor.

Mapped Period Seconds
: The fixed elapsed time, in seconds, between billing-period
  boundaries. Computed from the shared `periodUnit` and `periodCount`
  fields as defined in {{period-mapping}}.

Subscriptions Program
: The audited on-chain program implementing the account model and
  instructions referenced by this specification
  {{SUBSCRIPTIONS-PROGRAM}}.

# Intent Identifier

The intent identifier is `subscription`, as defined in
{{I-D.payment-intent-subscription}}.

# Encoding Conventions {#encoding-conventions}

All public keys, transaction signatures, mints, and program identifiers
in this specification are encoded as base58 {{BASE58}} strings unless
explicitly noted otherwise.

The `request` JSON object in the `WWW-Authenticate` challenge MUST be
serialized using JSON Canonicalization Scheme (JCS) {{RFC8785}} and
base64url-encoded without padding per {{I-D.httpauth-payment}}.

Subscription identifiers in receipts are base64url-encoded without
padding per {{I-D.payment-intent-subscription}}.

Transaction bytes in credentials are base64-encoded with padding using
the standard alphabet of {{RFC4648}}.

Token amounts are decimal strings of unsigned integers in base units
(no decimal point, no exponent, no leading zeros, no whitespace, no
sign).

# Subscriptions Program Interface

This specification depends on the audited subscriptions program
{{SUBSCRIPTIONS-PROGRAM}}. Servers MUST pin a specific deployed
program ID in the challenge and reject credentials whose activation
transactions invoke a different program.

## Account Model

### Plan

The `Plan` account is a merchant-published PDA describing the
subscription terms. It is created off the critical path of the 402
challenge by the merchant calling `create_plan` (instruction
discriminator `7`) on the subscriptions program. The `Plan` is
immutable in its core terms (`mint`, `amount_per_period`,
`period_hours`, `destinations`) once published; its status, sunset
timestamp, and metadata may be updated by the merchant.

Plan-PDA derivation:

~~~
plan_pda = find_program_address(
    [b"plan", owner_pubkey, plan_id_bytes],
    subscriptions_program_id,
)
~~~

The plan stores at least:

| Field | Type | Description |
|-------|------|-------------|
| `owner` | Pubkey | Merchant key, also implicitly an authorized puller |
| `plan_id` | bytes | Merchant-chosen identifier (unique per owner) |
| `mint` | Pubkey | SPL token mint |
| `token_program` | Pubkey | SPL Token or SPL Token-2022 program ID |
| `amount_per_period` | u64 | Amount per billing period in base units |
| `period_hours` | u64 | Billing period length in hours, in `[1, 8760]` |
| `destinations` | array of Pubkey, length 1..4 | Token-account destinations |
| `pullers` | array of Pubkey, length 0..4 | Additional authorized pullers |
| `status` | enum | `Active` / `Sunset` |
| `end_ts` | i64 | Optional sunset timestamp; `0` means no sunset |
| `metadata_uri` | string | Optional human-readable metadata URI |

### Subscription Delegation

The `SubscriptionDelegation` is a per-subscriber PDA created when the
subscriber calls `subscribe` (instruction discriminator `11`). It
snapshots the plan terms at subscription time and tracks the current
billing period accounting state.

Subscription-delegation PDA derivation:

~~~
subscription_pda = find_program_address(
    [b"subscription", plan_pda, subscriber_pubkey],
    subscriptions_program_id,
)
~~~

The delegation stores at least:

| Field | Type | Description |
|-------|------|-------------|
| `header` | struct | Includes delegator (subscriber), delegatee, payer, `init_id` |
| `plan_pda` | Pubkey | The `Plan` this subscription was created from |
| `mint` | Pubkey | Snapshotted from the plan |
| `amount_per_period` | u64 | Snapshotted from the plan |
| `period_hours` | u64 | Snapshotted from the plan |
| `current_period_start_ts` | i64 | Unix timestamp of current period start |
| `amount_pulled_in_period` | u64 | Amount already pulled in the current period |
| `expires_at_ts` | i64 | `0` while active; set by `cancel_subscription` |

### Subscription Authority

The `SubscriptionAuthority` is a per-(payer, mint) PDA created by the
payer calling `initialize_subscription_authority` (discriminator `0`).
On creation, the payer approves this PDA as the SPL Token delegate of
their associated token account with allowance `u64::MAX`. The
subscriptions program uses this PDA as the signing authority when
moving tokens during `transfer_subscription`.

Subscription-authority PDA derivation:

~~~
subscription_authority_pda = find_program_address(
    [b"SubscriptionAuthority", payer_pubkey, mint_pubkey],
    subscriptions_program_id,
)
~~~

The authority's `init_id` (set from `Clock::slot` at creation) is
snapshotted into every delegation that references it. Closing the
authority via `close_subscription_authority` and reopening it
invalidates every previously created delegation that references the
old instance; subsequent `transfer_subscription` calls return
`StaleSubscriptionAuthority`. This is the emergency kill switch
described in {{security-considerations}}.

## Instructions

Servers and clients implementing this profile MUST use the
subscriptions program's published instruction set. The instructions
relevant to this specification are:

| Instruction | Discriminator | Signer | Role |
|-------------|---------------|--------|------|
| `initialize_subscription_authority` | `0` | payer | Creates the per-(payer, mint) authority and approves it as the SPL Token delegate |
| `subscribe` | `11` | subscriber | Creates the `SubscriptionDelegation` from a `Plan` snapshot |
| `transfer_subscription` | `10` | puller (plan owner or one of `plan.pullers`) | Executes one in-period transfer; auto-advances the period |
| `cancel_subscription` | `12` | subscriber | Sets `expires_at_ts` (grace = end of current paid period) |
| `revoke_delegation` | `3` | subscriber or sponsor (post-expiry) | Closes the delegation, returning rent |
| `create_plan` | `7` | merchant | Merchant-side plan publication; not in the activation flow |
| `update_plan` | `8` | merchant | Mutates non-terms fields (status, end_ts, pullers, metadata_uri) |

Instruction discriminators are single bytes prefixed to the
instruction data, per the subscriptions program convention.

## Plan Publication

Servers MUST require a published `Plan` for every subscription
challenge. The challenge `methodDetails.planId` MUST be the base58
encoding of a `Plan` PDA that:

1. Is owned by the subscriptions program identified by
   `methodDetails.programId`.
2. Has `mint` equal to `methodDetails.mint`.
3. Has `amount_per_period` equal to the challenge `amount` parsed as
   `u64`.
4. Has `period_hours` equal to the value computed by
   {{period-mapping}}.
5. Has the server's puller pubkey listed in `plan.pullers` or as
   `plan.owner`.
6. Has `status == Active` and (if `end_ts != 0`) `end_ts` strictly
   greater than the challenge `expires` timestamp and, if present,
   strictly greater than the challenge `subscriptionExpires`.

Servers MUST refuse to issue subscription challenges for plans they do
not satisfy these conditions for. Clients SHOULD re-verify them by
fetching the plan on-chain before signing the activation transaction.

## Per-Period Accounting

When the subscriptions program processes a `transfer_subscription`
call, it:

1. Verifies the `Plan` referenced by the delegation still exists, is
   `Active`, has not been replaced, and has terms matching the
   delegation snapshot (rejects with `PlanTermsMismatch` otherwise).
2. Verifies `expires_at_ts == 0` or `current_ts < expires_at_ts`
   (rejects with `SubscriptionCancelled` otherwise).
3. Computes `elapsed = current_ts - current_period_start_ts`. If
   `elapsed >= period_length_seconds`, advances
   `current_period_start_ts` by
   `(elapsed / period_length_seconds) * period_length_seconds` and
   resets `amount_pulled_in_period = 0`.
4. Verifies `transfer_amount <= amount_per_period -
   amount_pulled_in_period` (rejects with `AmountExceedsPeriodLimit`
   otherwise).
5. Pulls `transfer_amount` from the payer's associated token account
   through the `SubscriptionAuthority` delegate and credits the
   `plan.destinations` according to the on-chain split logic.
6. Increments `amount_pulled_in_period += transfer_amount`.
7. Emits a `SubscriptionTransferEvent` via the program's Anchor-
   compatible self-CPI event mechanism.

The period advance is jumping rather than accumulating: if multiple
billing periods have elapsed since the last successful pull, the
program advances to the active period and resets the in-period
counter to zero. There is no catch-up authority for missed periods.

## Token-Program Support

This profile supports both SPL Token and SPL Token-2022. Servers MUST
pin the token program of the underlying mint in
`methodDetails.tokenProgram`. Clients MUST verify on-chain that the
mint's owner program equals this value before signing.

For mints managed by SPL Token-2022, the subscriptions program
enforces an extension blocklist at every token-touching path. Mints
or token accounts that carry any of the following extensions MUST be
rejected by the program (and therefore by this profile):

- `ConfidentialTransferMint` / `ConfidentialTransferAccount`
- `NonTransferable`
- `PermanentDelegate`
- `TransferHook`
- `TransferFeeConfig`
- `MintCloseAuthority`
- `Pausable`

The mint extension allowlist for this profile is identical to the one
defined by the companion Solana session specification (metadata-only
extensions). The token-account allowlist is `ImmutableOwner` only.

## Subscription Authority Lifecycle

The `SubscriptionAuthority` is shared across all of a payer's
subscriptions for the same mint. Clients SHOULD reuse an existing
authority when one is already initialized for `(subscriber, mint)`,
and SHOULD include `initialize_subscription_authority` in the
activation transaction only if it does not yet exist.

The `init_id` snapshot binds every delegation to the lifecycle of the
authority instance that created it. Closing and reopening the
authority invalidates every previously created delegation and forces
re-subscription. This MUST be treated as a destructive operation by
applications and SHOULD be exposed in user UX only as an explicit
"revoke all subscriptions for this token" affordance.

# Request Schema {#request-schema}

The `request` parameter in the `WWW-Authenticate` challenge contains a
base64url-encoded JSON object. The `request` JSON MUST be serialized
using JSON Canonicalization Scheme (JCS) {{RFC8785}} and base64url-
encoded without padding per {{I-D.httpauth-payment}}.

## Shared Fields

This profile uses the shared `amount`, `currency`, `periodUnit`,
`periodCount`, `subscriptionExpires`, `recipient`, `description`, and
`externalId` fields from {{I-D.payment-intent-subscription}}. The
`solana` profile elevates `recipient` to REQUIRED:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `amount` | string | REQUIRED | Per-period token amount in base units |
| `currency` | string | REQUIRED | SPL token mint address (base58) |
| `periodUnit` | string | REQUIRED | `"day"` or `"week"` (see {{period-mapping}}) |
| `periodCount` | string | REQUIRED | Positive integer count of `periodUnit` values per billing period |
| `recipient` | string | REQUIRED | Primary recipient's token account, or wallet pubkey resolvable to its ATA, in base58 |
| `subscriptionExpires` | string | OPTIONAL | {{RFC3339}} expiry of the recurring authorization |
| `description` | string | OPTIONAL | Human-readable subscription description |
| `externalId` | string | OPTIONAL | Merchant reference |
| `methodDetails` | object | REQUIRED | Solana-specific fields (see {{method-details}}) |

## Period Mapping {#period-mapping}

Servers MUST map the shared period fields to the subscriptions
program's `period_hours` value as follows:

| `periodUnit` | Mapping | `periodCount` range |
|--------------|---------|---------------------|
| `day` | `period_hours = periodCount * 24` | `[1, 365]` |
| `week` | `period_hours = periodCount * 168` | `[1, 52]` |
| `month` | rejected | — |

Servers MUST reject `periodUnit="month"` because the subscriptions
program's billing-period boundaries are fixed elapsed seconds and
cannot represent calendar-month cadence exactly. Clients receiving a
challenge with `periodUnit="month"` and `method="solana"` MUST treat
it as a malformed challenge.

Servers MUST reject any `periodCount` value outside the ranges above
because the resulting `period_hours` would exceed the program's
`[1, 8760]` bounds. Clients SHOULD perform the same check before
signing.

`Mapped Period Seconds` is `period_hours * 3600`. Billing-period
boundaries are derived from the on-chain `current_period_start_ts`
that the program writes during activation; servers MUST NOT use local
wall-clock time as the anchor.

## Method Details {#method-details}

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `methodDetails.programId` | string | OPTIONAL | Base58 of the subscriptions program ID. If omitted, defaults to the canonical mainnet deployment. |
| `methodDetails.planId` | string | REQUIRED | Base58 of the on-chain `Plan` PDA the subscription is created against |
| `methodDetails.mint` | string | REQUIRED | Base58 of the SPL token mint. MUST equal the on-chain `plan.mint` |
| `methodDetails.tokenProgram` | string | REQUIRED | Base58 of the SPL Token (`Tokenkeg...`) or Token-2022 (`TokenzQd...`) program ID |
| `methodDetails.decimals` | number | REQUIRED | Decimal precision of the mint (0..255) |
| `methodDetails.puller` | string | REQUIRED | Base58 of the server's puller pubkey. MUST be `plan.owner` or appear in `plan.pullers` |
| `methodDetails.network` | string | OPTIONAL | `"mainnet-beta"`, `"devnet"`, `"testnet"`, or `"localnet"`. Defaults to `"mainnet-beta"` |
| `methodDetails.feePayer` | boolean | OPTIONAL | If `true`, the client constructs the activation transaction with the server as fee payer |
| `methodDetails.feePayerKey` | string | OPTIONAL | Base58 of the server fee-payer pubkey. REQUIRED when `feePayer` is `true` |
| `methodDetails.recentBlockhash` | string | OPTIONAL | Pre-fetched blockhash to bind to the activation transaction |
| `methodDetails.splits` | array | OPTIONAL | Distribution overrides (see {{distribution-splits}}). The on-chain split is governed by `plan.destinations`; `splits` is advisory |

The challenge `currency` field is the same value as
`methodDetails.mint`. Implementations MUST treat the two consistently;
servers MUST reject credentials where the activation transaction
references a different mint.

Servers issuing `intent="subscription"` challenges SHOULD include the
`expires` auth-param in `WWW-Authenticate` per
{{I-D.httpauth-payment}}, using {{RFC3339}} format. The challenge
`expires` bounds the lifetime of the credential the client may submit;
the optional `subscriptionExpires` bounds the lifetime of the resulting
on-chain authorization, and MUST be strictly later than `expires` when
both are present.

# Credential Schema

The credential in the `Authorization` header contains a base64url-
encoded JSON object per {{I-D.httpauth-payment}}.

## Credential Structure

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `challenge` | object | REQUIRED | Echo of the challenge from the server |
| `payload` | object | REQUIRED | Solana-specific activation payload |
| `source` | string | OPTIONAL | Subscriber identifier (e.g., `did:pkh:solana:...`) |

For this profile, only one credential action is defined: activation.
Renewals are server-driven on-chain transactions and do not produce
HTTP credentials. Cancellations are out-of-band on-chain operations
(see {{cancellation}}).

## Activation Payload

The activation payload represents the signed activation transaction.
Two `type` values are supported:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `type` | string | REQUIRED | `"transaction"` (pull mode) or `"signature"` (push mode) |
| `transaction` | string | CONDITIONAL | Required when `type="transaction"`. Standard-base64 of the serialized, partially or fully signed activation transaction |
| `signature` | string | CONDITIONAL | Required when `type="signature"`. Base58 of the on-chain transaction signature |

The default pull-mode form mirrors the Solana charge profile: the
client builds and signs the activation transaction, the server
co-signs as fee payer (if `feePayer == true`) and broadcasts. The
push-mode form is provided for clients that cannot delegate broadcast
to the server; the client broadcasts directly and presents the
confirmed signature.

Each subscription credential MUST be usable only once per challenge.
Servers MUST reject replayed credentials. The challenge `id` is
HMAC-bound to the server's secret key and is the source of truth for
single-use enforcement (mirroring {{I-D.httpauth-payment}}'s
guidance).

# Activation Transaction Composition

The activation transaction MUST contain the following instructions in
this order, and SHOULD NOT contain any other instructions:

1. (OPTIONAL) Compute-budget instructions
   (`SetComputeUnitLimit`, `SetComputeUnitPrice`).
2. (CONDITIONAL) `initialize_subscription_authority`, only if the
   `SubscriptionAuthority` PDA for `(subscriber, mint)` does not yet
   exist on-chain. Discriminator `0`.
3. `subscribe`. Discriminator `11`. Signers: subscriber. Accounts:
   plan PDA, subscription PDA, subscription authority PDA, payer (rent
   sponsor), and the system program.
4. `transfer_subscription`. Discriminator `10`. Signer: puller (the
   server, included as additional signer in the activation tx).
   Accounts: subscription PDA, plan PDA, subscription authority PDA,
   payer ATA, destination ATA(s), mint, token program.
5. (OPTIONAL) A memo instruction containing the canonical JSON of
   `{"externalId": "..."}` if `externalId` was present in the
   challenge.

Servers MUST reject activation transactions that:

- contain instructions not in the list above;
- contain the listed instructions in a different order;
- omit `subscribe` or `transfer_subscription`;
- target a program other than the pinned subscriptions program for
  the subscription instructions, or a different token program than
  `methodDetails.tokenProgram` for the token instructions;
- specify a fee payer other than the subscriber when `feePayer` is
  absent or `false`, or other than `methodDetails.feePayerKey` when
  `feePayer` is `true`;
- contain writable account references that could redirect value to an
  unauthorized destination.

# Settlement Procedure

## Activation

1. Verify the credential's `challenge.id` is HMAC-bound to the
   server's secret and has not been used before. Reject as
   `invalid-challenge` otherwise.
2. Verify the pinned fields (method, intent, realm, currency,
   recipient, planId, mint, periodUnit, periodCount,
   subscriptionExpires, methodDetails.programId,
   methodDetails.tokenProgram, methodDetails.puller) of the echoed
   challenge match this server's configured request, per
   {{I-D.httpauth-payment}}.
3. Decode the activation transaction per {{credential-schema}} and
   validate its instruction shape per the rules in
   {{activation-transaction-composition}}.
4. If pull mode (`type="transaction"`): co-sign as fee payer if
   `feePayer == true`, broadcast to the configured cluster, and await
   confirmation.
5. If push mode (`type="signature"`): fetch the transaction by
   signature, verify it was confirmed on the expected cluster, and
   validate its instruction shape as above.
6. After confirmation, fetch the `SubscriptionDelegation` account and
   verify:
   - the PDA matches the expected derivation from `planId` and the
     transaction's subscriber signer;
   - `delegation.plan_pda == methodDetails.planId`;
   - `delegation.mint == methodDetails.mint`;
   - `delegation.amount_per_period == parse_u64(challenge.amount)`;
   - `delegation.period_hours == map_period_to_hours(periodUnit,
     periodCount)`;
   - `delegation.amount_pulled_in_period == amount_per_period` (the
     first-period charge was executed atomically).
7. Compute `subscriptionId = base64url(SubscriptionDelegation_PDA
   bytes, no padding)`.
8. Persist server state per {{server-state-management}}.
9. Return `200 OK` with the receipt defined in {{receipt-format}}.

## Renewal

Renewals are server-driven. The server SHOULD run a worker that, for
each active subscription, checks whether the current billing period
has been charged by reading the on-chain delegation. When
`amount_pulled_in_period < amount_per_period` and the current
timestamp is within the current billing period, the worker submits one
`transfer_subscription` instruction.

On a subsequent gated request from the subscriber:

- if the on-chain delegation shows the current period has been
  charged, the server responds `200 OK` with a renewal receipt
  including `periodIndex >= 1`;
- if the current period is unpaid (renewal not yet attempted, or
  renewal failed), the server responds `402 Payment Required` with a
  fresh subscription challenge.

Servers MUST NOT collect more than one successful renewal per billing
period for a given subscription. The on-chain program enforces this
invariant; servers SHOULD also enforce it locally to avoid duplicate
RPC submissions during retries.

If one or more billing periods elapse with no successful charge, the
on-chain program collapses to the current billing period and grants at
most one charge against that period. Servers MUST NOT attempt to
collect charges for the skipped periods.

## Cancellation {#cancellation}

Cancellation is out-of-band and on-chain. The subscriber submits
`cancel_subscription` to the subscriptions program. The program sets
`expires_at_ts` to the end of the currently-paid billing period if the
plan is still valid and matches the delegation, or to the current
timestamp if the plan has been invalidated.

Servers MUST observe cancellation by reading
`delegation.expires_at_ts` (directly via RPC, via a websocket
subscription, or via indexed `SubscriptionCancelledEvent` events). For
gated requests received while
`current_ts < delegation.expires_at_ts`, the server SHOULD continue to
serve the resource using the receipt of the most recent paid period.
For requests received at or after `expires_at_ts`, the server MUST
return `402 Payment Required` with a fresh challenge.

Servers MAY additionally expose an application-level UX that submits
`cancel_subscription` on behalf of the subscriber via a signed
out-of-band message; that is an application concern outside the
authorization wire contract.

## Revocation and Rent Reclaim

After a delegation's `expires_at_ts` has passed, any party named in
the delegation's `header` (subscriber, or the rent sponsor) MAY submit
`revoke_delegation` to close the PDA and reclaim the rent. Servers
that paid rent during activation SHOULD run a janitor task that
revokes expired delegations they sponsored.

`revoke_delegation` is not required for correctness: an expired
delegation is non-pullable on-chain regardless of whether it has been
closed.

# Receipt Format {#receipt-format}

The server MUST return a `Payment-Receipt` header on successful
activations and renewals per {{I-D.httpauth-payment}}.

The receipt payload contains:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `method` | string | REQUIRED | `"solana"` |
| `intent` | string | REQUIRED | `"subscription"` |
| `status` | string | REQUIRED | `"success"` |
| `reference` | string | REQUIRED | Base58 transaction signature of the settlement transaction (activation tx for `periodIndex=0`; renewal tx otherwise) |
| `subscriptionId` | string | REQUIRED | Base64url of the `SubscriptionDelegation` PDA bytes, no padding |
| `planId` | string | REQUIRED | Base58 of the `Plan` PDA |
| `periodIndex` | string | REQUIRED | Decimal integer string. `"0"` on activation; `"N"` for the Nth renewal after activation |
| `periodStartTs` | string | REQUIRED | {{RFC3339}} timestamp of the current period's start |
| `periodEndTs` | string | REQUIRED | {{RFC3339}} timestamp of the current period's end (exclusive) |
| `expiresAt` | string | OPTIONAL | {{RFC3339}} effective subscription expiry. When set, the minimum of `plan.end_ts` (if `!= 0`) and the credential's `subscriptionExpires` |
| `timestamp` | string | REQUIRED | {{RFC3339}} settlement time |
| `externalId` | string | OPTIONAL | Echo of the challenge `externalId` if present |

The `subscriptionId` value is stable across renewals for a given
subscription: it is derived from the immutable
`SubscriptionDelegation` PDA and does not change until the delegation
is closed via `revoke_delegation`.

# Distribution Splits {#distribution-splits}

The on-chain split between recipients is governed by
`plan.destinations`, not by the challenge. The `methodDetails.splits`
field, when present, is advisory: it allows the server to declare the
expected distribution so the client can display it to the subscriber
before signing. Clients SHOULD verify that the on-chain
`plan.destinations` matches the advisory `splits` and refuse to sign
if they diverge.

The subscriptions program emits one `SubscriptionTransferEvent` per
destination when more than one is configured, allowing receipts to be
attributed end-to-end. This specification does not define a wire
representation for per-destination accounting; it is an application
concern.

# Authorized Signer

For this profile, the activation transaction is signed by the
subscriber's funding key. There is no concept of a delegated session
signer (as in the session intent's `authorizedSigner`).

A future revision of this specification MAY introduce a delegated
signer for activation (for example, a `secp256r1` passkey credential
verified by Solana's native verification program). Implementations
MUST treat the funding key as the only authorized activation signer
in this revision.

# Fee Sponsorship

When `methodDetails.feePayer` is `true`:

- The challenge MUST include `methodDetails.feePayerKey`.
- The client MUST build the activation transaction with
  `feePayerKey` as the fee payer and MUST sign as subscriber (partial
  signature).
- The server MUST co-sign with the fee-payer key and broadcast. The
  server MUST verify the transaction does not include unrelated
  writable accounts or instructions that could redirect funds.

Renewal transactions are submitted by the server and paid by the
server's puller key by default; there is no client-side fee
involvement after activation.

# Server State Management {#server-state-management}

Servers MUST maintain durable per-subscription state sufficient to:

1. Detect that the current billing period has been charged before
   serving content.
2. Submit at most one successful renewal per period.
3. Honor cancellation effective at `delegation.expires_at_ts`.
4. Service idempotent retries during activation without producing
   duplicate on-chain transactions.

The minimum required state per subscription:

| Field | Description |
|-------|-------------|
| `subscriptionId` | base64url of the on-chain `SubscriptionDelegation` PDA |
| `planId` | base58 of the `Plan` PDA |
| `subscriber` | base58 of the subscriber pubkey |
| `mint` | base58 of the SPL token mint |
| `billingAnchorTs` | initial `current_period_start_ts` from the on-chain delegation |
| `periodLengthSeconds` | `period_hours * 3600` |
| `lastChargedPeriodIndex` | index of the most recently charged period, derived from the on-chain state |
| `expiresAtTs` | minimum of `plan.end_ts` (if `!= 0`) and the credential's `subscriptionExpires` (if present) |
| `cancelled` | boolean derived from `delegation.expires_at_ts != 0` |
| `activationTxSignature` | for audit |

Server state SHOULD be treated as a cache over on-chain state; the
on-chain delegation is the source of truth. Servers MUST re-read the
on-chain delegation when:

- a gated request arrives and the local cache indicates the current
  period is unpaid;
- a cancellation is detected by webhook or event subscription;
- the local cache is older than a configurable freshness bound
  (RECOMMENDED: one billing period or 1 hour, whichever is shorter).

For idempotent retries, clients SHOULD include an `Idempotency-Key`
header per {{I-D.ietf-httpapi-idempotency-key-header}}. Servers MUST
NOT collect the same activation charge twice for a duplicate
idempotent request; the on-chain `subscribe` instruction additionally
fails with `AlreadySubscribed` if a delegation already exists, so
duplicate activations are constrained by the chain.

# Error Responses

Servers MUST use the problem types defined in {{I-D.httpauth-payment}}
and {{RFC9457}}:

| Condition | Problem Type | HTTP Status |
|-----------|--------------|-------------|
| Credential is malformed (missing fields, invalid base64, etc.) | `malformed-credential` | 402 |
| Challenge has expired, has been used, or has invalid signature | `invalid-challenge` | 402 |
| Activation transaction is well-formed but fails on-chain verification (wrong program, wrong amount, wrong mint, terms mismatch) | `verification-failed` | 402 |
| Subscription is canceled or expired | `verification-failed` | 402 |
| Current billing period is unpaid (renewal not yet collected) | `verification-failed` | 402 |

All 402 responses MUST include a fresh `WWW-Authenticate` challenge.

# Security Considerations

## Transport Security

All communication MUST use TLS 1.2 or higher.

## Plan Spoofing

Clients MUST re-derive the `Plan` PDA from `methodDetails.planId` and
verify on-chain that the plan is owned by the program identified by
`methodDetails.programId`. A malicious server could supply a `planId`
pointing to a different program or to an account with different terms.

Clients MUST verify that the on-chain plan's `amount_per_period`,
`mint`, and `period_hours` match the challenge's `amount`,
`methodDetails.mint`, and the mapping defined in {{period-mapping}}.
Discrepancies MUST be treated as a malformed challenge.

## Subscription Authority Kill Switch

The `SubscriptionAuthority` PDA is per-(payer, mint) and shared across
all subscriptions on that mint. Closing the authority via
`close_subscription_authority` invalidates every delegation that
references it through the `init_id` snapshot, returning
`StaleSubscriptionAuthority` on subsequent pulls. Applications SHOULD
expose this only as an explicit "revoke all subscriptions for token X"
UX, never as a side effect of routine operations.

Servers MUST NOT pull rent from the subscriber's authority account
and MUST NOT rely on its long-term existence beyond the lifetime of
their own delegations; a legitimate kill-switch event terminates all
subscriptions, including their own.

## Plan Immutability

The on-chain `Plan` core terms are immutable (mint, amount_per_period,
period_hours, destinations). Merchants MUST NOT attempt to mutate
terms by re-creating the plan under the same address; clients MUST
detect re-creation by checking that the `Plan` exists at the expected
address and was not closed between subscription activations.

Plans MAY transition to `Sunset` status; servers MUST stop issuing new
subscription challenges against sunset plans, while honoring existing
subscriptions until `end_ts`.

## Account Ownership and CPI Validation

Servers and clients MUST validate the expected program ownership of
every account they read:

- the `Plan` PDA: owned by the subscriptions program
  (`methodDetails.programId`);
- the `SubscriptionDelegation` PDA: owned by the subscriptions
  program;
- the `SubscriptionAuthority` PDA: owned by the subscriptions
  program;
- the subscriber and destination token accounts: owned by
  `methodDetails.tokenProgram`;
- the mint: owned by `methodDetails.tokenProgram`.

The subscriptions program validates every external program account
referenced during a CPI (system program, SPL Token / Token-2022,
associated-token program) against the expected canonical IDs.
Implementations MUST NOT allow user-controlled program accounts to
influence the activation, transfer, or revocation paths.

## Token-2022 Extension Policy

For Token-2022 mints, the mint allowlist defined in this section is
the only set of extensions permitted under this profile. The program
re-validates the extension set on every token-touching instruction;
unlisted or malformed extensions cause the program to fail closed.

Implementations MUST NOT resolve transfer-hook extra accounts, route
through fee withholding, or honor pause flags. A subscription created
against a mint that later acquires a disallowed extension will fail
all subsequent pulls; servers SHOULD detect this and surface it to
subscribers as a forced cancellation.

## Recurring Charge Awareness

Clients MUST clearly communicate that activation authorizes future
recurring charges, in compliance with the shared spec's requirement.
Clients SHOULD display the per-period amount, period length, intended
recipient, and (when present) the subscription expiry timestamp before
prompting the subscriber to sign.

## Duplicate Charge Prevention

The on-chain per-period accounting (`amount_pulled_in_period`)
prevents the server from over-charging within a billing period.
Servers MUST additionally implement durable local state to prevent
duplicate renewal submissions caused by retries, parallel workers, or
crashes between RPC `sendTransaction` and confirmation.

Servers SHOULD use a per-subscription lease (e.g., a database row
lock with a short TTL) when submitting a renewal, releasing the lease
only after confirming the on-chain state has advanced.

## Cancellation Visibility

Servers MUST read on-chain state, not just local state, when serving
content for a subscription that may have been cancelled out-of-band.
Servers SHOULD subscribe to `SubscriptionCancelledEvent` via a
websocket-backed indexer and update local state promptly.

## Splits Canonicalization

When `methodDetails.splits` is present, the canonical preimage rules
of the Solana session specification apply for the purpose of computing
any advisory hash. The on-chain distribution is governed by
`plan.destinations`; servers MUST NOT rely on the advisory splits as
authority for fund routing.

## Clock Skew

The on-chain `current_period_start_ts` is set from `Clock` at
activation time. Servers MUST use chain-derived timestamps when
computing period boundaries; local wall-clock times are advisory.
Servers MUST allow configurable clock-skew tolerance (RECOMMENDED:
30 seconds) when interpreting `subscriptionExpires` against the
challenge `expires`.

## Caching

Responses to subscription challenges (402 Payment Required) MUST
include `Cache-Control: no-store` to prevent intermediaries from
caching the challenge.

Responses containing `Payment-Receipt` headers MUST include
`Cache-Control: private` to prevent shared caches from storing
receipts.

# IANA Considerations

The `subscription` payment intent is registered by
{{I-D.payment-intent-subscription}}. This document does not register
it again. The `solana` payment method is registered by the companion
Solana charge specification; this document adds `subscription` to the
set of intents that method supports.

--- back

# Examples

This section is non-normative.

## Activation

**Challenge:**

~~~http
HTTP/1.1 402 Payment Required
Cache-Control: no-store
WWW-Authenticate: Payment id="qT8wErYuI3oPlKjH6gFdSa",
  realm="api.example.com",
  method="solana",
  intent="subscription",
  expires="2026-01-15T12:05:00Z",
  request="<base64url-encoded JSON below>"
~~~

The `request` decodes to:

~~~json
{
  "amount": "10000000",
  "currency": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  "periodUnit": "day",
  "periodCount": "30",
  "subscriptionExpires": "2026-07-14T12:00:00Z",
  "recipient": "9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin",
  "methodDetails": {
    "programId": "De1egAFMkMWZSN5rYXRj9CAdheBamobVNubTsi9avR44",
    "planId": "8tWbqLkUJoYy7zXc5h2EvCRoaQEv2xnQjUuYhc3rzCgT",
    "mint": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    "tokenProgram": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
    "decimals": 6,
    "puller": "5fKb5cF22cFybZB1H4hLDydFhwoQy9JzKzRWaSbMkB6h",
    "network": "mainnet-beta",
    "feePayer": true,
    "feePayerKey": "5fKb5cF22cFybZB1H4hLDydFhwoQy9JzKzRWaSbMkB6h"
  }
}
~~~

This requests a recurring payment of 10.00 USDC every 30 days until
2026-07-14T12:00:00Z, with the server (5fKb...kB6h) sponsoring
transaction fees.

**Activation transaction (composed by client):**

~~~
Instruction 0: SetComputeUnitLimit(200000)
Instruction 1: SetComputeUnitPrice(1)
Instruction 2: subscriptions.initialize_subscription_authority
               signer: subscriber
               accounts: [authority_pda, subscriber, mint, ata, ...]
Instruction 3: subscriptions.subscribe
               signer: subscriber
               accounts: [plan_pda, subscription_pda, authority_pda,
                          subscriber, system_program]
Instruction 4: subscriptions.transfer_subscription
               signer: puller
               accounts: [subscription_pda, plan_pda, authority_pda,
                          subscriber_ata, destination_ata, mint,
                          token_program]
Fee payer: 5fKb5cF22cFybZB1H4hLDydFhwoQy9JzKzRWaSbMkB6h (server)
Signatures: subscriber (partial), puller (server, added at co-sign)
~~~

**Credential:**

~~~json
{
  "challenge": {
    "id": "qT8wErYuI3oPlKjH6gFdSa",
    "realm": "api.example.com",
    "method": "solana",
    "intent": "subscription",
    "request": "eyJ...",
    "expires": "2026-01-15T12:05:00Z"
  },
  "payload": {
    "type": "transaction",
    "transaction": "AQAAAA...base64 of partially signed tx..."
  }
}
~~~

**Receipt:**

If activation settles at `2026-01-15T12:03:10Z`, the
`Payment-Receipt` payload decodes to:

~~~json
{
  "method": "solana",
  "intent": "subscription",
  "status": "success",
  "reference": "5J8...base58 transaction signature...Kt",
  "subscriptionId": "BXQGmO5VwTrl5RfFr6Y8XQZ4nPj9QqMOiKkRn3pZ4ZE",
  "planId": "8tWbqLkUJoYy7zXc5h2EvCRoaQEv2xnQjUuYhc3rzCgT",
  "periodIndex": "0",
  "periodStartTs": "2026-01-15T12:03:10Z",
  "periodEndTs": "2026-02-14T12:03:10Z",
  "expiresAt": "2026-07-14T12:00:00Z",
  "timestamp": "2026-01-15T12:03:10Z"
}
~~~

The server records:

- `subscriptionId = "BXQGmO5VwTrl5RfFr6Y8XQZ4nPj9QqMOiKkRn3pZ4ZE"`
- `planId = "8tWbqLkUJoYy7zXc5h2EvCRoaQEv2xnQjUuYhc3rzCgT"`
- `billingAnchorTs = 2026-01-15T12:03:10Z`
- `periodLengthSeconds = 2592000`
- `lastChargedPeriodIndex = 0`
- `expiresAtTs = 2026-07-14T12:00:00Z`

## Renewal Across Multiple Periods

Using the activation timestamp above, the billing periods are:

- Period 0: `[2026-01-15T12:03:10Z, 2026-02-14T12:03:10Z)`
- Period 1: `[2026-02-14T12:03:10Z, 2026-03-16T12:03:10Z)`
- Period 2: `[2026-03-16T12:03:10Z, 2026-04-15T12:03:10Z)`

Requests during Period 0 succeed without further on-chain activity.
When Period 1 begins, the server's renewal worker submits one
`transfer_subscription` instruction to the subscriptions program. On
success, the on-chain delegation advances to
`current_period_start_ts = 2026-02-14T12:03:10Z` and
`amount_pulled_in_period = 10000000`.

A subsequent gated request at, say, `2026-02-14T12:05:42Z` returns:

~~~json
{
  "method": "solana",
  "intent": "subscription",
  "status": "success",
  "reference": "9Ka...base58 renewal tx signature...rL",
  "subscriptionId": "BXQGmO5VwTrl5RfFr6Y8XQZ4nPj9QqMOiKkRn3pZ4ZE",
  "planId": "8tWbqLkUJoYy7zXc5h2EvCRoaQEv2xnQjUuYhc3rzCgT",
  "periodIndex": "1",
  "periodStartTs": "2026-02-14T12:03:10Z",
  "periodEndTs": "2026-03-16T12:03:10Z",
  "expiresAt": "2026-07-14T12:00:00Z",
  "timestamp": "2026-02-14T12:05:42Z"
}
~~~

## Cancellation At Period End

Suppose Period 2 has been charged and the subscriber cancels by
submitting `cancel_subscription` on-chain at `2026-03-20T09:00:00Z`.
The program sets `delegation.expires_at_ts = 2026-04-15T12:03:10Z`
(end of Period 2).

Requests before `2026-04-15T12:03:10Z` continue to succeed. The
server's renewal worker MUST NOT submit a Period 3 charge: the
on-chain `transfer_subscription` would fail with
`SubscriptionCancelled`.

Requests at or after `2026-04-15T12:03:10Z` receive:

~~~http
HTTP/1.1 402 Payment Required
Cache-Control: no-store
WWW-Authenticate: Payment id="n3xtP3ri0d",
  realm="api.example.com",
  method="solana",
  intent="subscription",
  request="<base64url-encoded JSON below>"
~~~

## Failed Renewal and Lapse

If the subscriber's token balance is insufficient when the server
attempts a Period 3 renewal, the on-chain transaction fails. The
server records the failure but does not retry continuously; it returns
`402 Payment Required` on subsequent gated requests.

If a later retry within Period 3 succeeds, the server may grant access
for Period 3 and update its local state.

If Period 4 begins before any successful Period 3 charge, the next
successful `transfer_subscription` collapses to Period 4 (the program
advances `current_period_start_ts` to Period 4's start and resets
`amount_pulled_in_period = 0`). The skipped Period 3 charge does not
become additional on-chain spending authority.

## Natural Expiry

When `subscriptionExpires = 2026-07-14T12:00:00Z` is reached, the
server stops submitting renewal transactions. A subsequent
`transfer_subscription` would still succeed on-chain (the program
itself does not enforce `subscriptionExpires`; it is a server-side
contract derived from the credential), so the server MUST honor the
expiry by ceasing renewal submissions and serving fresh challenges.

Servers SHOULD additionally close the delegation via
`revoke_delegation` once the grace period has elapsed and reclaim
their rent if they sponsored activation.

# Acknowledgements

The authors thank the MPP community and the Tempo team for their
feedback on this specification, and the Solana Foundation
subscriptions program team for the on-chain primitives this profile
builds on.
