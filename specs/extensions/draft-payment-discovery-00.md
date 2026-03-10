---
title: Payment Service Discovery for HTTP Payment Authentication
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
  RFC3339:
  RFC3986:
  RFC7515:
  RFC7517:
  RFC8174:
  RFC8259:
  RFC8615:
  RFC8785:
  RFC9110:
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
a three-layer architecture: (1) a well-known endpoint
where service domains publish structured metadata about
their payment capabilities, endpoints, and pricing;
(2) a registry protocol that crawls, validates, and
indexes these endpoints into a searchable catalog with
content-integrity verification; and (3) an aggregator
layer that enables third parties to compose, curate,
and extend registry data for specialized use cases.

--- middle

# Introduction

The "Payment" HTTP authentication scheme
{{I-D.httpauth-payment}} enables servers to require
payment for resource access using the HTTP 402 status
code. While the 402 challenge provides all information
needed to complete a single paid exchange, clients and
agents benefit from discovering payment-enabled services
before initiating requests.

This specification defines a complete discovery
framework organized into three layers:

- Layer 1 (Service Metadata): A well-known endpoint
  hosted on each service domain that describes its
  payment capabilities, available endpoints, pricing,
  and documentation links.

- Layer 2 (Registry Protocol): A crawl-and-index
  protocol that discovers, validates, and catalogs
  service metadata into a searchable directory with
  content-integrity guarantees.

- Layer 3 (Aggregators): A composition model that
  enables third parties to consume registry snapshots
  and build specialized views, curated subsets, or
  enriched catalogs on top.

Layer 1 is normative; services that implement discovery
MUST conform to the well-known endpoint specification.
Layers 2 and 3 are informative and describe the
recommended registry and aggregation architecture.

Discovery is OPTIONAL. Servers MAY implement this
mechanism to improve client experience. Clients MUST
NOT require discovery to function; the 402 challenge in
{{I-D.httpauth-payment}} is always authoritative.

# Requirements Language

{::boilerplate bcp14-tagged}

# Terminology

Service
: An HTTP origin that accepts payment via the "Payment"
  authentication scheme and hosts a `/.well-known/payment`
  metadata endpoint.

Service Manifest
: The JSON document served at `/.well-known/payment` that
  describes a service's payment capabilities.

Registry
: A server that crawls service domains, validates their
  manifests, and exposes a searchable catalog of services.

Aggregator
: A downstream consumer that ingests registry data and
  layers on curation, enrichment, or alternative query
  interfaces.

Snapshot
: An immutable, content-addressed export of all services
  in a registry at a point in time.

Content Hash
: A SHA-256 digest of the raw JSON bytes of a service
  manifest, used for change detection and integrity
  verification.

Merkle Root
: A SHA-256 root computed over the sorted content hashes
  of all services in a snapshot, enabling lightweight
  integrity verification by clients.

# Layer 1: Service Metadata

## Endpoint Location

Services that support discovery MUST serve a JSON
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

## Domain Normalization {#domain-normalization}

When processing domains for registration or lookup,
implementations MUST apply the following normalization:

1. Convert the domain to lowercase.
2. Remove any trailing dot (e.g., `example.com.`
   becomes `example.com`).
3. Strip the default HTTPS port if present (e.g.,
   `example.com:443` becomes `example.com`).
4. Remove any leading `https://` scheme prefix.
5. Remove any trailing path, query, or fragment
   components.

After normalization, `API.Example.COM`,
`api.example.com:443`, and
`https://api.example.com/` all resolve to the
canonical form `api.example.com`.

Two service entries with the same normalized domain
MUST be treated as the same service.

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
| `methods` | object | OPTIONAL | Supported payment methods. |
| `endpoints` | array | OPTIONAL | API endpoints with payment details. |
| `docs` | object | OPTIONAL | Documentation and reference links. |
| `signatures` | array | OPTIONAL | JWS signatures over the manifest (see {{manifest-signing}}). |

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
ai, blockchain, communication, compute, data,
developer-tools, media, search, social, storage,
travel, web
~~~

Category values SHOULD be lowercase, use hyphens for
multi-word values, and be concise. Registries SHOULD
limit services to no more than 5 categories per
manifest. Clients SHOULD ignore category values they
do not recognize.

### Payment Methods {#methods-schema}

The `methods` field, when present, MUST be a JSON
object where each key is a registered payment method
identifier (e.g., `"tempo"`, `"stripe"`,
`"lightning"`) and each value is a Method Object:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `intents` | array | REQUIRED | Supported intent types (e.g., `["charge", "session"]`). |
| `currencies` | array | OPTIONAL | Accepted currency identifiers. For blockchain methods: token contract addresses. For fiat: ISO 4217 codes. |

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
| `docs` | object | OPTIONAL | Per-endpoint documentation links. |

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

## Manifest Signing {#manifest-signing}

Services MAY sign their manifest to provide
cryptographic proof of authenticity. When present, the
`signatures` field MUST be an array of JWS
(JSON Web Signature {{RFC7515}}) objects using the
JWS JSON Serialization (flattened or general form) with
a detached payload as defined below.

### JWS Profile

This specification defines a constrained JWS profile
for manifest signatures:

- Serialization: JWS JSON Serialization per Section
  7.2 of {{RFC7515}}. Each entry in the `signatures`
  array is a JSON object with `protected` and
  `signature` fields.
- Payload: The JWS payload is detached (not included
  in the signature object). The payload is the
  canonical manifest bytes as defined in
  {{signing-procedure}}.
- Algorithms: Implementations MUST support ES256
  (ECDSA using P-256 and SHA-256). Implementations
  MAY support EdDSA. Implementations MUST NOT use
  `"none"` or symmetric algorithms (HS256, HS384,
  HS512).
- Multiple signatures: When more than one entry is
  present in the `signatures` array, a client
  considers the manifest signed if ANY single
  signature verifies successfully.

### Signing Procedure {#signing-procedure}

To produce a signature:

1. Serialize the manifest as a JSON object, excluding
   the `signatures` field itself.
2. Canonicalize the result using JCS (JSON
   Canonicalization Scheme {{RFC8785}}). The output
   is the JWS payload (a deterministic byte sequence).
3. Construct the JWS protected header as a JSON object.
   The header MUST include:
   - `alg`: The signature algorithm (e.g., `"ES256"`).
   - `kid`: A key identifier for the signing key.
   The header MAY include:
   - `jku`: A JWK Set URL {{RFC7517}} pointing to an
     HTTPS endpoint hosting the verification key. The
     `jku` URL MUST use the `https` scheme and MUST
     be on the same origin as the service domain.
4. Base64url-encode the protected header (without
   padding) to produce the `protected` string.
5. Compute the JWS Signing Input as defined in
   Section 5.2 of {{RFC7515}}:
   `ASCII(BASE64URL(header)) || '.' || BASE64URL(payload)`
6. Sign the Signing Input using the private key and
   the algorithm specified in `alg`.
7. Base64url-encode the signature bytes (without
   padding) to produce the `signature` string.

### Signature Object

Each entry in the `signatures` array MUST contain:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `protected` | string | REQUIRED | Base64url-encoded JWS protected header. |
| `signature` | string | REQUIRED | Base64url-encoded JWS signature. |

### Verification Procedure

To verify a signature:

1. Decode the `protected` header (base64url) to
   obtain `alg` and `kid`, and optionally `jku`.
2. Verify that `alg` is a supported asymmetric
   algorithm (e.g., ES256, EdDSA). Reject `"none"`,
   symmetric algorithms, and unknown algorithms.
3. Retrieve the public key identified by `kid`. If
   `jku` is present, fetch the JWK Set over HTTPS
   and select the key matching `kid`. The `jku` URL
   MUST be on the same origin as the service domain.
   If `jku` is absent, resolve `kid` from a locally
   configured trust store.
4. Re-serialize the manifest without the `signatures`
   field and canonicalize using JCS {{RFC8785}}.
5. Reconstruct the JWS Signing Input per Section 5.2
   of {{RFC7515}} and verify the signature using the
   public key.

Clients MAY verify manifest signatures to establish
stronger trust than HTTPS alone provides. Clients MUST
NOT require signatures; unsigned manifests are valid.

## Example Service Manifest

~~~json
{
  "version": 1,
  "name": "Example AI API",
  "description": "Chat completions, embeddings,
    and image generation.",
  "categories": ["ai"],
  "methods": {
    "tempo": {
      "intents": ["charge", "session"],
      "currencies": [
        "0x20c00000000000000000000000000000000000"
      ]
    }
  },
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

If the server does not support discovery, it SHOULD
return 404 Not Found. Clients MUST NOT treat a 404
response as an error; it indicates that discovery is
unavailable and the client SHOULD fall back to the 402
challenge flow.

# Layer 2: Registry Protocol

This section describes the recommended architecture for
registries that crawl, validate, and index service
manifests. This layer is informative; any
implementation that correctly consumes
`/.well-known/payment` endpoints is a valid registry.

## Design Principles

The registry is an append-only index. The service
domain is the source of truth. The registry crawls,
verifies, and exposes a searchable catalog. This model:

- Requires no centralized authentication or access
  control for service registration.
- Allows service owners to control their listing by
  editing a JSON file on their own domain.
- Enables multiple independent registries to coexist
  and interoperate.

## Domain Authority

If a domain serves a valid `/.well-known/payment`
response over HTTPS, that constitutes sufficient proof
of ownership. No additional verification (DNS TXT
records, email confirmation, etc.) is required for
registration.

This model is consistent with the web's existing trust
assumptions and follows the same pattern used by
`/.well-known/agent-card.json` in the Agent2Agent
Protocol {{A2A}}. Registries that require stronger
domain verification MAY additionally check for a DNS
TXT record, following the pattern used by the MCP
Registry {{MCP-REGISTRY}}.

## Registration Flow

The registration process consists of three steps:

1. Host: The service owner places a conformant JSON
   file at `https://{domain}/.well-known/payment`.

2. Submit: The owner submits the domain to the
   registry (or the registry discovers it through
   crawling).

3. Crawl: The registry fetches `/.well-known/payment`
   from the domain. If it returns a valid manifest,
   the entry goes live.

The registry SHOULD re-crawl services periodically.
Registries SHOULD re-crawl each service at least once
every 24 hours. If the manifest becomes invalid or
unreachable, the registry SHOULD delist the service
after 7 or more consecutive failures. The registry
SHOULD retain crawl history for at least 30 days to
support rollback and auditing.

## Service Record

The registry augments each crawled manifest with
operational metadata:

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Stable identifier derived from the normalized domain. |
| `domain` | string | The normalized domain hosting `/.well-known/payment`. |
| `addedAt` | string | {{RFC3339}} date-time of first registration (e.g., `"2026-01-15T12:00:00Z"`). |
| `updatedAt` | string | {{RFC3339}} date-time of last successful crawl. |
| `contentHash` | string | SHA-256 hex digest of raw manifest JSON. |
| `manifest` | object | The validated `/.well-known/payment` response. |

Registries MAY include additional fields (e.g., error
tracking, crawl history) as needed for their
implementation.

## Snapshot Format {#snapshot-format}

Registries SHOULD publish periodic snapshots: immutable,
content-addressed exports of all registered services.
A snapshot is a JSON document with the following fields:

| Field | Type | Description |
|-------|------|-------------|
| `generatedAt` | string | {{RFC3339}} date-time (e.g., `"2026-01-15T12:00:00Z"`). |
| `merkleRoot` | string | SHA-256 Merkle root over sorted service content hashes. |
| `previousMerkleRoot` | string | Merkle root from the previous snapshot. `null` on first generation. |
| `serviceCount` | integer | Number of services. |
| `services` | array | All service records. |

### Merkle Tree Construction

The Merkle root provides tamper-evident integrity over
the entire registry state. It is computed as follows:

1. Collect the `contentHash` (SHA-256 hex string) of
   every registered service.
2. Sort the hex strings lexicographically (ASCII byte
   order).
3. Convert each hex string to its raw 32-byte
   representation. These are the leaves.
4. If there is exactly one leaf, the Merkle root is
   `SHA-256(leaf)`.
5. If the number of leaves is odd, duplicate the last
   leaf.
6. Build a binary tree bottom-up: each parent node is
   `SHA-256(left_child || right_child)` where `||`
   denotes byte concatenation.
7. The root of this tree is the `merkleRoot`, encoded
   as a lowercase hex string.

The `previousMerkleRoot` field creates a hash chain
across snapshots, enabling clients to detect registry
tampering or omissions across time.

## Crawl Requirements

Registries that crawl service domains SHOULD observe
the following constraints:

- HTTPS only: Registries MUST NOT fetch manifests over
  unencrypted HTTP.
- Timeout: Requests SHOULD time out after 10 seconds.
- Size limit: Response bodies SHOULD be limited to
  64 KB.
- No redirect following: Registries SHOULD NOT follow
  HTTP redirects from the well-known endpoint to
  prevent domain confusion.
- Rate limiting: Registries SHOULD rate-limit crawl
  requests to avoid overwhelming service domains.
- User-Agent: Registries SHOULD identify themselves
  via the `User-Agent` header (e.g.,
  `Payment-Registry/1.0`).

# Layer 3: Aggregators

Aggregators consume registry data (typically via
snapshots) and layer on their own views. This layer is
informative and describes the recommended composition
model.

Aggregators serve specialized audiences by curating
(filtering services by quality, compliance, or
vertical), enriching (adding trust scores, on-chain
volume, uptime data, or user reviews), reshaping
(exposing alternative query interfaces or agent-native
formats such as llms.txt {{LLMS-TXT}}), or federating
(merging data from multiple registries into a unified
view).

Aggregators are not required to use the registry API
schema. An aggregator MAY define its own API surface,
add proprietary fields and data sources, crawl
`/.well-known/payment` endpoints independently
(bypassing the registry), or consume multiple
registries and merge results.

The only universal contract is at Layer 1: the
`/.well-known/payment` endpoint on the service domain.

A consumer can query one registry, multiple registries,
or merge results client-side. Registries can consume
each other's snapshots as seed lists, creating a peer
network without requiring coordination. This
composability model is informed by the subregistry
pattern used in the MCP Registry {{MCP-REGISTRY}} and
the facilitator-local catalog pattern in x402 {{X402}}.

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
authenticated beyond HTTPS transport security, unless
the manifest includes JWS signatures
({{manifest-signing}}). Clients MUST NOT rely on
unsigned discovery metadata for security decisions.
The 402 challenge is authoritative for all payment
parameters.

## Domain Authority Model

The domain authority model assumes that control of a
domain's HTTPS endpoint constitutes proof of ownership.
This is consistent with the web's existing trust model
(used by {{A2A}} and {{MCP-REGISTRY}}) but inherits
its limitations (e.g., compromised hosting, DNS
hijacking). Registries SHOULD monitor for drastic
content changes between crawls and retain crawl
history for rollback.

## Content Integrity

The Merkle tree construction in registry snapshots
provides tamper evidence but not tamper prevention. A
compromised registry can produce valid Merkle roots
over manipulated data. Clients that require stronger
guarantees SHOULD verify manifests directly from
service domains and SHOULD verify manifest signatures
when present.

## Information Disclosure

The `/.well-known/payment` endpoint reveals payment
capabilities, endpoint structure, and pricing to
unauthenticated clients. Service operators SHOULD
consider whether this disclosure is acceptable for
their use case. The `endpoints` array in particular
reveals API surface topology beyond what is necessary
for payment discovery alone.

## Denial of Service

Registries are vulnerable to submission floods (many
domain submissions) and crawl amplification (submitting
domains that are slow to respond). Registries SHOULD
implement rate limiting on submission endpoints and
enforce crawl timeouts.

## Cross-Origin Requests

Browser-based clients may need to access the discovery
endpoint cross-origin. Servers that intend to support
browser-based clients SHOULD include appropriate CORS
headers on `/.well-known/payment` responses.

## Replay and Staleness

Manifest signatures ({{manifest-signing}}) do not
include a timestamp or nonce. A previously valid signed
manifest could be replayed after the service has
updated its capabilities. Clients SHOULD combine
signature verification with freshness checks (e.g.,
`Cache-Control` headers, registry `updatedAt`
timestamps) to mitigate staleness attacks.

# IANA Considerations

## Well-Known URI Registration

This document registers the following well-known URI
in the "Well-Known URIs" registry established by
{{!RFC8615}}:

- URI Suffix: payment
- Change Controller: IETF
- Reference: This document, {{manifest-schema}}
- Status: permanent
- Related Information: None

--- back

# Comparison with Prior Art

## Overview

This specification draws on several prior discovery
and registry systems. This appendix summarizes the
key design differences.

## CoRE Resource Directory (RFC 9176)

The CoRE Resource Directory {{RFC9176}} defines push
registration with leased lifetimes (`lt` parameter)
and pull lookup for constrained IoT devices. This
specification adopts the same well-known bootstrap
pattern but uses crawl-based registration rather than
device-initiated push, which better suits HTTP
services that already host web content.

## Agent2Agent Protocol (A2A)

The A2A Protocol {{A2A}} uses
`/.well-known/agent-card.json` as a self-describing
service endpoint with JWS-signed agent cards using
{{RFC7515}} and JSON Canonicalization {{RFC8785}}.
This specification adopts the same signing pattern
for manifest authenticity ({{manifest-signing}}).
A2A also supports authenticated extended agent cards
for access-controlled metadata; this specification
does not currently define an authenticated discovery
phase.

## MCP Registry

The MCP Registry {{MCP-REGISTRY}} implements a
three-layer architecture (official registry,
subregistries, clients) with reverse-DNS namespacing,
SHA-256 package integrity, and daily ETL-based
aggregation. This specification follows the same
layered model but uses domain authority rather than
OAuth-based registration.

## x402 Protocol

The x402 protocol {{X402}} uses HTTP 402 responses as
the primary payment signal and defines a "Bazaar"
extension for self-describing resource schemas. This
specification separates discovery (pre-request) from
the payment challenge (at-request), whereas x402
embeds discovery metadata in the 402 response itself.

## ERC-8004 (Trustless Agents)

ERC-8004 {{ERC-8004}} defines on-chain identity
registries (ERC-721), reputation systems, and
domain verification via
`/.well-known/agent-registration.json`. This
specification operates entirely off-chain but is
designed to be compatible with future on-chain
anchoring of registry snapshots or manifest hashes.

## OpenAPI-First Discovery (x402scan)

The x402scan project uses OpenAPI documents as the
canonical discovery signal, with `/.well-known/x402`
as a fallback. OpenAPI provides richer schema
information but raises the adoption bar significantly.
This specification uses a minimal well-known endpoint
(three required fields) and bridges to OpenAPI via
the `docs.openapi` field, decoupling "how do I find
this service" from "how do I call this service."

# JSON Schema

The following JSON Schema defines the structure of
the `/.well-known/payment` service manifest. Service
operators SHOULD validate their manifests against
this schema before hosting them.

~~~json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
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
      "items": { "type": "string" },
      "maxItems": 5
    },
    "methods": {
      "type": "object",
      "additionalProperties": {
        "type": "object",
        "required": ["intents"],
        "properties": {
          "intents": {
            "type": "array",
            "items": { "type": "string" }
          },
          "currencies": {
            "type": "array",
            "items": { "type": "string" }
          }
        }
      }
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
          "description": { "type": "string" },
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
    },
    "signatures": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["protected", "signature"],
        "properties": {
          "protected": { "type": "string" },
          "signature": { "type": "string" }
        }
      }
    }
  }
}
~~~

# Acknowledgments
{:numbered="false"}

The authors thank the contributors to the MPP
Registry reference implementation, whose operational
experience informed this specification.
