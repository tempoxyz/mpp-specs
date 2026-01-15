---
name: http-payment-auth
description: Implements HTTP 402 Payment Authentication servers, clients, and payment method extensions. Use when building payment-gated APIs, implementing the Payment auth scheme, or creating blockchain payment method specifications for Tempo, Solana, Lightning, EVM chains, etc.
---

# HTTP Payment Authentication Skill

Build servers, clients, and payment method extensions for the HTTP Payment Authentication Scheme (draft-ietf-httpauth-payment).

## Quick Reference

### Protocol Flow

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

### Headers

| Header | Direction | Purpose |
|--------|-----------|---------|
| `WWW-Authenticate: Payment` | S→C | Challenge with payment requirements |
| `Authorization: Payment` | C→S | Credential with payment proof |
| `Payment-Receipt` | S→C | Settlement confirmation (base64url JSON) |
| `Payment-Authorization` | S→C | Reusable auth token for subsequent requests |

## Implementing a Server

### 1. Return 402 Challenge

```typescript
// Generate challenge
const challengeId = crypto.randomBytes(16).toString('base64url');
const request = {
  amount: "1000000",           // Base units (e.g., 1.00 USD = 1000000 for 6 decimals)
  asset: "0x20c0...",          // Token address
  destination: "0x742d...",    // Recipient
  expires: new Date(Date.now() + 5 * 60 * 1000).toISOString()
};

res.status(402)
   .set('WWW-Authenticate', 
     `Payment id="${challengeId}", ` +
     `realm="api.example.com", ` +
     `method="tempo", ` +
     `intent="charge", ` +
     `request="${Buffer.from(JSON.stringify(request)).toString('base64url')}"`)
   .json({ error: "payment_required" });
```

### 2. Validate Credential

```typescript
const authHeader = req.headers.authorization;
if (!authHeader?.startsWith('Payment ')) {
  return res.status(401).json({ error: "invalid_credentials" });
}

const credential = JSON.parse(
  Buffer.from(authHeader.slice(8), 'base64url').toString()
);

// Verify: 1) ID matches stored challenge, 2) not expired, 3) not already used
// Then verify method-specific payload (signature, transaction, etc.)
```

### 3. Return Receipt

```typescript
const receipt = {
  status: "success",
  method: "tempo",
  timestamp: new Date().toISOString(),
  reference: txHash  // method-specific reference
};

res.set('Payment-Receipt', Buffer.from(JSON.stringify(receipt)).toString('base64url'))
   .json({ data: "..." });
```

## Implementing a Client

### 1. Handle 402 Response

```typescript
async function fetchWithPayment(url: string, wallet: WalletClient) {
  const res = await fetch(url);
  
  if (res.status !== 402) return res;
  
  const wwwAuth = res.headers.get('WWW-Authenticate');
  const challenge = parsePaymentChallenge(wwwAuth);
  
  // Decode request
  const request = JSON.parse(
    Buffer.from(challenge.request, 'base64url').toString()
  );
```

### 2. Create Credential

```typescript
  // For Tempo: sign a transaction
  const payload = await signTempoTransaction(wallet, request);
  
  const credential = {
    id: challenge.id,
    source: `did:pkh:eip155:42431:${wallet.account.address}`,
    payload
  };
  
  // Retry with credential
  return fetch(url, {
    headers: {
      'Authorization': `Payment ${Buffer.from(JSON.stringify(credential)).toString('base64url')}`
    }
  });
}
```

## Creating Payment Method Extensions

When adding support for a new blockchain or payment network, create a payment method specification.

### Required Sections

1. **Method Identifier** - Lowercase ASCII (e.g., `solana`, `lightning`, `base`)
2. **Payment Intents** - Which intents are supported (`charge`, `authorize`, `subscription`)
3. **Request Schema** - JSON structure in WWW-Authenticate `request` parameter
4. **Credential Schema** - JSON structure in Authorization `payload` field
5. **Verification Procedure** - How to validate the proof
6. **Settlement Procedure** - How payment is finalized
7. **Security Considerations** - Method-specific threats

### Workflow for New Payment Methods

1. **Research the blockchain**
   - Look up official documentation for the target chain
   - Understand transaction format, signing, and RPC methods
   - Identify token standards (ERC20, SPL, etc.)

2. **Define request schema** based on what clients need to construct payment:
   ```json
   {
     "amount": "string (base units)",
     "asset": "string (token identifier)", 
     "destination": "string (recipient address)",
     "expires": "string (ISO 8601 timestamp)",
     // Chain-specific fields...
   }
   ```

3. **Define credential schema** based on payment proof:
   ```json
   {
     "type": "transaction | signature | preimage",
     "signature": "hex string",
     // Chain-specific proof data...
   }
   ```

4. **Write verification procedure**:
   - Signature recovery / verification
   - Transaction validation
   - Amount/recipient checks

5. **Write settlement procedure**:
   - How server broadcasts/submits payment
   - Confirmation requirements
   - Receipt generation

### Example: Solana Payment Method Skeleton

```markdown
## Method Identifier
`solana`

## Request Schema (intent="charge")
| Field | Type | Description |
|-------|------|-------------|
| `amount` | string | Lamports or token base units |
| `asset` | string | "SOL" or SPL token mint address |
| `destination` | string | Recipient pubkey (base58) |
| `expires` | string | ISO 8601 expiry |
| `recentBlockhash` | string | Optional; server may provide |

## Credential Schema
| Field | Type | Description |
|-------|------|-------------|
| `type` | string | "transaction" |
| `signature` | string | Base58-encoded transaction signature |
| `transaction` | string | Base64-encoded serialized transaction |

## Verification
1. Deserialize transaction
2. Verify signature matches transaction
3. Verify transaction transfers correct amount to destination
4. Verify blockhash is recent (< 150 blocks)

## Settlement
1. Submit via `sendTransaction` RPC
2. Confirm via `getSignatureStatuses`
3. Return signature as receipt reference
```

### Example: Lightning Payment Method Skeleton

```markdown
## Method Identifier
`lightning`

## Request Schema (intent="charge")
| Field | Type | Description |
|-------|------|-------------|
| `invoice` | string | BOLT11 payment request |
| `amount` | string | Millisatoshis (if not in invoice) |

## Credential Schema
| Field | Type | Description |
|-------|------|-------------|
| `type` | string | "preimage" |
| `preimage` | string | 32-byte hex preimage |

## Verification
1. Hash preimage with SHA256
2. Verify hash matches payment_hash in invoice
3. Verify invoice not expired

## Settlement
Preimage revelation IS settlement (atomic)
```

## Testing Implementations

### Server Test Cases

1. **402 on unauthenticated request** - Verify WWW-Authenticate header present
2. **Challenge ID uniqueness** - Each 402 has different ID
3. **Credential validation** - Reject expired, invalid, replayed credentials
4. **Receipt generation** - Payment-Receipt header on success

### Client Test Cases

1. **Challenge parsing** - Correctly extract all parameters
2. **Request decoding** - Base64url decode and JSON parse
3. **Credential construction** - Proper signing and encoding
4. **Retry logic** - Automatic retry with credential after 402

## Reference: Base64url Encoding

This protocol uses base64url WITHOUT padding:

```typescript
// Encode
const encoded = Buffer.from(JSON.stringify(obj)).toString('base64url');

// Decode  
const decoded = JSON.parse(Buffer.from(encoded, 'base64url').toString());
```

## Reference: DID Formats for `source` Field

| Chain | DID Format |
|-------|------------|
| Tempo | `did:pkh:eip155:42431:{address}` |
| Ethereum | `did:pkh:eip155:1:{address}` |
| Solana | `did:pkh:solana:{pubkey}` |
| Bitcoin | `did:pkh:bip122:{address}` |

## Common Mistakes

1. **Using base64 instead of base64url** - Must use URL-safe alphabet, no padding
2. **Reusing challenge IDs** - Each must be cryptographically unique
3. **Not binding challenge to request** - ID must be associated with payment params
4. **Trusting description field** - Always verify decoded `request` data
5. **Missing TLS** - Payment credentials MUST only be sent over HTTPS

## External Resources

When implementing for specific chains, fetch their documentation:

- **Tempo**: https://docs.tempo.xyz
- **Viem (EVM)**: https://viem.sh
- **Solana Web3.js**: https://solana-labs.github.io/solana-web3.js/
- **Lightning (LND)**: https://api.lightning.community/
- **Bitcoin**: https://developer.bitcoin.org/

## Files in This Repository

- `draft-ietf-httpauth-payment.md` - Core protocol spec (read for full details)
- `draft-tempo-payment-method.md` - Tempo implementation reference
- `draft-stripe-payment-method.md` - Stripe implementation reference
