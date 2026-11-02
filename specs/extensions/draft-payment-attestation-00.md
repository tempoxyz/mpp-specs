---
title: Attestation Extension for HTTP Payment Authentication
abbrev: Payment Attestation
docname: draft-payment-attestation-00
version: 00
category: info
ipr: noModificationTrust200902
submissiontype: IETF
consensus: true

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
    target: https://datatracker.ietf.org/doc/draft-ryan-httpauth-payment/
    author:
      - name: Jake Moxey
    date: 2026-01
  CAIP-2:
    title: "CAIP-2: Blockchain ID Specification"
    target: https://chainagnostic.org/CAIPs/caip-2
    author:
      - org: Chain Agnostic Standards Alliance
    date: 2019
  CAIP-10:
    title: "CAIP-10: Account ID Specification"
    target: https://chainagnostic.org/CAIPs/caip-10
    author:
      - org: Chain Agnostic Standards Alliance
    date: 2020
  OPENID4VP:
    title: "OpenID for Verifiable Presentations 1.0"
    target: https://openid.net/specs/openid-4-verifiable-presentations-1_0.html
    author:
      - org: OpenID Foundation
    date: 2025

informative:
  I-D.payment-intent-charge:
    title: "Charge Intent for HTTP Payment Authentication"
    target: https://datatracker.ietf.org/doc/draft-payment-intent-charge/
    author:
      - name: Jake Moxey
    date: 2026
  I-D.payment-discovery:
    title: "Service Discovery for HTTP Payment Authentication"
    target: https://datatracker.ietf.org/doc/draft-payment-discovery/
    author:
      - name: Brendan Ryan
    date: 2026
  SD-JWT-VC:
    title: "SD-JWT-based Verifiable Credentials (SD-JWT VC)"
    target: https://datatracker.ietf.org/doc/draft-ietf-oauth-sd-jwt-vc/
    author:
      - org: IETF OAuth Working Group
    date: 2025
  ISO18013-5:
    title: "ISO/IEC 18013-5:2021 Personal identification — ISO-compliant driving licence — Part 5: Mobile driving licence (mDL) application"
    target: https://www.iso.org/standard/69084.html
    author:
      - org: ISO/IEC
    date: 2021
  SAS:
    title: "Solana Attestation Service"
    target: https://github.com/solana-foundation/solana-attestation-service
    author:
      - org: Solana Foundation
    date: 2025
  EAS:
    title: "Ethereum Attestation Service"
    target: https://attest.org/
    author:
      - org: Ethereum Attestation Service
    date: 2024
---

--- abstract

This document defines the "attestation" extension for the Payment HTTP
Authentication Scheme {{I-D.httpauth-payment}}. A server can require, as
part of any payment challenge, attestations about the payer (for
example, that they are 18 or older) from issuers it trusts. The client
presents them in the credential next to the payment proof, bound to the
challenge or to the paying key, and the server verifies them before it
settles the payment. Attestation formats are pluggable; reusable,
payer-bound attestations are the primary path.

--- middle

# Introduction

Many paid resources are restricted to some payers: films rated 18,
alcohol, regulated financial products, content licensed per country.
Today the restriction is enforced out of band (an account, a form, a
separate identity check), so an agent that can pay a 402 challenge on
its own still cannot complete the purchase.

This extension lets the challenge state the restriction and lets the
credential satisfy it in the same exchange. The server says which
claims it needs and which issuers it trusts; the client presents an
attestation for each, alongside the payment proof; the server verifies
them, then settles.

This extension is OPTIONAL. Servers MAY require attestations on any
intent. Clients that do not implement this extension cannot satisfy a
challenge that requires attestations and SHOULD treat it as
unsupported.

## Design Goals

Reusable:
: An attestation verified once can be presented again for later
  payments by the same payer without a new issuance or proof, when the
  issuer's format allows it ({{payer-binding}}).

Intent-agnostic:
: The requirement is a member of the `request` object, so it applies
  to every intent ("charge", "session", "subscription") and is covered
  by the challenge binding of {{I-D.httpauth-payment}}.

Format-agnostic:
: Selectively disclosed credentials, mobile documents and attestation
  records kept on a ledger all fit, through a registry of attestation
  formats ({{formats}}). Ledgers plug in through profiles
  ({{ledger-profiles}}), so the extension names no network.

Minimal disclosure:
: Requirements are expressed as predicates ("18 or older") rather than
  attributes ("date of birth") wherever the format allows.

## Relationship to Other Specifications

This document extends {{I-D.httpauth-payment}}. The query language is
the Digital Credentials Query Language (DCQL) of {{OPENID4VP}}, so a
requirement can be handed to an OpenID4VP wallet unchanged
({{wallet-delegation}}).

# Requirements Language

{::boilerplate bcp14-tagged}

# Terminology

Attestation
: A statement about a subject, signed or proven by an issuer, that a
  holder can present to a verifier.

Issuer
: The party whose signature, key or proof system makes an attestation
  trustworthy (a state's document signer through a proof system, an
  identity provider, an attestation authority on a ledger).

Holder
: The party presenting attestations; here, the payer or an agent
  acting for the payer.

Verifier
: The party checking attestations; here, the server issuing the
  payment challenge.

Presentation
: What the holder sends to prove one attestation requirement: a token,
  a proof, or a reference to a record, in a registered format.

Attestation Requirement
: The `attestations` member of a challenge's `request` object
  ({{requirement}}).

Holder Binding
: What ties a presentation to this payment: the challenge
  ({{challenge-binding}}) or the paying key ({{payer-binding}}).

# Overview

~~~
   Client                                           Server
      |                                                |
      |  (1) GET /film/night-signal                    |
      |----------------------------------------------->|
      |                                                |
      |  (2) 402  WWW-Authenticate: Payment            |
      |      request = { amount, currency, ...,        |
      |                  attestations: { query,        |
      |                    issuers, binding } }        |
      |<-----------------------------------------------|
      |                                                |
      |  (3) obtain presentations (own wallet, or the  |
      |      holder's wallet via OpenID4VP)            |
      |                                                |
      |  (4) GET /film/night-signal                    |
      |      Authorization: Payment { challenge,       |
      |        payload, attestations: [ ... ] }        |
      |----------------------------------------------->|
      |                                                |
      |      (5) verify attestations                   |
      |      (6) verify and settle payment             |
      |                                                |
      |  (7) 200  Payment-Receipt: { ...,              |
      |           attestations: [ ... ] }              |
      |<-----------------------------------------------|
~~~

Steps 5 and 6 are ordered: a server MUST NOT settle a payment whose
attestations it has not verified. Payment methods where settlement
happens before the server sees the credential use the pre-flight of
{{preflight}}.

# Attestation Requirement {#requirement}

A server that requires attestations includes an `attestations` member
in the JSON object carried by the challenge's `request` auth-param.
Because `request` is JCS-serialized {{RFC8785}} and covered by the
challenge binding of {{I-D.httpauth-payment}}, the requirement cannot be
removed or weakened without invalidating the challenge.

Intent specifications define the other members of `request`; this
member is shared by all intents. Payment methods MUST ignore it.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `query` | object | Yes | A DCQL query ({{OPENID4VP}}) naming the attestations and claims required |
| `issuers` | array | Yes | Issuer descriptors the server trusts ({{issuers}}) |
| `binding` | array | No | Accepted holder bindings, in order of preference: `"challenge"`, `"payer"`. Default `["challenge"]` |
| `preflight` | boolean | No | `true` when presentations must be sent before payment ({{preflight}}). Default `false` |
| `purpose` | string | No | Why the server asks, for display to the holder |

## Query

The `query` member is a DCQL query object as defined by {{OPENID4VP}}:
a `credentials` array of credential queries, each with an `id`, a
`format` and optionally `claims` (paths into the credential and,
optionally, required `values`), and an optional `credential_sets`
array expressing alternatives.

Servers SHOULD constrain predicates with `values` rather than request
the underlying attribute. For example, to require proof of being 18 or
older:

~~~json
{
  "credentials": [{
    "id": "age",
    "format": "dc+sd-jwt",
    "claims": [{ "path": ["age_equal_or_over", "18"], "values": [true] }]
  }]
}
~~~

When a server accepts the same claim from several formats, it lists one
credential query per format and a `credential_sets` entry offering them
as alternatives:

~~~json
{
  "credentials": [
    { "id": "age-vc", "format": "dc+sd-jwt",
      "claims": [{ "path": ["age_equal_or_over", "18"], "values": [true] }] },
    { "id": "age-ledger", "format": "ledger",
      "claims": [{ "path": ["age_equal_or_over", "18"], "values": [true] }] }
  ],
  "credential_sets": [{ "options": [["age-vc"], ["age-ledger"]] }]
}
~~~

## Issuers {#issuers}

Each entry of `issuers` describes one issuer the server trusts. A
presentation from any other issuer MUST be rejected
({{errors}}).

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `format` | string | Yes | The attestation format this issuer produces ({{formats}}) |
| `id` | string | Yes | The issuer's identifier in that format (a key id, a DID, an issuer URL, an attestation authority address) |
| `keys` | string | No | Where verification material can be fetched (a JWKS URL, a registry address) |

Formats MAY define further fields. An issuer identifier alone does not
convey trust: servers MUST obtain verification material from a source
they trust, not from the presentation.

# Presentations {#presentations}

The credential of {{I-D.httpauth-payment}} gains one member:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `attestations` | array | When required | One Presentation object per satisfied credential query |

A Presentation object:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | Yes | The `id` of the credential query it answers |
| `format` | string | Yes | Its attestation format; MUST equal the query's `format` |
| `binding` | string | Yes | The holder binding used: `"challenge"` or `"payer"` |
| `presentation` | string or object | Yes | The format-specific presentation ({{formats}}) |

The set of presentations MUST satisfy the query: every credential query
when there are no `credential_sets`, otherwise one option of each
required set. Servers MUST ignore presentations for queries they did
not issue.

# Holder Binding

A presentation that is not bound to the payment could be copied from
another purchase or another payer. Each presentation MUST use one of
the bindings listed in the requirement's `binding` member.

## Challenge Binding {#challenge-binding}

The presentation commits to this challenge. Formats define where; the
values are always:

- audience: the challenge `realm`;
- nonce: the challenge `id`.

A challenge-bound presentation is single-use, like the challenge
itself. It suits formats where the holder produces a fresh proof per
request (SD-JWT with key binding, mobile documents).

## Payer Binding {#payer-binding}

The presentation names a holder key, and that key MUST be the payer of
this payment: the key that authorizes the payment in the credential's
`payload`, as identified by the payment method. Payment methods that
support payer binding MUST state which key that is (for example, the
signer of a submitted transaction).

When the payer key is an account on a ledger, the holder key and the
payer key are compared as account identifiers {{CAIP-10}}: network and
address. An address on one network never matches the same address on
another unless a ledger profile ({{ledger-profiles}}) defines the two
networks as sharing accounts.

Payer binding makes attestations reusable: an attestation recorded once
(for example, on a ledger) can back any number of later payments by the
same payer, with no new proof. It also links those payments to the
payer's key; see {{privacy}}.

Servers MUST NOT accept payer binding with payment methods that do not
identify a payer key, and MUST NOT accept a `source` field
{{I-D.httpauth-payment}} as the payer key: `source` is self-asserted.

# Pre-flight {#preflight}

Some payment methods settle before the server sees the credential (for
example, a payment whose proof is a preimage revealed by paying). For
those, verifying attestations first is impossible within one exchange.
A server using such a method MUST set `preflight` to `true` in the
requirement.

When `preflight` is `true`:

1. The client sends a credential whose `payload` is an empty object and
   whose `attestations` member carries the presentations.
2. The server verifies the presentations ({{verification}}). On
   failure, it responds as in {{errors}}.
3. On success, it responds with 402 and a fresh challenge for the same
   resource whose `request` has no `attestations` member and whose
   `opaque` contains an `attested` entry referencing the verification.
   The challenge binding covers `opaque`, so the entry cannot be forged.
4. The client pays that challenge as usual.

Servers MUST NOT issue a challenge carrying an `attested` entry except
in step 3, and MUST treat such a challenge as single-use. A pre-flight
does not consume the original challenge's payment; servers SHOULD rate
limit pre-flights per client.

# Verification {#verification}

A server verifying a credential for a challenge with an attestation
requirement MUST, before any payment-method verification or settlement:

1. Verify the challenge per {{I-D.httpauth-payment}}.
2. Verify that the presentations satisfy the requirement's `query`
   ({{presentations}}).
3. For each presentation, verify that its issuer is listed in `issuers`
   for its format.
4. Verify its holder binding: audience and nonce for challenge binding;
   for payer binding, that the holder key equals the payer key the
   payment method identifies in `payload`.
5. Verify the presentation according to its format ({{formats}}),
   including the issuer's signature or proof, expiry and revocation
   status where the format defines them.
6. Verify that the proven claims satisfy the query's `claims` and
   `values`.

Only when every step succeeds does the server proceed to the payment
method's verification and settlement. Any failure MUST result in a 402
without settlement (fail closed).

## Reuse of Verifications

For payer-bound presentations, a server MAY cache a successful
verification for the pair (issuer, holder key) until the earlier of the
attestation's expiry and a server-chosen lifetime, and skip step 5 for
later payments by the same payer. It MUST still perform steps 2 to 4 and
6, and MUST honor revocation within the format's stated latency.

# Receipt

A `Payment-Receipt` {{I-D.httpauth-payment}} for a payment that required
attestations SHOULD include:

| Field | Type | Description |
|-------|------|-------------|
| `attestations` | array | One entry per verified presentation: its query `id`, `format`, issuer `id`, and `expires` ({{RFC3339}}) when the attestation has one |

The receipt MUST NOT repeat disclosed claim values.

# Errors {#errors}

Servers use Problem Details {{RFC9457}} with these types, under the
problem base URI of {{I-D.httpauth-payment}}:

| Code | HTTP | Description |
|------|------|-------------|
| `attestation/required` | 402 | The challenge requires attestations and none, or not enough, were presented |
| `attestation/invalid` | 402 | A presentation failed verification, or its claims do not satisfy the query |
| `attestation/issuer-untrusted` | 402 | A presentation comes from an issuer not listed in `issuers` |
| `attestation/binding-mismatch` | 402 | A presentation is bound to another challenge, realm or payer |

Each response MUST carry a fresh challenge. The `detail` member SHOULD
name the failing query `id` and MUST NOT reveal why a claim was false
(for example, the holder's age).

# Attestation Formats {#formats}

An attestation format specification MUST define:

1. its identifier (a registered string, see {{iana-formats}});
2. the `presentation` value;
3. how the issuer is identified and how its verification material is
   obtained;
4. which holder bindings it supports and where audience, nonce or
   holder key are carried;
5. how claims are read for matching against DCQL `claims`;
6. expiry and revocation, if any.

The initial formats:

| Format | Presentation | Bindings | Notes |
|--------|--------------|----------|-------|
| `dc+sd-jwt` | SD-JWT with Key Binding JWT {{SD-JWT-VC}} | challenge, payer | The KB-JWT carries `aud` and `nonce`. Payer binding when the `cnf` key is the payer key. |
| `mso_mdoc` | DeviceResponse {{ISO18013-5}} | challenge | Bound through the session transcript of {{OPENID4VP}}. |
| `ledger` | `{ "network": "<CAIP-2 id>", "record": "<record id>" }` | payer | An attestation record kept on a ledger, read and checked per the ledger profile for its network ({{ledger-profiles}}). Reusable by construction. |

## Ledger Attestations {#ledger-profiles}

The `ledger` format covers attestation records that a ledger keeps
(for example, records created by the attestation systems of {{SAS}}
or {{EAS}}). The extension defines the shape; a ledger profile defines
the rest for one network family.

A `ledger` presentation identifies a record:

| Field | Type | Description |
|-------|------|-------------|
| `network` | string | The ledger, as a {{CAIP-2}} chain identifier |
| `record` | string | The record's identifier on that ledger, in the profile's syntax |

A `ledger` issuer descriptor ({{issuers}}) adds:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `network` | string | Yes | The {{CAIP-2}} chain identifier the issuer's records live on |
| `schema` | string | No | The record schema the server accepts, in the profile's syntax |

A ledger profile, registered per {{CAIP-2}} namespace
({{iana-ledger-profiles}}), MUST define how a verifier:

1. reads a record by its identifier, and with what finality;
2. determines the record's issuer and schema, and compares them with
   the issuer descriptor's `id` and `schema`;
3. determines the record's subject as a {{CAIP-10}} account identifier,
   for comparison with the payer key ({{payer-binding}});
4. reads the record's claims, for matching against DCQL `claims`;
5. determines expiry and revocation.

A server MUST reject a `ledger` presentation whose `network` has no
profile it implements, and MUST read records from a source it trusts,
never from data supplied in the presentation.

# Delegation to a Wallet {#wallet-delegation}

A client acting for a person (an agent, a browser) often cannot produce
presentations itself. Because `query` is DCQL, the client can forward
the requirement to the person's wallet as an {{OPENID4VP}} authorization
request:

- `dcql_query`: the requirement's `query`;
- `client_id`: derived from the challenge `realm`;
- `nonce`: the challenge `id`;
- `response_mode`: `direct_post` to an endpoint of the client, or a
  same-device redirect.

The wallet's `vp_token` maps one-to-one onto Presentation objects: its
keys are query `id`s and its values the presentations. A presentation
obtained this way is challenge-bound to the original challenge and MUST
be sent with that challenge's credential.

# Discovery

A service publishing a discovery document {{I-D.payment-discovery}}
SHOULD add an `attestations` member to each payment offer whose
challenges carry a requirement:

| Field | Type | Description |
|-------|------|-------------|
| `claims` | array | The claim paths required, e.g. `[["age_equal_or_over", "18"]]` |
| `formats` | array | Accepted attestation formats |

The runtime challenge remains authoritative.

# Privacy Considerations {#privacy}

Data minimization:
: Servers SHOULD ask for the narrowest claim that meets their
  obligation: a predicate (`age_equal_or_over`) over a value
  (`birthdate`), and a value over a whole credential. Clients SHOULD
  show the holder exactly what each presentation discloses before
  sending it.

Linkability:
: Challenge-bound presentations in formats with unlinkable proofs can
  be unlinkable across servers. Payer binding links every payment made with the payer key to
  the same attestation; holders who need unlinkability should use
  challenge binding, or a fresh payer key per server.

Retention:
: Servers SHOULD NOT store presentations after verification, and MUST
  NOT reuse disclosed values for purposes beyond the requirement's
  stated purpose.

Error detail:
: Errors MUST NOT reveal the holder's attributes ({{errors}}).

# Security Considerations

Downgrade:
: The requirement lives in `request`, which the challenge binding
  covers; an intermediary that removes or weakens it invalidates the
  challenge. Servers MUST verify requirements against the bound
  challenge, never against anything the client supplies.

Replay:
: Challenge-bound presentations are as single-use as their challenge.
  Payer-bound presentations can be replayed only by the payer key's
  holder, who must also authorize the payment.

Settlement order:
: Verifying attestations after settlement would charge a payer who is
  then refused. {{verification}} requires attestations first, and
  {{preflight}} covers methods that settle early.

Issuer trust:
: A server's `issuers` list is its trust policy. Servers MUST obtain
  issuer keys and registries from trusted sources and handle rotation
  and revocation as the format defines.

Denial of service:
: Some formats are expensive to verify (signature chains, ledger
  reads). Servers
  SHOULD run the cheap checks of {{verification}} (steps 2 to 4) before
  step 5, and rate limit pre-flights.

Wallet delegation:
: A wallet answering a forwarded requirement sees the server's `realm`
  and `purpose`; clients MUST NOT alter them, so the holder consents to
  the real verifier.

# IANA Considerations

## Attestation Format Registry {#iana-formats}

This document establishes the "HTTP Payment Attestation Formats"
registry. Registration requires a specification meeting {{formats}}.
Initial entries:

| Format | Reference |
|--------|-----------|
| `dc+sd-jwt` | This document, {{SD-JWT-VC}} |
| `mso_mdoc` | This document, {{ISO18013-5}} |
| `ledger` | This document, {{ledger-profiles}} |

## Ledger Attestation Profile Registry {#iana-ledger-profiles}

This document establishes the "HTTP Payment Ledger Attestation
Profiles" registry, keyed by {{CAIP-2}} namespace (for example,
`eip155`, `solana`). Registration requires a specification meeting
{{ledger-profiles}}. The registry is initially empty.

## Problem Types

This document registers the problem types of {{errors}} under the
problem base URI of {{I-D.httpauth-payment}}.

--- back

# Example: Renting a Film Rated 18

A streaming service charges 3.99 USD and requires proof of being 18 or
older, accepting a fresh, key-bound verifiable credential or a reusable
attestation record on a ledger. The challenge uses an illustrative
payment method, `example`, whose payer key is the account that signs the
payment. The challenge's decoded `request`, for a charge intent
{{I-D.payment-intent-charge}}:

~~~json
{
  "amount": "399",
  "currency": "usd",
  "recipient": "acct_lumen",
  "description": "Rent “Night Signal” (rated 18), 48 h",
  "attestations": {
    "query": {
      "credentials": [
        { "id": "age-vc", "format": "dc+sd-jwt",
          "claims": [{ "path": ["age_equal_or_over", "18"], "values": [true] }] },
        { "id": "age-ledger", "format": "ledger",
          "claims": [{ "path": ["age_equal_or_over", "18"], "values": [true] }] }
      ],
      "credential_sets": [{ "options": [["age-vc"], ["age-ledger"]] }]
    },
    "issuers": [
      { "format": "dc+sd-jwt", "id": "https://issuer.example/pid",
        "keys": "https://issuer.example/.well-known/jwt-vc-issuer" },
      { "format": "ledger", "id": "issuer:age-authority",
        "network": "example:mainnet", "schema": "schema:age-v1" }
    ],
    "binding": ["payer", "challenge"],
    "purpose": "Films rated 18 can only be rented by adults."
  }
}
~~~

A first-time payer presents a credential with a Key Binding JWT whose
`aud` is the realm and `nonce` the challenge `id`:

~~~json
{
  "challenge": { "id": "kM9xPqWvT2nRjYcL5vHsAb", "realm": "lumen.example", "...": "..." },
  "payload": { "authorization": "..." },
  "attestations": [{
    "id": "age-vc",
    "format": "dc+sd-jwt",
    "binding": "challenge",
    "presentation": "eyJhbGciOiJFUzI1NiIsInR5cCI6ImRjK3NkLWp3dCJ9...~WyJ...~eyJ0eXAiOiJrYitqd3Qi..."
  }]
}
~~~

A payer whose age is already attested on the ledger presents only the
record; the server checks that its subject is the account that signed
the payment:

~~~json
{
  "challenge": { "id": "Zq3LmWc8RtYvKp1HnBsXdE", "realm": "lumen.example", "...": "..." },
  "payload": { "authorization": "..." },
  "attestations": [{
    "id": "age-ledger",
    "format": "ledger",
    "binding": "payer",
    "presentation": { "network": "example:mainnet", "record": "record:7f3a91" }
  }]
}
~~~

The receipt:

~~~json
{
  "status": "success",
  "method": "example",
  "timestamp": "2026-10-30T12:04:51Z",
  "reference": "pay_8f2c19",
  "attestations": [{ "id": "age-ledger", "format": "ledger",
                     "issuer": "issuer:age-authority",
                     "expires": "2027-10-30T00:00:00Z" }]
}
~~~

# Acknowledgments
{:numbered="false"}

The query language and wallet hand-off reuse the work of the OpenID for
Verifiable Presentations authors.
