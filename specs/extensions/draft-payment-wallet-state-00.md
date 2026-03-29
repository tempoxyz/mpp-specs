---
title: Wallet-State Trust Signals Extension for HTTP Payment Authentication
abbrev: Wallet-State Trust
docname: draft-payment-wallet-state-00
version: 00
category: info
ipr: noModificationTrust200902
submissiontype: IETF
consensus: true

author:
  - name: Vicaversa
    ins: Vicaversa
    email: xxxkursxxx@gmail.com

normative:
  RFC2119:
  RFC3986:
  RFC7515:
  RFC7517:
  RFC7519:
  RFC8174:
  RFC8259:
  RFC8785:
  I-D.httpauth-payment:
    title: "The 'Payment' HTTP Authentication Scheme"
    target: https://datatracker.ietf.org/doc/draft-httpauth-payment/
    author:
      - name: Brendan Ryan
    date: 2026-01
  I-D.payment-discovery:
    title: "Service Discovery for HTTP Payment Authentication"
    target: https://tempoxyz.github.io/payment-auth-spec/draft-payment-discovery-00.html
    author:
      - name: Brendan Ryan
      - name: Jake Moxey
    date: 2026-03

informative:
  X402:
    title: "x402: HTTP Payment Protocol"
    target: https://github.com/coinbase/x402
    author:
      - org: Coinbase
    date: 2025
  A2A:
    title: "Agent2Agent Protocol Specification"
    target: https://github.com/a2aproject/A2A
    author:
      - org: Google
    date: 2025
  UCP:
    title: "Universal Commerce Protocol"
    target: https://github.com/Universal-Commerce-Protocol/ucp
    date: 2025
  ERC-8004:
    title: "ERC-8004: Trustless Agents Registry"
    target: https://eips.ethereum.org/EIPS/eip-8004
    date: 2025
---

--- abstract

This document defines the "wallet-state" extension for
the Payment HTTP Authentication Scheme
{{I-D.httpauth-payment}}. It specifies how a server MAY
require pre-payment verification of an agent wallet
state, credential status, or compliance posture and
how an agent MAY verify a service on-chain legitimacy
before payment occurs.

--- middle

# Introduction

The "Payment" HTTP authentication scheme
{{I-D.httpauth-payment}} enables servers to require
payment for resource access. The discovery extension
{{I-D.payment-discovery}} enables agents to find
payment-enabled services before making requests.

Neither mechanism addresses trust: a service receiving
payment has no signal about the agent wallet state
or compliance posture, and an agent has no signal about
the service on-chain legitimacy.

This extension adds optional pre-payment trust
verification to the MPP flow. Services declare trust
requirements in their discovery document. Agents
obtain signed attestations from declared providers and
include them in the payment credential. Services
verify attestations offline using JWKS-based signature
validation.

## Motivation

In autonomous agent economies, payment authorization
is necessary but not sufficient for trust. An agent
with valid credentials and sufficient funds can still
present risks:

- Wallet funded moments before the request (flash-loan
  patterns)
- Wallet flagged by compliance services
- Wallet with insufficient balance for the declared
  payment amount
- Unknown or unverifiable wallet provenance

Conversely, an agent has no way to assess whether a
service declared payment address is legitimate or
whether the service has a history of failed
settlements.

Trust verification catches these defects before
settlement, not after.

## Scope

This extension:

- Defines how a server declares trust requirements
  in its discovery document
- Specifies the attestation request and response
  format using signed JWTs
- Supports multiple condition types for flexible
  trust policies
- Enables offline verification via JWKS
- Does not define the attestation logic
  (implementations vary by provider)
- Does not replace identity or authorization checks
- Does not require any specific attestation provider

## Relationship to Core Specification

This document extends {{I-D.httpauth-payment}}.
Implementations of this extension MUST also implement
the core specification.

This extension is OPTIONAL. Services opt in by
declaring trust requirements in their discovery
document {{I-D.payment-discovery}}.

## Relationship to Other Extensions

This extension is complementary to the discovery and
reasoning verification extensions:

| Layer | Extension | Question |
|-------|-----------|----------|
| Discovery | {{I-D.payment-discovery}} | What is available and how much does it cost? |
| Trust | This document | Should either party trust the other? |
| Reasoning | Reasoning Verification | Is the agent decision logic sound? |

Together, these layers form the complete pre-payment
evaluation stack.

# Requirements Language

{::boilerplate bcp14-tagged}

# Terminology

Attestation
: A signed statement from a trusted provider
  asserting that specific conditions about a wallet or
  service have been evaluated.

Attestation Provider
: A service that evaluates wallet-state conditions and
  issues signed attestations. Identified by a JWKS URI
  and attestation endpoint.

Condition
: A specific requirement that a wallet must satisfy,
  such as a minimum token balance or compliance status.

Trust Requirements
: The set of conditions and accepted attestation
  providers declared by a service in its discovery
  document.

# Extension Overview {#overview}

## Architecture

~~~
  Agent                   Server               Provider
    |                        |                      |
    |  1. Discover service   |                      |
    |  (read OpenAPI)        |                      |
    |<---------------------->|                      |
    |                        |                      |
    |  2. Read trust         |                      |
    |     requirements       |                      |
    |<-----------------------|                      |
    |                        |                      |
    |  3. Request            |                      |
    |     attestation        |                      |
    |---------------------------------------------->|
    |                        |                      |
    |  4. Signed             |                      |
    |     attestation (JWT)  |                      |
    |<----------------------------------------------|
    |                        |                      |
    |  5. Payment credential |                      |
    |     + attestation      |                      |
    |----------------------->|                      |
    |                        |                      |
    |  6. Verify attestation |                      |
    |     offline (JWKS)     |                      |
    |                        |---(cached keys)----->|
    |                        |                      |
    |  7. Resource or 402    |                      |
    |<-----------------------|                      |
~~~

## Capabilities

This extension provides:

1. **Pre-payment trust check**: Verify wallet state
   and compliance posture before accepting payment.
2. **Provider-agnostic design**: Any service
   implementing JWKS and signed boolean responses can
   serve as an attestation provider.
3. **Offline verification**: After initial JWKS fetch,
   servers verify attestations without calling the
   provider at request time.

# Specification

## Service Discovery Integration {#discovery}

Services declare trust requirements by adding a
`trust` field to the `x-payment-info` extension object
defined in {{I-D.payment-discovery}}.

### Trust Object Schema

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `required` | boolean | REQUIRED | If `true`, the server MUST reject credentials without a valid attestation. If `false`, attestation is advisory. |
| `accepted_providers` | array | REQUIRED | List of trusted attestation providers. |
| `conditions` | array | REQUIRED | List of conditions the agent must satisfy. |

### Provider Object Schema

Each entry in `accepted_providers` MUST contain:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `jwks` | string (URI) | REQUIRED | JWKS endpoint for signature verification. MUST be HTTPS. |
| `endpoint` | string (URI) | REQUIRED | Attestation request endpoint. MUST be HTTPS. |

All URI values MUST conform to {{RFC3986}}.

### Condition Object Schema

Each entry in `conditions` MUST contain:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `type` | string | REQUIRED | Condition type identifier (see {{condition-types}}). |

Additional fields depend on the condition type.
Implementations MUST ignore unknown fields in
condition objects.

### Example Discovery Document

~~~json
{
  "openapi": "3.1.0",
  "info": {
    "title": "Example Paid API",
    "version": "1.0.0"
  },
  "paths": {
    "/v1/generate": {
      "post": {
        "summary": "Generate content",
        "x-payment-info": {
          "intent": "charge",
          "method": "tempo",
          "amount": "1000000",
          "currency": "0x20c00000000000000000000000000000000000",
          "trust": {
            "required": true,
            "accepted_providers": [
              {
                "jwks": "https://verifier.example.com/.well-known/jwks.json",
                "endpoint": "https://verifier.example.com/v1/attest"
              }
            ],
            "conditions": [
              {
                "type": "token_balance",
                "chainId": 8453,
                "contractAddress": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
                "threshold": "10000000",
                "decimals": 6
              }
            ]
          }
        },
        "responses": {
          "402": {
            "description": "Payment Required"
          }
        }
      }
    }
  }
}
~~~

In this example, the service requires agents to hold
at least 10 USDC on Base (chain ID 8453) before
accepting payment.

## Attestation Request {#attestation-request}

The agent calls the attestation endpoint declared in
the provider object, submitting the wallet address and
the conditions to be evaluated.

### Request

~~~http
POST /v1/attest HTTP/1.1
Host: verifier.example.com
Content-Type: application/json

{
  "address": "0x1234567890abcdef1234567890abcdef12345678",
  "chainId": 8453,
  "conditions": [
    {
      "type": "token_balance",
      "chainId": 8453,
      "contractAddress": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
      "threshold": "10000000",
      "decimals": 6
    }
  ]
}
~~~

### Response

The provider evaluates the conditions and returns a
signed attestation:

~~~http
HTTP/1.1 200 OK
Content-Type: application/json

{
  "attestation": {
    "id": "ATST-36CAF8C2CAC5D1AC",
    "pass": true,
    "results": [
      {
        "condition": 0,
        "met": true
      }
    ],
    "attestedAt": "2026-03-19T00:35:47.615Z",
    "expiresAt": "2026-03-19T01:05:47.615Z"
  },
  "sig": "f5CwIBo6P5xX4Q-GU591P8k-abHOGt8nMJZeiW0Q7c7RKZSHxIqT3gfU0tJ7Yx63PadY2RNFw_ctbaNIneDlng",
  "kid": "attest-key-v1"
}
~~~

### Attestation Object Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | REQUIRED | Unique attestation identifier. |
| `pass` | boolean | REQUIRED | `true` if all conditions are met. |
| `results` | array | REQUIRED | Per-condition evaluation results. |
| `attestedAt` | string | REQUIRED | ISO 8601 timestamp of evaluation. |
| `expiresAt` | string | REQUIRED | ISO 8601 expiry timestamp. |

Each entry in `results` MUST contain:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `condition` | integer | REQUIRED | Zero-based index into the conditions array. |
| `met` | boolean | REQUIRED | Whether the condition was satisfied. |

### Signing

The provider signs the attestation using ECDSA P-256
(ES256) as defined in {{RFC7515}}. The `sig` field
contains the base64url-encoded signature over the
JSON Canonicalization Scheme (JCS) {{RFC8785}}
serialization of the `attestation` object. The `kid`
field identifies the signing key in the provider
JWKS endpoint {{RFC7517}}.

The signature is computed as a detached JWS (JSON
Web Signature) {{RFC7515}} with the JCS-serialized
attestation as the payload. The `sig` field carries
only the signature bytes (base64url-encoded), not
the full JWS compact serialization.

Providers MAY support additional signing algorithms.
Servers MUST reject attestations signed with algorithms
they do not support.

## Credential with Attestation {#credential}

After obtaining a passing attestation, the agent
includes it in the payment credential as defined in
{{I-D.httpauth-payment}}.

The attestation is conveyed as a base64url-encoded
JSON object appended to the `Authorization` header:

~~~http
GET /v1/generate HTTP/1.1
Authorization: Payment credential="eyJ...",
  attestation="eyJhdHRlc3RhdGlvbiI6ey..."
~~~

The `attestation` parameter value is the
base64url-encoding of the JSON object containing the
`attestation`, `sig`, and `kid` fields from the
provider response.

Servers that do not implement this extension MUST
ignore the `attestation` parameter per the core
specification forward-compatibility rule.

## Server Verification {#verification}

When a server receives a credential with an
`attestation` parameter, it MUST perform the following
verification steps:

1. Decode the base64url-encoded attestation parameter
   to obtain the `attestation`, `sig`, and `kid`
   fields.

2. Verify that the `kid` matches a key in a JWKS
   endpoint declared in `accepted_providers`.

3. Fetch the JWKS from the declared `jwks` URI (or
   use a cached copy per HTTP cache headers). Select
   the key matching the `kid`.

4. Verify the `sig` over the JCS {{RFC8785}}
   serialization of the `attestation` object using the
   selected key.

5. Verify that `attestation.expiresAt` is in the
   future. Servers SHOULD allow a clock skew tolerance
   of no more than 60 seconds.

6. Verify that `attestation.pass` is `true`.

7. Verify that each condition declared in the trust
   requirements has a corresponding entry in
   `attestation.results` with `met: true`.

If any step fails and `trust.required` is `true`, the
server MUST respond with 402 Payment Required. If
`trust.required` is `false`, the server MAY accept
the payment with a warning:

~~~http
HTTP/1.1 200 OK
X-Payment-Trust: unverified
~~~

### JWKS Caching

Servers SHOULD cache JWKS responses according to
HTTP cache headers. A cache TTL of 5 to 60 minutes
is RECOMMENDED. Servers MUST refetch when encountering
an unknown `kid` to support key rotation.

## Condition Types {#condition-types}

This section defines the initial set of condition
types. Additional types MAY be registered through the
process defined in {{iana}}.

### token_balance

Asserts that the wallet holds at least a specified
amount of a token.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `type` | string | REQUIRED | `"token_balance"` |
| `chainId` | integer | REQUIRED | EIP-155 chain identifier. |
| `contractAddress` | string | REQUIRED | Token contract address. `"native"` for the chain native asset. |
| `threshold` | string | REQUIRED | Minimum balance in base units. MUST be a string of ASCII digits. |
| `decimals` | integer | OPTIONAL | Token decimals for display purposes. |

### compliance_status

Asserts that the wallet satisfies a compliance or
KYC requirement.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `type` | string | REQUIRED | `"compliance_status"` |
| `standard` | string | REQUIRED | Compliance standard identifier (e.g., `"kyc"`, `"aml"`, `"travel-rule"`). |

### wallet_age

Asserts that the wallet has existed for at least a
specified duration.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `type` | string | REQUIRED | `"wallet_age"` |
| `chainId` | integer | REQUIRED | EIP-155 chain identifier. |
| `minAgeDays` | integer | REQUIRED | Minimum wallet age in days. |

## Error Handling {#errors}

### Attestation Provider Unavailable

If the attestation provider is unreachable:

- When `trust.required` is `true`: The agent SHOULD
  NOT proceed with payment. If the agent does proceed,
  the server MUST reject the credential (fail closed).
- When `trust.required` is `false`: The agent MAY
  proceed without attestation.

### Attestation Expired

If the attestation `expiresAt` is in the past, the
server MUST reject it. The agent SHOULD obtain a fresh
attestation before retrying.

### Condition Not Met

If `attestation.pass` is `false`, the agent SHOULD
NOT include the attestation in the credential. Agents
MAY present the failing conditions to the user for
remediation.

# Security Considerations

## Attestation Provider Trust

The attestation provider is a trusted third party.
A compromised provider could issue passing attestations
for wallets that do not meet conditions. Services MUST
only accept attestations from providers declared in
their own discovery document. Services SHOULD monitor
attestation providers for anomalous behavior.

## Replay Protection

Attestations include `attestedAt` and `expiresAt`
timestamps to limit their validity window. Servers
MUST reject expired attestations. A validity window
of 30 minutes is RECOMMENDED. Shorter windows reduce
replay risk but increase attestation request frequency.

Servers that require stronger replay protection
SHOULD bind attestations to the specific payment
challenge using a nonce or payment intent identifier.

## JWKS Endpoint Security

The JWKS endpoint is a high-value target. Compromise
of the JWKS endpoint allows an attacker to inject
keys and forge attestations. Providers MUST serve
JWKS over HTTPS. Services SHOULD pin known `kid`
values where possible and alert on unexpected key
rotation.

## Privacy Considerations

The attestation request reveals the agent wallet
address and the conditions being evaluated to the
attestation provider. Providers MUST NOT share wallet
addresses or evaluation results with third parties
beyond what is necessary to fulfill the attestation.

The attestation included in the payment credential
reveals the attestation result to the service. Services
MUST NOT use attestation data for purposes beyond
payment trust verification.

Agents SHOULD prefer providers whose privacy policies
align with their requirements.

## Information Disclosure

Trust requirements in discovery documents reveal what
conditions a service considers important. Service
operators SHOULD consider whether this disclosure is
acceptable.

## Denial of Service

An attacker could flood the attestation provider with
requests. Providers SHOULD implement rate limiting.
Services SHOULD cache JWKS responses to avoid
amplifying requests to the provider.

# IANA Considerations {#iana}

## Payment Attestation Condition Types Registry

This document establishes the "Payment Attestation
Condition Types" registry. Each entry contains:

| Field | Description |
|-------|-------------|
| Type | Condition type identifier. |
| Description | Brief description of the condition. |
| Reference | Reference to the defining specification. |

### Initial Registry Contents

| Type | Description | Reference |
|------|-------------|-----------|
| `token_balance` | Minimum token balance check. | This document |
| `compliance_status` | Compliance/KYC status check. | This document |
| `wallet_age` | Minimum wallet age check. | This document |

### Registration Process

New condition types are registered via Specification
Required (per RFC 8126). The designated expert SHOULD
verify that the condition type is well-defined, does
not duplicate existing types, and includes a complete
field schema.

## Payment Authentication Parameters

This document registers the following parameter in the
"Payment Authentication Parameters" registry:

| Parameter | Reference |
|-----------|-----------|
| `attestation` | This document |

--- back

# Complete Flow Example

This appendix shows a complete trust-verified payment
flow.

## Step 1: Agent Discovers Service

The agent fetches the OpenAPI document and reads
trust requirements:

~~~json
{
  "trust": {
    "required": true,
    "accepted_providers": [
      {
        "jwks": "https://verifier.example.com/.well-known/jwks.json",
        "endpoint": "https://verifier.example.com/v1/attest"
      }
    ],
    "conditions": [
      {
        "type": "token_balance",
        "chainId": 8453,
        "contractAddress": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
        "threshold": "10000000",
        "decimals": 6
      }
    ]
  }
}
~~~

## Step 2: Agent Requests Attestation

~~~http
POST /v1/attest HTTP/1.1
Host: verifier.example.com
Content-Type: application/json

{
  "address": "0xAbC1234567890DEF1234567890abcdef12345678",
  "chainId": 8453,
  "conditions": [
    {
      "type": "token_balance",
      "chainId": 8453,
      "contractAddress": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
      "threshold": "10000000",
      "decimals": 6
    }
  ]
}
~~~

## Step 3: Provider Returns Attestation

~~~http
HTTP/1.1 200 OK
Content-Type: application/json

{
  "attestation": {
    "id": "ATST-36CAF8C2CAC5D1AC",
    "pass": true,
    "results": [
      { "condition": 0, "met": true }
    ],
    "attestedAt": "2026-03-19T00:35:47.615Z",
    "expiresAt": "2026-03-19T01:05:47.615Z"
  },
  "sig": "f5CwIBo6P5xX4Q-GU591P8k-abHOGt8nMJZeiW0Q7c7RKZSHxIqT3gfU0tJ7Yx63PadY2RNFw_ctbaNIneDlng",
  "kid": "attest-key-v1"
}
~~~

## Step 4: Agent Pays with Attestation

~~~http
GET /v1/generate HTTP/1.1
Authorization: Payment credential="eyJhbGciOiJFUzI1NiJ9...",
  attestation="eyJhdHRlc3RhdGlvbiI6eyJ..."
~~~

## Step 5: Server Verifies and Responds

The server:

1. Decodes the attestation parameter.
2. Fetches JWKS from the declared provider.
3. Verifies the signature and expiry.
4. Confirms all conditions are met.
5. Processes payment and returns the resource.

~~~http
HTTP/1.1 200 OK
Content-Type: application/json

{
  "result": "Generated content..."
}
~~~

# JSON Schema for Trust Object

The following JSON Schema defines the structure of
the `trust` field within `x-payment-info`.

~~~json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "trust",
  "type": "object",
  "required": [
    "required",
    "accepted_providers",
    "conditions"
  ],
  "properties": {
    "required": {
      "type": "boolean"
    },
    "accepted_providers": {
      "type": "array",
      "minItems": 1,
      "items": {
        "type": "object",
        "required": ["jwks", "endpoint"],
        "properties": {
          "jwks": {
            "type": "string",
            "format": "uri"
          },
          "endpoint": {
            "type": "string",
            "format": "uri"
          }
        }
      }
    },
    "conditions": {
      "type": "array",
      "minItems": 1,
      "items": {
        "type": "object",
        "required": ["type"],
        "properties": {
          "type": {
            "type": "string"
          }
        }
      }
    }
  }
}
~~~

# Acknowledgments
{:numbered="false"}

The authors thank the contributors to the x402, A2A,
and UCP communities whose operational experience
informed this specification.
