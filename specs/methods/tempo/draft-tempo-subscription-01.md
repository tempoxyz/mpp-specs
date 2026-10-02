---
title: Tempo Subscription Intent for HTTP Payment Authentication
abbrev: Tempo Subscription
docname: draft-tempo-subscription-01
version: "01"
category: info
ipr: noModificationTrust200902
submissiontype: IETF
consensus: true

author:
  - name: Jake Moxey
    ins: J. Moxey
    email: jake@tempo.xyz
    org: Tempo Labs
  - name: Brendan Ryan
    ins: B. Ryan
    email: brendan@tempo.xyz
    org: Tempo Labs
  - name: Tom Meagher
    ins: T. Meagher
    email: thomas@tempo.xyz
    org: Tempo Labs

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
  I-D.payment-intent-subscription:
    title: "Subscription Intent for HTTP Payment Authentication"
    target: https://datatracker.ietf.org/doc/draft-payment-intent-subscription/
    author:
      - name: Jake Moxey
    date: 2026-04
  TEMPO-ACCOUNT-KEYCHAIN:
    title: "Account Keychain Precompile"
    target: https://docs.tempo.xyz/protocol/precompiles/account-keychain
    author:
      - org: Tempo Labs
  TIP-1011:
    title: "TIP-1011: Enhanced Access Key Permissions"
    target: https://docs.tempo.xyz/protocol/tips/tip-1011
    author:
      - name: Tanishk Goyal
  TIP-1020:
    title: "TIP-1020: Signature Verification Precompile"
    target: https://docs.tempo.xyz/protocol/tips/tip-1020
    author:
      - org: Tempo Labs
  TIP-1028:
    title: "TIP-1028: Address-Level Receive Policies"
    target: https://github.com/tempoxyz/tempo/blob/main/tips/tip-1028.md
    author:
      - org: Tempo Labs
---

--- abstract

This document defines the "subscription" intent for the "tempo"
payment method in the Payment HTTP Authentication Scheme. It specifies
how clients grant servers permission to collect a fixed TIP-20 token
payment once per billing period using recipient-scoped access keys on
the Tempo blockchain. This profile intentionally models the recurring
transfer authorization itself, not a richer billing object.

--- middle

# Introduction

The `subscription` intent on Tempo represents a recurring fixed-amount
TIP-20 payment. The client grants the server a recipient-scoped access
key with a per-period spending limit. Activation registers the key and
collects the first billing-period charge in the same transaction.

A request MAY specify fixed allocations to additional recipients using
`methodDetails.splits`. The server constructs the approved allocation
on activation and renewal. Native access-key permissions restrict the
recipient set and aggregate spending; they do not enforce each share.

This specification inherits the shared `subscription` intent semantics
from {{I-D.payment-intent-subscription}} and defines Tempo-specific
request fields, payloads, and settlement behavior.

This profile is intentionally narrower than a general billing
subscription. It standardizes a recurring token-transfer authorization,
not price catalogs, quantities, prorations, deferred starts, or
billing-anchor resets.

Tempo subscriptions support only key-authorization fulfillment.
Tempo transactions containing standalone `approve` calls and push-mode
hash credentials do not provide the per-period enforcement required for
this intent.

Tempo also imposes an additional constraint that is not part of the
shared intent: the recurring authorization MUST have an explicit expiry.
This method therefore requires a `subscriptionExpires` field because the
underlying Tempo key authorization itself is time-bounded.

Tempo subscriptions also require the {{TIP-1011}} periodic token-limit
and `allowed_calls` restrictions described in this document. Servers
MUST reject request objects on chains or deployments that cannot enforce
those restrictions.

The {{TIP-1011}} features required by this specification, periodic
spending limits, `allowed_calls` target and selector scoping, and
recipient-bound selector rules, are introduced in the Tempo T3 network
upgrade. Servers MUST NOT issue `intent="subscription"` challenges on
chains or deployments running a pre-T3 protocol version.

## Subscription Flow

The following diagram illustrates the Tempo subscription flow:

~~~
   Client                        Server                           Tempo
      │                             │                             │
      │  (1) GET /api/resource      │                             │
      │-------------------------->  │                             │
      │                             │                             │
      │  (2) 402 Payment Required   │                             │
      │      intent="subscription"  │                             │
      │<--------------------------  │                             │
      │                             │                             │
      │  (3) Sign keyAuthorization  │                             │
      │      with period limit      │                             │
      │                             │                             │
      │  (4) Authorization: Payment │                             │
      │-------------------------->  │                             │
      │                             │                             │
      │                             │  (5) Register key +         │
      │                             │      transfer first period  │
      │                             │-------------------------->  │
      │                             │                             │
      │  (6) 200 OK + Receipt       │                             │
      │<--------------------------  │                             │
      │                             │                             │
      │        ... later period ... │                             │
      │                             │                             │
      │                             │  (7) transfer next period   │
      │                             │-------------------------->  │
      │                             │                             │
      │  (8) 200 OK + Receipt       │                             │
      │<--------------------------  │                             │
      │                             │                             │
~~~

# Requirements Language

{::boilerplate bcp14-tagged}

# Terminology

TIP-20
: Tempo's enshrined token standard, implemented as precompiles rather
  than smart contracts. TIP-20 tokens use 6 decimal places and provide
  `transfer`, `transferFrom`, and `approve` operations.

Access Key
: A delegated signing key. For Tempo subscriptions, the access key is
  configured with an expiry timestamp, a per-period token spending
  limit, and a destination restriction.

AccountKeychain Precompile
: The Tempo precompile that manages access-key registration, spending
  limits, and periodic-limit enforcement {{TEMPO-ACCOUNT-KEYCHAIN}}.

# Request Schema

The `request` parameter in the `WWW-Authenticate` challenge contains a
base64url-encoded JSON object. The `request` JSON MUST be serialized
using JSON Canonicalization Scheme (JCS) {{RFC8785}} and
base64url-encoded without padding per {{I-D.httpauth-payment}}.

## Request Fields

Tempo uses the shared `amount`, `currency`, `periodUnit`, `periodCount`,
`subscriptionExpires`, `recipient`, `description`, and `externalId`
fields from {{I-D.payment-intent-subscription}}. Tempo additionally
requires `subscriptionExpires` because Tempo key authorizations must
expire:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `amount` | string | REQUIRED | Fixed payment amount per billing period in base units |
| `currency` | string | REQUIRED | TIP-20 token address |
| `periodUnit` | string | REQUIRED | Billing period unit. The value MUST be `day` or `week` |
| `periodCount` | string | REQUIRED | Positive integer count of `periodUnit` values per billing period |
| `subscriptionExpires` | string | REQUIRED | Subscription expiry timestamp in {{RFC3339}} format |
| `recipient` | string | REQUIRED | Primary recipient; receives the remainder when splits are present |
| `description` | string | OPTIONAL | Human-readable subscription description |
| `externalId` | string | OPTIONAL | Merchant's reference for the subscription |

The `amount` value MUST be a string representation of a positive
integer in base 10 with no sign, decimal point, exponent, or
surrounding whitespace. Leading zeros MUST NOT be used.

The `periodCount` value MUST be a string representation of a positive
integer in base 10 with no sign, decimal point, exponent, or
surrounding whitespace. Leading zeros MUST NOT be used.

Hex values in this profile use lowercase hexadecimal with `0x` prefix
and no padding or truncation. Implementations MUST use lowercase hex
when generating addresses, token identifiers, selectors, and
hex-encoded signed payloads. Implementations SHOULD accept mixed-case
input, but MUST normalize it to lowercase before comparison. Address,
selector, and token-identifier comparisons are by decoded value, not
raw string form.

## Method Details

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `methodDetails.accessKey` | object | REQUIRED | Access key descriptor that the payer authorizes for subscription renewal charges |
| `methodDetails.accessKey.accessKeyAddress` | string | REQUIRED | Address of the access key to authorize |
| `methodDetails.accessKey.keyType` | string | REQUIRED | Access key type. The value MUST be `p256`, `secp256k1`, or `webAuthn` |
| `methodDetails.chainId` | number | OPTIONAL | Tempo chain ID. If omitted, the default value is 42431 (Tempo mainnet). |
| `methodDetails.splits` | array | OPTIONAL | Additional fixed allocations from the total `amount`; see {{subscription-splits}} |

Servers issuing `intent="subscription"` challenges SHOULD include the
`expires` auth-param in `WWW-Authenticate` per {{I-D.httpauth-payment}},
using {{RFC3339}} format. Request objects MUST NOT duplicate the
challenge expiry value. The `subscriptionExpires` field instead defines
when the subscription itself expires.

If the challenge includes `expires`, the `subscriptionExpires` value
MUST be strictly later than the challenge `expires` timestamp. Servers
MUST reject credentials where `subscriptionExpires` is at or before the
challenge `expires`.

Tempo subscriptions map the shared period fields to the {{TIP-1011}}
`TokenLimit` `period` field as follows:

- `periodUnit="day"` maps to `periodCount * 86400` seconds
- `periodUnit="week"` maps to `periodCount * 604800` seconds

Servers MUST reject `periodUnit="month"` because {{TIP-1011}} periodic
token limits are fixed elapsed-time periods and cannot represent
calendar-month billing exactly. Servers MUST reject request objects
where the mapped period cannot be represented as an unsigned 64-bit
integer. Servers MUST reject request objects where `subscriptionExpires`
cannot be represented in the Tempo key authorization expiry field.

**Example:**

~~~json
{
  "amount": "10000000",
  "currency": "0x20c0000000000000000000000000000000000001",
  "periodUnit": "day",
  "periodCount": "30",
  "subscriptionExpires": "2026-07-14T12:00:00Z",
  "recipient": "0x742d35cc6634c0532925a3b844bc9e7595f8fe00",
  "methodDetails": {
    "accessKey": {
      "accessKeyAddress": "0x1111111111111111111111111111111111111111",
      "keyType": "p256"
    },
    "chainId": 42431
  }
}
~~~

The client fulfills this by signing a key authorization with:

- Expiry = `subscriptionExpires`
- Access key = `methodDetails.accessKey`
- Per-period spending limit = `amount`
- Billing period = mapped period in seconds
- Destination restriction = the primary and split recipient set

The signed key authorization MUST additionally configure:

- the exact access-key address and key type from
  `methodDetails.accessKey`
- a `TokenLimit` for `currency` whose `amount` equals the challenge
  `amount` and whose `period` equals the mapped period in seconds
- exactly one `allowed_calls` target scope whose `target` equals
  `currency`
- explicit selector rules for `transfer(address,uint256)`
  (`0xa9059cbb`) and optionally
  `transferWithMemo(address,uint256,bytes32)` (`0x95777d59`)
- a recipient allowlist for each permitted selector containing only the
  challenge `recipient` when no splits are present, or exactly the
  primary and split recipient set when splits are present

The signed key authorization MUST NOT use unrestricted target mode for
the subscription token, and it MUST NOT authorize `approve` or any
other non-transfer selector.

## Fixed Split Allocations {#subscription-splits}

The top-level `amount` remains the total payment per billing period.
Each `methodDetails.splits` entry specifies an additional recipient and
its fixed share in base units of `currency`. The primary `recipient`
receives `amount - sum(splits[].amount)`. The same allocation applies to
activation and every renewal.

Each entry MUST be an object containing `amount` and `recipient`
strings. Split amounts MUST use the positive integer syntax defined for
`amount`.
If present, the array MUST contain at least one entry. The sum of split
amounts MUST be less than the total `amount`. Recipients MUST be unique
by decoded address, including the primary recipient. All legs MUST use
the same `currency`. Array order does not change the allocation.
Clients and servers MUST reject split requests that violate these
constraints.

Servers SHOULD limit splits to ten entries and MAY reject requests
exceeding their supported count.

Clients MUST verify every recipient and share before granting the
authorization. Servers MUST preserve the full allocation in the
authenticated challenge and durably store it with the subscription.
Reuse and renewal MUST match the approved allocation, comparing
addresses by decoded value and amounts by integer value. Servers MUST
NOT change a recipient or share under an existing subscription approval;
changed terms require a fresh challenge and payer authorization.

For split requests, the signed key authorization MUST bind the challenge
by setting its `witness` to the base64url-decoded challenge `id`.
Servers issuing these requests MUST use a challenge identifier that
decodes to 32 bytes and MUST verify the signed witness against it.
The challenge integrity check MUST cover the full split request. This
binds consent to the approved terms; it does not add a native rule
requiring each transaction to use the approved share amounts.

Servers issuing split requests MUST verify the exact recipient set in
the signed authorization. A grant containing only the primary recipient
MUST NOT satisfy such a request. Servers MUST NOT silently fall back to
collecting the total `amount` for the primary recipient. Requests
without splits retain the existing single-recipient behavior.

# Credential Schema

The credential in the `Authorization` header contains a
base64url-encoded JSON object per {{I-D.httpauth-payment}}.

## Credential Structure

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `challenge` | object | REQUIRED | Echo of the challenge from the server |
| `payload` | object | REQUIRED | Tempo-specific payload object |
| `source` | string | OPTIONAL | Payer identifier as a DID (e.g., `did:pkh:eip155:42431:0x...`) |

The `source` field, if present, SHOULD use the `did:pkh` method with
the chain ID applicable to the challenge and the payer's Ethereum
address.

## Key Authorization Payload (type="keyAuthorization")

Subscriptions on Tempo MUST use `type="keyAuthorization"`. The
`signature` field contains the complete signed key authorization
serialized as RLP and hex-encoded with `0x` prefix.

The encoded value MUST be a signed key authorization containing at
least:

- the Tempo chain ID
- the access-key address and key type
- the authorization expiry
- the TIP-20 token spending limit
- the billing-period limit configuration
- the recipient restriction
- the `allowed_calls` scope described above

The embedded signature MUST use a primitive signature type supported by
{{TIP-1020}}. Keychain wrapper signatures MUST NOT be used for this
field.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `signature` | string | REQUIRED | Hex-encoded RLP-serialized signed key authorization |
| `type` | string | REQUIRED | `"keyAuthorization"` |

**Example:**

~~~json
{
  "challenge": {
    "id": "qT8wErYuI3oPlKjH6gFdSa",
    "realm": "api.example.com",
    "method": "tempo",
    "intent": "subscription",
    "request": "eyJ...",
    "expires": "2026-01-15T12:05:00Z"
  },
  "payload": {
    "signature": "0xf8c1...signed authorization bytes...",
    "type": "keyAuthorization"
  },
  "source": "did:pkh:eip155:42431:0x1234567890abcdef1234567890abcdef12345678"
}
~~~

# Settlement Procedure

## Activation and First-Period Charge

For `intent="subscription"`, activation and the first billing-period
charge are a single atomic operation:

~~~
   Client                        Server                           Tempo
      |                             |                             |
      |  (1) Authorization:         |                             |
      |      Payment <credential>   |                             |
      |      (signed keyAuth)       |                             |
      |-------------------------->  |                             |
      |                             |                             |
      |                             |  (2) Construct tx with:     |
      |                             |      - keyAuthorization     |
      |                             |      - transfer(recipient,  |
      |                             |        amount)              |
      |                             |                             |
      |                             |  (3) eth_sendRawTxSync      |
      |                             |-------------------------->  |
      |                             |                             |
      |                             |  (4) Key registered +       |
      |                             |      transfer executed      |
      |                             |<--------------------------  |
      |                             |                             |
      |  (5) 200 OK                 |                             |
      |      Payment-Receipt: ...   |                             |
      |<--------------------------  |                             |
      |                             |                             |
~~~

Servers MUST treat the subscription as active only after the activation
transaction succeeds.

Servers MUST NOT treat activation as successful if the activation
transaction settles at or after `subscriptionExpires`.

When splits are present, the activation transaction MUST contain a
transfer for the primary remainder and each split share. All legs MUST
be in the same transaction. Servers MUST verify the confirmed token,
recipient and amount for every leg before treating activation as
successful. If a transfer memo is used to identify the payment, servers
MUST also verify that memo. Transaction success alone is insufficient;
the receive-policy behavior in {{split-settlement}} applies.

## Renewal

For each later billing period, the server MAY submit one transaction
using the registered access key to transfer `amount` to `recipient`.
When splits are present, that transaction MUST instead contain the same
approved allocation and satisfy the per-leg activation checks above.
Fee sponsorship MUST NOT alter the approved token, recipients or
amounts.

Servers MUST NOT submit more than one successful renewal charge for the
same billing period.

## Billing Anchor and Subscription State

The billing anchor for a Tempo subscription is the block timestamp, or
equivalent consensus settlement timestamp, of the block containing the
successful activation transaction. Servers MUST derive this anchor from
chain settlement data rather than local wall-clock time.

Billing periods are defined as:

- Period 0: `[anchor, anchor + mappedPeriodSeconds)`
- Period 1: `[anchor + mappedPeriodSeconds, anchor + 2*mappedPeriodSeconds)`
- Period N: `[anchor + N*mappedPeriodSeconds, anchor + (N+1)*mappedPeriodSeconds)`

Servers MUST maintain durable local state for each subscription,
including at least:

- subscription identifier
- approved currency, total amount, primary recipient and split
  allocation
- billing anchor
- last charged billing-period index
- any in-flight billing-period index and renewal transaction identifier
- subscription expiry
- revocation status

For split requests, servers MUST validate stored allocations before
submitting a renewal and MUST reject settlement results whose allocation
differs from the approved terms. Reuse of an active subscription MUST
also check those terms.

When granting access in a later billing period, servers MUST:

- Verify the subscription has not expired or been revoked
- Determine the current billing-period index from the anchor and
  the mapped period in seconds
- Verify that the current billing period has not already been charged
- Atomically record any renewal attempt for the current billing period
  as in-flight before submitting the renewal transaction
- Mark the current billing period as charged only after the renewal
  transaction settles successfully
- Grant access only after, or atomically with, durably recording the
  successful renewal charge

For duplicate idempotent requests, servers MUST NOT charge the same
billing period more than once.

{{TIP-1011}} periodic spending limits reset to one billing period of
capacity and do not accumulate across elapsed periods. If one or more
billing periods elapse without a successful renewal charge, a later
transaction authorizes at most one charge in the then-current billing
period. Servers MUST NOT treat missed billing periods as additional
on-chain spending capacity.

## Split Settlement and Receive Policies {#split-settlement}

On deployments implementing {{TIP-1028}}, a TIP-20 transfer can succeed
while a recipient receive policy holds its funds in ReceivePolicyGuard.
Other legs in the same transaction can still credit their recipients.
Token-level policy failures continue to revert. This profile preserves
that native behavior and does not provide
all-recipient-credit-or-revert settlement.

Servers MUST NOT mark a split charge as paid or issue a success receipt
unless every approved recipient credit is verified. A held leg MUST NOT
be mistaken for a reverted transaction or evidence that no funds moved.
Receipt verification cannot reverse a successful transaction.

Servers MUST preserve the transaction identifier and per-period attempt
state needed to reconcile a confirmed but incomplete charge. Before
retrying an attempt with a held leg, unknown outcome or failed
persistence after submission, servers MUST reconcile its chain effects
and MUST NOT blindly submit the full allocation again. Existing
duplicate-charge and period-limit rules still apply. This document does
not define automatic claim, refund or policy changes for held funds.

## Source Verification

If a credential includes the optional `source` field, servers MUST NOT
trust this value without verification.

Servers MUST verify the payer identity by recovering the root signer
address from the signed key authorization using
{{TIP-1020}}-compatible verification semantics over the encoded key
authorization payload.

If `source` is present, servers MUST verify that it identifies the
recovered root signer on the same chain as `methodDetails.chainId`, or
on chain 42431 when `methodDetails.chainId` is omitted.

## Authorization Scope Verification

When validating a Tempo subscription credential, servers MUST verify
that the signed key authorization expiry equals `subscriptionExpires`.
Servers MUST verify that the signed key authorization chain ID equals
`methodDetails.chainId`, or 42431 when `methodDetails.chainId` is
omitted. Servers MUST verify that the signed key authorization
authorizes the exact access key described by
`methodDetails.accessKey`, including both `accessKeyAddress` and
`keyType`.
Servers MUST also verify that the authorization contains a spending
limit for `currency` whose amount equals `amount` and whose billing
period equals the mapped period in seconds.

Servers MUST verify that the signed key authorization's `allowed_calls`
scope:

- contains exactly one target scope, and that scope is for `currency`
- uses explicit selector rules rather than unrestricted target mode
- allows `transfer(address,uint256)` and MAY additionally allow
  `transferWithMemo(address,uint256,bytes32)`
- does not allow `approve(address,uint256)` or any other non-transfer
  selector
- restricts the first ABI `address` argument for each permitted
  selector to exactly the primary and split recipient set, with no
  missing or additional recipients; without splits this set contains
  only the challenge `recipient`

Servers MUST reject authorizations that permit spending the subscription
token through broader call scopes than those required above.

## Receipt Generation

Upon successful activation or renewal, servers MUST return a
`Payment-Receipt` header per {{I-D.httpauth-payment}}. Servers MUST NOT
include a `Payment-Receipt` header on error responses.

On activation, servers MUST include the `subscriptionId` defined by
{{I-D.payment-intent-subscription}} in the receipt. On renewal, servers
MUST return the same `subscriptionId` for the active subscription.

The receipt payload for Tempo subscription:

| Field | Type | Description |
|-------|------|-------------|
| `method` | string | `"tempo"` |
| `reference` | string | Transaction hash of the settlement transaction |
| `status` | string | `"success"` |
| `subscriptionId` | string | Server-issued opaque identifier for the subscription |
| `timestamp` | string | {{RFC3339}} settlement time |
| `externalId` | string | OPTIONAL. Echoed from the challenge request |

# Security Considerations

## Destination Scoping

Tempo subscription access keys MUST be restricted to the primary and
split recipient set in the request. Where {{TIP-1011}} recipient-bound
selector rules are available, servers MUST reject credentials that do
not enforce this restriction through `allowed_calls`.

## Amount and Period Verification

Clients MUST parse and verify the `request` payload before signing:

1. Verify `amount` is reasonable for the service
2. Verify `currency` is the expected TIP-20 token address
3. Verify `periodUnit` and `periodCount` match expectations
4. Verify `recipient` is controlled by the expected party
5. Verify `subscriptionExpires` is acceptable

For split requests, clients MUST additionally verify each recipient and
share, including the primary remainder. Implementations SHOULD present
the full allocation when requesting payer approval.

## Split Authorization Boundary

The signed witness and authenticated challenge bind the approved split
terms for server verification. Native recipient scopes and the aggregate
period limit do not enforce fixed per-recipient amounts or mandatory
co-execution of every leg. A holder of the access key can construct a
different allocation within those restrictions. Receipt checks detect
such execution after inclusion but cannot roll it back. Applications
requiring onchain enforcement of exact shares need a separately
specified settlement mechanism; this profile does not define one.

## Revocation

Users can revoke subscription access keys at any time via the
AccountKeychain precompile {{TEMPO-ACCOUNT-KEYCHAIN}}. Servers SHOULD
handle revocation gracefully by returning a fresh subscription
challenge.

## Duplicate Charge Prevention

On-chain periodic limits prevent overspending within a billing period,
but they do not by themselves make HTTP service delivery idempotent
{{TEMPO-ACCOUNT-KEYCHAIN}}. Servers MUST implement durable local state
to prevent duplicate renewal charges caused by retries or concurrent
requests.

## Key Scope Minimization

Subscription access keys SHOULD use the narrowest {{TIP-1011}} scope
needed to support recurring charges. Implementations SHOULD avoid
unrestricted target scopes and SHOULD limit the key to the subscription
token, the permitted transfer selectors, and the approved recipient set.

## Access Key Isolation

Servers SHOULD generate a unique key pair and use a distinct access key
for each subscription. This provides fault isolation: compromise of one
server-held key affects only the subscription associated with that key,
and revoking one subscription's key via `revokeKey()` does not
invalidate other active subscriptions between the same payer and server.

If a server reuses a single access key across multiple subscriptions
from the same payer, the key's permissions must be broad enough to cover
all active subscriptions, potentially spanning multiple tokens,
recipients, or spending limits. This widens the blast radius if the key
is compromised and forces revocation of all subscriptions at once. It
also complicates spending-limit accounting, since {{TIP-1011}} enforces
a single `TokenLimit` per `(account, key, token)` tuple: two
subscriptions for the same token on the same key would share one
periodic limit rather than being independently capped.

Servers that reuse keys across subscriptions MUST ensure the combined
`TokenLimit` and `allowed_calls` scope still satisfies the per-
subscription authorization scope verification requirements in this
document. In practice this is difficult to guarantee, and
implementations SHOULD prefer one key per subscription for simplicity
and security.

## Caching

Responses to subscription challenges (402 Payment Required) MUST include
`Cache-Control: no-store` to prevent sensitive payment data from being
cached by intermediaries.

Responses containing `Payment-Receipt` headers MUST include
`Cache-Control: private` to prevent shared caches from storing payment
receipts.

# IANA Considerations

The `subscription` payment intent is registered by
{{I-D.payment-intent-subscription}}. This document does not register it
again.

--- back

# Examples

This section is non-normative.

## Fixed Creator and Platform Shares

~~~json
{
  "amount": "10000000",
  "currency": "0x20c0000000000000000000000000000000000001",
  "periodUnit": "day",
  "periodCount": "30",
  "subscriptionExpires": "2026-07-14T12:00:00Z",
  "recipient": "0x742d35cc6634c0532925a3b844bc9e7595f8fe00",
  "methodDetails": {
    "accessKey": {
      "accessKeyAddress": "0x1111111111111111111111111111111111111111",
      "keyType": "p256"
    },
    "chainId": 42431,
    "splits": [
      {
        "amount": "2000000",
        "recipient": "0x2222222222222222222222222222222222222222"
      }
    ]
  }
}
~~~

This requests a total of 10.00 tokens every 30 days: 8.00 for the
primary creator and 2.00 for the platform. The access-key recipient
scopes contain both addresses, while the period token limit remains
10,000,000 base units. Each activation or renewal uses one transaction
with an 8,000,000-unit transfer to the creator and a 2,000,000-unit
transfer to the platform. If the platform's receive policy holds its
share, native
execution may credit the creator and hold the platform's funds. The
server cannot report full split settlement in that case.

## Activation

**Challenge:**

~~~http
HTTP/1.1 402 Payment Required
Cache-Control: no-store
WWW-Authenticate: Payment id="qT8wErYuI3oPlKjH6gFdSa",
  realm="api.example.com",
  method="tempo",
  intent="subscription",
  expires="2026-01-15T12:05:00Z",
  request="<base64url-encoded JSON below>"
~~~

The `request` decodes to:

~~~json
{
  "amount": "10000000",
  "currency": "0x20c0000000000000000000000000000000000001",
  "periodUnit": "day",
  "periodCount": "30",
  "subscriptionExpires": "2026-07-14T12:00:00Z",
  "recipient": "0x742d35cc6634c0532925a3b844bc9e7595f8fe00",
  "methodDetails": {
    "accessKey": {
      "accessKeyAddress": "0x1111111111111111111111111111111111111111",
      "keyType": "p256"
    },
    "chainId": 42431
  }
}
~~~

This requests a recurring payment of 10.00 alphaUSD every 30 days until
2026-07-14T12:00:00Z.

**Credential:**

~~~json
{
  "challenge": {
    "id": "qT8wErYuI3oPlKjH6gFdSa",
    "realm": "api.example.com",
    "method": "tempo",
    "intent": "subscription",
    "request": "eyJ...",
    "expires": "2026-01-15T12:05:00Z"
  },
  "payload": {
    "signature": "0xf8c1...signed authorization bytes...",
    "type": "keyAuthorization"
  },
  "source": "did:pkh:eip155:42431:0x1234567890abcdef1234567890abcdef12345678"
}
~~~

The activation transaction submitted by the server contains:

- the signed `keyAuthorization`
- one TIP-20 `transfer(recipient, amount)` call, or
  `transferWithMemo(recipient, amount, memo)` if the implementation uses
  a memo

If activation settles at `2026-01-15T12:03:10Z`, the `Payment-Receipt`
payload decodes to:

~~~json
{
  "method": "tempo",
  "reference": "0x8d7c6c0d94d8488cb4cf6ab7b8a2f9c3f8e0eac7e5b6d1e8c3d86f733c2b7c01",
  "status": "success",
  "subscriptionId": "c3ViXzAxMjM0NTY",
  "timestamp": "2026-01-15T12:03:10Z"
}
~~~

The server records at least:

- `subscriptionId = "c3ViXzAxMjM0NTY"`
- `billing anchor = 2026-01-15T12:03:10Z`
- `periodUnit = "day"`
- `periodCount = "30"`
- `mappedPeriodSeconds = 2592000`
- `accessKeyAddress = "0x1111111111111111111111111111111111111111"`
- `last charged billing-period index = 0`

## Renewal Across Multiple Periods

Using the activation timestamp above, the Tempo subscription billing
periods are:

- Period 0: `[2026-01-15T12:03:10Z, 2026-02-14T12:03:10Z)`
- Period 1: `[2026-02-14T12:03:10Z, 2026-03-16T12:03:10Z)`
- Period 2: `[2026-03-16T12:03:10Z, 2026-04-15T12:03:10Z)`

Requests during Period 0 can use the active subscription without a new
authorization:

~~~http
GET /api/resource HTTP/1.1
Host: api.example.com
Cookie: session=<application-session>
~~~

When Period 1 begins, the server determines that billing-period index 1
has not yet been charged. The server submits one Tempo transaction using
the registered access key to call the TIP-20 token at `currency` with:

- `transfer(recipient, amount)`, or
- `transferWithMemo(recipient, amount, memo)`

If that transaction settles successfully, the renewal `Payment-Receipt`
payload decodes to:

~~~json
{
  "method": "tempo",
  "reference": "0xb4bf2b4f8e3f0e6f3b6af3a5f6d3c8e32e1c32a19fa56bd9f9b3fd33af88e912",
  "status": "success",
  "subscriptionId": "c3ViXzAxMjM0NTY",
  "timestamp": "2026-02-14T12:05:42Z"
}
~~~

The server updates `last charged billing-period index = 1`. Additional
requests during Period 1 do not permit another successful renewal
charge for Period 1.

## Cancellation At Period End

Suppose the server has already successfully charged Period 2 and the
payer cancels on `2026-03-20T09:00:00Z`.

The server records cancellation with an effective time of
`2026-04-15T12:03:10Z`, which is the end of Period 2. Requests before
that time continue to succeed without another renewal charge:

~~~http
GET /api/resource HTTP/1.1
Host: api.example.com
Cookie: session=<application-session>
~~~

Once `2026-04-15T12:03:10Z` is reached, the server stops submitting
renewal transactions for this subscription. A later request receives a
fresh challenge:

~~~http
HTTP/1.1 402 Payment Required
Cache-Control: no-store
WWW-Authenticate: Payment id="n3xtP3ri0d",
  realm="api.example.com",
  method="tempo",
  intent="subscription",
  request="<base64url-encoded JSON below>"
~~~

## Failed Renewal And Lapse

Suppose Period 3 begins and the server attempts a renewal transaction,
but the Tempo transaction fails because the payer no longer has enough
TIP-20 balance or fee-paying balance.

The server does not grant access for Period 3 and returns:

~~~http
HTTP/1.1 402 Payment Required
Cache-Control: no-store
WWW-Authenticate: Payment id="r3tryP3ri0d",
  realm="api.example.com",
  method="tempo",
  intent="subscription",
  request="<base64url-encoded JSON below>"
~~~

If a later retry during Period 3 succeeds, the server may grant access
for Period 3 and update `last charged billing-period index = 3`.

If Period 4 begins before any successful renewal occurs, the next
successful Tempo transaction authorizes at most one charge for Period 4.
The elapsed unpaid Period 3 does not become extra on-chain spending
capacity, because {{TIP-1011}} periodic limits reset rather than
accumulate.

## Natural Expiry

Suppose `subscriptionExpires` is `2026-07-14T12:00:00Z`. Once that time
is reached, the signed key authorization no longer authorizes future
renewals. Requests after that time receive a fresh challenge rather than
another renewal attempt.

# Acknowledgements

The authors thank the MPP community for their feedback on this
specification.
