# Machine Payments Protocol (MPP) Specifications  

The open protocol for machine-to-machine payments.

**[IETF Specification](https://datatracker.ietf.org/doc/draft-ryan-httpauth-payment/)**
**[Read the full specs](https://tempoxyz.github.io/payment-auth-spec/)**
**[Learn more](https://mpp.sh)**

## Overview

The Machine Payments Protocol (MPP) is an open and internet-native protocol for machine-to-machine payments. By using MPP, businesses and other entities can offer services to agents, apps, and humans via a simple HTTP interface and control flow.

MPP is defined by a payment-method agnostic core, submitted to the [IETF](https://datatracker.ietf.org/doc/draft-ryan-httpauth-payment/) as well as a number of extensions defining payment method flows and core primitives such as discovery and identity.

### Control flow

```mermaid
sequenceDiagram
    participant Client
    participant Server

    Client->>Server: GET /resource
    Server-->>Client: 402 Payment Required<br/>WWW-Authenticate: Payment ...

    Note over Client: Client fulfills payment challenge

    Client->>Server: GET /resource<br/>Authorization: Payment &lt;credential&gt;
    Server-->>Client: 200 OK
```

1. **Client** requests a protected resource
2. **Server** responds with `402 Payment Required` and a `WWW-Authenticate: Payment` challenge describing what payment is needed
3. **Client** fulfills the payment (off-band, via the specified payment method)
4. **Client** retries the request with an `Authorization: Payment` credential proving payment
5. **Server** validates the credential and grants access

## Design Principles

MPP is deighed to be simple, secure, and performant, holding the following design principles as guides:

- **Extensible core**: Minimal protocol designed for safe extension.
- **Network agnostic and multi-rail**: Designed to support a number of payment networks and settlement layers, including bank rails, credit cards, and stablecoins.
- **Currency agnostic**: No implicit advantages for any currency or asset.
- **Durable by design**: All designs follow web standards and are designed for security and replay protection as first class concerns.

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
