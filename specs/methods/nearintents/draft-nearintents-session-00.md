---
title: "NEAR Intents Session Intent for HTTP Payment Authentication"
abbrev: "NEAR Intents Session"
docname: draft-nearintents-session-00
version: 00
category: info
ipr: noModificationTrust200902
submissiontype: independent
consensus: false

author:
  - name: Iker Alustiza
    ins: I. Alustiza
    email: "iker.alustiza@nearone.org"
    org: Near One

normative:
  RFC2119:
  RFC3339:
  RFC4648:
  RFC8174:
  RFC8259:
  RFC8785:
  RFC9110:
  RFC9111:
  RFC9457:
  CAIP-2:
    title: "CAIP-2: Blockchain ID Specification"
    target: https://chainagnostic.org/CAIPs/caip-2
    author:
      - org: Chain Agnostic Standards Alliance
    date: 2020
  CAIP-10:
    title: "CAIP-10: Account ID Specification"
    target: https://chainagnostic.org/CAIPs/caip-10
    author:
      - org: Chain Agnostic Standards Alliance
    date: 2020
  CAIP-19:
    title: "CAIP-19: Asset Type and Asset ID Specification"
    target: https://chainagnostic.org/CAIPs/caip-19
    author:
      - org: Chain Agnostic Standards Alliance
    date: 2021
  NEP-413:
    title: "NEP-413: Near Wallet API - support for signMessage method"
    target: https://github.com/near/NEPs/blob/master/neps/nep-0413.md
    author:
      - name: Philip Obosi
      - name: Guillermo Gallardo
    date: 2022
  BORSH:
    title: "Borsh: Binary Object Representation Serializer for Hashing"
    target: https://borsh.io
    author:
      - org: NEAR Protocol
  I-D.httpauth-payment:
    title: "The 'Payment' HTTP Authentication Scheme"
    target: https://datatracker.ietf.org/doc/draft-ryan-httpauth-payment/
    author:
      - name: Brendan Ryan
      - name: Jake Moxey
    date: 2026-01
  I-D.payment-intent-session:
    title: "Session Intent for HTTP Payment Authentication"
    target: https://paymentauth.org/draft-payment-intent-session-00.html
    author:
      - name: Brendan Ryan
      - name: Jake Moxey
      - name: Tom Meagher
    date: 2026-06
  I-D.nearintents-charge:
    title: "NEAR Intents Charge Intent for HTTP Payment Authentication"
    target: https://paymentauth.org/draft-nearintents-charge-01.html
    author:
      - name: Iker Alustiza
    date: 2026

informative:
  DID-PKH:
    title: "did:pkh Method Specification"
    target: https://github.com/w3c-ccg/did-pkh
    author:
      - org: W3C CCG
  ONECLICK-API:
    title: "NEAR Intents 1Click Swap API"
    target: https://docs.near-intents.org/integration/distribution-channels/1click-api/about-1click-api
    author:
      - org: NEAR Intents
  NEAR-INTENTS-CHAINS:
    title: "NEAR Intents Supported Chains"
    target: https://docs.near-intents.org/resources/chain-support
    author:
      - org: NEAR Intents
  NEAR-INTENTS-VERIFIER:
    title: "NEAR Intents Verifier Contract"
    target: https://github.com/near/intents/tree/main/contracts/defuse
    author:
      - org: NEAR Intents
  NEAR-ACCOUNT-ID:
    title: "NEAR Protocol Account IDs"
    target: https://docs.near.org/protocol/accounts-contracts/account-id
    author:
      - org: NEAR Protocol
  SSE:
    title: "Server-Sent Events"
    target: https://html.spec.whatwg.org/multipage/server-sent-events.html
    author:
      - org: WHATWG
    date: 2024
  draft-lightning-session-00:
    title: "Lightning Network Session Intent for HTTP Payment Authentication"
    target: https://paymentauth.org/draft-lightning-session-00.html
    author:
      - org: Lightspark
    date: 2026
  draft-tempo-session-00:
    title: "Tempo Session Intent for HTTP Payment Authentication"
    target: https://paymentauth.org/draft-tempo-session-00.html
    author:
      - org: Tempo Labs
    date: 2026
  draft-solana-session-00:
    title: "Solana Session Intent for HTTP Payment Authentication"
    target: https://paymentauth.org/draft-solana-session-00.html
    author:
      - org: Solana Foundation
    date: 2026
---

--- abstract

This document defines the "session" intent for the "nearintents" payment
method in the Payment HTTP Authentication Scheme
{{I-D.httpauth-payment}}. It specifies a prepaid session model for
incremental, metered payments, suitable for streaming services where the
per-request cost is unknown upfront. A client first requests a funding
quote that is bound to its per-session key and to its refund
addresses, then funds the session with a cross-chain swap through the
NEAR Intents 1Click Swap API {{ONECLICK-API}} from any supported
origin chain; the funds are credited to the merchant's account in the
NEAR Intents Verifier. The client then authorizes metered service by
signing cumulative vouchers with that key, so no chain transaction and
no swap is needed per request. When the session closes, the merchant
refunds the unspent balance to the destination the payer named.

--- middle

# Introduction

HTTP Payment Authentication {{I-D.httpauth-payment}} defines a
challenge-response mechanism that gates access to HTTP resources behind
payments. This document defines the "nearintents" payment method
implementation of the "session" intent registered by
{{I-D.payment-intent-session}}.

The "charge" intent for this method {{I-D.nearintents-charge}} settles
one cross-chain swap per request. A session instead funds a prepaid
balance once: the client generates a session key and obtains a funding
quote bound to it, deposits on any supported origin chain
{{NEAR-INTENTS-CHAINS}}, the NEAR Intents solver network swaps the
deposit into the merchant's balance in the NEAR Intents Verifier, and
the server meters many units of service against that balance. The
client authorizes consumption by signing cumulative vouchers with the
session key. The server verifies each voucher locally, without
contacting the 1Click Swap API {{ONECLICK-API}} or any chain. A future
revision MAY define an additional funding path for clients that hold
balances in the Verifier; such a credential is out of scope for this
document.

The custody model is merchant-prepaid, as in
{{draft-lightning-session-00}}: the merchant holds the unspent balance
and refunds it on close. The proof mechanism is the cumulative voucher
of {{draft-tempo-session-00}} and {{draft-solana-session-00}}, so that
the wire format can later be reused under custody models in which the
balance is held by attested code or by a contract rather than by the
merchant. The challenge discloses the custody model through
`methodDetails.custody` (see {{custody}}).

## Use Case: LLM Token Streaming

The typical session flow proceeds as follows:

1. Client requests a streaming completion (SSE response)
2. Server returns 402 with an unquoted session challenge: the
   merchant's terms and funding limits, and no quote
3. Client generates a session key and sends a `quote` action that
   names the key, its refund destinations, the asset it will deposit,
   and the value to fund
4. Server mints a 1Click funding quote and returns 402 with a payable
   challenge bound to that key
5. Client verifies the challenge, pays the quote on the origin chain,
   and opens the session with the deposit hash and a first voucher
6. Server verifies the deposit, drives the swap to completion, creates
   the session, and begins streaming; it deducts the cost of each unit
   from the authorized value
7. If the authorized value is exhausted mid-stream, the server emits a
   `payment-need-voucher` SSE event and pauses; the client signs a
   higher voucher, or tops up the session with a new quote and deposit
   when the funded value is exhausted, and the server resumes
8. Client closes the session; the server refunds the unspent balance to
   the refund destination fixed in the payable challenge

## Session Flow

~~~
Client                 Server            Origin Chain    1Click / Verifier
  |                       |                    |                  |
  | (1) GET /generate     |                    |                  |
  |---------------------->|                    |                  |
  | (2) 402 unquoted      |                    |                  |
  |     challenge         |                    |                  |
  |<----------------------|                    |                  |
  | (3) GET /generate     |                    |                  |
  |     action="quote"    |                    |                  |
  |     sessionKey,       |                    |                  |
  |     refund, asset,    |                    |                  |
  |     amountOut         |                    |                  |
  |---------------------->| (4) EXACT_OUTPUT quote into merchant  |
  |                       |     Intents account, refund address   |
  |                       |     from the client                   |
  |                       |-------------------------------------->|
  | (5) 402 payable       |                    |                  |
  |     challenge bound   |                    |                  |
  |     to sessionKey     |                    |                  |
  |<----------------------|                    |                  |
  | (6) Deposit to funding.depositAddress      |                  |
  |------------------------------------------->|                  |
  | (7) GET /generate     |                    |                  |
  |     action="open"     |                    |                  |
  |     hash, first       |                    |                  |
  |     voucher           |                    |                  |
  |---------------------->| (8) verify signatures and deposit;    |
  |                       |     poll swap to SUCCESS              |
  |                       |-------------------------------------->|
  |                       |     amountOut credited to recipient   |
  |                       |<--------------------------------------|
  | (9) 200 OK + receipt  |                    |                  |
  |     (streaming)       |                    |                  |
  |<----------------------|                    |                  |
  | (10) GET /generate    |                    |                  |
  |      action="voucher" | (local signature   |                  |
  |---------------------->|  check only)       |                  |
  | (11) 200 OK + receipt |                    |                  |
  |<----------------------|                    |                  |
  |         ...           |                    |                  |
  | (12) action="close"   |                    |                  |
  |---------------------->| (13) Intents transfer of unspent      |
  |                       |      balance to refund destination    |
  |                       |-------------------------------------->|
  | (14) 200 closed       |                    |                  |
  |      + final receipt  |                    |                  |
  |<----------------------|                    |                  |
~~~

Steps 10 and 11 repeat for every metered request. They involve no chain
transaction and no 1Click call. Step 2 involves no 1Click call either:
a quote is minted only for a `quote` action.

## Relationship to the Charge Intent {#charge-relationship}

This document reuses the following parts of {{I-D.nearintents-charge}}
without restating them: the CAIP-19 asset identifier rules, the
semantics of the deposit fields of a 1Click quote, the deposit
verification and settlement procedures, the single-use rules for
deposit transaction hashes, and the `settlement-failed` problem type,
each with the differences stated in {{verification}}. Where
this document says that a step is performed "as defined by
{{I-D.nearintents-charge}}", the deposit fields are read from the
funding object ({{funding-object}}) of the echoed challenge instead of
from a charge request. Unlike a charge, a funding quote always takes
its origin refund address from the payer ({{quote-action}}).

## Mapping to the Session Intent {#intent-mapping}

The actions defined in this document map to the abstract lifecycle
operations of {{I-D.payment-intent-session}} as follows:

| Abstract Operation | Action | Proof |
|--------------------|------------------------|-------|
| Open | `open` | Deposit transaction hash, session-key signature, first voucher |
| Use | `voucher` | Cumulative voucher signed by the session key |
| Top-Up | `topUp` | Deposit transaction hash, session-key signature |
| Close | `close` | Session-key signature |

The `quote` action ({{quote-action}}) precedes Open and Top-Up. It
requests the payable challenge that the deposit is made against and is
not a proof.

The shared concepts of {{I-D.payment-intent-session}} map as follows:

| Concept | This Method |
|---------|-------------|
| Session | A record in the server's store, backed by funds in the merchant's Intents account |
| `reference` | Identifier derived from the opening deposit address ({{reference}}) |
| `amount` | Price per metered unit of the requested resource, in base units of `currency` |
| `currency` | CAIP-19 identifier of the balance asset held in the Verifier |
| `recipient` | The merchant's Intents account identifier |
| Authorized value | `authorized`: the cumulative amount of the highest accepted voucher |
| Spent value | `spent`: value debited for units committed to responses ({{streaming}}) |
| Remaining value | `authorized - spent` |
| Top-up | A funding quote bound to the same `reference` |
| Close | Refund of `funded - spent` to the refund destination; the session becomes terminal |
| `settlementRef` | Reference of the refund transfer at close |

# Requirements Language

{::boilerplate bcp14-tagged}

# Terminology

The terms 1Click Swap API, Deposit Address, Solver Network,
EXACT_OUTPUT, Origin Chain, Settlement Finality, and Base Units are
defined in {{I-D.nearintents-charge}} and apply to this document.

Verifier
: The NEAR Intents settlement contract {{NEAR-INTENTS-VERIFIER}}
  (`intents.near`) that holds the ledger of asset balances used by this
  method.

Intents Account
: An account identifier in the Verifier ledger. Balances held under an
  Intents account are Verifier ledger balances, not balances of a
  token contract on the NEAR chain.

Verifier Token Identifier
: The identifier under which the Verifier holds an asset. For a
  `currency` of the form `near:mainnet/nep141:<contract>`, the
  Verifier token identifier is `nep141:<contract>`.

Implicit Account
: The Intents account whose identifier is the lowercase hexadecimal
  encoding of a 32-byte Ed25519 public key {{NEAR-ACCOUNT-ID}}. The
  holder of the corresponding private key controls it.

Session
: A prepaid payment relationship between a client and a server,
  identified by the `reference` derived from the opening deposit
  address.

Session Key
: An Ed25519 key pair generated by the client for one session. Its
  public key is bound to the payable challenge that funds the session
  and to the session itself; its private key signs the `open` and
  every later action.

Voucher
: A session-key signature over a cumulative amount for a session.
  Vouchers are monotonically increasing in amount.

Funding Object
: The `methodDetails.funding` object of a payable challenge,
  describing one 1Click quote that credits `currency` to the
  merchant's Intents account.

Unquoted Challenge
: A session challenge without a funding object. It states the
  merchant's terms and funding limits and cannot be paid.

Payable Challenge
: A session challenge that carries a funding object and is bound to
  one session key, to open a session, or to one existing session, to
  top it up. It is issued only in response to a `quote` action.

Opening Challenge
: The payable challenge whose funding quote opened a session.

Funded Value
: `funded`: the sum of the funding `amountOut` of every open and top-up
  swap that reached `SUCCESS` for the session.

Final Charge
: The value the merchant keeps when the session closes.

Refund
: `funded` minus the final charge, returned to the payer at close.

# Intent Identifier

The intent identifier for this specification is "session". It MUST be
lowercase.

# Encoding Conventions {#encoding}

All JSON {{RFC8259}} objects carried in auth-params or HTTP headers in
this specification MUST be serialized using the JSON Canonicalization
Scheme (JCS) {{RFC8785}} before encoding. The resulting bytes MUST then
be encoded using base64url {{RFC4648}} Section 5 without padding
characters (`=`). Implementations MUST NOT append `=` padding when
encoding, and MUST accept input with or without padding when decoding.

This encoding convention applies to: the `request` auth-param in
`WWW-Authenticate`, the credential token, and the receipt token in
`Payment-Receipt`.

## Identifiers {#identifier-formats}

Origin chains are identified by CAIP-2 {{CAIP-2}} identifiers. Assets
are identified by CAIP-19 {{CAIP-19}} identifiers and compared as
defined in {{I-D.nearintents-charge}}. The session `reference` is
derived from the CAIP-10 {{CAIP-10}} identifier of the opening deposit
address ({{reference}}).

Intents accounts are NEAR account identifiers {{NEAR-ACCOUNT-ID}} and
are compared as exact strings.

## Amounts

All amounts are integers in base units of the relevant asset, encoded
as decimal strings matching `^(0|[1-9][0-9]*)$`. Implementations MUST
compare and accumulate amounts as exact integers.

## Keys and Signatures

A session public key is encoded as the string `ed25519:` followed by
the base58 encoding of the 32 raw key bytes. A signature is encoded as
the string `ed25519:` followed by the base58 encoding of the 64 raw
signature bytes. Base58 uses the Bitcoin alphabet. These encodings
match the key and signature formats used by NEAR {{NEP-413}}.

The implicit account of a session key is the lowercase hexadecimal
encoding of its 32 raw key bytes, without a prefix. Servers compare
session keys by these 32 bytes.

# Session Lifecycle

A session progresses through three phases, each corresponding to one
or more credential actions:

1. **Open**: The client generates a session key, obtains a payable
   challenge bound to it with a `quote` action, pays the funding quote
   on the origin chain, and submits an `open` action carrying the
   deposit transaction hash and a first voucher. The server verifies
   the deposit, drives the swap to completion, stores the session, and
   serves the request against the first voucher.
2. **Metered use**: The client submits `voucher` actions whose
   cumulative amount grows as service is consumed. No chain transaction
   and no 1Click call is involved. When the funded value is exhausted,
   the client obtains a payable challenge bound to the session with
   another `quote` action, pays it, and submits a `topUp` action, which
   raises the funded value of the same session.
3. **Closed**: The client submits a `close` action, or the server
   closes the session after the idle timeout. The server stops
   delivery, refunds the unspent balance, and marks the session closed.
   No further paid service is delivered.

A session has status `open`, `closing`, or `closed`. The `closing`
status covers the interval between the decision to close and the
completion of the close procedure. A session in `closing` or `closed`
status is terminal: servers MUST reject `voucher` actions against it
and MUST NOT deliver paid service for it. A top-up deposit that
settles for a terminal session cannot be spent and is refunded in
full ({{late-refunds}}).

Every session has an idle timeout, advertised in the challenge as
`methodDetails.idleTimeout`. When a server closes a session without a
client `close` action, it MUST follow the refund procedure of
{{refunds}} exactly as for a client-initiated close (see
{{server-initiated-close}}).

# Challenge Request {#challenge}

When a request arrives without a valid credential, the server MUST
respond with HTTP 402 {{RFC9110}}, a `Cache-Control: no-store`
{{RFC9111}} header, and a `WWW-Authenticate: Payment` header of the
form:

~~~
WWW-Authenticate: Payment id="<challenge-id>",
  realm="<realm>",
  method="nearintents",
  intent="session",
  request="<base64url(JCS-serialized JSON)>",
  expires="<RFC3339 timestamp>"
~~~

This document defines version 2 of the session challenge of this
method ({{version}}). A session challenge has one of two forms:

- An **unquoted challenge** has no funding object. It states the
  merchant's terms and funding limits. Servers return it to requests
  without a credential and with every rejection. Issuing it involves
  no call to the 1Click Swap API.
- A **payable challenge** carries the funding object of one 1Click
  quote ({{funding-object}}) and is bound either to one session key,
  to open a session, or to one existing session, to top it up. Servers
  issue it only in response to a `quote` action ({{quote-action}}).

## Shared Fields

The `request` object carries the shared fields of
{{I-D.payment-intent-session}}:

| Field | Type | Presence | Description |
|-------|------|----------|-------------|
| `amount` | string | REQUIRED | Price per metered unit of the resource the challenge was issued for, in base units of `currency`. For streaming responses, the cost per emitted unit. MUST be a positive integer. |
| `currency` | string | REQUIRED | CAIP-19 {{CAIP-19}} identifier of the balance asset, of the form `near:mainnet/nep141:<contract>`. The asset is held in the Verifier under its Verifier token identifier. Other Verifier token standards are out of scope for this document. |
| `recipient` | string | REQUIRED | The merchant's Intents account identifier in the Verifier named by `methodDetails.verifier`. |
| `unitType` | string | OPTIONAL | Human-readable label for the metered unit (e.g., `"token"`, `"request"`). Informational only. |
| `description` | string | OPTIONAL | Human-readable description of the service. MUST NOT be relied upon for verification per {{I-D.httpauth-payment}}. |
| `externalId` | string | OPTIONAL | Merchant reference. |

A payable challenge repeats the shared fields of the unquoted
challenge that its `quote` action echoed. The `currency` and the
`recipient` of a session are fixed by its opening challenge for the
life of the session. The unit price is not: every paid request is
priced by the `amount` that the server currently advertises for the
requested resource ({{echoed-challenge}}), so one session pays for any
resource of the realm that shares its `currency` and `recipient`.
The merchant selects one NEAR-side token as `currency`, for example the
native issuance of a stablecoin or one bridged copy of it; every funding
quote, from any origin chain or asset, is swapped into that token.

## Method Details

| Field | Type | Presence | Description |
|-------|------|----------|-------------|
| `methodDetails.version` | integer | REQUIRED | `2` (see {{version}}). |
| `methodDetails.verifier` | string | REQUIRED | Account identifier of the Verifier contract that holds the balances. This document defines the value `"intents.near"`. |
| `methodDetails.custody` | string | REQUIRED | Custody model for unspent funds (see {{custody}}). This document defines the value `"merchant"`. |
| `methodDetails.settlementBackend` | string | OPTIONAL | Discloses the settlement backend. Value `"near-intents"` for this method. |
| `methodDetails.minDeposit` | string | REQUIRED | Smallest value a `quote` action may ask to fund, in base units of `currency` (see {{deposit-amount}}). MUST be at least `amount`. |
| `methodDetails.maxFunded` | string | OPTIONAL | Largest funded value one session may hold, in base units of `currency`. |
| `methodDetails.idleTimeout` | integer | REQUIRED | Idle timeout in seconds. The server closes the session after this long without session activity (see {{server-initiated-close}}). |
| `methodDetails.maxSessionLifetime` | integer | OPTIONAL | Maximum session lifetime in seconds, measured from the creation of the session. When present, the server closes the session once it has elapsed, whatever the session's activity (see {{server-initiated-close}}). |
| `methodDetails.minVoucherDelta` | string | REQUIRED | Smallest allowed increase between accepted vouchers, in base units of `currency`. MUST be at least `"1"`. |
| `methodDetails.refundTypes` | array | REQUIRED | Refund destination types the server supports (see {{refund-destination}}). MUST contain `"intents"`; MAY contain `"origin"`. |
| `methodDetails.minOriginRefund` | string | CONDITIONAL | REQUIRED when `refundTypes` contains `"origin"`. Refunds below this amount, in base units of `currency`, fall back to an `intents` refund (see {{origin-refunds}}). |
| `methodDetails.funding` | object | CONDITIONAL | Funding object (see {{funding-object}}). REQUIRED in a payable challenge; MUST be absent from an unquoted challenge. |
| `methodDetails.sessionKey` | string | CONDITIONAL | Session public key the challenge is bound to (see {{encoding}}). REQUIRED in a payable challenge that opens a session; absent otherwise. |
| `methodDetails.refund` | object | CONDITIONAL | Refund destination of the session (see {{refund-destination}}). REQUIRED together with `sessionKey`; absent otherwise. |
| `methodDetails.reference` | string | CONDITIONAL | Reference of the session the challenge tops up. REQUIRED in a payable challenge issued for a top-up; absent otherwise. |

A payable challenge carries `funding` and exactly one binding: either
`sessionKey` with `refund`, or `reference`. An unquoted challenge
carries none of these four fields. The binding is part of the
`request` and therefore covered by the challenge `id` per
{{I-D.httpauth-payment}}.

Clients MUST NOT deposit against a challenge whose
`methodDetails.version`, `methodDetails.custody`, or
`methodDetails.verifier` value they do not recognize.

## Version {#version}

The `methodDetails.version` value `2` identifies the challenge and
credential formats of this document. An earlier text of this draft
defined a single-step flow whose challenges had no `version` field and
carried a funding object in every challenge. That flow is withdrawn: a
copy of such a challenge was sufficient to claim the deposit made
against it ({{deposit-claims}}). Servers MUST NOT issue a session
challenge of this method without `version` `2`, and clients MUST NOT
deposit against one.

## Funding Object {#funding-object}

The funding object carries the deposit fields of one 1Click quote. The
fields have the meaning of the corresponding charge request fields of
{{I-D.nearintents-charge}}, listed in the last column.

| Field | Type | Presence | Description | Charge equivalent |
|-------|------|----------|-------------|-------------------|
| `originNetwork` | string | REQUIRED | CAIP-2 {{CAIP-2}} identifier of the origin chain. | `methodDetails.originNetwork` |
| `asset` | string | REQUIRED | CAIP-19 {{CAIP-19}} identifier of the asset the client deposits. Its chain component MUST equal `originNetwork`. | `currency` |
| `depositAddress` | string | REQUIRED | Single-use 1Click deposit address on the origin chain. | `recipient` |
| `amount` | string | REQUIRED | Deposit amount the client is asked to send, in base units of `asset` (the quote `amountIn`); see {{deposit-amount}}. | `amount` |
| `minAmountIn` | string | REQUIRED | Minimum deposit the backend accepts, in base units of `asset`. | `methodDetails.minAmountIn` |
| `amountOut` | string | REQUIRED | Exact amount of `currency` credited to `recipient` on `SUCCESS`, in base units of `currency`, whose decimals may differ from those of `asset`. Added to `funded`. | `methodDetails.amountOut` |
| `depositMemo` | string \| null | OPTIONAL | Deposit memo required by some origin chains. Absent or `null` when not required. | `methodDetails.depositMemo` |
| `slippageTolerance` | number | OPTIONAL | Slippage tolerance in basis points. | `methodDetails.slippageTolerance` |
| `timeEstimate` | number | OPTIONAL | Estimated swap completion time in seconds. | `methodDetails.timeEstimate` |
| `deadline` | string | REQUIRED | {{RFC3339}} time until which the 1Click backend executes a deposit to this quote (see {{expiry}}). A deposit that arrives later is refunded to `refundTo` instead of being swapped. | Challenge `expires` |
| `refundTo` | string | REQUIRED | Origin-chain address that receives the deposit if the swap fails, any excess, and an unclaimed deposit ({{unclaimed}}). Copied from the `quote` action. | `methodDetails.refundTo` |

The server obtains the funding object from an executable 1Click quote
{{ONECLICK-API}} requested with: `dry` set to false, swap type
`EXACT_OUTPUT`, amount the `amountOut` of the `quote` action, origin
asset the 1Click identifier of the `quote` action's `asset`,
destination asset the Verifier token identifier of `currency`,
recipient `recipient` with recipient type `INTENTS`, deposit type
`ORIGIN_CHAIN`, refund address the `quote` action's `refundTo` with
refund type `ORIGIN_CHAIN`, the slippage tolerance of the `quote`
action when it names one, and a deadline no earlier than
`funding.deadline`. The funding object's `asset`, `refundTo`, and
`amountOut` MUST equal the values of the `quote` action.

## Challenge Expiry and Reuse {#expiry}

A payable challenge has two times. `funding.deadline` limits when the
deposit may be made: it MUST be the 1Click quote deadline, or slightly
earlier, and clients MUST NOT broadcast a deposit transaction after
it. Servers SHOULD choose it such that the time left accommodates
origin-chain confirmation plus `funding.timeEstimate`. The `expires`
auth-param limits when the deposit may be claimed: it MUST be no
earlier than 24 hours after `funding.deadline`. The interval between
the two is the claim window ({{unclaimed}}). A payable challenge is
thus unexpired for as long as a credential can be presented for it,
unlike a charge challenge, whose `expires` is the quote deadline.

A payable challenge is consumed by exactly one settled `open` or
`topUp`, or by the return of its deposit ({{unclaimed}}). Servers MUST
NOT issue the same deposit address and memo in two payable challenges.

The `expires` of an unquoted challenge is chosen by the server; no
quote constrains it. An unquoted challenge is not consumed, and a
client MAY echo the same unexpired one in any number of the
credentials that {{echoed-challenge}} allows it for. A client MAY keep
one from an earlier exchange in order to send a `quote` action without
a preceding unauthenticated request.

Session challenges of this method MUST NOT carry the `digest`
parameter of {{I-D.httpauth-payment}}: the credentials of a session
are bound to the session, not to one request body, and control
requests are sent without the body of a resource request.

## Examples

Decoded `request` of an unquoted challenge:

~~~json
{
  "amount": "10",
  "currency": "near:mainnet/nep141:17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1",
  "recipient": "merchant.near",
  "unitType": "token",
  "description": "Streaming inference",
  "methodDetails": {
    "version": 2,
    "verifier": "intents.near",
    "custody": "merchant",
    "settlementBackend": "near-intents",
    "minDeposit": "1000000",
    "maxFunded": "100000000",
    "idleTimeout": 900,
    "minVoucherDelta": "1000",
    "refundTypes": ["intents", "origin"],
    "minOriginRefund": "1000000"
  }
}
~~~

This prices each token at 10 base units of USDC (0.00001 USDC). A
session is funded with at least 1 USDC and holds at most 100 USDC.
Each voucher step is at least 1,000 base units, or 100 tokens.

Decoded `request` of the payable challenge returned to a `quote`
action that asked to fund 5,000,000 base units from USDC on Arbitrum
({{quote-action}}):

~~~json
{
  "amount": "10",
  "currency": "near:mainnet/nep141:17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1",
  "recipient": "merchant.near",
  "unitType": "token",
  "description": "Streaming inference",
  "methodDetails": {
    "version": 2,
    "verifier": "intents.near",
    "custody": "merchant",
    "settlementBackend": "near-intents",
    "minDeposit": "1000000",
    "maxFunded": "100000000",
    "idleTimeout": 900,
    "minVoucherDelta": "1000",
    "refundTypes": ["intents", "origin"],
    "minOriginRefund": "1000000",
    "funding": {
      "originNetwork": "eip155:42161",
      "asset": "eip155:42161/erc20:0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
      "depositAddress": "0x76b4c56085ED136a8744D52bE956396624a730E8",
      "amount": "5025000",
      "minAmountIn": "5010000",
      "amountOut": "5000000",
      "depositMemo": null,
      "slippageTolerance": 100,
      "timeEstimate": 60,
      "deadline": "2026-11-20T15:10:00Z",
      "refundTo": "0x2527D02599Ba641c19Fea793Cd0f9A6e8457c317"
    },
    "sessionKey": "ed25519:FPMiwPws7RmVuqaAqqEwYNaVxf379PBvfmcqMisGbRai",
    "refund": {
      "type": "intents",
      "account": "d5bdd38fe760603eaac6821bdc961e296708d2804911c663ea2c79ea581799c3"
    }
  }
}
~~~

A deposit of about 5.025 USDC on Arbitrum funds the session with
5.000000 USDC, enough for 500,000 tokens at this price. The deposit
has to be broadcast by 15:10; the challenge itself expires 24 hours
later. Only the holder of the named session key can open it. The
resulting session `reference` is
`eip155:42161:0x76b4c56085ED136a8744D52bE956396624a730E8`.

# Credential Schema {#credential}

## Structure

The credential is a single base64url-encoded JSON token (no
auth-params), carried in the header field that the challenge selects
per {{I-D.httpauth-payment}}, which is `Authorization` unless the
challenge names another. The decoded object contains three top-level
fields:

| Field | Type | Presence | Description |
|-------|------|----------|-------------|
| `challenge` | object | REQUIRED | Echo of the challenge auth-params from a `WWW-Authenticate: Payment` header. Which challenge is echoed depends on the action (see {{echoed-challenge}}). |
| `payload` | object | REQUIRED | Session action payload. The `action` field discriminates the type; action-specific fields are placed alongside it. |
| `source` | string | OPTIONAL | Payer DID. If present, SHOULD use the `did:pkh` method {{DID-PKH}} with the CAIP-2 origin network identifier and the payer's origin-chain address (e.g., `did:pkh:eip155:42161:0x2527...`). Informational only; servers MUST NOT require it and MUST NOT rely on it for verification. |

`payload.action` is REQUIRED and MUST be one of `"quote"`, `"open"`,
`"voucher"`, `"topUp"`, or `"close"`. Implementations MUST ignore
unknown fields in request objects, credential payloads, and receipts.

## Echoed Challenge {#echoed-challenge}

| Action | Echoed challenge |
|--------|------------------|
| `quote` | The unquoted challenge of the requested resource |
| `open` | The payable challenge whose funding quote was paid |
| `topUp` | The payable challenge issued for the session, whose funding quote was paid |
| `voucher` | A challenge of the requested resource |
| `close` | Any session challenge of the realm |

The challenge echoed by any action MUST be unexpired, MUST have been
issued by this server for this method and intent, and MUST carry
`methodDetails.version` `2`.

A `voucher` credential echoes a challenge that the server issued for
the resource it requests, unquoted or payable. That challenge states
the unit price of the request: its `amount`, `currency`, and
`recipient` MUST equal those the server currently advertises for the
resource, and its `currency` and `recipient` MUST equal the session's
({{voucher-verification}}). A client learns the current challenge of a
resource from any 402 response for it; a price change shows as a
rejection that carries the new challenge.

A `close` credential echoes any session challenge of the realm whose
`currency` and `recipient` equal the session's.

A `voucher` or `close` credential is bound to its session by the
signed message of {{signing}}, which carries the realm, the session
`reference`, and the `currency`, and names the merchant's Intents
account as its NEP-413 recipient. The signature does not cover the
echoed challenge. A client whose challenge has expired, or no longer
matches the resource, builds a new credential around a current
challenge, such as the one carried by the 402 response that reported
it, and does not need to sign again.

## Session Reference {#reference}

The session `reference` is the string formed from the opening
challenge's `funding.originNetwork`, the character `:`, and
`funding.depositAddress`, each taken byte for byte from the opening
challenge; this is the CAIP-10 {{CAIP-10}} account identifier of the
deposit address. When the opening challenge carries a non-null
`funding.depositMemo`, the memo is appended after a further `:`. The
result is an opaque identifier.

The client computes `reference` from the payable challenge before
opening, so it can sign the first voucher without a round trip.
Servers MUST compare `reference` values as exact strings.

## Quote Action {#quote-action}

The `quote` action asks the server for a payable challenge. It carries
what the server needs to mint the funding quote and what the challenge
is to be bound to. It is not signed and is not a proof: the binding it
requests is enforced when the deposit is claimed.

| Field | Type | Presence | Description |
|-------|------|----------|-------------|
| `action` | string | REQUIRED | `"quote"` |
| `sessionKey` | string | CONDITIONAL | Session public key of the session to open (see {{encoding}}). REQUIRED unless `reference` is present. |
| `refund` | object | CONDITIONAL | Refund destination of the session to open (see {{refund-destination}}). REQUIRED together with `sessionKey`. |
| `reference` | string | CONDITIONAL | Reference of the open session to top up. REQUIRED unless `sessionKey` is present. |
| `asset` | string | REQUIRED | CAIP-19 {{CAIP-19}} identifier of the asset the client will deposit. Its chain is the origin chain of the funding quote. |
| `refundTo` | string | REQUIRED | Address on the origin chain, controlled by the payer, that receives the deposit if the swap fails, any excess, and an unclaimed deposit ({{unclaimed}}). |
| `amountOut` | string | REQUIRED | Value to fund, in base units of `currency` (see {{deposit-amount}}). |
| `slippageTolerance` | number | OPTIONAL | Slippage tolerance in basis points for the funding quote. |

The payload MUST carry exactly one of `sessionKey` and `reference`.

A `quote` credential is sent on a request for a protected resource
and echoes the unquoted challenge of that resource. When it opens a
session, the `currency`, the `recipient`, and the method details of
that challenge become the terms of the session ({{session-state}}).

The server MUST NOT serve paid content in response to a `quote`
credential. After the checks of {{quote-verification}} it mints the
1Click quote and responds with HTTP 402, `Cache-Control: no-store`, a
payable challenge, and a problem body of the type
`payment-action-required` of {{I-D.httpauth-payment}}, which is
REQUIRED for this response. The `request` of the payable challenge
repeats the shared fields and method details of the echoed challenge
and adds the funding object and the binding:
`methodDetails.sessionKey` and `methodDetails.refund`, copied from the
payload, or `methodDetails.reference`. The response carries no
`Payment-Receipt`. A client recognises it by the funding object and
the binding of the returned challenge.

Every accepted `quote` action yields a new quote and a new payable
challenge. The action is not idempotent: a client that did not receive
the response sends another `quote` action, and MUST NOT deposit
against a challenge that it did not receive.

Before depositing, the client MUST verify the payable challenge as
required by {{amount-verification}}.

Example credential (decoded), echoing the unquoted challenge of
{{challenge}}:

~~~json
{
  "challenge": {
    "id": "uQ1nHs5KdP8wLr2XcVbTmA",
    "realm": "api.example.com",
    "method": "nearintents",
    "intent": "session",
    "request": "eyJ...",
    "expires": "2026-11-20T15:30:00Z"
  },
  "payload": {
    "action": "quote",
    "sessionKey": "ed25519:FPMiwPws7RmVuqaAqqEwYNaVxf379PBvfmcqMisGbRai",
    "refund": {
      "type": "intents",
      "account": "d5bdd38fe760603eaac6821bdc961e296708d2804911c663ea2c79ea581799c3"
    },
    "asset": "eip155:42161/erc20:0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
    "refundTo": "0x2527D02599Ba641c19Fea793Cd0f9A6e8457c317",
    "amountOut": "5000000",
    "slippageTolerance": 100
  },
  "source": "did:pkh:eip155:42161:0x2527D02599Ba641c19Fea793Cd0f9A6e8457c317"
}
~~~

## Open Action {#open-action}

The `open` action proves the funding deposit made against a payable
challenge and carries the first voucher. The session key and the
refund destination are those of the echoed challenge
(`methodDetails.sessionKey`, `methodDetails.refund`); the payload does
not repeat them.

| Field | Type | Presence | Description |
|-------|------|----------|-------------|
| `action` | string | REQUIRED | `"open"` |
| `hash` | string | REQUIRED | Transaction hash of the client's deposit to `funding.depositAddress` on `funding.originNetwork`. Format is origin-chain-native. |
| `signature` | string | REQUIRED | Signature over the open message (see {{signing}}) by the session key the echoed challenge is bound to. |
| `voucher` | object | REQUIRED | First voucher: `{"cumulative": <string>, "signature": <string>}`, signed over the voucher message for the session `reference` (see {{signing}}). `cumulative` MAY be `"0"`. |

An `open` credential is sent on a request for a protected resource.
When the request method is not `HEAD`, the server serves the request
against the first voucher after creating the session. When the request
method is `HEAD`, the server creates the session and returns a receipt
without content. After creating the session, the server treats the
request as that of a `voucher` credential that echoes the opening
challenge. If the first voucher does not cover the request, or the
unit price of the resource is no longer the `amount` of the opening
challenge, the session exists nonetheless and the server answers with
the corresponding rejection, whose problem body carries the
`reference`.

Clients SHOULD present the `open` credential as soon as they have
broadcast the deposit; a server that cannot yet see the deposit
answers as defined in {{pending}}. When `funding.timeEstimate` is
long, clients SHOULD open with a `HEAD` request and send the paid
request once the session exists, so that the first response is not
held for the duration of the settlement.

Example credential (decoded):

~~~json
{
  "challenge": {
    "id": "sQ7mT2vLx9KpR4nB8cWdYe",
    "realm": "api.example.com",
    "method": "nearintents",
    "intent": "session",
    "request": "eyJ...",
    "expires": "2026-11-21T15:10:00Z"
  },
  "payload": {
    "action": "open",
    "hash": "0x9bcff372aee89b648c922b850573b22387c31d693079f5e37cd255814e2d615a",
    "signature": "ed25519:39sY...8r",
    "voucher": {
      "cumulative": "1000",
      "signature": "ed25519:3NGD...cA"
    }
  },
  "source": "did:pkh:eip155:42161:0x2527D02599Ba641c19Fea793Cd0f9A6e8457c317"
}
~~~

## Voucher Action {#voucher-action}

The `voucher` action authorizes cumulative value for an open session
and authenticates a metered request.

| Field | Type | Presence | Description |
|-------|------|----------|-------------|
| `action` | string | REQUIRED | `"voucher"` |
| `reference` | string | REQUIRED | Session reference. |
| `cumulative` | string | REQUIRED | Cumulative authorized amount, in base units of `currency`. |
| `signature` | string | REQUIRED | Session-key signature over the voucher message (see {{signing}}). |

A `voucher` credential on any request method other than `HEAD` is a
paid request: the server serves it against `authorized - spent`. A
`voucher` credential on a `HEAD` request only updates the authorized
value: the server returns 200 with a receipt, no content, and no
charge.

Vouchers are cumulative totals, not increments. A voucher equal to the
highest accepted voucher is an idempotent no-op. A lower voucher is
rejected as stale. A higher voucher MUST advance by at least
`minVoucherDelta`, unless it equals `funded`, and MUST NOT exceed
`funded`.

Example credential (decoded):

~~~json
{
  "challenge": {
    "id": "sQ7mT2vLx9KpR4nB8cWdYe",
    "realm": "api.example.com",
    "method": "nearintents",
    "intent": "session",
    "request": "eyJ...",
    "expires": "2026-11-21T15:10:00Z"
  },
  "payload": {
    "action": "voucher",
    "reference": "eip155:42161:0x76b4c56085ED136a8744D52bE956396624a730E8",
    "cumulative": "25000",
    "signature": "ed25519:3Ybd...dW"
  }
}
~~~

## TopUp Action {#topup-action}

The `topUp` action proves a new funding deposit and adds its
`amountOut` to the funded value of an existing session.

| Field | Type | Presence | Description |
|-------|------|----------|-------------|
| `action` | string | REQUIRED | `"topUp"` |
| `reference` | string | REQUIRED | Session reference. |
| `hash` | string | REQUIRED | Transaction hash of the client's deposit to the echoed challenge's `funding.depositAddress`. |
| `signature` | string | REQUIRED | Session-key signature over the topUp message (see {{signing}}). |

To top up, the client sends a `quote` action that carries the session
`reference` ({{quote-action}}), verifies the payable challenge it
receives, and pays its funding quote. That challenge is bound to the
session by `methodDetails.reference`, which `payload.reference` MUST
equal. Its funding object MAY name a different origin chain or asset
than the opening challenge. Its `amount` plays no role.

Clients SHOULD submit the `topUp` credential as soon as they have
broadcast the deposit. Once the backend detects the deposit, the
server records it as pending while the swap settles, which defers an
idle close of the session ({{server-initiated-close}}).

A top-up takes as long as the origin chain and the swap require.
Clients SHOULD top up between requests, when a receipt shows that
`funded - spent` will not cover the next request, rather than during a
stream ({{streaming}}).

A `topUp` credential is a control request. It MAY be sent to any
protected resource URI in the realm. The server MUST NOT serve paid
content in response to it. Upon successful verification, the server
MUST atomically add `funding.amountOut` to `funded` and return HTTP
200 with body `{"status":"ok"}` and a receipt. A top-up raises
`funded`, not `authorized`; the client submits a higher voucher
afterwards. Any paused streams SHOULD resume once a sufficient voucher
is accepted.

Example credential (decoded):

~~~json
{
  "challenge": {
    "id": "tV3kLm9QxZ2pRwN7bYcHfA",
    "realm": "api.example.com",
    "method": "nearintents",
    "intent": "session",
    "request": "eyJ...",
    "expires": "2026-11-21T15:50:00Z"
  },
  "payload": {
    "action": "topUp",
    "reference": "eip155:42161:0x76b4c56085ED136a8744D52bE956396624a730E8",
    "hash": "0x4d1e8a7c3b2f9e6d5c4b3a2918f7e6d5c4b3a29187f6e5d4c3b2a1908f7e6d5c",
    "signature": "ed25519:3RxW...Yu"
  }
}
~~~

## Close Action {#close-action}

The `close` action terminates the session and triggers the refund of
the unspent balance.

| Field | Type | Presence | Description |
|-------|------|----------|-------------|
| `action` | string | REQUIRED | `"close"` |
| `reference` | string | REQUIRED | Session reference. |
| `signature` | string | REQUIRED | Session-key signature over the close message (see {{signing}}). |

A `close` credential is a control request. It MAY be sent to any
protected resource URI in the realm. The server MUST NOT serve paid
content in response to it. After verifying the signature and running
the close procedure of {{close-verification}}, the server returns HTTP
200 with a `Payment-Receipt` header (see {{receipt}}) and a body of
the form:

~~~json
{
  "status": "closed",
  "reference": "eip155:42161:0x76b4c56085ED136a8744D52bE956396624a730E8",
  "funded": "10000000",
  "spent": "6254870",
  "settlementRef": "7YkTGh2vN4qLm8RsE1dXfP5wZc9aJbKu3tHn6VgQ2eUo",
  "refund": {
    "type": "intents",
    "account": "d5bdd38fe760603eaac6821bdc961e296708d2804911c663ea2c79ea581799c3",
    "amount": "3745130",
    "status": "succeeded"
  }
}
~~~

`status` is the session status, `"closing"` or `"closed"`. The other
fields form the close result (see {{session-state}}). Closing is
idempotent: a `close` credential for a
session that is already `closing` or `closed` returns the current close
result without executing a second refund. While the session is
`closing`, the close result is provisional: `refund.status` is
`pending` and `settlementRef` is absent. Clients MAY re-send `close`
to observe a refund whose status was `pending` or a late refund
({{late-refunds}}).

Example credential (decoded):

~~~json
{
  "challenge": {
    "id": "vK8pTz3NwE6yBq1RhLsDfC",
    "realm": "api.example.com",
    "method": "nearintents",
    "intent": "session",
    "request": "eyJ...",
    "expires": "2026-11-20T16:15:00Z"
  },
  "payload": {
    "action": "close",
    "reference": "eip155:42161:0x76b4c56085ED136a8744D52bE956396624a730E8",
    "signature": "ed25519:5Eso...Ro"
  }
}
~~~

## Refund Destination {#refund-destination}

The `refund` object of a `quote` action selects where the unspent
balance is sent at close. The server copies it into the payable
challenge as `methodDetails.refund`, so that it is fixed before the
client deposits and is covered by the challenge binding. It cannot be
changed afterwards.

| Type | Fields | Meaning |
|--------|--------|---------|
| `"intents"` | `account` | Intents account identifier that receives the refund as a Verifier transfer. |
| `"origin"` | `asset`, `address` | Refund handed to the 1Click backend as a swap into the CAIP-19 asset `asset` for `address` on that asset's chain. Allowed only when `methodDetails.refundTypes` contains `"origin"`. By selecting this type the payer accepts the swap fees and slippage, and the fallback to an `intents` refund at the session key's implicit account defined in {{origin-refunds}}. |

There is no default: a `quote` action that opens a session names its
refund destination. A client that wants its refund held in the
Verifier under the session key names the implicit account of that key
as `account`.

# Signature Format {#signing}

Every `open`, `voucher`, `topUp`, and `close` action carries a
signature by the session key over an action-specific message. The
message is a JSON object serialized with JCS {{RFC8785}} and signed
with the NEP-413 {{NEP-413}} construction. Messages are never sent on
the wire: the server rebuilds each message from the credential, the
echoed challenge, and its stored session state, then verifies the
signature.

## Messages

Every message carries `domain` with the value
`"mpp-nearintents-session-v2"` and `realm` with the value of the
challenge `realm`. Any change to the message objects or to the signing
construction requires a new `domain` value. The `quote` action is not
signed.

| Action | Message object (keys in JCS order) |
|--------|-----------------------------------|
| `open` | `{"action":"open","challengeId":<echoed challenge id>,"domain":...,"hash":<payload.hash>,"realm":...,"refund":<methodDetails.refund of the echoed challenge>,"sessionKey":<methodDetails.sessionKey of the echoed challenge>}` |
| `voucher` (also the first voucher inside `open`) | `{"action":"voucher","cumulative":<cumulative>,"currency":<opening challenge currency>,"domain":...,"realm":...,"reference":<reference>}` |
| `topUp` | `{"action":"topUp","challengeId":<echoed challenge id>,"domain":...,"hash":<payload.hash>,"realm":...,"reference":<reference>}` |
| `close` | `{"action":"close","domain":...,"realm":...,"reference":<reference>}` |

For the first voucher inside `open`, `reference` is computed from the
echoed challenge as defined in {{reference}}. The open message repeats
the session key and the refund destination of the challenge, so that
the signature records the key holder's consent to both.

## NEP-413 Construction {#nep413}

Given a message object, the signature is computed as follows:

~~~
message   = JCS(message object)                  ; UTF-8 string
nonce     = SHA-256(UTF-8(message))              ; 32 bytes
recipient = request.recipient                    ; merchant Intents account
payload   = Payload { message, nonce, recipient, callbackUrl: None }
bytes     = u32_le(2147484061) || borsh(payload) ; 2147484061 = 2^31 + 413
digest    = SHA-256(bytes)
signature = Ed25519_sign(session private key, digest)
~~~

The Borsh {{BORSH}} serialization of `Payload` is: `message` as a u32
little-endian byte length followed by the UTF-8 bytes; `nonce` as 32
raw bytes; `recipient` as a u32 little-endian byte length followed by
the UTF-8 bytes; `callbackUrl` as an `Option<String>`, encoded as the
single byte `0x00` for `None`. The 4-byte prefix is the Borsh
serialization of the u32 value 2^31 + 413, as required by {{NEP-413}}.

The signature is encoded as defined in {{encoding}}. Verification
rebuilds `bytes` from the same inputs and verifies the Ed25519
signature over `digest` with the session public key.

The NEP-413 prefix guarantees that no signed message can be
interpreted as a NEAR transaction. A session message is not a Verifier
intent and cannot be submitted as one: its NEP-413 recipient is the
merchant's account rather than the Verifier, and its message object is
not an intent. A signing example is given in {{signing-example}}.

# Deposit Amount {#deposit-amount}

The client chooses the value to fund, `amountOut`, in its `quote`
action, within the limits the merchant advertises: it MUST be at least
`methodDetails.minDeposit`, and the funded value of the session after
crediting it MUST NOT exceed `methodDetails.maxFunded` when that field
is present. `minDeposit` MUST be at least `amount`, so that a deposit
covers one unit of service. Servers SHOULD set `minDeposit` such that
the fees of a funding quote stay below a documented share of the
deposit.

The quote then fixes the deposit: `funding.amount` is what the client
sends to fund `funding.amountOut`. Clients MUST compare both with
their own limits before paying ({{amount-verification}}). A deposit
below `funding.minAmountIn` does not settle, and what a larger deposit
leaves unused is returned to `funding.refundTo` by the backend.

The limits are checked when the quote is requested. Top-ups requested
at the same time can together exceed `maxFunded`; the limit bounds
what a merchant agrees to hold, not what a payer can lose.

# Verification Procedure {#verification}

Checks are listed in order. Servers MUST perform the syntactic and
signature checks before any call to the 1Click Swap API or to an origin
chain. If the origin-chain RPC or the 1Click status endpoint is
unavailable for a required check, servers MUST respond with a server
error (HTTP 5xx) and MUST NOT consume the credential.

For every action, a payload that cannot be parsed or lacks a required
field is rejected with `malformed-credential`, and a field with an
invalid value with `invalid-payload`. An echoed challenge that this
server did not issue for this method and intent, or whose
`methodDetails.version` is not `2`, is rejected with
`invalid-challenge`. The steps below restate these checks only where
an action adds to them.

## Quote Verification {#quote-verification}

A `quote` action carries no signature. Its checks precede the one
1Click call it causes.

1. Parse the payload. If it cannot be parsed, a required field is
   absent or of the wrong type, or it does not carry exactly one of
   `sessionKey` and `reference`, reject with `malformed-credential`.
   `sessionKey`, when present, MUST decode to 32 bytes that form a
   valid Ed25519 public key; `refund.type` MUST be listed in
   `methodDetails.refundTypes`; `refund.account`, when present, MUST
   be a valid NEAR account identifier; `refund.asset`, when present,
   MUST be an asset the server can quote as a 1Click destination, and
   `refund.address` a valid address on its chain; `asset` MUST be an
   asset the server accepts for deposits; `refundTo` MUST be a valid
   address on the chain of `asset`; and `amountOut` MUST be a positive
   integer string. Otherwise reject with `invalid-payload`.
2. Verify that the echoed challenge was issued by this server with a
   binding that matches its `id` per {{I-D.httpauth-payment}}, that it
   is an unquoted challenge, and that its `request` equals the one the
   server currently issues for the requested resource. Otherwise
   reject with `invalid-challenge`. If it has expired, reject with
   `payment-expired`.
3. For a `quote` action with `sessionKey`: verify that the key is not
   bound to any session in the store, open or closed; otherwise reject
   with `session/invalid-proof`. Verify that `amountOut` is at least
   `methodDetails.minDeposit` and at most `methodDetails.maxFunded`,
   when present; otherwise reject with `invalid-payload`.
4. For a `quote` action with `reference`: look up the session. If not
   found, reject with `session/not-found`; if it is `closing` or
   `closed`, reject with `session/closed`, without the close result,
   since the action is not authenticated. Verify that the echoed
   challenge's `currency` and `recipient` equal the session's;
   otherwise reject with `invalid-challenge`. Verify that `amountOut`
   is at least the session's `minDeposit` and that `funded` plus
   `amountOut` does not exceed the session's `maxFunded`, when it has
   one; otherwise reject with `invalid-payload`.
5. Apply the rate limits of {{dos}}.
6. Request the 1Click quote as defined in {{funding-object}}. If the
   backend cannot quote the asset or the amount, reject with
   `invalid-payload`.
7. Durably record the payable challenge: its `id`, its `expires`, its
   funding object, and its binding. Respond as defined in
   {{quote-action}}.

No session state is created or changed by a `quote` action, and no
session key is reserved by it: a key becomes bound only when a signed
`open` settles.

## Open Verification {#open-verification}

1. Parse the payload. If it cannot be parsed or a required field is
   absent or of the wrong type, reject with `malformed-credential`.
   `voucher.cumulative` MUST be a non-negative integer string.
   Otherwise reject with `invalid-payload`.
2. Verify that the echoed challenge was issued by this server with a
   binding that matches its `id` per {{I-D.httpauth-payment}}, and
   that it is a payable challenge bound to a session key. Otherwise
   reject with `invalid-challenge`.
3. Compute `reference` from the echoed challenge ({{reference}}).
   Verify the open signature and the first voucher's signature with
   the challenge's `methodDetails.sessionKey` ({{signing}}). Otherwise
   reject with `session/invalid-proof`.
4. If a session with this `reference` exists, the open is a retry.
   Verify that the echoed challenge is the session's opening
   challenge; otherwise reject with `invalid-challenge`. Then treat
   the embedded voucher as a `voucher` action for that session and
   continue at step 4 of {{voucher-verification}}.
5. Verify that the challenge has not expired; otherwise reject with
   `payment-expired`. Verify that it has not been consumed; otherwise
   reject with `invalid-challenge`.
6. Verify that the challenge's session key is not bound to any session
   in the store, open or closed. Otherwise reject with
   `session/invalid-proof`; the deposit is then returned as an
   unclaimed deposit ({{unclaimed}}).
7. Verify `voucher.cumulative <= funding.amountOut`. Otherwise reject
   with `invalid-payload`.
8. Verify the deposit as defined by the verification procedure of
   {{I-D.nearintents-charge}}, reading `funding.originNetwork`,
   `funding.asset`, `funding.depositAddress`, `funding.minAmountIn`,
   and `funding.depositMemo` in place of the charge request's deposit
   fields. Of that procedure, this document inherits the checks that
   `hash` has not settled another challenge, and that the transaction
   exists on the origin chain, is confirmed, and pays `funding.asset`
   to the deposit address including the memo, verified on the origin
   chain or through backend detection. Otherwise reject with
   `verification-failed`. This document does not claim `hash` as
   in-flight: the payable challenge, which only its bound key can
   present, is the unit of settlement, and a `hash` is recorded only
   when it settles. It replaces the charge expiry check with step 5,
   and the active-quote check with: the quote identified by the
   deposit address was issued by this server and has not been settled
   by a credential; a quote whose swap already reached `SUCCESS` is
   acceptable.
9. Drive the swap to a terminal status as defined by the settlement
   procedure of {{I-D.nearintents-charge}}: notify the 1Click backend
   of the deposit, poll the status endpoint until a terminal status
   (`SUCCESS`, `FAILED`, or `REFUNDED`),
   and confirm that the backend reports a detected deposit of at least
   `funding.minAmountIn` and lists `hash` among the transactions
   observed for the deposit address. The listed transactions can
   include refunds; membership binds the credential to the deposit
   address and does not by itself prove a deposit.
10. On `SUCCESS`, atomically verify once more that the session key is
    unbound and create the session ({{session-state}}) with the
    session key, the refund destination, and the terms of the
    challenge, `funded = funding.amountOut`, `authorized =
    voucher.cumulative`, `spent = "0"`, and `status = "open"`; mark
    the challenge consumed; and consume `hash`. Then process the
    request as that of a `voucher` credential echoing the opening
    challenge, from step 2 of {{voucher-verification}}, and return a
    receipt. The server MUST NOT create the session or return a
    receipt before `SUCCESS`. While the deposit
    is not yet detected or the swap has not reached a terminal status,
    servers MAY respond as defined in {{pending}} instead of holding
    the connection.
11. On `FAILED` or `REFUNDED`, mark the challenge consumed, consume
    `hash`, and reject with `settlement-failed`, or with
    `payment-insufficient` when the backend reports that it refunded a
    deposit that stayed below `funding.minAmountIn`. No session is
    created. The backend refunds the deposit to `funding.refundTo`,
    and the client recovers by sending a new `quote` action; it MUST
    NOT send another deposit against the spent challenge.

`INCOMPLETE_DEPOSIT` is not a terminal status in this document, unlike
in {{I-D.nearintents-charge}}: a deposit below `funding.minAmountIn`
can still be completed before `funding.deadline`. Until the backend
reports a terminal status, the credential is pending ({{pending}}) and
the challenge is not consumed.

## Voucher Verification {#voucher-verification}

1. Look up the session by `payload.reference`. If not found, reject
   with `session/not-found`.
2. Verify that the echoed challenge was issued by this server with a
   binding that matches its `id`, that its `amount`, `currency`, and
   `recipient` equal those the server currently advertises for the
   requested resource, and that its `currency` and `recipient` equal
   the session's. Otherwise reject with `invalid-challenge`. If it has
   expired, reject with `payment-expired`. The `amount` of the echoed
   challenge is the unit price of this request ({{streaming}}).
3. Verify the voucher signature with the session's stored
   `sessionKey` ({{signing}}). Otherwise reject with
   `session/invalid-proof`.
4. If the request carries an `Idempotency-Key` that matches a
   completed or in-progress record for this session, respond as
   defined in {{idempotency}} without changing session state. This
   step precedes the status check so that a retry after a
   server-initiated close recovers its response.
5. Verify `session.status == "open"`. Otherwise reject with
   `session/closed`.
6. If `cumulative < authorized`, reject with `session/stale-update`.
7. If `cumulative == authorized`, do not change voucher state and
   continue at step 9.
8. If `cumulative > authorized`, verify that
   `cumulative - authorized >= minVoucherDelta` or
   `cumulative == funded`, and that `cumulative <= funded`. Otherwise
   reject with `session/insufficient-value`. Then durably store
   `authorized = cumulative` together with the voucher signature before
   delivering any service.
9. If the request method is `HEAD`, return HTTP 200 with a receipt
   and no content. Otherwise serve the request per {{streaming}} and
   return a receipt. Session activity is recorded as defined in
   {{server-initiated-close}}.

## TopUp Verification {#topup-verification}

Steps 1 through 6 apply whatever the session's status; only step 7
depends on it.

1. Look up the session by `payload.reference`. If not found, reject
   with `session/not-found`.
2. Verify that the echoed challenge was issued by this server with a
   binding that matches its `id`, and that it is a payable challenge
   whose `methodDetails.reference` equals `payload.reference`.
   Otherwise reject with `invalid-challenge`.
3. Verify the topUp signature with the session's `sessionKey`
   ({{signing}}). Otherwise reject with `session/invalid-proof`.
4. If `hash` is already recorded for this session: when the session
   is `open`, return HTTP 200 with body `{"status":"ok"}` and a
   receipt reflecting the current state, without crediting again;
   otherwise reject with `session/closed` carrying the current close
   result.
5. Verify that the challenge has not expired and has not been
   consumed, as in step 5 of {{open-verification}}.
6. Verify the deposit as in step 8 of {{open-verification}}, using
   the echoed challenge's funding object. Once the backend reports the
   deposit as detected, record it as a pending deposit of the session
   and drive the swap to a terminal status as in step 9. A pending
   response is permitted as in {{pending}}.
7. On `SUCCESS`, atomically add `funding.amountOut` to `funded`,
   record `hash`, remove it from the pending deposits, mark the
   challenge consumed, and consume `hash`. Then, if the session is
   `open`, record session activity and return HTTP 200 with body
   `{"status":"ok"}` and a receipt. If the session is `closing` or
   `closed`, create a late refund of `funding.amountOut` to the
   session's refund destination ({{late-refunds}}) and reject with
   `session/closed` carrying the current close result.
8. On a non-success terminal status, remove `hash` from the pending
   deposits and reject as in step 11 of {{open-verification}}. The
   session's `funded` is unchanged.

Resolution of a pending deposit does not depend on the client
re-sending the credential. When the server recorded a pending deposit
in step 6 but returned no terminal outcome to the client, for example
after a backend error or a lost connection, it MUST continue to drive
the swap to a terminal status on its own and apply step 7 or step 8
when that status is known, without sending a response.

## Close Verification {#close-verification}

1. Look up the session by `payload.reference`. If not found, reject
   with `session/not-found`.
2. Verify that the echoed challenge was issued by this server with a
   binding that matches its `id` and that its `currency` and
   `recipient` equal the session's; otherwise reject with
   `invalid-challenge`, or with `payment-expired` when it has expired.
   Verify the close signature with the session's `sessionKey`;
   otherwise reject with `session/invalid-proof`.
3. If `session.status` is `closing` or `closed`, return HTTP 200 with
   the current close result and a receipt.
4. Atomically set `session.status = "closing"`, fix the final charge
   as `spent` and the main refund as `funded - spent` at that instant,
   and store a provisional close result whose `refund.status` is
   `pending` and that has no `settlementRef`. From this point the
   server MUST NOT accept vouchers for the session, MUST NOT start new
   deliveries, and MUST stop in-flight streams before their next
   billable unit. Pending top-up deposits are not waited for; one that
   later reaches `SUCCESS` becomes a late refund ({{late-refunds}}).
5. The final charge MUST NOT exceed `authorized`.
6. Execute the main refund per {{refunds}}.
7. Set `session.status = "closed"`, replace the provisional close
   result with the final one, and return HTTP 200 with the close body
   of {{close-action}} and a final receipt ({{receipt}}).

## Pending Settlement {#pending}

Between the submission of an `open` or `topUp` credential and the
terminal status of its swap, the deposit may not yet be visible on the
origin chain or to the 1Click backend, or the swap may still be
running. Neither is a failure of the credential. A server that does
not hold the connection while it polls the status endpoint MAY instead
respond with HTTP 202 (Accepted) and a `Retry-After` header
{{RFC9110}}, with no `Payment-Receipt` and no `WWW-Authenticate`
header, without consuming the challenge or the hash. For an `open`,
the server need not act further on its own: the session is created
when the client presents the credential again after the swap reached
`SUCCESS`. For a `topUp`, see {{topup-verification}}.

A server processes one presentation of a payable challenge at a time.
A credential presented while another presentation of the same
challenge is being processed receives a 202 or the outcome of that
presentation. A session or credit created in the meantime is
recognised as a retry by step 4 of {{open-verification}} or step 4 of
{{topup-verification}}. A 202 is not a final outcome and MUST NOT
be stored as the response for the request's `Idempotency-Key`
({{idempotency}}).

Clients MUST treat a 202 as undecided: they re-present the same
credential after the `Retry-After` delay and MUST NOT send another
`quote` action or make another deposit for it. They re-present until
they receive a response other than 202 or the challenge expires.
Clients SHOULD present the credential as soon as they have broadcast
the deposit.

`verification-failed` is reserved for a deposit that is definitively
wrong: a transaction confirmed on the origin chain that does not
transfer `funding.asset` to `funding.depositAddress` with the required
memo, or a `hash` that already settled another challenge. A deposit
that is not yet detected, or that is still below
`funding.minAmountIn`, is pending while the challenge is unexpired.

# Idempotency {#idempotency}

Retrying a credential after a network failure MUST NOT result in
double-crediting, double-charging of a lifecycle operation, or
double-refunding. Servers MUST enforce:

* Deposit transaction hashes are single-use, and are stored and
  compared under the canonical transaction identifier rules of
  {{I-D.nearintents-charge}}. An `open` for a `reference` that already
  has a session is processed as a `voucher` action (step 4 of
  {{open-verification}}); replay of the application response is
  governed by `Idempotency-Key`. A `topUp`
  presenting a hash already recorded for the session returns
  `{"status":"ok"}` and a receipt without crediting again (step 4 of
  {{topup-verification}}). An `open` or `topUp` presenting a hash
  whose settlement reached a non-success terminal status is rejected;
  the client needs a new payable challenge and a new deposit.
* A payable challenge is consumed by exactly one settled `open` or
  `topUp`, or by the return of its deposit ({{unclaimed}}). Unquoted
  challenges are not consumed.
* The `quote` action is not idempotent: every accepted one yields a
  new payable challenge ({{quote-action}}).
* A voucher equal to the highest accepted voucher does not change
  session state.
* Close is idempotent: a repeated `close` returns the stored close
  result.

For application side effects, clients SHOULD send an `Idempotency-Key`
request header on paid requests, and servers SHOULD support it. A
server that supports it MUST, after verifying the credential's
signature and before any status check, stale-voucher rejection, or
debit, as in step 4 of {{voucher-verification}}, atomically look up
or create a record keyed by `(reference, Idempotency-Key)` holding the
request method, the target URI, a digest of the request body, and the
state `in progress`. The record is retained for at least 24 hours, and
no less than the validity of the echoed challenge, and is completed
with the response, including its receipt, when the request finishes.
A 202 response ({{pending}}) does not complete the record: the server
releases it, so that the re-presented credential is processed anew. A
duplicate that finds a completed record receives the stored response
without being charged again. A duplicate that
finds an `in progress` record MUST NOT execute the request; the
server either waits and returns the stored response or responds with
HTTP 409 Conflict. A reuse of the key with a different method, URI,
or body digest is rejected with HTTP 400 and the `bad-request`
problem type.

For a streaming response, the record is completed with the final
receipt state when the stream ends or is interrupted; a later
duplicate receives HTTP 200 with that receipt and no content, and the
server MUST NOT run the stream again. A server that does not support
`Idempotency-Key` MUST document that retried requests may be charged
again. Payment replay protection and application response idempotency
are separate responsibilities: rejecting a stale voucher does not by
itself replay the original protected response.

# Server-Initiated Close {#server-initiated-close}

Session activity is any of the following events that completes
successfully: creating the session, accepting a voucher that advances
`authorized`, crediting a top-up, or delivering a billable unit of
service. Rejected credentials and cached idempotent responses are not
session activity. Servers MUST update the session's last-activity time
atomically with the state change or delivery that constitutes activity.

When no session activity has occurred for `methodDetails.idleTimeout`
seconds, the server SHOULD close the session promptly. It MUST NOT
close a session solely for inactivity before that interval has elapsed.
While the session has a pending top-up deposit ({{session-state}}),
the server MUST NOT close it solely for inactivity or for an elapsed
lifetime: the close is deferred until no deposit of the session is
pending, so that a top-up from a slow origin chain is credited rather
than refunded. When the challenge advertised
`methodDetails.maxSessionLifetime`, the server SHOULD close the session
once that many seconds have elapsed since its creation, whatever its
activity. A server MAY close a session earlier for operational reasons,
such as planned shutdown; clients therefore MUST NOT treat the idle
timeout or the lifetime as a guarantee that the session remains
available.

A server-initiated close runs steps 4 through 6 of
{{close-verification}} and stores the close result as in step 7; no
response is sent. The refund obligation is identical to that of a
client-initiated close.

After a server-initiated close, a subsequent `voucher` or `topUp` for
the session is rejected with `session/closed`, whose body carries the
close result ({{errors}}). Clients discover the close from that
response and SHOULD open a new session.

# Streaming and Per-Chunk Billing {#streaming}

The unit price of a paid request is the `amount` of the challenge
that its credential echoes ({{voucher-verification}}). It applies to
the whole request, including a stream that outlives the challenge. In
this section `amount` is that unit price. Voucher verification does
not deduct from the session; the delivery layer does.

A unit becomes billable when the server commits it to the response.
For a streaming response, each emitted unit is one billable event.
Before committing each unit, the server MUST atomically verify
`authorized - spent >= amount` and add `amount` to `spent`. A unit
that was debited but not transmitted because of a failure remains
charged; the client's exposure to such loss is bounded by the units in
flight at the failure. If the check fails, the server MUST stop
delivering paid content and request additional value as follows.

## Non-Streaming Requests

A non-streaming response is one billable event whose cost is `amount`
multiplied by the units it contains. Before sending it, the server
MUST atomically verify that `authorized - spent` covers the whole cost
and add the cost to `spent`. If it does not, the server MUST NOT debit
anything and returns HTTP 402 with a fresh challenge and the problem
type `session/insufficient-value`. The body carries `reference`,
`acceptedCumulative`, `requiredCumulative`, and `funded` (see
{{errors}}), where `requiredCumulative` is computed as in
{{payment-need-voucher-event}} with the cost of the whole response. No
session state changes other than `authorized`, when the request's
voucher advanced it.

## payment-need-voucher Event {#payment-need-voucher-event}

For SSE {{SSE}} responses, the server MUST stop delivering additional
metered content, emit a `payment-need-voucher` event on the existing
connection, hold the connection open, and pause delivery:

~~~
event: payment-need-voucher
data: {"reference":"eip155:42161:0x76b4c56085ED136a8744D52bE956396624a730E8","acceptedCumulative":"1000","requiredCumulative":"2000","funded":"5000000"}
~~~

The event data MUST be a JSON object containing:

| Field | Type | Description |
|-------|------|-------------|
| `reference` | string | Session reference. |
| `acceptedCumulative` | string | Current `authorized`, in base units of `currency`. |
| `requiredCumulative` | string | Smallest cumulative amount at which delivery resumes: `max(spent + cost, min(funded, authorized + minVoucherDelta))`, where `cost` is `amount` for the next streamed unit or the whole cost of a non-streaming response. |
| `funded` | string | Current `funded`. |

Payment control events are part of the payment protocol and MUST NOT be
charged as application content.

## Client Recovery

Upon `session/insufficient-value` or a `payment-need-voucher` event
({{payment-need-voucher-event}}), the client:

1. If `requiredCumulative <= funded`, signs a voucher with a cumulative
   amount of at least `requiredCumulative` that satisfies the rules of
   {{voucher-action}}, and submits it. During a
   paused stream, the client keeps the stream open and submits the
   voucher on a separate request, for example a `HEAD` request to the
   same resource URI.
2. If `requiredCumulative > funded`, sends a `quote` action with the
   session `reference`, pays the funding quote of the payable
   challenge it receives, submits a `topUp` credential, and then
   submits a higher voucher.

The server resumes a paused stream once a voucher advancing
`authorized` sufficiently is accepted. Any paused stream for the
session SHOULD observe the new authorized value and resume without
being told which connection to resume. Servers SHOULD close a held
connection if no sufficient voucher is accepted within a reasonable
timeout (RECOMMENDED: 60 seconds). Before closing it, the server
SHOULD emit a `session-timeout` event with the same data fields as
`payment-need-voucher`, so that the client can distinguish the timeout
from a completed stream, and MUST emit the final `payment-receipt`
event ({{payment-receipt-event}}).

A top-up from a slow origin chain exceeds that timeout: the stream
ends, and the client continues with a new request on the same session
once the top-up is credited. Clients SHOULD therefore top up between
requests. When a receipt shows that `funded - spent` will not cover
the next request, the client tops up before sending it.

## Streaming Receipt Event {#payment-receipt-event}

For streaming responses, the `Payment-Receipt` header is attached at
response initiation, before any unit is delivered. Because the final
consumption is not yet known at that point, the server MUST also emit
a final `payment-receipt` SSE event once the stream completes or is
closed by the server, carrying the receipt fields of {{receipt}} with
the session state at that time:

~~~
event: payment-receipt
data: {"method":"nearintents","intent":"session","challengeId":"sQ7mT2vLx9KpR4nB8cWdYe","reference":"eip155:42161:0x76b4c56085ED136a8744D52bE956396624a730E8","status":"success","timestamp":"2026-11-20T15:06:40Z","funded":"5000000","authorized":"25000","spent":"24870","remaining":"130"}
~~~

Transports other than SSE are outside the scope of this document.

# Session State {#session-state}

Servers MUST persist session state in a durable store keyed by
`reference`. The minimum required state is:

| Field | Description |
|-------|-------------|
| `reference` | Session reference ({{reference}}). |
| `openChallengeId` | `id` of the opening challenge. |
| `sessionKey` | Session public key, from the opening challenge. |
| `refund` | Refund destination, from the opening challenge. |
| `currency`, `recipient` | Fixed from the opening challenge. |
| `terms` | The values of the opening challenge that govern the session: `idleTimeout`, `maxSessionLifetime`, `minVoucherDelta`, `refundTypes`, `minOriginRefund`, `minDeposit`, `maxFunded`, and `externalId`. |
| `funded` | Funded value. |
| `authorized`, `authorizedSignature` | Highest accepted voucher and its signature, kept as evidence of consent. |
| `spent` | Spent value. |
| `status` | `open`, `closing`, or `closed`. |
| `depositHashes` | Transaction hashes of the opening deposit and every top-up deposit. |
| `pendingDeposits` | Top-up deposits that the backend has detected and whose swap has not reached a terminal status. A record persists until that status is known. |
| `lastActivityAt` | Time of the last session activity. |
| `closeResult` | From the start of close: `reference`, `funded`, `spent` (the final charge), `settlementRef` when known, the `refund` object of {{refunds}}, and the `lateRefunds` list of {{late-refunds}} when non-empty. `funded` is the session's current `funded`. Provisional while `closing`. |

The invariant `spent <= authorized <= funded` MUST hold at all times.

Wherever this document applies one of the `terms` to an existing
session, it is the value stored with the session, whatever challenge a
later credential echoes.

Servers MUST serialize all updates to a session's state. Concurrent
requests and streams on one session are permitted, and voucher
acceptance, top-up crediting, per-unit deduction, and close MUST be
atomic with respect to each other per session, so that concurrent
requests cannot double-spend, over-serve, or produce inconsistent
receipts. Servers MUST persist `authorized` before relying on it and
`spent` before, or atomically with, the corresponding delivery.

Closed sessions MUST be retained for at least 30 days so that late
credentials are rejected with `session/closed` and the close result
remains available. Deposit transaction hashes and session keys MUST
never be released for reuse.

Servers MUST also persist every payable challenge they issue: its
`id`, its `expires`, its funding object, and its binding. The record
is kept until the challenge expires, so that its deposit can be
claimed throughout the claim window and returned if it is not
({{unclaimed}}).

# Refunds {#refunds}

## Amount and Timing

The refund is `funded - spent`, where `spent` is the final charge of
{{close-verification}}. It is computed at every close, whether
initiated by the client or by the server. If the refund is zero, the
server MUST NOT execute a transfer and records the refund with status
`skipped`.

The `refund` object recorded in the close result, the close body, and
the final receipt has the following fields:

| Field | Type | Presence | Description |
|-------|------|----------|-------------|
| `type` | string | REQUIRED | `"intents"` or `"origin"`. |
| `account` | string | CONDITIONAL | Receiving Intents account, for `intents` refunds. |
| `asset`, `address` | string | CONDITIONAL | Destination asset and address, for `origin` refunds. |
| `amount` | string | REQUIRED | Refund amount in base units of `currency`. |
| `status` | string | REQUIRED | `"succeeded"`, `"submitted"`, `"pending"`, or `"skipped"`. |
| `fallback` | boolean | OPTIONAL | `true` when an `origin` refund fell back to an `intents` refund. |
| `settlementRef` | string | CONDITIONAL | In entries of `lateRefunds` only: the refund reference of that entry, when known. |

## Intents Refunds {#intents-refunds}

For an `intents` refund, the server signs a transfer intent from
`recipient` to `refund.account`, for the Verifier token identifier of
`currency` and the refund amount, and submits it to the Verifier
{{NEAR-INTENTS-VERIFIER}}. On success the status is `succeeded` and
`settlementRef` is the NEAR transaction hash of the execution.

Before submitting a refund, the server MUST durably record the refund
operation: the destination, the amount, and the signed transfer intent
including its nonce. If the transfer cannot be executed when the
session closes, the server records the refund with status `pending`,
completes the close, and MUST retry with backoff until it succeeds.
Servers MUST NOT abandon a pending refund and SHOULD alert an operator
after repeated failures. Clients observe the final status by
re-sending `close` ({{close-action}}).

A retry after an unknown outcome, such as a crash or a timeout after
submission, MUST resubmit the recorded signed intent unchanged. Its
nonce is single-use in the Verifier, so a duplicate submission cannot
execute twice. The server MUST NOT sign a new intent for the same
refund until it has confirmed that the recorded nonce was not used. A
confirmed failure, such as a rejected intent, MAY be retried with a
new signed intent after the record is updated.

## Origin Refunds {#origin-refunds}

For an `origin` refund below `methodDetails.minOriginRefund`, or when
the 1Click backend does not support `refund.asset` as a destination,
the server MUST instead execute an `intents` refund to the implicit
account of the session key. The recorded refund object then has `type`
`"intents"`, `account` set to that implicit account, and `fallback`
set to `true`. Unavailability of the 1Click API is not a reason to
fall back; it is retried under the rules of {{intents-refunds}}.

Otherwise, the server requests a 1Click quote with: swap type
`EXACT_INPUT`, deposit type `INTENTS`, origin asset the Verifier token
identifier of `currency`, amount the refund amount, destination asset
`refund.asset`, recipient `refund.address` with recipient type
`DESTINATION_CHAIN`, and refund type `INTENTS` with the implicit
account of the session key as the refund address. The server then
transfers the refund amount to the quote's deposit account with a
Verifier transfer as in {{intents-refunds}}.

The server MUST durably record the quote's deposit account with the
refund operation before transferring. The merchant's obligation ends
once that transfer succeeds: the status is `submitted` and
`settlementRef` is the quote's deposit account, by which the payer can
query the swap status from the 1Click backend. If the swap later
fails, the 1Click backend returns the funds to the session key's
implicit account, not to the merchant. A server that tracks the swap
MAY later report the status `succeeded` with the destination
transaction as `settlementRef`.

If the transfer has a confirmed failure, or the quote expires before
the transfer is attempted, the server retries with a fresh quote under
the rules of {{intents-refunds}}. An expired quote does not establish
that a transfer to its deposit account failed: after an unknown
outcome, the server MUST confirm that the recorded transfer did not
execute before funding a new quote. The payer bears the swap fees and
slippage of an origin refund.

## Late Refunds {#late-refunds}

The main refund is fixed when the session enters `closing`. Funding
credited to the session after that instant, that is a top-up deposit
whose swap reaches `SUCCESS` for a `closing` or `closed` session, is
owed back in full. For each such credit the server MUST atomically add
`funding.amountOut` to `funded`, create a late refund of that amount
to the session's refund destination, and execute it under the rules
of {{intents-refunds}} or {{origin-refunds}} as a refund operation of
its own.

Each late refund is a refund object with its own `status` and, when
known, its own `settlementRef`. The close result carries them in
`lateRefunds`, an array in order of creation, present only when
non-empty. The `refund` object and the top-level `settlementRef` of
the close result continue to describe the main refund. `final` in a
receipt means that usage of the session has ended; financial recovery
can continue through late refunds, which later `close` responses and
`session/closed` bodies expose.

## Unclaimed Deposits {#unclaimed}

A deposit is unclaimed when its swap reached `SUCCESS` and it has not
become a session or a credit. The value it delivered is held for the
payer and remains claimable, by a credential that satisfies the
binding of its payable challenge, until that challenge expires. The
interval between `funding.deadline` and `expires` is the claim window
({{expiry}}). A top-up deposit that the server recorded as pending is
not unclaimed: the server resolves it on its own
({{topup-verification}}).

Servers MUST keep the record of a payable challenge until it expires,
and MUST detect unclaimed deposits: before discarding the record of a
challenge that no credential settled, the server queries the 1Click
status endpoint for its deposit address and memo and follows a deposit
found there to its terminal status.

When a challenge expires with an unclaimed deposit, the server MUST
mark it consumed and return the value to the payer. It requests a
1Click quote with: swap type `EXACT_INPUT`, deposit type `INTENTS`,
origin asset the Verifier token identifier of `currency`, amount
`funding.amountOut`, destination asset `funding.asset`, recipient
`funding.refundTo` with recipient type `DESTINATION_CHAIN`, and refund
type `INTENTS` with the merchant's `recipient` as the refund address,
so that a failed swap comes back to the merchant and is retried. The
server funds the quote under the rules of {{intents-refunds}}. The
payer bears the fees and slippage of the swap.

If the backend cannot quote that swap at all, because the amount is
too small or the asset is no longer supported, the server MUST instead
transfer the amount within the Verifier: to the `account` of the
refund destination that the challenge, or the session it tops up,
names, when that destination is of type `intents`; otherwise to the
implicit account of the bound session key. Unavailability of the
1Click API is not a reason to fall back; it is retried.

A deposit whose swap ended in a non-success terminal status is not
held by the merchant at all: the 1Click backend refunds it to
`funding.refundTo`, as defined in {{I-D.nearintents-charge}}.

## Properties

A payer can bound its refund from data it already holds: `funded`
from its receipts, minus the highest voucher it signed. The final
receipt discloses the exact final charge. The refund destination was
named by the payer before it deposited and is fixed in the opening
challenge, which the open signature covers. A deposit that never
becomes a session returns to the origin address the payer named, or,
when it cannot be swapped back, to the payer's refund destination.

# Receipt {#receipt}

Upon successful verification of an `open`, `voucher`, `topUp`, or
`close` action, the server MUST attach a payment receipt to the
response via the
`Payment-Receipt` header per {{I-D.httpauth-payment}}, and for
streaming responses MUST also emit the final `payment-receipt` event
({{payment-receipt-event}}). Servers MUST NOT include a
`Payment-Receipt` header on error responses. The receipt contains:

| Field | Type | Presence | Description |
|-------|------|----------|-------------|
| `method` | string | REQUIRED | `"nearintents"` |
| `intent` | string | REQUIRED | `"session"` |
| `challengeId` | string | REQUIRED | `id` of the echoed challenge. |
| `reference` | string | REQUIRED | Session reference. |
| `status` | string | REQUIRED | `"success"` |
| `timestamp` | string | REQUIRED | {{RFC3339}} time of the response. |
| `funded` | string | REQUIRED | Current `funded`. |
| `authorized` | string | REQUIRED | Current `authorized`. |
| `spent` | string | REQUIRED | Current `spent`. At close, the final charge. |
| `remaining` | string | REQUIRED | `authorized - spent`, at close as well. |
| `originTxHash` | string | CONDITIONAL | REQUIRED in the receipt of an `open` or `topUp`, including a retried one: the deposit transaction hash. |
| `final` | boolean | CONDITIONAL | REQUIRED at close, with value `true`: usage of the session has ended. Financial recovery can continue through late refunds ({{late-refunds}}). |
| `settlementRef` | string | CONDITIONAL | At close, when the refund status is `succeeded` or `submitted`: the refund reference of {{refunds}}. |
| `refund` | object | CONDITIONAL | REQUIRED at close: the refund object of {{refunds}}. |
| `externalId` | string | OPTIONAL | Echoed from the opening challenge. |

Example receipt attached at response initiation to the streaming
response to the `open` of {{open-action}}:

~~~json
{
  "method": "nearintents",
  "intent": "session",
  "challengeId": "sQ7mT2vLx9KpR4nB8cWdYe",
  "reference": "eip155:42161:0x76b4c56085ED136a8744D52bE956396624a730E8",
  "status": "success",
  "timestamp": "2026-11-20T15:02:11Z",
  "funded": "5000000",
  "authorized": "1000",
  "spent": "0",
  "remaining": "1000",
  "originTxHash": "0x9bcff372aee89b648c922b850573b22387c31d693079f5e37cd255814e2d615a"
}
~~~

The final `payment-receipt` event of the same stream, after it
delivered 87 tokens (87 x 10 = 870 base units), reports `spent`
`"870"` and `remaining` `"130"`.

Example final receipt at close, after one top-up raised `funded` to
10,000,000, with highest voucher 6,260,000 and metered spend
6,254,870, so that the refund is 10,000,000 - 6,254,870 = 3,745,130:

~~~json
{
  "method": "nearintents",
  "intent": "session",
  "challengeId": "vK8pTz3NwE6yBq1RhLsDfC",
  "reference": "eip155:42161:0x76b4c56085ED136a8744D52bE956396624a730E8",
  "status": "success",
  "timestamp": "2026-11-20T16:12:45Z",
  "funded": "10000000",
  "authorized": "6260000",
  "spent": "6254870",
  "remaining": "5130",
  "final": true,
  "settlementRef": "7YkTGh2vN4qLm8RsE1dXfP5wZc9aJbKu3tHn6VgQ2eUo",
  "refund": {
    "type": "intents",
    "account": "d5bdd38fe760603eaac6821bdc961e296708d2804911c663ea2c79ea581799c3",
    "amount": "3745130",
    "status": "succeeded"
  }
}
~~~

# Error Responses {#errors}

When rejecting a credential, the server MUST return HTTP 402 (Payment
Required) with `Cache-Control: no-store` and a fresh unquoted
challenge in `WWW-Authenticate: Payment` per {{I-D.httpauth-payment}}.
The server SHOULD include a Problem Details {{RFC9457}} body with
`Content-Type: application/problem+json`. The 402 response to an
accepted `quote` action is not a rejection; it is defined in
{{quote-action}}.

Session conditions use problem types under
`https://paymentauth.org/problems/session/`. Deposit and settlement
conditions reuse the problem types of {{I-D.httpauth-payment}} and
{{I-D.nearintents-charge}}.

| Condition | Problem type | HTTP | Body extras |
|-----------|--------------|------|-------------|
| Credential unparseable, or required fields absent or of the wrong type | `malformed-credential` | 402 | |
| Payload field has an invalid value: session key not a valid Ed25519 point, amount not an integer, unsupported asset or refund destination, value to fund outside the merchant's limits, first voucher above the funded value | `invalid-payload` | 402 | |
| Challenge unknown, modified, or consumed; challenge of another method, intent, or version; wrong form for the action (`quote` echoing a payable challenge, `open` or `topUp` echoing an unquoted one); `quote` or `voucher` whose challenge does not match the requested resource; `topUp` whose challenge is bound to another session; challenge whose `currency` or `recipient` differ from the session's | `invalid-challenge` | 402 | |
| Challenge expired | `payment-expired` | 402 | |
| Confirmed deposit transaction with wrong recipient, wrong asset, or wrong memo; `hash` that already settled another challenge. A deposit not yet detected or still incomplete is pending, not an error ({{pending}}) | `verification-failed` | 402 | |
| Swap refunded because the deposit stayed below `funding.minAmountIn` | `payment-insufficient` | 402 | |
| Swap failed or refunded after a verified deposit | `settlement-failed` | 402 | |
| Signature invalid; session key already bound to a session | `session/invalid-proof` | 402 | |
| Unknown `reference` | `session/not-found` | 402 | |
| Session is `closing` or `closed` | `session/closed` | 402 | Close result fields |
| Voucher below the highest accepted voucher | `session/stale-update` | 402 | `reference`, `acceptedCumulative` |
| Voucher above `funded` or advancing by less than `minVoucherDelta`; authorized value exhausted | `session/insufficient-value` | 402 | `reference`, `acceptedCumulative`, `requiredCumulative`, `funded` |
| `quote` actions over the server's rate limit | none | 429 | `Retry-After` |
| `Idempotency-Key` reused with a different method, URI, or body | `bad-request` | 400 | |
| Duplicate of a request that is still in progress ({{idempotency}}) | none | 409 | |
| 1Click Swap API or origin chain unavailable | none | 5xx | Credential not consumed |
| Deposit not yet detected or swap not yet terminal, connection not held | none | 202 | `Retry-After`; credential not consumed ({{pending}}) |

The problem types defined by this document are:

https://paymentauth.org/problems/session/invalid-proof
: HTTP 402. A session-key signature did not verify, or the session key
  named by a `quote` action or bound to a payable challenge is already
  bound to a session.

https://paymentauth.org/problems/session/not-found
: HTTP 402. The `payload.reference` does not match any session stored
  by this server.

https://paymentauth.org/problems/session/closed
: HTTP 402. The session is `closing` or `closed`. Except in response
  to a `quote` action, the body carries the current close result:
  `reference`, `funded`, `spent`, `settlementRef` when known, the
  `refund` object of {{refunds}}, and `lateRefunds` when present
  ({{late-refunds}}). While the session is `closing`,
  `refund.status` is `pending` and `settlementRef` is absent.

https://paymentauth.org/problems/session/stale-update
: HTTP 402. The voucher's `cumulative` is below the highest accepted
  voucher. The body carries `reference` and `acceptedCumulative`.

This document also uses the following problem type, which is
registered by {{I-D.payment-intent-session}}, and defines its body
members for this method:

https://paymentauth.org/problems/session/insufficient-value
: HTTP 402. The voucher's `cumulative` exceeds `funded` or does not
  advance by `minVoucherDelta`, or the authorized value does not cover
  the requested service. The body carries `reference`,
  `acceptedCumulative`, `requiredCumulative` as defined in
  {{payment-need-voucher-event}}, and `funded`. When
  `requiredCumulative` exceeds `funded`, the client MUST top up before
  a higher voucher can be accepted.

Example error response body:

~~~json
{
  "type": "https://paymentauth.org/problems/session/insufficient-value",
  "title": "Insufficient Value",
  "status": 402,
  "detail": "The session lacks authorized value for the requested service.",
  "reference": "eip155:42161:0x76b4c56085ED136a8744D52bE956396624a730E8",
  "acceptedCumulative": "1000",
  "requiredCumulative": "2000",
  "funded": "5000000"
}
~~~

# Security Considerations

## Transport Security

All communication MUST use TLS 1.2 or higher per
{{I-D.httpauth-payment}}. Challenges, credentials, and receipts MUST
only be transmitted over HTTPS connections.

## Amount and Asset Verification {#amount-verification}

Before broadcasting a deposit, clients MUST decode the `request` of
the payable challenge per {{I-D.httpauth-payment}} and verify all of
the following:

- `methodDetails.version` is `2`, and `amount`, `currency`,
  `recipient`, `methodDetails.verifier`, and `methodDetails.custody`
  are as expected and equal those of the unquoted challenge that the
  `quote` action echoed;
- to open a session, `methodDetails.sessionKey` is the client's own
  session key and `methodDetails.refund` equals the refund destination
  of its `quote` action; to top up, `methodDetails.reference` is the
  client's own session;
- `funding.asset`, `funding.refundTo`, and `funding.amountOut` equal
  the values of its `quote` action;
- `funding.amount` does not exceed what the client is prepared to
  deposit for that value, and `funding.deadline` leaves time for the
  deposit to confirm.

A client MUST NOT deposit against a challenge that fails any of these
checks, or that it did not obtain in response to its own `quote`
action. Clients MUST NOT rely on `description`.

## Deposit Address Authenticity

Servers MUST only advertise deposit addresses obtained from
authenticated calls to the 1Click API, and MUST NOT relay deposit
addresses from untrusted sources. Because the client pays before
learning whether the session will be opened, clients SHOULD apply
heightened scrutiny to the server's identity (origin, TLS certificate)
before depositing, and browser-based wallets SHOULD require explicit
user confirmation per {{I-D.httpauth-payment}}.

## Trust Model and Custody {#custody}

Unspent session value is held by the merchant in its Intents account.
Nothing other than the merchant's obligation under this document
enforces the refund at close, and the payer has no independent exit if
the merchant disappears. The payer's exposure is bounded by `funded`.
The merchant bears no financial risk: it is paid before it serves and
only ever serves up to `authorized`.

Refunds are Verifier transfers from `recipient`, and every server
supports `intents` refunds. The merchant MUST therefore keep in
`recipient` at least the sum of `funded - spent` over its `open` and
`closing` sessions, of refunds not yet executed, and of the value
delivered by unclaimed deposits ({{unclaimed}}). Above that floor it
MAY move value out at any time, including while sessions are open; how
it pays itself out is out of scope. Because refunds are signed
automatically, the key the server holds can move the whole balance of
`recipient`; merchants SHOULD dedicate an Intents account to sessions
and sweep the surplus to an account that key does not control.

A compliant merchant charges at most the highest voucher the payer
signed and refunds the rest; nothing enforces this, and a malicious
merchant can retain all of `funded`. Signed vouchers prove what the
session key authorized, which lets the merchant prove the payer's
consent. Receipts are not signed by the merchant: they report the
merchant's own accounting and are not independent evidence of it.

During every open and top-up swap, and during an origin refund, the
funds are custodied by the NEAR Intents settlement system, with the
trust model described in {{I-D.nearintents-charge}}.

The challenge discloses the custody model in
`methodDetails.custody`:

| Value | Who holds unspent funds | Reference |
|-------|-------------------------|-----------|
| `"merchant"` | The merchant's Intents account. Refunds are the merchant's obligation. | This document |

Other custody values are defined only by the documents that specify
them. Clients MUST NOT open a session whose `custody` value they do not
recognize. Clients SHOULD cap the value they fund per custody value,
with a cap for `"merchant"` no larger than the value they are prepared
to lose to the merchant, and SHOULD keep sessions short. A
merchant that delegates its Intents account to an operator holding an
ordinary key is still `custody: "merchant"`; this document does not
define a custody value for such a delegation.

Top-ups take as long as the payer's origin chain requires, and every
open and top-up is a swap whose fees set a minimum useful deposit.
Clients SHOULD top up before the funded value is exhausted.

## Session Key Handling

No key material travels on the wire: the session key never leaves the
client. A captured voucher credential is nonetheless a reusable
spending credential bounded by `authorized - spent` on the session
(see {{replay-protection}}).

If the session private key is compromised, an attacker can sign
vouchers up to `funded` and reduce the refund. The refund destination
cannot be changed once the payable challenge is issued, but when it is
the session key's implicit account, whether by the payer's choice or
by fallback, the attacker can also withdraw the refund from that
account. The exposure is therefore the remaining session value plus
any refund held under the key. Clients SHOULD keep the session key in
a secure store, use short sessions, and keep `funded` small. Clients
funding larger sessions SHOULD name a separately held, durable Intents
account as the refund destination instead of the session key's
implicit account.

A client that names the session key's implicit account as its refund
destination, or selects an `origin` refund with its fallback, MUST be
able to sign Verifier withdrawals with that key and MUST retain the
private key until every refund that can land in that account has been
withdrawn. Refunds can arrive after the client process has exited, for
example after a server-initiated close.

A client that loses the session key after depositing and before
opening cannot open the session. Its deposit is returned as an
unclaimed deposit ({{unclaimed}}): to `funding.refundTo`, or, when it
cannot be swapped back, to the refund destination the client named.
Only a client that selected an `origin` refund can then find the value
under the lost key.

Clients MUST generate a new session key for every session and MUST NOT
deposit against more than one payable challenge that names the same
session key: only one of them can open a session. Servers MUST reject
a session key that has been bound before, so that no voucher or close
signature can be replayed against a later session and no two sessions
share a refund account by accident.

## Signature Binding

Every signed message carries a fixed `domain`, the challenge `realm`,
and either the echoed challenge `id` or the session `reference`, and
every NEP-413 signature names the merchant's Intents account as its
recipient. A voucher is therefore valid for one session at one
merchant in one realm. The NEP-413 prefix ensures that a signed message
cannot be interpreted as a NEAR transaction, so a session key that is
also a NEAR account key cannot be tricked into signing one.

## Deposit Claims and Challenge Binding {#deposit-claims}

A deposit transaction hash is public once broadcast, and a payable
challenge names the address that the deposit pays. Neither is a
secret, and holding both is not sufficient to claim a deposit: an
`open` has to be signed by the session key the challenge is bound to,
and a `topUp` by the key of the session it is bound to. A party that
obtains a copy of a payable challenge, for example from a log or from
the transcript of an agent, can neither open the session nor change
where its refund goes. The most it can do is deposit its own funds for
the benefit of the key holder. The single-use deposit address binds
each deposit to one challenge, as described in
{{I-D.nearintents-charge}}.

The `quote` action is deliberately unauthenticated. A party can
request a payable challenge that names a session key, a refund
destination, or a session of another party. It gains nothing: it
cannot sign for the key, and a client deposits only against a
challenge that it requested and verified ({{amount-verification}}).
Servers MUST NOT treat a `quote` action as evidence of anything, and
MUST NOT bind or reserve a session key before a signed `open` settles,
so that naming a key in a `quote` action cannot deny its holder the
use of it.

The binding depends on the client's checks. A client that deposits
against a payable challenge without verifying its `sessionKey` and its
refund destinations can fund a session that it cannot open, or one
whose refund goes elsewhere.

Challenges and credentials remain sensitive. A captured voucher
credential can be replayed within the limits of
{{replay-protection}}, and a payable challenge discloses the payer's
refund addresses. Servers and clients SHOULD NOT log challenges or
credentials, in whichever header field the credential is carried.

## Replay Protection {#replay-protection}

Deposit transaction hashes are single-use. Vouchers only advance
`authorized`; an equal voucher is a no-op and a lower one is rejected.
Close is idempotent. Session keys are never re-bound. Closed sessions
are retained so that late credentials are rejected. The signing
`domain` differs from that of the withdrawn single-step flow
({{version}}), so no signature made under it verifies here.

Vouchers are bound to a session, not to a resource URI or to an
individual request. A voucher credential replayed against any
protected resource in the realm is accepted while it equals the
highest accepted voucher, and the request is served against
`authorized - spent`. A third party that captures a voucher credential
can therefore consume at most `authorized - spent`; TLS is the
mitigation against capture, and `Idempotency-Key` does not prevent
replay by a third party. Clients SHOULD keep `authorized - spent`
small by advancing vouchers in small steps. Authorization of specific
resources beyond payment is an application-layer concern.

## Accounting and Concurrency

Session accounting is security-critical. Servers MUST make per-session
state updates atomic across concurrent requests and streams, MUST
persist `authorized` before delivering against it, and MUST persist
`spent` before or atomically with delivery, as required by
{{I-D.payment-intent-session}}.

## Refund Account Control {#refund-account-control}

The payer names the refund destination in its `quote` action and is
responsible for controlling it. The server does not verify that
control; the signed `open` records the session key's consent to the
destination ({{signing}}). Naming the implicit account of the session
key keeps the refund under a key whose control the open signature
proves, whatever origin chain the payer funded from. Origin refunds
are handed to a swap and may arrive in a different asset and on a
different chain than the payer deposited, net of fees.

The refund destination and `funding.refundTo` are named by the payer
and are not tied to the source of the deposit. A session that is
opened and closed unused, or a deposit that is never claimed, moves
value from one address to another through the merchant's account, at
the payer's cost. A merchant that has to screen its counterparties
does so before it accepts a `quote` action, and can withhold the
`origin` refund type.

## Denial of Service {#dos}

A server answers a request without a credential with an unquoted
challenge and MUST NOT call the 1Click Swap API or an origin chain to
do so. The `quote` action is the only unauthenticated request that
causes a backend call: every accepted one mints a quote. Servers MUST
validate the payload and the echoed challenge of a `quote` action
before requesting the quote, and MUST rate limit `quote` actions per
client. A limit MUST NOT be keyed on the `sessionKey` or `reference`
of the payload alone: both are public, and a third party could
otherwise exhaust another client's allowance. A server MAY require
other authentication before it accepts `quote` actions, as provided by
{{I-D.httpauth-payment}}.

For `open`, `voucher`, `topUp`, and `close`, servers MUST perform
format validation and signature verification before any 1Click or
origin-chain call. Servers SHOULD rate limit opens, top-ups, voucher
submissions, and streaming pauses, and MUST enforce `minVoucherDelta`
to prevent tiny increments.

## Idempotency and Side Effects

Per {{I-D.httpauth-payment}}, servers MUST NOT perform side effects for
unpaid requests, and SHOULD honour `Idempotency-Key` for non-idempotent
methods so that transport retries do not repeat protected application
side effects.

# IANA Considerations

The "nearintents" payment method is registered in the "HTTP Payment
Methods" registry by {{I-D.nearintents-charge}}; this document does
not register it again.

## Payment Intent Registration

The `session` intent is registered by
{{I-D.payment-intent-session}}. This document does not register a new
payment intent; it defines how the `nearintents` payment method
implements the registered `session` intent.

## Problem Type Registration

This document registers the following problem types in the "HTTP
Problem Types" registry established by {{RFC9457}}:

| Type URI | Title | Status | Reference |
|----------|-------|--------|-----------|
| `https://paymentauth.org/problems/session/invalid-proof` | Invalid Session Proof | 402 | This document |
| `https://paymentauth.org/problems/session/not-found` | Session Not Found | 402 | This document |
| `https://paymentauth.org/problems/session/closed` | Session Closed | 402 | This document |
| `https://paymentauth.org/problems/session/stale-update` | Stale Update | 402 | This document |

Each problem type is defined in {{errors}}. The problem type
`https://paymentauth.org/problems/session/insufficient-value` is
registered by {{I-D.payment-intent-session}}; this document uses it
with the body members defined in {{errors}}.

--- back

# Examples

## Unquoted Challenge (Unauthenticated Request)

~~~http
GET /generate HTTP/1.1
Host: api.example.com

HTTP/1.1 402 Payment Required
Cache-Control: no-store
Content-Type: application/problem+json
WWW-Authenticate: Payment id="uQ1nHs5KdP8wLr2XcVbTmA",
  realm="api.example.com",
  method="nearintents",
  intent="session",
  request="eyJ...",
  expires="2026-11-20T15:30:00Z"

{
  "type": "https://paymentauth.org/problems/payment-required",
  "title": "Payment Required",
  "status": 402,
  "detail": "Payment required for access."
}
~~~

The decoded `request` is the unquoted example of {{challenge}}. The
server has not contacted the 1Click Swap API.

## Quote Action and Payable Challenge

The client generates a session key and asks for a funding quote:

~~~http
GET /generate HTTP/1.1
Host: api.example.com
Authorization: Payment eyJ...

HTTP/1.1 402 Payment Required
Cache-Control: no-store
Content-Type: application/problem+json
WWW-Authenticate: Payment id="sQ7mT2vLx9KpR4nB8cWdYe",
  realm="api.example.com",
  method="nearintents",
  intent="session",
  request="eyJ...",
  expires="2026-11-21T15:10:00Z"

{
  "type": "https://paymentauth.org/problems/payment-action-required",
  "title": "Payment Action Required",
  "status": 402,
  "detail": "Deposit against the payable challenge, then open the session."
}
~~~

The decoded credential is the example of {{quote-action}}, and the
decoded `request` of the returned challenge is the payable example of
{{challenge}}. The client verifies that the challenge names its own
session key and refund addresses, sends 5.025 USDC to `0x76b4c560...`
on Arbitrum, computes the `reference`
`eip155:42161:0x76b4c56085ED136a8744D52bE956396624a730E8`, and signs
the open message and a first voucher for 1,000 base units.

## Open Credential and Response

~~~http
GET /generate HTTP/1.1
Host: api.example.com
Authorization: Payment eyJ...
~~~

The decoded credential is the example of {{open-action}}. After the
swap reaches `SUCCESS`, the server creates the session and streams:

~~~http
HTTP/1.1 200 OK
Cache-Control: private
Content-Type: text/event-stream
Payment-Receipt: eyJ...

data: {"token": "The"}

data: {"token": " answer"}

...

event: payment-receipt
data: {"method":"nearintents","intent":"session","challengeId":"sQ7mT2vLx9KpR4nB8cWdYe","reference":"eip155:42161:0x76b4c56085ED136a8744D52bE956396624a730E8","status":"success","timestamp":"2026-11-20T15:02:19Z","funded":"5000000","authorized":"1000","spent":"870","remaining":"130","originTxHash":"0x9bcff372aee89b648c922b850573b22387c31d693079f5e37cd255814e2d615a"}

data: [DONE]
~~~

## Voucher Credential (HEAD)

A voucher that only raises the authorized value, sent while a stream is
paused:

~~~http
HEAD /generate HTTP/1.1
Host: api.example.com
Authorization: Payment eyJ...

HTTP/1.1 200 OK
Cache-Control: private
Payment-Receipt: eyJ...
~~~

The decoded credential is the example of {{voucher-action}}. Decoded
receipt:

~~~json
{
  "method": "nearintents",
  "intent": "session",
  "challengeId": "sQ7mT2vLx9KpR4nB8cWdYe",
  "reference": "eip155:42161:0x76b4c56085ED136a8744D52bE956396624a730E8",
  "status": "success",
  "timestamp": "2026-11-20T15:06:12Z",
  "funded": "5000000",
  "authorized": "25000",
  "spent": "1000",
  "remaining": "24000"
}
~~~

## Insufficient Value SSE Event

~~~
event: payment-need-voucher
data: {"reference":"eip155:42161:0x76b4c56085ED136a8744D52bE956396624a730E8","acceptedCumulative":"1000","requiredCumulative":"2000","funded":"5000000"}
~~~

## Session Timeout SSE Event

Emitted before the server closes a held connection whose voucher did
not arrive in time; the final `payment-receipt` event follows it:

~~~
event: session-timeout
data: {"reference":"eip155:42161:0x76b4c56085ED136a8744D52bE956396624a730E8","acceptedCumulative":"1000","requiredCumulative":"2000","funded":"5000000"}
~~~

## TopUp Credential and Response

The client asks for a funding quote bound to its session, echoing a
current unquoted challenge. Decoded payload of the `quote` credential:

~~~json
{
  "action": "quote",
  "reference": "eip155:42161:0x76b4c56085ED136a8744D52bE956396624a730E8",
  "asset": "eip155:42161/erc20:0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
  "refundTo": "0x2527D02599Ba641c19Fea793Cd0f9A6e8457c317",
  "amountOut": "5000000"
}
~~~

The server answers 402 with a payable challenge, `id`
`tV3kLm9QxZ2pRwN7bYcHfA`, whose `methodDetails` carry a new funding
object and
`"reference": "eip155:42161:0x76b4c56085ED136a8744D52bE956396624a730E8"`
in place of `sessionKey` and `refund`. The client pays its funding
quote and submits the top-up to any protected URI in the realm:

~~~http
GET /generate HTTP/1.1
Host: api.example.com
Authorization: Payment eyJ...

HTTP/1.1 200 OK
Cache-Control: private
Content-Type: application/json
Payment-Receipt: eyJ...

{"status":"ok"}
~~~

The decoded credential is the example of {{topup-action}}. Decoded
receipt:

~~~json
{
  "method": "nearintents",
  "intent": "session",
  "challengeId": "tV3kLm9QxZ2pRwN7bYcHfA",
  "reference": "eip155:42161:0x76b4c56085ED136a8744D52bE956396624a730E8",
  "status": "success",
  "timestamp": "2026-11-20T15:48:30Z",
  "funded": "10000000",
  "authorized": "5000000",
  "spent": "4999870",
  "remaining": "130",
  "originTxHash": "0x4d1e8a7c3b2f9e6d5c4b3a2918f7e6d5c4b3a29187f6e5d4c3b2a1908f7e6d5c"
}
~~~

## Close Credential and Response

~~~http
GET /generate HTTP/1.1
Host: api.example.com
Authorization: Payment eyJ...

HTTP/1.1 200 OK
Cache-Control: private
Content-Type: application/json
Payment-Receipt: eyJ...

{
  "status": "closed",
  "reference": "eip155:42161:0x76b4c56085ED136a8744D52bE956396624a730E8",
  "funded": "10000000",
  "spent": "6254870",
  "settlementRef": "7YkTGh2vN4qLm8RsE1dXfP5wZc9aJbKu3tHn6VgQ2eUo",
  "refund": {
    "type": "intents",
    "account": "d5bdd38fe760603eaac6821bdc961e296708d2804911c663ea2c79ea581799c3",
    "amount": "3745130",
    "status": "succeeded"
  }
}
~~~

The decoded credential is the example of {{close-action}}; the
decoded receipt is the final receipt of {{receipt}}.

## Session Closed by the Server

A voucher submitted after an idle close:

~~~http
HTTP/1.1 402 Payment Required
Cache-Control: no-store
Content-Type: application/problem+json
WWW-Authenticate: Payment id="uW4nPq8RyA3sTxM6cZdJgB",
  realm="api.example.com",
  method="nearintents",
  intent="session",
  request="eyJ...",
  expires="2026-11-20T16:30:00Z"

{
  "type": "https://paymentauth.org/problems/session/closed",
  "title": "Session Closed",
  "status": 402,
  "detail": "The session was closed after 900 seconds without activity.",
  "reference": "eip155:42161:0x76b4c56085ED136a8744D52bE956396624a730E8",
  "funded": "10000000",
  "spent": "6254870",
  "settlementRef": "7YkTGh2vN4qLm8RsE1dXfP5wZc9aJbKu3tHn6VgQ2eUo",
  "refund": {
    "type": "intents",
    "account": "d5bdd38fe760603eaac6821bdc961e296708d2804911c663ea2c79ea581799c3",
    "amount": "3745130",
    "status": "succeeded"
  }
}
~~~

## Origin Refund

Decoded payload of a `quote` credential that selects an origin refund
to USDC on Base:

~~~json
{
  "action": "quote",
  "sessionKey": "ed25519:FPMiwPws7RmVuqaAqqEwYNaVxf379PBvfmcqMisGbRai",
  "refund": {
    "type": "origin",
    "asset": "eip155:8453/erc20:0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    "address": "0x2527D02599Ba641c19Fea793Cd0f9A6e8457c317"
  },
  "asset": "eip155:42161/erc20:0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
  "refundTo": "0x2527D02599Ba641c19Fea793Cd0f9A6e8457c317",
  "amountOut": "5000000"
}
~~~

The payable challenge carries the same object as
`methodDetails.refund`, and the open message signs it
({{vector-open-refund}}). The `refund` object of the close result
after the swap has been handed to the 1Click backend:

~~~json
{
  "type": "origin",
  "asset": "eip155:8453/erc20:0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  "address": "0x2527D02599Ba641c19Fea793Cd0f9A6e8457c317",
  "amount": "3745130",
  "status": "submitted"
}
~~~

# Signing Example {#signing-example}

This appendix is informative. The vectors below were produced with the
following test session key. Its seed is published so that
implementations can reproduce the signatures; the key MUST NOT be used
for a real session.

~~~
seed (hex):
16fbaea482e27c6a48cdf152b355472781a0aaf1de271437bfe8e8012654894a

sessionKey:
ed25519:FPMiwPws7RmVuqaAqqEwYNaVxf379PBvfmcqMisGbRai

implicit account:
d5bdd38fe760603eaac6821bdc961e296708d2804911c663ea2c79ea581799c3
~~~

Every vector uses `realm` `api.example.com`, NEP-413 `recipient`
`merchant.near`, and the challenge identifiers, deposit hashes,
amounts and session `reference` of the examples in this document. For
each message the vector gives the JCS-serialized message, the SHA-256
nonce, the SHA-256 digest of the prefixed Borsh payload ({{nep413}}),
and the signature over that digest. The first vector also gives the
prefixed Borsh payload in full: the 4-byte tag `9d010080` (2^31 + 413,
little-endian), the u32 message length, the message bytes, the 32
nonce bytes, the u32 recipient length, the recipient bytes, and the
final `00` for the absent `callbackUrl`.

## First Voucher {#vector-voucher}

The first voucher carried by the `open` of {{open-action}}:

~~~
message:
{"action":"voucher","cumulative":"1000","currency":"near:mainnet/nep141:17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1","domain":"mpp-nearintents-session-v2","realm":"api.example.com","reference":"eip155:42161:0x76b4c56085ED136a8744D52bE956396624a730E8"}

nonce:
e543e3aef537d0cbea89b0c4549d44c8ccac0b3aacfb76e5e90ef3a0849733d6

payload (hex):
9d010080100100007b22616374696f6e223a22766f7563686572222c2263756d
756c6174697665223a2231303030222c2263757272656e6379223a226e656172
3a6d61696e6e65742f6e65703134313a31373230383632386638346635643661
6433336630646133626262656232376666636233393865616335303161333162
64366164323031316533363133336131222c22646f6d61696e223a226d70702d
6e656172696e74656e74732d73657373696f6e2d7632222c227265616c6d223a
226170692e6578616d706c652e636f6d222c227265666572656e6365223a2265
69703135353a34323136313a3078373662346335363038354544313336613837
34344435326245393536333936363234613733304538227de543e3aef537d0cb
ea89b0c4549d44c8ccac0b3aacfb76e5e90ef3a0849733d60d0000006d657263
68616e742e6e65617200

digest:
59cb93a6c9345de08a33fb8415f6ce7b9f29d448de0b32e1767aec9de325bd45

signature:
ed25519:3NGDTHMoLJiLqU9pvyQfDsXacCx9aPr4b3j925zR2trh1bZS3aBBWKhGsxZQBbY6QJRGnTJZ7r86nG1wcsLJBCcA
~~~

## Open {#vector-open}

The open signature of {{open-action}}. The challenge it echoes names
the implicit account of the session key as refund destination:

~~~
message:
{"action":"open","challengeId":"sQ7mT2vLx9KpR4nB8cWdYe","domain":"mpp-nearintents-session-v2","hash":"0x9bcff372aee89b648c922b850573b22387c31d693079f5e37cd255814e2d615a","realm":"api.example.com","refund":{"account":"d5bdd38fe760603eaac6821bdc961e296708d2804911c663ea2c79ea581799c3","type":"intents"},"sessionKey":"ed25519:FPMiwPws7RmVuqaAqqEwYNaVxf379PBvfmcqMisGbRai"}

nonce:
007634593662e6776c8258edc4ea752d1250444e1134eda9cc673399bed4ba2a

digest:
59c8b47605afab5dfc9adf40b7bfa5ae6ab9dc82d23075244fa49474d6d657a7

signature:
ed25519:39sYVWfQ3g3SKkPK4S2QZfKhXHaMRgp73Tr9iLGNZdpsf2W8oP3oweE6JcypthFd2FHQ6PCJ2fdmmC1Myxmx8g8r
~~~

## Open with Origin Refund {#vector-open-refund}

The open signature for the payable challenge of the origin-refund
example in Appendix A, taken with the same challenge identifier and
deposit hash:

~~~
message:
{"action":"open","challengeId":"sQ7mT2vLx9KpR4nB8cWdYe","domain":"mpp-nearintents-session-v2","hash":"0x9bcff372aee89b648c922b850573b22387c31d693079f5e37cd255814e2d615a","realm":"api.example.com","refund":{"address":"0x2527D02599Ba641c19Fea793Cd0f9A6e8457c317","asset":"eip155:8453/erc20:0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913","type":"origin"},"sessionKey":"ed25519:FPMiwPws7RmVuqaAqqEwYNaVxf379PBvfmcqMisGbRai"}

nonce:
5c24d55533d43dcd3348305249c526d10e8a6f1a7a73314dc55bd1d50317b4ad

digest:
46e9d3bebbff0af8156baec4c2f6250268f16f34fc2647b72a0b51ebd7bd8be8

signature:
ed25519:49ngZ2oAuT976MxGzoR6XXuYXdT349GhwVPDS1X3SDraNyFfMLUwKQzQqXiQfBWLs3oSJeb5dKEuV243cBgfEHgf
~~~

## TopUp {#vector-topup}

The topUp signature of {{topup-action}}:

~~~
message:
{"action":"topUp","challengeId":"tV3kLm9QxZ2pRwN7bYcHfA","domain":"mpp-nearintents-session-v2","hash":"0x4d1e8a7c3b2f9e6d5c4b3a2918f7e6d5c4b3a29187f6e5d4c3b2a1908f7e6d5c","realm":"api.example.com","reference":"eip155:42161:0x76b4c56085ED136a8744D52bE956396624a730E8"}

nonce:
9c4aad08876f0aa210dad208de3709d0445f99bfe22b80d753f54e3aa83477ab

digest:
a43abb81ec50666e767b8d97a4af16c3c9848bd0a516dcea5ee6986aaf78ee46

signature:
ed25519:3RxWetavggcGzAor9WywB1kaBNxQNDG2fhod1JdsReWBHgL7keUy3RH2bRRvuKxcoGCCoFp7vV1uhto45ntm3aYu
~~~

## Close {#vector-close}

The close signature of {{close-action}}:

~~~
message:
{"action":"close","domain":"mpp-nearintents-session-v2","realm":"api.example.com","reference":"eip155:42161:0x76b4c56085ED136a8744D52bE956396624a730E8"}

nonce:
397200d4ee7ec3e9f3e991bd0a5eb45c2b0ead263393f65b302808178ae72615

digest:
9cd1cfd109274a9a4d6dc42a0a337e56df3d71d65357912f6bc280dd43b082a3

signature:
ed25519:5EsonbjXGFtjWV8ivU7xsFne1mPqinGoHGtAgmiBrWTFg445giUMMxycXcpnb1faHDAjEirUikhhtHa6gByr7JRo
~~~

# Schema Definitions

The schemas in this appendix use JSON Schema vocabulary for
illustrative purposes only. They are informational; the normative
definitions are in the body of this document. No specific JSON Schema
draft version is required or assumed.

## Challenge Request Schema

A payable challenge additionally requires `funding` and either
`sessionKey` with `refund`, or `reference`. An unquoted challenge
carries none of them.

~~~json
{
  "type": "object",
  "required": ["amount", "currency", "recipient", "methodDetails"],
  "properties": {
    "amount":      { "type": "string", "pattern": "^[1-9][0-9]*$" },
    "currency":    { "type": "string" },
    "recipient":   { "type": "string" },
    "unitType":    { "type": "string" },
    "description": { "type": "string" },
    "externalId":  { "type": "string" },
    "methodDetails": {
      "type": "object",
      "required": [
        "version", "verifier", "custody", "minDeposit",
        "idleTimeout", "minVoucherDelta", "refundTypes"
      ],
      "properties": {
        "version":           { "const": 2 },
        "verifier":          { "type": "string" },
        "custody":           { "type": "string", "enum": ["merchant"] },
        "settlementBackend": { "type": "string" },
        "minDeposit":        { "type": "string", "pattern": "^[1-9][0-9]*$" },
        "maxFunded":         { "type": "string", "pattern": "^[1-9][0-9]*$" },
        "idleTimeout":       { "type": "integer", "minimum": 1 },
        "maxSessionLifetime": { "type": "integer", "minimum": 1 },
        "minVoucherDelta":   { "type": "string", "pattern": "^[1-9][0-9]*$" },
        "refundTypes": {
          "type": "array",
          "items": { "type": "string", "enum": ["intents", "origin"] },
          "contains": { "const": "intents" }
        },
        "minOriginRefund":   { "type": "string" },
        "funding": {
          "type": "object",
          "required": [
            "originNetwork", "asset", "depositAddress", "amount",
            "minAmountIn", "amountOut", "deadline", "refundTo"
          ],
          "properties": {
            "originNetwork":     { "type": "string" },
            "asset":             { "type": "string" },
            "depositAddress":    { "type": "string" },
            "amount":            { "type": "string" },
            "minAmountIn":       { "type": "string" },
            "amountOut":         { "type": "string" },
            "depositMemo":       { "type": ["string", "null"] },
            "slippageTolerance": { "type": "number" },
            "timeEstimate":      { "type": "number" },
            "deadline":          { "type": "string", "format": "date-time" },
            "refundTo":          { "type": "string" }
          }
        },
        "sessionKey": { "type": "string", "pattern": "^ed25519:[1-9A-HJ-NP-Za-km-z]+$" },
        "refund":     { "$ref": "#/$defs/refundDestination" },
        "reference":  { "type": "string" }
      }
    }
  },
  "$defs": {
    "refundDestination": {
      "oneOf": [
        {
          "type": "object",
          "required": ["type", "account"],
          "properties": {
            "type":    { "const": "intents" },
            "account": { "type": "string" }
          }
        },
        {
          "type": "object",
          "required": ["type", "asset", "address"],
          "properties": {
            "type":    { "const": "origin" },
            "asset":   { "type": "string" },
            "address": { "type": "string" }
          }
        }
      ]
    }
  }
}
~~~

## Credential Payload Schema

`refundDestination` is the definition of the challenge request schema.
A `quote` payload carries exactly one of `sessionKey` (with `refund`)
and `reference`.

~~~json
{
  "oneOf": [
    {
      "type": "object",
      "required": ["action", "asset", "refundTo", "amountOut"],
      "properties": {
        "action":     { "const": "quote" },
        "sessionKey": { "type": "string", "pattern": "^ed25519:[1-9A-HJ-NP-Za-km-z]+$" },
        "refund":     { "$ref": "#/$defs/refundDestination" },
        "reference":  { "type": "string" },
        "asset":      { "type": "string" },
        "refundTo":   { "type": "string" },
        "amountOut":  { "type": "string", "pattern": "^[1-9][0-9]*$" },
        "slippageTolerance": { "type": "number" }
      }
    },
    {
      "type": "object",
      "required": ["action", "hash", "signature", "voucher"],
      "properties": {
        "action":     { "const": "open" },
        "hash":       { "type": "string" },
        "signature":  { "type": "string" },
        "voucher": {
          "type": "object",
          "required": ["cumulative", "signature"],
          "properties": {
            "cumulative": { "type": "string", "pattern": "^(0|[1-9][0-9]*)$" },
            "signature":  { "type": "string" }
          }
        }
      }
    },
    {
      "type": "object",
      "required": ["action", "reference", "cumulative", "signature"],
      "properties": {
        "action":     { "const": "voucher" },
        "reference":  { "type": "string" },
        "cumulative": { "type": "string", "pattern": "^(0|[1-9][0-9]*)$" },
        "signature":  { "type": "string" }
      }
    },
    {
      "type": "object",
      "required": ["action", "reference", "hash", "signature"],
      "properties": {
        "action":    { "const": "topUp" },
        "reference": { "type": "string" },
        "hash":      { "type": "string" },
        "signature": { "type": "string" }
      }
    },
    {
      "type": "object",
      "required": ["action", "reference", "signature"],
      "properties": {
        "action":    { "const": "close" },
        "reference": { "type": "string" },
        "signature": { "type": "string" }
      }
    }
  ]
}
~~~

## Receipt Schema

~~~json
{
  "type": "object",
  "required": [
    "method", "intent", "challengeId", "reference", "status",
    "timestamp", "funded", "authorized", "spent", "remaining"
  ],
  "properties": {
    "method":        { "const": "nearintents" },
    "intent":        { "const": "session" },
    "challengeId":   { "type": "string" },
    "reference":     { "type": "string" },
    "status":        { "const": "success" },
    "timestamp":     { "type": "string", "format": "date-time" },
    "funded":        { "type": "string" },
    "authorized":    { "type": "string" },
    "spent":         { "type": "string" },
    "remaining":     { "type": "string" },
    "originTxHash":  { "type": "string" },
    "final":         { "type": "boolean" },
    "settlementRef": { "type": "string" },
    "refund": {
      "type": "object",
      "required": ["type", "amount", "status"],
      "properties": {
        "type":     { "type": "string", "enum": ["intents", "origin"] },
        "account":  { "type": "string" },
        "asset":    { "type": "string" },
        "address":  { "type": "string" },
        "amount":   { "type": "string" },
        "status":   { "type": "string", "enum": ["succeeded", "submitted", "pending", "skipped"] },
        "fallback": { "type": "boolean" }
      }
    },
    "externalId":    { "type": "string" }
  }
}
~~~

# Acknowledgements

The author thanks the Tempo Labs and Stripe teams for the Machine
Payments Protocol framework, the Lightspark team for the prepaid
session model this document follows, and the NEAR Intents and Near One
teams for the 1Click Swap settlement system.
