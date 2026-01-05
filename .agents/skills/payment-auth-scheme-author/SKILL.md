---
name: payment-auth-scheme-author
description: Expert in authoring the "Payment" HTTP Authentication Scheme (draft-ietf-httpauth-payment). Use when writing, extending, or reviewing the Payment scheme specification, defining payment methods, or ensuring RFC compliance.
metadata:
  id: SKILL-B756D
requires:
  - SKILL-A3743  # writing-ietf-w3c-specs
  - SKILL-32904  # markdown-to-xml2rfc
---

# Payment Authentication Scheme Author

Expert guidance for authoring **draft-ietf-httpauth-payment**.

## Design Philosophy

The Payment scheme repurposes HTTP's existing authentication framework (RFC 7235) for payments rather than inventing new headers. This means:

- Challenges go in `WWW-Authenticate`, not custom headers
- Credentials go in `Authorization`, not custom headers
- The scheme name "Payment" follows the same registration pattern as "Basic" or "Bearer"

This aligns with HTTP semantics and enables existing HTTP infrastructure (proxies, libraries, tooling) to handle payment flows naturally.

## Key Design Decisions

### Why 402 for challenges, 401 for failures?

- **402**: "You need to pay" (economic barrier)
- **401**: "Your payment didn't work" (credential barrier)

This separation lets clients distinguish "haven't tried yet" from "tried and failed".

### Why single-use credentials?

Payment proofs (signatures, preimages) are typically one-time. The `id` parameter binds each credential to a specific challenge, preventing replay.

### Why base64url JSON payloads?

- JSON for structure and extensibility
- Base64url for HTTP header safety (no special characters)
- No padding for cleaner URLs and headers

### Why separate payment method specs?

The core spec defines the protocol skeleton. Each payment network (Tempo, Lightning, Stripe) has vastly different proof structures. Separating them:

- Keeps the core spec stable
- Allows independent evolution of payment methods
- Enables IANA registration for discoverability

## Extending the Specification

### Adding a new payment method

1. Choose a lowercase identifier (e.g., `solana`, `applepay`)
2. Define the `request` JSON schema (what server sends)
3. Define the `payload` JSON schema (what client sends back)
4. Specify verification and settlement procedures
5. Document security considerations
6. Register in IANA Payment Methods Registry (Section 13.3)
7. Add example in Appendix C

### Adding a new intent

Intents beyond `charge` are defined by payment method specs. To add one:

1. Define semantics (what does "stream" or "hodl" mean?)
2. Specify which methods support it
3. Register in IANA Payment Intents Registry (Section 13.4)
4. Update Section 7.3 examples

### Adding optional parameters

New challenge parameters:

- Use lowercase names
- Document in Section 5.1.2
- Clients MUST ignore unknown parameters (already specified)

## Prior Art & References

### Comparison Table

| Aspect | Payment Scheme | [x402](https://github.com/coinbase/x402) | [L402](https://docs.lightning.engineering/the-lightning-network/l402) | [WebCredits](https://webcredits.org/) |
|--------|----------------|------|------|------------|
| **Challenge header** | `WWW-Authenticate` | `PAYMENT-REQUIRED` | `WWW-Authenticate` | N/A (pull model) |
| **Credential header** | `Authorization` | `PAYMENT-SIGNATURE` | `Authorization` | POST to inbox |
| **IETF alignment** | [RFC 7235](https://www.rfc-editor.org/rfc/rfc7235) | Custom protocol | RFC 7235 | Linked Data / RDF |
| **Initial status** | 402 | 402 | 402 | N/A |
| **Failure status** | 401 | 402 | 402 | N/A |
| **Challenge binding** | `id` parameter | Implicit | Macaroon identifier | Transaction URI |
| **Multi-currency** | Yes (via methods) | Yes (CAIP-19) | No (BTC only) | Yes (URI-based) |
| **Multi-chain** | Yes (via methods) | Yes (CAIP-2) | No | Yes |
| **Replay protection** | Method-specific | Nonce | Preimage reveal | Signature |
| **Receipt** | `Payment-Receipt` header | `SettlementResponse` | Reusable L402 token | Transaction document |

### What to learn from each

| Protocol | Lessons | Limitations we address |
|----------|---------|------------------------|
| **x402** | Payload structures, facilitator pattern, CAIP identifiers | Non-standard headers, no 401 distinction |
| **L402** | Macaroon attenuation, preimage binding, Aperture proxy | Lightning-only, BTC-denominated |
| **WebCredits** | Semantic web patterns, URI-based identity, decentralization | Complexity, adoption barriers |

### Additional References

- **[Melvin Carvalho's HTTP 402 Spec](references/SPEC-melvincarvalho.md)** — Alternative minimal approach using `Payment-Info` and `Payment-Proof` headers
- **[RFC 9110 (HTTP Semantics)](https://www.rfc-editor.org/rfc/rfc9110)** — HTTP status codes, caching, content negotiation
- **[W3C Payment Method Identifiers](https://www.w3.org/TR/payment-method-id/)** — Identifier format patterns

## Writing Style

Follow IETF conventions:

- BCP 14 keywords (MUST, SHOULD, MAY) only in caps when normative
- Present tense for requirements
- Passive voice for procedures ("The server validates..." not "You validate...")
- Cross-reference sections explicitly ("See Section 5.1")


