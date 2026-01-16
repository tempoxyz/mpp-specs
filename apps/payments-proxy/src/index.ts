import {
  type ChargeRequest,
  formatReceipt,
  formatWwwAuthenticate,
  generateChallengeId,
  MalformedProofError,
  type PaymentChallenge,
  type PaymentCredential,
  PaymentExpiredError,
  type PaymentReceipt,
  PaymentRequiredError,
  PaymentVerificationFailedError,
  parseAuthorization,
} from "@tempo/paymentauth-protocol";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { HTTPException } from "hono/http-exception";
import {
  type Address,
  createPublicClient,
  decodeFunctionData,
  type Hex,
  http,
  isAddressEqual,
  parseTransaction,
  recoverTransactionAddress,
  type TransactionSerialized,
} from "viem";
import { tempoModerato } from "viem/chains";
import { Abis, Transaction as TempoTransaction } from "viem/tempo";
import type { Env, PartnerConfig } from "./config.js";
import { getPriceForRequest } from "./config.js";
import { getPartner, partners } from "./partners/index.js";
import { proxyRequest } from "./proxy.js";

// Challenge store (in production, use KV or Durable Objects)
const challengeStore = new Map<
  string,
  {
    challenge: PaymentChallenge<ChargeRequest>;
    used: boolean;
    partner: PartnerConfig;
  }
>();

/**
 * Extract partner slug from hostname subdomain.
 * e.g., "browserbase.payments.tempo.xyz" -> "browserbase"
 * e.g., "browserbase.payments-testnet.tempo.xyz" -> "browserbase"
 * e.g., "browserbase.localhost:8787" -> "browserbase" (for local dev with Host header)
 */
function getPartnerFromHost(host: string): string | null {
  // Remove port if present
  const hostWithoutPort = host.split(":")[0] ?? "";
  const parts = hostWithoutPort.split(".");

  // Skip workers.dev hostnames - they use path-based routing
  // e.g., "payments-proxy-moderato.porto.workers.dev" should use path routing
  if (hostWithoutPort.endsWith(".workers.dev")) {
    return null;
  }

  // For production/preview: partner.payments.tempo.xyz (4+ parts)
  // For local dev with Host header: partner.localhost (2 parts)
  if (parts.length >= 4 && parts[0]) {
    return parts[0];
  }
  if (parts.length === 2 && parts[1] === "localhost" && parts[0]) {
    return parts[0];
  }

  return null;
}

/**
 * Extract partner slug from path prefix (for local development).
 * e.g., "/browserbase/v1/sessions" -> { slug: "browserbase", forwardPath: "/v1/sessions" }
 * Also handles aliases (e.g., "/llm/v1/chat/completions" -> openrouter partner)
 */
function getPartnerFromPath(
  path: string
): { slug: string; forwardPath: string } | null {
  const match = path.match(/^\/([a-z0-9-]+)(\/.*)?$/i);
  if (!match || !match[1]) return null;

  const slugOrAlias = match[1].toLowerCase();
  const forwardPath = match[2] || "/";

  // Check if this is a known partner slug or alias
  const partner = partners.find(
    (p) => p.slug === slugOrAlias || p.aliases?.includes(slugOrAlias)
  );
  if (!partner) return null;

  // Return the canonical slug, not the alias
  return { slug: partner.slug, forwardPath };
}

/**
 * Create a new payment challenge for a partner request.
 */
function createChallenge(
  _env: Env,
  partner: PartnerConfig,
  price: string,
  description?: string
): PaymentChallenge<ChargeRequest> {
  const validityMs = 300_000; // 5 minutes
  const expiresAt = new Date(Date.now() + validityMs);

  const request: ChargeRequest = {
    amount: price,
    asset: partner.asset,
    destination: partner.destination,
    expires: expiresAt.toISOString(),
  };

  const challenge: PaymentChallenge<ChargeRequest> = {
    id: generateChallengeId(),
    realm: `payments-proxy/${partner.slug}`,
    method: "tempo",
    intent: "charge",
    request,
    expires: expiresAt.toISOString(),
    description: description ?? `Pay to access ${partner.name} API`,
  };

  challengeStore.set(challenge.id, { challenge, used: false, partner });

  // Cleanup expired challenges
  for (const [id, entry] of challengeStore) {
    if (
      entry.challenge.expires &&
      new Date(entry.challenge.expires) < new Date()
    ) {
      challengeStore.delete(id);
    }
  }

  return challenge;
}

/**
 * Verify a signed transaction matches the payment challenge.
 */
async function verifyTransaction(
  signedTx: Hex,
  challenge: ChargeRequest
): Promise<{
  valid: boolean;
  error?: string;
  from?: Address;
}> {
  // Try Tempo transaction first
  const tempoResult = await verifyTempoTransaction(signedTx, challenge);
  if (tempoResult.valid) {
    return tempoResult;
  }

  // Fall back to standard transaction
  const standardResult = await verifyStandardTransaction(signedTx, challenge);
  if (standardResult.valid) {
    return standardResult;
  }

  return tempoResult.error?.includes("Failed to parse")
    ? standardResult
    : tempoResult;
}

/**
 * Verify a Tempo (type 0x76) transaction.
 */
async function verifyTempoTransaction(
  signedTx: Hex,
  challenge: ChargeRequest
): Promise<{
  valid: boolean;
  error?: string;
  from?: Address;
}> {
  try {
    const parsed = TempoTransaction.deserialize(signedTx);

    if (!TempoTransaction.isTempo(parsed)) {
      return { valid: false, error: "Transaction is not a Tempo transaction" };
    }

    const tempoTx = parsed as TempoTransaction.TransactionSerializableTempo;

    const call = tempoTx.calls?.[0];
    if (!call) {
      return { valid: false, error: "Transaction has no calls" };
    }

    if (!call.to) {
      return { valid: false, error: 'Transaction call missing "to" field' };
    }

    if (!isAddressEqual(call.to, challenge.asset)) {
      return {
        valid: false,
        error: `Transaction target ${call.to} does not match asset ${challenge.asset}`,
      };
    }

    if (!call.data) {
      return { valid: false, error: "Transaction call missing data" };
    }

    try {
      const decoded = decodeFunctionData({
        abi: Abis.tip20,
        data: call.data,
      });

      if (decoded.functionName !== "transfer") {
        return {
          valid: false,
          error: "Transaction does not call transfer function",
        };
      }

      const [recipient, amount] = decoded.args as [Address, bigint];

      if (!isAddressEqual(recipient, challenge.destination)) {
        return {
          valid: false,
          error: `Transfer recipient ${recipient} does not match destination ${challenge.destination}`,
        };
      }

      const expectedAmount = BigInt(challenge.amount);
      if (amount !== expectedAmount) {
        return {
          valid: false,
          error: `Transfer amount ${amount} does not match expected ${expectedAmount}`,
        };
      }
    } catch (e) {
      return { valid: false, error: `Failed to decode transfer data: ${e}` };
    }

    let from: Address | undefined;
    try {
      from = await recoverTransactionAddress({
        serializedTransaction: signedTx,
        serializer: TempoTransaction.serialize,
      } as Parameters<typeof recoverTransactionAddress>[0]);
    } catch {
      from = (tempoTx as { from?: Address }).from;
    }

    return { valid: true, from };
  } catch (e) {
    return { valid: false, error: `Failed to parse Tempo transaction: ${e}` };
  }
}

/**
 * Verify a standard (legacy/EIP-1559) transaction.
 */
async function verifyStandardTransaction(
  signedTx: Hex,
  challenge: ChargeRequest
): Promise<{
  valid: boolean;
  error?: string;
  from?: Address;
}> {
  try {
    const parsed = parseTransaction(signedTx as TransactionSerialized);

    if (!parsed.to) {
      return { valid: false, error: 'Transaction missing "to" field' };
    }

    if (!isAddressEqual(parsed.to, challenge.asset)) {
      return {
        valid: false,
        error: `Transaction target ${parsed.to} does not match asset ${challenge.asset}`,
      };
    }

    if (!parsed.data) {
      return { valid: false, error: "Transaction missing data" };
    }

    try {
      const decoded = decodeFunctionData({
        abi: Abis.tip20,
        data: parsed.data,
      });

      if (decoded.functionName !== "transfer") {
        return {
          valid: false,
          error: "Transaction does not call transfer function",
        };
      }

      const [recipient, amount] = decoded.args as [Address, bigint];

      if (!isAddressEqual(recipient, challenge.destination)) {
        return {
          valid: false,
          error: `Transfer recipient ${recipient} does not match destination ${challenge.destination}`,
        };
      }

      const expectedAmount = BigInt(challenge.amount);
      if (amount !== expectedAmount) {
        return {
          valid: false,
          error: `Transfer amount ${amount} does not match expected ${expectedAmount}`,
        };
      }
    } catch (e) {
      return { valid: false, error: `Failed to decode transfer data: ${e}` };
    }

    let from: Address | undefined;
    try {
      from = await recoverTransactionAddress({
        serializedTransaction: signedTx as TransactionSerialized,
      });
    } catch {}

    return { valid: true, from };
  } catch (e) {
    return { valid: false, error: `Failed to parse transaction: ${e}` };
  }
}

/**
 * Broadcast a signed transaction to the network.
 */
async function broadcastTransaction(
  signedTx: Hex,
  env: Env
): Promise<
  { success: true; transactionHash: Hex } | { success: false; error: string }
> {
  try {
    let rpcUrl = env.TEMPO_RPC_URL;
    if (env.TEMPO_RPC_USERNAME && env.TEMPO_RPC_PASSWORD) {
      const url = new URL(rpcUrl);
      url.username = env.TEMPO_RPC_USERNAME;
      url.password = env.TEMPO_RPC_PASSWORD;
      rpcUrl = url.toString();
    }

    const response = await fetch(rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "eth_sendRawTransaction",
        params: [signedTx],
      }),
    });

    const data = (await response.json()) as {
      result?: { transactionHash: Hex } | Hex;
      error?: { code: number; message: string; data?: unknown };
    };

    if (data.error) {
      return {
        success: false,
        error: `RPC Error (${data.error.code}): ${
          data.error.message || "Transaction broadcast failed"
        }`,
      };
    }

    const transactionHash =
      typeof data.result === "object" && data.result !== null
        ? data.result.transactionHash
        : data.result;

    if (!transactionHash) {
      return { success: false, error: "No transaction hash returned from RPC" };
    }

    return { success: true, transactionHash };
  } catch (error) {
    return {
      success: false,
      error: `Failed to broadcast transaction: ${
        error instanceof Error ? error.message : "Unknown error"
      }`,
    };
  }
}

/**
 * Wait for transaction confirmation and get block number.
 */
async function getTransactionReceipt(
  txHash: Hex,
  env: Env
): Promise<{ blockNumber: bigint | null }> {
  try {
    let rpcUrl = env.TEMPO_RPC_URL;
    if (env.TEMPO_RPC_USERNAME && env.TEMPO_RPC_PASSWORD) {
      const url = new URL(rpcUrl);
      url.username = env.TEMPO_RPC_USERNAME;
      url.password = env.TEMPO_RPC_PASSWORD;
      rpcUrl = url.toString();
    }

    const client = createPublicClient({
      chain: tempoModerato,
      transport: http(rpcUrl),
    });

    const receipt = await client.waitForTransactionReceipt({
      hash: txHash,
      timeout: 30_000,
    });

    return { blockNumber: receipt.blockNumber };
  } catch {
    return { blockNumber: null };
  }
}

// Create the Hono app
const app = new Hono<{ Bindings: Env }>();

// CORS middleware
app.use("*", cors());

// Request logging middleware
app.use("*", async (c, next) => {
  const start = Date.now();
  console.log(`→ ${c.req.method} ${c.req.path}`);
  await next();
  const ms = Date.now() - start;
  console.log(`← ${c.req.method} ${c.req.path} ${c.res.status} (${ms}ms)`);
});

// Health check
app.get("/health", (c) => {
  return c.json({
    status: "ok",
    environment: c.env.ENVIRONMENT,
    timestamp: new Date().toISOString(),
  });
});

// Root route - simple healthcheck
app.get("/", (c) => {
  return c.text("tm!");
});

// Partner proxy routes (subdomain-based or path-based for local dev)
app.all("/*", async (c) => {
  const host = c.req.header("host") || "";
  let partnerSlug = getPartnerFromHost(host);
  let forwardPath = c.req.path || "/";

  // If no subdomain-based partner, try path-based routing (for local dev)
  if (!partnerSlug) {
    const pathRoute = getPartnerFromPath(forwardPath);
    if (pathRoute) {
      partnerSlug = pathRoute.slug;
      forwardPath = pathRoute.forwardPath;
    }
  }

  if (!partnerSlug) {
    throw new HTTPException(400, {
      message: `Invalid request. Access via partner subdomain (e.g., browserbase.payments.tempo.xyz) or path prefix (e.g., /browserbase/v1/sessions). Available partners: ${partners
        .map((p) => p.slug)
        .join(", ")}`,
    });
  }

  // Look up partner by slug or alias
  const partner = getPartner(partnerSlug);

  if (!partner) {
    throw new HTTPException(404, {
      message: `Unknown partner: ${partnerSlug}. Available: ${partners
        .map((p) => p.slug)
        .join(", ")}`,
    });
  }

  // Get pricing for this request
  const priceInfo = getPriceForRequest(partner, c.req.method, forwardPath);

  // If this endpoint doesn't require payment, use proxy's API key (no payment needed)
  if (!priceInfo.requiresPayment) {
    try {
      const { response: upstreamResponse } = await proxyRequest(
        c,
        partner,
        forwardPath
      );
      return upstreamResponse;
    } catch (error) {
      return c.json(
        {
          error: "Upstream request failed",
          message: error instanceof Error ? error.message : "Unknown error",
        },
        502
      );
    }
  }

  // Endpoint requires payment - extract price info
  const { price, description } = priceInfo;

  // Check for payment authorization
  const authHeader = c.req.header("Authorization");

  if (!authHeader || !authHeader.startsWith("Payment ")) {
    // No payment - issue challenge
    const challenge = createChallenge(
      c.env,
      partner,
      price,
      description ??
        `Pay ${formatPrice(price)} to access ${partner.name} ${
          c.req.method
        } ${forwardPath}`
    );

    c.header("WWW-Authenticate", formatWwwAuthenticate(challenge));
    c.header("Cache-Control", "no-store");

    return c.json(
      new PaymentRequiredError(
        `Payment of ${formatPrice(price)} required to access ${
          partner.name
        } API`
      ).toJSON(),
      402
    );
  }

  // Parse payment credential
  let credential: PaymentCredential;
  try {
    credential = parseAuthorization(authHeader);
  } catch {
    return c.json(
      new MalformedProofError("Invalid Authorization header format").toJSON(),
      400
    );
  }

  // Validate challenge
  const storedChallenge = challengeStore.get(credential.id);
  if (!storedChallenge) {
    c.header(
      "WWW-Authenticate",
      formatWwwAuthenticate(createChallenge(c.env, partner, price))
    );
    return c.json(
      new PaymentVerificationFailedError(
        "Unknown or expired challenge ID"
      ).toJSON(),
      401
    );
  }

  if (storedChallenge.used) {
    c.header(
      "WWW-Authenticate",
      formatWwwAuthenticate(createChallenge(c.env, partner, price))
    );
    return c.json(
      new PaymentVerificationFailedError(
        "Challenge has already been used"
      ).toJSON(),
      401
    );
  }

  if (
    storedChallenge.challenge.expires &&
    new Date(storedChallenge.challenge.expires) < new Date()
  ) {
    challengeStore.delete(credential.id);
    c.header(
      "WWW-Authenticate",
      formatWwwAuthenticate(createChallenge(c.env, partner, price))
    );
    return c.json(
      new PaymentExpiredError("Challenge has expired").toJSON(),
      402
    );
  }

  // Validate payload type
  if (
    !credential.payload ||
    !["transaction", "keyAuthorization"].includes(credential.payload.type)
  ) {
    return c.json(
      new MalformedProofError("Invalid payload type").toJSON(),
      400
    );
  }

  const signedTx = credential.payload.signature as Hex;
  const timestamp = new Date().toISOString();

  // Verify the transaction
  const verification = await verifyTransaction(
    signedTx,
    storedChallenge.challenge.request
  );
  if (!verification.valid) {
    return c.json(
      new PaymentVerificationFailedError(
        verification.error || "Transaction verification failed"
      ).toJSON(),
      400
    );
  }

  // Mark challenge as used
  storedChallenge.used = true;

  // Broadcast the transaction
  const broadcastResult = await broadcastTransaction(signedTx, c.env);

  if (!broadcastResult.success) {
    storedChallenge.used = false;
    return c.json(
      new PaymentVerificationFailedError(
        `Broadcast failed: ${broadcastResult.error}`
      ).toJSON(),
      500
    );
  }

  const txHash = broadcastResult.transactionHash;
  const receiptData = await getTransactionReceipt(txHash, c.env);
  const blockNumber = receiptData.blockNumber;

  // Create payment receipt
  const receipt: PaymentReceipt & { blockNumber?: string } = {
    status: "success",
    method: "tempo",
    timestamp,
    reference: txHash,
  };

  if (blockNumber !== null) {
    receipt.blockNumber = blockNumber.toString();
  }

  // Now proxy the request to the upstream API
  try {
    const { response: upstreamResponse } = await proxyRequest(
      c,
      partner,
      forwardPath
    );

    // Add payment receipt header to the response
    const responseHeaders = new Headers(upstreamResponse.headers);
    responseHeaders.set("Payment-Receipt", formatReceipt(receipt));
    responseHeaders.set("X-Payment-TxHash", txHash);
    if (blockNumber !== null) {
      responseHeaders.set("X-Payment-BlockNumber", blockNumber.toString());
    }
    responseHeaders.set(
      "X-Payment-Explorer",
      `https://explore.tempo.xyz/tx/${txHash}`
    );

    return new Response(upstreamResponse.body, {
      status: upstreamResponse.status,
      statusText: upstreamResponse.statusText,
      headers: responseHeaders,
    });
  } catch (error) {
    // If proxy fails after payment, still return success with error info
    // The payment was already processed
    return c.json(
      {
        error: "Upstream request failed after payment",
        message: error instanceof Error ? error.message : "Unknown error",
        payment: {
          status: "success",
          txHash,
          blockNumber: blockNumber?.toString() || null,
          explorer: `https://explore.tempo.xyz/tx/${txHash}`,
        },
      },
      502
    );
  }
});

/**
 * Format a price in base units to a human-readable string.
 */
function formatPrice(baseUnits: string): string {
  const amount = Number(baseUnits) / 1_000_000;
  return `$${amount.toFixed(2)}`;
}

// Error handling
app.onError((err, c) => {
  if (err instanceof HTTPException) {
    return c.json({ error: err.message }, err.status);
  }

  console.error("Unhandled error:", err);
  return c.json({ error: "Internal server error" }, 500);
});

// 404 handler
app.notFound((c) => {
  return c.json({ error: "Not found" }, 404);
});

export default app;
