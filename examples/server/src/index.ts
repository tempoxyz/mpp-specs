import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { paymentAuth } from "./payment-auth.js";

const app = new Hono();

const DESTINATION = "0x742d35Cc6634C0532925a3b844Bc9e7595f8fE00";
const USDC_TEMPO = "0x20c0000000000000000000000000000000000000";
const AMOUNT = "1000000"; // 1.00 USDC (6 decimals)

const paymentMiddleware = paymentAuth({
  realm: "api.example.com",
  method: "tempo",
  destination: DESTINATION,
  asset: USDC_TEMPO,
  amount: AMOUNT,
  challengeTtlMs: 5 * 60 * 1000,
});

app.get("/api/resource", paymentMiddleware, (c) => {
  const authInfo = c.get("paymentAuth");
  return c.json({
    message: "Access granted",
    data: {
      timestamp: new Date().toISOString(),
      resource: "premium-content",
    },
    payer: authInfo?.signer,
  });
});

app.get("/health", (c) => c.json({ status: "ok" }));

const PORT = Number(process.env.PORT ?? 3000);

console.log(`Payment Auth Example Server running on port ${PORT}`);
console.log(`\nProtected endpoint: GET http://localhost:${PORT}/api/resource`);
console.log(`\nTry: curl -i http://localhost:${PORT}/api/resource`);

serve({ fetch: app.fetch, port: PORT });
