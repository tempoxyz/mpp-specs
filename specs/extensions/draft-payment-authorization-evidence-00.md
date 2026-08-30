---
title: Authorization Evidence Extension for HTTP Payment Authentication
abbrev: Payment Authorization Evidence
docname: draft-payment-authorization-evidence-00
version: "00"
category: info
ipr: noModificationTrust200902
submissiontype: IETF
consensus: true

author:
  - name: Viswanadha Pratap Kondoju
    ins: V. Kondoju
    email: kondojuviswanadha@gmail.com
    org: ZKProva Inc.

normative:
  RFC2119:
  RFC4648:
  RFC8126:
  RFC8174:
  RFC8259:
  RFC9110:
  RFC9457:
  I-D.httpauth-payment:
    title: "The 'Payment' HTTP Authentication Scheme"
    target: https://datatracker.ietf.org/doc/draft-ryan-httpauth-payment/
    author:
      - name: Brendan Ryan
    date: 2026-01
---

--- abstract

This document defines the "authorization evidence" extension for the
Payment HTTP Authentication Scheme. It specifies one request header
field, `Payment-Authorization-Evidence`, and two challenge parameters,
`evidence` and `evidence-formats`, that let a client present
verifiable evidence that a principal authorized the paying agent to
make this payment, alongside the Payment Credential and without
modifying the core flow.

--- middle

# Introduction

A Payment Credential proves that a payment is funded and well-formed
under a payment method. When the client is an autonomous agent acting
for a principal, the Credential does not prove a second fact the
server may care about: that the principal authorized this agent to
make this payment — at this amount, to this payee, at this time.

This extension carries that second fact as **authorization evidence**:
a verifiable statement, presented alongside the Payment Credential,
that an identified principal granted the presenting agent authority
covering the challenged payment. The server verifies the evidence
before settlement and can retain the outcome for audit.

This extension is OPTIONAL. Servers MAY implement this extension to
require or accept authorization evidence. Clients MUST NOT require
this extension to function.

## Motivation

Agent identity attestations establish who an agent is; they do not
establish what the agent was permitted to spend. Payment Credentials
establish that funds move; they do not establish who permitted the
spend. Deployments with agent fleets, delegated budgets, or
counterparty audit obligations need the permission fact to be
verifiable at payment time and provable after the fact, by a party
other than the agent's operator.

## Scope

This extension:

- DOES: define how authorization evidence is requested in a Payment
  Challenge, carried on the retried request, and processed by the
  server.
- DOES: define the requirements an evidence format specification must
  meet, and establish a registry of evidence format identifiers.
- DOES NOT: define any evidence format, trust model, or policy
  language. Those belong to evidence format specifications.
- DOES NOT: change Payment Credential semantics, settlement, or any
  core header field. Evidence is never a substitute for payment.
- DOES NOT: define or modify any Payment Intent. The extension
  applies identically under every intent, including any future
  authorize-and-capture intent.

## Relationship to Core Specification

This document extends {{I-D.httpauth-payment}}. Implementations of
this extension MUST also implement the core specification. The
extension relies on two core properties: challenges may carry
additional lowercase parameters that unaware clients ignore, and
implementations ignore unknown header fields. A client or server that
does not implement this extension remains fully conformant to the
core specification.

# Requirements Language

The key words "MUST", "MUST NOT", "REQUIRED", "SHALL", "SHALL NOT",
"SHOULD", "SHOULD NOT", "RECOMMENDED", "NOT RECOMMENDED", "MAY", and
"OPTIONAL" in this document are to be interpreted as described in
BCP 14 {{RFC2119}} {{RFC8174}} when, and only when, they appear in
all capitals, as shown here.

# Terminology

This document uses the terms Payment Challenge, Payment Credential,
and Payment Method as defined in {{I-D.httpauth-payment}}, and
defines:

**Principal**: The party on whose behalf the agent acts and whose
authority the evidence attests — for example a human operator or an
organization.

**Authorization evidence**: A verifiable statement that a principal
granted the presenting agent authority covering a specific payment.
Verifiable means a server can evaluate it using the evidence format's
verification procedure, without calling back to the principal.

**Evidence format**: A specification defining the syntax, semantics,
and verification procedure for one kind of authorization evidence,
identified by a registered format identifier
({{evidence-format-specifications}}).

**Selected Credential field**: The HTTP field carrying the Payment
Credential for a given challenge — `Authorization` by default, or
`Payment-Authorization` when the challenge's `header` parameter
selects it, per the core specification.

# Extension Overview

The extension adds no round trips to the core flow:

1. The server's Payment Challenge includes an `evidence` parameter
   declaring whether authorization evidence is accepted or required,
   and an `evidence-formats` parameter naming the formats it can
   verify.
2. The client retries with its Payment Credential as usual, plus a
   `Payment-Authorization-Evidence` header field carrying the
   evidence.
3. Before settlement, the server verifies the evidence under the
   named evidence format. Verification failure is handled exactly
   like any other verification failure in the core scheme: fail
   closed, `402` with a fresh Challenge.

The evidence is bound to the challenge it answers via the challenge
`id`, and to the presenting agent via the format's presenter binding
({{verification-properties}}).

# Specification

## The Evidence Challenge Parameters {#evidence-challenge-parameters}

A server implementing this extension adds the following parameters to
its Payment Challenge:

~~~
HTTP/1.1 402 Payment Required
WWW-Authenticate: Payment id="x7Tg2pLqR9mKvNwY3hBcZa",
    realm="api.example.com",
    method="example",
    intent="charge",
    header="Payment-Authorization",
    request="eyJhbW91bnQiOiIxMDAwIiwiY3VycmVuY3kiOiJVU0QiLCJyZWNpcGllbnQiOiJhY2N0XzEyMyJ9",
    evidence="required",
    evidence-formats="exampleformat"
~~~

- `evidence` — one of `accepted` or `required`. Absence of the
  parameter means the server does not process authorization evidence.
- `evidence-formats` — a space-separated list of evidence format
  identifiers the server can verify, in server preference order.
  REQUIRED whenever the `evidence` parameter is present.

When `evidence="required"`, the server MUST NOT settle a payment for
this challenge without successfully verified authorization evidence.
When `evidence="accepted"`, the server processes evidence if
presented and proceeds without it otherwise.

The server MUST bind the challenge's evidence policy — the `evidence`
value and `evidence-formats` list — to the challenge `id` on the
server side, so that the policy evaluated at verification time is the
policy issued with that challenge.

Per the core specification's custom parameter rules, clients that do
not implement this extension ignore both parameters. Such a client
retrying against an `evidence="required"` challenge presents no
evidence and fails per {{server-processing}}, without settlement.

## The Payment-Authorization-Evidence Header Field {#evidence-header}

The client presents evidence on the retried request, alongside the
selected Credential field:

~~~
Payment-Authorization-Evidence: <format> <payload>
~~~

- `<format>` — a registered evidence format identifier (lowercase
  ASCII letters and digits).
- `<payload>` — the base64url encoding {{RFC4648}} without padding of
  a JSON object {{RFC8259}} whose schema is defined by the evidence
  format specification.

The header field carries at most one evidence value. A request MUST
NOT contain more than one `Payment-Authorization-Evidence` field.

## Verification Properties {#verification-properties}

Whatever its format-specific schema, the decoded payload MUST allow
the server to establish, under the format's verification procedure:

1. **Challenge binding** — the evidence covers the specific challenge
   being answered (the challenge `id`), so evidence cannot be
   replayed against a different challenge. The binding MUST be
   covered by the format's integrity mechanism.
2. **Presenter binding** — the evidence covers the presenting agent.
   The format MUST name the presenter identifier it binds and how the
   server matches it against this request — for example, against the
   payer identity established by Payment Credential verification, or
   against a verified agent identity presented on the request.
3. **Amount coverage** — the granted authority covers the challenged
   amount.
4. **Payee coverage** — the granted authority covers the payee
   identity the server presents, as defined by the format.
5. **Temporal validity** — the grant was valid at verification time.
6. **Principal authenticity** — the grant traces to the principal
   under the format's trust model.

## Server Processing {#server-processing}

Before executing settlement for a challenge whose `evidence`
parameter was present, a server implementing this extension MUST:

1. If the request carries no `Payment-Authorization-Evidence` field:
   when `evidence="required"`, do not settle — respond `402` with a
   fresh Challenge, and SHOULD carry error details in a problem
   details body {{RFC9457}}; when `evidence="accepted"`, proceed
   without evidence and skip the remaining steps.
2. If the presented format identifier is not in the challenge's
   `evidence-formats` list or is otherwise unsupported: when
   `evidence="required"`, this is a verification failure; when
   `evidence="accepted"`, the server MUST NOT process the evidence
   and MUST proceed as if it were absent. This is the single case in
   which presented evidence is not processed.
3. Decode and verify the payload under the format's verification
   procedure, establishing all six properties of
   {{verification-properties}}.
4. If verification fails, the server MUST NOT settle the payment. It
   responds `402` with a fresh Challenge, and SHOULD carry error
   details in a problem details body {{RFC9457}} with a
   format-appropriate `type`. Evidence failure MUST NOT be reported
   as a payment method failure.
5. If verification succeeds, processing continues unchanged. The
   server SHOULD retain the verified evidence, or a verifiable digest
   of it, for the duration of its audit obligations.

Once the server begins processing presented evidence (step 3),
verification MUST be fail-closed: any error condition — malformed
payload, unknown fields where the format forbids them, unresolvable
trust anchors, verifier timeout — is a verification failure, never a
pass-through.

A challenge `id` already used in a settled or failed exchange MUST
NOT be accepted again for evidence verification; reuse is a
verification failure.

Evidence verification MUST NOT replace Payment Credential
verification. The two are independent; both MUST pass for settlement
when evidence is required. A request carrying evidence but no Payment
Credential fails Credential verification under the core rules
regardless of the evidence outcome.

# Evidence Format Specifications {#evidence-format-specifications}

Evidence formats play the role for this extension that payment method
specifications play for the core scheme. An evidence format
specification MUST define:

1. **Format Identifier**: unique lowercase string (`a-z`, `0-9`).
2. **Payload Schema**: the JSON structure of the decoded payload.
3. **Verification Procedure**: how a server establishes the six
   properties of {{verification-properties}}, including the format's
   trust model for principal authenticity and the presenter
   identifier it binds.
4. **Challenge Binding Construction**: precisely how the challenge
   `id` is bound inside the evidence such that binding is covered by
   the format's integrity mechanism.
5. **Security Considerations**: format-specific threats and
   mitigations, including replay and substitution analysis.

# Security Considerations

**Evidence is not payment.** A verified evidence object proves
permission, not funding. Servers MUST NOT treat evidence as a
Credential substitute in either direction.

**Replay.** The challenge `id` binding ({{verification-properties}})
is the replay defense. A format whose binding is not covered by its
integrity mechanism provides no replay protection and MUST NOT be
registered. Single use of challenge `id`s is enforced by
{{server-processing}}.

**Substitution.** Presenter binding ({{verification-properties}})
prevents valid evidence issued to one agent from being paired with a
different payer's Credential. A format that cannot tie its presenter
identifier to something the server verifies on this request does not
satisfy this extension.

**Downgrade.** A client that omits the evidence header against an
`evidence="required"` challenge is refused before settlement
({{server-processing}}). Because the server binds its evidence policy
to the challenge `id` server-side, a manipulated challenge cannot
relax the policy the server actually enforces; challenge integrity in
transit is the standing TLS assumption of the core scheme.

**Display text.** Evidence payload fields are machine inputs.
Consistent with the core scheme's guidance, servers MUST NOT use
human-readable description fields as authorization inputs.

**Privacy.** Evidence can reveal principal identity, spending scope,
and organizational structure to the payee. Servers SHOULD retain no
more evidence content than their audit obligations require.

**Size.** Evidence competes with the Credential for the core scheme's
size expectations. Combined Credential and
`Payment-Authorization-Evidence` content SHOULD stay within the
credential size the core scheme requires servers to handle; formats
SHOULD keep typical payloads under 2KB.

# IANA Considerations

## Header Field Registration

This document registers the following header field in the "Hypertext
Transfer Protocol (HTTP) Field Name Registry" established by
{{RFC9110}}:

| Field Name | Status | Reference |
|------------|--------|-----------|
| Payment-Authorization-Evidence | provisional | This document, {{evidence-header}} |

## Evidence Format Registry

This document establishes the "HTTP Payment Authorization Evidence
Formats" registry, using the "Specification Required" policy defined
in {{RFC8126}}.

Registration requests must include:

- **Format Identifier**: unique lowercase ASCII string (`a-z`, `0-9`)
- **Description**: brief description of the evidence semantics
- **Specification pointer**: reference to the specification document
- **Registrant Contact**: contact information for the registrant

The registry is initially empty. Evidence format specifications
register their identifiers upon publication.

--- back

# Example Flow

The format identifier `exampleformat` below is illustrative only; it
is not defined or registered by this document.

Challenge:

~~~
HTTP/1.1 402 Payment Required
WWW-Authenticate: Payment id="x7Tg2pLqR9mKvNwY3hBcZa",
    realm="api.example.com",
    method="example",
    intent="charge",
    header="Payment-Authorization",
    request="eyJhbW91bnQiOiIxMDAwIiwiY3VycmVuY3kiOiJVU0QiLCJyZWNpcGllbnQiOiJhY2N0XzEyMyJ9",
    evidence="required",
    evidence-formats="exampleformat"
~~~

Retry (Credential unchanged, evidence added):

~~~
GET /reports/q3 HTTP/1.1
Host: api.example.com
Payment-Authorization: Payment eyJjaGFsbGVuZ2UiOiJ...
Payment-Authorization-Evidence: exampleformat eyJncmFudCI6...
~~~

Decoded evidence payload (schema owned by `exampleformat`):

~~~json
{
  "grant": "<principal-signed authority: agent, scope, expiry>",
  "presenter": "<agent identifier the grant names>",
  "challenge_binding": "x7Tg2pLqR9mKvNwY3hBcZa",
  "presented_at": 1756400000
}
~~~

The server verifies the grant signature, checks the challenge
binding, presenter, amount, payee, and validity window, then proceeds
to Credential verification and settlement.

# Processing Matrix

Expected server behavior per {{server-processing}}:

| # | Challenge | Evidence presented | Expected |
|---|-----------|--------------------|----------|
| 1 | `required` | valid, bound to this `id` and presenter | settle |
| 2 | `required` | absent | 402, fresh Challenge |
| 3 | `accepted` | absent | settle |
| 4 | `required` | valid signature, amount exceeds grant | 402 |
| 5 | `required` | valid signature, other payee | 402 |
| 6 | `required` | valid signature, expired grant | 402 |
| 7 | `required` | bound to a previous `id` | 402 |
| 8 | `required` | bound to a different presenter | 402 |
| 9 | `required` | format not in `evidence-formats` | 402 |
| 10 | `accepted` | format not in `evidence-formats` | settle, evidence not processed |
| 11 | `required` | undecodable base64url / non-JSON | 402 |
| 12 | `required` | valid evidence, no Payment Credential | fails core Credential rules |
