# AGENTS.md - Tempo AI Payments Cloudflare Monorepo

This repository contains Cloudflare Workers applications for Tempo's AI payments infrastructure.

## ⚠️ Critical Rules

**ALWAYS run tests after making changes:**

```bash
# Run tests for the specific app/package you modified
pnpm --filter @tempo/<app-name> test

# Or run all tests
pnpm test
```

Tests MUST pass before considering any change complete. If tests fail, fix them before moving on.

---

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

### Multi-Environment Deployments

All apps deploy to both testnet (Moderato) and production (Presto) environments on merge to main:

| Environment | RPC URL | Domain Patterns |
|-------------|---------|-----------------|
| `moderato` | `https://rpc.moderato.tempo.xyz` | `*-testnet.tempo.xyz` (canonical), `*.moderato.tempo.xyz` |
| `presto` | `https://rpc.presto.tempo.xyz` | `*.tempo.xyz` (production) |

The `*-testnet` domain is the **canonical testnet** that always points to the current testnet chain (currently Moderato). The `*.moderato` domain is chain-specific.

Deploy commands:
```bash
pnpm --filter @tempo/payments-proxy deploy:moderato  # testnet
pnpm --filter @tempo/payments-proxy deploy:presto    # production
```

**RPC-dependent apps** (use TEMPO_RPC_URL for blockchain transactions):
- `payments-proxy` - Payment proxy service
- `paymentauth-tetris` - Tetris game with payments
- `reth-snapshots` - Reth snapshot downloads

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

---

## Tempo Blockchain Integration

### Using tempo.ts

```typescript
import { createPublicClient, http } from 'viem'
import { tempoModerato } from 'tempo.ts/chains'
import { publicActionsL2 } from 'tempo.ts'

const client = createPublicClient({
  chain: tempoModerato,
  transport: http()
}).extend(publicActionsL2())

// Get TIP-20 token balance
const balance = await client.getBalance({
  address: '0x...',
  token: '0x20c0000000000000000000000000000000000001' // AlphaUSD
})
```

### Fee Sponsorship with Access Keys

```typescript
import { Handler } from 'tempo.ts/server'
import { privateKeyToAccount } from 'viem/accounts'

// In your Worker - handle fee sponsorship requests
const handler = Handler.feePayer({
  account: privateKeyToAccount(env.SPONSOR_PRIVATE_KEY),
  chain: tempoModerato,
  transport: http(env.TEMPO_RPC_URL),
})

app.all('/sponsor/*', async (c) => handler.fetch(c.req.raw))
```

### TIP-20 Token Addresses

| Token | Address |
|-------|---------|
| AlphaUSD | `0x20c0000000000000000000000000000000000001` |
| USDC | `0x20c0000000000000000000000000000000000002` |
| USDT | `0x20c0000000000000000000000000000000000003` |
| pathUSD | `0x20c0000000000000000000000000000000000000` |

### Tempo Networks

| Network | Chain ID | RPC URL |
|---------|----------|---------|
| Presto (Mainnet) | 4217 | `https://rpc.presto.tempo.xyz` |
| Moderato (Testnet) | 42431 | `https://rpc.moderato.tempo.xyz` |
| Testnet | — | `https://rpc.testnet.tempo.xyz` |
| Mainnet | — | `https://rpc.tempo.xyz` |

---

## IDXS (Index Supply) for Activity History

Query on-chain activity using Index Supply:

```typescript
import { Idxs } from 'idxs'

const idxs = new Idxs()

// Get recent transfers
const transfers = await idxs.query({
  chain: 111557750, // Tempo chain ID
  signature: 'event Transfer(address indexed from, address indexed to, uint256 value)',
  address: tokenAddress,
  limit: 50
})

// Custom SQL query
const topSenders = await idxs.sql(`
  SELECT "from", count(*) as tx_count
  FROM transfer 
  WHERE chain = 111557750
  GROUP BY "from"
  ORDER BY tx_count DESC
  LIMIT 10
`, { signature: 'event Transfer(address indexed from, address indexed to, uint256 value)' })
```

---

## Onramp Integration

Integrate fiat-to-crypto onramp (Coinbase):

```typescript
app.post('/onramp/order', async (c) => {
  const { address, amount, email } = await c.req.json()
  
  const response = await fetch('https://api.coinbase.com/onramp/v1/orders', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${await generateCoinbaseJWT(c.env)}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      destination_address: address,
      destination_network: 'tempo',
      purchase_amount: { value: amount.toFixed(2), currency: 'USD' },
      user: { email }
    })
  })
  
  return c.json(await response.json())
})
```

**Required secrets:**
```bash
wrangler secret put CB_API_KEY_ID
wrangler secret put CB_API_KEY_SECRET
```

---

## Subscription with Cron Jobs

### Wrangler Configuration

```jsonc
{
  "triggers": {
    "crons": ["0 0 * * *"]  // Daily at midnight
  }
}
```

### Subscription Renewal Worker

```typescript
export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext) {
    return app.fetch(request, env, ctx)
  },
  
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    // Find expiring subscriptions
    const expiring = await env.DB.prepare(`
      SELECT * FROM subscriptions 
      WHERE expires_at BETWEEN datetime('now') AND datetime('now', '+1 day')
      AND auto_renew = 1
    `).all()
    
    for (const sub of expiring.results) {
      try {
        // Charge using access key
        await chargeAccessKey(env, sub.access_key_id, sub.plan_price)
        
        // Extend subscription
        await env.DB.prepare(`
          UPDATE subscriptions 
          SET expires_at = datetime(expires_at, '+30 days')
          WHERE id = ?
        `).bind(sub.id).run()
      } catch (error) {
        console.error(`Failed to renew subscription ${sub.id}:`, error)
      }
    }
  }
}
```

---

## UI Development

### Tailwind CSS v4 + CVA

```typescript
// Component with variants using CVA
import { cva, type VariantProps } from 'cva'

const button = cva({
  base: [
    'inline-flex items-center justify-center gap-2',
    'rounded-lg font-medium transition-all',
    'focus:outline-none focus:ring-2 focus:ring-offset-2',
    'disabled:opacity-50 disabled:cursor-not-allowed',
  ],
  variants: {
    variant: {
      primary: 'bg-blue-500 text-white hover:bg-blue-600',
      secondary: 'bg-gray-100 text-gray-900 hover:bg-gray-200',
      danger: 'bg-red-500 text-white hover:bg-red-600',
    },
    size: {
      sm: 'h-8 px-3 text-sm',
      md: 'h-10 px-4',
      lg: 'h-12 px-6 text-lg',
    },
  },
  defaultVariants: { variant: 'primary', size: 'md' },
})

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof button> {}

export function Button({ variant, size, ...props }: ButtonProps) {
  return <button className={button({ variant, size })} {...props} />
}
```

### Theme Configuration

```css
/* src/app.css */
@import 'tailwindcss';

@theme {
  --color-tempo-bg: #0A0A0B;
  --color-tempo-surface: #141416;
  --color-tempo-border: #27272A;
  --color-tempo-text: #FAFAFA;
  --color-tempo-muted: #71717A;
  --color-tempo-accent: #3B82F6;
}
```

---

## Local Development

### OrbStack + Custom Domains

For local development with custom domains and HTTPS:

1. Install OrbStack
2. Add to `/etc/hosts`: `127.0.0.1 app.local.tempo.xyz`
3. Use `mkcert` for local SSL certificates

### Tailscale for Device Testing

Expose local dev server for testing features like Apple Pay:

```bash
# Start dev server
pnpm dev

# Expose via Tailscale
tailscale funnel 8787
```

---

## Creating a New App

### Using the Create Script (Recommended)

The `create-app` script automatically scaffolds a new app and configures CI/CD:

```bash
pnpm create-app my-app
```

This will:
- ✅ Create `apps/my-app/` directory from `apps/_template/`
- ✅ Update package names and configuration files
- ✅ **Automatically add the app to CI/CD workflows** (`.github/workflows/main.yml` and `.github/workflows/pull-request.yml`)
- ✅ Set up deployment scripts (`deploy:preview` and `deploy:prod`)

### README Requirements

**Every app MUST have a README.md** that includes at minimum:

1. **What It Does** - Describe the app's purpose, key endpoints, and whether they are free or paid
2. **How to Test** - Show how to call the app using the sample client:
   ```bash
   # TypeScript client
   pnpm --filter @tempo/paymentauth-client demo GET http://localhost:PORT/endpoint
   
   # Bash client
   cd packages/paymentauth-client
   PRIVATE_KEY=0x... ./demo.sh GET http://localhost:PORT/endpoint
   ```

See existing apps (`paymentauth-basic`, `payments-proxy`, etc.) for examples.

### Manual Setup

If you need to create an app manually:

1. **Scaffold**
   ```bash
   mkdir -p apps/my-app/src
   cd apps/my-app
   ```

2. **Copy from template**
   - Copy `package.json`, `tsconfig.json`, `wrangler.jsonc` from `apps/_template/`
   - Update package name to `@tempo/my-app`
   - Update wrangler name and bindings

3. **Add to CI/CD workflows**
   - Edit `.github/workflows/main.yml` - add to the `matrix.include` array:
     ```yaml
     - app: my-app
     ```
   - Edit `.github/workflows/pull-request.yml` - add to the `matrix.include` array:
     ```yaml
     - app: my-app
     ```

4. **Install and run**
   ```bash
   pnpm install
   pnpm --filter @tempo/my-app dev
   ```

---

## Payment Auth Client for Verification

The `@tempo/paymentauth-client` package provides CLI tools for testing payment-protected endpoints.

### TypeScript Client (demo.ts)

```bash
# Test a free endpoint
pnpm --filter @tempo/paymentauth-client demo GET http://localhost:3001/ping

# Test a paid endpoint (requires PRIVATE_KEY)
PRIVATE_KEY=0x... pnpm --filter @tempo/paymentauth-client demo GET http://localhost:3001/ping/paid
```

### Bash Client (demo.sh)

Requires: Foundry (cast), curl, jq, bc

```bash
cd packages/paymentauth-client
PRIVATE_KEY=0x... ./demo.sh GET http://localhost:3001/ping/paid
```

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PRIVATE_KEY` | Wallet private key (0x-prefixed hex) | Required for paid endpoints |
| `TEMPO_RPC_URL` | Tempo RPC endpoint | `https://rpc.moderato.tempo.xyz` |
| `BASE_RPC_URL` | Base Sepolia RPC endpoint | `https://sepolia.base.org` |

**Note**: By default, the client outputs only the final result. Use the `--verbose` flag to see debug output and progress messages.

### Verifying Payment Auth Integration

1. **Start a local server** with payment-protected endpoints:
   ```bash
   pnpm --filter @tempo/paymentauth-basic dev
   ```

2. **Test free endpoint** (should return 200):
   ```bash
   pnpm --filter @tempo/paymentauth-client demo GET http://localhost:3001/ping
   ```

3. **Test paid endpoint without payment** (should return 402):
   ```bash
   pnpm --filter @tempo/paymentauth-client demo GET http://localhost:3001/ping/paid
   ```

4. **Test paid endpoint with payment** (should return 200 after payment):
   ```bash
   PRIVATE_KEY=0x... pnpm --filter @tempo/paymentauth-client demo GET http://localhost:3001/ping/paid
   ```

The client automatically handles the 402 Payment Required flow:
1. Receives 402 with WWW-Authenticate challenge
2. Parses payment request (amount, asset, destination)
3. Signs a transaction using the provided private key
4. Submits payment credentials in Authorization header
5. Receives 200 with Payment-Receipt header on success
