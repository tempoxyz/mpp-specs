# Style Guide

## Design Principles

### 1. Payment-Method Agnostic

The core protocol makes no assumptions about how payments work. It defines the HTTP mechanics; payment methods define the semantics.

Any payment method specific details should only live in the `Methods` layer, outside of examples provided in the context of new `Intents`.

```bash
✓ "The credential field contains method-specific authorization data"
✗ "The credential field contains a signed transaction"
```

### 2. Layered Architecture

Protocol mechanics are separate from the evolving payment ecosystems:

- **`Core`**: HTTP 402 semantics, headers, registries (rarely changes)
- **`Intents`**: Abstract payment patterns like charge, authorize, subscription (occasionally extended)
- **`Methods`**: Concrete implementations for specific networks (frequently added)
- **`Extensions`**: Optional protocol additions (as needed)

### 3. Minimal Core

The core spec should contain only what's necessary for interoperability. Push complexity to method specs where it belongs.

### 4. Explicit Over Implicit

Require explicit declaration of payment requirements. Servers must advertise; clients must consent.

### 5. Fail Closed

When in doubt, deny access. Invalid credentials, expired challenges, and verification failures all result in 402.

## RFC Writing Conventions

### 1. IETF Conformance

All specificication should adhere to the standard IETF format and style guide [ref](https://authors.ietf.org/).

### 2. Requirements Language

Use RFC 2119 keywords precisely:

| Keyword | Meaning |
|---------|---------|
| MUST | Absolute requirement |
| MUST NOT | Absolute prohibition |
| SHOULD | Recommended, but valid reasons to ignore may exist |
| SHOULD NOT | Discouraged, but valid reasons to do it may exist |
| MAY | Truly optional |

### 3. Structure

Following IETF guidelines, ever spec should follow the below structure:

```bash
1. Abstract           - What this document does (2-3 sentences)
2. Introduction       - Context and motivation
3. Requirements       - RFC 2119 boilerplate
4. Terminology        - Define terms used
5. [Technical body]   - The actual specification
6. Security           - Security considerations (never empty)
7. IANA              - Registry updates
8. References        - Normative and informative
```

### Terminology

Define terms on first use. Use consistent terminology:

| Term | Definition |
|------|------------|
| Challenge | A `WWW-Authenticate` header with scheme "Payment" |
| Credential | An `Authorization` header with scheme "Payment" |
| Intent | What kind of payment (charge, authorize, subscription) |
| Method | How payment works (tempo, stripe, lightning) |
| Receipt | Server acknowledgment of successful payment |

### Examples

Include examples for every non-trivial concept. Use realistic but obviously fake values:

```http
HTTP/1.1 402 Payment Required
WWW-Authenticate: Payment id="pay_abc123",
  method="tempo",
  intent="charge",
  request="eyJ..."
```

### Security Considerations

Never leave this section empty. Address at minimum:

- Authentication/authorization boundaries
- Replay protection / idempotency
- Information disclosure
- Denial of service vectors

## Formatting

### JSON

Use 2-space indentation, no trailing commas:

```json
{
  "amount": "1.00",
  "currency": "USD"
}
```

### Line Length

Keep lines under 72 characters in the markdown source for proper RFC rendering.

## File Organization

```bash
specs/
├── core/           # The Payment scheme itself
├── intents/        # Payment patterns (charge, authorize, etc.)
├── methods/        # Network implementations (tempo, stripe, etc.)
└── extensions/     # Optional features (discovery, etc.)
```

Each directory contains specs at the same abstraction level. Cross-references should flow downward: core → intents → methods.

## Versioning

The Payment scheme uses a three-layer versioning strategy
aligned with the layered architecture above. Each layer
evolves independently.

### Core Protocol: No Wire Version

The `Payment` scheme name is the stable anchor. The core
does NOT carry a version identifier on the wire.

No deployed HTTP authentication scheme uses a version
parameter (`Basic`, `Bearer`, `Digest` are all
unversioned). Evolution happens through:

- Adding optional challenge parameters (peers MUST ignore
  unknown parameters)
- Adding optional credential fields (peers MUST ignore
  unknown fields)
- Publishing new RFCs that Update or Obsolete the original

If a future change is truly incompatible with the core
wire format, register a new scheme name (e.g., `Payment2`).

**Prior art:** HTTP auth schemes (RFC 7617, RFC 6750,
RFC 7616), OAuth 2.0 (RFC 6749), JOSE/JWT
(RFC 7515-7519).

### Payment Methods: Version by Identifier

Methods are identified by strings in the IANA Payment
Methods Registry (e.g., `tempo`, `x402`, `stripe`).

- **Compatible changes** (adding optional fields, defining
  defaults): made in-place under the same identifier.
- **Breaking changes** (removing required fields, changing
  semantics): register a new identifier (e.g.,
  `tempo-v2`).

Method specs MAY define a `version` field within their
method-specific details for incremental schema tracking:

```json
{
  "version": 1,
  "chainId": 42431,
  "feePayer": true
}
```

**Registry policy:** Changes to an existing method
identifier MUST be backwards compatible. Removing or
renaming required fields, or changing the semantics of
existing fields, requires a new method identifier.

### Payment Intents: Version in Request Schema

Intent request schemas carry a `version` field inside the
`request` JSON blob:

```json
{
  "version": 1,
  "amount": "10000",
  "currency": "0x20c0...0001",
  "recipient": "0x...",
  "expires": "2026-02-06T12:00:00Z"
}
```

The `version` field is OPTIONAL and defaults to `1` when
absent. Rules:

- Adding optional fields with defined defaults: compatible,
  same version
- Adding required fields or changing field semantics:
  increment version
- The intent identifier (`charge`, `authorize`, etc.)
  remains stable across versions
- Servers MAY offer multiple challenges with different
  request versions (RFC 7235 allows multiple
  `WWW-Authenticate` values)
- Clients that encounter an unrecognized version SHOULD
  treat it as an unsupported intent

**Prior art:** x402 (`x402Version`), EIP-712
(`domain.version`), JSON Schema (`$schema`).

### Compatibility Rules

All layers follow the same rule:

> Implementations MUST ignore unknown fields in
> challenges, credentials, request objects, and receipts.

This is the primary mechanism for forward compatibility
and enables most evolution without version changes.

### Summary

| Layer | Versioning | Breaking Change |
|-------|------------|-----------------|
| Core | None (stable scheme name) | New scheme (`Payment2`) |
| Methods | Identifier + `methodDetails.version` | New identifier (`tempo-v2`) |
| Intents | `request.version` (default: 1) | Increment version |
