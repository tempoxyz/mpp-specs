# HTTP Payment Auth Client Example

A TypeScript client demonstrating the HTTP Payment Authentication protocol (draft-ietf-httpauth-payment).

## Overview

This client automatically handles HTTP 402 "Payment Required" responses by:

1. Parsing the `WWW-Authenticate: Payment` challenge
2. Signing a Tempo transaction to fulfill the payment request
3. Retrying the request with an `Authorization: Payment` credential

## Installation

```bash
pnpm install
```

## Usage

```bash
PRIVATE_KEY=0x... API_URL=https://api.example.com/resource pnpm start
```

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `PRIVATE_KEY` | Yes | Tempo wallet private key (hex with 0x prefix) |
| `API_URL` | No | API endpoint to fetch (defaults to example URL) |

## Library API

### `fetchWithPayment(url, wallet, options?)`

Fetches a resource, automatically handling 402 payment challenges.

```typescript
import { createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { fetchWithPayment } from "./payment-client.js";

const wallet = createWalletClient({
  account: privateKeyToAccount("0x..."),
  transport: http("https://rpc.tempo.xyz"),
});

const { response, receipt, paid } = await fetchWithPayment(
  "https://api.example.com/paid-resource",
  wallet
);

if (response.ok) {
  const data = await response.json();
}
```

### `parsePaymentChallenge(wwwAuth)`

Parses a `WWW-Authenticate: Payment` header into a structured challenge object.

```typescript
import { parsePaymentChallenge, decodeRequest } from "./payment-client.js";

const challenge = parsePaymentChallenge(response.headers.get("WWW-Authenticate"));
console.log(challenge.id);      // Challenge ID
console.log(challenge.method);  // "tempo"
console.log(challenge.intent);  // "charge"

const request = decodeRequest(challenge.request);
console.log(request.amount);      // Amount in base units
console.log(request.destination); // Payment recipient
```

### `createCredential(challenge, wallet)`

Creates a signed payment credential for a challenge.

```typescript
import { createCredential, encodeCredential } from "./payment-client.js";

const credential = await createCredential(challenge, wallet);
const encoded = encodeCredential(credential);

const response = await fetch(url, {
  headers: { Authorization: `Payment ${encoded}` },
});
```

## Protocol Flow

```
Client                                            Server
   │  GET /resource ─────────────────────────────>│
   │<──────────────── 402 Payment Required        │
   │                  WWW-Authenticate: Payment   │
   │                  id, method, intent, request │
   │                                              │
   │  [Client signs Tempo transaction]            │
   │                                              │
   │  GET /resource ─────────────────────────────>│
   │  Authorization: Payment <credential>         │
   │<──────────────── 200 OK                      │
   │                  Payment-Receipt: <receipt>  │
```

## Supported Payment Methods

Currently supports:
- **tempo** - Tempo blockchain (chain ID 42431)

## References

- [draft-ietf-httpauth-payment](../../draft-ietf-httpauth-payment.md) - Core protocol spec
- [draft-tempo-payment-method](../../draft-tempo-payment-method.md) - Tempo payment method
- [viem Documentation](https://viem.sh) - TypeScript Ethereum library
