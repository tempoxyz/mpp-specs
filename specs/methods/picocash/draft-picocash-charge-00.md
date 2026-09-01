---
title: Picocash charge Intent for HTTP Payment Authentication
abbrev: Picocash Charge
docname: draft-picocash-charge-00
version: 00
category: info
ipr: noModificationTrust200902
submissiontype: IETF
consensus: true

author:
  - name: starbuilder
    ins: starbuilder
    email: arun@flext.energy
    org: picocash

normative:
  RFC2119:
  RFC3339:
  RFC4648:
  RFC8174:
  RFC8259:
  RFC8785:
  I-D.httpauth-payment:
    title: "The 'Payment' HTTP Authentication Scheme"
    target: https://datatracker.ietf.org/doc/draft-ryan-httpauth-payment/
    author:
      - name: Jake Moxey
    date: 2026-01

informative:
  BIP-340:
    title: "Schnorr Signatures for secp256k1"
    target: https://github.com/bitcoin/bips/blob/master/bip-0340.mediawiki
    author:
      - name: Pieter Wuille
    date: 2020-01
  PIP-00:
    title: "picocash Cryptography: Blind Signatures and DLEQ Proofs"
    target: https://github.com/picocash/pips/blob/main/PIP-00.md
    author:
      - org: picocash
    date: 2026-08
  PIP-02:
    title: "picocash Mint API"
    target: https://github.com/picocash/pips/blob/main/PIP-02.md
    author:
      - org: picocash
    date: 2026-08
  PIP-04:
    title: "picocash Vault: Custody, Attestation, and Emergency Redemption"
    target: https://github.com/picocash/pips/blob/main/PIP-04.md
    author:
      - org: picocash
    date: 2026-08
  PIP-05:
    title: "picocash as an MPP Payment Method"
    target: https://github.com/picocash/pips/blob/main/PIP-05.md
    author:
      - org: picocash
    date: 2026-08
  PIP-08:
    title: "picocash Pay-to-Public-Key Spending Conditions"
    target: https://github.com/picocash/pips/blob/main/PIP-08.md
    author:
      - org: picocash
    date: 2026-08
---

--- abstract

This document defines the "charge" intent for the "picocash" payment
method in the Payment HTTP Authentication Scheme {{I-D.httpauth-payment}}.
Picocash payments are Chaumian eCash proofs — blind-signature bearer
tokens issued by a mint against a TIP-20 stablecoin held in an on-chain
vault on Tempo. A server verifies a credential offline against the mint's
published keys, without contacting the mint, and settles it at the mint
before returning payment success. No on-chain transaction occurs on the
request path.

--- middle

# Introduction

The `charge` intent represents a one-time payment of a specified amount.
In the picocash method the client pays with **proofs**: blind-signature
tokens previously issued by a **mint** the server trusts. The server
performs all payment verification offline against the mint's published
public keys, then finalizes the payment with a single HTTP call to the
mint. The underlying blockchain is touched only when value enters the
mint (deposit) or leaves it (melt), never per request.

Two properties distinguish this method:

- **Offline verification.** Every proof carries a DLEQ proof of the
  mint's signature ({{PIP-00}}), so the server can establish token
  authenticity without a mint round-trip. The reference implementation
  measures this at tens of milliseconds.
- **Payer privacy.** Blind signatures cryptographically decouple token
  issuance from redemption. The credential carries no payer address,
  account, or key. (Timing, network, and amount side channels remain;
  see {{security-considerations}}.)

This specification defines the request schema, credential format,
verification procedure, and settlement procedure for picocash charges.
The mint API the server settles against, and the custody model behind
the mint, are specified in {{PIP-02}} and {{PIP-04}} and are out of
scope here except where the server's behavior depends on them.

## Payment Flow

~~~
   Client                        Server                      Mint
      |                             |                          |
      |  (1) GET /api/resource      |                          |
      |-------------------------->  |                          |
      |                             |                          |
      |  (2) 402 Payment Required   |                          |
      |      intent="charge"        |                          |
      |      (fresh nonce)          |                          |
      |<--------------------------  |                          |
      |                             |                          |
      |  (3) Prepare proofs bound   |                          |
      |      to the challenge       |                          |
      |                             |                          |
      |  (4) Authorization: Payment |                          |
      |-------------------------->  |                          |
      |                             |                          |
      |          (5) Offline verification (no network)         |
      |                             |                          |
      |                             |  (6) POST /v1/swap       |
      |                             |------------------------> |
      |                             |  (7) Fresh proofs        |
      |                             |      (double-spend check)|
      |                             |<------------------------ |
      |                             |                          |
      |  (8) 200 OK + Receipt       |                          |
      |<--------------------------  |                          |
~~~

Step (6) — the proof swap at the mint — is this method's settlement
point. The default flow returns success only after it completes
({{settlement-procedure}}).

## Relationship to the Payment Scheme

This document is a payment method specification as defined by
{{I-D.httpauth-payment}}. It defines the `request` and credential
`payload` structures for the "picocash" payment method under the
`charge` intent.

# Requirements Language

{::boilerplate bcp14-tagged}

# Terminology

**Mint**
: An HTTP service that issues and redeems proofs against reserves held
  in an on-chain vault ({{PIP-02}}). The server trusts one or more
  mints by allowlisting them in the challenge.

**Proof**
: A bearer token: an amount, a secret, and the mint's unblinded
  signature over it, together with a DLEQ proof that the signature was
  produced by the mint's published key for that denomination.

**Keyset**
: The set of per-denomination public keys a mint publishes for one
  currency unit. Identified by a 16-hex-character `keysetId`.

**DLEQ proof**
: A discrete-log-equality proof `{e, s, r}` attached to each proof,
  allowing any party holding the mint's public key to verify the mint's
  signature offline ({{PIP-00}}).

**Unit**
: The currency a keyset is denominated in, written
  `tip20:<chainId>:<tokenAddress>`. In this method the unit is derived
  from the challenge's `currency` and `methodDetails.chainId`
  ({{unit-derivation}}).

**PC-BIND secret**
: A proof secret that commits to the challenge nonce and realm,
  binding the proof to a single challenge ({{challenge-binding}}).

**P2PK lock**
: A spending condition embedded in a proof secret that requires a
  {{BIP-340}} Schnorr signature by a named key to spend the proof
  ({{PIP-08}}).

**Settlement point**
: The event after which this method considers payment final: the
  successful swap of the credential's proofs at the mint.

# Method Identifier

This specification registers the following payment method identifier:

~~~
picocash
~~~

The identifier is case-sensitive and MUST be lowercase.

# Supported Intents

| Intent | Support | Reference |
|--------|---------|-----------|
| `charge` | REQUIRED | This document |

`authorize` and `subscription` are not defined for this method. A
pre-funded authorization pattern is available within `charge` itself
via P2PK-locked proofs ({{p2pk-binding}}): a principal locks proofs to
the server's published key in advance, and the holder spends them
against later challenges.

# Intent: "charge"

## Request Schema

For `intent="charge"`, the `request` parameter contains:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `amount` | string | REQUIRED | Amount in base units of the currency (decimal string) |
| `currency` | string | REQUIRED | TIP-20 token address backing the accepted proofs (e.g. `"0x20c0..."`) |
| `methodDetails.chainId` | number | REQUIRED | Chain id of the network the backing token lives on |
| `methodDetails.nonce` | string | REQUIRED | 32-byte lowercase hex value, freshly generated per challenge |
| `methodDetails.mints` | array | REQUIRED | Mints the server accepts: `{ "url": string, "keysetIds": [string] }` |
| `methodDetails.pubkey` | string | OPTIONAL | The server's P2PK lock key: 33-byte compressed SEC1 point, lowercase hex ({{p2pk-binding}}) |

Challenge expiry is carried by the authentication envelope's `expires`
auth-param per {{I-D.httpauth-payment}}, not duplicated here.

**Example:**

~~~json
{
  "amount": "50000",
  "currency": "0x20c0000000000000000000000000000000000000",
  "methodDetails": {
    "chainId": 42431,
    "nonce": "b7e2c1a9f4d8073e6a5b2c9d1e0f38a7c6b5d4e3f2a1908877665544332211ff",
    "mints": [
      {
        "url": "https://mint.picocash.dev",
        "keysetIds": ["00260deaaf7e6868"]
      }
    ],
    "pubkey": "02a1633cafcc01ebfb6d78e39f687a1f0995c62fc95f51ead10a02ee0be551b5dc"
  }
}
~~~

### Unit Derivation {#unit-derivation}

The unit a keyset must be denominated in is derived, not carried:

~~~
unit = "tip20:" || decimal(chainId) || ":" || lowercase(currency)
~~~

Servers MUST verify that every allowlisted keyset's published unit
equals the derived unit. An equal number of base units in a different
token is not payment.

### Nonce Requirements

The `nonce` MUST be unpredictable (at least 128 bits of entropy) and
MUST be unique per challenge. Servers MUST NOT reuse a nonce across
challenges; credential binding ({{challenge-binding}}) depends on it.

## Credential Payload

The credential `payload` contains:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `type` | string | REQUIRED | MUST be `"proofs"` |
| `mint` | string | REQUIRED | URL of the issuing mint; MUST appear in `methodDetails.mints` |
| `keysetId` | string | REQUIRED | Keyset the proofs belong to; MUST appear in that mint's `keysetIds` |
| `proofs` | array | REQUIRED | Proofs summing to exactly `amount` |

Each element of `proofs` contains:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `amount` | number | REQUIRED | Denomination (positive power of two) |
| `secret` | string | REQUIRED | Hex-encoded secret ({{challenge-binding}}) |
| `C` | string | REQUIRED | Unblinded mint signature: 33-byte compressed point, lowercase hex |
| `dleq` | object | REQUIRED | `{ "e": hex, "s": hex, "r": hex }` per {{PIP-00}} |
| `witness` | string | OPTIONAL | Spending-condition witness for P2PK-locked proofs ({{PIP-08}}) |

**Example:**

~~~json
{
  "type": "proofs",
  "mint": "https://mint.picocash.dev",
  "keysetId": "00260deaaf7e6868",
  "proofs": [
    {
      "amount": 32768,
      "secret": "5b2250432d42494e44222c7b226e6f6e6365223a22...",
      "C": "03f1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90",
      "dleq": {
        "e": "9d1e0f38a7c6b5d4e3f2a19088776655443322115b2250432d42494e44222c7b",
        "s": "38a7c6b5d4e3f2a1908877665544332211ff9d1e0f5b2250432d42494e44222c",
        "r": "665544332211ff9d1e0f38a7c6b5d4e3f2a19088775b2250432d42494e44222c"
      }
    }
  ]
}
~~~

Wire-level proof and token serialization, including the compact `picoA`
token format used outside this authentication scheme, is specified in
the picocash specifications; this method carries proofs as the JSON
structure above.

## Challenge Binding {#challenge-binding}

A proof is a bearer instrument; unbound proofs presented over HTTP
could be captured and replayed elsewhere. Every proof in a credential
MUST therefore be bound to the server by exactly one of the following
mechanisms, and servers MUST reject credentials containing any proof
bound by neither.

### PC-BIND (challenge binding)

The proof's secret is the UTF-8 encoding, hex-encoded, of the
canonical JSON string:

~~~
["PC-BIND",{"nonce":"<nonce>","realm":"<realm>","salt":"<32-byte hex>"}]
~~~

with exactly that key order and no whitespace. `nonce` MUST equal the
challenge's `methodDetails.nonce`; `realm` MUST equal the challenge's
`realm` auth-param. The client obtains such proofs by swapping existing
proofs at the mint for fresh ones with PC-BIND secrets after receiving
the challenge. A PC-BIND proof satisfies only this challenge at this
realm: an intercepted credential cannot be repurposed for another
challenge or realm. Replay against the *same* challenge is prevented by
the server's replay store ({{replay-protection}}).

### P2PK binding (service binding) {#p2pk-binding}

If the challenge carries `methodDetails.pubkey`, proofs whose secrets
are P2PK-locked to that key ({{PIP-08}}) are accepted as bound. Each
such proof MUST carry a `witness` containing a {{BIP-340}} Schnorr
signature over the SHA-256 hash of the secret, made with the key named
in the lock. Servers MUST verify:

- the lock's key equals `methodDetails.pubkey`;
- the witness signature verifies;
- if the lock carries a locktime, at least 60 seconds remain before
  any refund path activates;
- the lock requires exactly one signature (`n_sigs = 1`).

P2PK proofs are bound to the *service*, not to one challenge:
cross-challenge replay of the same proof is prevented solely by the
duplicate-proof guard in {{replay-protection}}. This is the mechanism
by which a principal funds an agent with proofs spendable only at a
named server: the principal locks proofs to the server's published key
with a refund key of its own, and the agent presents them against any
of that server's challenges.

# Verification Procedure {#verification-procedure}

Upon receiving a credential, servers MUST perform the following checks,
all offline, in order. Any failure MUST result in 402 with a fresh
challenge; servers MUST NOT return a `Payment-Receipt` on failure.

1. The challenge `id` matches an outstanding challenge that has not
   expired and has not previously been accepted.
2. `payload.mint` and `payload.keysetId` appear in the challenge's
   `methodDetails.mints`, the keyset's public keys are already cached
   (from the mint's `/v1/keys`, fetched out-of-band), and the keyset's
   unit equals the unit derived in {{unit-derivation}}.
3. Every proof is bound to this server per {{challenge-binding}}.
4. The proof amounts are valid denominations of the keyset and sum to
   exactly `amount`.
5. The DLEQ proof of every proof verifies against the cached keyset key
   for its denomination ({{PIP-00}}).
6. For every proof, `Y = hash_to_curve(secret)` is not a duplicate —
   neither within this credential nor among proofs previously accepted
   by this server ({{replay-protection}}).

No step requires network access. The reference implementation completes
all six checks in under 100 ms for typical credentials.

## Replay Protection {#replay-protection}

Checks 1 and 6 are only as strong as the store behind them. Marking a
challenge accepted and recording its proofs' `Y` values MUST be a
single atomic operation. In any deployment with more than one server
instance, that store MUST be shared across instances; a process-local
store is acceptable only for a single instance. Servers MUST retain
recorded `Y` values at least until the corresponding proofs have been
settled at the mint, and SHOULD retain them for the lifetime of the
keyset when accepting P2PK-bound proofs, whose replay window is not
limited by any challenge expiry.

# Settlement Procedure {#settlement-procedure}

**Settlement point.** This method defines its settlement point as the
successful swap of the credential's proofs at the mint (`POST /v1/swap`
per {{PIP-02}}): the mint atomically records the proofs' secrets as
spent and issues fresh proofs to the server. The swap is the
double-spend check; after it, the presented proofs are void everywhere
and the value is the server's.

## Settle-First (Default)

Servers MUST settle before responding, unless they have explicitly
adopted the deferred mode below:

1. Complete the verification procedure.
2. Atomically mark the challenge accepted and record the proofs' `Y`
   values.
3. Swap the proofs at the mint.
4. On swap success, return 200 with a `Payment-Receipt`
   ({{receipt-generation}}).
5. On swap failure due to an already-spent proof, the payment has
   failed: release the resource lock if any, and respond 402 with a
   fresh challenge.

Under settle-first, `status: "success"` in the receipt is issued at or
after the settlement point, and the receipt `timestamp` is the
settlement timestamp, consistent with {{I-D.httpauth-payment}}.

## Deferred Settlement (Accept-Then-Settle)

A server MAY instead respond after step 2 and perform the swap
asynchronously, accepting a double-spend exposure bounded by the
per-call amount times the settlement lag. **This document does not
define a conformant receipt for that mode.** A receipt claiming
`status: "success"` before the settlement point does not satisfy the
core receipt semantics of {{I-D.httpauth-payment}} as currently
written. Until the core scheme defines a status for
"verified, settlement point not yet reached", deferred-settlement
deployments are experimental and MUST NOT emit `status: "success"`
before the swap completes. This is an acknowledged open issue in the
core specification's issue tracker.

## Failure Handling

- **Mint unreachable at settlement:** the server holds verified,
  recorded proofs it cannot yet swap. It MAY retry the identical swap;
  the mint's swap endpoint is idempotent over identical inputs. The
  server MUST NOT return `status: "success"` until a swap succeeds.
- **Double-spend detected at settlement:** the payment failed; respond
  as in step 5 above. The recorded `Y` values MUST be retained so the
  same proofs cannot be presented again.
- **Partial acceptance is not defined.** Proofs sum to exactly
  `amount`; there is no partial settlement.

# Receipt Generation {#receipt-generation}

Upon reaching the settlement point, servers MUST return a
`Payment-Receipt` header per {{I-D.httpauth-payment}} carrying the
standard fields, extended with two method-specific fields:

| Field | Type | Description |
|-------|------|-------------|
| `status` | string | `"success"` |
| `method` | string | `"picocash"` |
| `timestamp` | string | {{RFC3339}} timestamp of the settlement point (the mint swap) |
| `reference` | string | The mint swap identifier, usable against the mint's checkstate endpoint |
| `amount` | string | Amount settled, base units (method extension) |
| `settlement` | string | `"settled"` (method extension) |

Servers MUST NOT include a `Payment-Receipt` header on error responses;
failures are communicated via HTTP status codes.

**Example (decoded):**

~~~json
{
  "status": "success",
  "method": "picocash",
  "timestamp": "2026-08-27T14:03:12Z",
  "reference": "swap_9f2c41d6ab08e355",
  "amount": "50000",
  "settlement": "settled"
}
~~~

# Security Considerations {#security-considerations}

## Transport Security

All communication MUST use TLS 1.2 or higher. Proofs are bearer
instruments: a credential transmitted in cleartext is stolen value.
Clients MUST NOT send credentials over unencrypted connections, and
MUST NOT log or persist unbound proofs in shared media.

## Bearer Credential Handling

Servers hold spendable value between verification and settlement, and
hold fresh proofs after the swap. Fresh proofs SHOULD be melted
(redeemed on-chain) or swapped into the server's own storage promptly;
compromise of a server's proof store is theft of exactly its balance,
no more — proofs confer no account access.

## Replay Protection

Three layers, each necessary: PC-BIND makes a credential single-realm
and single-nonce; the atomic replay store makes each challenge and each
proof single-use at this server; the mint's spent-secret ledger makes
each proof single-use globally at settlement. The residual risk of the
deferred mode — settlement discovering a proof spent elsewhere after
the resource was served — is why settle-first is the default.

## Mint and Custody Trust

The server's allowlist is a trust decision: an accepted proof is a
claim on the mint's reserves. The reference custody design binds each
mint to an on-chain vault with attested liabilities, rate-limited
operator outflow, and holder-unilateral emergency redemption
({{PIP-04}}); a server SHOULD verify a mint's vault parameters before
allowlisting it. An eCash mint's issuance is not auditable by third
parties — that is what blind signatures do — so custody risk is
reduced and exposed by these mechanisms, not eliminated.

## Privacy Properties and Limits

Blind signatures prevent the mint from linking issuance to redemption,
and the credential identifies no payer. Outside that guarantee: request
timing, network-layer identifiers, amount decomposition patterns, and
a reused P2PK lock key all correlate. Clients wanting the full privacy
property SHOULD use standard denominations and fresh P2PK keys per
relationship.

## Unit Confusion

The unit derivation of {{unit-derivation}} exists to prevent a
same-number-different-token substitution. Servers MUST derive the unit
from the challenge they issued, never from the credential.

# IANA Considerations

## Payment Method Registration

This specification registers the "picocash" payment method in the
Payment Method Registry per {{I-D.httpauth-payment}}:

| Field | Value |
|-------|-------|
| Method Identifier | `picocash` |
| Description | Chaumian eCash proofs backed by TIP-20 stablecoin reserves; offline verification, mint-swap settlement |
| Reference | This document |
| Contact | security@picocash.dev |

--- back

# Appendix A: Examples

## A.1. Charge with PC-BIND Proofs

**Challenge:**

~~~
HTTP/1.1 402 Payment Required
WWW-Authenticate: Payment id="chal_9f2c41d6",
  realm="api.example.dev",
  method="picocash",
  intent="charge",
  expires="2026-08-27T14:08:00Z",
  request="eyJhbW91bnQiOiI1MDAwMCIsImN1cnJlbmN5IjoiMHgyMGMwLi4uIn0"
~~~

The decoded `request` is the example in the request-schema section.
The client swaps wallet proofs at the mint for proofs whose secrets are
PC-BIND commitments to `nonce` and `realm`, then retries:

**Credential:**

~~~
GET /api/resource HTTP/1.1
Host: api.example.dev
Authorization: Payment eyJpZCI6ImNoYWxfOWYyYzQxZDYiLCJtZXRob2QiOi...
~~~

**Response:**

~~~
HTTP/1.1 200 OK
Payment-Receipt: eyJzdGF0dXMiOiJzdWNjZXNzIiwibWV0aG9kIjoicGljb2Nhc2gi...
~~~

## A.2. Charge with P2PK-Locked Proofs

A principal has previously locked proofs to the server's published
`pubkey` with `locktime` one week out and a refund key of its own, and
handed them to an agent. On receiving the challenge, the agent signs
each proof's secret with the agent-held key named in the lock and
presents the proofs with `witness` fields — no swap round-trip needed
before paying. Verification differs only in check 3 (P2PK binding in
place of PC-BIND); settlement is identical. After the locktime, the
principal reclaims any unspent proofs using the refund key.

# Appendix B: Implementation Status

A reference implementation (mint, SDK, server-side acceptor, browser
wallet), a public testnet mint with a live reserve-reconciliation
status page, and a browser demo exist; see the specifications index at
<https://github.com/picocash/pips>. All figures cited here were
measured against that implementation on the Tempo Moderato testnet.
Everything is pre-alpha, testnet-only, and unaudited.
