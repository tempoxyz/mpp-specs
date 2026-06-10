---
title: Session Intent for HTTP Payment Authentication
abbrev: Payment Intent Session
docname: draft-payment-intent-session-00
version: 00
category: info
ipr: noModificationTrust200902
submissiontype: IETF
consensus: true

author:
  - name: Brendan Ryan
    ins: B. Ryan
    email: brendan@tempo.xyz
    org: Tempo Labs
  - name: Jake Moxey
    ins: J. Moxey
    email: jake@tempo.xyz
    org: Tempo Labs
  - name: Tom Meagher
    ins: T. Meagher
    email: tom@tempo.xyz
    org: Tempo Labs

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
      - name: Brendan Ryan
      - name: Jake Moxey
      - name: Tom Meagher
    date: 2026-01
---

--- abstract

This document defines the "session" payment intent for use with the
Payment HTTP Authentication Scheme {{I-D.httpauth-payment}}.  The
"session" intent represents reusable paid access in which a client
authorizes or funds a bounded payment relationship and the server meters
one or more requests, response chunks, or other units of service against
that relationship.

--- middle

# Introduction

The "session" intent covers payment patterns where a single paid
relationship is reused across multiple units of service.  A server uses a
session when the final cost is not known at challenge time, when many
small payments would be inefficient as independent `charge` requests, or
when a long-lived response needs incremental payment authorization as
service is delivered.

Examples include streaming inference, repeated API calls, metered data
feeds, and interactive transports where a client authorizes value up to a
limit and the server consumes that authorization over time.

Unlike the `charge` intent, the session intent does not require a
complete one-time exchange before the resource is served.  Instead, the
client establishes a method-specific session, then presents
method-specific proof that the server may deliver or continue delivering
metered service.  The server maintains durable accounting state and MUST
NOT deliver paid service beyond the value that has been authorized or
funded for the session.

## Relationship to Payment Methods

This document defines only the abstract semantics of the "session"
intent.  Payment method specifications define how to implement those
semantics using their payment infrastructure.

In particular, payment methods define:

- how a session is opened;
- how the session is identified;
- what proof authorizes service delivery;
- how top-ups, increases, or renewals are represented;
- how settlement, close, release, refund, or expiry works; and
- which method-specific fields appear in `methodDetails`, credentials,
  receipts, and error details.

This document intentionally does not define a universal voucher format,
channel identifier, refund mechanism, or close transaction.  Those
details are not common across payment systems.

# Requirements Language

{::boilerplate bcp14-tagged}

# Terminology

Session
: A reusable payment relationship between a client and a server for one
  or more units of paid service.

Metered Unit
: The unit against which session cost is measured.  Examples include an
  HTTP request, response chunk, generated token, byte, tool call, or
  method-defined unit.

Authorized Value
: The maximum value that the server may consume from a session based on
  method-specific proof.

Spent Value
: Value already consumed by the server for delivered service.

Remaining Value
: Authorized value minus spent value, as computed under the payment
  method's accounting rules.

Top-Up
: A method-specific operation that increases the value available to an
  existing session.

Close
: A method-specific operation that ends a session or begins the process
  of settlement, release, refund, withdrawal, expiry, or other terminal
  handling.

# Intent Semantics

## Definition

The "session" intent represents a request to establish or use a reusable
payment relationship for metered service.  The client does not need to
know the final cost at the time the session is opened, but the server
MUST be able to prove, account for, and limit service delivery according
to method-specific authorization.

## Properties

| Property | Value |
|----------|-------|
| **Intent Identifier** | `session` |
| **Payment Timing** | Incremental, prepaid, or method-defined |
| **Credential Use** | Reusable relationship; proof use is method-defined |
| **Idempotency** | Durable per-session accounting required |
| **Reversibility** | Method-dependent |

## Flow

The generic session flow is:

1. Server issues a 402 response with `intent="session"`.
2. Client opens or resumes a method-specific session.
3. Client submits method-specific proof for the session.
4. Server verifies the proof and updates session state.
5. Server delivers service only while sufficient value is authorized.
6. If value is insufficient, server returns or emits a fresh payment
   requirement for additional authorization.
7. Client may top up, advance authorization, or open a new session.
8. Client or server may close, settle, release, refund, or expire the
   session according to the payment method.

~~~
Client                         Server                    Payment Method
  |                              |                              |
  |  GET /resource               |                              |
  |----------------------------->|                              |
  |  402 Payment Required        |                              |
  |  intent="session"            |                              |
  |<-----------------------------|                              |
  |                              |                              |
  |  open / resume proof         |                              |
  |----------------------------->|  verify / establish session  |
  |                              |----------------------------->|
  |  200 + Payment-Receipt       |                              |
  |<-----------------------------|                              |
  |                              |                              |
  |  metered request or stream   |                              |
  |  with session proof          |                              |
  |----------------------------->|                              |
  |  service + receipt           |                              |
  |<-----------------------------|                              |
  |                              |                              |
  |  top-up or close proof       |                              |
  |----------------------------->|  settle / release / refund   |
  |                              |----------------------------->|
  |  final receipt               |                              |
  |<-----------------------------|                              |
~~~

## Lifecycle Operations

Payment methods implementing the "session" intent SHOULD map their
method-specific credential operations to the following abstract
lifecycle operations:

Open
: Establish a new session or bind an existing method-native payment
  object to the Payment authentication challenge.

Use
: Prove that the client may consume service under an open session.

Top-Up
: Increase the value or authorization available to the session.

Close
: End the session or initiate method-specific terminal handling.

Payment methods MAY use method-specific action names or proof shapes.
For example, a method can call the use operation `voucher`, `bearer`,
`authorize`, or another value.  Method specifications MUST document how
their actions map to the abstract operations above.

## Accounting Invariants {#accounting-invariants}

Servers implementing the "session" intent MUST maintain durable
per-session accounting state sufficient to enforce all of the following:

- service delivery MUST NOT exceed authorized or funded value;
- spent value MUST be updated atomically with service delivery;
- accepted authorization MUST be persisted before the server relies on
  it to deliver service;
- streaming servers MUST reserve or otherwise verify sufficient value
  before emitting each billable unit and commit spent value atomically
  with, or immediately before, delivery;
- concurrent requests for the same session MUST NOT cause double spend,
  over-service, or inconsistent receipts;
- retries using an `Idempotency-Key` request header MUST be handled
  idempotently when the payment method or application supports that
  header; payment methods MUST define retry semantics for their
  implementation; and
- terminal sessions MUST NOT accept additional paid service.

The exact state fields are method-specific.  Common examples include a
session identifier, highest accepted cumulative authorization, spent
value, remaining value, settlement reference, expiry, and close status.
This document does not require any of those fields to exist on the wire.

For HTTP requests that can be retried, clients SHOULD send an
`Idempotency-Key` request header.  Payment method specifications MUST
define how retry keys are scoped, how long retry state is retained, and
whether duplicate submissions return the original receipt, a no-op
success, or an error.

## Streaming

For streaming responses, the server SHOULD account for service in
bounded increments.  If the available value becomes insufficient before
the stream completes, the server MUST stop delivering additional paid
content until sufficient value is authorized.

If the session enters a terminal state, close-pending state, or any
method-specific state in which additional service is no longer
authorized, the server MUST stop delivering paid content and MUST NOT
accept further authorization for new paid service unless the method
explicitly defines recovery from that state.

A transport specification MAY define streaming payment events, messages,
or metadata for requesting additional authorization and delivering final
receipts.  Such transport mappings MUST preserve the accounting
invariants in {{accounting-invariants}}.

## Transport Mappings {#transport-mappings}

The "session" intent is transport-independent.  HTTP headers define the
base challenge, credential, and receipt containers, but session methods
are often used with streaming or message-oriented transports that need
transport-specific payment control messages.

This document provides only high-level guidance for such transports.
Concrete transport mappings, such as Server-Sent Events, WebSocket,
JSON-RPC, or MCP, define their own message names, envelopes, ordering
rules, retry behavior, and receipt delivery mechanisms.

Transport mappings for the "session" intent MUST preserve the semantics
and accounting invariants in this document.  In particular, downstream
transport mappings need to define:

- how additional authorization is requested when value is exhausted;
- how payment-control messages are distinguished from billable
  application content;
- how payment-management messages for the same session are serialized or
  protected by equivalent concurrency control;
- how credentials or payment-control messages bind to the protected
  resource, session, method, amount, currency, recipient, and any
  method-specific context; and
- how final receipts are delivered when final spent value is not known at
  response header time.

Payment control messages are part of the payment protocol and MUST NOT be
charged as application content.  Application content MUST NOT be
delivered beyond authorized or funded value.

# Request Schema

The `request` parameter for a "session" intent is a JSON object with the
shared fields defined by this specification and optional method-specific
extensions in the `methodDetails` field.  The `request` JSON MUST be
serialized using JSON Canonicalization Scheme (JCS) and base64url-encoded
without padding per {{I-D.httpauth-payment}}.

## Shared Fields

All payment methods implementing the "session" intent MUST support these
shared fields.  Payment methods MAY require additional fields in
`methodDetails` or elevate OPTIONAL shared fields to REQUIRED in their
method specification.

### Required Fields

| Field | Type | Description |
|-------|------|-------------|
| `amount` | string | Positive decimal string identifying the price per metered unit |
| `currency` | string | Currency or asset identifier |

The `amount` field MUST be a positive integer encoded as a decimal
string matching the regular expression `^[1-9][0-9]*$`, without exponent
notation, fractional notation, or leading sign.  Payment method
specifications define the currency base unit, precision, and metered unit
to which `amount` applies.  The `amount` field MUST NOT be interpreted as
the total maximum session cost unless the payment method explicitly
defines that semantics.

### Optional Fields

| Field | Type | Description |
|-------|------|-------------|
| `recipient` | string | Payment recipient or service provider in method-native format |
| `unitType` | string | Human-readable metered unit label |
| `description` | string | Human-readable session description |
| `externalId` | string | Merchant or application reference |
| `methodDetails` | object | Method-specific extension data |

Challenge expiry is conveyed by the `expires` auth-param in
`WWW-Authenticate` per {{I-D.httpauth-payment}}, using {{RFC3339}}
format.  Request objects MUST NOT duplicate the expiry value unless a
payment method defines a separate method-native expiry inside
`methodDetails`.

## Currency Formats

The `currency` field is interpreted by the payment method.  Payment
method specifications MUST document which currency formats they support
and how to interpret `amount` for each format.

## Method Extensions

Payment methods MAY define additional request fields in the
`methodDetails` object.  Clients that do not recognize a payment method
SHOULD ignore `methodDetails` but MUST still be able to display the
shared fields to users.

Method-specific fields can include channel programs, escrow contracts,
invoice details, deposit suggestions, minimum balance requirements,
session protocol versions, fee sponsorship policy, signer policy,
refund information, or any other data required by that method.

## Examples

The following examples show decoded `request` objects before JCS
serialization and base64url encoding.  They are illustrative only; the
selected payment method defines the exact `methodDetails` schema.

### Metered Token Stream

This example describes a session priced at one unit of a method-defined
currency per generated token.

~~~ json
{
  "amount": "1",
  "currency": "usd-micro",
  "recipient": "service_123",
  "unitType": "token",
  "description": "Streaming inference",
  "methodDetails": {
    "minimumBalance": "1000"
  }
}
~~~

### Prepaid Bearer Session

This example describes a prepaid session where the method-specific
details identify an invoice or other funding object.  After funding, the
client presents a bearer proof for subsequent requests.

~~~ json
{
  "amount": "100",
  "currency": "sat",
  "unitType": "request",
  "description": "Prepaid API session",
  "methodDetails": {
    "minimumBalance": "1000",
    "fundingReference": "invoice_123"
  }
}
~~~

### Cumulative Authorization Session

This example describes a channel-like session where the client
authorizes increasing cumulative value over time.

~~~ json
{
  "amount": "1",
  "currency": "token:usdc",
  "recipient": "merchant_456",
  "unitType": "message",
  "description": "Interactive model session",
  "methodDetails": {
    "minimumAuthorization": "500",
    "supportsTopUp": true
  }
}
~~~

### Processor-Backed Session

This example describes a processor-backed session where the payment
method maps the generic session to a processor-native customer or setup
object.

~~~ json
{
  "amount": "25",
  "currency": "usd-cent",
  "recipient": "acct_merchant_789",
  "unitType": "tool-call",
  "description": "Metered tool calls",
  "externalId": "workspace_123",
  "methodDetails": {
    "processorProfile": "profile_abc",
    "maximumSessionAmount": "5000"
  }
}
~~~

# Credential Requirements

The credential structure follows {{I-D.httpauth-payment}}, containing
`challenge`, `payload`, and an optional `source` field identifying the
payer.

The `payload` for a "session" intent is method-specific.  It MUST contain
enough information for the server to:

1. identify the session or method-native payment object;
2. determine the requested lifecycle operation;
3. verify the payer's authority for that operation;
4. determine the amount or limit authorized by the credential, if any;
   and
5. bind the proof to the challenge, method, recipient, currency, and
   any other method-required context.

This document does not require a universal `sessionId`, `action`,
`voucher`, `preimage`, signature, or transaction field.  Payment method
specifications MUST define the complete credential payload schema for
their implementation of the "session" intent.

## Proof Types

Session payment methods can use different proof mechanisms, for example:

| Proof Type | Description |
|------------|-------------|
| Bearer proof | Secret or preimage proving control of a funded session |
| Cumulative authorization | Signed value that monotonically increases authorized value |
| Ledger proof | Transaction or state proof for session funding or update |
| Processor proof | Processor-native identifier or token proving session authorization |
| Delegated signer proof | Proof that a session signer is authorized by the payer |

Payment methods MAY define additional proof types.

# Illustrative Lifecycle Examples

This section gives non-normative examples of complete session flows.
The examples show decoded credentials and receipts for readability.  The
actual HTTP header values are encoded as defined by
{{I-D.httpauth-payment}}, and payment methods define the exact payload
fields.

## Opening a Prepaid Session

The server challenges for a prepaid session:

~~~ http
HTTP/1.1 402 Payment Required
WWW-Authenticate: Payment id="sess_chal_123",
  realm="api.example.com",
  method="example-prepaid",
  intent="session",
  request="eyJhbW91bnQiOiIxMDAiLCJjdXJyZW5jeSI6InNhdCJ9"
~~~

The decoded request is:

~~~ json
{
  "amount": "100",
  "currency": "sat",
  "unitType": "request",
  "methodDetails": {
    "minimumBalance": "1000",
    "fundingReference": "invoice_123"
  }
}
~~~

After satisfying the payment method's funding requirement, the client
retries with a method-specific open proof:

~~~ json
{
  "challenge": "sess_chal_123",
  "payload": {
    "operation": "open",
    "sessionReference": "sess_abc",
    "proof": "method-specific-proof"
  }
}
~~~

The server returns the resource and a receipt:

~~~ json
{
  "method": "example-prepaid",
  "intent": "session",
  "status": "success",
  "timestamp": "2026-06-10T12:00:00Z",
  "reference": "sess_abc",
  "authorized": "1000",
  "spent": "100",
  "remaining": "900"
}
~~~

## Advancing Cumulative Authorization

In a cumulative authorization session, the client can increase the value
available to the server without opening a new session.  The proof shape
is method-specific:

~~~ json
{
  "challenge": "sess_chal_456",
  "payload": {
    "operation": "use",
    "sessionReference": "channel_abc",
    "cumulativeAuthorized": "2500",
    "proof": "method-specific-signature"
  }
}
~~~

If the server has already accepted authorization through `2000`, the
new proof advances the accepted value to `2500`.  After serving `300`
units of value, the receipt can include:

~~~ json
{
  "method": "example-channel",
  "intent": "session",
  "status": "success",
  "timestamp": "2026-06-10T12:05:00Z",
  "reference": "channel_abc",
  "authorized": "2500",
  "spent": "2300",
  "remaining": "200"
}
~~~

## Insufficient Value and Top-Up

When remaining value is insufficient, the server does not deliver more
paid service.  It can return a fresh challenge:

~~~ http
HTTP/1.1 402 Payment Required
Content-Type: application/problem+json
WWW-Authenticate: Payment id="sess_chal_789",
  realm="api.example.com",
  method="example-channel",
  intent="session",
  request="eyJhbW91bnQiOiIxIiwiY3VycmVuY3kiOiJ0b2tlbiJ9"

{
  "type": "https://paymentauth.org/problems/session/insufficient-value",
  "title": "Insufficient Value",
  "status": 402,
  "detail": "The session lacks value for the requested service.",
  "reference": "channel_abc",
  "required": "2600",
  "authorized": "2500"
}
~~~

The client can then submit a method-specific top-up or authorization
increase:

~~~ json
{
  "challenge": "sess_chal_789",
  "payload": {
    "operation": "topUp",
    "sessionReference": "channel_abc",
    "additionalAuthorized": "1000",
    "proof": "method-specific-proof"
  }
}
~~~

## Closing a Session

A close operation is method-specific.  The generic receipt can indicate
that the session is terminal:

~~~ json
{
  "method": "example-channel",
  "intent": "session",
  "status": "success",
  "timestamp": "2026-06-10T12:30:00Z",
  "reference": "channel_abc",
  "authorized": "3500",
  "spent": "3100",
  "remaining": "0",
  "settlementRef": "settlement_123",
  "final": true
}
~~~

# Verification

## Server Responsibilities

Servers verifying a "session" credential MUST:

1. verify that the credential echoes an outstanding challenge and that
   the challenge `id` and parameters are valid according to
   {{I-D.httpauth-payment}};
2. verify the challenge has not expired;
3. verify the credential using method-specific procedures;
4. verify the credential applies to the challenged `amount`,
   `currency`, recipient, and method-specific context;
5. verify that the session is open or otherwise usable;
6. update durable accounting state before delivering paid service; and
7. return a receipt for successful paid service or successful lifecycle
   operations.

Payment methods and transport mappings MUST specify any cases where a
session-management message is not bound to a fresh challenge, such as
resumed sessions, voucher-only updates, or transport-specific control
messages.

When a credential or control message is not bound to a fresh challenge,
the payment method or transport mapping MUST define how the server binds
that message to the protected resource, session, method, amount,
currency, recipient, and any method-specific context.  A server MUST NOT
accept a session proof whose context cannot be validated.

## Insufficient Value

When a request cannot be served because the session has insufficient
remaining value, the server MUST NOT deliver paid service beyond the
authorized amount.  The server SHOULD return 402 Payment Required with a
fresh `WWW-Authenticate: Payment` challenge or use a transport-specific
payment-required signal.

For streaming transports, the server MAY pause the stream while awaiting
additional authorization if the transport defines such behavior.

## Close and Terminal Handling

Close semantics are method-specific.  A close operation might settle
funds, refund unused balance, release escrow, mark a processor session
inactive, begin a forced-close grace period, or simply prevent future
use.

Method specifications MUST define when a session is terminal and how
servers reject additional service after terminal state is reached.

# Receipts

Servers MUST return a `Payment-Receipt` header, or the equivalent receipt
container defined by a transport mapping, on successful paid service and
successful session lifecycle operations.

For streaming responses, receipts sent before the stream is complete can
only describe state known at that point.  A transport mapping MAY define
intermediate receipts.  When the transport supports terminal metadata,
the server SHOULD deliver a final receipt that reflects the final spent
value, remaining value, settlement reference, and terminal status known
at stream completion.

The receipt payload for a "session" intent MUST include the receipt
fields required by {{I-D.httpauth-payment}} and:

| Field | Type | Description |
|-------|------|-------------|
| `intent` | string | The string `"session"` |
| `reference` | string | Stable method-defined session reference |

The receipt MAY include:

| Field | Type | Description |
|-------|------|-------------|
| `authorized` | string | Current authorized value |
| `spent` | string | Value consumed so far |
| `remaining` | string | Value remaining under method accounting |
| `settlementRef` | string | Method-native settlement reference |
| `final` | boolean | Whether the session is terminal after this receipt |

The `reference` field identifies the session or method-native payment
relationship across lifecycle operations.  If a method has separate
settlement, transaction, refund, or processor identifiers, those values
MUST appear in method-specific fields such as `settlementRef`; they MUST
NOT replace `reference` unless they are also the stable session
reference.

Payment methods MAY define additional receipt fields, such as cumulative
voucher amounts, refund amounts, channel identifiers, transaction hashes,
processor identifiers, finality status, or trust attestations.

For streaming responses, a transport mapping SHOULD define how final
receipt state is delivered when the final cost is not known at response
header time.

# Error Responses

Servers MUST use Problem Details {{RFC9457}} for session errors as
defined by {{I-D.httpauth-payment}}.  Payment methods MAY define
method-specific problem types.  The following generic conditions are
common across session methods:

| Condition | Status | Description |
|-----------|--------|-------------|
| Malformed credential | 402 | Credential is unparseable or missing required fields |
| Invalid session proof | 402 | Method-specific proof failed verification |
| Session not found | 402 or 410 | Referenced session does not exist or is unavailable |
| Session closed | 402 or 410 | Referenced session is terminal |
| Insufficient value | 402 | Session lacks value for the requested service |
| Stale update | 200 or 402 | Update does not advance method-specific state |

Payment methods MUST specify exact problem type URIs and status codes for
their implementation.  Payment methods MUST also specify whether
non-advancing updates are treated as idempotent success, no-op success,
or rejection.  Methods MUST distinguish stale but authentic updates from
forged or otherwise invalid updates.

# Security Considerations

## Authorization Limits

Clients MUST understand that a session can authorize multiple units of
future service.  Clients SHOULD limit funded or authorized value to an
amount appropriate for the resource and counterparty.

Servers MUST NOT consume more than the value authorized by the payment
method.  If the method supports partial settlement or close, servers MUST
settle or consume only value justified by delivered service and
method-specific policy.

## Accounting and Concurrency

Session accounting is security-critical.  Servers MUST make per-session
state updates atomic across concurrent requests and streams.  Failure to
serialize updates can cause double spend, over-service, incorrect
receipts, or unrecoverable loss if service is delivered before
authorization is persisted.

## Replay Protection

Payment methods MUST define replay protection for their session proofs.
Common mechanisms include challenge binding, cumulative monotonic values,
session-specific secrets, method-native nonces, ledger state, expiry
times, and terminal-state retention.

Servers MUST reject proofs that are invalid for the referenced session or
that would reduce, duplicate, or ambiguously update session state unless
the method explicitly defines idempotent success for stale submissions.

## Session Identifier Handling

A session identifier is not, by itself, proof of payment or authority.
Servers MUST verify method-specific proof before delivering service.
Clients and servers SHOULD treat session identifiers and proofs as
sensitive when disclosure could allow correlation or unauthorized use.

## Transport Security

All Payment authentication flows MUST use TLS 1.2 or later per
{{I-D.httpauth-payment}}.  Session credentials can authorize repeated or
ongoing value consumption and therefore require at least the same
confidentiality protections as one-time payment credentials.

## Denial of Service

Session protocols can introduce stateful resources on servers and payment
systems.  Servers SHOULD rate limit session opens, proof submissions,
top-ups, close requests, and streaming pauses.  Servers SHOULD perform
cheap syntactic validation before expensive signature, ledger, or
processor verification.

## Refund and Close Expectations

Clients MUST NOT assume that all session methods support refunds, forced
close, cooperative close, or immediate release of unused value.  Payment
methods MUST document their terminal behavior and any delay, finality,
fee, or counterparty-risk assumptions.

# IANA Considerations

## Payment Intent Registration

This document registers the "session" intent in the "HTTP Payment
Intents" registry established by {{I-D.httpauth-payment}}:

| Intent | Description | Reference |
|--------|-------------|-----------|
| `session` | Reusable metered payment relationship | This document |

Contact: Tempo Labs (<contact@tempo.xyz>)
