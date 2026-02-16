# HTTP Payment Authentication Specifications

📄 **[Read the specs →](https://tempoxyz.github.io/mpp-spec/)**

An internet-native payments protocol which enables HTTP resources to require payment before granting access.

## Overview

The Payment Auth scheme extends the HTTP/OAuth flow to allow servers to specify that payment is required in order to access a resource.

```bash
Client                                            Server
   │                                                 │
   │  GET /resource                                  │
   ├────────────────────────────────────────────────>│
   │                                                 │
   │  402 Payment Required                           │
   │  WWW-Authenticate: Payment ...                  │
   │<────────────────────────────────────────────────┤
   │                                                 │
   │  [Client fulfills payment challenge]            │
   │                                                 │
   │  GET /resource                                  │
   │  Authorization: Payment <credential>            │
   ├────────────────────────────────────────────────>│
   │                                                 │
   │  200 OK                                         │
   │<────────────────────────────────────────────────┤
```

1. Client requests a protected resource
2. Server responds with `402 Payment Required` and a `WWW-Authenticate: Payment` challenge describing what payment is needed
3. Client fulfills the payment (off-band, via the specified payment method)
4. Client retries the request with an `Authorization: Payment` credential proving payment
5. Server validates the credential and grants access

## Design Principles

- **Extensible core**: Minimal protocol designed for safe extension.
- **Network agnostic and multi-rail**: Designed to support a number of payment networks and settlement layers, including bank rails, credit cards, and stablecoins.
- **Currency agnostic**: No implicit advantages for any currency or asset.
- **Hardened primitives**: All designs follow web standards and are designed for security and replay protection as first class concerns.

See [STYLE.md](STYLE.md) for the full design principles and RFC writing conventions.

## Architecture

The specification is modular, separating stable protocol mechanics from evolving payment ecosystems:

- **[Core](specs/core/)**: HTTP 402 semantics, headers, IANA registries.
- **[Intents](specs/intents/)**: Abstract payment patterns—charge, authorize, subscription. Define *what* kind of payment without specifying *how*.
- **[Methods](specs/methods/)**: Concrete implementations for specific networks (Tempo, Stripe, ACH).
- **[Extensions](specs/extensions/)**: Optional protocol additions, such as discovery and identity.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for building instructions and contribution guidelines.

## License

Specifications: [CC0 1.0 Universal](https://creativecommons.org/publicdomain/zero/1.0/) (Public Domain)

Tooling: [Apache 2.0](LICENSE-APACHE) or [MIT](LICENSE-MIT), at your option
