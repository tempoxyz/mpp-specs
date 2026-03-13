---
title: Card charge Intent for HTTP Payment Authentication
abbrev: Card Charge
docname: draft-card-charge-00
version: 00
category: info
ipr: trust200902
submissiontype: IETF
consensus: true

author:
  - name: Jacob Brans
    ins: J. Brans
    email: jbrans@visa.com
    organization: Visa

normative:
  RFC2119:
  RFC3339:
  RFC7517:
  RFC8017:
  RFC8174:
  I-D.httpauth-payment:
    title: "The 'Payment' HTTP Authentication Scheme"
    target: https://datatracker.ietf.org/doc/draft-ietf-httpauth-payment/
    author:
      - name: Jake Moxey
    date: 2026-01
  I-D.payment-intent-charge:
    title: "Charge Intent for HTTP Payment Authentication"
    target: https://datatracker.ietf.org/doc/draft-payment-intent-charge/
    author:
      - name: Jake Moxey
    date: 2026-03

informative:
  VISA-INTELLIGENT-COMMERCE:
    target: https://developer.visa.com/capabilities/visa-intelligent-commerce
    title: Visa Intelligent Commerce
    author:
      - org: Visa Inc.
---

--- abstract

This document defines the "card" payment method and its
implementation of the "charge" intent
{{I-D.payment-intent-charge}} within the Payment HTTP
Authentication Scheme {{I-D.httpauth-payment}}.  It specifies
how clients and servers exchange one-time card payments using
encrypted network tokens.

--- middle

# Introduction

This specification defines the "card" payment method for use with the
"charge" intent {{I-D.payment-intent-charge}} in the Payment HTTP
Authentication Scheme {{I-D.httpauth-payment}}.  The charge intent
enables one-time card payments where the server processes the payment
immediately upon receiving the credential.

The card method is PSP-Agnostic.  Client Enablers should provision
agent-specific payment tokens using network services such as
{{VISA-INTELLIGENT-COMMERCE}}.

## Card Charge Flow

The card method implements the charge intent flow defined in
{{I-D.payment-intent-charge}}:

1. Client requests a resource.
2. Server responds 402 with a Challenge (amount, currency,
    accepted networks, encryption key).
3. Client forwards challenge context to its Client Enabler.
4. Client Enabler provisions a network token, encrypts it
    with the server's key, and returns the credential.
5. Client retries the request with an Authorization: Payment
    header containing the encrypted credential.
6. Server forwards the credential to its Server Enabler.
7. Server Enabler decrypts and processes the payment.
8. Server returns 200 with Payment-Receipt and the resource.

The client may include
[Trusted Agent Protocol](https://developer.visa.com/capabilities/trusted-agent-protocol/)
signature headers for additional identity assurance.

The following diagram illustrates the flow:

~~~
Client              Client Enabler             Server            Server Enabler
   |                       |                      |                     |
   |  (1) GET /resource    |                      |                     |
   |--------------------------------------------->|                     |
   |                       |                      |                     |
   |  (2) 402 + Challenge  |                      |                     |
   |<---------------------------------------------|                     |
   |                       |                      |                     |
   |  (3) Request token    |                      |                     |
   |---------------------->|                      |                     |
   |  (4) Token            |                      |                     |
   |<----------------------|                      |                     |
   |                       |                      |                     |
   |  (5) Retry GET /resource + Credential        |                     |
   |--------------------------------------------->|                     |
   |                       |                      | (6) Process payment |
   |                       |                      |-------------------->|
   |                       |                      | (7) Result          |
   |                       |                      |<--------------------|
   |  (8) 200 OK + Receipt |                      |                     |
   |<---------------------------------------------|                     |
   |                       |                      |                     |
~~~

## Relationship to the Payment Scheme

This document is a payment method specification as defined in
{{I-D.httpauth-payment}}.  It implements the "charge"
intent defined in {{I-D.payment-intent-charge}} for the "card"
payment method.  It defines the methodDetails, credential payload,
verification, and settlement procedures specific to card payments.

# Requirements Language

{::boilerplate bcp14-tagged}

# Terminology

Payment Data
: An encrypted token and associated metadata
  produced by a Client Enabler.

Client Enabler (CE)
: See {{client-enabler-profile}}.

Vault Provider
: Entity that stores sensitive card material (PAN or
  network token) and mediates calls to token service providers.
  A vault provider is one type of Client Enabler.

Token Service Provider (TSP)
: Entity that provisions network tokens
  and cryptograms.  Could be a PSP, card network, issuer
  processor, or a vault provider with direct network connections.

Server Enabler
: A payment service provider or processing entity
  on the server side that decrypts and processes the encrypted
  network token credential.

Network Token
: A card-network-issued token that replaces the Primary
  Account Number (PAN) for transaction processing.  Never exposed to
  the client or server.

Cryptogram
: A one-time-use value generated alongside a network token
  to authenticate a specific transaction.


# Intent Identifier

This specification defines the following intent for the `card` payment
method:

~~~
charge
~~~

The intent identifier is case-sensitive and MUST be lowercase.

# Intent: "charge"

This specification implements the "charge" intent defined in
{{I-D.payment-intent-charge}}.  A one-time card payment of the
specified amount.  The server processes the payment immediately
upon receiving the credential.

The charge intent properties (payment timing, idempotency,
reversibility) are defined in
{{I-D.payment-intent-charge}}.  For the card method, reversibility
is subject to card network chargeback rules.

**Fulfillment mechanism:*-The client obtains an encrypted network
token from its Client Enabler and submits it in an
Authorization: Payment header.  The Server Enabler decrypts and
processes the payment through existing card network rails.

# Request Schema

The server issues an HTTP 402 response with a WWW-Authenticate:
Payment header per {{I-D.httpauth-payment}}.  The request parameter
is a base64url-encoded JSON object containing the shared fields
defined in {{I-D.payment-intent-charge}} and
card-specific extensions in the methodDetails field.

**Example:**

~~~ http
HTTP/1.1 402 Payment Required
WWW-Authenticate: Payment
  id="ch_9xK2mR4vB7nQ",
  realm="api.merchant.com",
  method="card",
  intent="charge",
  expires="2026-02-19T12:10:00Z",
  request="eyJhbW91bnQiOiI0OTk5IiwiY3VycmVuY3kiOiJ1c2Qi..."
Cache-Control: no-store
~~~

## Shared Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `amount` | string | REQUIRED | Amount in smallest currency unit (e.g., "4999" = $49.99). |
| `currency` | string | REQUIRED | ISO 4217 code, lowercase (e.g., "usd"). |
| `recipient` | string | OPTIONAL | Merchant identifier in the method-native format.  For card payments, this is the merchant ID used by the Server Enabler. |
| `description` | string | OPTIONAL | Human-readable description of the payment. |
| `externalId` | string | OPTIONAL | Merchant's external reference (order ID, invoice number, etc.). |

## Method Details

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `methodDetails.accepted_networks` | array | REQUIRED | Card networks accepted (e.g., \["visa", "mastercard"\]). |
| `methodDetails.merchant_name` | string | REQUIRED | Human-readable merchant name for display (e.g., "Acme Corp"). |
| `methodDetails.encryption_jwk` | object | CONDIT. | Embedded JWK ({{RFC7517}} Section 4) containing the server's RSA public encryption key.  REQUIRED if `jwks_uri` is absent. |
| `methodDetails.jwks_uri` | string | OPTIONAL | HTTPS URI of a JWK Set ({{RFC7517}} Section 5).  MUST be on the same origin as the realm.  When present, `kid` MUST also be present. |
| `methodDetails.kid` | string | CONDIT. | Key ID referencing a key in the JWKS.  REQUIRED when `jwks_uri` is present. |
| `methodDetails.billing_required` | bool | OPTIONAL | When true, the Client Enabler SHOULD include billing info in the credential payload.  See {{billing-data}}. |

Challenge expiry is conveyed by the `expires` auth-param in
`WWW-Authenticate` per {{I-D.httpauth-payment}} and
{{I-D.payment-intent-charge}}.  Request objects MUST NOT duplicate
the expiry value.

## Encryption Key {#encryption-key}

The server provides its RSA public encryption key using one of
two mechanisms:

1. Embedded JWK (`encryption_jwk`) -- The server includes a JSON
    Web Key {{RFC7517}} directly in methodDetails.  This is
    the RECOMMENDED approach for most deployments.  It requires
    no additional infrastructure and works in environments where
    the Client Enabler cannot make outbound HTTP calls.

2. JWKS URI (`jwks_uri` + `kid`) -- The server hosts a JWK Set at
    an HTTPS endpoint and references the key by its `kid`.  The
    `jwks_uri` MUST be on the same origin as the challenge realm.
    This approach supports centralized key rotation and is
    suitable for large platforms managing keys across many
    merchants.

Key requirements:

- The key MUST be RSA (`"kty": "RSA"`) with a minimum length of
  2048 bits.  Servers SHOULD use 2048-bit or 4096-bit keys.

- The JWK MUST include `"alg": "RSA-OAEP-256"` and
  `"use": "enc"`.  Client Enablers MUST reject keys where `alg`
  is not "RSA-OAEP-256" or `use` is not "enc".

- The JWK MUST include a `"kid"` value.

- Server Enablers that manage encryption keys via X.509
  certificates MAY include the `"x5c"` parameter ({{RFC7517}}
  Section 4.7) in the JWK.

Key resolution procedure:

1. If `jwks_uri` is present in methodDetails, the Client Enabler
    MUST verify the URI is on the same origin as the challenge
    realm.  If the origins differ, the CE MUST reject the
    challenge.  The CE MUST fetch the JWK Set from the URI over
    HTTPS and select the key matching `kid`.  If the `kid` is not
    found, the CE MUST reject the challenge.

2. Otherwise, if `encryption_jwk` is present in methodDetails, the
    CE MUST use the embedded key directly.

3. If neither is present, the CE MUST reject the challenge.

4. The CE MUST validate the resolved key: `kty` MUST be "RSA",
    `alg` MUST be "RSA-OAEP-256", and `use` MUST be "enc".

When `encryption_jwk` is used, the `kid` value is taken from
within the JWK object.  A top-level `kid` field MUST NOT be
present when `encryption_jwk` is used.  When `jwks_uri` is used,
the top-level `kid` field identifies which key to select from
the JWK Set.

The Server Enabler (or its delegated infrastructure) is
responsible for key pair generation and private key management.

The Client Enabler MUST encrypt the token payload using
RSA-OAEP with SHA-256 {{RFC8017}} before returning it to the
client.  Implementations MUST NOT use PKCS#1 v1.5 padding.
The client forwards the encrypted token to the server without inspecting it.
The Server Enabler holds the corresponding private key and
decrypts the token for processing.

**Example (embedded JWK in methodDetails):**

~~~ json
{
  "amount": "4999",
  "currency": "usd",
  "recipient": "merch_abc123",
  "description": "Pro plan -- monthly subscription",
  "methodDetails": {
    "accepted_networks": ["visa", "mastercard", "amex"],
    "merchant_name": "Acme Corp",
    "encryption_jwk": {
      "kty": "RSA",
      "kid": "enc-2026-01",
      "use": "enc",
      "alg": "RSA-OAEP-256",
      "n": "0vx7agoebGcQSuu...",
      "e": "AQAB"
    }
  }
}
~~~

# Credential Schema

The client retries the original request with an Authorization: Payment
header containing a base64url-encoded JSON credential, following the
standard MPP credential structure {{I-D.httpauth-payment}}.

**Example request:**

~~~ http
GET /api/resource HTTP/1.1
Host: api.merchant.com
Authorization: Payment eyJjaGFsbGVuZ2UiOnsiaWQiOiJjaF85eEsy...
~~~

## Credential Structure

The decoded credential follows the standard MPP format:

~~~ json
{
  "challenge": {
    "id": "ch_9xK2mR4vB7nQ",
    "realm": "api.merchant.com",
    "method": "card",
    "intent": "charge",
    "request": "eyJhbW91bnQiOiI0OTk5Ii...",
    "expires": "2026-02-19T12:10:00Z"
  },
  "payload": {
    "token": "<base64-encoded RSA-OAEP ciphertext>",
    "network": "visa",
    "lastFour": "4242",
    "expirationMonth": "06",
    "expirationYear": "2028",
    "eci": "07",
    "billing": {
      "first_name": "Jane",
      "last_name": "Smith",
      "postal_code": "94102",
      "country": "US"
    }
  }
}
~~~

The `challenge` field echoes the challenge from the 402 response.
The `payload` field contains the card-specific payment proof.

## Payload Fields {#payload-fields}

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `token` | string | REQUIRED | Encrypted token ({{token-format}}).  Client and server MUST NOT parse. |
| `network` | string | REQUIRED | Card network: "visa", "mastercard", "amex", "discover". |
| `lastFour` | string | OPTIONAL | Last four digits of the card number as displayed to the cardholder.  Display metadata only. |
| `expirationMonth` | string | OPTIONAL | Token expiration month (e.g., "06").  Display metadata only. |
| `expirationYear` | string | OPTIONAL | Token expiration year.  MUST be four digits (e.g., "2028") when present.  Display metadata only. |
| `eci` | string | OPTIONAL | Electronic Commerce Indicator (e.g., "05", "07").  Present when network_token type. |
| `billing` | object | OPTIONAL | Billing information ({{billing-data}}). |

The `token` field is the only REQUIRED proof element.  The `network`
field is REQUIRED for routing.  The `lastFour`, `expirationMonth`,
`expirationYear`, and `eci` fields are display metadata; the Server
Enabler obtains authoritative values from inside the decrypted
token ({{token-format}}).  The `billing` field is operational data
used for address verification and fulfillment ({{billing-data}}).

## Token Format {#token-format}

The `token` field carries an encrypted JSON object containing all
fields required to process the charge.  The plaintext MUST be a
minified UTF-8 encoded JSON object.  The `type` field determines
the variant.

Network token (type: "network_token"):

~~~ json
{
  "type": "network_token",
  "dpan": "4242424242424242",
  "exp": "0628",
  "cryptogram": "AmDDBjkH/4A=",
  "eci": "07",
  "par": "PAR9876543210987654321012345"
}
~~~

Raw PAN (type: "pan"):

~~~ json
{
  "type": "pan",
  "pan": "4111111111111234",
  "exp": "0628",
  "par": "PAR9876543210987654321012345"
}
~~~

| Field | Required | Description |
|-------|----------|-------------|
| `type` | REQUIRED | "network_token" or "pan". |
| `dpan` | REQUIRED if network_token | Network token number (DPAN) as issued by the TSP. |
| `pan` | REQUIRED if pan | Primary Account Number. |
| `exp` | REQUIRED | Expiration as MMYY (e.g., "0628"). |
| `cryptogram` | REQUIRED if network_token | Base64-encoded cryptogram (TAVV). |
| `eci` | REQUIRED if network_token | Electronic Commerce Indicator. |
| `par` | OPTIONAL | Payment Account Reference. |

The CE encrypts this JSON object using RSA-OAEP with SHA-256 and
the encryption key resolved per {{encryption-key}}, then
base64-encodes the ciphertext.  The Server Enabler decrypts the
token to recover the full payment payload.

NOTE: The plaintext MUST NOT exceed the RSA key modulus size
minus OAEP padding overhead (e.g., 190 bytes for a 2048-bit
key with SHA-256).  Implementations that require larger
payloads SHOULD use 4096-bit keys.  The plaintext is the
minified UTF-8 JSON; implementations MUST NOT include
unnecessary whitespace.

Clients and servers MUST NOT parse the `token` field.

## Billing Data {#billing-data}

When `billing_required` is true in the challenge methodDetails,
the Client Enabler SHOULD include billing
information in the credential payload.

The `billing` field in the credential payload is a JSON
object with the following OPTIONAL fields:

~~~ json
{
  "first_name": "Jane",
  "last_name": "Smith",
  "address_line1": "123 Main St",
  "address_line2": "Apt 4B",
  "city": "San Francisco",
  "state": "CA",
  "postal_code": "94102",
  "country": "US"
}
~~~

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `first_name` | string | OPTIONAL | Cardholder first name (given name). |
| `last_name` | string | OPTIONAL | Cardholder last name (family name). |
| `address_line1` | string | OPTIONAL | Street address, line 1. |
| `address_line2` | string | OPTIONAL | Street address, line 2. |
| `city` | string | OPTIONAL | City or locality. |
| `state` | string | OPTIONAL | State, province, or region. |
| `postal_code` | string | OPTIONAL | Postal or ZIP code. |
| `country` | string | OPTIONAL | ISO 3166-1 alpha-2 country code (e.g., "US"). |

All billing fields are OPTIONAL within the billing object.
Client Enablers SHOULD include whichever fields are available
from the cardholder's stored billing profile.

If `billing_required` is true but the credential omits the
`billing` field, the server MAY reject the credential or
proceed at its discretion.

# Verification Procedure

Servers MUST verify Payment credentials per the verification
requirements in {{I-D.payment-intent-charge}}.  The
following procedure implements those requirements for the card
method:

1. Decode the credential: base64url-decode the token from the
    Authorization: Payment header and parse as JSON.

2. Verify challenge binding: confirm `challenge.id` matches an
    outstanding challenge issued by this server.

3. Verify the challenge has not expired (check the `expires` field).

4. Verify the method: confirm `challenge.method` equals "card".

5. Verify network acceptance: confirm `payload.network` is in the
    `accepted_networks` list from methodDetails.

6. Reject replays: confirm this `challenge.id` has not been previously
    fulfilled.  Mark it as consumed.

7. Verify payment amount: the Server Enabler MUST confirm the
    authorization amount matches the amount from the request
    object.

## Challenge Binding {#challenge-binding}

Servers MUST verify that the credential corresponds to the exact
challenge issued.  Challenge IDs SHOULD be cryptographically bound
(e.g., HMAC) to their parameters to enable stateless verification.
Bound parameters include:

- Challenge ID

- Amount and currency (from the request object)

- Accepted networks

- Recipient (merchant ID)

- Realm

- Expiry timestamp

- Encryption key identifier (`kid`)

Alternatively, servers MAY store challenge parameters server-side
and verify by lookup using the challenge ID.

## Idempotency and Replay Protection

Per {{I-D.payment-intent-charge}}, each credential
MUST be usable only once per challenge.  Servers MUST reject
replayed credentials.

Servers MUST use `challenge.id` as an idempotency key when forwarding
to the Server Enabler.  This prevents duplicate charges from
retried requests.

Replay behavior:

- Same `challenge.id`, credential already processed: server MUST
  return the cached receipt (HTTP 200) or HTTP 409 Conflict.

- Same `challenge.id`, challenge expired: server MUST return HTTP
  402 with a fresh challenge.

- Challenge IDs MUST contain at least 128 bits of entropy.

- Servers MUST store challenge state with a TTL of at least the
  challenge expiry window plus a grace period (RECOMMENDED:
  expiry + 5 minutes).

- Servers SHOULD purge challenge state after the TTL expires.

# Client Enabler Profile {#client-enabler-profile}

A Client Enabler (CE) is any entity that accepts challenge
context from a client, provisions a network token and
cryptogram, encrypts the result using the server's encryption
key ({{encryption-key}}), and returns the credential payload.
Client Enablers include vault providers, token service
providers, and PSPs acting as issuers.  This section defines
a minimal HTTP interface that CEs SHOULD implement for
interoperability.

## Token Request Interface

The client sends a request to the Client Enabler with the
card identifier and the full challenge context (including the
encryption key from methodDetails as `encryption_jwk` or
`jwks_uri` + `kid`).  Authentication to the Client Enabler is out of
scope of this specification; the Bearer token shown below is
illustrative.  The endpoint URL, path, and authentication mechanism
are CE-defined; the example below uses `POST /v1/payment-tokens`
for illustration.

**Request:**

~~~ http
POST /v1/payment-tokens HTTP/1.1
Host: api.vault-provider.com
Content-Type: application/json
Authorization: Bearer <agent_api_key>
~~~

~~~ json
{
  "card_id": "card_abc123",
  "challenge": {
    "id": "ch_9xK2mR4vB7nQ",
    "realm": "api.merchant.com",
    "amount": "4999",
    "currency": "usd",
    "accepted_networks": ["visa", "mastercard"],
    "merchant_name": "Acme Corp",
    "encryption_jwk": {
      "kty": "RSA",
      "kid": "enc-2026-01",
      "use": "enc",
      "alg": "RSA-OAEP-256",
      "n": "0vx7agoebGcQSuu...",
      "e": "AQAB"
    }
  }
}
~~~

The Client Enabler MUST:

- Validate that the `card_id` exists and belongs to the
  authenticated client.

- Provision a network token and cryptogram (or raw PAN) for
  the transaction.

- Resolve the encryption key per the procedure in
  {{encryption-key}}: use `encryption_jwk` directly, or fetch
  `jwks_uri` and select by `kid`.

- Validate the key: `kty` MUST be "RSA", `alg` MUST be
  "RSA-OAEP-256", `use` MUST be "enc".

- Encrypt the token payload using RSA-OAEP with SHA-256
  and the resolved key ({{token-format}}).

- Return the encrypted token along with display metadata and
  authentication context.

**Response:**

~~~ http
HTTP/1.1 200 OK
Content-Type: application/json
~~~

~~~ json
{
  "token": "<base64-encoded RSA-OAEP ciphertext>",
  "network": "visa",
  "lastFour": "4242",
  "expirationMonth": "06",
  "expirationYear": "2028",
  "eci": "07"
}
~~~

The response body contains the credential payload fields
defined in {{payload-fields}}.  The client includes these fields directly
in the credential payload.

# Settlement Procedure

After credential verification, the Server Enabler decrypts the
network token using the private key corresponding to the
encryption key published in the challenge, and submits an
authorization request to the card network.

On approval, the server returns HTTP 200 with a
`Payment-Receipt` header and the requested resource.  Servers
SHOULD return 200 immediately after authorization approval,
even though final fund settlement is pending.

If the issuing bank declines, the server MUST return an error
response and SHOULD issue a fresh 402 challenge to allow the
client to retry.

## Receipt Generation

Upon successful authorization, servers MUST return a
`Payment-Receipt` header per {{I-D.httpauth-payment}}.  Servers
MUST NOT include `Payment-Receipt` on error responses.

Decoded receipt:

~~~ json
{
  "challengeId": "ch_9xK2mR4vB7nQ",
  "method": "card",
  "status": "success",
  "reference": "visa_txn_abc123",
  "timestamp": "2026-02-19T12:05:30Z",
  "externalId": "order_12345"
}
~~~

Receipt fields:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `challengeId` | string | REQUIRED | The challenge ID that was fulfilled. |
| `method` | string | REQUIRED | "card". |
| `status` | string | REQUIRED | "success". |
| `reference` | string | REQUIRED | Authorization reference from the Server Enabler. |
| `timestamp` | string | REQUIRED | {{RFC3339}} timestamp of the authorization. |
| `externalId` | string | OPTIONAL | Echo of the `externalId` from the request, if provided. |

# Security Considerations

## Transport Security {#transport-security}

All MPP exchanges MUST occur over TLS 1.2 or higher (TLS 1.3
recommended).  Plain HTTP MUST be rejected.  Clients SHOULD verify
the server's TLS certificate.

## Credential and PAN Security

The `token` field is not readable by the client ({{token-format}}).  The
Client Enabler encrypts the token using the server's
encryption key ({{encryption-key}}), provided as a JWK via
`encryption_jwk` or resolved from `jwks_uri` in methodDetails.
Only the Server Enabler holding the corresponding private key
can decrypt and process it.

Raw Primary Account Numbers MUST never appear in MPP messages,
logs, or client memory.  Only encrypted network tokens travel
in the credential.  The client never has access to decrypted
token material.

## Billing Data Handling

Billing information ({{billing-data}}) is personally identifiable
information (PII) and SHOULD be handled in accordance with
applicable privacy regulations (e.g., GDPR, CCPA).

- Billing data is transmitted as a plaintext JSON object
  within the credential payload, protected by TLS in transit
  ({{transport-security}}).

- Servers and intermediaries SHOULD NOT log billing data
  in plaintext unless required for order fulfillment or
  dispute resolution.

- Servers SHOULD retain billing data only as long as needed
  for their business purpose (address verification,
  fulfillment, dispute resolution) and in accordance with
  applicable privacy regulations.

# IANA Considerations

## Payment Method Registration

This specification registers the "card" payment method in the
Payment Method Registry per {{I-D.httpauth-payment}}:

- **Method**: card

- **Description**: Card payment via encrypted network token credential

- **Specification**: [this document]

## Payment Intent Registration

This specification registers the "charge" intent for the "card"
payment method in the Payment Intent Registry per
{{I-D.httpauth-payment}}:

- **Intent**: charge

- **Method**: card

- **Specification**: [this document]

Contact: Visa (<jbrans@visa.com>)

--- back

# ABNF Collected

~~~ abnf
card-challenge = "Payment" 1*SP
  "id=" quoted-string ","
  "realm=" quoted-string ","
  "method=" DQUOTE "card" DQUOTE ","
  "intent=" DQUOTE "charge" DQUOTE ","
  "request=" base64url
  *("," 1*SP token "=" ( token / quoted-string ))

card-credential = "Payment" 1*SP base64url
~~~

# Examples

## Charge Example (HTTP Transport)

**Step 1: Client requests resource**

~~~ http
GET /api/data HTTP/1.1
Host: api.merchant.com
~~~

**Step 2: Server issues payment challenge**

~~~ http
HTTP/1.1 402 Payment Required
WWW-Authenticate: Payment
  id="ch_9xK2mR4vB7nQ",
  realm="api.merchant.com",
  method="card",
  intent="charge",
  expires="2026-02-19T12:10:00Z",
  request="eyJhbW91bnQiOiI0OTk5IiwiY3VycmVuY3kiOiJ1c2QiLCJyZWNp
    cGllbnQiOiJtZXJjaF9hYmMxMjMiLCJkZXNjcmlwdGlvbiI6IlBybyBw
    bGFuIC0tIG1vbnRobHkgc3Vic2NyaXB0aW9uIiwiZXh0ZXJuYWxJZCI6
    Im9yZGVyXzEyMzQ1IiwibWV0aG9kRGV0YWlscyI6eyJhY2NlcHRlZF9u
    ZXR3b3JrcyI6WyJ2aXNhIiwibWFzdGVyY2FyZCIsImFtZXgiXSwibWVy
    Y2hhbnRfbmFtZSI6IkFjbWUgQ29ycCJ9fQ"
Cache-Control: no-store
Content-Type: application/problem+json
~~~

~~~ json
{
  "type": "https://paymentauth.org/problems/payment-required",
  "title": "Payment Required",
  "status": 402,
  "detail": "This resource requires payment"
}
~~~

Decoded request:

~~~ json
{
  "amount": "4999",
  "currency": "usd",
  "recipient": "merch_abc123",
  "description": "Pro plan -- monthly subscription",
  "externalId": "order_12345",
  "methodDetails": {
    "accepted_networks": ["visa", "mastercard", "amex"],
    "merchant_name": "Acme Corp",
    "billing_required": true,
    "encryption_jwk": {
      "kty": "RSA",
      "kid": "enc-2026-01",
      "use": "enc",
      "alg": "RSA-OAEP-256",
      "n": "0vx7agoebGcQSuu...",
      "e": "AQAB"
    }
  }
}
~~~

**Step 3: Client obtains credential from Client Enabler**

The client sends challenge parameters (including encryption JWK
from methodDetails) to its Client Enabler ({{client-enabler-profile}}).
The CE provisions a network token and cryptogram via existing TSPs,
encrypts the token with the server's encryption key, and returns
the result.

**Step 4: Client retries request with credential**

~~~ http
GET /api/data HTTP/1.1
Host: api.merchant.com
Authorization: Payment eyJjaGFsbGVuZ2UiOnsiaWQiOiJjaF85eEsy
  bVI0dkI3blEiLCJyZWFsbSI6ImFwaS5tZXJjaGFudC5jb20iLCJtZXRo
  b2QiOiJjYXJkIiwiaW50ZW50IjoiY2hhcmdlIn0sInBheWxvYWQiOnsi
  cGF5bWVudF9kYXRhIjp7InR5cGUiOiJDQVJEIiwiaW5mbyI6eyJjYXJk
  TmV0d29yayI6IlZJU0EiLCJjYXJkRGV0YWlscyI6IjQyNDIifX19fQ
~~~

Decoded credential:

~~~ json
{
  "challenge": {
    "id": "ch_9xK2mR4vB7nQ",
    "realm": "api.merchant.com",
    "method": "card",
    "intent": "charge",
    "request": "eyJhbW91bnQiOiI0OTk5Ii4uLn0",
    "expires": "2026-02-19T12:10:00Z"
  },
  "payload": {
    "token": "<base64-encoded RSA-OAEP ciphertext>",
    "network": "visa",
    "lastFour": "4242",
    "expirationMonth": "06",
    "expirationYear": "2028",
    "eci": "07",
    "billing": {
      "first_name": "Jane",
      "last_name": "Smith",
      "postal_code": "94102",
      "country": "US"
    }
  }
}
~~~

**Step 5: Server processes payment and returns resource**

~~~ http
HTTP/1.1 200 OK
Payment-Receipt: eyJjaGFsbGVuZ2VJZCI6ImNoXzl4SzJtUjR2QjduUSIs
  Im1ldGhvZCI6ImNhcmQiLCJzdGF0dXMiOiJzdWNjZXNzIiwicmVmZXJl
  bmNlIjoidmlzYV90eG5fYWJjMTIzIiwidGltZXN0YW1wIjoiMjAyNi0w
  Mi0xOVQxMjowNTozMFoiLCJleHRlcm5hbElkIjoib3JkZXJfMTIzNDUi
  fQ
Cache-Control: private
Content-Type: application/json
~~~

~~~ json
{
  "data": "Here is your requested resource..."
}
~~~

Decoded receipt:

~~~ json
{
  "challengeId": "ch_9xK2mR4vB7nQ",
  "method": "card",
  "status": "success",
  "reference": "visa_txn_abc123",
  "timestamp": "2026-02-19T12:05:30Z",
  "externalId": "order_12345"
}
~~~

# Acknowledgements

The authors thank the Tempo community for their feedback on this
specification.
