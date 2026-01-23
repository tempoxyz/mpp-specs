# The "Payment" HTTP Authentication Scheme

HTTP 402 "Payment Required" was reserved in HTTP/1.1 but never standardized. This specification defines the "Payment" authentication scheme that gives 402 its semantics, enabling HTTP resources to require payment before granting access.

## Protocol Overview

The Payment scheme extends HTTP Authentication to support payment challenges in order to access protected resources.

```
Client                                            Server
   │                                                 │
   │  (1) GET /resource                              │
   ├────────────────────────────────────────────────>│
   │                                                 │
   │  (2) 402 Payment Required                       │
   │      WWW-Authenticate: Payment id="..",         │
   │        method="..", intent="..", request=".."   │
   │<────────────────────────────────────────────────┤
   │                                                 │
   │  (3) Client fulfills payment challenge          │
   │                                                 │
   │  (4) GET /resource                              │
   │      Authorization: Payment <credential>        │
   ├────────────────────────────────────────────────>│
   │                                                 │
   │  (5) 200 OK                                     │
   │      Payment-Receipt: <receipt>                 │
   │<────────────────────────────────────────────────┤
```

The protocol is **payment-method agnostic**—it works with any payment network, currency, or processor through registered payment method identifiers.

## Architecture

The specification is modular, separating stable protocol mechanics from evolving payment ecosystems:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              CORE                                           │
│  HTTP 402 semantics, headers, IANA registries                               │
│  (stable, rarely changes)                                                   │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
          ┌─────────────────────────┴─────────────────────────┐
          ▼                                                   ▼
┌─────────────────────────────────┐     ┌─────────────────────────────────────┐
│           INTENTS               │     │            METHODS                  │
│   (abstract payment patterns)   │     │    (concrete implementations)       │
├─────────────────────────────────┤     ├─────────────────────────────────────┤
│ • charge      → one-time        │     │ • tempo   → Tempo blockchain        │
│ • authorize   → pre-auth        │     │ • stripe  → Stripe payments         │
│ • subscription → recurring      │     │ • (lightning, etc.)                 │
└─────────────────────────────────┘     └─────────────────────────────────────┘
                                    │
                                    ▼
                   ┌─────────────────────────────────────┐
                   │           EXTENSIONS                │
                   │   (optional protocol additions)     │
                   ├─────────────────────────────────────┤
                   │ • discovery → well-known, DNS       │
                   └─────────────────────────────────────┘
```

**Core** defines the HTTP mechanics and registries. It should rarely change.

**Intents** define abstract payment patterns (charge, authorize, subscription) that work across payment networks. New intents can be added without modifying core.

**Methods** define how specific payment networks implement intents. Anyone can create a method spec for their payment infrastructure.

**Extensions** add optional protocol features like discovery mechanisms.

## Specifications

### Core (Standards Track)

| Document | Description |
|----------|-------------|
| [draft-httpauth-payment](specs/core/draft-httpauth-payment-00.md) | HTTP 402 + Payment authentication scheme |

### Intents (Standards Track)

| Document | Description |
|----------|-------------|
| [draft-payment-intent-charge](specs/intents/draft-payment-intent-charge-00.md) | One-time immediate payment |
| [draft-payment-intent-authorize](specs/intents/draft-payment-intent-authorize-00.md) | Pre-authorization for future charges |
| [draft-payment-intent-subscription](specs/intents/draft-payment-intent-subscription-00.md) | Recurring periodic payments |

### Methods (Informational)

| Document | Description |
|----------|-------------|
| [draft-tempo-payment-method](specs/methods/draft-tempo-payment-method-00.md) | Tempo blockchain payments |
| [draft-stripe-payment-method](specs/methods/draft-stripe-payment-method-00.md) | Stripe payment processing |

### Extensions (Informational)

| Document | Description |
|----------|-------------|
| [draft-payment-discovery](specs/extensions/draft-payment-discovery-00.md) | Discovery via well-known endpoints and DNS |

## Building

### Using Docker (recommended)

```bash
# Build the Docker image (first time only)
make docker-build

# Generate XML, HTML, TXT, and PDF artifacts
make build-docker

# Run build + validation
make check

# Interactive shell for debugging
make shell

# Clean generated artifacts
make clean
```

### Local Development

```bash
# Install dependencies
bundle install              # Ruby: kramdown-rfc
pip install -r requirements.txt  # Python: xml2rfc, rfclint

# Generate artifacts
./scripts/gen.sh

# With verbose output (shows all warnings)
./scripts/gen.sh --verbose

# Run in Docker from local machine
./scripts/gen.sh --docker
```

### Generated Outputs

All outputs are written to `artifacts/`:
- `draft-*.xml` - RFC XML (v3)
- `draft-*.html` - HTML version
- `draft-*.txt` - Plain text version
- `draft-*.pdf` - PDF version

## License

These specifications are released into the public domain (CC0 1.0 Universal).
