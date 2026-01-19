---
title: Payment Extension for Model Context Protocol
docName: draft-mcp-payment-00
category: std
ipr: trust200902
submissionType: IETF
consensus: true

author:
  - fullname: Jake Moxey
    email: jake@tempo.xyz
    organization: Tempo Labs
---

## Abstract

This document defines a payment extension for the Model Context Protocol
(MCP), enabling MCP tools to require payment before execution. The
extension mirrors the semantics of the "Payment" HTTP authentication
scheme [draft-ietf-httpauth-payment], adapting its challenge-response
flow to MCP's JSON-RPC-based request-response model.

The extension introduces error code -32402 for payment challenges,
and defines root-level `authorization`, `receipt`, and
`paymentAuthorization` fields for requests and responses.

## Status of This Memo

This Internet-Draft is submitted in full conformance with the provisions
of BCP 78 and BCP 79.

## Copyright Notice

Copyright (c) 2025 IETF Trust and the persons identified as the document
authors. All rights reserved.

## Table of Contents

1. [Introduction](#1-introduction)
2. [Requirements Language](#2-requirements-language)
3. [Terminology](#3-terminology)
4. [Protocol Overview](#4-protocol-overview)
5. [Error Codes](#5-error-codes)
6. [Payment Challenge](#6-payment-challenge)
7. [Payment Credential](#7-payment-credential)
8. [Payment Receipt](#8-payment-receipt)
9. [Payment Authorization](#9-payment-authorization)
10. [MCP Notifications](#10-mcp-notifications)
11. [Transport Considerations](#11-transport-considerations)
12. [Security Considerations](#12-security-considerations)
13. [IANA Considerations](#13-iana-considerations)
14. [References](#14-references)
15. [Appendix A: Examples](#appendix-a-examples)
16. [Acknowledgements](#acknowledgements)
17. [Authors' Addresses](#authors-addresses)

---

## 1. Introduction

The Model Context Protocol (MCP) [MCP] enables AI applications to
interact with external tools and resources through a standardized
JSON-RPC-based interface. This specification extends MCP to support
payment-gated tool invocations, enabling MCP servers to require payment
before executing tools.

This specification is designed as a companion to the "Payment" HTTP
authentication scheme [draft-ietf-httpauth-payment]. Both specifications
share the same payment method ecosystem and credential formats, allowing
implementations to support both HTTP and MCP transports with minimal
additional complexity.

### 1.1. Relationship to HTTP Payment Scheme

This specification intentionally mirrors the HTTP Payment scheme:

| Concept | HTTP | MCP |
|---------|------|-----|
| Payment challenge | 402 + `WWW-Authenticate` | -32402 + `error.data` |
| Payment credential | `Authorization` header | `authorization` field |
| Payment receipt | `Payment-Receipt` header | `receipt` field |
| Credential reuse | `Payment-Authorization` header | `paymentAuthorization` field |
| Invalid credential | 401 status | -32401 error |

Payment method specifications (e.g., Tempo, Lightning, Solana) define
credential formats that work identically across both transports.

### 1.2. Use Cases

- **Paid MCP Tools**: Tool providers can monetize individual tool calls
- **AI Agent Spending**: Agents can autonomously pay for tool access
- **Micropayments**: Per-call pricing for compute, data, or API access
- **Multi-Provider**: Agents interact with multiple paid tool providers

---

## 2. Requirements Language

The key words "MUST", "MUST NOT", "REQUIRED", "SHALL", "SHALL NOT",
"SHOULD", "SHOULD NOT", "RECOMMENDED", "NOT RECOMMENDED", "MAY", and
"OPTIONAL" in this document are to be interpreted as described in
BCP 14 [RFC2119] [RFC8174] when, and only when, they appear in all
capitals, as shown here.

---

## 3. Terminology

This specification uses terminology from [draft-ietf-httpauth-payment]:

**Payment Challenge**
: An error response with code -32402 containing payment requirements.

**Payment Credential**
: The `authorization` field containing payment proof.

**Payment Method**
: A mechanism for transferring value (e.g., "tempo", "lightning").

**Payment Intent**
: The type of payment request (e.g., "charge", "approval").

Additional terms:

**Payment-Gated Tool**
: An MCP tool that requires payment for execution.

**MCP Client**
: An AI application or agent that invokes MCP tools.

**MCP Server**
: A service that provides MCP tools, potentially requiring payment.

---

## 4. Protocol Overview

### 4.1. Request Flow

```
   MCP Client                                     MCP Server
      │                                                 │
      │  (1) {"method": "tools/call",                   │
      │       "params": {"name": "image_generate"}}     │
      ├────────────────────────────────────────────────>│
      │                                                 │
      │  (2) {"error": {"code": -32402,                 │
      │       "data": "<base64url-challenge>"}}         │
      │<────────────────────────────────────────────────┤
      │                                                 │
      │  (3) Client decodes challenge, fulfills payment │
      │      (signs transaction, pays invoice, etc.)    │
      │                                                 │
      │  (4) {"method": "tools/call",                   │
      │       "params": {"name": "image_generate"},     │
      │       "authorization": "Payment <credential>"}  │
      ├────────────────────────────────────────────────>│
      │                                                 │
      │  (5) Server verifies and settles                │
      │                                                 │
      │  (6) {"result": {"content": [...]},             │
      │       "receipt": "<base64url>"}                 │
      │<────────────────────────────────────────────────┤
      │                                                 │
```

### 4.2. Response Types

| Scenario | Response |
|----------|----------|
| Payment required | Error -32402 with challenge |
| Invalid credential format | Error -32600 (Invalid Request) |
| Payment verification failed | Error -32401 with fresh challenge |
| Payment verified, tool error | Standard MCP tool error (`isError: true`) |
| Payment verified, success | Result with optional receipt |

---

## 5. Error Codes

This specification reserves the following error codes:

### 5.1. -32402 Payment Required

Indicates the method requires payment. The `error.data` field MUST
contain a base64url-encoded payment challenge (Section 6).

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "error": {
    "code": -32402,
    "message": "Payment Required",
    "data": "<base64url-encoded-challenge>"
  }
}
```

Servers MUST return -32402 when:
- A payment-gated tool is called without an `authorization` field
- A payment-gated tool is called with an expired authorization

### 5.2. -32401 Payment Failed

Indicates the payment credential was well-formed but verification
failed. The `error.data` field MUST contain a fresh base64url-encoded
payment challenge.

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "error": {
    "code": -32401,
    "message": "Payment Failed",
    "data": "<base64url-encoded-challenge>"
  }
}
```

Servers MUST return -32401 when:
- The credential signature is invalid
- The payment amount is insufficient
- The payment was already used (replay)
- The challenge `id` is unknown or expired

This distinction allows clients to differentiate between "payment
needed" (-32402) and "payment attempt rejected" (-32401).

---

## 6. Payment Challenge

The payment challenge is returned in `error.data` for -32402 and
-32401 errors as a base64url-encoded JSON string. The decoded structure
mirrors the HTTP `WWW-Authenticate` parameters from
[draft-ietf-httpauth-payment].

Padding characters ("=") MUST NOT be included in the base64url encoding.

### 6.1. Challenge Object

When decoded, the challenge contains:

```json
{
  "id": "ch_a1b2c3d4e5f6...",
  "realm": "api.example.com",
  "method": "tempo",
  "intent": "charge",
  "request": "<base64url-encoded-json>",
  "expires": "2025-01-19T12:00:00Z",
  "description": "Image generation - 1024x1024"
}
```

### 6.2. Required Fields

**`id`** (string)
: Unique identifier for this challenge. Servers MUST generate a
  cryptographically random value with at least 128 bits of entropy.
  Clients MUST include this value in the credential.

**`realm`** (string)
: Protection space identifier. Defines the scope of the payment
  requirement. Clients MAY use this to determine whether cached
  authorizations apply.

**`method`** (string)
: Payment method identifier (e.g., "tempo", "lightning", "solana").
  MUST be a lowercase ASCII string registered in the HTTP Payment
  Methods registry.

**`intent`** (string)
: Payment intent type. Values defined in [draft-ietf-httpauth-payment]:
  - `"charge"`: One-time payment
  - `"approval"`: Pre-authorization for future charges

**`request`** (string)
: Base64url-encoded JSON containing payment-method-specific data.
  Structure is defined by the payment method specification. Padding
  characters ("=") MUST NOT be included.

### 6.3. Optional Fields

**`expires`** (string)
: RFC 3339 timestamp indicating when this challenge expires. Clients
  MUST NOT submit credentials for expired challenges.

**`description`** (string)
: Human-readable description of the payment purpose. For display only;
  MUST NOT be relied upon for verification (see Security Considerations).

---

## 7. Payment Credential

Clients submit payment credentials by including an `authorization`
field at the root level of the JSON-RPC request object.

### 7.1. Request Structure

```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "premium/generate",
  "params": {
    "prompt": "A sunset over mountains"
  },
  "authorization": "Payment <credential>"
}
```

The `authorization` field:
- MUST be a string
- MUST begin with `"Payment "` (case-sensitive, with trailing space)
- MUST be followed by a base64url-encoded credential

### 7.2. Credential Format

The credential is a base64url-encoded JSON object. The structure is
defined by [draft-ietf-httpauth-payment] Section 5.2:

```json
{
  "id": "ch_a1b2c3d4e5f6...",
  "source": "did:pkh:eip155:42431:0x1234...",
  "payload": "<method-specific-proof>"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | Yes | Challenge identifier (must match challenge `id`) |
| `source` | string | No | Payer identifier as a DID [W3C-DID] (e.g., `"did:key:z6Mk..."`) |
| `payload` | object | Yes | Payload to fulfil the payment challenge (method-specific) |

The `source` field is an OPTIONAL Decentralized Identifier [W3C-DID]
identifying the payer. Clients MAY include this field to enable servers
to associate payments with a persistent identity across requests. Servers
MUST NOT require this field unless the payment method specification
mandates it.

---

## 8. Payment Receipt

On successful payment verification, servers MAY include a `receipt`
field at the root level of the response object.

### 8.1. Response Structure

```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "result": {
    "image_url": "https://example.com/img/abc123.png"
  },
  "receipt": "<base64url-encoded-receipt>"
}
```

### 8.2. Receipt Format

The `receipt` is a base64url-encoded JSON object. The structure mirrors
[draft-ietf-httpauth-payment] Section 5.3:

| Field | Type | Description |
|-------|------|-------------|
| `status` | string | Payment status: "success" or "failed" |
| `method` | string | Payment method used |
| `timestamp` | string | ISO 8601 settlement time |
| `reference` | string | Method-specific reference (tx hash, etc.) |

Receipts provide proof of payment but are not cryptographic proofs
of settlement (see Security Considerations).

---

## 9. Payment Authorization

Servers MAY issue a `paymentAuthorization` field to allow credential
reuse across multiple requests, reducing payment overhead for
high-frequency interactions.

### 9.1. Response Structure

```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "result": { ... },
  "receipt": "<base64url>",
  "paymentAuthorization": "Payment <b64token>, expires=\"2025-01-19T13:00:00Z\""
}
```

### 9.2. Authorization Format

The `paymentAuthorization` field mirrors the HTTP `Payment-Authorization`
header format from [draft-ietf-httpauth-payment] Section 5.4:

```abnf
paymentAuthorization = "Payment" 1*SP b64token *( "," OWS auth-param )
auth-param           = token "=" quoted-string
```

The credential portion (`Payment` followed by `b64token`) is directly usable
as the `authorization` field value for subsequent requests.

#### 9.2.1. Parameters

| Parameter | Required | Description |
|-----------|----------|-------------|
| `expires` | Yes | RFC 3339 timestamp after which the authorization expires |
| `realm` | No | Protection space scope (defaults to challenge realm) |

**Example:**

```
Payment eyJpZCI6Ing3VGcycExxUjltS3ZOd1kzaEJjWmEifQ, expires="2025-01-16T12:00:00Z"
```

The server MAY return a different token in `paymentAuthorization` than
the original credential (e.g., an access token optimized for reuse).

### 9.3. Using Cached Authorizations

When a client has a valid `paymentAuthorization`:

1. Client includes the original credential in `authorization`
2. Server verifies the credential and checks authorization cache
3. If valid, server processes request without re-settling payment

Servers MUST be able to revoke authorizations before expiry. When
revoked, servers return -32402 or -32401 with a fresh challenge.

---

## 10. MCP Notifications

MCP notifications are JSON-RPC requests without an `id` field that
expect no response. Since payment challenges require a response,
notifications cannot support payment flows.

### 10.1. Server Behavior

Servers MUST NOT process payment-gated tools invoked via notifications.
Servers SHOULD silently drop such notifications (per JSON-RPC 2.0 spec).

Servers MAY log dropped payment-required notifications for debugging.

### 10.2. Client Guidance

Clients SHOULD NOT invoke payment-gated tools as notifications. The
`tools/call` method should always include a request `id` to receive
payment challenges and results.

---

## 11. Transport Considerations

MCP supports multiple transport mechanisms. This section defines
transport-specific considerations for payment flows.

### 11.1. Streamable HTTP Transport

When MCP uses Streamable HTTP transport:
- Implementations MUST use TLS 1.3 or later
- Servers MAY use HTTP Payment scheme [draft-ietf-httpauth-payment]
  instead of or in addition to this MCP extension
- The `authorization` field is independent of HTTP `Authorization` header
- Payment challenges MAY be returned via HTTP 402 or MCP -32402 error

### 11.2. stdio Transport

When MCP uses stdio transport (local MCP servers):
- Trust is established by the process execution context
- Payment credentials still provide cryptographic proof of authorization
- Implementations SHOULD still validate credentials
- This transport is common for local tool providers (e.g., filesystem,
  database tools) which typically don't require payment

---

## 12. Security Considerations

This specification inherits security considerations from
[draft-ietf-httpauth-payment] Section 12. Additional MCP-specific
considerations follow.

### 12.1. Credential Exposure in Logs

MCP messages are often logged for debugging. Implementations:
- MUST NOT log the `authorization` field value
- MUST NOT log the `receipt` field value
- SHOULD redact or omit these fields in debug output
- MAY log field presence without values (e.g., `"authorization": "[REDACTED]"`)

### 12.2. AI Agent Autonomy

MCP clients are often AI agents that may make payment decisions
autonomously. Implementations SHOULD:
- Allow users to set spending limits per tool, realm, or session
- Require user confirmation for payments above a threshold
- Provide clear audit logs of all payments made
- Support revoking agent payment capabilities

### 12.3. Error Information Leakage

Payment challenge errors (-32402, -32401) may reveal:
- Which tools require payment
- Payment amounts and recipients
- Server pricing structures

This information exposure is intentional for protocol operation.
Servers concerned about pricing disclosure should consider
alternative access control mechanisms.

### 12.4. Replay Across Transports

A credential generated for an HTTP request should not be replayable
over MCP (and vice versa) if challenge IDs are properly scoped.

Servers MUST:
- Bind challenge `id` values to the transport/endpoint that issued them
- Reject credentials with challenge IDs from different endpoints

### 12.5. Notification Abuse

Attackers may flood servers with payment-gated notifications to:
- Cause silent tool invocation failures
- Mask legitimate notification traffic

Servers SHOULD rate limit notifications from untrusted clients.

---

## 13. IANA Considerations

### 13.1. MCP Error Code Registration

This document requests registration of the following error codes
in a future MCP error code registry:

| Code | Message | Description | Reference |
|------|---------|-------------|-----------|
| -32402 | Payment Required | Tool requires payment | This document, Section 5.1 |
| -32401 | Payment Failed | Payment verification failed | This document, Section 5.2 |

Note: JSON-RPC 2.0 reserves -32700 to -32600 for protocol errors and
-32099 to -32000 for server errors. The codes -32402 and -32401 fall
outside these ranges, in the implementation-defined space.

---

## 14. References

### 14.1. Normative References

**[MCP]**
: Model Context Protocol Specification.
  https://modelcontextprotocol.io/specification

**[JSON-RPC]**
: JSON-RPC 2.0 Specification. https://www.jsonrpc.org/specification

**[RFC2119]**
: Bradner, S., "Key words for use in RFCs to Indicate Requirement
  Levels", BCP 14, RFC 2119, March 1997.

**[RFC8174]**
: Leiba, B., "Ambiguity of Uppercase vs Lowercase in RFC 2119 Key
  Words", BCP 14, RFC 8174, May 2017.

**[RFC3339]**
: Klyne, G. and C. Newman, "Date and Time on the Internet:
  Timestamps", RFC 3339, July 2002.

**[RFC4648]**
: Josefsson, S., "The Base16, Base32, and Base64 Data Encodings",
  RFC 4648, October 2006.

**[draft-ietf-httpauth-payment]**
: Moxey, J., "The 'Payment' HTTP Authentication Scheme",
  draft-ietf-httpauth-payment-01.

### 14.2. Informative References

**[RFC8446]**
: Rescorla, E., "The Transport Layer Security (TLS) Protocol
  Version 1.3", RFC 8446, August 2018.

---

## Appendix A: Examples

All examples use MCP (Model Context Protocol) tool call format.

### A.1. Tool Discovery

Clients discover available tools via `tools/list`. Payment requirements
are not exposed during discovery—they are returned when invoking
payment-gated tools.

**Request:**
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/list"
}
```

**Response:**
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "tools": [
      {
        "name": "web_search",
        "title": "Web Search",
        "description": "Search the web for current information",
        "inputSchema": {
          "type": "object",
          "properties": {
            "query": { "type": "string", "description": "Search query" }
          },
          "required": ["query"]
        }
      },
      {
        "name": "image_generate",
        "title": "Image Generation",
        "description": "Generate images from text prompts",
        "inputSchema": {
          "type": "object",
          "properties": {
            "prompt": { "type": "string" },
            "size": { "type": "string", "enum": ["256x256", "512x512", "1024x1024"] }
          },
          "required": ["prompt"]
        }
      }
    ]
  }
}
```

### A.2. Payment Required Flow

**Request (no authorization):**
```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "tools/call",
  "params": {
    "name": "image_generate",
    "arguments": {
      "prompt": "A sunset over mountains",
      "size": "1024x1024"
    }
  }
}
```

**Response (payment required):**
```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "error": {
    "code": -32402,
    "message": "Payment Required",
    "data": "eyJpZCI6ImNoXzdmM2E5YjJjMWQ0ZTVmNmEiLCJyZWFsbSI6Im1jcC5leGFtcGxlLmNvbS9pbWFnZSIsIm1ldGhvZCI6InRlbXBvIiwiaW50ZW50IjoiY2hhcmdlIiwicmVxdWVzdCI6ImV5SmhiVzkxYm5RaU9pSXhNREF3TURBd0lpd2lZWE56WlhRaU9pSXdlR0ZpWTJRaWZRIiwiZXhwaXJlcyI6IjIwMjUtMDEtMTlUMTI6MDU6MDBaIiwiZGVzY3JpcHRpb24iOiJJbWFnZSBnZW5lcmF0aW9uIC0gMTAyNHgxMDI0In0"
  }
}
```

The decoded `data` contains:
```json
{
  "id": "ch_7f3a9b2c1d4e5f6a",
  "realm": "mcp.example.com/image",
  "method": "tempo",
  "intent": "charge",
  "request": "eyJhbW91bnQiOiIxMDAwMDAwIiwiYXNzZXQiOiIweGFiY2QifQ",
  "expires": "2025-01-19T12:05:00Z",
  "description": "Image generation - 1024x1024"
}
```

**Request (with authorization):**
```json
{
  "jsonrpc": "2.0",
  "id": 3,
  "method": "tools/call",
  "params": {
    "name": "image_generate",
    "arguments": {
      "prompt": "A sunset over mountains",
      "size": "1024x1024"
    }
  },
  "authorization": "Payment eyJpZCI6ImNoXzdmM2E5YjJjMWQ0ZTVmNmEiLCJwYXlsb2FkIjoiMHhhYmNkZWYuLi4ifQ"
}
```

**Response (success with receipt):**
```json
{
  "jsonrpc": "2.0",
  "id": 3,
  "result": {
    "content": [
      {
        "type": "image",
        "data": "iVBORw0KGgoAAAANSUhEUgAA...",
        "mimeType": "image/png"
      }
    ]
  },
  "receipt": "eyJ0eCI6IjB4MTIzNCIsImJsb2NrIjoxMjM0NX0"
}
```

### A.3. Payment with Authorization Reuse

When a server wants to allow credential reuse (e.g., for session-based
billing), it includes `paymentAuthorization` in the response.

**Response (success with authorization):**
```json
{
  "jsonrpc": "2.0",
  "id": 3,
  "result": {
    "content": [
      {
        "type": "image",
        "data": "iVBORw0KGgoAAAANSUhEUgAA...",
        "mimeType": "image/png"
      }
    ]
  },
  "receipt": "eyJ0eCI6IjB4MTIzNCJ9",
  "paymentAuthorization": "Payment eyJpZCI6ImNoXzdmM2E5YjJjMWQ0ZTVmNmEifQ, expires=\"2025-01-19T13:00:00Z\""
}
```

The `paymentAuthorization` uses the same format as the HTTP
`Payment-Authorization` header: `Payment <b64token>` followed by
comma-separated parameters.

**Subsequent request (reusing credential):**

The client extracts the `Payment <b64token>` portion and uses it directly:

```json
{
  "jsonrpc": "2.0",
  "id": 4,
  "method": "tools/call",
  "params": {
    "name": "image_generate",
    "arguments": {
      "prompt": "A sunrise over the ocean",
      "size": "512x512"
    }
  },
  "authorization": "Payment eyJpZCI6ImNoXzdmM2E5YjJjMWQ0ZTVmNmEifQ"
}
```

The server validates the cached authorization without re-settling payment.

### A.4. Payment Failed

When a credential is well-formed but verification fails, the server
returns -32401 with a fresh challenge.

**Response (payment failed):**
```json
{
  "jsonrpc": "2.0",
  "id": 3,
  "error": {
    "code": -32401,
    "message": "Payment Failed",
    "data": "eyJpZCI6ImNoX25ld19jaGFsbGVuZ2VfaWQiLCJyZWFsbSI6Im1jcC5leGFtcGxlLmNvbS9pbWFnZSIsIm1ldGhvZCI6InRlbXBvIiwiaW50ZW50IjoiY2hhcmdlIiwicmVxdWVzdCI6ImV5SmhiVzkxYm5RaU9pSXhNREF3TURBd0luMCIsImV4cGlyZXMiOiIyMDI1LTAxLTE5VDEyOjEwOjAwWiIsImRlc2NyaXB0aW9uIjoiSW1hZ2UgZ2VuZXJhdGlvbiAtIDEwMjR4MTAyNCJ9"
  }
}
```

### A.5. Text Content Response

Tools returning text content follow MCP's content array format.

**Request:**
```json
{
  "jsonrpc": "2.0",
  "id": 5,
  "method": "tools/call",
  "params": {
    "name": "web_search",
    "arguments": {
      "query": "latest AI news"
    }
  },
  "authorization": "Payment eyJpZCI6ImNoX3NlYXJjaDAwMSIsInBheWxvYWQiOiIuLi4ifQ"
}
```

**Response:**
```json
{
  "jsonrpc": "2.0",
  "id": 5,
  "result": {
    "content": [
      {
        "type": "text",
        "text": "Here are the latest AI news headlines:\n\n1. OpenAI announces GPT-5...\n2. Google releases Gemini 2.0..."
      }
    ]
  },
  "receipt": "eyJ0eCI6IjB4YWJjZCJ9"
}
```

### A.6. Resource Link Response

Tools may return resource links for additional context.

**Response:**
```json
{
  "jsonrpc": "2.0",
  "id": 6,
  "result": {
    "content": [
      {
        "type": "text",
        "text": "Analysis complete. See attached report."
      },
      {
        "type": "resource",
        "resource": {
          "uri": "report://analysis/2025-01-19",
          "mimeType": "application/pdf",
          "title": "Full Analysis Report"
        }
      }
    ]
  },
  "receipt": "eyJ0eCI6IjB4ZWZnaCJ9"
}
```

### A.7. Structured Output

Tools with `outputSchema` return structured content.

**Response:**
```json
{
  "jsonrpc": "2.0",
  "id": 7,
  "result": {
    "content": [
      {
        "type": "text",
        "text": "{\"temperature\": 72, \"conditions\": \"sunny\", \"humidity\": 45}"
      }
    ],
    "structuredContent": {
      "temperature": 72,
      "conditions": "sunny",
      "humidity": 45
    }
  },
  "receipt": "eyJ0eCI6IjB4aWprbCJ9"
}
```

### A.8. Tool Execution Error (Non-Payment)

Tool execution errors use `isError: true`, distinct from payment errors.

**Response:**
```json
{
  "jsonrpc": "2.0",
  "id": 8,
  "result": {
    "content": [
      {
        "type": "text",
        "text": "Error: Rate limit exceeded. Please try again in 60 seconds."
      }
    ],
    "isError": true
  }
}
```

Note: Payment was successful (no -32402/-32401), but the tool itself
failed. The payment is not refunded in this case—refund policies are
payment-method-specific.

---

## Acknowledgements

This specification builds on the HTTP Payment scheme designed for
HTTP 402 semantics. Thanks to the contributors of that specification.

---

## Authors' Addresses

Jake Moxey
Tempo Labs
Email: jake@tempo.xyz
