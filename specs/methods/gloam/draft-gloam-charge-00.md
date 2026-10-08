---
title: Gloam Charge Intent for HTTP Payment Authentication
abbrev: Gloam Charge
docname: draft-gloam-charge-00
version: 00
category: info
ipr: noModificationTrust200902
submissiontype: independent
consensus: false

author:
  - name: Duke
    ins: Duke
    email: hello@gloam.trade
    org: Gloam

normative:
  RFC2104:
  RFC2119:
  RFC3339:
  RFC4648:
  RFC5480:
  RFC5869:
  RFC6234:
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
  SEC1:
    title: "SEC 1: Elliptic Curve Cryptography, Version 2.0"
    target: https://www.secg.org/sec1-v2.pdf
    author:
      - org: Standards for Efficient Cryptography Group
    date: 2009-05
  SP800-38D:
    title: >
      Recommendation for Block Cipher Modes of Operation:
      Galois/Counter Mode (GCM) and GMAC
    target: https://doi.org/10.6028/NIST.SP.800-38D
    author:
      - org: NIST
    date: 2007-11
  CIRCOMLIB-POSEIDON:
    title: "circomlib Poseidon hash (circuit and constants)"
    target: >
      https://github.com/iden3/circomlib/blob/master/circuits/poseidon.circom
    author:
      - org: iden3
  GLOAM-POOL:
    title: "ShieldPoolPoseidon: the Gloam shielded pool contract"
    target: >
      https://github.com/cryptoduke01/gloam/blob/main/contracts/src/ShieldPoolPoseidon.sol
    author:
      - org: Gloam
    date: 2026

informative:
  POSEIDON:
    title: >
      Poseidon: A New Hash Function for Zero-Knowledge Proof Systems
    target: https://eprint.iacr.org/2019/458
    author:
      - name: Lorenzo Grassi
      - name: Dmitry Khovratovich
      - name: Christian Rechberger
      - name: Arnab Roy
      - name: Markus Schofnegger
    date: 2019
  GROTH16:
    title: "On the Size of Pairing-based Non-interactive Arguments"
    target: https://eprint.iacr.org/2016/260
    author:
      - name: Jens Groth
    date: 2016
  TIP-20:
    title: "TIP-20 Token Standard"
    target: https://docs.tempo.xyz/protocol/tip20/spec
    author:
      - org: Tempo Labs
  TIP-403:
    title: "TIP-403 Transfer Policies"
    target: https://docs.tempo.xyz/protocol/tip403/spec
    author:
      - org: Tempo Labs
  OFAC-SDN:
    title: "Specially Designated Nationals and Blocked Persons List"
    target: https://sanctionssearch.ofac.treas.gov/
    author:
      - org: U.S. Department of the Treasury, OFAC
  GLOAM-SDK:
    title: "@gloamtrade/sdk"
    target: https://www.npmjs.com/package/@gloamtrade/sdk
    author:
      - org: Gloam
    date: 2026
  GLOAM-MPPX:
    title: "@gloamtrade/mppx-gloam"
    target: https://www.npmjs.com/package/@gloamtrade/mppx-gloam
    author:
      - org: Gloam
    date: 2026
  GLOAM-MCP:
    title: "@gloamtrade/mcp"
    target: https://www.npmjs.com/package/@gloamtrade/mcp
    author:
      - org: Gloam
    date: 2026
---

--- abstract

This document defines the "charge" intent for the "gloam" payment
method within the Payment HTTP Authentication Scheme. A gloam charge
is paid with a private transfer inside a Gloam shielded pool on an
EVM chain such as Tempo. The payment note travels to the server
sealed to a public key the payee publishes, and the server moves it
into a note only it knows before it serves the resource.

A chain observer sees a shielded transfer and nothing else: not the
amount, not the asset, not the payer, and not the payee. Two
submission modes are defined: the payer broadcasts its own transfer
and presents the transaction hash, or the payer presents the proven
transfer and the server submits it.

--- middle

# Introduction

Payment methods that settle on a public ledger publish every charge:
the amount, the sender and the recipient of each token transfer are
visible to anyone. For an agent that pays per request, that ledger is
a complete record of which services it uses, how often and at what
price. For a service, it publishes its revenue and its customers.

The "gloam" method settles a charge through a Gloam shielded pool
{{GLOAM-POOL}}: a contract that holds deposits as notes. A note is a
commitment to a secret, an amount and an asset. Spending a note
reveals only its nullifier, and a zero-knowledge proof {{GROTH16}}
shows that the spend is valid. A private transfer spends one note and
creates two, a payment note and a change note, and the pool emits

~~~
Transferred(bytes32 indexed nullifier, bytes32[2] newCommitments)
~~~

and nothing else. The amount and the asset stay inside the
commitments.

A gloam charge works as follows. The payer builds a private transfer
of exactly the requested amount and asset from a note it holds. It
seals the payment note to the payee's receive tag, a public key the
server publishes in the challenge, so that only the payee can open
it. The server opens it and checks that it binds the requested amount
and asset, that it is the payment output of a transfer in the
official pool, and that the credential is bound to this challenge.
Then it sweeps the payment note into a fresh note whose secret only
the server knows, and serves the resource only after that sweep
confirms. The sweep is required: the payer created the payment note,
so the payer also knows its secret and could spend it back until the
payee moves it.

Two submission modes are defined:

- `push`: the payer broadcasts its transfer, from its own account or
  through a relay, and presents the transaction hash.
- `pull`: the payer presents the proven transfer and the server
  submits it. The payer needs no gas, its account never appears on
  chain, and nothing moves unless the server takes the payment.

## Push Mode {#push-mode}

~~~
   Client                     Server                  Gloam pool
      |                          |                          |
      | (1) GET /resource        |                          |
      |------------------------->|                          |
      | (2) 402 Payment Required |                          |
      |     method="gloam"       |                          |
      |<-------------------------|                          |
      | (3) prove transfer,      |                          |
      |     seal payment note    |                          |
      | (4) transfer(...)        |                          |
      |---------------------------------------------------->|
      | (5) Authorization:       |                          |
      |     Payment (hash)       |                          |
      |------------------------->|                          |
      |                          | (6) open ticket, read    |
      |                          |     Transferred event    |
      |                          | (7) sweep to fresh note  |
      |                          |------------------------->|
      |                          | (8) sweep confirmed      |
      |                          |<-------------------------|
      | (9) 200 OK               |                          |
      |     Payment-Receipt      |                          |
      |<-------------------------|                          |
~~~

## Pull Mode {#pull-mode}

~~~
   Client                     Server                  Gloam pool
      |                          |                          |
      | (1)-(2) as in push mode  |                          |
      | (3) prove transfer,      |                          |
      |     seal payment note    |                          |
      | (4) Authorization:       |                          |
      |     Payment (transfer)   |                          |
      |------------------------->|                          |
      |                          | (5) check, submit the    |
      |                          |     payer's transfer     |
      |                          |------------------------->|
      |                          | (6) sweep to fresh note  |
      |                          |------------------------->|
      |                          | (7) sweep confirmed      |
      |                          |<-------------------------|
      | (8) 200 OK + Receipt     |                          |
      |<-------------------------|                          |
~~~

## Relationship to the Charge Intent

This document implements the "charge" intent
{{I-D.payment-intent-charge}} for the "gloam" method. Fields defined
there keep their meaning. Settlement is deferred: a credential that
passes verification is not final until the server's sweep confirms
on chain ({{finality}}).

# Requirements Language

{::boilerplate bcp14-tagged}

# Terminology

Shielded Pool
: A Gloam pool contract {{GLOAM-POOL}}. It keeps a Merkle tree of
  note commitments and a set of spent nullifiers, and holds the
  tokens that back the notes.

Note
: A value held in the pool: a secret, an amount and an asset. Whoever
  knows the secret can spend the note.

Private Transfer
: A pool call `transfer(proof, root, nullifier, newCommitments)` that
  spends one note and creates two ({{pool}}).

Payment Note
: `newCommitments[0]` of the payer's private transfer: a note for
  exactly the charged amount and asset.

Change Note
: `newCommitments[1]` of the payer's private transfer: the rest of
  the payer's note, kept by the payer.

Receive Tag
: A payee's public identifier, an encoded P-256 public key
  ({{receive-tag}}). The matching private key is the Receive Key.

Ticket
: A note package sealed to a receive tag ({{ticket}}).

Sweep
: A private transfer by the payee that spends the payment note into
  a fresh note only the payee knows ({{sweep}}).

Public Edge
: A deposit into the pool or a withdrawal out of it. These are the
  only operations where tokens move between the pool and a public
  address.

# Method Identifier

This specification registers the payment method identifier:

~~~
gloam
~~~

The identifier is case-sensitive and lowercase. It names the pool
design, not a chain or an asset: the chain and the asset of a charge
are carried in the request.

# Encoding Conventions {#encoding}

Amounts:
: Base units of the asset as a base-10 integer string with no sign,
  decimal point, exponent or leading zeros, for example `"10000"`.
  Implementations MUST compare amounts as exact integers.

Addresses:
: `0x` followed by 40 hexadecimal digits. Addresses are compared by
  their 20-byte value, not by string form, so a checksummed and a
  lowercase spelling of one address are equal.

32-byte values:
: Transaction hashes, Merkle roots, nullifiers and commitments are
  `0x` followed by 64 hexadecimal digits. They are compared by value.
  Where this document hashes or keys on such a value, it uses the
  lowercase spelling.

base64url:
: {{RFC4648}} base64url without padding.

# Request Schema {#request-schema}

The `request` parameter is base64url-encoded JSON {{RFC8259}},
serialized with JSON Canonicalization Scheme {{RFC8785}} before
encoding, per {{I-D.httpauth-payment}}.

## Shared Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `amount` | string | REQUIRED | Amount in base units, greater than zero |
| `currency` | string | REQUIRED | Token address of the asset; the zero address is the chain's native unit |
| `recipient` | string | REQUIRED | The payee's receive tag ({{receive-tag}}) |
| `description` | string | OPTIONAL | Human-readable payment description |
| `externalId` | string | OPTIONAL | Merchant reference, echoed in the receipt |

`recipient` is REQUIRED for this method. It is not a ledger address:
nothing is ever sent to it on chain. It is the key the payment note
is sealed to, and the server MUST be able to open what is sealed to
it.

Challenge expiry is conveyed by the `expires` auth-param per
{{I-D.httpauth-payment}}. A push payment is proved and confirmed
before it is presented, so servers SHOULD give gloam challenges at
least 5 minutes; 10 minutes is RECOMMENDED.

## Method Details

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `methodDetails.chainId` | number | REQUIRED | Chain the pool is deployed on |
| `methodDetails.pool` | string | REQUIRED | Address of the shielded pool the transfer settles through |
| `methodDetails.decimals` | number | OPTIONAL | Decimals of `currency`, for display only |
| `methodDetails.supportedModes` | array | OPTIONAL | `"push"` and/or `"pull"` ({{modes}}) |
| `methodDetails.version` | number | OPTIONAL | Method version; absent means 1 |

This document defines version 1. Clients and servers MUST reject a
request whose `version` they do not implement.

## Submission Modes {#modes}

If `supportedModes` is present, it MUST be a non-empty array whose
values are `"push"` or `"pull"`, and clients MUST use a listed mode.
If it is absent, both modes are accepted. A server that accepts only
one mode for a challenge MUST list that mode.

Pull mode corresponds to the `type="transfer"` payload
({{transfer-payload}}); push mode to the `type="hash"` payload
({{hash-payload}}).

## Official Pools {#official-pools}

The pool is the one party in a gloam charge that both sides rely on:
it holds the value and enforces the rules. Clients and servers MUST
accept only the official Gloam pool for `chainId`, and MUST refuse a
challenge or credential that names any other address, whatever else
it says. At the time of writing the official pools are:

| Chain | chainId | Pool |
|-------|---------|------|
| Tempo Moderato (testnet) | 42431 | `0x841DC046Ea3CC842BA3A855731472c6Eb0F2d5eb` |
| Robinhood Chain (testnet) | 46630 | `0x72406D9597807A46f730d8b4fDBC5aC45Dc1d740` |

Implementations SHOULD take this list from the Gloam SDK
{{GLOAM-SDK}} rather than from the challenge. A server that runs its
own pool deployment MAY configure its own list, and its clients then
need the same list.

## Example

~~~json
{
  "amount": "10000",
  "currency": "0x20c0000000000000000000000000000000000000",
  "methodDetails": {
    "chainId": 42431,
    "decimals": 6,
    "pool": "0x841DC046Ea3CC842BA3A855731472c6Eb0F2d5eb"
  },
  "recipient": "gloamr1.MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEAh..."
}
~~~

This asks for 0.01 PathUSD (10000 base units) on Tempo Moderato,
sealed to the given receive tag (abbreviated here; see
{{tv-receive-tag}}), settled through the Tempo pool, in either mode.

# Notes, Tags and Tickets {#formats}

## Notes {#notes}

A note is a secret `s`, an amount `v` and an asset `a`, all elements
of the scalar field of the BN254 curve, of prime order

~~~
p = 0x30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f0000001
~~~

The asset is its 20-byte address read as an unsigned integer; the
native unit is the zero address. Amounts MUST be less than 2^128;
the pool's circuits enforce this bound.

~~~
commitment = Poseidon(s, v, a)
nullifier  = Poseidon(s, commitment)
~~~

Poseidon is the circomlib instance over BN254 {{CIRCOMLIB-POSEIDON}}
{{POSEIDON}}: S-box x^5, 8 full rounds, and 57 partial rounds for
two inputs or 56 for three. Commitments and nullifiers are written
as 32-byte big-endian values ({{encoding}}).

A payment note's secret MUST be fresh and drawn from a
cryptographically secure random source, with at least 248 bits of
entropy, and MUST be less than the field order.

## The Pool {#pool}

The pool exposes

~~~
transfer(bytes proof, bytes32 root, bytes32 nullifier,
         bytes32[2] newCommitments)
~~~

`proof` is a Groth16 proof {{GROTH16}} that the spent note is a leaf
of the tree under `root`, that `nullifier` is its nullifier, and that
the two new commitments hold the same asset and together the same
amount. The pool reverts if the proof does not verify, if `root` is
not a root the tree has had, if `nullifier` is already spent, or if a
new commitment is zero or already present. On success it marks the
nullifier spent, inserts both commitments and emits `Transferred`.
Every root the tree has had stays valid.

The pool does not check who submits a transfer: the proof is the
authorization. Anyone holding a proven transfer can submit it.

`Transferred` has topic0
`keccak256("Transferred(bytes32,bytes32[2])")`, the nullifier as
topic1, and the two commitments as 64 bytes of log data.

The pool also exposes `isSpent(bytes32 nullifier)` and
`commitmentSeen(bytes32 commitment)`, which this document uses for
verification and settlement.

## Receive Tag {#receive-tag}

~~~
receive-tag = "gloamr1." base64url( SPKI )
~~~

`SPKI` is the DER SubjectPublicKeyInfo {{RFC5480}} of a P-256
(secp256r1) public key with an uncompressed point: 91 bytes beginning
with `3059301306072a8648ce3d020106082a8648ce3d03010703420004`.
Implementations MUST reject a tag that does not decode to such a key.

## Note Package {#note-package}

A note package carries a spendable note. It is `gloam1.` followed by
the base64url encoding of the UTF-8 JSON object:

| Key | Value |
|-----|-------|
| `v` | `1` |
| `t` | `"gloam-private-note"` |
| `s` | `"poseidon"` |
| `p` | Pool address |
| `a` | Asset address |
| `w` | Amount in base units, decimal string |
| `k` | Note secret, 32-byte hex ({{encoding}}) |
| `c` | Note commitment, 32-byte hex |

Senders MUST include every key. Receivers MUST ignore unknown keys.
Anyone who reads a note package can spend the note, so a gloam
credential never carries one unsealed.

## Ticket {#ticket}

The ticket carries the payment note package to the payee and to no
one else. To seal a package to a receive tag:

1. Generate an ephemeral P-256 key pair {{SEC1}}.
2. Compute the ECDH shared secret between the ephemeral private key
   and the tag's public key: the 32-byte x-coordinate of the shared
   point.
3. Derive a 32-byte key with HKDF-SHA256 {{RFC5869}}, an empty salt
   and info `"gloam-pay-to-tag-v1"`.
4. Encrypt the package with AES-256-GCM {{SP800-38D}} under that key
   with a random 12-byte IV and no additional data.
5. The ticket is `gloam2t.` followed by the base64url encoding of the
   ephemeral SPKI length as 2 bytes big-endian, the ephemeral SPKI
   (as in {{receive-tag}}), the IV, and the ciphertext followed by
   its 16-byte tag.

The payee opens a ticket by reversing these steps with its receive
key. A ticket that does not decrypt was sealed to another tag or is
corrupt. The same format is used by Gloam wallets to hand notes
between people, so a payee can open a ticket in any of them.

# Credential Schema

The credential is a base64url-encoded JSON object per
{{I-D.httpauth-payment}}, sent in the field the challenge selects.

## Credential Structure

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `challenge` | object | REQUIRED | Echo of the challenge |
| `payload` | object | REQUIRED | Gloam payload, below |
| `source` | string | OPTIONAL | Payer identifier |

A gloam payment is unlinkable to the payer by design, and `source`
would undo that. Clients SHOULD omit `source`. Servers MUST NOT
require it and MUST NOT use it in verification.

## Common Payload Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `type` | string | REQUIRED | `"hash"` (push) or `"transfer"` (pull) |
| `ticket` | string | REQUIRED | The payment note package sealed to `recipient` ({{ticket}}) |
| `binding` | string | REQUIRED | Challenge binding ({{binding}}), 43 base64url characters |

A `ticket` that does not begin with `gloam2t.` does not match this
schema: clients MUST NOT send an unsealed note package, and servers
MUST reject one.

## Challenge Binding {#binding}

Anyone can seal a ticket to a receive tag, so a ticket alone does not
show which challenge it pays. The binding ties the credential to one
challenge with a key that only the payer and the payee know:

~~~
K       = payment note secret, 32 bytes big-endian
M       = JCS(["gloam-mpp-charge-v1", realm, id, commitment])
binding = base64url(HMAC-SHA256(K, M))
~~~

`realm` and `id` are those of the challenge. `commitment` is the
payment note's commitment in lowercase hex. HMAC is {{RFC2104}} with
SHA-256 {{RFC6234}}. JCS is {{RFC8785}}, which for this array of
strings is compact JSON with no whitespace. `M` is encoded as UTF-8.

Someone who lifts a credential off the wire cannot open the ticket,
so cannot learn `K`, so cannot present the payment against another
challenge, such as a second request at the same price.

## Hash Payload (type="hash") {#hash-payload}

Push mode. The payer has broadcast its private transfer.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `hash` | string | REQUIRED | Transaction hash of the payer's transfer, 32-byte hex |

~~~json
{
  "binding": "okE_ImIypvMO5Y-2C6wrxBywrgyxHVuclMkPsyhnW3Q",
  "hash": "0x1a2b1a2b1a2b1a2b1a2b1a2b1a2b1a2b1a2b1a2b1a2b1a2b1a2b1a2b1a2b1a2b",
  "ticket": "gloam2t.AFswWTATBgcqhkjOPQIBBggqhkjOPQMBBwNCAATWWpOX...",
  "type": "hash"
}
~~~

## Transfer Payload (type="transfer") {#transfer-payload}

Pull mode. The payer presents its proven transfer for the server to
submit.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `transfer.proof` | string | REQUIRED | Groth16 proof, hex |
| `transfer.root` | string | REQUIRED | Merkle root the proof is against, 32-byte hex |
| `transfer.nullifier` | string | REQUIRED | Nullifier of the payer's spent note, 32-byte hex |
| `transfer.newCommitments` | array | REQUIRED | `[payment, change]`, two 32-byte hex values |

`transfer.proof` is the proof as the pool's verifier takes it: the
ABI encoding of `(uint256[2] a, uint256[2][2] b, uint256[2] c)`, 256
bytes, with the G2 point `b` in the coordinate order of the EVM
pairing precompile.

~~~json
{
  "binding": "okE_ImIypvMO5Y-2C6wrxBywrgyxHVuclMkPsyhnW3Q",
  "ticket": "gloam2t.AFswWTATBgcqhkjOPQIBBggqhkjOPQMBBwNCAATWWpOX...",
  "transfer": {
    "newCommitments": [
      "0x150f538a1efa456a819a643632fba98d789bde200d5f10a3ac643aa1aeb0d2ad",
      "0x0329a42dc1b651cf0cd345375aac23a55912735fdc6124f0511742ec9864559a"
    ],
    "nullifier": "0x08ca17d842003229b66ec0aa65b43adcfd6e69be3f97779591987d78dff0119e",
    "proof": "0x2a9f...",
    "root": "0x07240c8cd5f1f6c24e5fac72c6ff90d2f8140867ce895ca448cab01c1040498c"
  },
  "type": "transfer"
}
~~~

# Client Procedure {#client-procedure}

To pay a gloam charge, a client:

1. MUST check that `method` is `"gloam"`, `intent` is `"charge"`, the
   challenge has not expired, and the request parses as above.
2. MUST check `methodDetails.pool` against the official pool for
   `methodDetails.chainId` ({{official-pools}}) and refuse otherwise.
3. MUST check `amount`, `currency` and `recipient` against its own
   policy before proving anything, as the amount verification rules
   of {{I-D.httpauth-payment}} require. It MUST NOT rely on
   `description` or `methodDetails.decimals` for that decision.
4. Chooses a mode the challenge allows ({{modes}}). Pull is
   RECOMMENDED when offered: the client needs no gas, its account does
   not appear on chain, and if the server refuses, nothing has moved.
5. Builds a private transfer from a note it holds that covers the
   amount, with the payment note for exactly `amount` of `currency`
   under a fresh secret ({{notes}}), and the rest as change.
6. SHOULD persist the change note before anything is submitted or
   sent. It is the client's remaining balance.
7. Seals the payment note package to `recipient` ({{ticket}}) and
   computes the binding ({{binding}}).
8. In push mode, broadcasts the transfer, SHOULD wait for it to
   succeed, and presents `type="hash"`. Clients SHOULD NOT start a
   push payment with less than 30 seconds left before `expires`,
   since the value moves before the credential is presented. In pull
   mode, presents `type="transfer"` without broadcasting.
9. Sends the credential in the field the challenge selects:
   `Authorization`, or `Payment-Authorization` when the challenge
   carries the `header` parameter.

A client that receives a 402 with `Retry-After` after presenting a
credential SHOULD present the same credential again before it pays a
fresh challenge. Its first payment may still settle, and paying again
would pay twice.

# Verification Procedure {#verification}

A server verifying a gloam credential MUST, before granting access:

1. Verify that the challenge `id` was issued by it for exactly the
   echoed parameters, as the challenge binding of
   {{I-D.httpauth-payment}} requires, that the challenge has not
   expired, that the credential arrived in the field the challenge
   selected, and that the challenge's terms are the price of the
   resource requested ({{resource-match}}).
2. Parse the request. Reject unless `methodDetails.pool` is the
   official pool for `methodDetails.chainId` ({{official-pools}}).
3. Reject unless `recipient` is its own receive tag.
4. Parse the payload. Reject a `type` that the challenge's
   `supportedModes` or the server's own policy does not allow.
5. Open the ticket with its receive key ({{ticket}}). Reject a ticket
   that does not open.
6. Reject unless the package's pool is the request's pool, its asset
   equals `currency`, and its amount equals `amount`.
7. Reject unless the package's commitment equals
   `Poseidon(secret, amount, asset)` ({{notes}}). Without this check
   a payer could present a real leaf minted for a smaller amount
   under a larger claimed amount.
8. Recompute the binding ({{binding}}) and reject on mismatch, using
   a constant-time comparison.
9. Compute the payment note's nullifier. Reject if the server has
   already settled a payment with this nullifier, or if another
   payment has already settled this challenge (`invalid-challenge`).
   Reject if the pool reports the nullifier spent and the server has
   no record of spending it itself: the payer took it back, or another
   server took it.
10. In push mode, fetch the receipt of `hash`. If it is not mined yet,
    answer 402 with `Retry-After`. Reject unless it succeeded and
    contains a `Transferred` log emitted by the pool address whose
    `newCommitments[0]` is the payment note's commitment. Logs from
    any other address MUST be ignored.
11. In pull mode, reject unless `transfer.newCommitments[0]` is the
    payment note's commitment. If the payment note is not in the pool
    yet, reject when `transfer.nullifier` is already spent: the
    funding note was spent elsewhere, so the transfer cannot land.

These steps are read-only. Passing them does not make a payment
final.

# Settlement Procedure

## Pull Submission

In pull mode the server submits the payer's transfer, from its own
account or through a relay, unless the payment note is already in
the pool. If the transfer does not succeed and the payment note is
not in the pool, the server MUST reject: nothing was paid.

## Sweep {#sweep}

The server then sweeps: a private transfer that spends the payment
note into a fresh note of the whole amount and a zero-value change
note, both under secrets only the server knows. The server needs the
payment note's Merkle path, which it rebuilds from the pool's
insertion events.

The server SHOULD persist the fresh note before it submits the sweep.
Its secret is now the money, and a crash after submission would
otherwise lose it.

## Finality {#finality}

| State | Final | Grant access |
|-------|-------|--------------|
| Verified ({{verification}}) | No | No |
| Sweep submitted, not confirmed | No | No |
| Sweep confirmed | Yes | Yes |

Until the sweep confirms, the payer can spend the payment note
itself. If it does, the sweep cannot land, because the nullifier is
spent, and the server MUST NOT grant access. Once the sweep confirms
the payment note's nullifier is spent by the server, and the value
sits in a note only the server can spend.

## Failure Handling {#failure-handling}

- Payment note spent by someone else before the sweep: reject with
  `verification-failed`. The value is not the server's.
- Push transfer not mined yet, or sweep sent but not confirmed:
  answer 402 with `Retry-After`. The server SHOULD remember a sent
  sweep, so that a retry of the same credential is served once the
  fresh note appears in the pool, instead of being rejected as
  already spent.
- Sweep reverted and the nullifier still unspent: nothing moved. The
  server MAY retry the sweep.

## Receipt Generation {#receipt}

On success the server returns `Payment-Receipt` per
{{I-D.httpauth-payment}} with:

| Field | Type | Description |
|-------|------|-------------|
| `method` | string | `"gloam"` |
| `reference` | string | Transaction hash of the sweep |
| `status` | string | `"success"` |
| `timestamp` | string | {{RFC3339}} settlement time |
| `challengeId` | string | The challenge `id` |
| `chainId` | number | Chain the payment settled on |
| `externalId` | string | OPTIONAL. Echoed from the request |

Servers SHOULD set `reference` to the sweep's transaction hash. A
server that confirms a remembered sweep by finding its fresh note in
the pool, without having recorded the sweep's hash, MAY use another
identifier of the settlement, such as the payer's transfer hash.
Servers MUST NOT include `Payment-Receipt` on error responses.

The payer can already find the sweep by watching for its payment
note's nullifier, so the receipt tells it nothing new.

# Replay Protection {#replay-protection}

The replay token is the payment note's nullifier. The sweep spends it
on chain, and the pool accepts each nullifier once, so one payment
note can settle exactly one access. Servers:

- MUST check it (step 9 of {{verification}}) and record it as consumed
  when a sweep confirms;
- MUST make the claim on a nullifier atomic, with a create-if-absent
  operation on a store shared by every instance that settles for the
  realm, so that concurrent requests with the same credential produce
  at most one sweep and one delivery;
- rely on the binding ({{binding}}) to keep a credential from being
  presented against a different challenge.

The challenge `id` is single use, as the charge intent requires. A
server MUST record a challenge as consumed when a payment for it
settles, and MUST reject a different payment presented for the same
`id` with `invalid-challenge` before sweeping it, so that the second
payer's value is not taken. The claim on a challenge MUST be atomic,
like the claim on a nullifier.

# Error Responses {#errors}

Rejections are 402 responses with a fresh challenge and Problem
Details {{RFC9457}}, using the problem types of
{{I-D.httpauth-payment}}:

| Condition | Problem type |
|-----------|--------------|
| No credential | `payment-required` |
| Credential is not base64url JSON of the right shape | `malformed-credential` |
| Challenge not issued by this server, for another resource, or already used by another payment | `invalid-challenge` |
| Challenge expired | `payment-expired` |
| Payload does not match this schema | `invalid-payload` |
| Any other check of {{verification}} fails | `verification-failed` |
| Transfer not mined, or sweep not confirmed (with `Retry-After`) | `verification-failed` |

A server MUST NOT disclose in an error whether a payment note or a
challenge was used by a different caller.

# Security Considerations

## Transport Security

All communication MUST use TLS 1.2 or later per
{{I-D.httpauth-payment}}. A gloam credential is a bearer token:
whoever holds it can present it. Servers and intermediaries MUST NOT
log credentials.

## Why the Sweep Is Mandatory

The payer generates the payment note's secret. A server that served
after verification without sweeping would serve a payment the payer
can still spend back. Servers MUST NOT grant access before the sweep
confirms ({{finality}}).

## Replay

Each payment note settles at most one access, and each challenge at
most one payment. {{replay-protection}} gives the mechanism and the
atomicity it needs.

## Credential Theft

The ticket is encrypted to the receive tag, so a stolen credential
does not reveal the note. It can still be presented, once, against
the challenge it is bound to; it cannot be presented against any
other challenge ({{binding}}).

## Amount and Asset Binding

The amount and asset in a ticket are only claims until step 7 of
{{verification}} checks them against the commitment, and step 10 or
11 ties that commitment to the pool. Skipping either lets a payer pay
less than the price.

## Pool and Event Substitution

A malicious server could name a contract it controls as the pool,
and a malicious client could point to a transaction whose logs come
from such a contract. Both are closed by accepting only the official
pool ({{official-pools}}) and only logs emitted by its address.

## The Challenge Must Match the Resource {#resource-match}

A verifier reads what to expect from the challenge the credential
echoes. That is sound only while the challenge is known to be the one
the requested resource issues. A server that prices more than one
resource under one challenge-binding key MUST confirm that the echoed
`amount`, `currency`, `recipient`, `chainId` and `pool` are the terms
of the resource requested, and MUST refuse the credential otherwise.

## Display Fields

`description`, `externalId` and `methodDetails.decimals` are
informational. They MUST NOT take part in any payment decision, and
anything that renders them MUST treat them as untrusted input.

## Pull Mode Exposure

A transfer payload is a complete, submittable call. The pool does not
check the submitter, and every root the tree has had stays valid, so
a server that refuses a pull credential, or anyone who sees one,
could submit it later and move the payment note into the pool. That
note is sealed to the payee, so the payee, not the observer, could
then sweep it. A client whose pull credential is refused SHOULD spend
the funding note again soon, for example with its next payment, which
spends the nullifier and voids the old transfer.

## Push Mode and Expiry

In push mode the value moves before the credential is presented. A
credential that arrives after `expires` is rejected while the payment
note sits sealed to the payee. Servers SHOULD issue generous expiry
windows and clients SHOULD keep a margin ({{client-procedure}}). A
client MAY keep the payment note's secret so that it can reclaim a
payment the payee never swept.

## Server Keys

The receive key opens every ticket sealed to the server, and fresh
notes are the server's balance. Both MUST be kept server side, with
the care given to an account's signing key, and MUST NOT appear in
logs, errors or analytics.

## Chain Access

Verification and settlement rest on what the server's chain
connection reports: receipts, spent nullifiers and inserted
commitments. Servers SHOULD use a node they trust over TLS, and MUST
NOT grant access on a sweep that their node has not reported as
confirmed.

## Denial of Service

Verification costs an ECDH, an AES-GCM decryption, Poseidon hashes
and chain reads. Settlement costs a proof and a transaction, and pull
mode also pays for the payer's transfer. Servers SHOULD rate limit
credential verification, SHOULD run the local checks of
{{verification}} before any chain read, and MAY offer only push mode
to unauthenticated clients.

## Proving Keys

The pool's Groth16 verifiers rely on a trusted setup. The deployments
listed in {{official-pools}} are testnets with development keys. A
production deployment needs a multi-party setup ceremony, and a
setup compromise would allow forged spends.

## Issuer Controls and Compliance {#compliance}

A gloam charge moves no tokens. The payer's transfer and the sweep
are state changes inside the pool: a nullifier is marked spent and
commitments are inserted. Tokens move only at the pool's public
edges, a deposit from a public address into the pool and a withdrawal
from the pool to a public address. Compliance controls apply at those
edges:

- Issuer policies. On Tempo every TIP-20 stablecoin {{TIP-20}} points
  at a TIP-403 transfer policy {{TIP-403}}, and the token checks the
  sender and the recipient of every transfer against it. A deposit is
  a transfer from the depositor to the pool, and a withdrawal is a
  transfer from the pool to the recipient, so the issuer's policy is
  enforced on chain at both edges by the token itself. The value
  behind a charge entered the pool through a deposit that passed the
  policy, and leaves through a withdrawal that must pass it.
- Sanctions screening. The Gloam app and relay screen the public
  addresses at both edges, the depositing account and the withdrawal
  recipient, against the OFAC list of sanctioned digital currency
  addresses {{OFAC-SDN}}, and on Tempo also check the asset's TIP-403
  policy before anything is signed or submitted. The relay refuses to
  submit a withdrawal to a listed address. This screening is a
  property of that software, not of the pool contract; the token's
  own policy check is the on-chain guarantee.
- No operator. The pool has no operator and no viewing key. Its owner
  has no function that moves user funds, and every change to its
  verifiers, prices or asset flows waits behind a public three-day
  timelock. A relay
  submits proven calls but cannot alter them, since the proof is the
  authorization, so the most a relay can do is refuse.

An issuer can pause a token, or change its policy so that the pool
may not send or receive it. That blocks deposits and withdrawals of
that asset for every holder of a note in it, and is outside the
control of this method. Servers SHOULD accept only assets whose
issuers they are prepared to rely on.

# Privacy Considerations

## What the Public Sees

For one gloam charge the chain shows two `Transferred` events, the
payer's transfer and the sweep, each with a nullifier and two
commitments; the accounts that submitted those transactions; and
their timing. It does not show the amount, the asset, the payer's
notes, the payee's notes, or the receive tag.

The public edges are public. A deposit shows the depositing account,
the asset and the amount, and a withdrawal shows the recipient, the
asset and the amount. A charge is hidden among every note in the
pool, across all assets, but an observer can try to link a deposit
to a later withdrawal by amount and timing.

## What the Payee Learns

The server learns the amount and the asset, which it set; the payment
note; and in pull mode the payer's whole transfer call, which becomes
public once submitted anyway. It does not learn the payer's change
amount, its other notes or its balance.

In push mode the server can look up who submitted the payer's
transfer, so it learns the payer's account unless the payer
submitted through a relay. Pull mode avoids this. Network metadata,
such as IP addresses, is outside the scope of this method.

## What the Payer Learns

The payer learns the payee's receive tag, which the challenge
publishes, and the sweep's transaction, which it could find anyway by
watching for its payment note's nullifier. A receive tag is a stable
identifier of the payee, but the challenge's realm already identifies
the server to the payer.

## What Remains Linkable

- A sweep shortly after a payment can be linked to it by timing.
  A server cannot delay its sweep without delaying access, so this
  link is inherent to the method.
- On a new or quiet pool the set of candidate notes is small.
- Submitting accounts, relays and fee payments are visible like any
  other transaction.

## Selective Disclosure {#selective-disclosure}

Privacy here is the holder's default, not a permanent seal. Anyone
who holds a note's secret can prove facts about it to a party of
their choosing, with a zero-knowledge proof bound to that verifier,
a chain, a pool and an expiry, so the proof cannot be passed off as
made for anyone else. The Gloam SDK {{GLOAM-SDK}} and app implement
three such proofs:

- a payment proof: that a given commitment is a real note in the
  pool holding a given asset, worth exactly a shown amount or at
  least a minimum;
- a funds proof: that unspent notes hold at least a threshold of an
  asset;
- a payroll proof: that a set of payments adds up to an exact total,
  without showing any single amount.

Both the payer and the payee know the payment note's secret, so
either can prove the payment to an auditor, an issuer or a
counterparty without revealing anything else they hold. A payment
proof reveals the note's commitment to its verifier, which links it
to the payer's transfer on chain. Nothing is disclosed unless a
holder chooses to.

This differs from operator-visible privacy designs, where a
designated operator sees every transaction: here no party other than
the payer and the payee learns a payment's amount or parties unless
one of them discloses it.

# IANA Considerations

## Payment Method Registration

This document registers the following payment method in the "HTTP
Payment Methods" registry established by {{I-D.httpauth-payment}}:

| Method Identifier | Description | Reference |
|-------------------|-------------|-----------|
| `gloam` | Private transfer through a Gloam shielded pool | This document |

Contact: Duke (<hello@gloam.trade>)

## Payment Intent Registration

This document registers the following payment intent in the "HTTP
Payment Intents" registry established by {{I-D.httpauth-payment}}:

| Intent | Applicable Methods | Description | Reference |
|--------|-------------------|-------------|-----------|
| `charge` | `gloam` | One-time private transfer, swept before access | This document |

## Problem Types

This document registers no problem type. Every condition in
{{errors}} uses a type {{I-D.httpauth-payment}} already defines.

--- back

# ABNF Collected

~~~ abnf
gloam-charge-challenge = "Payment" 1*SP
  "id=" quoted-string ","
  "realm=" quoted-string ","
  "method=" DQUOTE "gloam" DQUOTE ","
  "intent=" DQUOTE "charge" DQUOTE ","
  "request=" base64url-nopad

gloam-charge-credential = "Payment" 1*SP base64url-nopad

receive-tag   = "gloamr1." base64url-nopad
sealed-ticket = "gloam2t." base64url-nopad
note-package  = "gloam1." base64url-nopad

; Base64url encoding without padding per RFC 4648
base64url-nopad = 1*( ALPHA / DIGIT / "-" / "_" )
~~~

# Test Vectors

These vectors use fixed keys and a fixed IV so that they are
reproducible. Real implementations MUST use fresh random values. Line
breaks inside values are for presentation only.

## Receive Tag {#tv-receive-tag}

Receive private key (P-256 scalar):

~~~
1111111111111111111111111111111111111111111111111111111111111111
~~~

Receive tag:

~~~
gloamr1.MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEAhfmF_C2RDkoJ4-WmZ5p
ojpPLBUr321s32bluAKC1O0ZSn3ry5dxLS3aPKhaqHZaVvRfx1hZllLyiXxlMG5X
lA
~~~

## Note

~~~
secret
  0x000000000000000000000000000000000000000000000000000000000000002a
amount
  10000
asset
  0x20c0000000000000000000000000000000000000
commitment
  0x150f538a1efa456a819a643632fba98d789bde200d5f10a3ac643aa1aeb0d2ad
nullifier
  0x22f22e88b03048618363bd744ed61dc0f5e9b8456eb82fc8892ae289e5bb4ad9
~~~

Note package for the Tempo pool, JSON:

~~~
{"v":1,"t":"gloam-private-note","s":"poseidon",
"p":"0x841DC046Ea3CC842BA3A855731472c6Eb0F2d5eb",
"a":"0x20c0000000000000000000000000000000000000","w":"10000",
"k":
"0x000000000000000000000000000000000000000000000000000000000000002a",
"c":
"0x150f538a1efa456a819a643632fba98d789bde200d5f10a3ac643aa1aeb0d2ad"}
~~~

The package is `gloam1.` followed by the base64url encoding of that
JSON as one line with no whitespace, keys in the order shown:

~~~
gloam1.eyJ2IjoxLCJ0IjoiZ2xvYW0tcHJpdmF0ZS1ub3RlIiwicyI6InBvc2VpZ
G9uIiwicCI6IjB4ODQxREMwNDZFYTNDQzg0MkJBM0E4NTU3MzE0NzJjNkViMEYyZ
DVlYiIsImEiOiIweDIwYzAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwM
DAwMDAiLCJ3IjoiMTAwMDAiLCJrIjoiMHgwMDAwMDAwMDAwMDAwMDAwMDAwMDAwM
DAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDJhIiwiYyI6I
jB4MTUwZjUzOGExZWZhNDU2YTgxOWE2NDM2MzJmYmE5OGQ3ODliZGUyMDBkNWYxM
GEzYWM2NDNhYTFhZWIwZDJhZCJ9
~~~

## Sealed Ticket

Sealing the package above to the receive tag above:

~~~
ephemeral private key
  2222222222222222222222222222222222222222222222222222222222222222
ephemeral SPKI
  3059301306072a8648ce3d020106082a8648ce3d03010703420004d65a93977c
  aa3d1b081852ff57a79e465f1660577304baead505dd3a48589cf350185e8953
  72df6221ea3a137557e473fddb6755f05bd507c3c533fce9c91285
ECDH shared secret
  ccfc261f58193c98ca4ad4a53bbac6f0ee29bc4d48438090446908622ca79af6
AES-256-GCM key
  8f422c5dd71f16a15a6939b960f626d986c75113ca6cf7f6a412d6f4a0cd8c2e
IV
  333333333333333333333333
~~~

Ticket:

~~~
gloam2t.AFswWTATBgcqhkjOPQIBBggqhkjOPQMBBwNCAATWWpOXfKo9GwgYUv9X
p55GXxZgV3MEuurVBd06SFic81AYXolTct9iIeo6E3VX5HP922dV8FvVB8PFM_zp
yRKFMzMzMzMzMzMzMzMzH9h3mmqb1-oARK1DrnoCjbHE4f1F6rP9nhAZEEgoVm-V
WJHzD1_TLNR-uy-cLO6il4EvTr3zLgaP7wg29f2_0fy6GxRWP1zwlYc1O6oex09G
wIrv-i-n88f1x2dTWHYcOAYsve7msbm6ISLQmMvd6pUxM1DtzylYhmEDsezrgpCC
oxW87cYW6IIvK9wk5qijXQaeK7nTINWOATyG0Imkny6tIQSoxSzoHSliNe7kU9El
AI_izUsrBiMNg2nM2vA-CMOOF5HSuu7-hoxsPAPRy_gv-cwy6xpxMAXx-LTD6qPd
vo21MLCKiPtOQqmOk17FjroVyVOF4ugIWu_NygsR8sD7l1Wql6DzSULdL55rxBPO
5HylQB4mS3-bkXCR7PHQO9XuKUi5tM15f_H7BB5Xqx475WaoG95qzkMqqKnF3Npm
5Brr7BTBmKECw6tVtB0zH59x72JBabbmoDtWBEEVbu0pbf8XJZauvZiwdO7Kwjjz
5gtDMZXXrBc-vb8mcHpjUFbVGv23I-zRRaI2BNl6-NN4otsHGtdq92QYahaVLqlF
xll9ozj9MZhB1Q
~~~

## Challenge Id

The request of {{request-schema}} with the full receive tag of
{{tv-receive-tag}}, JCS-serialized and base64url-encoded:

~~~
eyJhbW91bnQiOiIxMDAwMCIsImN1cnJlbmN5IjoiMHgyMGMwMDAwMDAwMDAwMDAw
MDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwIiwibWV0aG9kRGV0YWlscyI6eyJjaGFp
bklkIjo0MjQzMSwiZGVjaW1hbHMiOjYsInBvb2wiOiIweDg0MURDMDQ2RWEzQ0M4
NDJCQTNBODU1NzMxNDcyYzZFYjBGMmQ1ZWIifSwicmVjaXBpZW50IjoiZ2xvYW1y
MS5NRmt3RXdZSEtvWkl6ajBDQVFZSUtvWkl6ajBEQVFjRFFnQUVBaGZtRl9DMlJE
a29KNC1XbVo1cG9qcFBMQlVyMzIxczMyYmx1QUtDMU8wWlNuM3J5NWR4TFMzYVBL
aGFxSFphVnZSZngxaFpsbEx5aVh4bE1HNVhsQSJ9
~~~

With the HMAC-SHA256 challenge binding of {{I-D.httpauth-payment}},
the UTF-8 server secret `test-vector-secret`, realm
`api.example.com` and `expires="2026-10-06T12:10:00Z"`, the challenge
`id` is:

~~~
pCNWA4rku1VZVo8fH_pmMnF0LMSe9_auuRCG5itPc44
~~~

## Challenge Binding

For the note and the challenge above:

~~~
K
  000000000000000000000000000000000000000000000000000000000000002a
M
  ["gloam-mpp-charge-v1","api.example.com",
  "pCNWA4rku1VZVo8fH_pmMnF0LMSe9_auuRCG5itPc44",
  "0x150f538a1efa456a819a643632fba98d789bde200d5f10a3ac643aa1aeb0d2ad"]
binding
  okE_ImIypvMO5Y-2C6wrxBywrgyxHVuclMkPsyhnW3Q
~~~

`M` is shown wrapped; the HMAC input is the compact JSON with no
whitespace.

# Full Example

The server answers an unpaid request with the challenge of the test
vectors:

~~~http
HTTP/1.1 402 Payment Required
Cache-Control: no-store
WWW-Authenticate: Payment id="pCNWA4rku1VZVo8fH_pmMnF0LMSe9_auuRCG5itPc44",
  realm="api.example.com",
  method="gloam",
  intent="charge",
  request="eyJhbW91bnQiOiIxMDAwMCIsImN1cnJlbmN5IjoiMHgyMGMwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwIiwibWV0aG9kRGV0YWlscyI6eyJjaGFpbklkIjo0MjQzMSwiZGVjaW1hbHMiOjYsInBvb2wiOiIweDg0MURDMDQ2RWEzQ0M4NDJCQTNBODU1NzMxNDcyYzZFYjBGMmQ1ZWIifSwicmVjaXBpZW50IjoiZ2xvYW1yMS5NRmt3RXdZSEtvWkl6ajBDQVFZSUtvWkl6ajBEQVFjRFFnQUVBaGZtRl9DMlJEa29KNC1XbVo1cG9qcFBMQlVyMzIxczMyYmx1QUtDMU8wWlNuM3J5NWR4TFMzYVBLaGFxSFphVnZSZngxaFpsbEx5aVh4bE1HNVhsQSJ9",
  expires="2026-10-06T12:10:00Z"
~~~

The client pays in pull mode and retries with a credential that
decodes to (proof and ticket abbreviated):

~~~json
{
  "challenge": {
    "expires": "2026-10-06T12:10:00Z",
    "id": "pCNWA4rku1VZVo8fH_pmMnF0LMSe9_auuRCG5itPc44",
    "intent": "charge",
    "method": "gloam",
    "realm": "api.example.com",
    "request": "eyJhbW91bnQiOiIxMDAwMCIs..."
  },
  "payload": {
    "binding": "okE_ImIypvMO5Y-2C6wrxBywrgyxHVuclMkPsyhnW3Q",
    "ticket": "gloam2t.AFswWTATBgcqhkjOPQIBBggqhkjOPQMBBwNCAATWWpOX...",
    "transfer": {
      "newCommitments": [
        "0x150f538a1efa456a819a643632fba98d789bde200d5f10a3ac643aa1aeb0d2ad",
        "0x0329a42dc1b651cf0cd345375aac23a55912735fdc6124f0511742ec9864559a"
      ],
      "nullifier": "0x08ca17d842003229b66ec0aa65b43adcfd6e69be3f97779591987d78dff0119e",
      "proof": "0x2a9f...",
      "root": "0x07240c8cd5f1f6c24e5fac72c6ff90d2f8140867ce895ca448cab01c1040498c"
    },
    "type": "transfer"
  }
}
~~~

A pull credential with a real 256-byte proof is about 3 KB encoded,
and a push credential about 2 KB, within the 4 KB that servers must
accept.

The server submits the transfer, sweeps the payment note, and
answers:

~~~http
HTTP/1.1 200 OK
Cache-Control: private
Payment-Receipt: eyJzdGF0dXMiOiJzdWNjZXNzIiwibWV0aG9kIjoiZ2xvYW0iLCJ0aW1lc3RhbXAiOiIyMDI2LTEwLTA2VDEyOjAwOjAzWiIsInJlZmVyZW5jZSI6IjB4M2MzYzNjM2MzYzNjM2MzYzNjM2MzYzNjM2MzYzNjM2MzYzNjM2MzYzNjM2MzYzNjM2MzYzNjM2MzYzNjM2MzYyIsImNoYWxsZW5nZUlkIjoicENOV0E0cmt1MVZaVm84ZkhfcG1NbkYwTE1TZTlfYXV1UkNHNWl0UGM0NCIsImNoYWluSWQiOjQyNDMxfQ
~~~

The receipt decodes to:

~~~json
{
  "chainId": 42431,
  "challengeId": "pCNWA4rku1VZVo8fH_pmMnF0LMSe9_auuRCG5itPc44",
  "method": "gloam",
  "reference": "0x3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c",
  "status": "success",
  "timestamp": "2026-10-06T12:00:03Z"
}
~~~

# Reference Implementation

A TypeScript implementation is published as `@gloamtrade/mppx-gloam`
{{GLOAM-MPPX}}: an mppx payment method (server and client), a
library-free codec for the Payment scheme, and a Fetch paywall. It
builds on `@gloamtrade/sdk` {{GLOAM-SDK}}, which implements notes,
receive tags, tickets, proving and the sweep. The Gloam MCP server
`@gloamtrade/mcp` {{GLOAM-MCP}} pays and verifies gloam charges for
agents. The test vectors above were generated independently and
checked against these packages.

# Acknowledgements

This method builds on the Payment scheme and the charge intent by
Tempo Labs and Stripe, and follows the structure of the Tempo charge
method.
