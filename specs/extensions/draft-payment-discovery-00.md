---
title: Discovery Mechanisms for HTTP Payment Authentication
abbrev: Payment Discovery
docname: draft-payment-discovery-00
category: info
ipr: trust200902
submissiontype: IETF
consensus: true

author:
  - name: Jake Moxey
    ins: J. Moxey
    email: jake@tempo.xyz
    organization: Tempo Labs

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
to complete a payment, clients may benefit from discovering payment
capabilities before making requests.

This specification defines two optional discovery mechanisms:

1. **Well-Known Endpoint**: An HTTP endpoint returning structured payment
   capability information
2. **DNS Discovery**: DNS TXT records advertising payment support

Discovery is OPTIONAL. Servers MAY implement these mechanisms to improve
client experience. Clients MUST NOT require discovery to function.

# Requirements Language

{::boilerplate bcp14-tagged}

# Well-Known Endpoint

## Endpoint

Servers MAY expose payment capabilities at:

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
Cache-Control: max-age=3600

{
  "version": 1,
  "realm": "api.example.com",
  "methods": {
    "tempo": {
      "intents": ["charge", "authorize", "subscription"],
      "assets": ["0x20c0000000000000000000000000000000000001"]
    },
    "lightning": {
      "intents": ["charge"],
      "assets": ["BTC"]
    }
  }
}
~~~

## Caching

Servers SHOULD include appropriate `Cache-Control` headers. Discovery
information typically changes infrequently; servers MAY use long cache
durations (e.g., `max-age=3600`).

## Error Handling

If the server does not support discovery, it SHOULD return 404 Not Found.
Clients MUST NOT treat a 404 response as an error; it simply indicates
discovery is unavailable.

# DNS Discovery

## TXT Record Format

Servers MAY advertise payment support via DNS TXT records at the
`_payment` subdomain:

~~~
_payment.<domain>. TXT "v=payment1; methods=<method-list>"
~~~

**Parameters:**

| Parameter | Required | Description |
|-----------|----------|-------------|
| `v` | REQUIRED | Version identifier. MUST be `payment1`. |
| `methods` | REQUIRED | Comma-separated list of supported method identifiers. |

**Example:**

~~~
_payment.api.example.com. TXT "v=payment1; methods=tempo,lightning"
~~~

## Multiple Records

If multiple TXT records exist, clients SHOULD use the first record with
a valid `v=payment1` prefix.

## Limitations

DNS discovery provides only basic capability advertisement. For detailed
information (assets, intents), clients SHOULD use the well-known endpoint
or rely on 402 responses.

# Security Considerations

## Discovery Spoofing

Discovery information is advisory and not cryptographically authenticated.
Clients MUST NOT rely on discovery for security decisions. The actual
payment challenge in the 402 response is authoritative.

## DNS Security

DNS TXT records are subject to DNS spoofing attacks. Clients SHOULD use
DNSSEC-validated resolvers when available.

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
- **Reference**: This document, Section 3
- **Status**: permanent
- **Related Information**: None

{backmatter}
