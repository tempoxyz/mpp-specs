# _template

Template app for Tempo AI Payments. Use `pnpm create-app my-app` to scaffold a new app.

## What It Does

_Describe what your app does here. Include:_
- _The main purpose/functionality_
- _Key endpoints and what they do_
- _Whether endpoints are free or paid_

## Quick Start

```bash
# Run locally
pnpm --filter @tempo/my-app dev
```

## Testing with the Client

_Document how to test your app using the sample client:_

```bash
# Test a free endpoint
pnpm --filter @tempo/paymentauth-client demo GET http://localhost:8787/your-endpoint

# Test a paid endpoint
PRIVATE_KEY=0x... pnpm --filter @tempo/paymentauth-client demo GET http://localhost:8787/your-paid-endpoint
```

Or using the Bash client:

```bash
cd packages/paymentauth-client
PRIVATE_KEY=0x... ./demo.sh GET http://localhost:8787/your-paid-endpoint
```

---

## Features

This template includes:

- **Hono** - Fast, lightweight web framework
- **Zod** - Request validation
- **CORS** - Cross-origin support
- **Request IDs** - For tracing
- **Error handling** - Typed errors with proper responses

## API Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /health` | Health check |
| `GET /api/v1/items` | List items (example) |
| `POST /api/v1/items` | Create item (example) |

## Adding Features

### D1 Database

1. Create database: `wrangler d1 create my-db`
2. Uncomment `d1_databases` in wrangler.jsonc
3. Add `DB: D1Database` to Env interface

### R2 Storage

1. Create bucket: `wrangler r2 bucket create my-bucket`
2. Uncomment `r2_buckets` in wrangler.jsonc
3. Add `BUCKET: R2Bucket` to Env interface

### Durable Objects

1. Uncomment `durable_objects` in wrangler.jsonc
2. Create the class in `src/durable-objects/`
3. Export from `src/index.ts`

### Cron Triggers

1. Add `triggers.crons` to wrangler.jsonc
2. Uncomment the `scheduled` handler in `src/index.ts`

## Deployment

```bash
# Deploy to preview
pnpm --filter @tempo/my-app deploy:preview

# Deploy to production
pnpm --filter @tempo/my-app deploy:prod
```

## Secrets

```bash
# Set secrets
wrangler secret put MY_SECRET --env production
```
