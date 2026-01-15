# HTTP Payment Auth - Example Server

A minimal Express server demonstrating the HTTP Payment Authentication protocol.

## Quick Start

```bash
npm install
npm run dev
```

The server runs on port 3000 by default.

## Endpoints

### GET /api/resource

Protected endpoint requiring payment authentication.

**Without credentials:**

```bash
curl -i http://localhost:3000/api/resource
```

Response:

```http
HTTP/1.1 402 Payment Required
WWW-Authenticate: Payment id="x7Tg2pLqR9...", realm="api.example.com", method="tempo", intent="charge", expires="2025-01-15T12:05:00Z", request="eyJhbW91bnQi..."
```

**With valid credentials:**

```bash
curl -i http://localhost:3000/api/resource \
  -H "Authorization: Payment eyJpZCI6Ing3VGcy..."
```

Response:

```http
HTTP/1.1 200 OK
Payment-Receipt: eyJzdGF0dXMiOiJzdWNjZXNzIiwi...
Content-Type: application/json

{"message":"Access granted","data":{"timestamp":"...","resource":"premium-content"},"payer":"0x..."}
```

## Protocol Flow

1. Client requests `/api/resource` without credentials
2. Server returns `402 Payment Required` with `WWW-Authenticate: Payment` header
3. Client parses challenge, signs payment with wallet
4. Client retries with `Authorization: Payment <credential>`
5. Server verifies signature, returns `200 OK` with `Payment-Receipt` header

## Challenge Parameters

| Parameter | Description |
|-----------|-------------|
| `id` | Unique challenge identifier (128 bits entropy) |
| `realm` | Protection space (`api.example.com`) |
| `method` | Payment method (`tempo`) |
| `intent` | Payment intent (`charge`) |
| `expires` | Challenge expiry timestamp |
| `request` | Base64url-encoded payment request JSON |

## Credential Format

The `Authorization: Payment` header value is a base64url-encoded JSON:

```json
{
  "id": "challenge-id-from-402",
  "source": "did:pkh:eip155:42431:0x...",
  "payload": {
    "type": "transaction",
    "signature": "0x..."
  }
}
```

## Payment Request Schema (Tempo)

```json
{
  "amount": "1000000",
  "asset": "0x20c0000000000000000000000000000000000000",
  "destination": "0x742d35Cc6634C0532925a3b844Bc9e7595f8fE00",
  "expires": "1736150400000"
}
```

## Configuration

Environment variables:

- `PORT` - Server port (default: 3000)

To customize payment parameters, edit `src/index.ts`:

```typescript
app.get("/api/resource", paymentAuth({
  realm: "your-api.com",
  method: "tempo",
  destination: "0x...",  // Your wallet address
  asset: "0x...",        // Token contract address
  amount: "1000000",     // Amount in base units
  challengeTtlMs: 300000 // 5 minutes
}), handler);
```

## Files

- `src/index.ts` - Express server with protected endpoint
- `src/payment-auth.ts` - Payment authentication middleware

## References

- [HTTP Payment Authentication Scheme](../../draft-ietf-httpauth-payment.md)
- [Tempo Payment Method](../../draft-tempo-payment-method.md)
