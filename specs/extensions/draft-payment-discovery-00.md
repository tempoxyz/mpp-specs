---
title: Discovery Mechanisms for HTTP Payment Authentication
abbrev: Payment Discovery
docname: draft-payment-discovery-00
version: 00
category: info
ipr: trust200902
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
  RFC8174:
  RFC8615:
  I-D.httpauth-payment:
    title: "The 'Payment' HTTP Authentication Scheme"
    target: https://datatracker.ietf.org/doc/draft-httpauth-payment/
    author:
      - name: Jake Moxey
    date: 2026-01
---

--- abstract

This document defines discovery mechanisms for the "Payment" HTTP
authentication scheme {{I-D.httpauth-payment}}. It specifies how clients
can discover a server's payment capabilities before initiating requests,
including supported payment methods, assets, and intents.

--- middle

# Introduction

The "Payment" HTTP authentication scheme {{I-D.httpauth-payment}} enables
servers to require payment for resource access. While the 402 response
with `WWW-Authenticate: Payment` header provides all information needed
to complete a paid exchange, clients may benefit from discovering payment
capabilities before making requests.

This specification defines an optional discovery mechanism using a
well-known HTTP endpoint that returns structured payment capability
information.

Discovery is OPTIONAL. Servers MAY implement this mechanism to improve
client experience. Clients MUST NOT require discovery to function; the
402 challenge provides all information needed to complete payment.

# Requirements Language

{::boilerplate bcp14-tagged}

# Terminology

Discovery
: The process by which a client learns a server's payment capabilities
  before initiating a request that may require paid access.

Payment Capabilities
: The set of payment methods, intents, and assets that a server
  accepts as payment.

# Well-Known Endpoint

## Endpoint Location Section

Servers MAY expose payment capabilities at the following location:

~~~
GET /.well-known/payment
~~~

## Request

The client issues a GET request to `/.well-known/payment`. The request
SHOULD include an `Accept` header with `application/json`:

~~~http
GET /.well-known/payment HTTP/1.1
Host: api.example.com
Accept: application/json
~~~

## Response

The server responds with a JSON object describing its payment capabilities.
The response MUST use `Content-Type: application/json`.

**Response Schema:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `version` | integer | REQUIRED | Schema version. Currently `1`. |
| `realm` | string | OPTIONAL | Default realm for payment challenges. |
| `methods` | object | REQUIRED | Map of supported payment methods. |

**Method Object Schema:**

Each key in `methods` is a registered payment method identifier. The value
is an object with:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `intents` | array | REQUIRED | Supported intent types. |
| `assets` | array | REQUIRED | Accepted asset identifiers (method-specific). |

**Example Response:**

~~~http
HTTP/1.1 200 OK
Content-Type: application/json
Cache-Control: max-age=300

{
  "version": 1,
  "realm": "api.example.com",
  "methods": {
    "tempo": {
      "intents": ["charge", "authorize", "subscription"],
      "assets": ["0x20c0000000000000000000000000000000000000"]
    },
    "lightning": {
      "intents": ["charge"],
      "assets": ["BTC"]
    }
  }
}
~~~

## Caching

Servers SHOULD include `Cache-Control` headers with short durations to
allow clients to detect capability changes. A maximum age of 5 minutes
is RECOMMENDED:

~~~http
Cache-Control: max-age=300
~~~

Longer durations (e.g., `max-age=3600`) MAY be used for capabilities that
change infrequently. Clients SHOULD respect cache headers and refetch
when capabilities may have changed (e.g., after receiving an unexpected
402 challenge for a method not in the cached discovery response).

## Error Handling

If the server does not support discovery, it SHOULD return 404 Not Found.
Clients MUST NOT treat a 404 response as an error; it simply indicates
discovery is unavailable.

# Security Considerations

## Discovery Spoofing

Discovery information is advisory and not cryptographically authenticated.
Clients MUST NOT rely on discovery for security decisions. The actual
payment challenge in the 402 response is authoritative.

## Well-Known Endpoint Security

The well-known endpoint MUST be served over HTTPS. Clients MUST NOT
accept discovery information over unencrypted HTTP.

## Information Disclosure

Discovery endpoints reveal payment capabilities to unauthenticated clients.
Servers should consider whether this information disclosure is acceptable.

# IANA Considerations

## Well-Known URI Registration

This document registers the following well-known URI in the "Well-Known
URIs" registry established by {{!RFC8615}}:

- **URI Suffix**: payment
- **Change Controller**: IETF
- **Reference**: This document, Section 4
- **Status**: permanent
- **Related Information**: None

--- back
