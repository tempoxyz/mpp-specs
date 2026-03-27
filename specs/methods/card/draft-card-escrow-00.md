---
title: Card Network Escrow Intent for HTTP Payment Authentication
abbrev: Card Escrow
docname: draft-card-escrow-00
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
  RFC3339:
  RFC4648:
  RFC7516:
  RFC7517:
  RFC8174:
  RFC8259:
  RFC9457:
  I-D.httpauth-payment:
    title: "The 'Payment' HTTP Authentication Scheme"
    target: https://datatracker.ietf.org/doc/draft-httpauth-payment/
    author:
      - name: Jake Moxey
    date: 2026-01
  I-D.payment-intent-escrow:
    title: "'Escrow' Intent for HTTP Payment Authentication"
    target: https://github.com/tempoxyz/mpp-specs
    author:
      - name: Ryuji Ishiguro
    date: 2026-03
  I-D.card-charge:
    title: "Card Network Charge Intent for HTTP Payment Authentication"
    target: https://github.com/tempoxyz/mpp-specs
    author:
      - name: Jacob Brans
    date: 2026-03

---

--- abstract

This document defines the "card" payment method's implementation of
the "escrow" intent within the Payment HTTP Authentication Scheme
{{I-D.httpauth-payment}}. It specifies how clients and servers
exchange card preauthorizations as escrow holds, with subsequent
capture or void operations mapping to settlement and release.

--- middle

# Introduction

The card charge specification {{I-D.card-charge}} defines one-time
card payments where the full amount is captured immediately. Many
services cannot determine the final charge at authorization time.
A parking session depends on departure time. A fueling transaction
depends on the amount dispensed. A hotel stay may include incidental
charges.

The "escrow" intent {{I-D.payment-intent-escrow}} addresses those
cases by separating payment into a hold phase and a settlement
phase. This document specifies how to implement the escrow intent
using standard card network preauthorization, capture, and void
operations.

Card preauthorization and capture is one of the oldest payment
patterns in electronic commerce. Every major card processor already
supports these operations through existing APIs. This specification
defines how to surface that functionality through the MPP 402
challenge-response flow.

## Card Escrow Flow

The card escrow flow proceeds in two stages.

**Hold stage** (within the 402 exchange):

1. Client requests a resource without credentials.
2. Server responds with 402 and a Payment challenge containing the
   maximum hold amount, currency, accepted networks, and
   encryption key.
3. Client forwards the challenge to its Client Enabler (CE).
4. CE provisions a network token and cryptogram, encrypts the
   result with the server's key, and returns the credential.
5. Client resubmits the request with a Payment credential.
6. Server Enabler submits a preauthorization (not a charge) to
   the card network for the hold amount.
7. Server returns 200 with a Payment-Receipt containing the
   preauthorization reference.

**Settlement stage** (out of band, after service delivery):

8. Merchant captures the final amount against the preauthorization
   (settle). The capture amount MUST be less than or equal to
   the preauthorized amount.
9. Alternatively, the merchant voids the preauthorization
   (release) to return the full hold to the cardholder.

## Relationship to Other Specifications

This document is a method-specific binding of the abstract escrow
intent defined in {{I-D.payment-intent-escrow}}. It inherits the
intent semantics, flow, and security requirements from that
specification.

This document reuses the credential format, encryption scheme,
Client Enabler profile, and verification procedures defined in the
card charge specification {{I-D.card-charge}}. The key differences
are:

- The `intent` field is `"escrow"` instead of `"charge"`.
- The Server Enabler submits a preauthorization instead of a
  charge.
- Settlement (capture) and release (void) occur out of band.
- The receipt includes a preauthorization reference for later
  capture or void.

# Requirements Language

{::boilerplate bcp14-tagged}

# Terminology

This document inherits all terminology from {{I-D.card-charge}}
including Payment Data, Client Enabler, Server Enabler, Payment
Service Provider, Network Token, and Cryptogram.

The following additional terms apply:

Preauthorization
: A card network authorization that reserves funds on the
  cardholder's account without capturing them. The hold reduces
  the cardholder's available credit or balance. Also known as an
  "auth-only" transaction.

Capture
: A subsequent request to the card network to collect funds
  against a prior preauthorization. The capture amount MUST be
  less than or equal to the preauthorized amount. Partial capture
  is supported by most processors.

Void
: A request to cancel a preauthorization before capture. The
  hold is removed and the cardholder's available balance is
  restored. Also known as an "authorization reversal."

# Request Schema

The server issues an HTTP 402 response with a WWW-Authenticate:
Payment header per {{I-D.httpauth-payment}}. The request parameter
is a base64url-encoded {{RFC4648}} JSON object {{RFC8259}} using
JCS canonicalization.

## Shared Fields

The shared fields are identical to those in {{I-D.card-charge}}:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `amount` | string | REQUIRED | Maximum preauthorization amount in smallest currency unit |
| `currency` | string | REQUIRED | ISO 4217 code, lowercase |
| `recipient` | string | OPTIONAL | Merchant identifier at the Server Enabler |
| `description` | string | OPTIONAL | Human-readable description of the hold |
| `externalId` | string | OPTIONAL | Merchant reference |

The `amount` field represents the maximum hold, not the final
charge. Clients SHOULD verify the amount is reasonable before
authorizing.

## Method Details

The `methodDetails` fields are identical to those in
{{I-D.card-charge}}:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `acceptedNetworks` | array | REQUIRED | Card networks accepted |
| `merchantName` | string | REQUIRED | Human-readable merchant name |
| `encryptionJwk` | object | CONDIT. | Embedded JWK {{RFC7517}} with RSA public key |
| `jwksUri` | string | OPTIONAL | HTTPS URI of a JWK Set |
| `kid` | string | CONDIT. | Key ID for JWKS lookup |
| `billingRequired` | boolean | OPTIONAL | Whether billing info is needed |

The following field is added for the escrow intent:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `holdExpiry` | string | OPTIONAL | {{RFC3339}} timestamp indicating when the preauthorization may expire |

Card network preauthorizations typically expire after 7 days for
most merchant category codes. The `holdExpiry` field communicates
the expected hold window to the client. Clients SHOULD reject
challenges where `holdExpiry` exceeds their policy maximum.

Encryption key resolution follows the same procedure defined in
{{I-D.card-charge}}.

## Example

~~~ json
{
  "amount": "15000",
  "currency": "usd",
  "recipient": "merch_fuel_456",
  "description": "Fuel pump preauthorization",
  "externalId": "pump_session_789",
  "methodDetails": {
    "acceptedNetworks": ["visa", "mastercard"],
    "merchantName": "FuelCo Station #42",
    "encryptionJwk": {
      "kty": "RSA",
      "kid": "enc-2026-03",
      "use": "enc",
      "alg": "RSA-OAEP-256",
      "n": "0vx7agoebGcQSuu...",
      "e": "AQAB"
    },
    "holdExpiry": "2026-04-02T14:00:00Z"
  }
}
~~~

# Credential Schema

The credential format is identical to {{I-D.card-charge}}. The
client obtains an encrypted network token from its Client Enabler
and submits it in an Authorization: Payment header.

## Credential Structure

The decoded credential follows the standard MPP format:

~~~ json
{
  "challenge": {
    "id": "ch_F2kL9mN4xR7q",
    "realm": "api.fuelco.example.com",
    "method": "card",
    "intent": "escrow",
    "request": "eyJhbW91bnQiOiIxNTAwMCIs...",
    "expires": "2026-03-26T14:10:00Z"
  },
  "payload": {
    "encryptedPayload": "<JWE compact serialization>",
    "network": "visa",
    "panLastFour": "4242",
    "panExpirationMonth": "06",
    "panExpirationYear": "2028"
  }
}
~~~

The `challenge.intent` field MUST be `"escrow"`. The `payload`
fields are identical to those defined in {{I-D.card-charge}}.

# Verification Procedure

The verification procedure follows {{I-D.card-charge}} with one
critical difference: the Server Enabler submits a
**preauthorization** (auth-only) instead of a charge.

1. Decode the credential: base64url-decode the token from the
   Authorization: Payment header and parse as JSON.

2. Verify challenge binding: confirm `challenge.id` matches an
   outstanding challenge issued by this server.

3. Verify the challenge has not expired.

4. Verify the method: confirm `challenge.method` equals `"card"`.

5. Verify the intent: confirm `challenge.intent` equals
   `"escrow"`.

6. Verify network acceptance: confirm `payload.network` is in the
   `acceptedNetworks` list from methodDetails.

7. Reject replays: confirm this `challenge.id` has not been
   previously fulfilled. Mark it as consumed.

8. Forward the credential to the Server Enabler for
   **preauthorization** (not capture). The Server Enabler
   decrypts the JWE {{RFC7516}} using the corresponding private
   key and submits an auth-only request to the card network.

9. Verify the preauthorization was approved by the issuing bank.

10. Record the preauthorization reference for later capture or
    void.

If the preauthorization is declined, the server MUST return 402
with a fresh challenge and a Problem Details {{RFC9457}} response
body.

## Error Responses

| type suffix | Condition |
|-------------|-----------|
| `malformed-credential` | Credential cannot be decoded or is missing fields |
| `invalid-challenge` | Challenge ID is unknown, expired, or consumed |
| `network-declined` | Issuing bank declined the preauthorization |
| `verification-failed` | Credential verification failed |

## Receipt Generation

Upon successful preauthorization, the server MUST return a
`Payment-Receipt` header per {{I-D.httpauth-payment}}.

~~~ json
{
  "method": "card",
  "intent": "escrow",
  "challengeId": "ch_F2kL9mN4xR7q",
  "status": "success",
  "timestamp": "2026-03-26T14:05:30Z",
  "reference": "preauth_visa_xyz789",
  "externalId": "pump_session_789",
  "holdAmount": "15000",
  "holdCurrency": "usd"
}
~~~

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `method` | string | REQUIRED | `"card"` |
| `intent` | string | REQUIRED | `"escrow"` |
| `challengeId` | string | REQUIRED | The challenge ID that was fulfilled |
| `status` | string | REQUIRED | `"success"` |
| `timestamp` | string | REQUIRED | {{RFC3339}} timestamp of the preauthorization |
| `reference` | string | REQUIRED | Preauthorization reference from the Server Enabler |
| `externalId` | string | OPTIONAL | Echo of `externalId` from the request |
| `holdAmount` | string | OPTIONAL | Preauthorized amount in base units |
| `holdCurrency` | string | OPTIONAL | ISO 4217 currency code |

The `reference` field is the preauthorization identifier that the
merchant backend uses for later capture or void operations.

# Settlement Procedure

Settlement occurs outside the HTTP 402 flow. The merchant backend
communicates directly with its Server Enabler (PSP) using the
preauthorization reference from the receipt.

## Capture (Settle)

The merchant submits a capture request to the Server Enabler:

- The `reference` from the receipt identifies the preauthorization.
- The capture `amount` MUST be less than or equal to the
  preauthorized `holdAmount`.
- Partial capture is supported: the merchant captures only the
  final amount and the remainder is automatically released by the
  card network.

Most card processors expose capture as a single API call:

~~~
POST /v1/payments/{reference}/capture
{
  "amount": "3247"
}
~~~

The Server Enabler submits the capture to the card network. Upon
success, the captured amount is transferred from the cardholder to
the merchant during the next settlement cycle (typically 1-2
business days).

## Void (Release)

If the merchant does not need to capture any amount, it submits a
void (authorization reversal):

~~~
POST /v1/payments/{reference}/void
~~~

The Server Enabler submits the reversal to the card network. The
hold is removed from the cardholder's account immediately (or
within the network's processing window).

## Timing Constraints

Card network preauthorizations have limited lifetimes:

- Most merchant category codes: 7 days
- Hotels and car rentals: up to 31 days
- Some processors allow extensions

If the merchant does not capture within the preauthorization
window, the hold expires automatically and the funds are returned
to the cardholder. The capture will fail.

Merchants MUST capture or void within the preauthorization window.
The `holdExpiry` field in `methodDetails` communicates this window
to the client.

## Idempotency

Capture and void are idempotent at the processor level. A second
capture request for the same preauthorization reference returns the
same result. A void after capture fails. A capture after void
fails. These are standard card network semantics.

## Capture and Void Are Mutually Exclusive

A preauthorization can be either captured or voided, but not both.
Attempting to void a captured preauthorization will fail.
Attempting to capture a voided preauthorization will fail. This
satisfies the atomicity requirement of
{{I-D.payment-intent-escrow}}.

# Security Considerations

## Transport Security

All MPP exchanges MUST occur over TLS 1.2 or higher (TLS 1.3
recommended). Plain HTTP MUST be rejected. This requirement is
inherited from {{I-D.httpauth-payment}} and {{I-D.card-charge}}.

## Credential Security

The credential format, encryption scheme, and key management
requirements are identical to {{I-D.card-charge}}. The
`encryptedPayload` is a JWE {{RFC7516}} compact serialization
encrypted with RSA-OAEP-256 and AES-256-GCM. Only the Server
Enabler can decrypt it.

## Hold Amount Verification

Clients MUST verify the requested `amount` is appropriate before
authorizing a preauthorization. Malicious servers could request
excessive holds that reduce the cardholder's available credit.
Client Enablers and agents SHOULD enforce per-transaction and
aggregate hold limits.

## Preauthorization Expiry

Unlike on-chain escrow contracts, card preauthorizations expire
according to card network rules, not a field in the challenge.
The `holdExpiry` field is advisory. Merchants MUST NOT rely on the
hold persisting beyond the network's standard authorization
window. If the hold expires before capture, the merchant loses the
ability to collect payment.

## Capture Authorization

Capture requests are authenticated between the merchant and its
Server Enabler (PSP) using the PSP's standard API authentication.
The preauthorization reference is not a bearer token — knowing the
reference alone is not sufficient to capture funds. The PSP
verifies that the capture request comes from the merchant
associated with the original preauthorization.

## Replay Protection

Per {{I-D.payment-intent-escrow}}, each credential MUST be usable
only once per challenge. Servers MUST track consumed challenge IDs.
The card network provides additional replay protection: a
cryptogram can only be used for one authorization.

## Billing Data Handling

The billing data handling requirements from {{I-D.card-charge}}
apply equally to the escrow intent. Billing information,
`cardholderFullName`, and `paymentAccountReference` are PII and
SHOULD be handled in accordance with applicable privacy
regulations.

# IANA Considerations

## Payment Intent Registration

This document registers the following payment intent in the "HTTP
Payment Intents" registry established by {{I-D.httpauth-payment}}:

| Intent | Applicable Methods | Description | Reference |
|--------|-------------------|-------------|-----------|
| `escrow` | `card` | Card preauthorization with deferred capture | This document, {{I-D.payment-intent-escrow}} |

--- back

# ABNF Collected

~~~abnf
card-escrow-challenge = "Payment" 1*SP
  "id=" quoted-string ","
  "realm=" quoted-string ","
  "method=" DQUOTE "card" DQUOTE ","
  "intent=" DQUOTE "escrow" DQUOTE ","
  "request=" base64url-nopad
  [ "," "expires=" quoted-string ]

card-escrow-credential = "Payment" 1*SP base64url-nopad

; Base64url encoding without padding per RFC 4648 Section 5
base64url-nopad = 1*( ALPHA / DIGIT / "-" / "_" )
~~~

# Example

## Fueling Example

**Step 1: Client requests pump access**

~~~ http
POST /api/pump/unlock HTTP/1.1
Host: api.fuelco.example.com
Content-Type: application/json

{"pumpId": "7", "vehicleId": "ABC-1234"}
~~~

**Step 2: Server issues escrow challenge**

~~~ http
HTTP/1.1 402 Payment Required
WWW-Authenticate: Payment
  id="ch_F2kL9mN4xR7q",
  realm="api.fuelco.example.com",
  method="card",
  intent="escrow",
  expires="2026-03-26T14:10:00Z",
  request="eyJhbW91bnQiOiIxNTAwMCIsImN1cnJlbmN5Ijoi
    dXNkIiwicmVjaXBpZW50IjoibWVyY2hfZnVlbF80NTYiLC
    JkZXNjcmlwdGlvbiI6IkZ1ZWwgcHVtcCBwcmVhdXRob3Jp
    emF0aW9uIiwiZXh0ZXJuYWxJZCI6InB1bXBfc2Vzc2lvbl
    83ODkiLCJtZXRob2REZXRhaWxzIjp7ImFjY2VwdGVkTmV0
    d29ya3MiOlsidmlzYSIsIm1hc3RlcmNhcmQiXSwibWVyY2
    hhbnROYW1lIjoiRnVlbENvIFN0YXRpb24gIzQyIn19"
Cache-Control: no-store
Content-Type: application/problem+json

{"type": "about:blank", "title": "Payment Required", "status": 402}
~~~

**Step 3: Client obtains credential and retries**

~~~ http
POST /api/pump/unlock HTTP/1.1
Host: api.fuelco.example.com
Authorization: Payment eyJjaGFsbGVuZ2UiOnsiaWQiOiJjaF9G
  MmtMOW1ONHhSN3EiLCJyZWFsbSI6ImFwaS5mdWVsY28uZXhh
  bXBsZS5jb20iLCJtZXRob2QiOiJjYXJkIiwiaW50ZW50Ijoi
  ZXNjcm93In0sInBheWxvYWQiOnsiZW5jcnlwdGVkUGF5bG9h
  ZCI6IjxKV0UgY29tcGFjdD4iLCJuZXR3b3JrIjoidmlzYSIs
  InBhbkxhc3RGb3VyIjoiNDI0MiJ9fQ
Content-Type: application/json

{"pumpId": "7", "vehicleId": "ABC-1234"}
~~~

**Step 4: Server preauthorizes and unlocks pump**

~~~ http
HTTP/1.1 200 OK
Payment-Receipt: eyJtZXRob2QiOiJjYXJkIiwiaW50ZW50Ijoi
  ZXNjcm93IiwiY2hhbGxlbmdlSWQiOiJjaF9GMmtMOW1ONHhS
  N3EiLCJzdGF0dXMiOiJzdWNjZXNzIiwidGltZXN0YW1wIjoiMj
  AyNi0wMy0yNlQxNDowNTozMFoiLCJyZWZlcmVuY2UiOiJwcm
  VhdXRoX3Zpc2FfeHl6Nzg5In0
Cache-Control: private
Content-Type: application/json

{"pumpId": "7", "status": "unlocked", "maxAmount": "$150.00"}
~~~

**Step 5: Customer fuels, merchant captures actual amount**

After the customer finishes fueling ($47.23 dispensed), the
merchant backend captures the actual amount:

~~~
POST /v1/payments/preauth_visa_xyz789/capture
Host: api.psp.example.com
Authorization: Bearer <psp_api_key>
Content-Type: application/json

{"amount": "4723"}
~~~

The remaining $102.77 hold is automatically released by the
card network.

# Acknowledgements

The card charge specification {{I-D.card-charge}} defines the
credential format, encryption scheme, and Client Enabler profile
reused in this document. The escrow intent
{{I-D.payment-intent-escrow}} defines the abstract hold, settle,
and release semantics implemented here.
