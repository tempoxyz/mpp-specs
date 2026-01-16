# Payments Proxy

Pay-per-use API proxy for partner services. Just change your base URL.

## Overview

The payments proxy sits between you and partner APIs (like Browserbase). It enables pay-per-use access:

- **Free endpoints** → Pass through with your own API key
- **Paid endpoints** → Pay via the protocol, then access using our API key

```
┌────────┐    ┌─────────────────┐    ┌─────────────────┐
│ Client │───▶│ Payments Proxy  │───▶│ Partner API     │
│        │    │                 │    │ (Browserbase)   │
│        │◀───│ 402 + Challenge │    │                 │
│        │    │                 │    │                 │
│        │───▶│ Payment Auth    │───▶│ Proxied Request │
└────────┘    └─────────────────┘    └─────────────────┘
```

## Quick Start

```bash
# Start the proxy
pnpm dev

# Free endpoint (uses your API key)
curl http://localhost:8787/browserbase/v1/sessions \
  -H "X-BB-API-Key: YOUR_API_KEY"

# Paid endpoint (returns 402, requires payment)
PRIVATE_KEY=0x... pnpm --filter @tempo/paymentauth-client demo \
  POST http://localhost:8787/browserbase/v1/sessions
```

## Available Partners

| Partner | Path Prefix | Upstream |
|---------|-------------|----------|
| Browserbase | `/browserbase` | `api.browserbase.com` |

## How It Works

### Free Endpoints
Your request is forwarded directly to the upstream API with your own `Authorization` or API key header intact.

### Paid Endpoints
1. Proxy returns `402 Payment Required` with `WWW-Authenticate` challenge
2. You sign a transaction for the requested amount
3. You retry with `Authorization: Payment <credential>`
4. Proxy broadcasts your payment, then forwards your request
5. Response includes `Payment-Receipt` header with transaction hash

## Client Examples

See **[EXAMPLES.md](./EXAMPLES.md)** for detailed curl commands, bash scripts, and TypeScript examples.

## Configuration

Environment variables for the Worker:

| Variable | Description |
|----------|-------------|
| `ENVIRONMENT` | `development`, `preview`, or `production` |
| `TEMPO_RPC_URL` | Tempo RPC endpoint |
| `TEMPO_RPC_USERNAME` | Optional RPC auth username |
| `TEMPO_RPC_PASSWORD` | Optional RPC auth password |
| `BROWSERBASE_API_KEY` | API key for proxied requests (paid mode) |

Set secrets:
```bash
wrangler secret put BROWSERBASE_API_KEY
wrangler secret put TEMPO_RPC_URL
```

## Adding a New Vendor Integration

Follow these steps to add a new partner API to the payments proxy.

### Step 1: Create the Partner Config

Create a new file in `src/partners/` named after your partner (e.g., `openai.ts`):

```typescript
// src/partners/openai.ts
import type { PartnerConfig } from '../config.js'

/**
 * OpenAI - Pay-per-use LLM access with crypto
 * https://openai.com
 *
 * Brief description of what this partner offers.
 *
 * Pricing: Describe your pricing model
 */
export const openai: PartnerConfig = {
  // === Required Fields ===
  
  name: 'OpenAI',                              // Display name
  slug: 'openai',                              // URL path prefix (lowercase, no spaces)
  upstream: 'https://api.openai.com',          // Base URL of the partner API
  apiKeyEnvVar: 'OPENAI_API_KEY',              // Env var name for your API key
  apiKeyHeader: 'Authorization',               // Header the partner expects
  defaultPrice: '100000',                      // Default price in base units ($0.10)
  asset: '0x20c0000000000000000000000000000001', // Payment token address
  destination: '0x...',                        // Wallet to receive payments
  
  // === Optional Fields ===
  
  apiKeyFormat: 'Bearer {key}',                // Format string (omit if key is sent raw)
  defaultRequiresPayment: true,                // true = all endpoints paid by default
                                               // false = all endpoints free by default
  projectId: 'proj_xxx',                       // Partner-specific project ID (if needed)
  
  // === Endpoint Overrides ===
  endpoints: [
    // Free endpoint (override default)
    { 
      path: '/v1/models', 
      methods: ['GET'], 
      requiresPayment: false,
      description: 'List available models'
    },
    // Paid endpoint with custom price
    { 
      path: '/v1/chat/completions', 
      methods: ['POST'], 
      price: '500000',  // $0.50
      description: 'Chat completions'
    },
    // Path parameters use :param syntax
    { 
      path: '/v1/threads/:id/runs', 
      methods: ['POST'], 
      price: '200000',  // $0.20
      description: 'Run assistant on thread'
    },
  ],
}
```

### Step 2: Register the Partner

Add your partner to `src/partners/index.ts`:

```typescript
import type { PartnerConfig } from '../config.js'
import { browserbase } from './browserbase.js'
import { openai } from './openai.js'  // Add import

export const partners: PartnerConfig[] = [
  browserbase, 
  openai,  // Add to array
]
```

### Step 3: Add the API Key Secret

```bash
# For local development, create a .dev.vars file:
echo "OPENAI_API_KEY=sk-xxx" >> .dev.vars

# For deployed environments:
wrangler secret put OPENAI_API_KEY                    # production
wrangler secret put OPENAI_API_KEY --env preview      # preview
```

### Step 4: Test Your Integration

```bash
# Start the dev server
pnpm dev

# Test a free endpoint (if you have one)
curl http://localhost:8787/openai/v1/models \
  -H "Authorization: Bearer YOUR_KEY"

# Test a paid endpoint (should return 402)
curl http://localhost:8787/openai/v1/chat/completions \
  -X POST \
  -H "Content-Type: application/json" \
  -d '{"model": "gpt-4", "messages": [{"role": "user", "content": "hi"}]}'

# Test with payment
PRIVATE_KEY=0x... pnpm --filter @tempo/paymentauth-client demo \
  POST http://localhost:8787/openai/v1/chat/completions \
  '{"model": "gpt-4", "messages": [{"role": "user", "content": "hi"}]}'
```

### Configuration Reference

#### PartnerConfig Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | ✅ | Display name for the partner |
| `slug` | string | ✅ | URL path prefix (e.g., `openai` → `/openai/*`) |
| `upstream` | string | ✅ | Base URL of the partner API |
| `apiKeyEnvVar` | string | ✅ | Environment variable name for the API key |
| `apiKeyHeader` | string | ✅ | HTTP header name to send the API key |
| `defaultPrice` | string | ✅ | Default price in token base units (6 decimals for USDC) |
| `asset` | Address | ✅ | TIP-20 token contract address |
| `destination` | Address | ✅ | Wallet address to receive payments |
| `apiKeyFormat` | string | | Format string with `{key}` placeholder (e.g., `Bearer {key}`) |
| `defaultRequiresPayment` | boolean | | Whether unlisted endpoints require payment (default: `true`) |
| `projectId` | string | | Partner-specific project/account ID |
| `endpoints` | array | | Endpoint-specific pricing overrides |

#### PartnerEndpoint Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `path` | string | ✅ | Path pattern (supports `:param` for path parameters) |
| `methods` | string[] | ✅ | HTTP methods (e.g., `['GET', 'POST']`) |
| `price` | string | | Price override in base units |
| `requiresPayment` | boolean | | Override default payment requirement |
| `description` | string | | Human-readable description |

#### Pricing Examples

Prices are in the token's smallest unit (6 decimals for USDC/AlphaUSD):

| Amount | Base Units |
|--------|------------|
| $0.01 | `10000` |
| $0.10 | `100000` |
| $1.00 | `1000000` |
| $10.00 | `10000000` |

#### Common Token Addresses

| Token | Network | Address |
|-------|---------|---------|
| AlphaUSD | Tempo Moderato | `0x20c0000000000000000000000000000000000001` |
| USDC | Base | `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` |

### Best Practices

1. **Set `defaultRequiresPayment: false`** if most endpoints should be free pass-through
2. **Use descriptive comments** in your config file explaining the pricing model
3. **Test all endpoint patterns** to ensure path matching works correctly
4. **Document partner-specific quirks** in a comment block at the top of the file
5. **Use path parameters** (`:id`, `:param`) for dynamic route segments

## Development

```bash
# Install dependencies
pnpm install

# Start dev server
pnpm dev

# Type check
pnpm typecheck

# Deploy
pnpm deploy:preview  # Preview environment
pnpm deploy:prod     # Production
```

## API Reference

### `GET /`
Lists available partners and their endpoints.

### `GET /health`
Health check endpoint.

### `ALL /:partner/*`
Proxy endpoint. Routes to the appropriate partner based on the path prefix.

**Free endpoints**: Passes through transparently with client's auth header.

**Paid endpoints**: Returns 402 with payment challenge, accepts payment credential.

### Response Headers (after payment)

| Header | Description |
|--------|-------------|
| `Payment-Receipt` | Base64url-encoded receipt JSON |
| `X-Payment-TxHash` | Transaction hash |
| `X-Payment-BlockNumber` | Block number (if confirmed) |
| `X-Payment-Explorer` | Link to block explorer |
