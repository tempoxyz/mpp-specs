---
title: Initia Charge Intent for HTTP Payment Authentication
abbrev: Initia Charge
docname: draft-initia-charge-00
version: 00
category: info
ipr: noModificationTrust200902
submissiontype: IETF
consensus: true

author:
  - name: Sawit Trisirisatayawong
    ins: S. Trisirisatayawong
    email: sawit@initia.xyz
    organization: Initia Labs

normative:
  RFC2119:
  RFC3339:
  RFC4648:
  RFC8174:
  RFC8259:
  RFC8785:
  RFC9457:
  I-D.payment-intent-charge:
    title: "'charge' Intent for HTTP Payment Authentication"
    target: https://datatracker.ietf.org/doc/draft-payment-intent-charge/
    author:
      - name: Jake Moxey
      - name: Brendan Ryan
      - name: Tom Meagher
    date: 2026
  I-D.httpauth-payment:
    title: "The 'Payment' HTTP Authentication Scheme"
    target: https://datatracker.ietf.org/doc/draft-ietf-httpauth-payment/
    author:
      - name: Jake Moxey
    date: 2026-01

informative:
  INITIA-MAINNETS:
    title: "Initia registry mainnets"
    target: https://github.com/initia-labs/initia-registry/tree/main/mainnets
    author:
      - org: Initia Labs
    date: 2026
  INITIA-CHAIN-REGISTRY:
    title: "Initia chain registry"
    target: https://github.com/initia-labs/initia-registry/blob/main/mainnets/initia/chain.json
    author:
      - org: Initia Labs
    date: 2026
  INITIA-ASSETLIST:
    title: "Initia asset list"
    target: https://github.com/initia-labs/initia-registry/blob/main/mainnets/initia/assetlist.json
    author:
      - org: Initia Labs
    date: 2026
  INITIA-DOCS:
    title: "Initia documentation"
    target: https://docs.initia.xyz/
    author:
      - org: Initia
    date: 2026
---

--- abstract

This document defines the "charge" intent for the "initia" payment
method within the Payment HTTP Authentication Scheme
{{I-D.httpauth-payment}}. It specifies how clients and servers complete
one-time payments using any Cosmos SDK coin on Initia Stack mainnets using standard HTTP
payment challenge, credential, and receipt artifacts.

This v1 profile is intentionally constrained for interoperability and
rollout safety. It is mainnet-only and transaction-
credential-only (server-broadcast mode). The server verifies strict
transfer semantics against challenge parameters, settles the transaction
on-chain, and returns a receipt whose reference is the transaction hash.

--- middle

# Introduction

HTTP Payment Authentication {{I-D.httpauth-payment}} defines a
challenge-response mechanism that gates access to resources behind
payments. This document registers the "charge" intent for the
"initia" payment method.

The Initia Stack comprises Initia mainnet and additional Cosmos SDK-
based chains whose metadata is published in the Initia registry
{{INITIA-MAINNETS}}. These chains share the same `MsgSend`-based payment
shape, `init` bech32 addressing, and registry-driven chain and asset
metadata {{INITIA-DOCS}}.

This specification defines an intentionally narrow first profile for
mainnet transfers of Cosmos SDK coins on Initia Stack chains. The method
is defined in terms of standard `MsgSend` semantics, where the
challenged payment amount is a Cosmos SDK coin identified by its denom
and integer amount. The Initia mainnet (`interwoven-1`) chain entry and
its asset list {{INITIA-CHAIN-REGISTRY}} {{INITIA-ASSETLIST}} are used
in examples, but the method is not limited to that chain or asset set.

## V1 Profile Scope

This profile supports exactly one credential type:
`type="transaction"`. The client signs transaction bytes and the server
broadcasts them after verifying they match the challenge. Optional fee
sponsorship is supported through `methodDetails.feePayer`.

Future revisions MAY define additional credential types or broaden asset
support, but those extensions are out of scope for this version.

## Charge Flow

The following diagram illustrates the Initia charge flow:

~~~
   Client                       Server                    Initia Network
      |                            |                             |
      |  (1) GET /resource         |                             |
      |------------------------->  |                             |
      |                            |                             |
      |  (2) 402 Payment Required  |                             |
      |      method="initia"       |                             |
      |<-------------------------  |                             |
      |                            |                             |
      |  (3) Sign payment tx       |                             |
      |                            |                             |
      |  (4) Authorization:        |                             |
      |      Payment <credential>  |                             |
      |------------------------->  |                             |
      |                            |  (5) Verify semantics       |
      |                            |      + sponsor if needed    |
      |                            |-------------------------->  |
      |                            |  (6) Committed inclusion    |
      |                            |<--------------------------  |
      |  (7) 200 OK + Receipt      |                             |
      |<-------------------------  |                             |
      |                            |                             |
~~~

## Relationship to the Charge Intent

This document inherits the shared request semantics of the
"charge" intent from {{I-D.payment-intent-charge}}. It defines
only the Initia-specific `methodDetails`, `payload`, verification,
and settlement procedures for the "initia" payment method.

# Requirements Language

{::boilerplate bcp14-tagged}

# Terminology

Initia Stack Coin
: A Cosmos SDK coin on a chain published in the Initia registry
  `mainnets/` directory. In this specification, the `currency` field
  carries the denom and the `amount` field carries the integer amount.

iUSD
: An Initia Stack Cosmos SDK coin used in the Initia mainnet examples in
  this document. Its denom is
  `move/6c69733a9e722f3660afb524f89fce957801fa7e4408b8ef8fe89db9627b570e`
  in {{INITIA-ASSETLIST}}.

MsgSend
: The Cosmos bank transfer message used in this profile to move funds
  from payer to recipient. This specification accepts only a single
  `MsgSend` message per payment transaction.

Fee Payer
: A server-controlled account that pays transaction fees on behalf of
  the client when `methodDetails.feePayer` is `true`.

Consumed Proof
: A transaction hash that has already been accepted for a successful
  payment and is no longer reusable.

# Request Schema

The `request` parameter in the `WWW-Authenticate` challenge contains a
base64url-encoded JSON object. The JSON MUST be a valid JSON text per
{{RFC8259}} and MUST be serialized using JSON Canonicalization Scheme
(JCS) {{RFC8785}} before base64url encoding, per
{{I-D.httpauth-payment}}.

## Shared Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `amount` | string | REQUIRED | Payment amount in base units. MUST be a positive integer string. |
| `currency` | string | REQUIRED | Denom of the Cosmos SDK coin being transferred on the selected Initia Stack chain. |
| `recipient` | string | REQUIRED | Initia Stack bech32 recipient address (`init...`). |
| `description` | string | OPTIONAL | Human-readable payment description. |
| `externalId` | string | OPTIONAL | Merchant reference for reconciliation. |

For this v1 profile, servers MUST source `recipient` from static method
configuration. This method supports any Cosmos SDK coin on Initia Stack
mainnets that can be transferred via a single `MsgSend`. Individual
servers MAY
restrict which denoms they accept as local policy. Clients MUST reject
challenges whose `currency` denom they do not support or do not expect.

Challenge expiry is conveyed by the `expires` auth-param in
`WWW-Authenticate` per {{I-D.httpauth-payment}}.

## Method Details

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `methodDetails.version` | number | OPTIONAL | If present, MUST be `1`. |
| `methodDetails.chainId` | string | OPTIONAL | If present, MUST match a chain ID published under the Initia registry `mainnets/` directory. |
| `methodDetails.feePayer` | boolean | OPTIONAL | Fee sponsorship flag. Defaults to `false`. |
| `methodDetails.feePayerAddress` | string | Conditional | REQUIRED when `feePayer=true`; MUST be an Initia Stack bech32 sponsor address. |

Example:

~~~json
{
  "amount": "1000000",
  "currency": "move/6c69733a9e722f3660afb524f89fce957801fa7e4408b8ef8fe89db9627b570e",
  "recipient": "init1xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
  "methodDetails": {
    "chainId": "interwoven-1",
    "feePayer": true,
    "feePayerAddress": "init1sponsorxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
  }
}
~~~

When `feePayer` is `false` or omitted, the signed transaction MUST be
directly broadcastable by the server as submitted. When `feePayer` is
`true`, the transaction MUST satisfy challenge sponsorship policy and
MUST be compatible with server-side sponsor signing before broadcast.

# Credential Schema

The credential in the `Authorization` header contains a base64url-
encoded JSON object per {{I-D.httpauth-payment}}.

## Credential Structure

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `challenge` | object | REQUIRED | Exact echo of the challenge auth-params. |
| `payload` | object | REQUIRED | Initia-specific payload object. |
| `source` | string | OPTIONAL | Payer identifier; SHOULD be the payer's `init...` address on the selected Initia Stack chain. |

## Transaction Payload {#transaction-payload}

In this v1 profile, the only valid credential payload uses
`type="transaction"`. The client provides signed transaction bytes for
the server to broadcast.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `type` | string | REQUIRED | `"transaction"` |
| `transaction` | string | REQUIRED | Base64-encoded signed transaction bytes. |

The decoded transaction MUST represent a signed Initia transaction whose
payment effects are fully determined by a single `MsgSend` matching the
challenge parameters. No other payload types are valid in v1.

Example (decoded):

~~~json
{
  "challenge": {
    "id": "pA9xQv2mN8kJr4sT1dEfGh",
    "realm": "api.example.com",
    "method": "initia",
    "intent": "charge",
    "request": "eyJ...snip...",
    "expires": "2026-04-01T12:05:00Z"
  },
  "source": "init1payerxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
  "payload": {
    "type": "transaction",
    "transaction": "Cp8BCpwBCh8KHS9jb3Ntb3MuYmFuay52MWJldGExLk1zZ1NlbmQS..."
  }
}
~~~

# Fee Sponsorship {#fee-sponsorship}

Fee sponsorship is OPTIONAL and defaults to `false`.

## Client-Paid Fees

When `feePayer` is `false` or omitted, the client signs a standard
payment transaction and pays fees from its own account. The server
verifies semantics and broadcasts without adding signatures.

## Server-Paid Fees

When `feePayer` is `true`:

1. The challenge MUST include `methodDetails.feePayer=true` and
   `feePayerAddress`.
2. The credential transaction MUST set fee payer intent consistently
   with `feePayerAddress`.
3. The server MUST add sponsor signature material before broadcast.
4. The server MUST reject if sponsor signing or sponsor fee payment
   cannot complete.

## Fail-Closed Policy

If sponsorship cannot complete, for example due to insufficient sponsor
balance or signer failure, the server MUST reject the request and MUST
NOT silently downgrade the same attempt to client-paid mode.

## Sponsor Concurrency Constraint

For each sponsor key, the server MUST process at most one in-flight
sponsored transaction at a time.

# Verification Procedure {#verification}

Upon receiving a request with an Initia credential, the server MUST:

1. Decode the base64url credential and parse the JSON.
2. Verify that `payload.type` is present and equals `"transaction"`.
3. Look up the stored challenge using `credential.challenge.id`.
4. Verify that all fields in `credential.challenge` exactly match the
   stored challenge auth-params.
5. Reject expired or otherwise invalid challenges.
6. Proceed with transaction-specific verification as described in
   {{transaction-verification}}.

## Transaction Verification {#transaction-verification}

For credentials with `type="transaction"`, servers MUST:

1. Decode the base64 `payload.transaction` value.
2. Parse the signed transaction bytes.
3. Validate sponsorship consistency with the challenge policy.
4. Verify that the transaction contains exactly one message.
5. Verify that the message is `MsgSend`.
6. Verify that the `MsgSend` amount contains exactly one coin denom.
7. Verify that the denom exactly matches the challenged `currency`.
8. Verify that the amount exactly matches the challenged `amount`.
9. Verify that the recipient exactly matches the challenged `recipient`.
10. If `credential.source` is an Initia bech32 address, verify it
    equals `MsgSend.from_address`.

Servers MAY impose additional structural requirements, such as allowed
memo fields, fee bounds, or gas policy, as local policy before
broadcasting.

Servers MUST reject reused consumed hashes.

# Settlement Procedure

Only transaction (server-broadcast) settlement is defined in v1.

1. The client submits `Authorization: Payment <credential>`.
2. The server verifies the credential per {{verification}}.
3. If `feePayer=true`, the server adds sponsor signature material.
4. The server broadcasts the transaction to the selected Initia Stack mainnet.
5. The server waits for successful committed inclusion.
6. The server derives `txHash` as the settlement reference.
7. The server atomically marks `txHash` consumed in the replay store.
8. The server returns the protected resource with `Payment-Receipt`.

## Confirmation Requirements

Servers MUST wait for successful committed inclusion before returning a
`Payment-Receipt` header. Servers SHOULD NOT assume a fixed confirmation
latency.

## Receipt Generation

Upon successful settlement, servers MUST return a `Payment-Receipt`
header per {{I-D.httpauth-payment}}. Servers MUST NOT include a
`Payment-Receipt` header on error responses.

The receipt payload for Initia charge:

| Field | Type | Description |
|-------|------|-------------|
| `method` | string | `"initia"` |
| `challengeId` | string | Challenge `id` from `WWW-Authenticate` |
| `reference` | string | Transaction hash of the settlement transaction |
| `status` | string | `"success"` |
| `timestamp` | string | {{RFC3339}} settlement time |

The `reference` field MUST contain the transaction hash only in v1.

# Error Responses

When rejecting a credential, the server MUST return HTTP 402 (Payment
Required) with a fresh `WWW-Authenticate: Payment` challenge per
{{I-D.httpauth-payment}}. The server SHOULD include a response body
conforming to Problem Details {{RFC9457}} with
`Content-Type: application/problem+json`.

Servers MUST use the standard problem types defined in
{{I-D.httpauth-payment}}: `malformed-credential`, `invalid-challenge`,
and `verification-failed`. The `detail` field SHOULD contain a
human-readable description of the specific failure.

Servers MUST include `Cache-Control: no-store` on failure responses and
MUST NOT include `Payment-Receipt` on failure responses.

# Security Considerations

## Replay Protection

Servers MUST enforce single-use consumed-hash semantics. A transaction
hash accepted for one successful payment MUST NOT be accepted again.

## Challenge Binding

Servers MUST enforce full challenge-echo equality checks before
settlement. If a challenge includes a request-body `digest` auth-param,
the server MUST verify it against the retried HTTP request before the
payment succeeds.

## Exact Transfer Integrity

Servers MUST enforce exact amount, currency, and recipient equality.
This v1 profile accepts only a single-message `MsgSend` transaction,
which intentionally narrows the attack surface.

## Fee Sponsorship Risks

Sponsored deployments accept financial risk in exchange for a smoother
payment UX.

**Denial of Service**: Malicious clients could submit credentials that
appear valid but fail during sponsor completion or broadcast. Servers
SHOULD implement rate limiting and sponsor balance checks.

**Fail-Closed Requirement**: Servers MUST reject requests when
sponsorship cannot complete and MUST NOT silently fall back to client-
paid mode.

**Sponsor Sequence Safety**: The v1 serialized sponsor pipeline
mitigates sequence races by permitting at most one in-flight sponsored
transaction per sponsor key.

## Credential Handling

Implementations MUST avoid logging raw credentials or full signed
transaction payloads. Transport security with TLS 1.2 or higher is
REQUIRED.

## No Unpaid Side Effects

Protected operations MUST NOT trigger paid-side effects before
successful payment settlement.

# IANA Considerations

## Payment Method Registration

This document registers the following payment method in the "HTTP Payment
Methods" registry established by {{I-D.httpauth-payment}}:

| Method Identifier | Description | Reference |
|-------------------|-------------|-----------|
| `initia` | Initia Stack blockchain Cosmos SDK coin transfer payment method | This document |

Contact: Sawit Trisirisatayawong (<sawit@initia.xyz>)

## Payment Intent Registration

This document registers the following payment intent in the "HTTP
Payment Intents" registry established by {{I-D.httpauth-payment}}:

| Intent | Applicable Methods | Description | Reference |
|--------|--------------------|-------------|-----------|
| `charge` | `initia` | One-time Initia Stack Cosmos SDK coin transfer | This document |

--- back

# ABNF Collected

~~~ abnf
initia-charge-challenge = "Payment" 1*SP
  "id=" quoted-string ","
  "realm=" quoted-string ","
  "method=" DQUOTE "initia" DQUOTE ","
  "intent=" DQUOTE "charge" DQUOTE ","
  "request=" base64url-nopad

initia-charge-credential = "Payment" 1*SP base64url-nopad

; Base64url encoding without padding per RFC 4648 Section 5
base64url-nopad = 1*( ALPHA / DIGIT / "-" / "_" )
~~~

# Example

**Challenge:**

~~~http
HTTP/1.1 402 Payment Required
WWW-Authenticate: Payment id="pA9xQv2mN8kJr4sT1dEfGh",
  realm="api.example.com",
  method="initia",
  intent="charge",
  request="eyJhbW91bnQiOiIxMDAwMDAwIiwiY3VycmVuY3kiOiJtb3ZlLzZjNjk3MzNhOWU3MjJmMzY2MGFmYjUyNGY4OWZjZTk1NzgwMWZhN2U0NDA4YjhlZjhmZTg5ZGI5NjI3YjU3MGUiLCJyZWNpcGllbnQiOiJpbml0MXh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eCIsIm1ldGhvZERldGFpbHMiOnsiY2hhaW5JZCI6ImludGVyd292ZW4tMSIsImZlZVBheWVyIjp0cnVlLCJmZWVQYXllckFkZHJlc3MiOiJpbml0MXNwb25zb3J4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eCJ9fQ",
  expires="2026-04-01T12:05:00Z"
Cache-Control: no-store
~~~

The `request` decodes to:

~~~json
{
  "amount": "1000000",
  "currency": "move/6c69733a9e722f3660afb524f89fce957801fa7e4408b8ef8fe89db9627b570e",
  "recipient": "init1xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
  "methodDetails": {
    "chainId": "interwoven-1",
    "feePayer": true,
    "feePayerAddress": "init1sponsorxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
  }
}
~~~

This requests a transfer of 1.00 iUSD (1000000 base units).

**Credential:**

~~~http
GET /resource HTTP/1.1
Host: api.example.com
Authorization: Payment eyJjaGFsbGVuZ2UiOnsiaWQiOiJwQTl4UXYybU44a0pyNHNUMWRFZkdoIiwicmVhbG0iOiJhcGkuZXhhbXBsZS5jb20iLCJtZXRob2QiOiJpbml0aWEiLCJpbnRlbnQiOiJjaGFyZ2UiLCJyZXF1ZXN0IjoiZXlKLi4uc25pcC4uLiIsImV4cGlyZXMiOiIyMDI2LTA0LTAxVDEyOjA1OjAwWiJ9LCJzb3VyY2UiOiJpbml0MXBheWVyeHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4IiwicGF5bG9hZCI6eyJ0eXBlIjoidHJhbnNhY3Rpb24iLCJ0cmFuc2FjdGlvbiI6IkNwOEJDcHdCQ2g4S0hTOWpiM050YjNNdVltRnVheTUyTVdKbGRHRXhMa01sWjFKbGJtUVMuLi4ifX0
~~~

**Success Response:**

~~~http
HTTP/1.1 200 OK
Cache-Control: private
Payment-Receipt: eyJtZXRob2QiOiJpbml0aWEiLCJjaGFsbGVuZ2VJZCI6InBBOXhRdjJtTjhrSnI0c1QxZEVmR2giLCJyZWZlcmVuY2UiOiI0RkY4M0Q2RkJDM0YxQ0EyQjMyOTg1MEYxMTA4N0E2MDA3RjA2QjE2NkI5QjYxQzY3QjQ1N0M2MUQxQjI2NDUiLCJzdGF0dXMiOiJzdWNjZXNzIiwidGltZXN0YW1wIjoiMjAyNi0wNC0wMVQxMjowNDoxMVoifQ
Content-Type: application/json

{"data":"paid content"}
~~~

The receipt decodes to:

~~~json
{
  "method": "initia",
  "challengeId": "pA9xQv2mN8kJr4sT1dEfGh",
  "reference": "4FF83D6FBC3F1CA2B329850F11087A6007F06B166B9B61C67B457C61D1B2645",
  "status": "success",
  "timestamp": "2026-04-01T12:04:11Z"
}
~~~
