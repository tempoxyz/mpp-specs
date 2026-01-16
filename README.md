# Tempo AI Payments

Cloudflare Workers monorepo for Tempo's AI payments infrastructure.

## Quick Start

```bash
# Install dependencies
pnpm install

# Start all apps in development mode
pnpm dev

# Or start a specific app
pnpm --filter @tempo/api dev
```

## Repository Structure

```
apps/
├── api/              # Main API Worker (Hono-based)
├── payments/         # Payment processing Worker
├── webhooks/         # Webhook delivery Worker
└── dashboard/        # Admin dashboard (coming soon)

packages/
├── auth/             # IETF HTTP Message Signatures (RFC 9421)
├── transactions/     # Tempo Transaction SDK
├── shared/           # Shared utilities and types
└── db/               # D1 schema and migrations
```

## Prerequisites

- Node.js 20+
- [pnpm](https://pnpm.io/) 9+
- [Cloudflare account](https://dash.cloudflare.com/sign-up)
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/)

## Setup

### 1. Create D1 Databases

```bash
# Create production database
wrangler d1 create tempo-payments

# Create preview database
wrangler d1 create tempo-payments-preview
```

Update the `database_id` in each app's `wrangler.jsonc` with the IDs returned.

### 2. Create R2 Buckets

```bash
# Create production bucket
wrangler r2 bucket create tempo-receipts

# Create preview bucket
wrangler r2 bucket create tempo-receipts-preview
```

### 3. Run Migrations

```bash
# Local development
pnpm --filter @tempo/db migrate:local

# Preview environment
pnpm --filter @tempo/db migrate:preview

# Production
pnpm --filter @tempo/db migrate:prod
```

### 4. Set Secrets

```bash
# Set secrets for production
wrangler secret put TEMPO_SIGNING_KEY --env production

# Set secrets for preview
wrangler secret put TEMPO_SIGNING_KEY --env preview
```

## Development

```bash
# Start all apps
pnpm dev

# Type checking
pnpm typecheck

# Linting
pnpm lint

# Run tests
pnpm test            # Runs both repo-level tests (vitest) and app tests (turbo)
pnpm test:repo       # Run only repo-level tests
pnpm test:apps       # Run only app tests
```

## Deployment

### Preview Deployments

Push to any non-main branch to trigger preview deployments:
- API: `https://<branch>-tempo-api.tempo-preview.workers.dev`
- Payments: `https://<branch>-tempo-payments.tempo-preview.workers.dev`
- Webhooks: `https://<branch>-tempo-webhooks.tempo-preview.workers.dev`

Or deploy manually:
```bash
pnpm deploy:preview
```

### Production Deployments

```bash
pnpm deploy:prod
```

## Architecture

### Authentication

All API requests are authenticated using [HTTP Message Signatures (RFC 9421)](https://datatracker.ietf.org/doc/rfc9421/). See [AGENTS.md](./AGENTS.md) for implementation details.

### Transaction Flow

```
1. Client → API: Create transaction (POST /api/v1/transactions)
2. API → Payments Worker: Process payment (service binding)
3. Payments Worker → Webhook Queue: Emit event
4. Webhooks Worker → External: Deliver webhooks
```

### Cloudflare Services Used

- **Workers**: Serverless compute for all services
- **D1**: SQLite database for transactions and access keys
- **R2**: Object storage for receipts and documents
- **Durable Objects**: Rate limiting and payment sessions
- **Queues**: Reliable webhook delivery
- **Service Bindings**: Inter-worker communication

## Documentation

- [AGENTS.md](./AGENTS.md) - Agent configuration for AI coding assistants
- [SKILLS.md](./SKILLS.md) - Specialized skills for this codebase

## License

Proprietary - Tempo
