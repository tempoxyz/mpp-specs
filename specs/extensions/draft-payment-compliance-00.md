---
title: "Compliance Screening Extension for the Payment HTTP Authentication Scheme"
abbrev: "Payment Compliance"
docname: draft-payment-compliance-00
category: info
ipr: trust200902
submissiontype: independent
consensus: false
author:
  - name: OceanAlt
    org: OceanAlt
    email: business@oceanalt.com
---

# Abstract

This extension lets a resource server advertise, perform, and evidence a compliance screening of the payer before it settles a payment made under the Payment HTTP Authentication Scheme [I-D.httpauth-payment]. It defines one optional Challenge parameter (`compliance`), one problem type family for the `403` response the core specification already reserves for "payment verified, but policy denies access", and one optional response header (`Payment-Compliance`) that carries an auditable screening record next to the `Payment-Receipt`.

# Status of This Memo

This document is a companion extension draft submitted for discussion in the `specs/extensions/` directory. It does not modify the core specification. It is not an Internet Standards Track specification.

# Introduction

The core Payment scheme deliberately leaves "who is paying" and "may this payment settle" to the server: the Credential's `source` is a RECOMMENDED payer identifier with no verification requirement, and section 4.2 of the core specification states that a payment that is valid but denied by policy MUST be answered with `403`. It does not say how a server announces that such a policy exists, what a `403` for a policy denial should contain so that clients and auditors can act on it, or how the outcome of a screening is recorded alongside the receipt.

Resource servers that accept machine payments increasingly need to screen the paying account against sanctions lists, issuer freeze lists, mixer exposure and on-chain risk before settlement, and to be able to show afterwards that they did. This extension standardises the three touchpoints that already exist in the core scheme, without adding any identity requirement to the payer and without changing the Challenge binding rules.

## Scope

- In scope: advertising a screening policy on the Challenge; the shape of the `403` policy-denial response; an auditable screening record on the success response.
- Out of scope: the screening method itself, which lists are used, how a provider computes a decision. These are provider policy and are pointed to by URI.
- The payer remains pseudonymous. The extension screens the on-chain account in `source`; it does not require user accounts (core section 11.7).

## Relationship to the core specification

Servers MAY implement this extension. Clients MUST NOT require it. All implementations MUST support the core Payment HTTP Authentication Scheme [I-D.httpauth-payment]. The `compliance` Challenge parameter is an additional parameter as permitted by core section 9.3; clients that do not understand it MUST ignore it. It is not part of the HMAC binding sequence; a server that wants to bind it MAY include a digest of it in `opaque`.

# Requirements Language

The key words "MUST", "MUST NOT", "REQUIRED", "SHALL", "SHALL NOT", "SHOULD", "SHOULD NOT", "RECOMMENDED", "NOT RECOMMENDED", "MAY", and "OPTIONAL" in this document are to be interpreted as described in BCP 14 [RFC2119] [RFC8174] when, and only when, they appear in all capitals, as shown here.

# Extension Overview

```
Client                                   Resource server            Screening provider
  |-- GET /resource ----------------------->|                              |
  |<-- 402 WWW-Authenticate: Payment ...,   |                              |
  |        compliance="<b64url JSON>" ------|  (1) advertise policy         |
  |-- GET /resource                         |                              |
  |   Authorization: Payment <credential> ->|                              |
  |                                         |-- screen(source) ----------->|
  |                                         |<-- PASS | FAIL | UNCERTAIN --|
  |<-- 403 application/problem+json --------|  (2) FAIL / UNCERTAIN: no settlement
  |        or                               |
  |<-- 200 Payment-Receipt: ...             |
  |        Payment-Compliance: <b64url> ----|  (3) PASS: settle, record screening
```

Capabilities:

1. Advertise: the server tells the client, on the Challenge, that the payer will be screened, against which policy, and by whom.
2. Deny with evidence: a valid-but-denied payment is answered with a `403` problem details document that carries the decision, a reason code, and a URI where the evidence can be independently inspected.
3. Record: a settled payment carries a compact screening record so that receipts can be audited and disputes resolved.

# Specification

## The `compliance` Challenge parameter

A server that screens payers MAY add a `compliance` parameter to the `WWW-Authenticate: Payment` Challenge. Its value is a base64url-encoded JCS JSON object with the following members:

| Member | Type | Required | Description |
|---|---|---|---|
| `v` | string | REQUIRED | Version of this extension's data model. `"rap-1.0"` for this draft. |
| `policy` | string (URI) | REQUIRED | Human- and machine-readable description of the screening policy. |
| `screen` | array of string | REQUIRED | What is screened. This draft defines `"payer"` (the account in `source`) and `"recipient"`. |
| `level` | string | OPTIONAL | The assurance level the server requires of the payer, if the policy defines levels (e.g. `"L1"`). |
| `provider` | string (URI) | OPTIONAL | The screening provider's base URI. |

Example (before encoding):

```json
{ "v": "rap-1.0", "policy": "https://example.com/compliance-policy", "screen": ["payer"], "level": "L1", "provider": "https://oceanalt.com" }
```

The parameter is informative. Its presence does not change how the client constructs a Credential. Clients MUST ignore it if they do not understand it.

## Screening at settlement

After the server has verified the Credential (challenge echo, single use, expiry, method-specific proof) and before it settles, a server implementing this extension MUST derive the account to screen from the Credential:

- If `source` is a `did:pkh` identifier, the account is the address component and the chain is the `eip155` chain identifier (or the equivalent for other namespaces).
- Otherwise, if the payment method's payload identifies the paying account (for example the signer recovered from a proof), the server MAY use that.
- If no account can be derived, the screening outcome is `UNCERTAIN`.

The screening provider returns one of three decisions: `PASS`, `FAIL`, `UNCERTAIN`. Providers MUST NOT return `PASS` when a decision could not be reached; the absence of a result is `UNCERTAIN`.

Server behaviour:

- `FAIL`: the server MUST NOT settle and MUST respond `403` as in the next section.
- `UNCERTAIN`: the server MUST NOT settle if it operates fail-closed (RECOMMENDED); it responds `403` with `retry: true` and SHOULD include `Retry-After`. A server operating fail-open MAY settle; if it does, the `Payment-Compliance` record MUST state `UNCERTAIN`.
- `PASS`: the server proceeds to settlement as in the core specification.

## The `403` policy-denial response

A denial MUST be an RFC 9457 problem details document with media type `application/problem+json`. This draft registers two problem types:

- `https://oceanalt.com/rap/problems/compliance-denied` — the payer failed screening.
- `https://oceanalt.com/rap/problems/compliance-uncertain` — the payer could not be screened.

In addition to the standard `type`, `title`, `status` and `detail` members, the document carries:

| Member | Type | Required | Description |
|---|---|---|---|
| `decision` | string | REQUIRED | `FAIL` or `UNCERTAIN`. |
| `reason_code` | string | REQUIRED | Provider-defined machine code, e.g. `SANCTIONS_MATCH`, `MIXER_TAINT`, `ISSUER_FROZEN`, `ONCHAIN_HIGH_RISK`, `PAYER_UNSCREENABLE`. |
| `evidence_uri` | string (URI) | RECOMMENDED | Where the evidence behind the decision can be inspected. |
| `provider` / `provider_url` | string | RECOMMENDED | Who screened. |
| `evaluated_at` | string (RFC 3339) | RECOMMENDED | When. |
| `ttl_seconds` | integer | OPTIONAL | How long the decision is considered current. |
| `retry` | boolean | REQUIRED | Whether retrying later may succeed (`true` only for `UNCERTAIN`). |
| `challenge_id` | string | OPTIONAL | The `id` of the Challenge the Credential answered. |
| `basis` | array | OPTIONAL | Structured evidence items (`class`, `kind`, `source`, `ref`, `url`, `detail`, `observed_at`). |

Example:

```http
HTTP/1.1 403 Forbidden
Content-Type: application/problem+json
Cache-Control: no-store

{
  "type": "https://oceanalt.com/rap/problems/compliance-denied",
  "title": "Compliance policy denies settlement",
  "status": 403,
  "detail": "The payment credential is valid, but the payer did not pass compliance screening (MIXER_TAINT). The payment was not settled.",
  "decision": "FAIL",
  "reason_code": "MIXER_TAINT",
  "evidence_uri": "https://oceanalt.com/api/risk?addr=0x8589...da16",
  "provider": "OceanAlt",
  "evaluated_at": "2026-09-06T04:12:09Z",
  "retry": false,
  "challenge_id": "ch_01J..."
}
```

The server MUST NOT include a new `WWW-Authenticate` Challenge on a `403`; the payment was valid, and re-paying will not change the outcome.

## The `Payment-Compliance` response header

On a successful, settled response the server MAY add a `Payment-Compliance` header next to `Payment-Receipt`. Its value is a base64url-encoded JCS JSON object:

| Member | Type | Required | Description |
|---|---|---|---|
| `v` | string | REQUIRED | `"rap-1.0"`. |
| `decision` | string | REQUIRED | `PASS` (or `UNCERTAIN` for fail-open servers). |
| `reason_code` | string | REQUIRED | e.g. `NO_RISK_SIGNAL`. |
| `subject` | string | REQUIRED | The screened identifier (the Credential's `source`, or the derived address). |
| `challenge_id` | string | RECOMMENDED | Binds the record to the Challenge. |
| `provider`, `provider_url`, `evidence_uri`, `evaluated_at`, `expires_at`, `ttl_seconds`, `score` | — | RECOMMENDED | As in the problem document. |

A server MAY additionally sign the record (for example as a JWS compact serialisation) in a `Payment-Compliance-Signature` header; the signing profile is out of scope for this draft.

## Error handling

- A malformed `compliance` Challenge parameter MUST be ignored by clients.
- A screening provider that is unreachable yields `UNCERTAIN`; servers MUST NOT map provider errors to `PASS`.
- Servers SHOULD cache decisions no longer than `ttl_seconds`.

# Security Considerations

- Fail-closed by default. Treating provider outages as `PASS` would let an outage disable screening.
- Replay. The `challenge_id` in both the problem document and the `Payment-Compliance` record binds the screening outcome to a single Challenge; a record MUST NOT be reused for another Challenge.
- Information leakage. Problem documents describe the payer's account, which the payer already knows. Servers SHOULD NOT reveal list contents beyond what `evidence_uri` exposes to anyone.
- Privacy. Screening operates on the pseudonymous on-chain account already disclosed in `source`. This extension does not require, and servers implementing it MUST NOT infer, any additional identity from the client (core section 11.7).
- Discrimination and appeals. Because screening can deny service, `evidence_uri` and `reason_code` are RECOMMENDED so that a denied payer can inspect and contest the basis.

# IANA Considerations

This draft does not request IANA actions. If the Payment scheme's parameter registry is established, `compliance` would be registered there; the problem types above are URIs under the author's control.

# References

## Normative References

- [I-D.httpauth-payment] The Payment HTTP Authentication Scheme (core), `specs/core/draft-httpauth-payment-00.md`.
- [RFC2119], [RFC8174] Key words for use in RFCs.
- [RFC9457] Problem Details for HTTP APIs.
- [RFC8785] JSON Canonicalization Scheme (JCS).

## Informative References

- RAP (Responsible Agentic Payments) framework: https://oceanalt.com/en/rap
- Reference adapter (drop-in HTTP gate, runnable demo): `adapters/mpp.mjs` in the OceanAlt repository.
- x402 trust-provider extension discussion (comparable `onBeforeSettle` gating): x402-foundation/x402#2299.

# Authors' Addresses

OceanAlt — business@oceanalt.com — https://oceanalt.com
