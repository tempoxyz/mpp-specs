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

This document defines the Solana profile of the "subscription"
payment intent for use with the Payment HTTP Authentication Scheme.
It specifies how clients grant servers permission to collect a fixed
SPL token payment once per billing period using a subscription
delegation held by an audited on-chain program. This profile
intentionally models the recurring transfer authorization itself, not
a richer billing object.

--- middle

# Introduction

The "subscription" intent on Solana represents a recurring
fixed-amount SPL token payment. The client grants the server a
recipient-scoped subscription delegation with a per-period spending
limit. Activation creates the delegation and collects the first
billing-period charge in the same transaction.

This intent is useful for recurring API plans, content subscriptions,
and other Solana-priced services with a stable amount per billing
period.

This profile is intentionally narrower than a general billing
subscription. It standardizes a recurring token-transfer authorization,
not price catalogs, quantities, prorations, deferred starts, or
billing-anchor resets.

## Relationship to the Subscription Intent

This document inherits the shared request semantics of the
"subscription" intent from {{I-D.payment-intent-subscription}}. It
defines only the Solana-specific `methodDetails`, `payload`,
activation transaction shape, on-chain lifecycle, and verification
procedures for the "solana" payment method.

Solana subscriptions support only subscription-delegation
fulfillment. Solana transactions containing standalone SPL Token
`Approve` instructions and push-mode hash credentials do not provide
the per-period enforcement required for this intent.

Solana also imposes an additional constraint that is not part of the
shared intent: the recurring authorization MUST be created against a
`Plan` account that the merchant has published on-chain prior to the
challenge. This method therefore elevates the shared optional
`externalId` field to REQUIRED and uses it to carry the base58
address of that on-chain plan.

Solana subscriptions also require the per-period spending limit,
recipient scoping, and missed-period non-accumulation described in
this document, including the Token-2022 mint constraints in
{{token-extension-policy}}. Servers MUST reject request objects on
deployments that cannot enforce those restrictions.

# Requirements Language

{::boilerplate bcp14-tagged}

# Terminology

This document uses the terms `Subscription`, `Billing Period`,
`Activation`, `Renewal`, `Cancellation`, and `Subscription Identifier`
as defined by {{I-D.payment-intent-subscription}}. The following
additional terms are specific to the Solana profile.

SPL Token
: Solana's standard token program. SPL Token-2022 is its extension-
  enabled successor and is supported subject to {{token-extension-policy}}.

Subscriptions Program
: The audited on-chain program implementing the account model and
  instructions referenced by this specification
  {{SUBSCRIPTIONS-PROGRAM}}.

Plan
: An immutable on-chain PDA published by the merchant that defines a
  subscription's terms: token mint, amount per billing period, period
  length, allowed pullers, and recipient destinations. Derived from
  `["plan", owner, plan_id]`.

Subscription Delegation
: A per-subscriber on-chain PDA that snapshots the plan terms at
  subscription time and tracks current-period accounting state.
  Derived from `["subscription", plan_pda, subscriber]`.

Subscription Authority
: A per-(payer, mint) on-chain PDA that holds the SPL Token delegate
  authority over the payer's associated token account. The
  subscriptions program signs transfers as this PDA. Derived from
  `["SubscriptionAuthority", subscriber, mint]`.

# Intent Semantics

## Definition

The "subscription" intent on Solana represents a request for a
recurring fixed-amount SPL token payment of `amount`, charged once
per billing period until explicit cancellation, until the on-chain
subscription delegation is otherwise invalidated, or until the
optional `subscriptionExpires` timestamp is reached.

On Solana, the recurring authorization is held by an audited on-chain
program {{SUBSCRIPTIONS-PROGRAM}}, deployed at a canonical program ID
that servers MUST pin in the challenge and clients MUST validate
before signing. The program defines three on-chain accounts
referenced by this specification:

- **Plan**, published off the critical path of the 402 challenge by
  the merchant. The plan's core terms (mint, amount per billing
  period, period length, destinations) are immutable once published.
- **SubscriptionDelegation**, created when the subscriber activates a
  subscription. The delegation snapshots the plan's terms and tracks
  the current billing-period start time and the amount already pulled
  in the current period.
- **SubscriptionAuthority**, created per `(subscriber, mint)` and
  acting as the on-chain delegate over the subscriber's token
  account.

The program enforces per-period spending limits, recipient scoping,
and missed-period non-accumulation: renewals advance the current
billing-period start by whole multiples of the period length and
reset the in-period counter to zero, so a successful pull authorizes
at most one charge for the then-current billing period regardless of
how many periods have elapsed. Cancellation is performed on-chain and
takes effect at the end of the currently-paid billing period.

## Properties

| Property | Value |
|----------|-------|
| **Intent Identifier** | `subscription` |
| **Payment Timing** | Recurring (activation charge atomic with delegation creation, then once per period via server-driven pulls) |
| **Idempotency** | Credential single-use; on-chain delegation reusable across billing periods |
| **Reversibility** | Cancellable on-chain; effective at end of currently-paid billing period |

## Flow

The following diagram illustrates the Solana subscription flow:

~~~
   Client                        Server                          Solana
      │                             │                             │
      │  (1) GET /api/resource      │                             │
      │-------------------------->  │                             │
      │                             │                             │
      │  (2) 402 Payment Required   │                             │
      │      intent="subscription"  │                             │
      │<--------------------------  │                             │
      │                             │                             │
      │  (3) Sign activation tx     │                             │
      │      (subscribe + first     │                             │
      │       transfer)             │                             │
      │                             │                             │
      │  (4) Authorization: Payment │                             │
      │-------------------------->  │                             │
      │                             │                             │
      │                             │  (5) Co-sign + broadcast    │
      │                             │      subscription delegation│
      │                             │      + first transfer       │
      │                             │-------------------------->  │
      │                             │                             │
      │  (6) 200 OK + Receipt       │                             │
      │<--------------------------  │                             │
      │                             │                             │
      │        ... later period ... │                             │
      │                             │                             │
      │                             │  (7) transfer_subscription  │
      │                             │      (server-driven pull)   │
      │                             │-------------------------->  │
      │                             │                             │
      │  (8) 200 OK + Receipt       │                             │
      │<--------------------------  │                             │
      │                             │                             │
~~~

# Request Schema

The `request` parameter in the `WWW-Authenticate` challenge contains a
base64url-encoded JSON object. The `request` JSON MUST be serialized
using JSON Canonicalization Scheme (JCS) {{RFC8785}} and
base64url-encoded without padding per {{I-D.httpauth-payment}}.

## Shared Fields

Solana uses the shared `amount`, `currency`, `periodUnit`,
`periodCount`, `subscriptionExpires`, `recipient`, `description`, and
`externalId` fields from {{I-D.payment-intent-subscription}}, with
their meanings preserved. The Solana profile elevates `recipient` and
`externalId` from OPTIONAL to REQUIRED, and constrains the values
that `periodUnit` may take.

### Required Fields

| Field | Type | Description |
|-------|------|-------------|
| `amount` | string | Fixed payment amount per billing period in base units |
| `currency` | string | SPL Token or Token-2022 mint address (see {{currency-formats}}) |
| `periodUnit` | string | Billing period unit. The value MUST be `day` or `week` |
| `periodCount` | string | Positive integer count of `periodUnit` values per billing period |
| `recipient` | string | Recipient address authorized for subscription charges. The activation transaction MUST bind the destination at sign time |
| `externalId` | string | Base58 address of the on-chain `Plan` |

The `amount` value MUST be a string representation of a positive
integer in base 10 with no sign, decimal point, exponent, or
surrounding whitespace. Leading zeros MUST NOT be used.

The `periodCount` value MUST be a string representation of a positive
integer in base 10 with no sign, decimal point, exponent, or
surrounding whitespace. Leading zeros MUST NOT be used.

Solana subscription delegations use fixed elapsed-time periods and
cannot represent calendar-month billing exactly. Servers MUST reject
`periodUnit="month"`. The shared period fields map to a per-billing-
period interval in hours as follows:

- `periodUnit="day"` maps to `periodCount * 24` hours
- `periodUnit="week"` maps to `periodCount * 168` hours

Servers MUST reject request objects where the mapped per-billing-
period interval is zero or exceeds 8760 hours.

The `externalId` value is the base58 address of the on-chain `Plan`
account the subscription is created against. Servers MUST reject
request objects where the on-chain `Plan` at this address does not
exist, has been closed, is not owned by the subscriptions program
identified by `methodDetails.programId`, or whose snapshotted terms
diverge from the challenge fields (mint, per-period amount, mapped
per-billing-period interval).

### Optional Fields

| Field | Type | Description |
|-------|------|-------------|
| `subscriptionExpires` | string | Subscription expiry timestamp in {{RFC3339}} format |
| `description` | string | Human-readable subscription description |
| `methodDetails` | object | Solana-specific extension data (see {{method-extensions}}) |

Servers issuing `intent="subscription"` challenges SHOULD include the
`expires` auth-param in `WWW-Authenticate` per {{I-D.httpauth-payment}},
using {{RFC3339}} format. Request objects MUST NOT duplicate the
challenge expiry value. The `subscriptionExpires` field instead
defines when the subscription itself expires.

If the challenge includes `expires`, the `subscriptionExpires` value
MUST be strictly later than the challenge `expires` timestamp. Servers
MUST reject credentials where `subscriptionExpires` is at or before
the challenge `expires`.

## Currency Formats {#currency-formats}

The `currency` field on Solana is the base58-encoded mint address of
an SPL Token or SPL Token-2022 mint:

| Format | Example | Description |
|--------|---------|-------------|
| Token mint | `"EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"` | Base58 address of an SPL Token or Token-2022 mint |

Implementations MUST treat `currency` and `methodDetails.mint` as the
same value; servers MUST reject request objects where they differ.
Native SOL is not a valid currency for the "subscription" intent on
Solana.

Base58 values in this profile use the standard Solana alphabet
{{BASE58}}. Address comparisons are by decoded value, not raw string
form.

## Method Extensions {#method-extensions}

All Solana-specific request parameters live in `methodDetails`:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `methodDetails.mint` | string | REQUIRED | Mint address echoed from `currency`. MUST equal the on-chain `plan.mint` |
| `methodDetails.decimals` | number | REQUIRED | Decimal precision of the mint |
| `methodDetails.tokenProgram` | string | REQUIRED | Token program ID. The value MUST be the SPL Token program or the SPL Token-2022 program |
| `methodDetails.puller` | string | REQUIRED | Base58 of the server's puller pubkey. MUST be `plan.owner` or appear in `plan.pullers` |
| `methodDetails.programId` | string | OPTIONAL | Base58 of the subscriptions program ID. If omitted, the default value is the canonical mainnet deployment |
| `methodDetails.network` | string | OPTIONAL | `"mainnet"`, `"devnet"`, `"testnet"`, or `"localnet"`. If omitted, the default value is `"mainnet"` |
| `methodDetails.feePayer` | boolean | OPTIONAL | If `true`, the client constructs the activation transaction with the server as fee payer |
| `methodDetails.feePayerKey` | string | OPTIONAL | Base58 of the server fee-payer pubkey. REQUIRED when `feePayer` is `true` |
| `methodDetails.recentBlockhash` | string | OPTIONAL | Pre-fetched blockhash to bind to the activation transaction |
| `methodDetails.splits` | array | OPTIONAL | Advisory distribution; the on-chain split is governed by `plan.destinations` |

Servers MUST reject request objects where `currency`,
`methodDetails.tokenProgram`, `methodDetails.decimals`, `amount`, or
the mapped per-billing-period interval diverge from the on-chain
`Plan` referenced by `externalId`.

## Implementor Guidance

This section is non-normative.

The Solana profile is a deliberately narrow projection of what an
on-chain subscription system could express. Implementations should:

- Treat the on-chain `Plan` as the authoritative source of recurring
  terms. The challenge `request` MUST agree with the plan exactly;
  servers should reject mismatched challenges before any client
  signing.
- Refuse to map `periodUnit="month"` rather than approximate it with
  30-day or 31-day fixed periods. Clients receiving a `month` request
  for the Solana method should treat it as a server bug.
- Avoid publishing one Solana `Plan` per billing-amount tier when the
  amount and recipient set actually differ; combining them under a
  single plan with looser destinations expands the on-chain spending
  surface.
- Submit at most one `transfer_subscription` per billing period per
  subscription, and never retry past the end of the period the
  transaction was constructed against.
- Maintain durable server state sufficient to prevent duplicate
  charges across retries, concurrent requests, and out-of-band on-
  chain events such as failed renewals or independent cancellations.

## Examples

~~~json
{
  "amount": "10000000",
  "currency": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  "periodUnit": "day",
  "periodCount": "30",
  "subscriptionExpires": "2026-07-14T12:00:00Z",
  "recipient": "9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin",
  "externalId": "8tWbqLkUJoYy7zXc5h2EvCRoaQEv2xnQjUuYhc3rzCgT",
  "methodDetails": {
    "programId": "De1egAFMkMWZSN5rYXRj9CAdheBamobVNubTsi9avR44",
    "mint": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    "tokenProgram": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
    "decimals": 6,
    "puller": "5fKb5cF22cFybZB1H4hLDydFhwoQy9JzKzRWaSbMkB6h",
    "network": "mainnet",
    "feePayer": true,
    "feePayerKey": "5fKb5cF22cFybZB1H4hLDydFhwoQy9JzKzRWaSbMkB6h"
  }
}
~~~

# Credential Requirements

The credential in the `Authorization` header contains a base64url-
encoded JSON object per {{I-D.httpauth-payment}}.

## Payload

The credential `payload` for a Solana "subscription" intent contains
the activation grant. For this profile only one credential action is
defined: activation. Renewals are server-driven on-chain transactions
and do not produce HTTP credentials. Cancellations are out-of-band
on-chain operations and use no credential.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `challenge` | object | REQUIRED | Echo of the challenge from the server |
| `payload` | object | REQUIRED | Solana-specific activation payload |
| `source` | string | OPTIONAL | Subscriber identifier (e.g., `did:pkh:solana:...`) |

Subscriptions on Solana MUST use one of two activation-payload types.
In pull mode (`type="transaction"`), the client signs the activation
transaction and submits the serialized bytes; the server co-signs as
fee payer if configured and broadcasts. In push mode
(`type="signature"`), the client broadcasts the activation
transaction itself and submits the confirmed transaction signature.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `type` | string | REQUIRED | `"transaction"` or `"signature"` |
| `transaction` | string | CONDITIONAL | Standard-base64 of the signed activation transaction. REQUIRED when `type="transaction"` |
| `signature` | string | CONDITIONAL | Base58 of the on-chain transaction signature. REQUIRED when `type="signature"` |

Servers MUST reject credentials where `type="signature"` is combined
with `methodDetails.feePayer` set to `true`, because the server has
no opportunity to co-sign a transaction the client has already
broadcast.

The signed activation transaction MUST:

- contain a `subscribe` instruction creating the
  `SubscriptionDelegation` PDA from the on-chain `Plan` snapshot;
- contain a `transfer_subscription` instruction collecting the first-
  period charge atomically with the subscription creation;
- contain an `initialize_subscription_authority` instruction prepended
  only when the `(subscriber, mint)` authority does not yet exist
  on-chain;
- target the subscriptions program identified by
  `methodDetails.programId` (or its canonical default);
- use the SPL Token or Token-2022 program identified by
  `methodDetails.tokenProgram` for all token-touching instructions;
- pull funds from the subscriber's associated token account for
  `methodDetails.mint`;
- direct funds to the destination ATAs derived from
  `plan.destinations`;
- set the fee payer to `methodDetails.feePayerKey` when
  `methodDetails.feePayer` is `true`, and to the subscriber otherwise;
- contain no instructions other than those above plus optional
  compute-budget and memo instructions.

The signed activation transaction MUST NOT contain SPL Token `Approve`
or any other non-subscriptions-program instruction that could move the
subscriber's tokens outside the per-period limit, and MUST NOT
reference writable accounts that could redirect funds away from the
plan destinations.

## Single-Use

Each "subscription" activation credential MUST be usable only once
per challenge. Servers MUST reject replayed credentials.

A successfully activated subscription may be reused for later billing
periods until:

- The subscriber cancels it on-chain;
- The on-chain delegation is otherwise invalidated (e.g., closure of
  the `SubscriptionAuthority`);
- The `subscriptionExpires` timestamp, if present, is reached.

# Subscription Lifecycle

## Activation

For `intent="subscription"`, activation and the first billing-period
charge are a single atomic transaction:

~~~
   Client                        Server                          Solana
      |                             |                             |
      |  (1) Authorization:         |                             |
      |      Payment <credential>   |                             |
      |      (signed activation tx) |                             |
      |-------------------------->  |                             |
      |                             |                             |
      |                             |  (2) Co-sign if feePayer,   |
      |                             |      sendTransaction        |
      |                             |-------------------------->  |
      |                             |                             |
      |                             |  (3) SubscriptionDelegation |
      |                             |      created + first        |
      |                             |      transfer executed      |
      |                             |<--------------------------  |
      |                             |                             |
      |  (4) 200 OK                 |                             |
      |      Payment-Receipt: ...   |                             |
      |<--------------------------  |                             |
      |                             |                             |
~~~

When the server receives a Solana "subscription" credential, it MUST:

1. Verify the activation transaction matches the challenge: program
   ID, token program, mint, puller, destinations, and per-period
   amount as described in {{authorization-scope-verification}}.
2. Verify the subscriber identity per {{source-verification}}.
3. Co-sign the transaction as fee payer when `methodDetails.feePayer`
   is `true`, then broadcast.
4. Wait for confirmation and read the resulting on-chain state.
5. Initialize durable subscription state for later renewals.
6. Return `200 OK` with a `Payment-Receipt` for the first charge,
   including a `subscriptionId` as defined in
   {{subscription-identifier}}.

Servers MUST treat the subscription as active only after the
activation transaction settles successfully and the on-chain
`SubscriptionDelegation` account reflects
`amount_pulled_in_period == amount_per_period` for period 0.

Servers MUST NOT treat activation as successful if the activation
transaction settles at or after `subscriptionExpires`.

### Source Verification {#source-verification}

If a credential includes the optional `source` field, servers MUST
NOT trust this value without verification.

Servers MUST determine the payer identity from the activation
transaction itself, by extracting the subscriber signer (the signer
whose role corresponds to the `delegator` field of the resulting
`SubscriptionDelegation`).

If `source` is present, servers MUST verify that it uses the
`did:pkh:solana:` method and that its address matches the subscriber
signer extracted from the activation transaction.

### Authorization Scope Verification {#authorization-scope-verification}

When validating a Solana subscription credential, servers MUST verify
that the activation transaction:

- invokes only the subscriptions program identified by
  `methodDetails.programId` for subscription instructions, and only
  the token program identified by `methodDetails.tokenProgram` for
  token instructions;
- contains exactly one subscribe instruction and exactly one
  first-period transfer instruction on the subscriptions program,
  ordered with subscribe first;
- conditionally contains one subscription-authority initialization
  instruction, only if the `(subscriber, mint)` authority does not
  yet exist on-chain;
- contains no other subscriptions-program, system-program, or
  token-program instructions; compute-budget and memo instructions
  are permitted.

After the activation transaction settles, servers MUST read the
resulting `SubscriptionDelegation` account and assert that its
snapshotted terms (plan, mint, amount per billing period, mapped
per-billing-period interval) equal the corresponding challenge
fields, and that the in-period counter equals the per-billing-period
amount (i.e., the first-period charge was executed atomically with
the subscription's creation).

Servers MUST reject activation transactions that pull funds through
broader scopes than those required above.

## Renewal

For each later billing period, the server MAY submit one
`transfer_subscription` transaction using the registered subscription
delegation to pull `amount` to the plan destinations.

If the server grants access for a later billing period, it MUST
ensure that the renewal charge for that period has been collected
before, or atomically with, delivering the corresponding service.

Servers MUST NOT submit more than one successful renewal charge for
the same billing period.

The on-chain `transfer_subscription` advances
`current_period_start_ts` by whole multiples of the period length and
resets `amount_pulled_in_period` to zero on each successful pull. If
one or more billing periods elapse without a successful charge, a
later transaction authorizes at most one charge in the then-current
billing period. Servers MUST NOT treat missed billing periods as
additional on-chain spending capacity.

## Subscription Identifier {#subscription-identifier}

After successful activation, the server MUST return a
`subscriptionId` in the `Payment-Receipt`. On Solana, the
`subscriptionId` is the base64url {{RFC4648}} encoding without
padding of the `SubscriptionDelegation` account address. The
`subscriptionId` is stable across renewals: it is derived from the
on-chain account, and remains valid for the lifetime of that account.

Servers MUST NOT include a `Payment-Receipt` header on error
responses. On renewal, servers MUST return the same `subscriptionId`
for the active subscription.

The receipt payload for a Solana subscription:

| Field | Type | Description |
|-------|------|-------------|
| `method` | string | `"solana"` |
| `reference` | string | Base58 of the settlement transaction signature |
| `status` | string | `"success"` |
| `subscriptionId` | string | Base64url of the `SubscriptionDelegation` account address, no padding |
| `periodIndex` | string | Decimal index of the billing period (`"0"` on activation) |
| `periodStartTs` | string | {{RFC3339}} start of the current period |
| `periodEndTs` | string | {{RFC3339}} end (exclusive) of the current period |
| `expiresAt` | string | OPTIONAL. {{RFC3339}} effective subscription expiry |
| `timestamp` | string | {{RFC3339}} settlement time |
| `externalId` | string | Echoed from the challenge request (the on-chain plan address) |

Clients MAY retain the `subscriptionId` as application data when
referring to the active subscription in later interactions, but the
`subscriptionId` is only a receipt identifier unless an application
explicitly assigns it additional application-layer meaning.

Servers MUST authenticate or otherwise authorize the client's use of
the identified subscription before granting access or collecting a
renewal charge. Possession or presentation of a `subscriptionId`
alone is insufficient.

## Server Accounting and Idempotency

The billing anchor for a Solana subscription is the on-chain
`current_period_start_ts` written by `subscribe` when the activation
transaction settles. Servers MUST derive this anchor from chain
settlement data rather than local wall-clock time.

Billing periods are defined as:

- Period 0: `[anchor, anchor + mappedPeriodSeconds)`
- Period 1: `[anchor + mappedPeriodSeconds, anchor + 2*mappedPeriodSeconds)`
- Period N: `[anchor + N*mappedPeriodSeconds, anchor + (N+1)*mappedPeriodSeconds)`

`mappedPeriodSeconds` is `period_hours * 3600` for the on-chain
delegation.

Servers MUST maintain durable subscription state sufficient to
enforce per-period charging rules across retries and concurrent
requests. At minimum, servers MUST track:

- subscription identifier (base64url of the SubscriptionDelegation PDA)
- plan identifier (base58 of the Plan PDA)
- billing anchor
- last successfully charged billing-period index
- any in-flight billing-period index and renewal transaction signature
- subscription expiry
- cancellation status (derived from `delegation.expires_at_ts != 0`)

When granting access in a later billing period, servers MUST:

- Verify the subscription has not expired or been cancelled by reading
  `delegation.expires_at_ts` on-chain.
- Determine the current billing-period index from the anchor and the
  mapped period in seconds.
- Verify that the current billing period has not already been charged
  by reading `delegation.amount_pulled_in_period`.
- Atomically record any renewal attempt for the current billing
  period as in-flight before submitting `transfer_subscription`.
- Mark the current billing period as charged only after the renewal
  transaction settles successfully.
- Grant access only after, or atomically with, durably recording the
  successful renewal charge.

For non-idempotent requests, clients SHOULD send an `Idempotency-Key`
header per {{I-D.ietf-httpapi-idempotency-key-header}}. Servers MUST
NOT charge the same activation or billing period more than once for
duplicate idempotent requests.

## Cancellation

Subscribers can revoke a Solana subscription at any time on-chain by
submitting `cancel_subscription` against their
`SubscriptionDelegation`. The program sets `delegation.expires_at_ts`
to the end of the currently-paid billing period, after which
`transfer_subscription` MUST fail with `SubscriptionCancelled`.

Subscribers can additionally revoke every subscription tied to a
`(subscriber, mint)` by closing and reopening their
`SubscriptionAuthority`, which invalidates the delegation snapshot
recorded in each subscription created against that authority.

Servers MUST NOT submit renewal charges for billing periods after
cancellation takes effect. Servers SHOULD handle revocation
gracefully by returning a fresh subscription challenge once the
on-chain delegation has expired.

## Error Responses

When a Solana subscription cannot be used to fulfill a request, the
server MUST return an appropriate HTTP status code:

| Condition | Status Code | Behavior |
|-----------|-------------|----------|
| `subscriptionExpires` reached | 402 Payment Required | Issue new challenge |
| On-chain cancellation effective or `SubscriptionAuthority` closed | 402 Payment Required | Issue new challenge |
| Current billing period unpaid or `transfer_subscription` failed | 402 Payment Required | Issue new challenge |
| Activation transaction failed verification | 402 Payment Required | Issue new challenge |
| Invalid credential | 402 Payment Required | Issue new challenge |

For all 402 responses, the server MUST include a `WWW-Authenticate`
header with a fresh challenge. Clients receiving a 402 after a
previously valid subscription SHOULD treat the subscription as no
longer usable and initiate a new subscription flow.

# Illustrative Lifecycle Examples

This section is non-normative.

## Daily Billing Example

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
  "externalId": "8tWbqLkUJoYy7zXc5h2EvCRoaQEv2xnQjUuYhc3rzCgT",
  "methodDetails": {
    "programId": "De1egAFMkMWZSN5rYXRj9CAdheBamobVNubTsi9avR44",
    "mint": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    "tokenProgram": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
    "decimals": 6,
    "puller": "5fKb5cF22cFybZB1H4hLDydFhwoQy9JzKzRWaSbMkB6h",
    "network": "mainnet",
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
  "externalId": "8tWbqLkUJoYy7zXc5h2EvCRoaQEv2xnQjUuYhc3rzCgT",
  "periodIndex": "0",
  "periodStartTs": "2026-01-15T12:03:10Z",
  "periodEndTs": "2026-02-14T12:03:10Z",
  "expiresAt": "2026-07-14T12:00:00Z",
  "timestamp": "2026-01-15T12:03:10Z"
}
~~~

The resulting billing periods are:

- Period 0: `[2026-01-15T12:03:10Z, 2026-02-14T12:03:10Z)`
- Period 1: `[2026-02-14T12:03:10Z, 2026-03-16T12:03:10Z)`
- Period 2: `[2026-03-16T12:03:10Z, 2026-04-15T12:03:10Z)`

Requests during Period 0 do not require another renewal charge. When
Period 1 begins, the server's renewal worker submits one
`transfer_subscription` instruction to the subscriptions program. On
success, the on-chain delegation advances to
`current_period_start_ts = 2026-02-14T12:03:10Z` and
`amount_pulled_in_period = 10000000`. After that renewal succeeds,
additional requests during Period 1 do not permit another charge for
Period 1.

## Cancellation Example

Suppose Period 2 has been charged and the subscriber cancels by
submitting `cancel_subscription` on-chain at `2026-03-20T09:00:00Z`.
The program sets `delegation.expires_at_ts = 2026-04-15T12:03:10Z`
(end of Period 2).

Cancellation takes effect at the end of the current paid billing
period. The server continues honoring access through that time. The
server's renewal worker MUST NOT submit a Period 3 charge: the
on-chain `transfer_subscription` would fail with
`SubscriptionCancelled`.

Requests at or after `2026-04-15T12:03:10Z` receive
`402 Payment Required` with a fresh challenge.

## Failed Renewal Example

If the subscriber's token balance is insufficient when the server
attempts a Period 3 renewal, the on-chain transaction fails. The
server records the failure but does not retry continuously; it
returns `402 Payment Required` on subsequent gated requests.

If a later retry within Period 3 succeeds, the server may grant
access for Period 3 and update its local state.

If Period 4 begins before any successful Period 3 charge, the next
successful `transfer_subscription` collapses to Period 4 (the program
advances `current_period_start_ts` to Period 4's start and resets
`amount_pulled_in_period = 0`). The skipped Period 3 charge does not
become additional on-chain spending authority.

## Expiry Example

When `subscriptionExpires = 2026-07-14T12:00:00Z` is reached, the
server stops submitting renewal transactions. A subsequent
`transfer_subscription` would still succeed on-chain (the program
itself does not enforce `subscriptionExpires`; it is a server-side
contract derived from the credential), so the server MUST honor the
expiry by ceasing renewal submissions and serving fresh challenges.

Requests after that time receive `402 Payment Required` with a fresh
challenge.

Servers SHOULD additionally close the delegation via
`revoke_delegation` once the grace period has elapsed and reclaim
their rent if they sponsored activation.

# Security Considerations

## Recurring Charge Awareness

Clients MUST clearly communicate that a Solana subscription
authorizes future recurring on-chain transfers without requiring a
new user action for each billing period. Wallets and client UIs
SHOULD display the per-period amount, the period length, and the
`subscriptionExpires` value (when present) at activation time.

## Amount and Period Verification

Clients MUST parse and verify the `request` payload before signing:

1. Verify `amount` is reasonable for the service
2. Verify `currency` is the expected mint
3. Verify `periodUnit` and `periodCount` match expectations
4. Verify `recipient` is controlled by the expected party
5. Verify `subscriptionExpires` is acceptable when present
6. Verify the on-chain `Plan` referenced by `externalId` carries
   matching mint, per-period amount, and per-billing-period interval,
   and lists the server's puller among its authorized pullers

Clients MUST NOT sign an activation transaction whose on-chain `Plan`
does not match the challenge. Clients MUST NOT rely on the
`description` field for payment verification.

## Duplicate Charge Prevention

On-chain per-period accounting prevents overspending within a billing
period, but it does not by itself make HTTP service delivery
idempotent. Servers MUST implement durable local state to prevent
duplicate activation and renewal charges caused by retries, parallel
requests, or races between charging and service delivery.

Servers SHOULD use a per-subscription lease (e.g., a database row
lock with a short TTL) when submitting a renewal, releasing the lease
only after the on-chain state has advanced.

## Server Accountability

Servers operating Solana subscriptions are responsible for:

- Secure storage of subscription state and any sponsoring fee-payer
  keys;
- Not charging more than once per billing period;
- Honoring on-chain cancellation and revocation promptly;
- Providing transaction signatures and billing records to payers on
  request.

## Caching

Responses to subscription challenges (402 Payment Required) MUST
include `Cache-Control: no-store` to prevent sensitive payment data
from being cached by intermediaries.

Responses containing `Payment-Receipt` headers MUST include
`Cache-Control: private` to prevent shared caches from storing
payment receipts.

## Destination Scoping

Solana subscription delegations MUST be bound to the `recipient` (and
any additional destinations) named by the on-chain `Plan`. Servers
MUST reject credentials whose activation transaction routes value to
any other recipient.

## Plan Scope Minimization

Subscription `Plan` accounts SHOULD use the narrowest destination set
needed to fulfill the recurring charge. Implementations SHOULD avoid
publishing a plan with more destinations than necessary, since the
on-chain split applies to every pull.

## Subscription Authority Isolation

The `SubscriptionAuthority` is shared across every subscription the
same payer holds for the same mint. Closing the authority
invalidates every delegation created against it, terminating all
subscriptions tied to that authority simultaneously.

Servers MUST NOT rely on long-term existence of a particular
authority instance beyond the lifetime of their own delegations.
Applications SHOULD expose authority closure only as an explicit
"revoke all subscriptions for this token" affordance, never as a side
effect of routine operations.

## Token-2022 Extension Policy {#token-extension-policy}

Implementations MUST enforce a closed allow-list of permitted
Token-2022 extensions at activation and re-validate it on every
token-touching instruction. Extension presence alone is disqualifying;
unlisted, unknown, or malformed extensions MUST be rejected before
any token movement.

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
| `NonTransferable` | No transfer from the subscriber ATA can succeed |
| `PermanentDelegate` | Delegate can move funds outside the per-period limit |
| `DefaultAccountState` | Destination ATAs may be born non-`Initialized` |
| `ConfidentialTransferMint` | Subscriptions program does not produce confidential-transfer proofs |
| `TransferFeeConfig` | Withheld fees desync the on-chain accounting from settled amounts |
| `TransferHook` | Hook program can revert any transfer |
| `InterestBearing` | Visible amount changes over time |
| `ScaledUiAmountConfig` | Display-vs-raw divergence breaks exact accounting |
| `Pausable` | Mint-level pause can block scheduled pulls |
| `MintCloseAuthority` | Mint identity can be recreated while delegations reference it |

Implementations MUST NOT resolve transfer-hook extra accounts, route
through fee withholding, or honor pause flags.

## Account Ownership and Program-ID Validation

Before deserializing or mutating any account, implementations MUST
validate the expected program owner for:

- the `Plan`, `SubscriptionDelegation`, and `SubscriptionAuthority`
  PDAs (owned by the subscriptions program);
- the subscriber and destination token accounts (owned by
  `methodDetails.tokenProgram`);
- the mint (owned by `methodDetails.tokenProgram`).

Implementations MUST NOT allow user-controlled program accounts to
influence the activation, transfer, or revocation paths.

# IANA Considerations

## Payment Intent Registration

The `subscription` payment intent is registered by
{{I-D.payment-intent-subscription}}. This document does not register
it again.

--- back

# Acknowledgements

The authors thank the MPP community and the Tempo team for their
feedback on this specification, and the Solana Foundation
subscriptions program team for the on-chain primitives this profile
builds on.
