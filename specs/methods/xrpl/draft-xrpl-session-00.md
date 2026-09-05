---
title: XRP Ledger Session Intent for HTTP Payment Authentication
abbrev: XRPL Session
docname: draft-xrpl-session-00
version: 00
category: info
ipr: noModificationTrust200902
submissiontype: independent
consensus: false

author:
  - name: Maxime Dienger
    ins: M. Dienger
    email: maximed@ripple.com
    org: RippleX

normative:
  RFC2119:
  RFC3339:
  RFC8174:
  RFC8259:
  RFC9457:
  I-D.httpauth-payment:
    title: "The 'Payment' HTTP Authentication Scheme"
    target: https://datatracker.ietf.org/doc/draft-ryan-httpauth-payment/
    author:
      - name: Jake Moxey
    date: 2026-01
  I-D.xrpl-charge:
    title: "XRP Ledger Charge Intent for HTTP Payment Authentication"
    target: https://datatracker.ietf.org/doc/draft-xrpl-charge/
    author:
      - name: Maxime Dienger
    date: 2026

informative:
  XRPL-PAYCHAN:
    title: "Payment Channels"
    target: https://xrpl.org/docs/concepts/payment-types/payment-channels
    author:
      - org: XRP Ledger Foundation
    date: 2026
  XRPL-PAYCHAN-OBJECT:
    title: "PayChannel Ledger Entry"
    target: https://xrpl.org/docs/references/protocol/ledger-data/ledger-entry-types/paychannel
    author:
      - org: XRP Ledger Foundation
    date: 2026
  XRPL-CHAN-CREATE:
    title: "PaymentChannelCreate Transaction"
    target: https://xrpl.org/docs/references/protocol/transactions/types/paymentchannelcreate
    author:
      - org: XRP Ledger Foundation
    date: 2026
  XRPL-CHAN-CLAIM:
    title: "PaymentChannelClaim Transaction"
    target: https://xrpl.org/docs/references/protocol/transactions/types/paymentchannelclaim
    author:
      - org: XRP Ledger Foundation
    date: 2026
  XRPL-CHAN-FUND:
    title: "PaymentChannelFund Transaction"
    target: https://xrpl.org/docs/references/protocol/transactions/types/paymentchannelfund
    author:
      - org: XRP Ledger Foundation
    date: 2026
  XRPL-CHANNEL-VERIFY:
    title: "channel_verify Method"
    target: https://xrpl.org/docs/references/http-websocket-apis/public-api-methods/payment-channel-methods/channel_verify
    author:
      - org: XRP Ledger Foundation
    date: 2026
  XRPL-CHANNEL-AUTHORIZE:
    title: "channel_authorize Method"
    target: https://xrpl.org/docs/references/http-websocket-apis/admin-api-methods/signing-methods/channel_authorize
    author:
      - org: XRP Ledger Foundation
    date: 2026
  XRPL-RESERVES:
    title: "Reserves"
    target: https://xrpl.org/docs/concepts/accounts/reserves
    author:
      - org: XRP Ledger Foundation
    date: 2026
  XRPL-FINALITY:
    title: "Finality of Results"
    target: https://xrpl.org/docs/concepts/transactions/finality-of-results
    author:
      - org: XRP Ledger Foundation
    date: 2026
  XRPL-TX-RESULTS:
    title: "Transaction Results"
    target: https://xrpl.org/docs/references/protocol/transactions/transaction-results
    author:
      - org: XRP Ledger Foundation
    date: 2026
  XRPL-KEYS:
    title: "Cryptographic Keys"
    target: https://xrpl.org/docs/concepts/accounts/cryptographic-keys
    author:
      - org: XRP Ledger Foundation
    date: 2026
  XRPL-BASIC-TYPES:
    title: "Basic Data Types"
    target: https://xrpl.org/docs/references/protocol/data-types/basic-data-types
    author:
      - org: XRP Ledger Foundation
    date: 2026
  XRPL-AMENDMENTS:
    title: "Known Amendments"
    target: https://xrpl.org/resources/known-amendments
    author:
      - org: XRP Ledger Foundation
    date: 2026
---

--- abstract

This document defines the "session" intent for the "xrpl" payment
method within the Payment HTTP Authentication Scheme. A session is
carried by an XRP Ledger Payment Channel: the client locks XRP
on-chain once, then authorises a series of off-chain claims, each a
signature over a cumulative total. The server redeems the final
claim in a single closing transaction.

Two on-chain transactions therefore settle an unbounded number of
payments, which is what makes per-request and per-token billing
viable at amounts where a transaction fee would otherwise dominate.

The "session" intent is experimental. It is defined here rather than
in a standalone intent document because it is not yet formalized in
the intent registry.

--- middle

# Introduction

The charge intent {{I-D.xrpl-charge}} settles every payment on-chain.
That is correct and final, but it costs a transaction and several
seconds each time, which rules out the cases this intent exists for:
paying per API call, per inference token, or per streamed chunk.

An XRP Ledger Payment Channel {{XRPL-PAYCHAN}} decouples
authorisation from settlement. The funder locks XRP in a channel
naming a destination, which also locks an owner reserve for the new
ledger entry {{XRPL-RESERVES}}. Thereafter it signs claims
off-chain, each stating a *cumulative* total rather than an
increment. The destination may redeem the highest claim it holds at
any time, in one transaction.

Cumulative rather than incremental is the property that makes this
safe with no coordination: a lost or reordered claim costs nothing,
because the next one supersedes it. The server need only retain the
largest.

## Session Flow

~~~
Client                                   Server
  |                                        |
  |  PaymentChannelCreate (on-chain)       |
  |                                        |
  |------------- GET /resource ----------->|
  |<-- 402, challenge: cumulative so far --|
  |                                        |
  | sign claim over (channelId, total)     |
  |                                        |
  |-- Authorization: Payment <voucher> --->|
  |                                        | verify signature
  |                                        | check channel on-chain
  |                                        | advance high-water mark
  |<-- 200, Payment-Receipt ---------------|
  |                                        |
  |          ... N more requests ...        |
  |                                        |
  |                                        | PaymentChannelClaim
  |                                        | (on-chain, tfClose)
~~~

## Channels Are XRP-Only

Payment Channels carry XRP exclusively. Issued currencies and MPTs
cannot fund a channel, so every amount in this document is an integer
drop count. A server needing off-chain settlement in another asset
must use a different mechanism; this intent does not provide one.

# Requirements Language

{::boilerplate bcp14-tagged}

# Terminology

Channel:
: A `PayChannel` ledger entry {{XRPL-PAYCHAN-OBJECT}} created by
  `PaymentChannelCreate` {{XRPL-CHAN-CREATE}},
  identified by a 256-bit channel ID, naming an `Account` (the
  funder), a `Destination`, an `Amount` deposited, a `Balance`
  already redeemed, a `PublicKey` authorised to sign claims, and a
  `SettleDelay`.

Claim (voucher):
: A signature by the channel's `PublicKey` over the tuple of channel
  ID and a cumulative drop amount. Not a ledger transaction.

Cumulative amount:
: The running total authorised since the channel opened
  {{XRPL-BASIC-TYPES}}, not the
  amount owed for one request.

High-water mark:
: The largest cumulative amount a server has accepted for a channel.

SettleDelay:
: Seconds the funder must wait, after initiating closure, before the
  channel can be destroyed. The window in which the destination can
  still redeem.

# Method Identifier

The method identifier is `xrpl`, as in {{I-D.xrpl-charge}}, carried
in the challenge and credential fields the Payment HTTP
Authentication Scheme {{I-D.httpauth-payment}} defines. This
document defines only the `session` intent for it.

# Intent: "session"

`session` is the intent identifier on the wire. An implementation MAY
expose a local alias for its own API, but MUST advertise and accept
`session` in challenges and credentials.

# Encoding Conventions {#encoding}

The encoding rules of {{I-D.xrpl-charge}} apply to this document
unchanged. They are inherited rather than restated: the rule that
case must not be load-bearing in a hex identifier is the one a
divergent copy would quietly break, and one statement cannot diverge
from itself.

What this intent adds is narrower.

Amounts:
: Every amount is an integer count of drops, as a decimal string,
  with no fractional part. A channel carries XRP alone, so the token
  units of {{I-D.xrpl-charge}} do not arise here.

Cumulative amounts:
: A voucher states the running total authorised over the channel's
  life, not the increment it adds. It is an integer drop count on
  the same terms as any other amount here, and it is compared and
  accumulated as an exact integer -- see [](#amount-precision) for
  why, and for the boundary that makes it a MUST.

Channel identifiers:
: A `channelId` is 64 hexadecimal characters, carrying the case
  rules {{I-D.xrpl-charge}} states. A claim signature is verified
  over the hex-decoded identifier, so two spellings of one channel
  are one channel, and anything derived from it -- a high-water mark
  above all -- MUST be keyed on a canonical form.

# Request Schema

| Field | Type | Required | Meaning |
|---|---|---|---|
| `amount` | string | yes | increment charged for this request, in drops |
| `channelId` | string | yes | 64-hex channel ID, or `""` on an open |
| `recipient` | string | yes | classic address the channel must pay |
| `currency` | string | no | always `"XRP"` when present |
| `description` | string | no | display only |

`amount` is the increment for this request. The cumulative total is
the server's business: it knows the high-water mark and the client
does not need to be trusted with the arithmetic.

`channelId` is empty only on an open-action challenge, because the
channel does not exist until its creating transaction is validated
and the ID can be read from the metadata. A credential payload MUST
always carry a full 64-hex channel ID; the empty form is confined to
the challenge.

# Credential Schema

Credentials and challenges are JSON {{RFC8259}}; timestamps such as a
challenge's `expires` are {{RFC3339}}.

The payload is discriminated by `action`.

## action = "open"

~~~ json
{
  "action": "open",
  "transaction": "1200...",
  "amount": "100000",
  "signature": "304402..."
}
~~~

`transaction` is a signed but unsubmitted `PaymentChannelCreate`
{{XRPL-CHAN-CREATE}}. The
server broadcasts it, reads the channel ID from the validated
metadata, then treats `amount` and `signature` as the first claim.

This folds channel establishment into the 402 exchange, so no
out-of-band endpoint is needed. A server MAY instead require the
client to open the channel itself and supply the ID by other means.

## action = "voucher"

~~~ json
{
  "action": "voucher",
  "channelId": "2D398F9458B0CF96284E3602E57A83E787C1A01658512F972CEDDB1819607E89",
  "amount": "200000",
  "signature": "304402..."
}
~~~

`amount` is the new cumulative total, not the increment.

## action = "close"

Requests that the server redeem and close. The payload carries the
final cumulative amount and its signature.

# Verification Procedure {#verification}

The order is normative. Cheap local checks precede network calls so
that an unauthenticated caller cannot use verification to generate
ledger traffic.

## Size and Shape

The server MUST bound the credential size before parsing, and reject
a payload whose fields do not match the schema.

## Signature {#signature}

The server MUST verify the claim signature over the tuple of channel
ID and cumulative amount, against the channel's authorised public
key {{XRPL-KEYS}}, **before** any ledger lookup.

Verification MAY be performed locally or through the ledger's
`channel_verify` method {{XRPL-CHANNEL-VERIFY}}. Local verification is
preferred: it costs no round trip, and it does not disclose to a node
which channels a server is being paid through.

A matching `channel_authorize` {{XRPL-CHANNEL-AUTHORIZE}} exists for
producing claim signatures, but it is an admin method and takes a
secret, so a client signs locally in practice.

Ordering matters. A signature check is local arithmetic; a channel
lookup is a network round trip. Verifying the signature first means a
caller supplying random channel IDs is rejected without the server
making a request on its behalf.

The claim signs an XRP-denominated figure. Implementations MUST
derive it from the drop count by exact integer arithmetic. A
conversion through a binary floating-point value is lossy above 2^53
drops and, where it is lossy, produces a signature over a figure
differing from the amount that will be submitted, which then fails to
verify on-chain. See [](#amount-precision).

## Sender Binding

The address derived from the channel's authorised public key MUST
match the address in the credential's `source` DID. Without this, a
claim can be replayed under another party's identity.

## Channel State {#channel-state}

The server MUST confirm, against the ledger, that:

1. the channel exists;
2. its `Destination` is the recipient this server is charging for --
   a funder can otherwise open a channel to an address of its own
   choosing and receive service against claims this server can never
   redeem;
3. its `PublicKey` matches the key the server verifies against;
4. its `SettleDelay` is at least the server's configured minimum;
5. the cumulative claimed does not exceed `Amount` less `Balance`;
6. the channel is not expired, and not within the settlement margin
   of expiry.

A server MAY cache this state briefly, but the two fields that can
move against it need care of different kinds.

`Amount` only ever grows, since a funder may add to a channel and
cannot withdraw from it. A stale value is therefore pessimistic: it
under-reports the deposit and can only cause an unnecessary refusal,
which a single re-read resolves.

`Expiration` is not monotone. A funder may set or shorten it at any
time, so a stale absence of an expiry is optimistic in exactly the
wrong direction. A cache lifetime as long as the settlement margin of
[](#closing-window) spends that whole margin on staleness: the
channel may have entered its closing window a full lifetime ago,
leaving no real
time to redeem. Implementations MUST keep the cache lifetime
materially below the margin, or read `Expiration` fresh.

## Settle Delay Floor {#settle-delay}

The server MUST reject a channel whose `SettleDelay` is below a
configured minimum, and that minimum SHOULD be no less than one hour.

The delay is the whole of the destination's protection. Once the
funder initiates closure, the destination has exactly `SettleDelay`
to submit its claim. A channel with a delay of sixty seconds lets a
funder consume service and close before any realistic operator can
detect and respond, and the unredeemed value returns to the funder.

## Closing Window {#closing-window}

The server MUST refuse a voucher when the channel is within a
configured margin of `Expiration` or `CancelAfter`.

One ledger amendment {{XRPL-AMENDMENTS}} bears directly on this
window. `fixPayChanCancelAfter` makes `PaymentChannelCreate` fail
when `CancelAfter` is already in the past; without it a channel
could be created that was unusable from the moment it existed. A
server MUST NOT assume the amendment is enabled on the network it is
talking to. It does not need to: reading `CancelAfter` from the
channel, which [](#channel-state) requires anyway, settles the
question for that channel whatever the network has enabled.

Accepting a claim in that window earns value the server has no time
left to redeem. Treating those fields as advisory -- reporting them
while still accepting the claim -- is not sufficient: after
`CancelAfter` anyone may delete the channel and the deposit returns
to the funder.

## Monotonicity {#monotonicity}

The server MUST reject a cumulative amount that is not strictly
greater than its high-water mark for that channel, and MUST perform
the comparison and the update as one atomic operation.

The mark MUST be keyed on a canonical form of the channel ID. Hex is
case-insensitive as a value, and both layers beneath the store treat it
that way: `verifyPaymentChannelClaim` hex-decodes the ID, so a claim
signed over one casing verifies against another, and the ledger
resolves either. A mark keyed on the raw string is therefore not one
mark but one per casing, and the same voucher can be spent once for
each -- which is unbounded in practice, since a 64-character
identifier has as many casings as it has letters.

Three outcomes are distinct and MUST be distinguished:

| Condition | Meaning |
|---|---|
| cumulative equals the mark | replay of an accepted claim |
| cumulative below the mark | attempt to roll back |
| cumulative above, but increment below what was requested | underpayment |

The third is the one most easily missed. A first claim on a fresh
channel has no previous mark to exceed, so a check written only
against the mark accepts any positive amount -- one drop satisfies a
one-XRP request.

The update MUST be a compare-and-set, shared across every process
serving the channel and durable across restarts. A read followed by a
write lets two replicas accept the same claim concurrently, and a
mark lost on restart lets every claim be replayed.

## Finalized Channels

Once the server has closed a channel, it MUST record that and reject
later claims against it. A closed channel cannot be redeemed again,
so a claim accepted afterwards is service given away.

# Settlement Procedure

## Redemption

The server submits `PaymentChannelClaim` {{XRPL-CHAN-CLAIM}}
carrying the highest cumulative amount it holds and the matching
signature.

The `tfClose` flag is accepted from the source and from the
destination alike, and its effect differs by sender. From the
destination the channel closes at once: the claim settles, the entry
is deleted, and the unspent deposit returns to the funder. From the
source it schedules closure for once `SettleDelay` has elapsed,
which is what preserves the destination's window described in
[](#settle-delay).

A server ending a session SHOULD set it. One transaction then both
collects what was earned and releases the funder's deposit and owner
reserve, where a claim without it leaves the entry in place holding
both.

Implementations MUST verify which flag they set. `tfClose` and
`tfRenew` are adjacent values, and `tfRenew` clears the channel's
`Expiration` rather than closing anything. Substituting one for the
other fails silently: the claim still settles and the transaction
still succeeds, so only reading the channel entry afterwards
distinguishes a close from a renewal.

The submitted `Balance` MUST be the exact drop count the signature
covers. If the two disagree the ledger rejects the signature and the
earned value becomes unredeemable.

## Idle Channels

A funder may extend a channel's deposit or expiry with
`PaymentChannelFund` {{XRPL-CHAN-FUND}}, but is under no obligation
to. A client that disappears mid-session leaves value authorised but
unclaimed, and the funder may begin closure at any time. A server
SHOULD therefore redeem proactively rather than waiting for a client
that may not return.

Where `fixPayChanRecipientOwnerDir` {{XRPL-AMENDMENTS}} is enabled,
a channel is listed in the recipient's owner directory as well as
the funder's, so a server can enumerate the channels paying it
rather than relying solely on its own records. The owner reserve for
the entry stays with the funder, who created it; being listed costs
the recipient nothing.

## Receipts

A receipt for a session payment identifies the claim, not a
transaction: the channel ID and the cumulative total. There is no
transaction hash until redemption.

# Error Responses {#errors}

Problem Details {{RFC9457}} on a `402`. Ledger result codes
{{XRPL-TX-RESULTS}} MUST NOT be surfaced raw. Distinct conditions
MUST be distinguishable by the client, and a server SHOULD report
each with the type named here:

| Condition | Meaning | Problem type |
|---|---|---|
| channel not found | no such channel on the ledger | `session/channel-not-found` |
| destination mismatch | channel does not pay this server | `verification-failed` |
| settle delay too short | below the server's floor | `verification-failed` |
| channel expired | past `Expiration`/`CancelAfter` | `session/channel-finalized` |
| channel closing | inside the settlement margin | `session/channel-finalized` |
| channel exhausted | claim exceeds the deposit left | `session/amount-exceeds-deposit` |
| invalid signature | claim does not verify | `session/invalid-signature` |
| replay detected | cumulative not above the mark | `verification-failed` |

The types are relative to `https://paymentauth.org/problems/`, the
base URI {{I-D.httpauth-payment}} establishes. Those in the
`session` namespace are the ones payment-channel methods already
share; this document adds none. Three conditions carry
`verification-failed` because they are refusals of the procedure in
[](#verification) rather than states of the channel, and the detail
field distinguishes them.

# Security Considerations

## The Server Bears the Settlement Risk

The asymmetry is structural and worth stating plainly. The funder's
exposure is bounded by the deposit. The server's exposure is every
claim it has accepted but not yet redeemed, and it can lose that
value in three ways: the funder closes and the delay elapses
unnoticed, `CancelAfter` passes, or the server's high-water record is
lost before redemption. Only a redemption in a validated ledger
settles the matter {{XRPL-FINALITY}}.

Sections 7.5, 7.6, 7.7 and 8.2 each close one of these. None is
optional.

## Signature Malleability

For secp256k1 keys an ECDSA signature has two valid encodings
differing in the sign of S. An implementation MUST NOT treat the two
as distinct claims -- a distinct encoding of an accepted claim is
still that claim, and accepting it as new would credit the funder
twice.

Enforcing canonical low-S form on verification is the direct defence.
Implementations SHOULD confirm their verifier does so rather than
assume it.

## Cache Staleness

Caching channel state trades a round trip for a window in which the
server acts on a stale view. The deposit is safe to cache because it
only grows. The expiry is not, and a cache lifetime at or above the
settlement margin makes that margin nominal -- see [](#closing-window).

## Replay Store Durability

The high-water mark is the only record that a claim has been spent.
It is not reconstructible from the ledger, which sees only the final
redemption. A store lost on restart therefore does not degrade
gracefully: every claim ever issued becomes replayable.

## Amount Precision {#amount-precision}

Drop counts up to the total supply exceed the 2^53 integers exactly
representable in IEEE-754; the boundary is 9,007,199,254 XRP. Above
it, a conversion through a floating-point value yields a signature
over a figure differing from the submitted amount, and the ledger
rejects it. The threshold is far above any plausible channel, but the
failure is silent and the arithmetic is not hard to get right, so
exact integer handling is a MUST.

## The Challenge Must Match the Resource

A verifier reads the increment, the channel and the recipient from
the challenge the credential carries, so the requirement in "The
Challenge Must Match the Resource" of {{I-D.xrpl-charge}} applies
here unchanged: a server MUST confirm that the terms it is about to
verify are the terms the requested resource charges, and MUST refuse
the credential otherwise. A session compounds the consequence,
because a challenge accepted against the wrong resource moves that
resource's high-water mark for every voucher that follows.

## Transport Security

As {{I-D.xrpl-charge}}: TLS for any non-loopback ledger connection.

# IANA Considerations

The `xrpl` payment method is registered in the "HTTP Payment
Methods" registry by {{I-D.xrpl-charge}}; this document does not
register it again.

## Payment Intent Registration

This document requests registration of the following entry in the
"HTTP Payment Intents" registry established by
{{I-D.httpauth-payment}}:

| Intent | Applicable Methods | Description | Reference |
|---|---|---|---|
| `session` | `xrpl` | Off-ledger payment channel vouchers | This document |

Contact: Maxime Dienger (<maximed@ripple.com>)

`session` is an experimental intent, defined by method documents
rather than by an intent document of its own. Should it be
formalized, this document should be updated to reference that
document rather than define the intent here.

## Problem Types

This document registers no problem type URI. The conditions in
[](#errors) are reported with types already established: the core
types of {{I-D.httpauth-payment}}, and the `session` namespace that
payment-channel methods share.

--- back

# Examples

## Voucher Challenge

~~~ json
{
  "method": "xrpl",
  "intent": "session",
  "amount": "100000",
  "channelId":
    "2D398F9458B0CF96284E3602E57A83E787C1A01658512F972CEDDB1819607E89",
  "recipient": "rhewi79quXUDwcqjkpj4bXuw3cuHYC9fwv",
  "expires": "2026-08-21T10:32:00Z"
}
~~~

## Voucher Credential

Third request in a session, each charging 100,000 drops. The
cumulative total is 300,000; the increment is 100,000.

~~~ json
{
  "action": "voucher",
  "channelId":
    "2D398F9458B0CF96284E3602E57A83E787C1A01658512F972CEDDB1819607E89",
  "amount": "300000",
  "signature": "3044022057..."
}
~~~

## Redemption

After five such requests the server holds a claim for 500,000 drops
and submits:

~~~ json
{
  "TransactionType": "PaymentChannelClaim",
  "Channel":
    "2D398F9458B0CF96284E3602E57A83E787C1A01658512F972CEDDB1819607E89",
  "Balance": "500000",
  "Amount": "500000",
  "Signature": "3044022057...",
  "PublicKey": "ED690468FD78177F3158..."
}
~~~

Five payments, two on-chain transactions.
