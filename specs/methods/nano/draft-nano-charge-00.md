---
title: Nano Charge Intent for HTTP Payment Authentication
abbrev: Nano Charge
docname: draft-nano-charge-00
version: 00
category: info
ipr: noModificationTrust200902
submissiontype: independent
consensus: false

author:
  - name: dhyabi2
    ins: dhyabi2
    email: dhyabi2@users.noreply.github.com

normative:
  RFC2119:
  RFC3339:
  RFC4648:
  RFC7693:
  RFC8174:
  RFC8259:
  RFC8785:
  RFC9457:
  I-D.httpauth-payment:
    title: "The 'Payment' HTTP Authentication Scheme"
    target: https://datatracker.ietf.org/doc/draft-ryan-httpauth-payment/
    author:
      - name: Jake Moxey
    date: 2026-01
  I-D.payment-intent-charge:
    title: "'charge' Intent for HTTP Payment Authentication"
    target: https://datatracker.ietf.org/doc/draft-payment-intent-charge/
    author:
      - name: Jake Moxey
      - name: Brendan Ryan
      - name: Tom Meagher
    date: 2026

informative:
  RFC8032:
  NANO-BLOCKS:
    title: "Blocks Specifications"
    target: https://docs.nano.org/integration-guides/blocks-specifications/
    author:
      - org: Nano Foundation
    date: 2026
  NANO-BASICS:
    title: "The Basics: Accounts, Units and Blocks"
    target: https://docs.nano.org/integration-guides/the-basics/
    author:
      - org: Nano Foundation
    date: 2026
  NANO-RPC:
    title: "RPC Protocol"
    target: https://docs.nano.org/commands/rpc-protocol/
    author:
      - org: Nano Foundation
    date: 2026
  NANO-CONSENSUS:
    title: "Open Representative Voting and Block Cementing"
    target: https://docs.nano.org/protocol-design/orv-consensus/
    author:
      - org: Nano Foundation
    date: 2026
  NANO-WORK:
    title: "Proof-of-Work"
    target: https://docs.nano.org/integration-guides/work-generation/
    author:
      - org: Nano Foundation
    date: 2026
  CAIP-2:
    title: "CAIP-2: Blockchain ID Specification"
    target: https://github.com/ChainAgnostic/CAIPs/blob/main/CAIPs/caip-2.md
    author:
      - org: Chain Agnostic Standards Alliance
    date: 2019
  DID-PKH:
    title: "did:pkh Method Specification"
    target: https://github.com/w3c-ccg/did-pkh
    author:
      - org: W3C CCG
---

--- abstract

This document defines the "charge" intent for the "nano" payment
method within the Payment HTTP Authentication Scheme. A charge settles
as a single confirmed `send` state block on the Nano block-lattice,
transferring the native asset XNO to the recipient the server names.

Nano has no transaction fees and no memo field. The client publishes
the send block itself and presents its 64-hexadecimal block hash as
the credential; the server verifies the block against a Nano node and
binds it to the challenge either through a per-challenge receiving
address or through a per-challenge exact amount.

--- middle

# Introduction

Nano is a feeless cryptocurrency built on a block-lattice: every
account has its own chain of blocks, and only the account holder can
append to it {{NANO-BLOCKS}}. A payment is a single `send` block on
the payer's chain naming the receiver; it is confirmed by
representative voting, typically in well under a second, and once
confirmed ("cemented") it cannot be reversed {{NANO-CONSENSUS}}.

This document specifies how the "charge" intent
{{I-D.payment-intent-charge}} maps onto such a send block. It is
intended to be offered alongside other payment methods: a server MAY
include a `nano` challenge next to challenges for other methods in
the same `402` response, and a client chooses whichever it can pay.

## Payment Flow

The only credential type is a block hash ("push mode"). The client
builds, signs and publishes the send block, and the server verifies
what the network recorded.

~~~
Client                 Nano network                 Server
  |                         |                          |
  |------------ GET /resource ------------------------>|
  |<----------- 402, WWW-Authenticate: Payment --------|
  |                         |                          |
  | publish send block ---->|                          |
  |<--- confirmed ----------|                          |
  |                         |                          |
  |------------ GET /resource ------------------------>|
  |             Authorization: Payment <cred>          |
  |                         |<---- block_info ---------|
  |                         |----- confirmed send ---->|
  |<----------- 200, Payment-Receipt: <receipt> -------|
~~~

A pull mode, in which the client hands an unpublished signed block to
the server, is not defined here. A Nano send block can only be
published by appending it to the payer's own chain, so a server
holding such a block gains nothing a block hash does not already
give it, while the payer gains no protection: the block is valid as
soon as it is signed.

## Relationship to the Charge Intent

This document constrains {{I-D.payment-intent-charge}}; it does not
redefine it. Fields defined there keep their meaning. Everything
introduced here lives under `methodDetails`, except where this
document narrows the permitted values of a shared field.

# Requirements Language

{::boilerplate bcp14-tagged}

# Terminology

Raw:
: The indivisible unit of XNO. One XNO is 10^30 raw {{NANO-BASICS}}.
  All amounts on the wire are integer raw counts expressed as decimal
  strings.

Account address:
: The text form of a Nano account: the prefix `nano_` followed by 60
  characters of Nano's base32 alphabet
  (`13456789abcdefghijkmnopqrstuwxyz`). The first 52 characters encode
  the 256-bit Ed25519 public key (left-padded with four zero bits);
  the last 8 encode a 40-bit checksum, which is the 5-byte BLAKE2b
  {{RFC7693}} digest of the public key with its byte order reversed
  {{NANO-BASICS}}.

State block:
: The single block format used by the Nano protocol. It carries
  `account`, `previous`, `representative`, `balance` and `link`
  fields, a signature and a proof-of-work nonce {{NANO-BLOCKS}}.

Send block:
: A state block whose `balance` is lower than that of the block
  before it. The difference is the amount sent, and the `link` field
  holds the public key of the receiving account.

Block hash:
: The 256-bit BLAKE2b digest that identifies a block, written as 64
  hexadecimal characters.

Confirmed:
: A block that has received confirmation by representative vote and
  has been cemented by the node reporting it. Nano RPC reports this
  as `"confirmed": "true"`.

Receivable:
: Funds sent to an account whose owner has not yet published the
  matching `receive` block. A receivable amount already belongs to
  the recipient; receiving it is the recipient's bookkeeping, not
  part of the payment.

# Method Identifier

The method identifier is the string `nano`.

Servers advertising this method in a challenge MUST use exactly this
value. The identifier is case-sensitive and lowercase.

# Intent: "charge"

The `charge` intent settles a single confirmed send block. It is the
only intent defined by this document.

# Encoding Conventions {#encoding}

Amounts:
: Integer raw counts as decimal strings with no sign, no leading
  zeros, no decimal point and no exponent, for example
  `"1000000000000000000000000000"` for 0.001 XNO. The total supply
  is about 1.33 x 10^38 raw, which exceeds both 2^64 and the 2^53
  integers exactly representable in IEEE-754. Implementations MUST
  parse and compare amounts as arbitrary-precision (at least 128-bit
  unsigned) integers and MUST NOT convert them to floating point.

Addresses:
: The `recipient` field MUST use the `nano_` prefix. Implementations
  MUST validate the checksum of every address they parse and MUST
  compare accounts by their decoded 32-byte public keys, not by
  their text form. Nodes may report the legacy `xrb_` prefix for the
  same key; the two prefixes name the same account.

Hashes:
: Block hashes are 64 hexadecimal characters. Nodes report them in
  uppercase, and implementations MUST emit uppercase, but MUST accept
  either casing on input. Every comparison, and every key derived
  from a hash (in particular the consumed-hash store of
  [](#single-use)), MUST use the canonical uppercase form. A store
  keyed on the raw string while the node lookup accepts either casing
  lets one block be presented twice under two spellings.

Credentials and challenges are JSON {{RFC8259}}. The `request`
object is serialized with JCS {{RFC8785}} and base64url-encoded
without padding {{RFC4648}}, as {{I-D.httpauth-payment}} defines.

# Request Schema {#request-schema}

## Shared Fields

The `charge` intent's shared fields apply, with these constraints:

| Field | Type | Required | Constraint |
|---|---|---|---|
| `amount` | string | REQUIRED | positive integer raw count, see [](#encoding) |
| `currency` | string | REQUIRED | `"XNO"` |
| `recipient` | string | REQUIRED | `nano_` account address |
| `description` | string | OPTIONAL | display only |
| `externalId` | string | OPTIONAL | merchant reconciliation handle |

XNO is the only asset on the Nano network, so `currency` has a single
permitted value. Servers MUST NOT issue a `nano` challenge with any
other `currency`.

## Method Details

| Field | Type | Required | Meaning |
|---|---|---|---|
| `network` | string | REQUIRED | {{CAIP-2}} network identifier |
| `binding` | string | REQUIRED | `"address"` or `"amount"`, see [](#binding) |

`network` identifies the ledger the payment must settle on. This
document defines `nano:mainnet` for the Nano main network. Other
networks (for example a beta or test network) MAY be used by
agreement between client and server; a server MUST NOT accept a block
from a network other than the one it challenged for. Clients SHOULD
refuse to pay when the challenge's network is not the one their node
or wallet is connected to.

`binding` tells the client which of the two binding modes in
[](#binding) the server is using, and therefore how strictly the
amount will be compared. Clients MUST pay the `amount` exactly as
given in both modes.

# Credential Schema {#credential-schema}

The credential in the `Authorization` header contains a
base64url-encoded JSON object per {{I-D.httpauth-payment}}.

## Credential Structure

| Field | Type | Presence | Description |
|---|---|---|---|
| `challenge` | object | REQUIRED | Echo of the challenge auth-params per {{I-D.httpauth-payment}} |
| `payload` | object | REQUIRED | Nano-specific payload |
| `source` | string | OPTIONAL | Payer DID |

The `source` field, if present, SHOULD use the `did:pkh` method
{{DID-PKH}} with the CAIP-2 network identifier and the payer's account
address (for example `did:pkh:nano:mainnet:nano_3c8g...`).

## Hash Payload {#hash-payload}

| Field | Type | Presence | Description |
|---|---|---|---|
| `type` | string | REQUIRED | `"hash"` |
| `hash` | string | REQUIRED | Hash of the send block, 64 hexadecimal characters |

~~~ json
{
  "type": "hash",
  "hash":
    "AF76DB116540806369252C2FEF3E4368B0180DBB61450DD83041A985AB66802F"
}
~~~

The client MUST publish the send block before presenting the
credential, and SHOULD wait until its own node reports the block as
confirmed. A credential for a block the network has not yet confirmed
will be refused (see [](#finality)) and can be retried.

# Challenge Binding {#binding}

A Nano state block has no memo, invoice or reference field: it
records only the sender, the receiver's public key, the balances and
a representative. Nothing in the block itself can name the challenge
it pays. The binding between a payment and a challenge therefore has
to come from the one thing the server controls: what it asks to be
paid, where.

Without a binding, any confirmed send of a sufficient amount to the
recipient satisfies every check in [](#verification), including a
send made by a different payer for a different challenge. Block hashes
are public as soon as a block is published, so such a send is easy to
find and present first.

A server MUST use one of the following two modes for each challenge
and MUST state it in `methodDetails.binding`.

## Per-Challenge Address (binding="address") {#binding-address}

The server names a receiving account that it has not named in any
other challenge, typically by deriving a fresh account from its seed
for each challenge. The recipient itself is then the binding: a send
to that account can only answer the one challenge that named it.

This is the RECOMMENDED mode. It needs no coordination of amounts,
tolerates overpayment, and leaves no ambiguity when two clients pay
the same price at the same moment.

A server using this mode MUST NOT reuse a recipient address in a
second challenge, including after the first challenge has expired:
a late or repeated payment to the old address would otherwise satisfy
the new challenge. Funds arriving at per-challenge accounts remain
receivable there until the server receives and consolidates them,
which is outside this document.

## Per-Challenge Amount (binding="amount") {#binding-amount}

The server keeps a single recipient and makes the `amount` unique
instead, by adjusting its least significant raw digits. One raw is
10^-30 XNO, so a unique suffix in, for example, the lowest 24 digits
changes the price by less than 0.000001 XNO.

A server using this mode:

1. MUST NOT have two unexpired challenges outstanding with the same
   `recipient` and `amount`.
2. SHOULD NOT issue an `amount` that it has issued before for the
   same recipient, for example by including a monotonically
   increasing counter in the suffix. A send that predates the
   challenge but happens to match its amount would otherwise be
   accepted.
3. MUST require the sent amount to equal the challenged `amount`
   exactly ([](#verification)). Accepting a larger amount in this
   mode would let any larger payment to the shared recipient answer
   any smaller challenge.

Because an exact match is required, a client in this mode MUST NOT
round, and wallets that only send whole display units cannot be used.
This mode suits servers that cannot cheaply create accounts; the
per-challenge address mode is preferred otherwise.

# Verification Procedure {#verification}

A server MUST perform every check in this section before returning a
receipt. Cheap local checks precede any call to a node so that an
unauthenticated caller cannot use verification as an amplifier.

## Local Checks

1. The echoed challenge is one this server issued, its integrity
   protection verifies, its `method` is `nano` and its `intent` is
   `charge`, per {{I-D.httpauth-payment}}.
2. The challenge carries an `expires` value that is a valid
   {{RFC3339}} timestamp and has not passed.
3. The terms in the challenge are the terms the requested resource
   charges ([](#resource-match)).
4. `payload.type` is `"hash"` and `payload.hash` is exactly 64
   hexadecimal characters; it is then canonicalized to uppercase.
5. The canonical hash is not in the consumed-hash store
   ([](#single-use)).

## Block Checks

The server then retrieves the block from a Nano node, for example
with the `block_info` RPC action {{NANO-RPC}}:

~~~ json
{
  "action": "block_info",
  "json_block": "true",
  "hash":
    "AF76DB116540806369252C2FEF3E4368B0180DBB61450DD83041A985AB66802F"
}
~~~

and verifies, against the response:

1. The block exists. A node that does not yet know a freshly published
   block is not proof of absence; the server MAY retry briefly but
   MUST NOT hold the request open for long on a hash that may simply
   be fabricated.
2. `contents.type` is `"state"` and `subtype` is `"send"`. A
   `receive`, `change` or `epoch` block moves no funds to the
   recipient.
3. `contents.link_as_account`, decoded to a public key, equals the
   public key of the challenged `recipient`. Equivalently, the
   `contents.link` field equals that public key in hexadecimal.
4. `amount`, the raw amount the block sent, satisfies the binding
   mode: with `binding="address"` it MUST be greater than or equal to
   the challenged `amount`; with `binding="amount"` it MUST be exactly
   equal to it.
5. `confirmed` is `"true"` ([](#finality)).
6. If the credential carries a `source` DID, `block_account` equals
   the account it names. This check confirms the payer's claim; it is
   not a substitute for the binding, since anyone can name any
   account.

A server that does not operate its own node SHOULD additionally
recompute the block hash from `contents` -- the BLAKE2b-256 digest of
the state-block preamble (31 zero bytes followed by the byte 0x06),
`account`, `previous`, `representative`, `balance` as a 16-byte
big-endian integer, and `link` -- and confirm that it equals the
presented hash, and SHOULD verify `signature` against `account`
(Ed25519 {{RFC8032}} with BLAKE2b-512 in place of SHA-512, as Nano
specifies). This prevents a faulty or dishonest node from substituting
block contents. It cannot attest to confirmation, which is why
[](#node-trust) applies.

## Single Use {#single-use}

On success the server MUST atomically record both that the challenge
has been answered and that the block hash has been consumed, and MUST
reject any later credential that presents either again.

The record MUST be created by a compare-and-set that fails if the key
already exists, not by a read followed by a write; MUST be shared
across every process serving the realm; and MUST be durable. A block
hash is 32 bytes, and a confirmed send never stops being a valid
send, so consumed hashes SHOULD be retained indefinitely rather than
only until the challenge expires.

A server MUST NOT mark a hash consumed when verification fails, and
in particular not when the block is merely unconfirmed, so that the
client can present the same credential again once it confirms.

## Finality {#finality}

An unconfirmed block is not payment. Until a send is confirmed, the
payer can publish a competing block with the same `previous` (a
fork), and only one of the two will be confirmed by the network. A
server MUST NOT return a receipt for a block that is not reported as
confirmed.

Once confirmed, a block is cemented and cannot be rolled back
{{NANO-CONSENSUS}}; there is no further depth to wait for. A server
MAY, if `confirmed` is `"false"`, wait a short time for the vote to
complete (it normally takes well under a second) before answering.
If it does not wait, or the block is still unconfirmed, it MUST
answer `verification-failed` without consuming the challenge or the
hash, and SHOULD include a `Retry-After` header.

# Settlement Procedure

The client settles; the server only observes. There is no settlement
step for the server to perform, no fee for anyone to pay, and nothing
for the server to sign. A payment is complete when its send block is
confirmed, whether or not the recipient has yet published the
matching `receive` block.

The client pays no transaction fee but must attach a proof-of-work
nonce to its block {{NANO-WORK}}. Work generation adds latency on
constrained clients; it is not a cost to the server and is not
something the server verifies beyond what the node already enforces.

## Receipt {#receipt}

Upon successful verification, servers MUST return a `Payment-Receipt`
header per {{I-D.httpauth-payment}}, with these payload fields:

| Field | Type | Presence | Description |
|---|---|---|---|
| `method` | string | REQUIRED | `"nano"` |
| `reference` | string | REQUIRED | Block hash, 64 uppercase hexadecimal characters |
| `status` | string | REQUIRED | `"success"` |
| `timestamp` | string | REQUIRED | {{RFC3339}} verification time |
| `externalId` | string | OPTIONAL | Echoed from the request |

# Error Responses {#errors}

Errors are Problem Details {{RFC9457}} using the types
{{I-D.httpauth-payment}} defines under
`https://paymentauth.org/problems/`. This document defines no type
of its own.

| Condition | Problem type |
|---|---|
| credential not parseable, or hash not 64 hex characters | `malformed-credential` |
| challenge unknown, expired or already answered | `invalid-challenge` |
| block hash already consumed | `invalid-challenge` |
| block unknown, not a send, wrong recipient or unconfirmed | `verification-failed` |
| amount not equal to the challenged amount in `amount` mode | `verification-failed` |
| amount below the challenged amount | `payment-insufficient` |

A server MUST NOT disclose in an error whether a given block hash was
previously consumed by a different caller.

# Security Considerations

## Transport Security

All exchanges MUST use TLS, as {{I-D.httpauth-payment}} requires. The
server's connection to its node carries the evidence on which payment
decisions rest, and MUST also use TLS for any non-loopback node.

## Replay

A block hash is public and permanent. Two stores together prevent it
being used twice: the challenge record stops one challenge being
answered twice, and the consumed-hash store stops one block answering
two challenges ([](#single-use)). The binding ([](#binding)) stops a
block that was never meant for a challenge from answering it at all.
A server that weakens any of the three -- by keying on non-canonical
hash text, by pruning consumed hashes while a matching challenge could
still be issued, or by reusing a recipient address or an amount --
reopens replay.

## Double-Spending

A Nano account can only spend from its own chain, and the network
confirms at most one block for each position in that chain. A payer
can therefore attempt a double spend only before confirmation, by
publishing two conflicting blocks. Requiring `confirmed` to be
`"true"` ([](#finality)) removes this: after confirmation the block
is cemented and no competing block can replace it. A server that
returns a receipt for an unconfirmed block accepts that risk in full.

## Node Trust {#node-trust}

The server's view of confirmation comes from the node it queries. A
public RPC provider is a third party that can be wrong, compromised or
malicious, and a node that reports a fabricated block as confirmed
defeats every other check. Servers SHOULD query a node they operate,
or SHOULD require agreement from more than one independent node, and
SHOULD perform the hash and signature checks in [](#verification) when
relying on a node they do not control.

## Representatives Are Irrelevant

Every state block names a representative, the account to which the
payer delegates voting weight. The representative has no effect on
the amount, the recipient or the finality of a send, and cannot
redirect or reclaim funds. Servers MUST NOT require or reject any
particular `representative` value, and MUST NOT treat a change of
representative as a payment.

## Amount Precision

Raw amounts exceed the range of 64-bit integers and of IEEE-754
doubles ([](#encoding)). An implementation that converts raw to a
floating-point XNO figure will round silently, and in `amount`
binding mode a rounding of even one raw is a failed payment.
Implementations MUST use exact integer arithmetic throughout.

## Front-Running a Payment

A send is visible on the network before its payer presents it. An
observer can present the hash first. In `address` mode this gains
nothing unless the observer also holds the challenge that named that
address, which was only ever sent to the payer; in `amount` mode the
same holds for the unique amount. A server that issues challenges
without either binding has no defence against this, which is why one
of the two is REQUIRED.

## Unique Amounts Are Visible

In `amount` mode the unique suffix links a payment on the public
ledger to a specific challenge, and to the server that issued it,
to anyone who sees both. Servers concerned about this SHOULD use
`address` mode, where the link exists only for the server.

## The Challenge Must Match the Resource {#resource-match}

A verifier reads what to expect from the challenge the credential
carries. A server MUST confirm that the `amount`, `recipient`,
`network` and `binding` it is about to verify are those the requested
resource charges, and MUST refuse the credential otherwise. Without
this, a server offering more than one priced resource accepts a
challenge minted for the cheaper one against the more expensive one.

## Display Fields

`description` and `externalId` travel through the challenge and are
attacker-influenced. They MUST NOT participate in any authorization
decision and MUST be treated as untrusted input when rendered.

# IANA Considerations

## Payment Method Registration

This document requests registration of the following entry in the
"HTTP Payment Methods" registry established by
{{I-D.httpauth-payment}}:

| Method Identifier | Description | Reference |
|---|---|---|
| `nano` | Nano (XNO) send blocks on the Nano block-lattice | This document |

Contact: dhyabi2 (<dhyabi2@users.noreply.github.com>)

## Payment Intent Registration

This document requests registration of the following entry in the
"HTTP Payment Intents" registry established by
{{I-D.httpauth-payment}}:

| Intent | Applicable Methods | Description | Reference |
|---|---|---|---|
| `charge` | `nano` | One-time XNO transfer as a confirmed send block | This document |

## Problem Types

This document registers no problem type URI. Every condition in
[](#errors) is reported with a type {{I-D.httpauth-payment}} already
establishes.

--- back

# Examples

The addresses and block below are illustrative. They are well-formed:
the address checksums are valid and the block hash is the correct
BLAKE2b-256 digest of the block fields shown. They are not taken from
the live network and the signature is elided.

## Challenge

~~~ http
HTTP/1.1 402 Payment Required
WWW-Authenticate: Payment id="Zq3mX7bN1vKcT8yWpR2dLs",
  realm="api.example.com", method="nano", intent="charge",
  request="eyJhbW91bnQiOiIxMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAw...",
  expires="2026-10-10T12:05:00Z"
Cache-Control: no-store
~~~

The `request` parameter decodes to:

~~~ json
{
  "amount": "1000000000000000000000000000",
  "currency": "XNO",
  "methodDetails": {
    "binding": "address",
    "network": "nano:mainnet"
  },
  "recipient":
    "nano_36kmuzhss55gmjo9gc4c134gykk16k44jxzqk5kh5r4917gybfh3f7enradc"
}
~~~

This requests 0.001 XNO (10^27 raw) to an account the server derived
for this challenge alone. The line breaks in the header are for
presentation.

## Send Block

The client publishes this send block from its account and waits for
confirmation. The balance falls from 2.5 XNO to 2.499 XNO; the
difference is the amount sent, and `link` is the recipient's public
key.

~~~ json
{
  "type": "state",
  "account":
    "nano_3c8gam3sqzueg78i6qpmrcbxhpkrazgrdspib3634b8ekcqde44xn8n36wdw",
  "previous":
    "D89F6324A4EB307126DB0888DF4F978B35CCDDB86A0282F2404B4DA946D27599",
  "representative":
    "nano_1c4bdrhag5dh4ra14tbnrcs81pu46thyg14mnaxpuhwgeyf63hc1ijfumuor",
  "balance": "2499000000000000000000000000000",
  "link":
    "9253DFDF9C8C6E9C6A77284A0044EF4A40248428F7F790E4F1E047015DE4B5E1",
  "signature": "...",
  "work": "..."
}
~~~

Its hash is
`AF76DB116540806369252C2FEF3E4368B0180DBB61450DD83041A985AB66802F`.

## Credential

~~~ http
GET /resource HTTP/1.1
Host: api.example.com
Authorization: Payment eyJjaGFsbGVuZ2UiOnsiZXhwaXJlcyI6IjIwMjYt...
~~~

Decoded credential:

~~~ json
{
  "challenge": {
    "expires": "2026-10-10T12:05:00Z",
    "id": "Zq3mX7bN1vKcT8yWpR2dLs",
    "intent": "charge",
    "method": "nano",
    "realm": "api.example.com",
    "request": "eyJhbW91bnQiOiIxMDAwMDAwMDAwMDAwMDAwMDAwMDAw..."
  },
  "payload": {
    "type": "hash",
    "hash":
      "AF76DB116540806369252C2FEF3E4368B0180DBB61450DD83041A985AB66802F"
  },
  "source": "did:pkh:nano:mainnet:nano_3c8gam3sqzueg78i6qpmrcbx..."
}
~~~

## Server Verification

The server's `block_info` query for that hash returns, in part:

~~~ json
{
  "block_account":
    "nano_3c8gam3sqzueg78i6qpmrcbxhpkrazgrdspib3634b8ekcqde44xn8n36wdw",
  "amount": "1000000000000000000000000000",
  "balance": "2499000000000000000000000000000",
  "confirmed": "true",
  "subtype": "send",
  "contents": {
    "type": "state",
    "link_as_account":
      "nano_36kmuzhss55gmjo9gc4c134gykk16k44jxzqk5kh5r4917gybfh3f7enradc"
  }
}
~~~

`subtype` is `send`, `link_as_account` is the challenged recipient,
`amount` is at least the challenged amount, and the block is
confirmed. The server records the challenge and the hash as consumed
and answers:

~~~ http
HTTP/1.1 200 OK
Payment-Receipt: eyJtZXRob2QiOiJuYW5vIiwicmVmZXJlbmNlIjoiQUY3NkRC...
~~~

with the receipt payload:

~~~ json
{
  "method": "nano",
  "reference":
    "AF76DB116540806369252C2FEF3E4368B0180DBB61450DD83041A985AB66802F",
  "status": "success",
  "timestamp": "2026-10-10T12:01:07Z"
}
~~~

## Amount Binding

A server that cannot create an account per challenge keeps one
recipient and makes the amount unique instead:

~~~ json
{
  "amount": "1000000000000000000000004217",
  "currency": "XNO",
  "methodDetails": {
    "binding": "amount",
    "network": "nano:mainnet"
  },
  "recipient":
    "nano_36kmuzhss55gmjo9gc4c134gykk16k44jxzqk5kh5r4917gybfh3f7enradc"
}
~~~

The suffix `4217` raw is negligible in value. Only a send of exactly
1000000000000000000000004217 raw to this recipient satisfies this
challenge.

# Acknowledgements

The verification procedure here follows the Nano `exact` scheme
already implemented in independent x402 facilitators; this document
adapts it to the Payment HTTP Authentication Scheme.
