---
title: Shared Payment Token Charge Intent for HTTP Payment Authentication
abbrev: SPT Charge
docname: draft-spt-charge-00
version: 00
category: info
ipr: noModificationTrust200902
submissiontype: IETF
consensus: true

author:
  - name: James Armstead
    ins: J. Armstead
    email: james@basistheory.com
    org: Basis Theory
  - name: Lucas Chociay
    ins: L. Chociay
    email: lucas@basistheory.com
    org: Basis Theory

normative:
  RFC2119:
  RFC3339:
  RFC4648:
  RFC8174:
  RFC8259:
  RFC8785:
  RFC9110:
  RFC9457:
  I-D.httpauth-payment:
    title: "The 'Payment' HTTP Authentication Scheme"
    target: https://datatracker.ietf.org/doc/draft-ryan-httpauth-payment/
    author:
      - name: Jake Moxey
    date: 2026-01
  I-D.payment-intent-charge:
    title: Charge Intent for HTTP Payment Authentication
    target: https://datatracker.ietf.org/doc/draft-payment-intent-charge/
    author:
      - name: Jake Moxey
    date: 2026-03
---

--- abstract

This document defines a processor-neutral Shared Payment Token (SPT) profile
for the "charge" intent in the Payment HTTP Authentication Scheme.

The profile describes how an HTTP server can request an immediate one-time
payment, how a client or client enabler can obtain a single-use shared payment
token from a payment processor, and how the server can settle the payment with
that processor without exposing processor-specific object models in the HTTP
challenge.

The goal is to let any payment processor participate in an SPT-style payment
flow through a common challenge, credential, verification, settlement, and
receipt model.

--- middle

# Introduction

Payment HTTP Authentication {{I-D.httpauth-payment}} defines a payment
challenge-response pattern using HTTP 402 {{RFC9110}}, the `WWW-Authenticate`
header, the `Authorization` header, and an optional `Payment-Receipt` header.
The "charge" intent {{I-D.payment-intent-charge}} represents an immediate,
one-time payment.

This profile specifies a generic SPT implementation of that intent.

An SPT is an opaque, processor-issued, single-use token that represents a
payer-authorized grant to collect a bounded payment from a payment instrument.
The token is "shared" because it is created in a payer or client context and
then presented to a merchant, server, or platform that can redeem it with the
issuing processor.

This profile intentionally avoids processor-specific terminology. It does not
require a processor to expose any particular internal object names, lifecycle
states, marketplace model, or API parameter names. Instead, it defines the
contract that all SPT-capable processors need to satisfy:

* the payer can authorize a bounded payment grant;
* the grant can be represented as an opaque token;
* the token can be presented by a server to the issuing processor;
* the processor can reject replay, scope mismatch, expiry, or invalid tokens;
* the server can produce a processor-neutral payment receipt after successful
  authorization or capture.

# Requirements Language

The terms "MUST", "MUST NOT", "REQUIRED", "SHALL", "SHALL NOT", "SHOULD",
"SHOULD NOT", "RECOMMENDED", "NOT RECOMMENDED", "MAY", and "OPTIONAL" are to
be interpreted as described in BCP 14 when, and only when, they appear in all
capitals {{RFC2119}} {{RFC8174}}.

# Goals and Non-Goals

## Goals

This profile is designed to:

* define a processor-neutral SPT vocabulary;
* preserve the Payment HTTP Authentication challenge and credential structure;
* let clients support multiple processors through the same payment flow;
* let servers expose one payment method profile while routing settlement to
  different processors;
* prevent client-controlled settlement routing, fee manipulation, and recipient
  substitution;
* support direct merchant, platform, marketplace, facilitator, and multi-party
  settlement models;
* keep sensitive payment instrument details out of HTTP application messages;
* make the processor-specific integration points explicit without leaking
  processor-specific terms into the wire profile.

## Non-Goals

This profile does not:

* define a universal payment processor API;
* require processors to expose the same internal objects or state machines;
* define refund, dispute, payout, reporting, reconciliation, or compliance
  workflows beyond what is needed for the immediate charge flow;
* define card-network, bank-network, wallet, or real-time-payment scheme rules;
* define wallet UX, payer authentication UX, or strong customer authentication
  UX;
* guarantee that settlement funds are finally cleared before resource access is
  granted;
* remove merchant, platform, or processor obligations under payment network
  rules or applicable law.

# Terminology

Shared Payment Token (SPT):
: An opaque, processor-issued, single-use token representing a bounded payer
  authorization to collect payment. The token value is processor-specific and
  MUST be treated as a bearer credential by all parties that receive it.

Processor:
: A payment processor, acquirer, payment facilitator, wallet provider, network,
  or other service capable of issuing or redeeming SPTs.

Processor Identifier:
: A stable lowercase identifier or HTTPS origin that identifies the processor
  that issued or will redeem an SPT.

Client:
: The HTTP client attempting to access a paid resource.

Client Enabler:
: Software acting for the client or payer that can evaluate a payment
  challenge, invoke processor or wallet capabilities, authenticate the payer if
  needed, and obtain an SPT.

Agent:
: Software acting on behalf of a payer to discover goods or services, evaluate
  terms, negotiate capabilities, and initiate payment. An agent may be the
  Client, may operate through a Client Enabler, or may be a higher-level
  commerce orchestrator above HTTP Payment Authentication.

Server:
: The HTTP origin protecting a resource with Payment HTTP Authentication.

Server Enabler:
: Software acting for the server or merchant that can issue payment challenges,
  validate credentials, redeem SPTs, and produce receipts.

Payer:
: The person, agent, account, or organization authorizing the payment.

Recipient:
: The merchant, platform, seller, or recipient that is intended to receive or
  benefit from the payment.

Resource:
: The HTTP resource protected by a payment requirement.

Settlement:
: The processor-side operation that turns an accepted SPT into an authorized,
  captured, or otherwise payable transaction according to processor rules.

Settlement Policy:
: Server-side trusted configuration that determines account context, recipient,
  platform fee, split settlement, transfer routing, statement descriptors,
  metadata, and reconciliation identifiers.

Allowance:
: A bounded authorization envelope for delegated payment use. An allowance
  commonly includes maximum amount, currency, recipient or merchant identifier,
  checkout/session identifier, expiry, and reason.

Processor Profile:
: A processor-declared SPT capability profile. A processor profile identifies
  the processor behavior, merchant configuration, supported instruments,
  delegated-payment requirements, and settlement capabilities used behind the
  opaque SPT. The generic SPT method does not expose those internals as
  separate payment routes.

Checkout Session:
: A commerce session, quote, order attempt, or resource access session whose
  authoritative state is maintained by the seller or server and whose payment
  may be completed using an SPT.

Challenge Binding:
: The server-side and processor-side association between an SPT and the exact
  payment challenge that caused it to be created.

Token Scope:
: The bounded set of constraints under which an SPT may be redeemed, including
  amount, currency, recipient, processor, expiration, challenge identifier, resource
  origin, request body digest, and any additional constraints
  agreed by the processor and client enabler.

# Actor Model

This profile has five logical actors:

* Client: requests the protected resource and submits the Payment credential.
* Client Enabler: obtains the SPT after payer approval.
* Server: issues the 402 challenge and returns the protected resource.
* Server Enabler: redeems the SPT and verifies settlement.
* Processor: issues and redeems the SPT.

A deployment MAY combine actors. For example, a browser wallet can act as the
Client Enabler. A merchant backend can act as the Server Enabler. A platform can
act as Server Enabler for many merchants.

The trust boundaries are:

* The server MUST NOT trust client-provided settlement routing.
* The processor MUST NOT redeem an SPT outside its token scope.
* The client enabler MUST NOT create an SPT unless the payer or delegated payer
  policy has approved the challenge.
* The server enabler MUST treat the SPT as a bearer credential until redeemed.

# Relationship to Payment HTTP Authentication

This profile uses the Payment HTTP Authentication Scheme unchanged.

The server issues:

~~~
HTTP/1.1 402 Payment Required
WWW-Authenticate: Payment id="...",
    realm="api.example.com",
    method="spt",
    intent="charge",
    expires="...",
    request="..."
~~~

The client submits:

~~~
Authorization: Payment <base64url-jcs-json-credential>
~~~

On successful payment and access, the server SHOULD return:

~~~
Payment-Receipt: <base64url-jcs-json-receipt>
~~~

The `request` parameter is a base64url-encoded {{RFC4648}} JSON object
{{RFC8259}} serialized with JSON Canonicalization Scheme (JCS) {{RFC8785}}.
The `Authorization` credential contains the original challenge and a
method-specific payload.

# Method Identifier and Profile Identifier

## Preferred Generic Method Identifier

This profile defines the generic payment method identifier:

~~~
spt
~~~

The method identifier is case-sensitive and MUST be lowercase.

## Processor-Specific Method Identifiers

A processor MAY define its own registered payment method identifier and still
claim conformance with this SPT profile. In that case:

* the method-specific document MUST identify the SPT profile version it
  implements;
* processor-specific fields MUST be placed under extension containers unless
  they are required for interoperable SPT issuance;
* the credential payload MUST preserve the generic `sharedPaymentToken` field or
  define an unambiguous alias;
* the receipt MUST preserve the common receipt fields defined in this document.

## Profile Version

The challenge MAY include:

~~~
"profile": "spt-charge-2026-06"
~~~

If omitted, clients MUST interpret the challenge according to the version
identified by the payment method registry entry.

# SPT Charge Flow

The SPT charge flow is:

1. The client requests a protected resource.
2. The server returns `402 Payment Required` with a Payment challenge.
3. The client enabler decodes the challenge, validates the server origin and
   payment terms, and selects a processor-capable payment instrument.
4. The client enabler requests an SPT from the selected processor. The issuance
   request includes the token scope derived from the challenge.
5. The processor authenticates the payer if needed, applies risk and compliance
   controls, and returns an SPT.
6. The client resubmits the original HTTP request with a Payment credential
   containing the challenge and SPT payload.
7. The server validates the challenge, extracts the SPT, and redeems it with
   the processor using server-side settlement policy.
8. The processor verifies the SPT, rejects replay or scope mismatch, and
   creates the payable transaction.
9. The server returns the protected resource with a `Payment-Receipt` header.

SPT issuance and SPT redemption MAY be performed by the same processor endpoint
or by different endpoints within the same processor trust domain.

## Processor Selection

A server can advertise one or more SPT-capable processors. Each processor
entry identifies a processor and, optionally, the processor profile or merchant
configuration profile to use for this challenge.

The generic SPT method does not require the server to enumerate card, wallet,
bank-account, network-token, or other underlying payment routes. An SPT is the
credential type. The selected processor is responsible for determining which
underlying instruments, payer authentication methods, risk checks, exemptions,
and settlement paths are available for the recipient and processor profile.

For interoperability, servers that support more than one processor SHOULD use
one generic `method="spt"` challenge with `methodDetails.processors[]`. This
lets the client enabler choose among supported SPT processors without creating
multiple method variants or leaking processor-specific instrument routing into
the generic challenge.

The singular `methodDetails.processor` field is a shorthand for simple
deployments where only one processor is offered. The
`methodDetails.processors[]` array is the authoritative list of selectable
processors when more than one processor is offered.

When multiple processors are present, the client enabler SHOULD select exactly
one processor and include its identifier in the credential payload. The server
MUST verify that the selected processor was offered in the original challenge
and is still valid for the order or resource state.

The SPT returned in the credential is always issued by exactly one selected
processor. The credential payload MUST identify that processor with
`payload.processor`.

This keeps the generic SPT profile extensible for cards, wallets, bank
accounts, network tokens, processor tokens, and future payment instruments
without creating a new HTTP payment method for every processor-specific
combination.

# Request Schema

The `request` parameter contains a base64url-encoded JCS JSON object.

## Shared Charge Fields

The following fields are shared across SPT charge requests:

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `amount` | string | REQUIRED | Amount in base units encoded as a decimal string with no separators. |
| `currency` | string | REQUIRED | ISO 4217 alphabetic code or another registered asset code. SHOULD be lowercase for fiat currencies. |
| `description` | string | OPTIONAL | Human-readable description for payer display only. MUST NOT be used as the source of truth for verification. |
| `externalId` | string | OPTIONAL | Server-side order, cart, invoice, session, or resource identifier. |
| `sessionId` | string | OPTIONAL | Checkout, quote, order-attempt, or resource-access session identifier to which the SPT should be scoped. |
| `allowance` | object | OPTIONAL | Explicit delegated-payment allowance constraints. If omitted, amount/currency/expires and processor profile form the minimum allowance. |
| `profile` | string | OPTIONAL | SPT profile version identifier. |
| `methodDetails` | object | REQUIRED | SPT-specific details needed by the client enabler to obtain a token. |

The `amount` field represents the maximum amount the server intends to collect
for this challenge. The server MUST NOT collect more than this amount using the
credential produced for the challenge.

The `currency` field MUST be included in token scope. Clients MUST NOT create
an SPT if the displayed or expected currency differs from the challenge.

Challenge expiry is conveyed by the `expires` auth-param in
`WWW-Authenticate`. Request objects SHOULD NOT duplicate the expiry value.

### `allowance` Object

The `allowance` object expresses delegated-payment constraints in a portable
form without requiring checkout-specific field names.

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `reason` | string | OPTIONAL | Usage reason. Initial values: `one-time`, `metered`, `session`, `subscription-initial`. Defaults to `one-time` for the charge intent. |
| `maxAmount` | string | OPTIONAL | Maximum permitted charge amount in base units. MUST NOT exceed `amount`. |
| `currency` | string | OPTIONAL | Currency for the allowance. MUST match `currency` when present. |
| `recipientId` | string | OPTIONAL | Processor-recognized recipient, seller, merchant, account, or profile identifier authorized to use the token. SHOULD match `methodDetails.recipient.id` when that field is present. |
| `sessionId` | string | OPTIONAL | Session, quote, checkout, or order-attempt identifier authorized to use the token. |
| `expiresAt` | string | OPTIONAL | RFC3339 {{RFC3339}} token allowance expiry. MUST NOT be later than the challenge `expires` auth-param. |

Processors MUST enforce the effective allowance. The effective allowance is the
most restrictive combination of the challenge amount/currency/expires,
processor profile, recipient scope when supplied, and the explicit `allowance`
object.

## Method Details

The `methodDetails` object has the following structure:

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `processor` | object | OPTIONAL | Single offered processor identity and discovery information. This is shorthand for simple one-processor deployments and is REQUIRED when `processors` is absent. |
| `processors` | array[object] | OPTIONAL | Processor options the client enabler may choose from. |
| `recipient` | object | OPTIONAL | Processor-recognized recipient, seller, merchant, account, or profile scope to which the SPT should be bound when not fully implied by the selected processor profile. |
| `processorOptions` | object | OPTIONAL | Processor-specific extension fields. |

Unknown fields in `methodDetails` MUST be ignored by clients unless the client
has negotiated support for a strict extension profile that says otherwise.

## `processor` Object

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `id` | string | REQUIRED | Stable processor identifier. SHOULD be lowercase ASCII or an HTTPS origin. |
| `origin` | string | OPTIONAL | HTTPS origin for processor discovery. |
| `profile` | string | OPTIONAL | Processor-declared SPT capability profile. |
| `environment` | string | OPTIONAL | `production`, `sandbox`, or processor-defined environment name. |

If `origin` is present, it MUST use HTTPS. Client enablers MUST reject
non-HTTPS processor origins except in explicitly configured local development
environments.

When `processors` is present, each entry uses the `processor` object schema. A
client enabler that selects a processor from `processors` MUST return that
processor's `id` in `payload.processor`.

## `recipient` Object

The `recipient` object is optional processor-recognized recipient scope. It is
not a general merchant-authored settlement instruction and is not intended to
expose private payout routing.

Servers SHOULD populate this object only when the server enabler has a stable
processor-recognized identifier that should be challenge-bound, such as a
seller profile, merchant account, platform sub-merchant, network profile, or
recipient profile. When the selected processor profile already implies the
recipient or merchant account context, servers MAY omit `recipient`.

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `id` | string | REQUIRED | Processor-recognized recipient, merchant, seller, platform, account, or profile identifier. |
| `displayName` | string | OPTIONAL | Human-readable recipient name for payer display. |
| `origin` | string | OPTIONAL | Recipient-controlled HTTPS origin, if different from the resource realm. |
| `country` | string | OPTIONAL | ISO 3166 country code when needed for processor rules. |
| `category` | string | OPTIONAL | Merchant category or business category when needed for payer display or processor profile matching. |

When `recipient` is present, the recipient identifier MUST be included in token
scope. A server MUST NOT redeem an SPT for a recipient other than the recipient
in the challenge unless the processor token itself authorizes the alternate
recipient and the server-side settlement policy permits it.

When `recipient` is absent, the selected processor profile and server-side
settlement policy MUST determine recipient or merchant account context. The
server MUST still verify that the processor outcome is consistent with trusted
server-side configuration before granting access.

The processor profile determines which underlying payment instruments and
authentication flows are available for the recipient. Servers SHOULD NOT enumerate
instrument routes in the generic SPT challenge unless a future extension
profile explicitly requires that disclosure.

## Processor Policy Boundary

Payer authentication, risk evaluation, exemption handling, and payment-source
selection are processor responsibilities. This profile does not define request
or credential fields that attempt to require, prove, or transmit processor-side
authentication, risk, or exemption decisions.

Servers cannot rely on a client to pass advisory authentication or risk hints
to the selected processor. Processors MUST make issuance decisions from their
own policy, merchant configuration, payer context, payment-source context, and
any processor-specific data obtained through trusted channels.

If a processor requires additional payer authentication before issuing an SPT,
it SHOULD complete that interaction before returning the SPT to the client. If
the processor cannot issue or redeem the SPT under its authentication or risk
policy, issuance or redemption fails using processor-specific error handling
that the server enabler maps to this profile's problem details.

Before minting an SPT, the processor MUST evaluate the selected payment source
under the merchant, recipient, or processor profile identified by the challenge.
This evaluation includes the merchant's configured accepted payment methods,
Strong Customer Authentication or equivalent payment-source verification
requirements, exemption policy, regional rules, and risk controls. If the
processor cannot verify that the payment source is eligible for that merchant
context, it MUST NOT mint the SPT.

## `processorOptions`

The `processorOptions` object is reserved for processor-specific extension
fields.

Field names SHOULD use one of:

* reverse-DNS names, for example `com.example.option`;
* namespaced objects, for example `{ "example": { ... } }`;
* registry-defined extension names.

Clients that do not understand an option MUST ignore it unless the option is
also listed in a `requiredExtensions` field defined by a future profile.

# Credential Schema

The Payment credential is a base64url-encoded JCS JSON object with:

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `challenge` | object | REQUIRED | The original Payment challenge fields. |
| `payload` | object | REQUIRED | SPT payload. |

The SPT payload contains:

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `sharedPaymentToken` | string | REQUIRED | Opaque single-use token issued by the processor. |
| `processor` | string | REQUIRED | Processor identifier that issued or redeems the token. |

The `sharedPaymentToken` value is a bearer credential. Servers MUST NOT log it
in plaintext. Servers SHOULD store only a keyed hash or processor reference
after redemption.

The token value is opaque to the server. The server MUST NOT parse it to derive
amount, currency, recipient, payer, or instrument information unless the processor
explicitly documents a signed, authenticated token format and the server
validates it correctly.

# Token Issuance Requirements

An SPT-capable processor MUST issue tokens that are scoped to the payment
authorization accepted by the payer or delegated payer policy.

At minimum, the processor MUST associate the SPT with:

* amount limit;
* currency;
* recipient identifier or recipient account;
* allowance reason;
* checkout/session/resource identifier, when provided;
* expiration time;
* issuing client, payer, or payer account context;
* single-use redemption state;
* processor environment;
* token creation timestamp.

Processors SHOULD provide an SPT issuance operation that accepts the full
Payment challenge context, including the challenge `id`, `realm`, `method`,
`intent`, `expires`, and encoded `request` value. When the full challenge is
provided, the processor SHOULD derive token scope from that challenge instead
of requiring the client enabler to translate every generic SPT field into
processor-specific issuance parameters.

Processors SHOULD additionally bind:

* challenge identifier;
* challenge realm;
* payment method;
* payment intent;
* encoded request value;
* request body digest, when present;
* server or resource origin;
* payer consent text or consent hash, if any.

Processors MUST reject token issuance if the payer is not authorized to use an
eligible payment source under the selected processor profile.

Processors SHOULD expose enough token introspection or redemption error detail
for servers to distinguish:

* invalid token;
* expired token;
* already-used token;
* recipient mismatch;
* amount or currency mismatch;
* processor risk or compliance decline;
* processor unavailable.

Processors MUST NOT require the server to receive raw card numbers, bank
account numbers, wallet credentials, or equivalent sensitive payment instrument
details as part of this profile.

# Verification Procedure

Servers MUST perform verification in this order:

1. Parse the Payment credential.
2. Verify the challenge identifier matches a challenge issued by the server.
3. Verify the challenge has not expired.
4. Verify the challenge is bound to the expected realm, method, intent,
   request, digest, and opaque values.
5. Decode the original `request` object using base64url and JCS rules.
6. Verify the request amount, currency, recipient scope when supplied,
   processor, and resource context against server-side order state.
7. Extract the SPT payload.
8. Verify `processor` is supported for the challenge.
9. Verify any explicit `allowance` constraints are compatible with the order,
    resource, or session state.
10. Verify the SPT has not already been consumed by this server for a successful
   settlement.
11. Redeem or validate the SPT with the processor.
12. Verify the processor response confirms the token scope covers the challenge
    amount, currency, recipient or merchant account context, and expiry.
13. Mark the challenge as consumed only after successful settlement, or record
    a pending idempotent attempt if the processor outcome is ambiguous.

Servers MUST complete challenge validation before sending the SPT to a
processor. This prevents unnecessary exposure of bearer payment credentials on
malformed, expired, or unrelated requests.

## Challenge Binding

Servers MUST bind the challenge identifier to the exact challenge terms.

Binding MUST cover:

* `realm`
* `method`
* `intent`
* `request`
* `expires`, when present
* `digest`, when present
* `opaque`, when present

For this profile, the decoded `request` SHOULD additionally bind:

* amount;
* currency;
* processor identifier;
* recipient identifier, when supplied;
* external identifier;
* session identifier;
* allowance constraints, when present;
* server nonce, when present.

Stateful challenge storage and stateless authenticated challenge identifiers are
both allowed.

## Amount and Currency Verification

Servers MUST verify that the processor settled no more than the challenge
amount and used the challenge currency.

If a processor supports partial capture, the server MAY settle less than the
challenge amount only when server-side order state permits it. The receipt MUST
reflect the settled amount.

The client enabler MUST display or otherwise evaluate the amount and currency
before obtaining an SPT, unless a delegated policy explicitly authorizes
payment without real-time payer interaction.

## Recipient Verification

When the challenge includes recipient scope, servers MUST verify the SPT is
scoped to the intended recipient or to a recipient authorized by trusted
settlement policy.

When the challenge does not include recipient scope, servers MUST verify the
processor outcome against trusted processor profile, merchant account, and
settlement policy configuration.

Processors MUST reject redemption when the recipient, merchant account, or
processor account context does not match token scope.

Client enablers SHOULD display the recipient name when available and resource
origin to the payer when payer interaction occurs.

## Replay Protection

SPTs MUST be single-use.

Processors MUST reject replayed SPTs.

Servers SHOULD maintain a local replay cache keyed by:

* challenge identifier;
* processor identifier;
* keyed hash of SPT;
* idempotency key;
* processor settlement reference, when available.

Servers SHOULD use an idempotency key derived from the challenge identifier and
a keyed hash of the SPT when redeeming with the processor.

## Ambiguous Processor Outcomes

If the server sends an SPT to the processor but the network fails before the
server receives a definitive response, the server MUST NOT blindly retry with a
different idempotency key.

The server SHOULD:

1. retry with the same idempotency key;
2. query processor settlement status by idempotency key or attempt reference;
3. return 402 with a fresh challenge only after determining that no successful
   settlement occurred or that the SPT can no longer be completed.

# Settlement Procedure

Settlement is the processor operation that consumes the SPT and creates an
authorized or captured payment.

The server enabler sends the processor:

* SPT;
* amount;
* currency;
* recipient or account context;
* idempotency key;
* server-side settlement policy;
* challenge identifier or binding evidence;
* external order or reconciliation identifier;
* optional non-sensitive metadata.

The processor MUST either:

* accept and return a successful settlement result;
* reject with a definitive failure reason;
* return a pending or ambiguous result only if the server can later query final
  status.

## Successful Settlement Condition

For the `charge` intent, a server MUST NOT return the protected resource as
paid unless the processor response indicates the payment is accepted for the
resource access policy.

Accepted processor outcomes MAY include:

* immediately captured;
* authorized and guaranteed capturable under server policy;
* processor-confirmed paid;
* irrevocably transferred for the relevant payment rail.

Accepted outcomes MUST NOT include:

* token created but not redeemed;
* processor authorization still pending;
* authorization pending with no guarantee;
* processor risk review pending when server policy requires immediate payment;
* settlement attempt created but failed.

## Idempotency

Servers SHOULD create a settlement idempotency key:

~~~
base64url(HMAC-SHA256(server_secret,
  "spt-charge" || "|" ||
  challenge_id || "|" ||
  processor_id || "|" ||
  hash(sharedPaymentToken)))
~~~

Processors SHOULD accept idempotency keys on SPT redemption.

Processors MUST ensure a replayed idempotent redemption cannot create more than
one payable transaction for the same SPT.

## Settlement Timing

Funds may clear after the HTTP response. This profile distinguishes:

* payment accepted for access;
* funds cleared;
* funds paid out;
* transaction no longer reversible.

The `Payment-Receipt` header only proves that the server accepted processor
confirmation for the access decision. It is not a guarantee of final clearing,
chargeback immunity, or payout completion.

# Receipt Generation

Upon successful settlement, servers SHOULD return a `Payment-Receipt` header.

The decoded receipt JSON contains:

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `method` | string | REQUIRED | Payment method identifier, usually `spt`. |
| `status` | string | REQUIRED | MUST be `success`. |
| `timestamp` | string | REQUIRED | RFC3339 timestamp of server acceptance. |
| `reference` | string | REQUIRED | Server or processor settlement reference safe to expose to the client. |
| `processor` | string | REQUIRED | Processor identifier. |
| `amount` | string | RECOMMENDED | Settled amount in base units. |
| `currency` | string | RECOMMENDED | Settlement currency. |
| `externalId` | string | OPTIONAL | Server external identifier from the challenge. |
| `recipientId` | string | OPTIONAL | Recipient identifier, if safe to expose. |

Servers MUST NOT include a `Payment-Receipt` header on error responses.

Receipts MUST NOT include:

* raw SPT values;
* raw payment instrument details;
* payer secrets;
* processor access tokens;
* private settlement routing not intended for client visibility.

# Error Handling

Payment failures use HTTP 402 with a fresh Payment challenge and a Problem
Details {{RFC9457}} response body. Servers MUST NOT use `Payment-Receipt` on
failure.

Recommended problem type suffixes:

* `invalid-shared-payment-token`
* `shared-payment-token-expired`
* `shared-payment-token-already-used`
* `shared-payment-token-scope-mismatch`
* `unsupported-processor`
* `processor-declined`
* `processor-unavailable`
* `settlement-ambiguous`
* `challenge-expired`
* `challenge-mismatch`

If the processor outcome is ambiguous, the server SHOULD use 202, 409, or 402
according to the surrounding API semantics only if it can avoid duplicate
charges. For Payment HTTP Authentication retries, 402 with a fresh challenge is
appropriate only after the server knows the previous token was not successfully
settled or cannot be settled.

# Processor Discovery

Processors SHOULD expose an HTTPS discovery document at:

~~~
https://processor.example/.well-known/payment-spt-processor
~~~

The discovery document SHOULD be JCS-compatible JSON:

~~~
{
  "issuer": "https://processor.example",
  "processor": "examplepay",
  "profiles": ["spt-charge-2026-06"],
  "environments": ["production", "sandbox"],
  "tokenIssuance": {
    "authorizationEndpoint": "https://processor.example/pay/authorize",
    "tokenEndpoint": "https://processor.example/pay/shared-tokens"
  },
  "redemption": {
    "endpoint": "https://api.processor.example/shared-tokens/redeem",
    "supportsIdempotency": true,
    "supportsIntrospection": true
  },
  "jwksUri": "https://processor.example/.well-known/jwks.json"
}
~~~

Client enablers MAY use discovery to determine whether they can obtain SPTs for
the requested processor.

Server enablers MAY use discovery to validate processor metadata, public keys,
or endpoint configuration, but production settlement configuration SHOULD be
managed through trusted server-side configuration rather than untrusted
challenge fields.

# Settlement Policy and Marketplace Use Cases

SPT challenges often need to support platform or marketplace settlement without
letting clients control fee or routing decisions.

Server-side settlement policy MAY include:

* merchant account context;
* platform account context;
* recipient account;
* platform fee;
* split amount;
* delayed capture setting;
* transfer or payout grouping identifier;
* descriptor text;
* tax treatment;
* risk configuration;
* reconciliation metadata.

Settlement policy MUST be derived from trusted server-side state, such as:

* merchant configuration;
* platform onboarding records;
* order state;
* pricing configuration;
* contract terms;
* risk policy;
* processor account mappings.

Settlement policy MUST NOT be accepted from the client unless the client is
inside an explicit trust boundary authorized to control that policy.

If a settlement policy value must be visible to the payer to support informed
authorization, the value SHOULD be included in the challenge and challenge-bound.
Examples include recipient display name, total amount, currency, and meaningful
description. Examples that usually should remain server-side include platform
fee amount, internal split routing, payout grouping, and processor account
headers.

# Security Considerations

## Bearer Token Handling

SPTs are bearer credentials. Anyone who can redeem a valid SPT within scope can
attempt to collect funds. Clients and servers MUST transmit SPTs only over TLS.
Servers MUST NOT log SPTs in plaintext.

## Single-Use Constraint

Processors MUST enforce single-use redemption. Servers SHOULD also enforce local
single-use challenge handling. Duplicate HTTP requests, client retries, and
network timeouts MUST NOT create duplicate payable transactions.

## Amount and Currency Substitution

Clients MUST verify amount and currency before issuing an SPT. Servers MUST
verify processor settlement amount and currency before granting access.
Processors MUST reject redemption outside token scope.

## Recipient Substitution

The recipient identifier and recipient display context are security-sensitive
when provided. Client enablers SHOULD show the recipient when available.
Processors MUST bind recipient scope into the SPT when recipient scope is
provided, and MUST otherwise bind the SPT to the selected processor profile's
merchant account context. Servers MUST reject unexpected recipient or merchant
account outcomes.

## Challenge Confusion

A credential for one challenge MUST NOT be valid for another challenge unless
server policy explicitly permits it and the processor token scope covers both.
Challenge identifiers MUST be bound to challenge terms.

## Request Body Binding

When a payment challenge applies to a request body, the server SHOULD include a
digest parameter. The server MUST verify the submitted body matches the digest
before settlement.

## Settlement Route Integrity

Fee amounts, destination accounts, split routing, account context, and payout
grouping are server-side policy. Servers MUST NOT accept these values from the
client in the Payment credential. Processors SHOULD allow platforms to enforce
server-authenticated settlement policy separately from payer-facing token scope.

## Processor Impersonation

Clients SHOULD validate processor origins using HTTPS and processor discovery
metadata. Servers SHOULD maintain an allowlist of processors and account
mappings. A malicious server can still advertise a malicious processor; client
enablers should apply payer policy and trust controls before issuing tokens.

## Payer Approval and Delegated Agents

An agent may be allowed to create SPTs under delegated payer policy. Client
enablers and processors SHOULD distinguish real-time payer-present approval
from delegated policy approval. Challenges SHOULD provide enough context for
policy engines to evaluate spending limits, recipient allowlists, and purpose.

## Declines and Information Leakage

Processor decline reasons can leak payer account, risk, or instrument details.
Servers SHOULD expose generic failure messages to clients unless detailed
information is safe and useful. Logs and analytics SHOULD avoid sensitive
processor decline data.

## Caching

402 responses containing payment challenges SHOULD include `Cache-Control:
no-store` unless the challenge is intentionally reusable. Successful responses
with receipts SHOULD follow the resource's normal cache policy, but shared
caches MUST NOT receive payer-specific receipts unless explicitly safe.

## Denial of Service

Servers SHOULD validate challenge structure before processor calls. Processors
SHOULD rate-limit token issuance and redemption. Servers SHOULD avoid issuing
unbounded challenges that can trigger expensive processor checks.

# Privacy and Data Minimization

The challenge SHOULD contain only information needed for payer authorization and
token issuance.

The credential SHOULD contain only the SPT and minimal routing data needed for
server redemption.

The receipt SHOULD contain only client-safe confirmation details.

Implementations SHOULD avoid exposing:

* payer identity;
* raw instrument details;
* internal account mappings;
* platform fee calculations;
* seller risk scores;
* processor decline internals;
* long-lived customer identifiers;
* data not needed for the access decision.

Processors and servers SHOULD define retention limits for SPT hashes,
challenge records, and settlement attempts.

# Compliance Considerations

This profile reduces exposure of raw payment instrument details in HTTP
application messages, but it does not eliminate compliance duties.

Implementers remain responsible for:

* payment network rules;
* payment facilitator and marketplace rules;
* anti-money laundering controls, where applicable;
* sanctions screening, where applicable;
* strong customer authentication or equivalent requirements, where applicable;
* consumer disclosure requirements;
* PCI DSS or equivalent payment data security obligations;
* data protection and privacy obligations.

Servers SHOULD consult processor documentation to determine whether SPT handling
changes their compliance scope. Even opaque tokens may be sensitive and should
be protected accordingly.

# Conformance Requirements

## Client Enabler

A conforming client enabler MUST:

* parse Payment challenges using the Payment HTTP Authentication Scheme;
* validate `method`, `intent`, `amount`, `currency`, recipient scope when
  supplied, and expiry;
* reject unsupported processors;
* select only a processor offered by the challenge;
* obtain an SPT from a processor only after payer approval or delegated payer
  policy authorization;
* include the SPT in `payload.sharedPaymentToken`;
* avoid logging or exposing the SPT outside the credential;
* reject challenges that use insecure processor origins.

A conforming client enabler SHOULD:

* display recipient, amount, currency, and resource origin when payer interaction is
  present;
* support processor selection when a challenge offers multiple processors;
* support processor discovery;
* support delegated payer policy with explicit spending and recipient constraints.

## Server Enabler

A conforming server enabler MUST:

* issue Payment challenges with `method="spt"` or a registered method claiming
  this profile;
* challenge-bind all security-relevant fields;
* validate the challenge before sending the SPT to a processor;
* redeem SPTs only with allowed processors;
* reject credentials that select an unoffered or stale processor;
* use trusted server-side settlement policy;
* enforce idempotency and replay protection;
* return a `Payment-Receipt` only after successful settlement;
* avoid plaintext SPT logging.

A conforming server enabler SHOULD:

* support processor-specific adapters behind the generic profile;
* maintain an allowlist of processors and recipient mappings;
* store keyed hashes of SPTs for replay detection;
* expose stable problem details for common failure modes.

## Processor

A conforming processor MUST:

* issue opaque single-use SPTs;
* scope SPTs to amount, currency, expiry, payer authorization, and recipient or
  merchant account context;
* enforce allowance constraints including maximum amount and recipient/session
  scope when supplied;
* verify the selected payment source is eligible under the merchant, recipient,
  or processor profile before minting an SPT;
* complete any required Strong Customer Authentication or equivalent
  payment-source verification before minting an SPT;
* reject replay;
* reject scope mismatch;
* provide a redemption operation that consumes an SPT atomically;
* provide definitive success or failure when possible;
* support idempotent redemption or an equivalent duplicate-prevention mechanism;
* avoid requiring raw payment instrument details in Payment HTTP credentials.

A conforming processor SHOULD:

* support challenge identifier binding;
* support request or digest binding;
* publish processor profile metadata or support equivalent bilateral
  configuration;
* expose discovery metadata;
* expose introspection or status lookup for ambiguous outcomes;
* return failure categories that map to this profile's problem types.

# IANA Considerations

This document requests registration of the following payment method:

* Method: `spt`
* Description: Shared Payment Token profile for processor-neutral one-time
  charge payments
* Intended usage: common
* Specification: this document

This document uses the existing `charge` payment intent.

Future registries may be useful for:

* SPT problem type suffixes.


# Appendix A. ABNF Collected

~~~
spt-charge-challenge =
  "Payment" 1*SP
  "id=" quoted-string ","
  "realm=" quoted-string ","
  "method=" DQUOTE "spt" DQUOTE ","
  "intent=" DQUOTE "charge" DQUOTE ","
  "request=" base64url-nopad

spt-charge-credential =
  "Payment" 1*SP base64url-nopad

base64url-nopad =
  1*( ALPHA / DIGIT / "-" / "_" )
~~~

# Appendix B. JSON Examples

## Challenge Request

Decoded `request`:

~~~
{
  "amount": "5000",
  "currency": "usd",
  "description": "Premium API access for 1 month",
  "externalId": "order_12345",
  "sessionId": "session_abc123",
  "allowance": {
    "reason": "one-time",
    "maxAmount": "5000",
    "currency": "usd",
    "recipientId": "recipient_9k82h",
    "sessionId": "session_abc123",
    "expiresAt": "2026-06-19T19:30:00Z"
  },
  "profile": "spt-charge-2026-06",
  "methodDetails": {
    "processors": [
      {
        "id": "examplepay",
        "origin": "https://processor.example",
        "profile": "spt-charge-2026-06",
        "environment": "production"
      },
      {
        "id": "anotherpay",
        "origin": "https://payments.another.example",
        "profile": "spt-charge-2026-06",
        "environment": "production"
      }
    ],
    "recipient": {
      "id": "recipient_9k82h",
      "displayName": "Example API, Inc.",
      "origin": "https://api.example.com",
      "country": "US",
      "category": "digital-services"
    }
  }
}
~~~

## HTTP Challenge

~~~
HTTP/1.1 402 Payment Required
Cache-Control: no-store
Content-Type: application/problem+json
WWW-Authenticate: Payment id="ch_7Jr8nVwS2mQ",
    realm="api.example.com",
    method="spt",
    intent="charge",
    expires="2026-06-19T19:30:00Z",
    request="<base64url-jcs-json>"

{
  "type": "https://paymentauth.org/problems/payment-required",
  "title": "Payment Required",
  "status": 402,
  "detail": "This resource requires payment."
}
~~~

## Credential Payload

Decoded credential:

~~~
{
  "challenge": {
    "id": "ch_7Jr8nVwS2mQ",
    "realm": "api.example.com",
    "method": "spt",
    "intent": "charge",
    "expires": "2026-06-19T19:30:00Z",
    "request": "<base64url-jcs-json>"
  },
  "payload": {
    "sharedPaymentToken": "tok_shared_test_8xY2mN4qP",
    "processor": "examplepay"
  }
}
~~~

## Receipt

Decoded receipt:

~~~
{
  "method": "spt",
  "status": "success",
  "timestamp": "2026-06-19T19:28:11Z",
  "reference": "settlement_6N7pQa2",
  "processor": "examplepay",
  "amount": "5000",
  "currency": "usd",
  "externalId": "order_12345",
  "recipientId": "recipient_9k82h"
}
~~~

# Appendix C. Non-Normative Processor API Shapes

This appendix is illustrative only. It does not define a required processor API.

## Token Issuance

~~~
POST /shared-payment-tokens
Content-Type: application/json

{
  "paymentMethodId": "pm_123",
  "paymentChallenge": {
    "id": "ch_7Jr8nVwS2mQ",
    "realm": "api.example.com",
    "method": "spt",
    "intent": "charge",
    "expires": "2026-06-19T19:30:00Z",
    "request": "<base64url-jcs-json>"
  }
}
~~~

The processor decodes the `request` value, applies merchant and processor
profile configuration, verifies the selected payment method is eligible for the
merchant context, and mints an SPT scoped to the resulting challenge terms.

Response:

~~~
{
  "sharedPaymentToken": "tok_shared_test_8xY2mN4qP",
  "expires": "2026-06-19T19:30:00Z",
  "scope": {
    "amount": "5000",
    "currency": "usd",
    "recipientId": "recipient_9k82h",
    "challengeId": "ch_7Jr8nVwS2mQ",
    "sessionId": "session_abc123"
  }
}
~~~

## Token Redemption

~~~
POST /shared-payment-tokens/redeem
Idempotency-Key: spt_3G7...
Content-Type: application/json

{
  "sharedPaymentToken": "tok_shared_test_8xY2mN4qP",
  "amount": "5000",
  "currency": "usd",
  "recipientId": "recipient_9k82h",
  "externalId": "order_12345",
  "sessionId": "session_abc123",
  "challengeId": "ch_7Jr8nVwS2mQ",
  "settlementPolicy": {
    "mode": "platform",
    "policyRef": "merchant-policy-abc"
  }
}
~~~

Response:

~~~
{
  "status": "succeeded",
  "reference": "settlement_6N7pQa2",
  "amount": "5000",
  "currency": "usd",
  "recipientId": "recipient_9k82h",
  "createdAt": "2026-06-19T19:28:11Z"
}
~~~

# Appendix D. Processor Adoption Checklist

A processor can participate in this profile by implementing:

* SPT issuance scoped to amount, currency, recipient, expiry, and payer approval.
* SPT issuance endpoints that can accept the full MPP `spt` challenge context.
* SPT redemption by authorized server-side merchants or platforms.
* Single-use token enforcement.
* Idempotent redemption.
* Scope mismatch rejection.
* Optional discovery document.
* Error mapping to generic problem types.
* Safe receipt reference generation.
* Documentation for recipient identifiers.
* Documentation for platform and marketplace settlement policy.
* Sandbox test tokens and conformance fixtures.

# Appendix E. Open Questions

1. Should `spt` be a standalone registered payment method, or should this remain
   a conformance profile that processor-specific methods implement?
2. Should processor discovery be mandatory for clients, or is server-provided
   processor metadata enough for v1?
3. Should receipts include authorization-vs-capture status, or should the
   `charge` intent only expose `success` once server policy accepts the outcome?
4. Should delegated agent spending policies have a standard challenge field in
   this profile, or belong in a separate payer-agent authorization profile?
5. Should processor-specific extensions be declared through a registry,
   reverse-DNS field names, or both?
