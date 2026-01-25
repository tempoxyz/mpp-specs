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

Protocol mechanics are seperate from the evolving payment ecosystems:

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
