---
title: '"Escrow" Intent for HTTP Payment Authentication'
abbrev: Escrow Intent
docname: draft-payment-intent-escrow-00
version: 00
category: info
ipr: noModificationTrust200902
submissiontype: IETF
consensus: true

author:
  - name: Ryuji Ishiguro
    ins: R. Ishiguro
    email: r2ishiguro@gmail.com

normative:
  RFC2119:
  RFC4648:
  RFC8174:
  RFC8259:
  RFC8785:
  RFC9457:
  I-D.httpauth-payment:
    title: "The 'Payment' HTTP Authentication Scheme"
    target: https://datatracker.ietf.org/doc/draft-httpauth-payment/
    author:
      - name: Jake Moxey
    date: 2026-01

informative:
  MPP-CHARGE:
    title: "Charge Intent for HTTP Payment Authentication"
    target: https://github.com/tempoxyz/mpp-specs/blob/main/specs/intents/draft-payment-intent-charge-00.md
    author:
      - name: Jake Moxey
      - name: Brendan Ryan
      - name: Tom Meagher
    date: 2026-03
  EMV-PREAUTH:
    title: "EMV Contactless Specifications for Payment Systems"
    target: https://www.emvco.com/emv-technologies/contactless/
    author:
      - org: EMVCo
    date: 2023
---

--- abstract

This document defines the "escrow" payment intent for use with the
Payment HTTP Authentication Scheme {{I-D.httpauth-payment}}. The
"escrow" intent represents a two-phase payment where the payer first
places a hold on funds up to a maximum amount, and the merchant later
settles or releases that hold when the final amount is known.

--- middle

# Introduction

The "charge" intent {{MPP-CHARGE}} covers immediate, one-time payment
for resource access. Some services cannot determine the final amount
at authorization time. A parking session may end early, a fueling
transaction depends on dispensed volume, and a metered compute job
depends on resources actually consumed.

The "escrow" intent addresses those cases by separating payment into
two phases:

- A **hold** phase, where funds are reserved up to a maximum amount.
- A **settlement** phase, where the merchant later settles the final
  amount or releases the hold in full.

This pattern is well established in traditional payment systems as
preauthorization and capture {{EMV-PREAUTH}}. The "escrow" intent
brings the same semantics to HTTP-native machine payments.

## Use Cases

- **Parking**: An agent authorizes a hold for a maximum parking
  duration. When the vehicle departs, the operator settles the actual
  amount and releases any remainder.
- **Fueling**: A fueling service authorizes a hold before pump access.
  The operator later settles the final dispensed amount.
- **Metered compute**: A scheduler places a hold before a job starts
  and later settles based on measured resource usage.
- **Reservations with cancellation**: A booking service places a hold
  at reservation time and later either settles or releases it.

## Relationship to Payment Methods

This document defines the abstract semantics of the "escrow" intent.
Payment method specifications define how to implement the hold,
settle, and release phases using their own payment infrastructure.

| Method | Example Implementation |
|--------|------------------------|
| Smart-contract method | Hold through an escrow contract, settle or release with later contract calls |
| Card method | Preauthorize through a processor, then capture or reverse later |
| Custodial method | Lock balance in an internal ledger, then transfer or unlock later |

# Requirements Language

{::boilerplate bcp14-tagged}

# Terminology

Hold
: An operation that reserves funds up to a maximum amount. The funds
  are locked and unavailable to the payer but not yet transferred to
  the merchant.

Settle
: An operation where the merchant captures a final amount less than
  or equal to the held amount. Any remainder is returned to the
  payer.

Release
: An operation where the full held amount is returned to the payer
  without any settlement. This is the escrow equivalent of voiding
  a preauthorization.

Hold Identifier
: A method-specific value that uniquely identifies a held balance.
  Used to associate a Payment credential with later settlement or
  release operations.

# Intent Semantics

## Definition

The "escrow" intent represents a request to reserve funds up to a
maximum amount, with final settlement or release occurring after the
HTTP 402 exchange completes. The 402 exchange authorizes the hold
only; it does not itself imply final settlement.

## Properties

| Property | Value |
|----------|-------|
| Intent Identifier | `escrow` |
| Payment Timing | Deferred |
| Idempotency | Single-use per challenge |
| Reversibility | Full release before settlement |

## Flow {#escrow-flow}

~~~
 Client           Server          Merchant       Network
   |                 |                |              |
   | (1) POST        |                |              |
   |---------------->|                |              |
   |                 |                |              |
   | (2) 402         |                |              |
   |  intent=escrow  |                |              |
   |<----------------|                |              |
   |                 |                |              |
   | (3) Create hold |                |              |
   |------------------------------------------------>|
   |                 |                |              |
   | (4) POST +cred  |                |              |
   |---------------->|                |              |
   |                 | (5) Verify     |              |
   |                 |------------------------------>|
   |                 |                |              |
   | (6) 200 OK      |                |              |
   |  + Receipt      |                |              |
   |<----------------|                |              |
   |                 |                |              |
   |                 |  (7) settle or release later  |
   |                 |                |------------->|
~~~

## Atomicity and Compensating Actions

The "escrow" intent does NOT imply atomic exchange between hold
verification and service delivery. The hold guarantees fund
reservation; service delivery and final settlement are separate
operations. Servers SHOULD implement compensating actions, such as
release, if service delivery fails after a hold has been verified.

## Hold Expiry

Payment method specifications MUST define how holds expire or
otherwise become reclaimable by the payer. Challenge lifetime
(the `expires` parameter in the Payment challenge) and hold lifetime
are separate concerns. A challenge may expire in minutes while the
hold persists for hours or days.

# Request Schema

The `request` parameter for an "escrow" intent MUST contain a
JCS-canonicalized {{RFC8785}}, base64url-encoded {{RFC4648}} JSON
object {{RFC8259}} with the following fields.

## Required Fields

| Field | Type | Description |
|-------|------|-------------|
| `amount` | string | Maximum hold amount in base units |
| `currency` | string | Currency or asset identifier |
| `recipient` | string | Settlement recipient in method-native format |

The `amount` field represents the maximum amount that MAY later be
settled, not the final charge.

## Optional Fields

| Field | Type | Description |
|-------|------|-------------|
| `description` | string | Human-readable purpose (max 256 UTF-8 bytes) |
| `externalId` | string | Merchant reference such as order or session ID (max 566 bytes) |
| `methodDetails` | object | Payment method-specific extension data |

Payment method specifications MAY define additional fields inside
`methodDetails`, such as hold deadlines, settlement authority, or
fee handling rules.

## Example

~~~json
{
  "amount": "5000000",
  "currency": "0x20c0000000000000000000000000000000000000",
  "recipient":
    "0x742d35Cc6634C0532925a3b844Bc9e7595f8fE00",
  "description": "Parking hold — up to $5.00",
  "externalId": "parking_session_42",
  "methodDetails": {
    "chainId": 42431,
    "escrowContract":
      "0x1111111111111111111111111111111111111111",
    "decimals": 6
  }
}
~~~

# Credential Requirements

## Payload

The credential `payload` for an "escrow" intent MUST contain proof
that a hold has been created or authorized. The exact proof format
is defined by the payment method specification.

## Proof Types

Acceptable proof types are method-specific.

| Proof Type | Description | Example Methods |
|------------|-------------|-----------------|
| Signed transaction | Signed hold transaction for server broadcast | Smart-contract methods |
| Transaction hash | Hash of a confirmed on-chain hold | Smart-contract methods |
| Authorization reference | Processor preauthorization reference | Card methods |
| Internal confirmation | Custodial hold confirmation | Custodial methods |

## Reusability and Validity

Each credential MUST be usable only once per challenge. Servers MUST
reject replayed credentials. Servers MUST also prevent a single hold
identifier from being accepted as proof for multiple independent
challenges.

# Verification

## Server Responsibilities

Servers verifying an "escrow" credential MUST:

1. Verify the `id` matches an outstanding challenge.
2. Verify the challenge has not expired.
3. Verify the hold proof using method-specific procedures.
4. Verify the held amount is greater than or equal to the requested
   `amount`.
5. Verify the hold recipient matches the requested `recipient`.
6. Verify the hold is active and has not already been settled,
   released, or expired.
7. Record the hold identifier so it can be associated with later
   settlement or release.

When verification fails, the server MUST respond with 402 and a
fresh challenge. The response body SHOULD contain a Problem Details
object {{RFC9457}}.

## Settlement

Settlement occurs outside the 402 challenge-response flow. The
merchant backend, or another merchant-authorized settlement
component, MUST settle or release every successfully verified hold.

The final settled amount MUST be less than or equal to the held
amount. Payment method specifications MUST document:

- Whether partial settlement is supported.
- How release works when funds remain unused.
- How settlement and release requests are authenticated.
- How retries are made idempotent.

The `Payment-Receipt` returned after successful verification
indicates that the hold was accepted. It does not imply that final
settlement has already occurred.

## Receipt

The `Payment-Receipt` header for an escrow intent SHOULD include
a hold identifier that the merchant backend can use for later
settlement or release. The receipt structure follows
{{I-D.httpauth-payment}} with the addition of method-specific
fields for the hold reference.

# Security Considerations

## Hold Amount Manipulation

Clients MUST verify the requested `amount` is appropriate before
authorizing a hold. Malicious servers could request excessive holds
to lock payer funds.

## Replay Protection

Servers MUST implement replay protection for both challenge IDs and
hold identifiers. A single hold MUST NOT authorize access to
multiple independent requests.

## Stale Holds and Settlement Races

Payment method specifications MUST define how stale holds expire or
become reclaimable. They MUST also define atomic settlement
semantics so that settle and release cannot both succeed for the
same hold.

## Recipient and Currency Verification

Clients SHOULD verify the `recipient` and `currency` fields before
authorizing a hold. Malicious servers could request a hold for an
unexpected recipient or asset.

## Finality

The finality of a verified hold depends on the payment method.
Servers SHOULD understand the finality guarantees of accepted
methods before granting access to high-value or irreversible
operations.

## Agent Authorization Scope

When autonomous agents hold funds on behalf of users, their
authority SHOULD be bounded by policy, including maximum hold size,
aggregate exposure, permitted recipients, and hold duration limits.

# IANA Considerations

## Payment Intent Registration

This document registers the following payment intent in the "HTTP
Payment Intents" registry established by {{I-D.httpauth-payment}}:

| Intent | Description | Reference |
|--------|-------------|-----------|
| `escrow` | Two-phase hold-then-settle payment | This document |

--- back

# Comparison with Other Intents

| Property | Charge | Session | Escrow |
|----------|--------|---------|--------|
| Final amount known at 402 time | Yes | Per-unit | No |
| Payment timing | Immediate | Streaming | Deferred |
| Reversibility | None | Partial refund | Full release |
| Settlement actor | Server (at 402 time) | Server (periodic) | Merchant (later) |
| Typical use | API call, download | Metered streaming | Parking, fueling, reservation |

# Implementation Guidance

## For Payment Method Authors

When defining an escrow binding for a payment method, the method
specification MUST address:

1. How the hold is created (transaction, API call, ledger lock).
2. How the server verifies the hold is active and matches the
   challenge parameters.
3. How the hold identifier is communicated in the receipt.
4. How settle and release are authorized and authenticated.
5. How holds expire or become reclaimable.
6. Whether partial settlement is supported.
7. Replay protection for hold identifiers.

## For Server Implementers

Servers SHOULD:

- Set `holdExpiry` (or equivalent) in `methodDetails` to communicate
  the expected service window.
- Implement a background process to release stale holds that were
  never settled.
- Log all hold, settle, and release events for audit and dispute
  resolution.

## For Client and Agent Implementers

Clients and agents SHOULD:

- Enforce a maximum acceptable hold amount per service category.
- Enforce a maximum acceptable hold duration.
- Track aggregate held funds across all active holds.
- Alert the user or operator when policy limits are approached.

# Acknowledgements

The HTTP Payment Authentication Scheme and the intent-method
layering model are defined by the MPP specifications at
paymentauth.org. The escrow pattern draws from EMV
preauthorization and capture semantics used in traditional payment
card networks.
