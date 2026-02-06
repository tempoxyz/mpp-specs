# Versioning Strategy

This document describes the versioning approach for the Payment HTTP Authentication Scheme (draft-ietf-httpauth-payment).

## Design Principles

The Payment scheme uses a **layered architecture** with three independent versioning surfaces:

1. **Core Protocol** — The `Payment` auth scheme itself (challenge format, credential format, receipt header, status codes)
2. **Payment Methods** — Network-specific integrations (`tempo`, `stripe`, `x402`, etc.)
3. **Payment Intents** — Request/response schemas per payment type (`charge`, `authorize`, `subscription`, `stream`)

Each layer evolves independently. The core is deliberately thin and stable; methods and intents absorb domain-specific complexity.

## Core Protocol: No Wire Version

The core protocol does **not** carry a version identifier on the wire. The scheme name `Payment` is the stable anchor.

**Rationale:** No deployed HTTP authentication scheme uses a version parameter (`Basic`, `Bearer`, `Digest` are all unversioned). Evolution happens through:

- Adding optional challenge parameters (peers MUST ignore unknown parameters)
- Adding optional credential fields (peers MUST ignore unknown fields)
- Publishing new RFCs that Update or Obsolete the original

If a future change is truly incompatible with the core wire format, the IETF-standard mechanism is registering a new scheme name (e.g., `Payment2`). This is expected to be unnecessary given the core's thin design.

**Prior art:**
- HTTP auth schemes: `Basic` (RFC 7617), `Bearer` (RFC 6750), `Digest` (RFC 7616) — none versioned
- OAuth 2.0 (RFC 6749): no version field; evolution via extension RFCs and IANA registries
- JOSE/JWT (RFC 7515–7519): independent specs, `alg` registry for extensibility

## Payment Methods: Version by Identifier

Payment methods are identified by string values registered in the IANA Payment Methods Registry (e.g., `tempo`, `x402`, `stripe`).

**Compatible changes** (adding optional fields, defining defaults) are made in-place under the same identifier.

**Breaking changes** (removing required fields, changing semantics) require registering a **new identifier** (e.g., `tempo-v2`).

Additionally, method specifications MAY define a `version` field within their method-specific details to track incremental schema evolution:

```
methodDetails: {
  version: 1,
  chainId: 42431,
  feePayer: true
}
```

**Registry policy:** Changes to an existing method identifier MUST be backwards compatible. Removing or renaming required fields, or changing the semantics of existing fields, requires a new method identifier.

## Payment Intents: Version in Request Schema

Intent request schemas carry a `version` field inside the `request` JSON blob:

```json
{
  "version": 1,
  "amount": "10000",
  "currency": "0x20c0000000000000000000000000000000000001",
  "recipient": "0x...",
  "expires": "2026-02-06T12:00:00Z"
}
```

The `version` field is OPTIONAL and defaults to `1` when absent. This enables incremental schema evolution without registry churn.

**Rules:**
- Adding optional fields with defined defaults: compatible, same version
- Adding required fields or changing field semantics: increment version
- The intent identifier (`charge`, `authorize`, etc.) remains stable across versions
- Servers MAY offer multiple challenges with different request versions (RFC 7235 allows multiple `WWW-Authenticate` values)
- Clients that encounter an unrecognized version SHOULD treat it as an unsupported intent

**Prior art:**
- x402: uses `x402Version` integer in every message for the same purpose
- EIP-712: uses `domain.version` for typed data versioning
- JSON Schema: uses `$schema` URI for schema identification

## Compatibility Rules

### Unknown Field Handling

All layers follow the same rule:

> Implementations MUST ignore unknown fields in challenges, credentials, request objects, and receipts.

This is the primary mechanism for forward compatibility and enables most evolution without version changes.

### Deprecation

When a method identifier or intent version is deprecated:

1. Add a "Deprecated" note to the IANA registry entry
2. Servers SHOULD stop issuing challenges with the deprecated value
3. Clients SHOULD continue accepting deprecated values for a transition period
4. Define a sunset date in the deprecation notice

## Summary

| Layer | Versioning Mechanism | Breaking Change Strategy |
|-------|---------------------|--------------------------|
| Core Protocol | None (stable scheme name) | New scheme name (`Payment2`) |
| Payment Methods | Identifier + optional `methodDetails.version` | New identifier (`tempo-v2`) |
| Payment Intents | `request.version` field (default: 1) | Increment version number |

## References

- [RFC 7235](https://www.rfc-editor.org/rfc/rfc7235) — HTTP Authentication
- [RFC 6749](https://www.rfc-editor.org/rfc/rfc6749) — OAuth 2.0 (registry-driven extensibility)
- [RFC 7515–7519](https://www.rfc-editor.org/rfc/rfc7515) — JOSE/JWT family (independent specs)
- [RFC 8126](https://www.rfc-editor.org/rfc/rfc8126) — Guidelines for IANA Considerations
- [x402 Protocol](https://github.com/coinbase/x402) — `x402Version` versioning approach
