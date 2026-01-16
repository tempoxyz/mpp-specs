# SKILLS.md - Tempo AI Payments Skills

This file describes specialized skills available for agents working on this codebase.

---

## Available Skills

### 1. Cloudflare Workers Development

**When to use:** Building serverless applications, APIs, and edge functions on Cloudflare Workers.

#### Core Concepts

- **Workers**: Serverless functions running on Cloudflare's edge network
- **Bindings**: Connections to Cloudflare services (D1, R2, KV, Durable Objects)
- **Environments**: Separate configurations for preview/production

#### Key Patterns

```typescript
// Standard Worker structure with Hono
import { Hono } from 'hono'
import { cors } from 'hono/cors'

type Env = {
  DB: D1Database
  BUCKET: R2Bucket
  PAYMENT_SESSION: DurableObjectNamespace
}

const app = new Hono<{ Bindings: Env }>()

app.use('*', cors())

app.get('/health', (c) => c.json({ status: 'ok' }))

export default app
```

#### Wrangler Commands

```bash
wrangler dev                    # Local development
wrangler deploy                 # Deploy to production
wrangler deploy --env preview   # Deploy to preview
wrangler tail                   # Stream logs
wrangler d1 execute <db> --command "SELECT 1"
wrangler r2 object get <bucket> <key>
```

---

### 2. D1 Database Operations

**When to use:** Working with relational data, user records, transactions.

#### Schema Design

```sql
-- migrations/0001_initial.sql
CREATE TABLE IF NOT EXISTS transactions (
  id TEXT PRIMARY KEY,
  amount INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  status TEXT NOT NULL DEFAULT 'pending',
  sender_id TEXT NOT NULL,
  recipient_id TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX idx_transactions_sender ON transactions(sender_id);
CREATE INDEX idx_transactions_status ON transactions(status);
```

#### Query Patterns

```typescript
// Prepared statements with bindings (preferred)
const tx = await env.DB.prepare(
  'SELECT * FROM transactions WHERE id = ?'
).bind(id).first<Transaction>()

// Batch operations
const batch = [
  env.DB.prepare('UPDATE transactions SET status = ? WHERE id = ?').bind('completed', id1),
  env.DB.prepare('UPDATE balances SET amount = amount - ? WHERE account_id = ?').bind(amount, senderId),
]
await env.DB.batch(batch)
```

---

### 3. R2 Object Storage

**When to use:** Storing files, documents, receipts, media.

#### Operations

```typescript
// Upload with metadata
await env.BUCKET.put(key, data, {
  httpMetadata: {
    contentType: 'application/pdf',
    cacheControl: 'max-age=31536000'
  },
  customMetadata: {
    uploadedBy: userId,
    transactionId: txId
  }
})

// Download
const object = await env.BUCKET.get(key)
if (!object) throw new HTTPException(404)

// List with prefix
const listed = await env.BUCKET.list({ prefix: `receipts/${userId}/` })

// Generate signed URL (via Worker)
// R2 doesn't have native signed URLs; use a Worker endpoint with auth
```

---

### 4. Durable Objects

**When to use:** Real-time coordination, WebSockets, rate limiting, sessions.

#### Implementation Pattern

```typescript
import { DurableObject } from 'cloudflare:workers'

export class RateLimiter extends DurableObject<Env> {
  async fetch(request: Request): Promise<Response> {
    const key = new URL(request.url).pathname
    const current = await this.ctx.storage.get<number>(key) ?? 0
    
    if (current >= 100) {
      return new Response('Rate limited', { status: 429 })
    }
    
    await this.ctx.storage.put(key, current + 1)
    
    // Reset after 1 minute
    await this.ctx.storage.setAlarm(Date.now() + 60_000)
    
    return new Response('OK')
  }
  
  async alarm(): Promise<void> {
    await this.ctx.storage.deleteAll()
  }
}
```

#### Accessing from Worker

```typescript
const id = env.RATE_LIMITER.idFromName(clientIp)
const stub = env.RATE_LIMITER.get(id)
const response = await stub.fetch(request)
```

---

### 5. Cloudflare Containers

**When to use:** Long-running processes, ML inference, complex computations.

#### Container Definition

```typescript
import { Container } from '@cloudflare/containers'

export class MLProcessor extends Container {
  defaultPort = 8080
  sleepAfter = '10m'  // Hibernate after 10 minutes of inactivity
  
  // Custom environment variables
  envVars = {
    MODEL_PATH: '/models/payment-fraud-v1'
  }
}
```

#### Routing to Containers

```typescript
// Route to specific container by ID
const id = env.ML_PROCESSOR.idFromName(customerId)
const container = env.ML_PROCESSOR.get(id)
return container.fetch(request)

// Load balance across containers
const randomId = Math.floor(Math.random() * 3)
const id = env.ML_PROCESSOR.idFromName(`worker-${randomId}`)
```

---

### 6. IETF HTTP Message Signatures (RFC 9421)

**When to use:** Authenticating API requests, payment authorization.

#### Signing Requests

```typescript
import { createSigner, signMessage } from '@tempo/auth'

const signer = createSigner({
  keyId: 'key-123',
  privateKey: await crypto.subtle.importKey(
    'pkcs8',
    base64ToArrayBuffer(privateKeyBase64),
    { name: 'Ed25519' },
    false,
    ['sign']
  )
})

const signedRequest = await signMessage(request, signer, {
  components: [
    '@method',
    '@target-uri', 
    '@authority',
    'content-digest',
    'content-type'
  ],
  parameters: {
    created: Math.floor(Date.now() / 1000),
    expires: Math.floor(Date.now() / 1000) + 300,
    nonce: crypto.randomUUID()
  }
})
```

#### Verifying Signatures

```typescript
import { createVerifier, verifyMessage } from '@tempo/auth'

const verifier = createVerifier({
  keyResolver: async (keyId) => {
    const key = await env.DB.prepare(
      'SELECT public_key FROM access_keys WHERE id = ?'
    ).bind(keyId).first()
    return key?.public_key
  }
})

const result = await verifyMessage(request, verifier, {
  requiredComponents: ['@method', '@target-uri', 'content-digest'],
  maxAge: 300,
  clockSkew: 60
})

if (!result.valid) {
  return new Response(JSON.stringify({ error: result.reason }), { 
    status: 401 
  })
}
```

---

### 7. Tempo Transaction SDK

**When to use:** Creating, querying, and managing payment transactions.

#### Client Setup

```typescript
import { TempoClient } from '@tempo/transactions'

const client = new TempoClient({
  baseUrl: 'https://api.tempo.xyz',
  keyId: env.TEMPO_KEY_ID,
  privateKey: env.TEMPO_PRIVATE_KEY,
  // Optional: custom fetch for Workers
  fetch: (url, init) => fetch(url, init)
})
```

#### Transaction Operations

```typescript
// Create transaction
const tx = await client.transactions.create({
  amount: 10000,  // $100.00 in cents
  currency: 'USD',
  recipient: 'acct_recipient_123',
  idempotencyKey: crypto.randomUUID(),
  metadata: {
    orderId: 'order_456',
    description: 'Payment for services'
  }
})

// Query transaction
const status = await client.transactions.get(tx.id)

// List with filters
const transactions = await client.transactions.list({
  status: 'completed',
  createdAfter: '2025-01-01T00:00:00Z',
  limit: 100,
  cursor: 'next_page_token'
})

// Cancel pending transaction
await client.transactions.cancel(tx.id, {
  reason: 'Customer requested cancellation'
})
```

#### Access Key Management

```typescript
// Create new access key
const key = await client.accessKeys.create({
  name: 'Production API Key',
  scopes: ['transactions:read', 'transactions:write'],
  expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000) // 1 year
})

// IMPORTANT: Save the private key immediately - it's only shown once
console.log('Private Key:', key.privateKey)

// Rotate key
const newKey = await client.accessKeys.rotate(key.id)

// Revoke key
await client.accessKeys.revoke(key.id)
```

---

### 8. Webhook Handling

**When to use:** Receiving real-time updates from Tempo.

#### Webhook Receiver

```typescript
import { Hono } from 'hono'
import { verifyWebhookSignature, WebhookEvent } from '@tempo/transactions'

const app = new Hono<{ Bindings: Env }>()

app.post('/webhooks/tempo', async (c) => {
  const signature = c.req.header('Tempo-Signature')
  const timestamp = c.req.header('Tempo-Timestamp')
  const payload = await c.req.text()
  
  // Verify signature
  const isValid = await verifyWebhookSignature({
    payload,
    signature,
    timestamp,
    secret: c.env.WEBHOOK_SECRET
  })
  
  if (!isValid) {
    return c.json({ error: 'Invalid signature' }, 401)
  }
  
  // Check timestamp to prevent replay attacks
  const webhookTime = parseInt(timestamp, 10)
  if (Date.now() - webhookTime > 300_000) { // 5 minutes
    return c.json({ error: 'Webhook expired' }, 400)
  }
  
  const event: WebhookEvent = JSON.parse(payload)
  
  switch (event.type) {
    case 'transaction.completed':
      await handleTransactionCompleted(event.data)
      break
    case 'transaction.failed':
      await handleTransactionFailed(event.data)
      break
    default:
      console.log('Unhandled event type:', event.type)
  }
  
  return c.json({ received: true })
})
```

---

## Full-Stack App Template

Use this template to bootstrap a new Tempo-powered application:

```typescript
// apps/api/src/index.ts
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import { HTTPException } from 'hono/http-exception'
import { verifyRequest, TempoKeyResolver } from '@tempo/auth'
import { z } from 'zod'

type Env = {
  DB: D1Database
  BUCKET: R2Bucket
  TEMPO_KEY_ID: string
  TEMPO_PRIVATE_KEY: string
}

const app = new Hono<{ Bindings: Env }>()

// Middleware
app.use('*', logger())
app.use('*', cors())

// Health check
app.get('/health', (c) => c.json({ status: 'ok', timestamp: new Date().toISOString() }))

// Authentication middleware for protected routes
const authMiddleware = async (c, next) => {
  const keyResolver = new TempoKeyResolver(c.env.DB)
  const result = await verifyRequest(c.req.raw, keyResolver)
  
  if (!result.valid) {
    throw new HTTPException(401, { message: result.error })
  }
  
  c.set('keyId', result.keyId)
  await next()
}

// Protected routes
app.use('/api/*', authMiddleware)

// Create transaction
const CreateTransactionSchema = z.object({
  amount: z.number().positive(),
  currency: z.string().length(3),
  recipient: z.string(),
  memo: z.string().optional()
})

app.post('/api/transactions', async (c) => {
  const body = await c.req.json()
  const validated = CreateTransactionSchema.parse(body)
  
  const id = crypto.randomUUID()
  
  await c.env.DB.prepare(`
    INSERT INTO transactions (id, amount, currency, recipient_id, memo, status)
    VALUES (?, ?, ?, ?, ?, 'pending')
  `).bind(id, validated.amount, validated.currency, validated.recipient, validated.memo ?? null).run()
  
  return c.json({ data: { id, ...validated, status: 'pending' } }, 201)
})

// Error handling
app.onError((err, c) => {
  if (err instanceof HTTPException) {
    return c.json({ error: err.message }, err.status)
  }
  console.error(err)
  return c.json({ error: 'Internal server error' }, 500)
})

export default app
```

---

## Skill Activation

When working on this codebase, agents should:

1. **Check AGENTS.md first** for project-specific conventions
2. **Reference this file** for implementation patterns
3. **Use pnpm** for all package management
4. **Run typecheck before commits**: `pnpm typecheck`
5. **Test locally first**: `pnpm dev`
