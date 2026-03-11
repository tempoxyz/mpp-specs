---
title: Service Discovery for HTTP Payment Authentication
abbrev: Payment Discovery
docname: draft-payment-discovery-00
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
  RFC3986:
  RFC8174:
  RFC8259:
  RFC8615:
  RFC9110:
  OPENAPI:
    title: "OpenAPI Specification v3.1.0"
    target: https://spec.openapis.org/oas/v3.1.0
    author:
      - org: OpenAPI Initiative
    date: 2021
  I-D.httpauth-payment:
    title: "The 'Payment' HTTP Authentication Scheme"
    target: https://datatracker.ietf.org/doc/draft-httpauth-payment/
    author:
      - name: Brendan Ryan
    date: 2026-01

informative:
  RFC9176:
  A2A:
    title: "Agent2Agent Protocol Specification"
    target: https://github.com/a2aproject/A2A
    author:
      - org: Google
    date: 2025
  MCP-REGISTRY:
    title: "Model Context Protocol Registry"
    target: https://github.com/modelcontextprotocol/registry
    author:
      - org: Anthropic
    date: 2025
  X402:
    title: "x402: HTTP Payment Protocol"
    target: https://github.com/coinbase/x402
    author:
      - org: Coinbase
    date: 2025
  ERC-8004:
    title: "ERC-8004: Trustless Agents Registry"
    target: https://eips.ethereum.org/EIPS/eip-8004
    date: 2025
  LLMS-TXT:
    title: "llms.txt - A Proposal to Standardise
      LLM-Friendly Documentation"
    target: https://llmstxt.org/
    date: 2024
---

--- abstract

This document defines a service discovery framework for
the "Payment" HTTP authentication scheme. It specifies
a two-tier discovery architecture: (1) an OpenAPI
document as the canonical machine-readable contract for
payment-enabled APIs, annotated with payment extensions
that describe pricing, payment methods, and intent
types; and (2) a well-known endpoint as a compatibility
fallback for services that cannot publish OpenAPI. The
runtime 402 challenge remains authoritative for all
payment parameters.

--- middle

# Introduction

The "Payment" HTTP authentication scheme
{{I-D.httpauth-payment}} enables servers to require
payment for resource access using the HTTP 402 status
code. While the 402 challenge provides all information
needed to complete a single paid exchange, clients and
agents benefit from discovering payment-enabled services
before initiating requests.

This specification defines a discovery framework with
two tiers:

- Tier 1 (OpenAPI Discovery): An OpenAPI {{OPENAPI}}
  document annotated with payment extensions. This is
  the RECOMMENDED and canonical discovery mechanism.
  OpenAPI provides both payment metadata and input
  schemas, enabling agents to discover and invoke
  endpoints without additional documentation.

- Tier 2 (Well-Known Fallback): A minimal JSON
  manifest at `/.well-known/payment` for services
  that cannot publish OpenAPI. This tier provides
  basic payment capability metadata but lacks input
  schemas.

Clients SHOULD prefer OpenAPI when available. The
runtime 402 challenge defined in
{{I-D.httpauth-payment}} is always authoritative and
takes precedence over any discovery metadata.

Discovery is OPTIONAL. Servers MAY implement this
mechanism to improve client experience. Clients MUST
NOT require discovery to function; the 402 challenge in
{{I-D.httpauth-payment}} is always authoritative.

# Requirements Language

{::boilerplate bcp14-tagged}

# Terminology

Service
: An HTTP origin that accepts payment via the "Payment"
  authentication scheme.

Discovery Document
: An OpenAPI document or well-known manifest that
  describes a service's payment capabilities.

Payable Operation
: An API operation that requires payment, indicated by
  a 402 response and `x-payment-info` extension in the
  OpenAPI document.

# Discovery Precedence {#discovery-precedence}

Clients MUST resolve discovery metadata in the
following order, stopping at the first valid source:

| Order | Source | Expected Location |
|-------|--------|-------------------|
| 1 | OpenAPI document | `/openapi.json` then `/.well-known/openapi.json` |
| 2 | Well-known fallback | `/.well-known/payment` |

If an OpenAPI document is present and contains valid
payment extensions, clients MUST use it and SHOULD NOT
fall back to `/.well-known/payment`. If no OpenAPI
document is found (404 or invalid), clients SHOULD
attempt the well-known fallback.

In all cases, the runtime 402 challenge is
authoritative. If discovery metadata conflicts with the
402 challenge, the 402 challenge takes precedence.

# Tier 1: OpenAPI Discovery {#openapi-discovery}

Services SHOULD publish an OpenAPI 3.x {{OPENAPI}}
document that describes their API surface, including
payment-enabled operations. This is the canonical and
RECOMMENDED discovery mechanism.

## Document Location

The OpenAPI document MUST be accessible at one of the
following locations:

~~~
GET /openapi.json
GET /.well-known/openapi.json
~~~

Clients MUST try `/openapi.json` first. If that returns
a non-2xx response, clients SHOULD try
`/.well-known/openapi.json`.

The document MUST be served over HTTPS with
`Content-Type: application/json`.

## Required Top-Level Fields

The OpenAPI document MUST include the following
standard fields:

- `openapi`: The OpenAPI version (e.g., `"3.1.0"`).
- `info.title`: The service name.
- `info.version`: The API version.
- `paths`: At least one path with operations.

## Service Extension: x-service-info {#x-service-info}

The OpenAPI document MAY include a top-level
`x-service-info` extension object to provide service
metadata that is not part of the standard OpenAPI
specification.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `categories` | array | OPTIONAL | Service categories (see {{categories}}). |
| `docs` | object | OPTIONAL | Documentation and reference links (see {{docs-schema}}). |

This extension ensures that OpenAPI documents carry
the same service metadata available in the well-known
fallback ({{well-known-fallback}}), enabling registries
and agents to use a single discovery source.

## Payment Extension: x-payment-info {#x-payment-info}

Each payable operation MUST include the
`x-payment-info` extension object on the operation.
This extension describes the payment requirements for
the operation.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `intent` | string | REQUIRED | `"charge"` (per-request) or `"session"` (pay-as-you-go). |
| `method` | string | REQUIRED | Payment method identifier (e.g., `"tempo"`, `"stripe"`). |
| `amount` | string or null | REQUIRED | Cost in base currency units. `null` indicates dynamic pricing. |
| `currency` | string | OPTIONAL | Currency identifier. For blockchain methods: token contract address. For fiat: ISO 4217 code. |
| `description` | string | OPTIONAL | Human-readable pricing note. |

The `amount` field is REQUIRED but its value MAY be
`null` to support endpoints where pricing depends on
request parameters (e.g., variable-cost operations).
When non-null, the value MUST be a string of ASCII
digits (`0`-`9`) representing a non-negative integer in
the smallest denomination of the currency (e.g., cents
for USD, wei for ETH). Leading zeros MUST NOT be used
except for the value `"0"`. This format is consistent
with the `amount` field defined in the request object
of {{I-D.httpauth-payment}}.

## 402 Response Declaration

Each payable operation MUST include a `402` response
in its `responses` object:

~~~yaml
responses:
  "402":
    description: "Payment Required"
~~~

This signals to clients that the operation may return
a 402 challenge requiring payment.

## Input Schema

Each operation SHOULD define its input schema using
the standard OpenAPI `requestBody` field:

~~~yaml
requestBody:
  content:
    application/json:
      schema:
        type: object
        properties:
          prompt:
            type: string
        required:
          - prompt
~~~

Input schemas enable agents to construct valid requests
without additional documentation. Operations that omit
input schemas MAY be marked as "schema-missing" by
discovery clients and registries.

## Example OpenAPI Document

~~~json
{
  "openapi": "3.1.0",
  "info": {
    "title": "Example AI API",
    "version": "1.0.0"
  },
  "x-service-info": {
    "categories": ["compute"],
    "docs": {
      "homepage": "https://api.example.com/docs",
      "llms": "https://api.example.com/llms.txt",
      "apiReference":
        "https://api.example.com/reference"
    }
  },
  "paths": {
    "/v1/chat/completions": {
      "post": {
        "summary": "Chat completions",
        "x-payment-info": {
          "intent": "session",
          "method": "tempo",
          "amount": "500",
          "currency":
            "0x20c00000000000000000000000000000000000"
        },
        "requestBody": {
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "properties": {
                  "model": { "type": "string" },
                  "messages": {
                    "type": "array",
                    "items": {
                      "type": "object",
                      "properties": {
                        "role": {
                          "type": "string"
                        },
                        "content": {
                          "type": "string"
                        }
                      },
                      "required": ["role",
                        "content"]
                    }
                  }
                },
                "required": ["model", "messages"]
              }
            }
          }
        },
        "responses": {
          "200": {
            "description": "Successful response"
          },
          "402": {
            "description": "Payment Required"
          }
        }
      }
    },
    "/v1/embeddings": {
      "post": {
        "summary": "Text embeddings",
        "x-payment-info": {
          "intent": "charge",
          "method": "tempo",
          "amount": null,
          "currency":
            "0x20c00000000000000000000000000000000000",
          "description": "Price varies by model
            and token count."
        },
        "requestBody": {
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "properties": {
                  "model": { "type": "string" },
                  "input": { "type": "string" }
                },
                "required": ["model", "input"]
              }
            }
          }
        },
        "responses": {
          "200": {
            "description": "Successful response"
          },
          "402": {
            "description": "Payment Required"
          }
        }
      }
    }
  }
}
~~~

# Tier 2: Well-Known Fallback {#well-known-fallback}

Services that cannot publish an OpenAPI document MAY
use the well-known fallback as a compatibility bridge.
This mechanism provides basic payment capability
metadata but lacks the input schema information
available in OpenAPI.

Services SHOULD prefer OpenAPI discovery
({{openapi-discovery}}) when feasible.

## Endpoint Location

Services that use the fallback MUST serve a JSON
document at the following well-known URI {{RFC8615}}:

~~~
GET /.well-known/payment
~~~

The endpoint MUST be served over HTTPS. Clients MUST
NOT accept discovery information over unencrypted HTTP.

## Request

The client issues a GET request with an `Accept` header
of `application/json`:

~~~http
GET /.well-known/payment HTTP/1.1
Host: api.example.com
Accept: application/json
~~~

## Response

The server responds with an HTTP 200 (OK) {{RFC9110}}
response containing a JSON object {{RFC8259}} conforming
to the Service Manifest Schema defined below. The
response MUST use `Content-Type: application/json`.

## Service Manifest Schema {#manifest-schema}

The service manifest is a JSON object with the
following fields:

### Top-Level Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `version` | integer | REQUIRED | Schema version. Currently `1`. |
| `name` | string | REQUIRED | Human-readable display name. |
| `description` | string | REQUIRED | Short description of the service. |
| `categories` | array | OPTIONAL | Service categories. |
| `endpoints` | array | OPTIONAL | API endpoints with payment details. |
| `docs` | object | OPTIONAL | Documentation and reference links. |

The `version` field MUST be a positive integer. Clients
MUST check the `version` field before processing the
response. If the value is higher than the version the
client supports, the client SHOULD treat the response
as unsupported and fall back to the 402 challenge flow.

The `name` field MUST be a non-empty string.

The `description` field MUST be a non-empty string.

### Categories {#categories}

The `categories` field, when present, MUST be an array
of strings. Category values are free-form; services
MAY use any string value. The following values are
RECOMMENDED as a starting vocabulary:

~~~
communication, compute, data, developer-tools,
media, search, social, storage, travel
~~~

Category values SHOULD be lowercase, use hyphens for
multi-word values, and be concise. Registries SHOULD
limit services to no more than 5 categories per
manifest. Clients SHOULD ignore category values they
do not recognize.

### Endpoints {#endpoints-schema}

The `endpoints` field, when present, MUST be an array
of Endpoint Objects. Each object describes a single API
endpoint:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `method` | string | REQUIRED | HTTP method: `GET`, `POST`, `PUT`, `PATCH`, `DELETE`, `HEAD`, or `OPTIONS`. |
| `path` | string | REQUIRED | URL path pattern. MUST start with `/`. MAY contain `:param` placeholders. |
| `description` | string | OPTIONAL | What this endpoint does. |
| `payment` | object | OPTIONAL | Payment requirement. Omission or `null` indicates a free endpoint. |

#### Endpoint Payment Object

When present, the `payment` field MUST be a JSON
object:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `intent` | string | REQUIRED | `"charge"` (per-request) or `"session"` (pay-as-you-go). |
| `method` | string | REQUIRED | Payment method identifier (e.g., `"tempo"`, `"stripe"`). |
| `amount` | string or null | REQUIRED | Cost in base units of the currency. `null` indicates dynamic pricing. |
| `currency` | string | OPTIONAL | Currency identifier. For blockchain methods: token contract address. For fiat: ISO 4217 code. |
| `description` | string | OPTIONAL | Human-readable pricing note. |

The `amount` field is REQUIRED but its value MAY be
`null` to support endpoints where pricing depends on
request parameters (e.g., variable-cost operations).
When non-null, the value MUST be a string of ASCII
digits (`0`-`9`) representing a non-negative integer
in the smallest denomination of the currency (e.g.,
cents for USD, wei for ETH). Leading zeros MUST NOT
be used except for the value `"0"`. This format is
consistent with the `amount` field defined in the
request object of {{I-D.httpauth-payment}}.
When `amount` is `null`, clients SHOULD expect pricing
to be communicated via the 402 challenge at request
time.

### Documentation Links {#docs-schema}

The `docs` field, when present, MUST be a JSON object
with the following optional fields:

| Field | Type | Description |
|-------|------|-------------|
| `apiReference` | string (URI) | API reference documentation URL. |
| `homepage` | string (URI) | Main documentation or landing page. |
| `llms` | string (URI) | LLM-friendly documentation URL (see {{LLMS-TXT}}). |
| `openapi` | string (URI) | OpenAPI/Swagger specification URL. |

All URI values MUST conform to {{RFC3986}}.

## Example Service Manifest

~~~json
{
  "version": 1,
  "name": "Example AI API",
  "description": "Chat completions, embeddings,
    and image generation.",
  "categories": ["compute"],
  "endpoints": [
    {
      "method": "POST",
      "path": "/v1/chat/completions",
      "description": "Chat completions.",
      "payment": {
        "intent": "session",
        "method": "tempo",
        "amount": "500",
        "currency":
          "0x20c00000000000000000000000000000000000"
      }
    },
    {
      "method": "POST",
      "path": "/v1/embeddings",
      "description": "Text embeddings.",
      "payment": {
        "intent": "charge",
        "method": "tempo",
        "amount": null,
        "currency":
          "0x20c00000000000000000000000000000000000",
        "description": "Price varies by model
          and token count."
      }
    }
  ],
  "docs": {
    "homepage": "https://api.example.com/docs",
    "llms": "https://api.example.com/llms.txt",
    "openapi":
      "https://api.example.com/openapi.json",
    "apiReference":
      "https://api.example.com/reference"
  }
}
~~~

## Extensibility

The service manifest schema is designed for forward
compatibility. Implementations MUST ignore unknown
top-level fields and unknown fields within nested
objects. The `version` field provides a mechanism for
introducing breaking schema changes in the future.

## Caching

Servers SHOULD include `Cache-Control` headers. A
maximum age of 5 minutes is RECOMMENDED for services
whose capabilities change infrequently:

~~~http
Cache-Control: max-age=300
~~~

Clients SHOULD respect cache headers and refetch when
capabilities may have changed.

## Error Handling

If the server does not support the well-known fallback,
it SHOULD return 404 Not Found. Clients MUST NOT treat
a 404 response as an error; it indicates that the
fallback is unavailable and the client SHOULD rely on
the 402 challenge flow.

# Relationship to the 402 Challenge

Discovery metadata is advisory. The 402 challenge
defined in {{I-D.httpauth-payment}} is always
authoritative.

Specifically:

- If discovery indicates a payment method that differs
  from the 402 challenge, the 402 challenge takes
  precedence.
- If discovery indicates an amount that differs from
  the 402 challenge, the 402 challenge takes
  precedence.
- Clients MUST NOT cache discovery data as a
  substitute for processing 402 challenges.

Discovery exists to help clients and agents find and
evaluate services before making requests, not to
replace the runtime payment negotiation defined by the
core protocol.

# Security Considerations

## Discovery Spoofing

Discovery information is not cryptographically
authenticated beyond HTTPS transport security. Clients
MUST NOT rely on discovery metadata for security
decisions. The 402 challenge is authoritative for all
payment parameters.

## Information Disclosure

OpenAPI documents and `/.well-known/payment` manifests
reveal payment capabilities, endpoint structure, input
schemas, and pricing to unauthenticated clients.
Service operators SHOULD consider whether this
disclosure is acceptable for their use case.

## Cross-Origin Requests

Browser-based clients may need to access discovery
endpoints cross-origin. Servers that intend to support
browser-based clients SHOULD include appropriate CORS
headers on discovery responses.

# IANA Considerations

## Well-Known URI Registration

This document registers the following well-known URI
in the "Well-Known URIs" registry established by
{{!RFC8615}}:

- URI Suffix: payment
- Change Controller: IETF
- Reference: This document, {{well-known-fallback}}
- Status: permanent
- Related Information: None

--- back

# Registry and Aggregator Guidance

This appendix provides informative guidance for
building registries and aggregators on top of the
discovery mechanisms defined in this specification.

## Registries

A registry is a server that discovers, validates, and
indexes payment-enabled services into a searchable
catalog. Registries MAY discover services by:

- Crawling OpenAPI documents and `/.well-known/payment`
  endpoints from submitted domains.
- Accepting domain submissions from service operators.
- Consuming snapshots from other registries.

If a domain serves a valid OpenAPI document with
`x-payment-info` extensions or a valid
`/.well-known/payment` manifest over HTTPS, that
constitutes sufficient proof of domain ownership.

Registries SHOULD re-crawl services periodically (at
least every 24 hours is RECOMMENDED). If the discovery
document becomes invalid or unreachable, the registry
SHOULD delist the service after 7 or more consecutive
failures.

Registries SHOULD enforce crawl constraints: HTTPS
only, 10-second timeouts, 64 KB size limits, and
rate limiting.

## Aggregators

Aggregators consume registry data and layer on their
own views: curating (filtering by quality or vertical),
enriching (adding trust scores, uptime, volume data),
reshaping (exposing agent-native formats such as
llms.txt {{LLMS-TXT}}), or federating (merging data
from multiple registries).

Aggregators are not required to use the registry API
schema. The only universal contract is the discovery
mechanisms defined in {{openapi-discovery}} and
{{well-known-fallback}}.

# Comparison with Prior Art

## CoRE Resource Directory (RFC 9176)

The CoRE Resource Directory {{RFC9176}} defines push
registration with leased lifetimes for constrained IoT
devices. This specification uses crawl-based
registration, which better suits HTTP services.

## Agent2Agent Protocol (A2A)

The A2A Protocol {{A2A}} uses
`/.well-known/agent-card.json` as a self-describing
service endpoint. This specification follows a similar
pattern but uses OpenAPI as the primary mechanism,
providing richer schema information.

## MCP Registry

The MCP Registry {{MCP-REGISTRY}} implements a
three-layer architecture with reverse-DNS namespacing
and SHA-256 package integrity. This specification
uses domain authority rather than OAuth-based
registration.

## x402 Protocol

The x402 protocol {{X402}} uses HTTP 402 responses as
the primary payment signal. This specification
separates discovery (pre-request) from the payment
challenge (at-request).

## OpenAPI-First Discovery (x402scan)

The x402scan project uses OpenAPI documents as the
canonical discovery signal, with `/.well-known/x402`
as a fallback. This specification adopts the same
OpenAPI-first approach, using `x-payment-info` as
the payment extension with fields consistent with the
Payment authentication scheme.

## ERC-8004 (Trustless Agents)

ERC-8004 {{ERC-8004}} defines on-chain identity
registries and domain verification. This specification
operates entirely off-chain but is compatible with
future on-chain anchoring.

# JSON Schema for x-payment-info

The following JSON Schema defines the structure of
the `x-payment-info` OpenAPI extension. Tooling
authors SHOULD validate payment extensions against
this schema.

~~~json
{
  "$schema":
    "https://json-schema.org/draft/2020-12/schema",
  "title": "x-payment-info",
  "type": "object",
  "required": ["intent", "method", "amount"],
  "properties": {
    "intent": {
      "type": "string",
      "enum": ["charge", "session"]
    },
    "method": {
      "type": "string"
    },
    "amount": {
      "oneOf": [
        { "type": "null" },
        {
          "type": "string",
          "pattern": "^(0|[1-9][0-9]*)$"
        }
      ]
    },
    "currency": {
      "type": "string"
    },
    "description": {
      "type": "string"
    }
  }
}
~~~

# JSON Schema for x-service-info

The following JSON Schema defines the structure of
the `x-service-info` OpenAPI extension.

~~~json
{
  "$schema":
    "https://json-schema.org/draft/2020-12/schema",
  "title": "x-service-info",
  "type": "object",
  "properties": {
    "categories": {
      "type": "array",
      "items": { "type": "string" }
    },
    "docs": {
      "type": "object",
      "properties": {
        "apiReference": {
          "type": "string",
          "format": "uri"
        },
        "homepage": {
          "type": "string",
          "format": "uri"
        },
        "llms": {
          "type": "string",
          "format": "uri"
        }
      }
    }
  }
}
~~~

# JSON Schema for Well-Known Manifest

The following JSON Schema defines the structure of
the `/.well-known/payment` service manifest. Service
operators SHOULD validate their manifests against
this schema before hosting them.

~~~json
{
  "$schema":
    "https://json-schema.org/draft/2020-12/schema",
  "title": "Payment Service Manifest",
  "type": "object",
  "required": ["version", "name", "description"],
  "properties": {
    "version": {
      "type": "integer",
      "minimum": 1
    },
    "name": {
      "type": "string",
      "minLength": 1
    },
    "description": {
      "type": "string",
      "minLength": 1
    },
    "categories": {
      "type": "array",
      "items": { "type": "string" }
    },
    "endpoints": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["method", "path"],
        "properties": {
          "method": {
            "type": "string",
            "enum": ["GET", "POST", "PUT",
              "PATCH", "DELETE", "HEAD",
              "OPTIONS"]
          },
          "path": {
            "type": "string",
            "pattern": "^/"
          },
          "description": {
            "type": "string"
          },
          "payment": {
            "oneOf": [
              { "type": "null" },
              {
                "type": "object",
                "required": ["intent", "method",
                  "amount"],
                "properties": {
                  "intent": {
                    "type": "string"
                  },
                  "method": {
                    "type": "string"
                  },
                  "amount": {
                    "oneOf": [
                      { "type": "null" },
                      {
                        "type": "string",
                        "pattern":
                          "^(0|[1-9][0-9]*)$"
                      }
                    ]
                  },
                  "currency": {
                    "type": "string"
                  },
                  "description": {
                    "type": "string"
                  }
                }
              }
            ]
          }
        }
      }
    },
    "docs": {
      "type": "object",
      "properties": {
        "apiReference": {
          "type": "string",
          "format": "uri"
        },
        "homepage": {
          "type": "string",
          "format": "uri"
        },
        "llms": {
          "type": "string",
          "format": "uri"
        },
        "openapi": {
          "type": "string",
          "format": "uri"
        }
      }
    }
  }
}
~~~

# Acknowledgments
{:numbered="false"}

The authors thank the contributors to the MPP
Registry reference implementation and the x402scan
project, whose operational experience informed this
specification.
