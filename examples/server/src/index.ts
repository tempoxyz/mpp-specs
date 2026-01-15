import express from "express";
import { paymentAuth } from "./payment-auth.js";

const app = express();
const PORT = process.env.PORT ?? 3000;

const DESTINATION = "0x742d35Cc6634C0532925a3b844Bc9e7595f8fE00";
const USDC_TEMPO = "0x20c0000000000000000000000000000000000000";
const AMOUNT = "1000000"; // 1.00 USDC (6 decimals)

app.get("/api/resource", paymentAuth({
  realm: "api.example.com",
  method: "tempo",
  destination: DESTINATION,
  asset: USDC_TEMPO,
  amount: AMOUNT,
  challengeTtlMs: 5 * 60 * 1000,
}), (req, res) => {
  const authInfo = (req as express.Request & { paymentAuth?: { signer: string } }).paymentAuth;
  res.json({
    message: "Access granted",
    data: {
      timestamp: new Date().toISOString(),
      resource: "premium-content",
    },
    payer: authInfo?.signer,
  });
});

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.listen(PORT, () => {
  console.log(`Payment Auth Example Server running on port ${PORT}`);
  console.log(`\nProtected endpoint: GET http://localhost:${PORT}/api/resource`);
  console.log(`\nTry: curl -i http://localhost:${PORT}/api/resource`);
});
