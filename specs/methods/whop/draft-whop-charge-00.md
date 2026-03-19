---
title: Whop charge Intent for HTTP Payment Authentication
abbrev: Whop Charge
docname: draft-whop-charge-00
version: 00
category: info
ipr: noModificationTrust200902
submissiontype: IETF
consensus: true

author:
  - name: Brendan Ryan
    ins: B. Ryan
    email: brendan@tempo.xyz
    organization: Tempo Labs

normative:
  RFC2119:
  RFC3339:
  RFC8174:
  RFC8785:
  RFC7235:
  I-D.httpauth-payment:
    title: "The 'Payment' HTTP Authentication Scheme"
    target: https://datatracker.ietf.org/doc/draft-ietf-httpauth-payment/
    author:
      - name: Jake Moxey
    date: 2026-01

informative:
  WHOP-API:
    target: https://dev.whop.com/api-reference
    title: Whop API Reference
    author:
      - org: Whop, Inc.
---

--- abstract

This document defines the "charge" intent for the Whop payment
method within the Payment HTTP Authentication Scheme
{{I-D.httpauth-payment}}. It specifies how clients and servers
exchange one-time fiat payments using Whop Checkout and the Whop
Payments API.

--- middle

# Introduction

This specification defines the "charge" intent for use with the
Whop payment method in the Payment HTTP Authentication Scheme
{{I-D.httpauth-payment}}. The charge intent enables one-time fiat
payments where the server creates a Whop checkout configuration,
the client completes payment via Whop's hosted checkout flow, and
the server verifies the payment through the Whop Payments API.

Whop provides payment processing through its hosted checkout
experience. Users pay via card, Apple Pay, or other methods
supported by Whop, and the server verifies settlement using a
Whop payment ID. No changes to Whop's backend are required; this
method uses Whop's existing public API.

## Whop Charge Flow

The following diagram illustrates the Whop charge payment flow:

~~~
   Client                    Server                    Whop
      |                         |                         |
      |  (1) GET /resource      |                         |
      |------------------------>|                         |
      |                         |                         |
      |                         |  (2) Create checkout    |
      |                         |      configuration      |
      |                         |------------------------>|
      |                         |                         |
      |                         |  (3) purchase_url       |
      |                         |<------------------------|
      |                         |                         |
      |  (4) 402 Payment        |                         |
      |      Required           |                         |
      |      request=<base64url>|                         |
      |      meta includes      |                         |
      |      purchase_url       |                         |
      |<------------------------|                         |
      |                         |                         |
      |  (5) Open checkout,     |                         |
      |      user pays          |                         |
      |----------------------------------------------->   |
      |                         |                         |
      |  (6) Payment ID         |                         |
      |<-----------------------------------------------|  |
      |                         |                         |
      |  (7) Authorization:     |                         |
      |      Payment            |                         |
      |      <credential>       |                         |
      |------------------------>|                         |
      |                         |  (8) Retrieve payment   |
      |                         |      (verify)           |
      |                         |------------------------>|
      |                         |                         |
      |  (9) 200 OK             |                         |
      |      Payment-Receipt:   |                         |
      |      <receipt>          |                         |
      |<------------------------|                         |
      |                         |                         |
~~~

## Relationship to the Payment Scheme

This document is a payment method intent specification as
defined in {{I-D.httpauth-payment}}. It defines the `request`
and `payload` structures for the `charge` intent of the `whop`
payment method, along with verification and settlement
procedures.

# Requirements Language

{::boilerplate bcp14-tagged}

# Terminology

Whop Checkout Configuration
: A server-created object via the Whop API
  (`checkoutConfigurations.create()`) that defines a one-time
  payment plan with a specified amount, currency, and company.
  Returns a `purchase_url` where the user completes payment.

Whop Payment ID
: A unique identifier (prefixed with `pay_`) returned by Whop
  after a user completes checkout. Used by the server to
  retrieve and verify payment status via the Whop Payments API.

Whop Company ID
: A unique identifier (prefixed with `biz_`) representing the
  merchant's business on the Whop platform.

# Intent Identifier

This specification defines the following intent for the `whop`
payment method:

~~~
charge
~~~

The intent identifier is case-sensitive and MUST be lowercase.

# Intent: "charge"

A one-time payment of the specified amount. The server creates a
Whop checkout configuration, the client completes payment via
the hosted checkout, and the server verifies the resulting
payment.

**Fulfillment mechanism:**

1. **Whop Checkout**: The server creates a checkout configuration
   via the Whop API and embeds the resulting `purchase_url` in
   the challenge metadata. The client opens the checkout URL,
   the user completes payment, and the client returns the Whop
   payment ID as the credential payload.

# Request Schema

The `request` parameter in the `WWW-Authenticate` challenge
contains a base64url-encoded JSON object with the following
fields. The JSON MUST be serialized using JSON Canonicalization
Scheme (JCS) {{RFC8785}} before base64url encoding, per
{{I-D.httpauth-payment}}.

## Shared Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `amount` | number | REQUIRED | Amount in decimal currency units (e.g., `5` for $5.00) |
| `currency` | string | REQUIRED | ISO 4217 currency code (e.g., `"usd"`) |
| `companyId` | string | REQUIRED | Whop Company ID (e.g., `"biz_xxx"`) |
| `description` | string | OPTIONAL | Human-readable payment description |

Because the request is JCS-canonicalized, trailing zeros in
numeric amounts are not preserved; e.g. USD 5.00 is encoded as
`5`, and USD 5.25 is encoded as `5.25`.

**Example:**

~~~ json
{
  "amount": 5,
  "companyId": "biz_abc123",
  "currency": "usd",
  "description": "Premium API access"
}
~~~

## Challenge Opaque Parameter

In addition to the `request` parameter, the server MUST include
the Whop checkout `purchase_url` in the challenge's `opaque`
auth-param as a base64url-encoded JSON object per
{{I-D.httpauth-payment}}. This URL is where the client directs
the user to complete payment.

~~~ json
{
  "purchase_url": "https://whop.com/checkout/chk_xxx..."
}
~~~

The `purchase_url` is not part of the cryptographically bound
`request` because it is ephemeral and specific to each checkout
session.

# Credential Schema

The Payment credential is a base64url-encoded JSON object
containing `challenge` and `payload` fields per
{{I-D.httpauth-payment}}. For Whop charge, the `payload` object
contains the following fields:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `paymentId` | string | REQUIRED | Whop Payment ID (starts with `pay_`) |
| `externalId` | string | OPTIONAL | Client's reference ID |

**Example:**

~~~ json
{
  "paymentId": "pay_1a2b3c4d5e6f",
  "externalId": "client_order_789"
}
~~~

# Verification Procedure {#charge-verification}

Servers MUST verify Payment credentials for charge intent:

1. Extract the `paymentId` from the credential payload
2. Verify the challenge ID matches the one issued
3. Verify the challenge has not expired
4. Retrieve the payment via the Whop Payments API
   (`payments.retrieve(paymentId)`)
5. Verify the payment `status` is `"paid"` or `"succeeded"`
6. Verify the payment `total` matches the challenge `amount`
7. Verify the payment `currency` matches the challenge
   `currency`

## Challenge Binding

Servers MUST verify that the credential corresponds to the
exact challenge issued. This includes validating:

- Challenge ID
- Amount
- Currency
- Company ID (if specified)

# Settlement Procedure {#charge-settlement}

**Synchronous settlement:**

1. Server receives and verifies the credential
   ({{charge-verification}})
2. Server retrieves the Whop payment and confirms its status:

~~~ javascript
// Using Whop SDK
const payment = await whopClient.payments.retrieve(
  credential.paymentId
)

// Or using raw API
const response = await fetch(
  `https://api.whop.com/api/v1/payments/${paymentId}`,
  { headers: { Authorization: `Bearer ${apiKey}` } }
)
const payment = await response.json()
~~~

3. Server MUST verify `payment.status` is `"paid"` or
   `"succeeded"`, `payment.total` matches the requested
   amount, and `payment.currency` matches the requested
   currency before returning 200 with `Payment-Receipt`
   header
4. If the payment is not found, not paid, or the amount does
   not match, server returns 402 with a new challenge

**Idempotency:**

Servers SHOULD track consumed challenge IDs to prevent the
same payment ID from being used to satisfy multiple challenges.
While Whop processes each payment only once, a single payment
ID could theoretically be replayed against different
challenge IDs if not tracked.

**Settlement timing:**

Whop processes payments synchronously during checkout. By the
time the client receives a payment ID, the payment has already
been captured. Servers SHOULD return 200 immediately after
verifying payment status.

## Receipt Generation

Upon successful settlement, servers MUST return a
`Payment-Receipt` header per {{I-D.httpauth-payment}}. Servers
MUST NOT include a `Payment-Receipt` header on error responses;
failures are communicated via HTTP status codes and Problem
Details.

The receipt payload for Whop charge:

| Field | Type | Description |
|-------|------|-------------|
| `method` | string | `"whop"` |
| `reference` | string | Whop Payment ID (e.g., `"pay_1a2b..."`) |
| `status` | string | `"success"` |
| `timestamp` | string | {{RFC3339}} verification time |
| `externalId` | string | OPTIONAL. Echoed from credential payload |

# Security Considerations

## Payment ID Replay

Whop payment IDs represent completed, one-time payments. Each
payment ID corresponds to a single checkout session and cannot
be charged again. However, a malicious client could attempt to
reuse a valid payment ID across multiple challenge IDs. Servers
MUST enforce single-use challenge IDs per
{{I-D.httpauth-payment}} and SHOULD maintain a local cache of
consumed payment IDs to prevent cross-challenge replay.

## Amount Verification

Clients MUST verify the payment amount in the challenge matches
their expectation before completing checkout. The Whop checkout
page displays the amount, providing a second verification point
for the user.

**Verification checklist:**

1. Verify the `amount` matches the expected cost
2. Verify the `currency` matches the expected currency
3. Verify the `description` matches the expected service
4. Verify the challenge hasn't expired
5. Verify the server's identity (TLS certificate validation)

## Checkout URL Integrity

The `purchase_url` is delivered via the challenge's opaque
metadata and points to a Whop-hosted checkout page. Clients
SHOULD verify the URL originates from `whop.com` before opening
it. Man-in-the-middle attacks are mitigated by the TLS
requirement, but clients MUST NOT follow redirects to non-Whop
domains during checkout.

## API Key Security

Servers MUST protect their Whop API key. The API key is used
server-side only for creating checkout configurations and
verifying payments. It MUST NOT be exposed to clients or
included in challenge parameters.

## HTTPS Requirement

All communication MUST use TLS 1.2 or higher. Payment
credentials and Whop API calls MUST only be transmitted over
HTTPS connections.

# IANA Considerations

## Payment Method Registration

This specification registers the "whop" payment method in the
"HTTP Payment Methods" registry established by
{{I-D.httpauth-payment}}:

| Method Identifier | Description | Reference |
|-------------------|-------------|-----------|
| `whop` | Whop Checkout fiat payment | This document |

## Payment Intent Registration

This specification registers the "charge" intent for the "whop"
payment method in the Payment Intent Registry established by
{{I-D.httpauth-payment}}:

- **Intent**: charge
- **Method**: whop
- **Specification**: [this document]

Contact: Tempo Labs (<contact@tempo.xyz>)

--- back

# ABNF Collected

~~~ abnf
whop-charge-challenge = "Payment" 1*SP
  "id=" quoted-string ","
  "realm=" quoted-string ","
  "method=" DQUOTE "whop" DQUOTE ","
  "intent=" DQUOTE "charge" DQUOTE ","
  "request=" base64url-nopad

whop-charge-credential = "Payment" 1*SP base64url-nopad

; Base64url encoding without padding per RFC 4648 Section 5
base64url-nopad = 1*( ALPHA / DIGIT / "-" / "_" )
~~~

# Examples

## Charge Example (HTTP Transport)

**Step 1: Client requests resource**

~~~ http
GET /api/fortune HTTP/1.1
Host: api.example.com
~~~

**Step 2: Server creates checkout and issues challenge**

The server first creates a Whop checkout configuration:

~~~ javascript
const checkout = await whopClient
  .checkoutConfigurations.create({
    company_id: "biz_abc123",
    plan: {
      initial_price: 1.00,
      plan_type: "one_time",
      currency: "usd",
    },
  })
// Returns: { id: "chk_...", purchase_url: "https://..." }
~~~

Then issues the 402 challenge:

~~~ http
HTTP/1.1 402 Payment Required
WWW-Authenticate: Payment id="ch_9f8e7d6c5b",
  realm="api.example.com",
  method="whop",
  intent="charge",
  request="eyJhbW91bnQiOjEsImNvbXBhbnlJZCI6Im
    Jpel9hYmMxMjMiLCJjdXJyZW5jeSI6InVzZCIsIm
    Rlc2NyaXB0aW9uIjoiRm9ydHVuZSBjb29raWUifQ",
  opaque="eyJwdXJjaGFzZV91cmwiOiJodHRwczovL3do
    b3AuY29tL2NoZWNrb3V0L2Noa194eHgifQ"
Cache-Control: no-store
Content-Type: application/json

{
  "type":
    "https://paymentauth.org/problems/payment-required",
  "title": "Payment Required",
  "status": 402,
  "detail": "This resource requires payment"
}
~~~

Decoded request:

~~~ json
{
  "amount": 1,
  "companyId": "biz_abc123",
  "currency": "usd",
  "description": "Fortune cookie"
}
~~~

Decoded opaque:

~~~ json
{
  "purchase_url": "https://whop.com/checkout/chk_xxx..."
}
~~~

**Step 3: Client completes checkout and submits credential**

The client opens the `purchase_url` in a browser window. The
user completes payment on Whop's hosted checkout page. Upon
completion, the client receives a Whop payment ID and submits
the credential:

~~~ http
GET /api/fortune HTTP/1.1
Host: api.example.com
Authorization: Payment eyJjaGFsbGVuZ2UiOnsiaWQiOiJj
  aF85ZjhlN2Q2YzViIiwicmVhbG0iOiJhcGkuZXhhbXBsZS
  5jb20iLCJtZXRob2QiOiJ3aG9wIiwiaW50ZW50IjoiY2hhc
  mdlIiwicmVxdWVzdCI6ImV5SmhiVzkxYm5RaU9qRXNJbU52
  YlhCaGJubEpaQ0k2SW1KcGVsOWhZbU14TWpNaUxDSmpkWE
  p5Wlc1amVTSTZJblZ6WkNJc0ltUmxjMk55YVhCMGFXOXVJ
  am9pUm05eWRIVnVaU0JqYjI5cmFXVWlmUSJ9LCJwYXlsb2
  FkIjp7InBheW1lbnRJZCI6InBheV8xYTJiM2M0ZDVlNmYif
  X0
~~~

Decoded credential:

~~~ json
{
  "challenge": {
    "id": "ch_9f8e7d6c5b",
    "realm": "api.example.com",
    "method": "whop",
    "intent": "charge",
    "request": "eyJhbW91bnQiOjEsImNvbXBhbn..."
  },
  "payload": {
    "paymentId": "pay_1a2b3c4d5e6f"
  }
}
~~~

**Step 4: Server verifies payment and returns resource**

~~~ http
HTTP/1.1 200 OK
Payment-Receipt: eyJtZXRob2QiOiJ3aG9wIiwicmVmZXJlbmNlIjoicGF5XzFhMmIzYzRkNWU2ZiIsInN0YXR1cyI6InN1Y2Nlc3MiLCJ0aW1lc3RhbXAiOiIyMDI2LTAzLTE5VDEyOjA0OjMyWiJ9
Cache-Control: private
Content-Type: application/json

{
  "fortune": "A journey of a thousand miles
    begins with a single step."
}
~~~

Decoded receipt:

~~~ json
{
  "method": "whop",
  "reference": "pay_1a2b3c4d5e6f",
  "status": "success",
  "timestamp": "2026-03-19T12:04:32Z"
}
~~~

# Acknowledgements

The authors thank Rishab Java for the initial mppx
implementation and the Tempo community for their feedback
on this specification.
