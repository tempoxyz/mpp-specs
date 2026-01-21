---
title: Discovery Mechanisms for HTTP Payment Authentication
docName: draft-payment-discovery-00
category: info
ipr: trust200902
submissionType: IETF
consensus: true

author:
  - fullname: Jake Moxey
    email: jake@tempo.xyz
    organization: Tempo Labs
---

## Abstract

This document defines discovery mechanisms for the "Payment" HTTP
authentication scheme [I-D.httpauth-payment]. It specifies how clients
can discover a server's payment capabilities before initiating requests,
including supported payment methods, assets, and intents.

## Status of This Memo

This Internet-Draft is submitted in full conformance with the provisions
of BCP 78 and BCP 79.

## Copyright Notice

Copyright (c) 2025 IETF Trust and the persons identified as the document
authors. All rights reserved.

## Table of Contents

1. [Introduction](#1-introduction)
2. [Requirements Language](#2-requirements-language)
3. [Well-Known Endpoint](#3-well-known-endpoint)
4. [Security Considerations](#4-security-considerations)
5. [IANA Considerations](#5-iana-considerations)
6. [References](#6-references)
7. [Authors' Addresses](#authors-addresses)

---

## 1. Introduction

The "Payment" HTTP authentication scheme [I-D.httpauth-payment] enables
servers to require payment for resource access. While the 402 response
with `WWW-Authenticate: Payment` header provides all information needed
to complete a payment, clients may benefit from discovering payment
capabilities before making requests.

This specification defines an optional discovery mechanism:

1. **Well-Known Endpoint**: An HTTP endpoint returning structured payment
   capability information

Discovery is OPTIONAL. Servers MAY implement this mechanism to improve
client experience. Clients MUST NOT require discovery to function.

---

## 2. Requirements Language

The key words "MUST", "MUST NOT", "REQUIRED", "SHALL", "SHALL NOT",
"SHOULD", "SHOULD NOT", "RECOMMENDED", "NOT RECOMMENDED", "MAY", and
"OPTIONAL" in this document are to be interpreted as described in
BCP 14 [RFC2119] [RFC8174] when, and only when, they appear in all
capitals, as shown here.

---

## 3. Well-Known Endpoint

### 3.1. Endpoint

Servers MAY expose payment capabilities at:

```
GET /.well-known/payment
```

### 3.2. Request

The client issues a GET request to `/.well-known/payment`. The request
SHOULD include an `Accept` header with `application/json`:

```http
GET /.well-known/payment HTTP/1.1
Host: api.example.com
Accept: application/json
```

### 3.3. Response

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

```http
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
```

### 3.4. Caching

Servers SHOULD include appropriate `Cache-Control` headers. Discovery
information typically changes infrequently; servers MAY use long cache
durations (e.g., `max-age=3600`).

### 3.5. Error Handling

If the server does not support discovery, it SHOULD return 404 Not Found.
Clients MUST NOT treat a 404 response as an error; it simply indicates
discovery is unavailable.

---

## 4. Security Considerations

### 4.1. Discovery Spoofing

Discovery information is advisory and not cryptographically authenticated.
Clients MUST NOT rely on discovery for security decisions. The actual
payment challenge in the 402 response is authoritative.

### 4.2. Well-Known Endpoint Security

The well-known endpoint MUST be served over HTTPS. Clients MUST NOT
accept discovery information over unencrypted HTTP.

### 4.3. Information Disclosure

Discovery endpoints reveal payment capabilities to unauthenticated clients.
Servers should consider whether this information disclosure is acceptable.

---

## 5. IANA Considerations

### 5.1. Well-Known URI Registration

This document registers the following well-known URI in the "Well-Known
URIs" registry established by [RFC8615]:

- **URI Suffix**: payment
- **Change Controller**: IETF
- **Reference**: This document, Section 3
- **Status**: permanent
- **Related Information**: None

---

## 6. References

### 6.1. Normative References

- **[RFC2119]** Bradner, S., "Key words for use in RFCs to Indicate
  Requirement Levels", BCP 14, RFC 2119, March 1997.

- **[RFC8174]** Leiba, B., "Ambiguity of Uppercase vs Lowercase in
  RFC 2119 Key Words", BCP 14, RFC 8174, May 2017.

- **[RFC8615]** Nottingham, M., "Well-Known Uniform Resource Identifiers
  (URIs)", RFC 8615, May 2019.

- **[I-D.httpauth-payment]** Moxey, J., "The 'Payment' HTTP Authentication
  Scheme", draft-httpauth-payment-00.

---

## Authors' Addresses

Jake Moxey
Tempo Labs
Email: jake@tempo.xyz

---

**License:** This specification is released into the public domain (CC0 1.0 Universal).
