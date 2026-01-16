# _template

Template app for Tempo AI Payments. Copy this folder to create a new app.

## Quick Start

```bash
# 1. Copy template
cp -r apps/_template apps/my-app

# 2. Update names
# - package.json: change "@tempo/_template" to "@tempo/my-app"
# - wrangler.jsonc: change "_template" to "my-app"

# 3. Install dependencies
pnpm install

# 4. Run locally
pnpm --filter @tempo/my-app dev
```

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
