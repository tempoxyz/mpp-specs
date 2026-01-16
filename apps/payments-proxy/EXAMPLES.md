# Payments Proxy - Client Examples

The payments proxy lets you access partner APIs on a pay-per-use basis. Access partner APIs via subdomains or path prefixes.

## How It Works

- **Free endpoints**: Requests pass through transparently with the proxy's API key
- **Paid endpoints**: Returns 402, you pay via the protocol, then the request proceeds

---

## Quick Reference

| Partner     | Proxy Base URL (Local)                    | Proxy Base URL (Testnet)                          | Proxy Base URL (Mainnet)                 | Upstream API                    |
|-------------|-------------------------------------------|---------------------------------------------------|------------------------------------------|---------------------------------|
| Browserbase | `http://localhost:8787/browserbase`       | `https://browserbase.payments.testnet.tempo.xyz`  | `https://browserbase.payments.tempo.xyz` | `https://api.browserbase.com`   |
| OpenRouter  | `http://localhost:8787/openrouter`        | `https://openrouter.payments.testnet.tempo.xyz`   | `https://openrouter.payments.tempo.xyz`  | `https://openrouter.ai/api`     |
| Firecrawl   | `http://localhost:8787/firecrawl`         | `https://firecrawl.payments.testnet.tempo.xyz`    | `https://firecrawl.payments.tempo.xyz`   | `https://api.firecrawl.dev`     |

**Local Development:**
```bash
# Path-based routing (recommended for local dev)
curl http://localhost:8787/browserbase/v1/sessions
curl http://localhost:8787/openrouter/v1/models
curl http://localhost:8787/firecrawl/v1/crawl/test-id

# Host header routing (for production-like testing)
curl -H "Host: browserbase.localhost" http://localhost:8787/v1/sessions
```

---

## Test Credentials

These well-known test private keys can be used for development and testing. **Never use these on mainnet or with real funds.**

| Name | Private Key | Address |
|------|-------------|---------|
| Test Account #0 (Hardhat/Anvil) | `0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80` | `0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266` |
| Test Account #1 (Hardhat/Anvil) | `0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d` | `0x70997970C51812dc3A010C7d01b50e0d17dc79C8` |
| Test Account #2 (Hardhat/Anvil) | `0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a` | `0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC` |

---

## Quick Start Examples

Copy-paste ready examples using Test Account #0. Set the private key once:

```bash
export PRIVATE_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
```

---

## 1. Browserbase Examples

Browserbase provides headless browser sessions for web automation.

### Free Endpoints (curl)

```bash
# List all sessions
curl -s http://localhost:8787/browserbase/v1/sessions | jq .

# Get session details
curl -s http://localhost:8787/browserbase/v1/sessions/SESSION_ID | jq .

# List projects
curl -s http://localhost:8787/browserbase/v1/projects | jq .
```

### Paid Endpoints (demo.sh)

```bash
cd packages/paymentauth-client

# Create a browser session ($0.12)
PRIVATE_KEY=$PRIVATE_KEY ./demo.sh POST http://localhost:8787/browserbase/v1/sessions \
  -d '{"projectId":"0dad8d6f-deea-4d37-8087-c63b4b878b3a"}'

# Create session with verbose output
PRIVATE_KEY=$PRIVATE_KEY ./demo.sh POST http://localhost:8787/browserbase/v1/sessions \
  -d '{"projectId":"0dad8d6f-deea-4d37-8087-c63b4b878b3a"}' --verbose
```

### Paid Endpoints (TypeScript demo)

```bash
cd packages/paymentauth-client

# Create a browser session ($0.12)
PRIVATE_KEY=$PRIVATE_KEY pnpm demo POST http://localhost:8787/browserbase/v1/sessions \
  -d '{"projectId":"0dad8d6f-deea-4d37-8087-c63b4b878b3a"}'
```

### Pricing

| Endpoint | Method | Price |
|----------|--------|-------|
| `/v1/sessions` | GET | Free |
| `/v1/sessions` | POST | $0.12 |
| `/v1/sessions/:id` | GET | Free |
| `/v1/sessions/:id` | DELETE | Free |
| `/v1/sessions/:id/extend` | POST | $0.12 |

---

## 2. OpenRouter Examples

OpenRouter provides access to 100+ LLMs through a unified API.

### Free Endpoints (curl)

```bash
# List available models
curl -s http://localhost:8787/openrouter/v1/models | jq '.data[0:3]'

# Get model details
curl -s http://localhost:8787/openrouter/v1/models/openai/gpt-4o-mini | jq .
```

### Paid Endpoints (demo.sh)

```bash
cd packages/paymentauth-client

# Chat completion ($0.01)
PRIVATE_KEY=$PRIVATE_KEY ./demo.sh POST http://localhost:8787/openrouter/v1/chat/completions \
  -d '{"model":"openai/gpt-4o-mini","messages":[{"role":"user","content":"Hello! What is 2+2?"}]}'

# Chat completion with verbose output
PRIVATE_KEY=$PRIVATE_KEY ./demo.sh POST http://localhost:8787/openrouter/v1/chat/completions \
  -d '{"model":"openai/gpt-4o-mini","messages":[{"role":"user","content":"Hello!"}]}' --verbose
```

### Paid Endpoints (TypeScript demo)

```bash
cd packages/paymentauth-client

# Chat completion ($0.01)
PRIVATE_KEY=$PRIVATE_KEY pnpm demo POST http://localhost:8787/openrouter/v1/chat/completions \
  -d '{"model":"openai/gpt-4o-mini","messages":[{"role":"user","content":"Hello! What is 2+2?"}]}'
```

### Using the LLM Alias

OpenRouter can also be accessed via the `/llm` path prefix:

```bash
# These are equivalent:
curl -s http://localhost:8787/openrouter/v1/models | jq .
curl -s http://localhost:8787/llm/v1/models | jq .
```

### Pricing

| Endpoint | Method | Price |
|----------|--------|-------|
| `/v1/models` | GET | Free |
| `/v1/models/:id` | GET | Free |
| `/v1/chat/completions` | POST | $0.01 |

---

## 3. Firecrawl Examples

Firecrawl turns websites into LLM-ready data through scraping, crawling, and extraction.

### Free Endpoints (curl)

```bash
# Check crawl status (free)
curl -s http://localhost:8787/firecrawl/v1/crawl/CRAWL_ID | jq .
```

### Paid Endpoints (demo.sh)

```bash
cd packages/paymentauth-client

# Scrape a single URL ($0.01)
PRIVATE_KEY=$PRIVATE_KEY ./demo.sh POST http://localhost:8787/firecrawl/v1/scrape \
  -d '{"url":"https://example.com"}'

# Crawl a website ($0.05)
PRIVATE_KEY=$PRIVATE_KEY ./demo.sh POST http://localhost:8787/firecrawl/v1/crawl \
  -d '{"url":"https://example.com","limit":10}'

# Map website URLs ($0.01)
PRIVATE_KEY=$PRIVATE_KEY ./demo.sh POST http://localhost:8787/firecrawl/v1/map \
  -d '{"url":"https://example.com"}'

# Search the web ($0.02)
PRIVATE_KEY=$PRIVATE_KEY ./demo.sh POST http://localhost:8787/firecrawl/v1/search \
  -d '{"query":"AI payments"}'

# Extract structured data ($0.03)
PRIVATE_KEY=$PRIVATE_KEY ./demo.sh POST http://localhost:8787/firecrawl/v1/extract \
  -d '{"url":"https://example.com","schema":{"type":"object","properties":{"title":{"type":"string"}}}}'
```

### Paid Endpoints (TypeScript demo)

```bash
cd packages/paymentauth-client

# Scrape a single URL ($0.01)
PRIVATE_KEY=$PRIVATE_KEY pnpm demo POST http://localhost:8787/firecrawl/v1/scrape \
  -d '{"url":"https://example.com"}'

# Crawl a website ($0.05)
PRIVATE_KEY=$PRIVATE_KEY pnpm demo POST http://localhost:8787/firecrawl/v1/crawl \
  -d '{"url":"https://example.com","limit":10}'
```

### Pricing

| Endpoint | Method | Price |
|----------|--------|-------|
| `/v1/scrape` | POST | $0.01 |
| `/v1/crawl` | POST | $0.05 |
| `/v1/crawl/:id` | GET | Free |
| `/v1/map` | POST | $0.01 |
| `/v1/search` | POST | $0.02 |
| `/v1/extract` | POST | $0.03 |

---

## 4. Testnet Examples

For testnet, use the `*.payments.testnet.tempo.xyz` subdomain URLs:

### Browserbase (Testnet)

```bash
cd packages/paymentauth-client

# Free: List sessions
./demo.sh GET https://browserbase.payments.testnet.tempo.xyz/v1/sessions

# Paid: Create session
PRIVATE_KEY=$PRIVATE_KEY ./demo.sh POST https://browserbase.payments.testnet.tempo.xyz/v1/sessions \
  -d '{"projectId":"0dad8d6f-deea-4d37-8087-c63b4b878b3a"}'
```

### OpenRouter (Testnet)

```bash
cd packages/paymentauth-client

# Free: List models
./demo.sh GET https://openrouter.payments.testnet.tempo.xyz/v1/models

# Paid: Chat completion
PRIVATE_KEY=$PRIVATE_KEY ./demo.sh POST https://openrouter.payments.testnet.tempo.xyz/v1/chat/completions \
  -d '{"model":"openai/gpt-4o-mini","messages":[{"role":"user","content":"Hello!"}]}'
```

### Firecrawl (Testnet)

```bash
cd packages/paymentauth-client

# Paid: Scrape a URL
PRIVATE_KEY=$PRIVATE_KEY ./demo.sh POST https://firecrawl.payments.testnet.tempo.xyz/v1/scrape \
  -d '{"url":"https://example.com"}'

# Paid: Crawl a website
PRIVATE_KEY=$PRIVATE_KEY ./demo.sh POST https://firecrawl.payments.testnet.tempo.xyz/v1/crawl \
  -d '{"url":"https://example.com","limit":10}'
```

---

## 5. Mainnet Examples

For mainnet/production, use the `*.payments.tempo.xyz` subdomain URLs:

### Browserbase (Mainnet)

```bash
cd packages/paymentauth-client

# Free: List sessions
./demo.sh GET https://browserbase.payments.tempo.xyz/v1/sessions

# Paid: Create session
PRIVATE_KEY=$PRIVATE_KEY ./demo.sh POST https://browserbase.payments.tempo.xyz/v1/sessions \
  -d '{"projectId":"0dad8d6f-deea-4d37-8087-c63b4b878b3a"}'
```

### OpenRouter (Mainnet)

```bash
cd packages/paymentauth-client

# Free: List models
./demo.sh GET https://openrouter.payments.tempo.xyz/v1/models

# Paid: Chat completion
PRIVATE_KEY=$PRIVATE_KEY ./demo.sh POST https://openrouter.payments.tempo.xyz/v1/chat/completions \
  -d '{"model":"openai/gpt-4o-mini","messages":[{"role":"user","content":"Hello!"}]}'
```

### Firecrawl (Mainnet)

```bash
cd packages/paymentauth-client

# Paid: Scrape a URL
PRIVATE_KEY=$PRIVATE_KEY ./demo.sh POST https://firecrawl.payments.tempo.xyz/v1/scrape \
  -d '{"url":"https://example.com"}'

# Paid: Crawl a website
PRIVATE_KEY=$PRIVATE_KEY ./demo.sh POST https://firecrawl.payments.tempo.xyz/v1/crawl \
  -d '{"url":"https://example.com","limit":10}'
```

---

## 6. Understanding the 402 Flow

When you hit a paid endpoint without payment, you'll receive a `402 Payment Required` response:

```bash
curl -i -X POST http://localhost:8787/openrouter/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"model":"openai/gpt-4o-mini","messages":[{"role":"user","content":"hi"}]}'
```

Response:
```http
HTTP/1.1 402 Payment Required
WWW-Authenticate: Payment id="abc123", realm="payments-proxy/openrouter", method="tempo", 
  intent="charge", request="eyJhbW91bnQiOiIxMDAwMCIsImFzc2V0Ijoi..."
Content-Type: application/json

{"error":"payment_required","message":"Payment of $0.01 required to access OpenRouter API"}
```

The `request` parameter is base64url-encoded JSON containing:
```json
{
  "amount": "10000",
  "asset": "0x20c0000000000000000000000000000000000001",
  "destination": "0x0aA342d6e4e45D1F6eAE721c4fEf2f61B82f8581",
  "expires": "2026-01-16T12:05:00.000Z"
}
```

The demo scripts handle this flow automatically by:
1. Making the initial request
2. Parsing the 402 challenge
3. Signing a payment transaction
4. Retrying with the `Authorization: Payment <credential>` header

---

## 7. Using the Demo Scripts

### Bash Script (demo.sh)

Requires: Foundry (cast), curl, jq, bc

```bash
cd packages/paymentauth-client

# Basic usage
PRIVATE_KEY=0x... ./demo.sh <METHOD> <URL> [-d <data>] [-H <header>] [--verbose]

# Examples
./demo.sh GET http://localhost:8787/browserbase/v1/sessions
PRIVATE_KEY=0x... ./demo.sh POST http://localhost:8787/firecrawl/v1/scrape -d '{"url":"https://example.com"}'
```

### TypeScript Demo (demo.ts)

```bash
cd packages/paymentauth-client

# Basic usage
PRIVATE_KEY=0x... pnpm demo <METHOD> <URL> [-d <data>] [-H <header>] [--verbose]

# Examples
pnpm demo GET http://localhost:8787/openrouter/v1/models
PRIVATE_KEY=0x... pnpm demo POST http://localhost:8787/openrouter/v1/chat/completions \
  -d '{"model":"openai/gpt-4o-mini","messages":[{"role":"user","content":"Hello!"}]}'
```

---

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PRIVATE_KEY` | Wallet private key (0x-prefixed hex) | Required for paid endpoints |
| `TEMPO_RPC_URL` | Tempo RPC endpoint | `https://rpc.moderato.tempo.xyz` |

---

## Error Responses

### 402 Payment Required
```json
{
  "error": "payment_required",
  "message": "Payment of $0.01 required to access OpenRouter API"
}
```

### 400 Malformed Payment
```json
{
  "error": "malformed_proof",
  "message": "Invalid Authorization header format"
}
```

### 401 Invalid Payment
```json
{
  "error": "payment_verification_failed", 
  "message": "Unknown or expired challenge ID"
}
```

### 502 Upstream Failed (after payment)
```json
{
  "error": "Upstream request failed after payment",
  "message": "Connection refused",
  "payment": {
    "status": "success",
    "txHash": "0x...",
    "explorer": "https://explore.tempo.xyz/tx/0x..."
  }
}
```

---

## Full Pricing Reference

### Browserbase
| Endpoint | Method | Price |
|----------|--------|-------|
| `/v1/sessions` | GET | Free |
| `/v1/sessions` | POST | $0.12 |
| `/v1/sessions/:id` | GET | Free |
| `/v1/sessions/:id` | DELETE | Free |
| `/v1/sessions/:id/extend` | POST | $0.12 |

### OpenRouter
| Endpoint | Method | Price |
|----------|--------|-------|
| `/v1/models` | GET | Free |
| `/v1/models/:id` | GET | Free |
| `/v1/chat/completions` | POST | $0.01 |

### Firecrawl
| Endpoint | Method | Price |
|----------|--------|-------|
| `/v1/scrape` | POST | $0.01 |
| `/v1/crawl` | POST | $0.05 |
| `/v1/crawl/:id` | GET | Free |
| `/v1/map` | POST | $0.01 |
| `/v1/search` | POST | $0.02 |
| `/v1/extract` | POST | $0.03 |
