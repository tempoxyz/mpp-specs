---
title: "Payment Authentication Scheme: SSE Transport"
abbrev: Payment SSE Transport
docname: draft-payment-transport-sse-00
version: 00
category: info
ipr: trust200902
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

normative:
  RFC2119:
  RFC3339:
  RFC5246:
  RFC8174:
  RFC8259:
  RFC8446:
  RFC9110:
  I-D.httpauth-payment:
    title: "The 'Payment' HTTP Authentication Scheme"
    target: https://datatracker.ietf.org/doc/draft-ietf-httpauth-payment/
    author:
      - name: Jake Moxey
    date: 2026-01
  SSE:
    title: "Server-Sent Events"
    target: https://html.spec.whatwg.org/multipage/server-sent-events.html
    author:
      - org: WHATWG

informative:
  RFC4648:
  RFC9457:
---

--- abstract

This document defines how the Payment HTTP Authentication Scheme
operates over Server-Sent Events (SSE). It specifies the mapping of
payment challenges and receipts to SSE events, credential transmission
via HTTP headers on the initial request or companion HTTP requests,
and mid-stream payment signaling for metered streaming responses.

--- middle

# Introduction

Server-Sent Events {{SSE}} enable servers to push data to clients over
a long-lived HTTP connection. This document extends SSE-based APIs to
support payment requirements using the Payment HTTP Authentication
Scheme {{I-D.httpauth-payment}}.

Many modern APIs use SSE for streaming responses, including LLM
inference endpoints, real-time data feeds, and event-driven services.
This transport enables servers to:

- Require payment before beginning an SSE stream
- Signal mid-stream payment requirements when metered balance is
  exhausted
- Deliver payment receipts as SSE events alongside application data

## Design Goals

1. **HTTP Native**: Leverage standard HTTP semantics for the initial
   challenge-credential exchange. The `Authorization` header carries
   credentials as defined in {{I-D.httpauth-payment}}.

2. **Mid-Stream Signaling**: Define SSE event types for payment
   events that occur during an active stream, avoiding the need to
   terminate and re-establish connections.

3. **Backwards Compatible**: Servers that do not require payment
   behave identically to standard SSE endpoints. Payment-unaware
   clients receive standard HTTP 402 responses.

4. **Transport Agnostic Payment Methods**: Work with any registered
   payment method. Method-specific details (e.g., voucher top-ups)
   are defined by method specifications.

# Requirements Language

{::boilerplate bcp14-tagged}

# Terminology

This document uses terminology from {{I-D.httpauth-payment}}:

Challenge
: Payment requirements communicated by the server.

Credential
: Payment authorization data sent by the client.

Receipt
: Server acknowledgment of successful payment.

Additionally:

SSE Stream
: A long-lived HTTP response using the `text/event-stream` content
  type per {{SSE}}.

Companion Request
: A separate HTTP request sent to the same resource URI during an
  active SSE stream, used to submit payment credentials (e.g.,
  voucher updates) without interrupting the stream.

# Protocol Overview

~~~
Client                                                     Server
   │                                                          │
   │  (1) GET /api/stream                                     │
   │      Accept: text/event-stream                           │
   ├─────────────────────────────────────────────────────────>│
   │                                                          │
   │  (2) 402 Payment Required                                │
   │      WWW-Authenticate: Payment id="...",                 │
   │        method="tempo", intent="stream", ...              │
   │<─────────────────────────────────────────────────────────┤
   │                                                          │
   │  (3) Client fulfills challenge                           │
   │                                                          │
   │  (4) GET /api/stream                                     │
   │      Accept: text/event-stream                           │
   │      Authorization: Payment <credential>                 │
   ├─────────────────────────────────────────────────────────>│
   │                                                          │
   │  (5) 200 OK                                              │
   │      Content-Type: text/event-stream                     │
   │      Payment-Receipt: <receipt>                          │
   │                                                          │
   │      event: data                                         │
   │      data: {"token": "Hello"}                            │
   │                                                          │
   │      event: data                                         │
   │      data: {"token": " world"}                           │
   │                                                          │
   │      event: payment-receipt                              │
   │      data: {"status":"success",...}                       │
   │<─────────────────────────────────────────────────────────┤
~~~

## Mid-Stream Payment Flow

For metered streaming (e.g., per-token billing), the server may
exhaust the client's authorized balance during the stream:

~~~
Client                                                     Server
   │                                                          │
   │  ... active SSE stream ...                               │
   │                                                          │
   │      event: 402-need-voucher                              │
   │      data: {"channelId":"...","requiredCumulative":...}   │
   │<─────────────────────────────────────────────────────────┤
   │                                                          │
   │  (stream paused, connection held open)                   │
   │                                                          │
   │  HEAD /api/stream                                        │
   │      Authorization: Payment <updated credential>         │
   ├─────────────────────────────────────────────────────────>│
   │                                                          │
   │  200 OK                                                  │
   │  Payment-Receipt: <receipt>                              │
   │<─────────────────────────────────────────────────────────┤
   │                                                          │
   │  ... stream resumes ...                                  │
   │                                                          │
   │      event: data                                         │
   │      data: {"token": "continued"}                        │
   │<─────────────────────────────────────────────────────────┤
~~~

# Initial Payment Exchange

## Challenge

When an SSE endpoint requires payment, the server MUST respond with
HTTP 402 Payment Required and a `WWW-Authenticate` header per
{{I-D.httpauth-payment}}:

~~~http
HTTP/1.1 402 Payment Required
WWW-Authenticate: Payment id="kM9xPqWvT2nJrHsY4aDfEb",
  realm="api.example.com",
  method="tempo",
  intent="stream",
  expires="2025-01-06T12:05:00Z",
  request="<base64url-encoded JSON>"
Content-Type: application/problem+json

{
  "type": "https://paymentauth.org/problems/payment-required",
  "title": "Payment Required",
  "status": 402,
  "detail": "This streaming endpoint requires payment."
}
~~~

The response body is OPTIONAL. When present, servers SHOULD use
Problem Details {{RFC9457}} format. Servers MUST NOT return
`text/event-stream` content type for 402 responses.

Clients that do not understand the Payment scheme receive a standard
402 response and can present the problem details to users.

## Credential

Clients retry the request with the `Authorization` header containing
the Payment credential per {{I-D.httpauth-payment}}:

~~~http
GET /api/stream HTTP/1.1
Host: api.example.com
Accept: text/event-stream
Authorization: Payment <base64url-encoded credential>
~~~

The credential structure follows the core specification. Servers
MUST validate the credential before beginning the SSE stream.

## Initial Receipt

On successful payment verification, servers MUST include a
`Payment-Receipt` header in the initial SSE response per
{{I-D.httpauth-payment}}:

~~~http
HTTP/1.1 200 OK
Content-Type: text/event-stream
Cache-Control: no-cache
Payment-Receipt: <base64url-encoded receipt>
~~~

This ensures clients receive a receipt even if the stream is
interrupted before any SSE events are delivered.

# SSE Event Types

This specification defines three SSE event types for payment
signaling within an active stream.

## payment-receipt Event

Servers SHOULD emit a `payment-receipt` event to deliver receipts
during or at the end of a stream. This supplements the initial
`Payment-Receipt` HTTP header with updated state:

~~~
event: payment-receipt
data: {"method":"tempo","intent":"stream","status":"success","timestamp":"2025-01-06T12:08:30Z","challengeId":"kM9xPqWvT2nJrHsY4aDfEb","channelId":"0x6d0f4fdf...","acceptedCumulative":"250000","spent":"237500","units":500}
~~~

The `data` field MUST be a single-line JSON object {{RFC8259}}.

Servers MUST emit a final `payment-receipt` event before closing the
stream. This ensures accurate final state is delivered even when
the initial HTTP header contained preliminary values.

### Receipt Fields

The receipt object follows the schema defined by the payment method
specification. At minimum, it MUST contain the fields required by
{{I-D.httpauth-payment}} Section 5.3:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `status` | string | REQUIRED | Settlement status (`"success"`) |
| `challengeId` | string | REQUIRED | The `id` from the fulfilled challenge |
| `method` | string | REQUIRED | Payment method used |
| `timestamp` | string | REQUIRED | {{RFC3339}} timestamp |

Payment method specifications MAY extend the receipt with additional
fields (e.g., `channelId`, `acceptedCumulative`, `spent`, `units`
for streaming payment methods).

## Mid-Stream Payment Required Events

When a metered stream exhausts the client's authorized balance,
servers MUST emit an SSE event to signal that additional payment is
needed and pause content delivery.

The event type and data schema are defined by the payment method
specification, not by this transport specification. This transport
defines only the behavioral contract:

1. The server MUST emit a designated SSE event when balance is
   exhausted
2. The server MUST pause content delivery after emitting the event
3. The server MUST resume delivery when a valid payment update is
   received via a companion request (see {{companion-requests}})
4. The server SHOULD close the stream if no payment update is
   received within a reasonable timeout (e.g., 60 seconds)

For example, the Tempo `stream` intent defines the `402-need-voucher`
event type:

~~~
event: 402-need-voucher
data: {"channelId":"0x6d0f4fdf...","requiredCumulative":"250025","acceptedCumulative":"250000","deposit":"500000"}
~~~

Other payment methods SHOULD define their own event type following
the `402-` prefix convention to signal payment-required conditions
mid-stream.

## payment-error Event

Servers SHOULD emit a `payment-error` event when a payment-related
error occurs during the stream:

~~~
event: payment-error
data: {"type":"https://paymentauth.org/problems/stream/channel-finalized","title":"Channel Finalized","status":410,"detail":"The payment channel has been closed on-chain."}
~~~

The `data` field SHOULD be a JSON object following Problem Details
{{RFC9457}} format:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `type` | string | REQUIRED | Problem type URI |
| `title` | string | REQUIRED | Short human-readable summary |
| `status` | integer | REQUIRED | HTTP status code |
| `detail` | string | OPTIONAL | Human-readable explanation |

After emitting a `payment-error` event, servers MAY close the
stream or continue depending on the error severity.

# Companion Requests

## Purpose

During an active SSE stream, clients cannot send additional data
over the same HTTP connection. To submit payment updates (e.g.,
voucher top-ups for metered streaming), clients send separate HTTP
requests to the **same resource URI**.

## Request Format

Companion requests use the `Authorization` header with an updated
payment credential:

~~~http
HEAD /api/stream HTTP/1.1
Host: api.example.com
Authorization: Payment <base64url-encoded credential>
~~~

Clients MAY use `HEAD` for payment-only updates when no response
body is needed. Clients MAY use any other HTTP method supported by
the endpoint.

## Server Processing

Servers MUST correlate companion requests with active streams using
the `challengeId` in the credential. Upon accepting a valid payment
update via a companion request, servers MUST:

1. Update the payment state for the associated stream
2. Return a `Payment-Receipt` header on the companion response
3. Resume content delivery on the paused SSE stream

Servers SHOULD support concurrent companion requests and SSE
delivery using HTTP/2 multiplexing or separate TCP connections.

## Correlation

The `challengeId` field in the credential binds companion requests
to the original stream. Servers MUST reject companion requests with
a `challengeId` that does not match any active stream.

# Reconnection

## EventSource Reconnection

Per {{SSE}}, clients MAY automatically reconnect after a connection
drop using the `Last-Event-ID` header. Payment-aware SSE servers
SHOULD support reconnection for paid streams:

1. Servers SHOULD assign SSE event IDs (`id:` field) to enable
   reconnection
2. On reconnection with `Last-Event-ID`, servers SHOULD verify the
   payment state is still valid (e.g., channel is still open,
   balance is sufficient)
3. If payment is still valid, servers SHOULD resume from the last
   delivered event
4. If payment has expired or is insufficient, servers MUST respond
   with 402 and a fresh challenge

## Reconnection with Credentials

When reconnecting to a paid SSE stream, clients MUST include the
`Authorization` header with a valid credential. Servers MUST NOT
resume a paid stream based solely on `Last-Event-ID` without
credential verification.

~~~http
GET /api/stream HTTP/1.1
Host: api.example.com
Accept: text/event-stream
Authorization: Payment <base64url-encoded credential>
Last-Event-ID: 42
~~~

# Security Considerations

## Transport Security

All SSE communication carrying payment data MUST occur over TLS 1.2
{{RFC5246}} or later (TLS 1.3 {{RFC8446}} RECOMMENDED). This protects
both the `Authorization` header on requests and SSE event data
containing receipts and payment signals.

## Credential Exposure

The `Authorization` header is sent on the initial request and any
companion requests. Clients MUST NOT include credentials in URL
query parameters, as SSE URLs may be logged by intermediaries.

Clients MUST NOT log or persist payment credentials beyond immediate
use. Servers MUST NOT log full credential payloads.

## Mid-Stream Challenge Integrity

The `402-need-payment` event is delivered over the same TLS
connection as the stream data. Clients MUST verify that mid-stream
payment events reference the same `challengeId` as the original
exchange. Clients MUST reject `402-need-payment` events with
unknown challenge identifiers.

## Connection Hijacking

If an attacker injects a `402-need-payment` event into an
unprotected stream, a client might submit a valid credential in
response. TLS prevents this on properly secured connections.
Servers MUST NOT serve paid SSE endpoints over plaintext HTTP.

## Denial of Service

Servers SHOULD implement rate limiting on:

- Initial payment challenges per client
- Companion requests per active stream
- `402-need-payment` events per stream (to prevent excessive
  client-side credential submissions)

Servers SHOULD close streams that receive no valid payment update
within a reasonable timeout after emitting `402-need-payment`.

## Stream Termination

When a payment channel is closed or invalidated during an active
stream, servers MUST:

1. Emit a `payment-error` event with the appropriate problem type
2. Stop delivering content
3. Close the SSE connection

## Replay Prevention

Servers MUST reject credentials containing expired challenges or
previously-used challenge IDs, per {{I-D.httpauth-payment}}. For
companion requests, servers MUST ensure idempotent processing of
duplicate credentials (e.g., same voucher submitted twice).

# IANA Considerations

This document has no IANA actions. Payment methods and intents are
registered per {{I-D.httpauth-payment}}.

This specification defines the following SSE event types for
informational purposes:

| Event Type | Description |
|------------|-------------|
| `payment-receipt` | Payment receipt delivery |
| `payment-error` | Payment-related error |

Mid-stream payment required events (e.g., `402-need-voucher`) are
defined by individual payment method specifications.

--- back

# Complete Example Flow

A complete SSE streaming session with payment:

**Step 1: Initial Request**

~~~http
GET /api/chat/completions HTTP/1.1
Host: api.llm-service.com
Accept: text/event-stream
~~~

**Step 2: Payment Challenge**

~~~http
HTTP/1.1 402 Payment Required
WWW-Authenticate: Payment id="kM9xPqWvT2nJrHsY4aDfEb",
  realm="api.llm-service.com",
  method="tempo",
  intent="stream",
  expires="2025-01-06T12:05:00Z",
  request="eyJhbW91bnQiOiIyNSIsInVuaXRUeXBlIjoibGxtX3Rva2VuIiwic3VnZ2VzdGVkRGVwb3NpdCI6IjEwMDAwMDAwIiwiY3VycmVuY3kiOiIweC4uLiIsInJlY2lwaWVudCI6IjB4Li4uIiwibWV0aG9kRGV0YWlscyI6eyJlc2Nyb3dDb250cmFjdCI6IjB4Li4uIiwiY2hhaW5JZCI6NDI0MzF9fQ"
Content-Type: application/problem+json

{
  "type": "https://paymentauth.org/problems/payment-required",
  "title": "Payment Required",
  "status": 402,
  "detail": "Streaming completions require a payment channel."
}
~~~

**Step 3: Request with Payment**

~~~http
GET /api/chat/completions HTTP/1.1
Host: api.llm-service.com
Accept: text/event-stream
Authorization: Payment eyJ...credential with action="open"...
~~~

**Step 4: Streaming Response with Payment**

~~~http
HTTP/1.1 200 OK
Content-Type: text/event-stream
Cache-Control: no-cache
Payment-Receipt: eyJ...initial receipt...

event: data
data: {"token":"Hello"}

event: data
data: {"token":" world"}

event: data
data: {"token":"!"}

event: payment-receipt
data: {"method":"tempo","intent":"stream","status":"success","timestamp":"2025-01-06T12:01:00Z","challengeId":"kM9xPqWvT2nJrHsY4aDfEb","channelId":"0x6d0f4fdf...","acceptedCumulative":"0","spent":"75","units":3}

~~~

**Step 5: Mid-Stream Top-Up (if balance exhausted)**

The server pauses and signals:

~~~
event: 402-need-voucher
data: {"channelId":"0x6d0f4fdf...","requiredCumulative":"250025","acceptedCumulative":"250000","deposit":"500000"}
~~~

Client sends a companion request:

~~~http
HEAD /api/chat/completions HTTP/1.1
Host: api.llm-service.com
Authorization: Payment eyJ...credential with action="voucher", cumulativeAmount="300000"...
~~~

Server responds and resumes the stream:

~~~http
HTTP/1.1 200 OK
Payment-Receipt: eyJ...updated receipt...
~~~

~~~
event: data
data: {"token":"continued"}

event: payment-receipt
data: {"method":"tempo","intent":"stream","status":"success","timestamp":"2025-01-06T12:02:00Z","challengeId":"kM9xPqWvT2nJrHsY4aDfEb","channelId":"0x6d0f4fdf...","acceptedCumulative":"300000","spent":"300025","units":12003}

~~~

# Relationship to Tempo Stream Method

The Tempo `stream` intent specification defines `402-need-voucher`
as the SSE event type for mid-stream payment signaling. This
transport specification defers to the method spec for mid-stream
event definitions while standardizing the behavioral contract
(pause, companion request, resume) and the transport-level events
(`payment-receipt`, `payment-error`).
