# The "Payment" HTTP Authentication Scheme

This repository contains the specification for the "Payment" HTTP Authentication Scheme and its Payment Method extension specifications.

## Specifications

| Document | Description |
|----------|-------------|
| [draft-ietf-httpauth-payment.md](draft-ietf-httpauth-payment.md) | The "Payment" HTTP Authentication Scheme |
| [draft-stripe-payment-method.md](draft-stripe-payment-method.md) | Stripe Payment Method |
| [draft-tempo-payment-method.md](draft-tempo-payment-method.md) | Tempo Payment Method |

## Build

### 1. Prerequisites

- [Python 3.x](https://www.python.org/downloads/)
- [Node.js](https://nodejs.org/en/download)
- `xml2rfc`: `pip install xml2rfc` or `pipx install xml2rfc`

### 2. Generate Artifacts

```bash
./gen.sh
```

