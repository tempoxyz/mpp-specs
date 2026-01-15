---
name: http-payment-auth-implementor
description: Implements HTTP 402 Payment Authentication servers and clients. Use when building payment-gated APIs, handling 402 responses, or implementing the Payment auth scheme with Tempo, Stripe, or other payment methods.
---

# HTTP Payment Auth Implementor

Build servers and clients for the HTTP Payment Authentication Scheme.

## Protocol Flow

```
Client                                            Server
   │  GET /resource ─────────────────────────────>│
   │<──────────────── 402 Payment Required        │
   │                  WWW-Authenticate: Payment   │
   │                  id, method, intent, request │
   │                                              │
   │  [Client signs/pays]                         │
   │                                              │
   │  GET /resource ─────────────────────────────>│
   │  Authorization: Payment <credential>         │
   │<──────────────── 200 OK                      │
   │                  Payment-Receipt: <receipt>  │
```

## Headers Reference

| Header | Direction | Purpose |
|--------|-----------|---------|
| `WWW-Authenticate: Payment` | S→C | Challenge with payment requirements |
| `Authorization: Payment` | C→S | Credential with payment proof |
| `Payment-Receipt` | S→C | Settlement confirmation |
| `Payment-Authorization` | S→C | Reusable auth token |

## Implementing a Server

### 1. Return 402 Challenge

```typescript
import crypto from 'crypto';

function createChallenge(realm: string, method: string, intent: string, request: object) {
  const id = crypto.randomBytes(16).toString('base64url');
  const requestB64 = Buffer.from(JSON.stringify(request)).toString('base64url');
  
  return `Payment id="${id}", realm="${realm}", method="${method}", intent="${intent}", request="${requestB64}"`;
}

// Example: Tempo charge request
const request = {
  amount: "1000000",           // 1.00 USD (6 decimals)
  asset: "0x20c0000000000000000000000000000000000001",
  destination: "0x742d35Cc6634C0532925a3b844Bc9e7595f8fE00",
  expires: new Date(Date.now() + 5 * 60 * 1000).toISOString()
};

res.status(402)
   .set('WWW-Authenticate', createChallenge('api.example.com', 'tempo', 'charge', request))
   .set('Cache-Control', 'no-store')
   .json({ error: 'payment_required' });
```

### 2. Validate Credential

```typescript
function parseCredential(authHeader: string) {
  if (!authHeader?.startsWith('Payment ')) return null;
  const b64 = authHeader.slice(8);
  return JSON.parse(Buffer.from(b64, 'base64url').toString());
}

// Credential structure:
// {
//   id: "challenge-id",
//   source: "did:pkh:eip155:42431:0x...",  // optional
//   payload: { type: "transaction", signature: "0x..." }
// }

const credential = parseCredential(req.headers.authorization);
if (!credential) return res.status(401).json({ error: 'invalid_credentials' });

// Verify:
// 1. ID matches stored challenge
// 2. Challenge not expired
// 3. Challenge not already used
// 4. Method-specific payload validation (signature, preimage, etc.)
```

### 3. Return Receipt

```typescript
const receipt = {
  status: 'success',
  method: 'tempo',
  timestamp: new Date().toISOString(),
  reference: txHash
};

res.set('Payment-Receipt', Buffer.from(JSON.stringify(receipt)).toString('base64url'))
   .set('Cache-Control', 'private')
   .json({ data: '...' });
```

### 4. Optional: Reusable Authorization

```typescript
// Allow credential reuse for 1 hour
const expires = new Date(Date.now() + 60 * 60 * 1000).toISOString();
const authToken = Buffer.from(JSON.stringify({ id: sessionId })).toString('base64url');

res.set('Payment-Authorization', `Payment ${authToken}, expires="${expires}"`);
```

## Implementing a Client

### 1. Parse Challenge

```typescript
function parseChallenge(wwwAuth: string) {
  const params: Record<string, string> = {};
  const regex = /(\w+)="([^"]+)"/g;
  let match;
  while ((match = regex.exec(wwwAuth)) !== null) {
    params[match[1]] = match[2];
  }
  return {
    ...params,
    request: JSON.parse(Buffer.from(params.request, 'base64url').toString())
  };
}
```

### 2. Create Credential

```typescript
async function createCredential(challenge: any, wallet: WalletClient) {
  // Sign based on method (this example: Tempo)
  const payload = await signTempoTransaction(wallet, challenge.request);
  
  const credential = {
    id: challenge.id,
    source: `did:pkh:eip155:42431:${wallet.account.address}`,
    payload
  };
  
  return `Payment ${Buffer.from(JSON.stringify(credential)).toString('base64url')}`;
}
```

### 3. Fetch with Auto-Payment

```typescript
async function fetchWithPayment(url: string, wallet: WalletClient, options?: RequestInit) {
  let res = await fetch(url, options);
  
  if (res.status !== 402) return res;
  
  const wwwAuth = res.headers.get('WWW-Authenticate');
  if (!wwwAuth?.startsWith('Payment ')) return res;
  
  const challenge = parseChallenge(wwwAuth);
  const authorization = await createCredential(challenge, wallet);
  
  return fetch(url, {
    ...options,
    headers: { ...options?.headers, Authorization: authorization }
  });
}
```

## Status Codes

| Code | Meaning |
|------|---------|
| 402 | Payment required - see WWW-Authenticate |
| 200 | Payment verified - resource provided |
| 400 | Malformed credential |
| 401 | Valid format but verification failed |
| 403 | Payment verified but access denied |

## Base64url Encoding

Always use base64url WITHOUT padding:

```typescript
// Encode
Buffer.from(JSON.stringify(obj)).toString('base64url')

// Decode
JSON.parse(Buffer.from(b64, 'base64url').toString())
```

## DID Formats for `source` Field

| Chain | Format |
|-------|--------|
| Tempo | `did:pkh:eip155:42431:{address}` |
| Ethereum | `did:pkh:eip155:1:{address}` |
| Solana | `did:pkh:solana:{pubkey}` |

## Common Mistakes

1. Using base64 instead of base64url
2. Reusing challenge IDs (must be unique per challenge)
3. Not binding challenge ID to payment parameters
4. Trusting `description` field (always verify decoded `request`)
5. Sending credentials over HTTP (must use HTTPS)

## Reference Files

- `draft-ietf-httpauth-payment.md` - Full protocol spec
- `draft-tempo-payment-method.md` - Tempo implementation details
- `draft-stripe-payment-method.md` - Stripe implementation details
