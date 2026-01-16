# AGENTS.md - Tempo AI Payments Cloudflare Monorepo

This repository contains Cloudflare Workers applications for Tempo's AI payments infrastructure.

## Quick Reference

```bash
# Install dependencies
pnpm install

# Development (all apps)
pnpm dev

# Development (specific app)
pnpm --filter @tempo/api dev

# Deploy to preview
pnpm deploy:preview

# Deploy to production
pnpm deploy:prod

# Type checking
pnpm typecheck

# Linting
pnpm lint

# Run tests
pnpm test
```

---

## Repository Structure

```
apps/
├── api/              # Main API Worker (Hono-based)
├── payments/         # Payment processing Worker
├── webhooks/         # Webhook receiver Worker
└── dashboard/        # Admin dashboard (Workers + Assets)

packages/
├── auth/             # IETF Payments Auth implementation
├── transactions/     # Tempo Transaction SDK
├── shared/           # Shared utilities and types
└── db/               # D1 schema and migrations
```

---

## Web Development Guidelines

### Framework & Stack

- **Runtime**: Cloudflare Workers (V8 isolates)
- **API Framework**: Hono (lightweight, Workers-native)
- **Database**: D1 (SQLite-based, edge database)
- **Object Storage**: R2 (S3-compatible)
- **State Management**: Durable Objects (for coordination)
- **Containers**: Cloudflare Containers (for long-running tasks)
- **Type Safety**: TypeScript strict mode

### Code Style

- Use TypeScript with strict mode enabled
- Prefer `const` over `let`; avoid `var`
- Use async/await over raw Promises
- Export types alongside implementations
- Use Zod for runtime validation
- Keep Workers small and focused

### API Design

- RESTful endpoints with consistent naming
- Use HTTP status codes correctly
- Return JSON with `{ data, error, meta }` structure
- Include request IDs in responses for tracing
- Implement proper CORS handling

### Error Handling

```typescript
// Always use typed errors
import { HTTPException } from 'hono/http-exception'

throw new HTTPException(400, { message: 'Invalid request' })
```

---

## Cloudflare Workers Development

### Wrangler Configuration

Each app has its own `wrangler.jsonc` with environment-specific settings:

```jsonc
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "app-name",
  "main": "src/index.ts",
  "compatibility_date": "2025-01-15",
  "compatibility_flags": ["nodejs_compat"],
  
  // Bindings
  "d1_databases": [...],
  "r2_buckets": [...],
  "durable_objects": { "bindings": [...] },
  "services": [...],
  
  // Environments
  "env": {
    "preview": { ... },
    "production": { ... }
  }
}
```

### D1 Database

```bash
# Create a database
wrangler d1 create tempo-payments

# Run migrations
wrangler d1 migrations apply tempo-payments --local  # local
wrangler d1 migrations apply tempo-payments          # remote

# Execute queries
wrangler d1 execute tempo-payments --command "SELECT * FROM transactions"
```

**Usage in Worker:**
```typescript
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const result = await env.DB.prepare(
      'SELECT * FROM transactions WHERE id = ?'
    ).bind(transactionId).first()
    return Response.json(result)
  }
}
```

### R2 Object Storage

```bash
# Create bucket
wrangler r2 bucket create tempo-receipts
```

**Usage in Worker:**
```typescript
// Store object
await env.RECEIPTS.put(`receipt-${id}.pdf`, pdfBuffer, {
  httpMetadata: { contentType: 'application/pdf' }
})

// Retrieve object
const object = await env.RECEIPTS.get(`receipt-${id}.pdf`)
if (object) {
  return new Response(object.body, {
    headers: { 'Content-Type': object.httpMetadata?.contentType ?? 'application/octet-stream' }
  })
}
```

### Durable Objects

Use for coordination, WebSockets, and strongly-consistent state:

```typescript
export class PaymentSession extends DurableObject {
  async fetch(request: Request): Promise<Response> {
    // Handle session state
  }
  
  async alarm(): Promise<void> {
    // Handle scheduled cleanup
  }
}
```

**Binding in wrangler.jsonc:**
```jsonc
{
  "durable_objects": {
    "bindings": [
      { "name": "PAYMENT_SESSION", "class_name": "PaymentSession" }
    ]
  },
  "migrations": [
    { "tag": "v1", "new_sqlite_classes": ["PaymentSession"] }
  ]
}
```

### Cloudflare Containers

For long-running tasks, ML inference, or complex processing:

```typescript
import { Container } from '@cloudflare/containers'

export class ProcessorContainer extends Container {
  defaultPort = 8080
  sleepAfter = '5m'
}
```

---

## IETF Payments Auth for Tempo

### Overview

Tempo uses HTTP Message Signatures (RFC 9421) for secure payment authorization. This ensures:
- Request integrity (tampering detection)
- Non-repudiation (cryptographic proof of sender)
- Replay protection (nonce + timestamp)

### Authentication Flow

```
1. Client creates payment request
2. Client signs request using HTTP Message Signatures
3. Server verifies signature against registered public key
4. Server validates nonce, timestamp, and scope
5. Server processes authorized payment
```

### Signing a Request

```typescript
import { signRequest, TempoSigner } from '@tempo/auth'

const signer = new TempoSigner({
  keyId: 'tempo-key-1',
  privateKey: process.env.TEMPO_PRIVATE_KEY,
  algorithm: 'ed25519'
})

const signedRequest = await signRequest(request, signer, {
  // Components to sign
  covered: ['@method', '@target-uri', '@authority', 'content-digest', 'tempo-idempotency-key'],
  // Signature parameters
  created: Date.now(),
  expires: Date.now() + 300_000, // 5 minutes
  nonce: crypto.randomUUID()
})
```

### Verifying a Request

```typescript
import { verifyRequest, TempoKeyResolver } from '@tempo/auth'

const keyResolver = new TempoKeyResolver(env.DB)

const result = await verifyRequest(request, keyResolver, {
  requiredComponents: ['@method', '@target-uri', 'content-digest'],
  maxAge: 300, // seconds
  requireNonce: true
})

if (!result.valid) {
  throw new HTTPException(401, { message: result.error })
}
```

### HTTP Headers

Required headers for authenticated requests:

| Header | Description |
|--------|-------------|
| `Signature` | The actual signature value |
| `Signature-Input` | Signature parameters and covered components |
| `Content-Digest` | SHA-256 digest of request body |
| `Tempo-Idempotency-Key` | Unique key for idempotent operations |
| `Tempo-Request-Id` | Request tracing identifier |

---

## Tempo Transactions

### Access Keys

Access keys are scoped credentials for API access:

```typescript
interface AccessKey {
  id: string              // 'ak_xxx'
  name: string            // Human-readable name
  publicKey: string       // Ed25519 public key (base64)
  scopes: Scope[]         // Permitted operations
  rateLimit: RateLimit    // Requests per time window
  expiresAt?: Date        // Optional expiration
  metadata?: Record<string, string>
}

type Scope = 
  | 'transactions:read'
  | 'transactions:write'
  | 'balance:read'
  | 'webhooks:manage'
  | 'keys:manage'
```

### Creating Access Keys

```typescript
import { createAccessKey } from '@tempo/transactions'

const key = await createAccessKey(env, {
  name: 'Production API Key',
  scopes: ['transactions:read', 'transactions:write'],
  rateLimit: { requests: 1000, window: '1m' }
})

// Returns: { id, publicKey, privateKey (only shown once) }
```

### Transaction Operations

```typescript
import { TempoClient } from '@tempo/transactions'

const tempo = new TempoClient({
  baseUrl: 'https://api.tempo.xyz',
  keyId: process.env.TEMPO_KEY_ID,
  privateKey: process.env.TEMPO_PRIVATE_KEY
})

// Create a transaction
const tx = await tempo.transactions.create({
  amount: 1000,           // In smallest currency unit (cents)
  currency: 'USD',
  recipient: 'acct_xxx',
  memo: 'Payment for services',
  metadata: { orderId: 'order_123' }
})

// Get transaction status
const status = await tempo.transactions.get(tx.id)

// List transactions with filters
const transactions = await tempo.transactions.list({
  status: 'completed',
  after: '2025-01-01T00:00:00Z',
  limit: 50
})
```

### Transaction States

```
pending → processing → completed
                    ↘ failed
                    ↘ cancelled
```

### Webhooks

Register webhooks to receive real-time transaction updates:

```typescript
// Register webhook
await tempo.webhooks.create({
  url: 'https://your-app.com/webhooks/tempo',
  events: ['transaction.completed', 'transaction.failed'],
  secret: 'whsec_xxx'  // For signature verification
})

// Verify webhook in your handler
import { verifyWebhook } from '@tempo/transactions'

app.post('/webhooks/tempo', async (c) => {
  const signature = c.req.header('Tempo-Signature')
  const payload = await c.req.text()
  
  if (!verifyWebhook(payload, signature, env.WEBHOOK_SECRET)) {
    return c.json({ error: 'Invalid signature' }, 401)
  }
  
  const event = JSON.parse(payload)
  // Handle event...
})
```

---

## Deployment

### Preview Deployments

Every branch gets a preview URL:
- Pattern: `https://<branch>-<app>.tempo-preview.workers.dev`
- Automatic on push to non-main branches
- Uses preview environment bindings

```bash
# Manual preview deploy
pnpm --filter @tempo/api deploy:preview
```

### Production Deployments

```bash
# Deploy all apps
pnpm deploy:prod

# Deploy specific app
pnpm --filter @tempo/api deploy:prod
```

### Environment Variables

Set secrets via Wrangler:
```bash
# Set for all environments
wrangler secret put TEMPO_SIGNING_KEY

# Set for specific environment
wrangler secret put TEMPO_SIGNING_KEY --env production
```

---

## Testing

```bash
# Run all tests
pnpm test

# Run with coverage
pnpm test:coverage

# Run specific app tests
pnpm --filter @tempo/api test

# Run in watch mode
pnpm test:watch
```

### Testing Workers Locally

Use Miniflare bindings in tests:
```typescript
import { env } from 'cloudflare:test'

describe('API', () => {
  it('creates transaction', async () => {
    const response = await app.request('/transactions', {
      method: 'POST',
      body: JSON.stringify({ amount: 100, currency: 'USD' })
    }, env)
    expect(response.status).toBe(201)
  })
})
```

---

## Security Checklist

- [ ] Never log sensitive data (keys, tokens, PII)
- [ ] Use `wrangler secret` for all secrets
- [ ] Validate all input with Zod schemas
- [ ] Implement rate limiting on all endpoints
- [ ] Use Content-Digest for request integrity
- [ ] Set appropriate CORS headers
- [ ] Rotate access keys periodically
- [ ] Monitor for anomalous transaction patterns

---

## Troubleshooting

### Common Issues

**D1 connection errors:**
```bash
# Check binding name matches wrangler.jsonc
wrangler d1 info tempo-payments
```

**Durable Object not found:**
- Ensure migration tag is applied
- Check class is exported from entry point

**R2 access denied:**
- Verify bucket binding in wrangler.jsonc
- Check CORS configuration for public buckets

### Debugging

```bash
# Tail logs in real-time
wrangler tail

# With filters
wrangler tail --status error --search "transaction"
```
