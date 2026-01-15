import type { Context, MiddlewareHandler } from "hono";
import { randomBytes } from "crypto";
import { recoverMessageAddress, type Hex } from "viem";

const TEMPO_CHAIN_ID = 42431;

export interface PaymentRequest {
  amount: string;
  asset: string;
  destination: string;
  expires: string;
}

export interface PaymentCredential {
  id: string;
  source?: string;
  payload: {
    type: string;
    signature: string;
  };
}

export interface PaymentReceipt {
  status: "success" | "failed";
  method: string;
  timestamp: string;
  reference: string;
}

export interface ChallengeStore {
  request: PaymentRequest;
  expires: Date;
  used: boolean;
}

const challenges = new Map<string, ChallengeStore>();

export interface PaymentAuthConfig {
  realm: string;
  method: string;
  destination: string;
  asset: string;
  amount: string;
  challengeTtlMs?: number;
}

declare module "hono" {
  interface ContextVariableMap {
    paymentAuth: { signer: string };
  }
}

function base64urlEncode(data: string): string {
  return Buffer.from(data).toString("base64url");
}

function base64urlDecode(data: string): string {
  return Buffer.from(data, "base64url").toString();
}

function generateChallengeId(): string {
  return randomBytes(16).toString("base64url");
}

function buildWwwAuthenticateHeader(
  id: string,
  config: PaymentAuthConfig,
  request: PaymentRequest,
  expires: Date,
): string {
  const requestEncoded = base64urlEncode(JSON.stringify(request));
  return (
    `Payment id="${id}", ` +
    `realm="${config.realm}", ` +
    `method="${config.method}", ` +
    `intent="charge", ` +
    `expires="${expires.toISOString()}", ` +
    `request="${requestEncoded}"`
  );
}

function parseCredential(authHeader: string): PaymentCredential | null {
  if (!authHeader.startsWith("Payment ")) {
    return null;
  }
  try {
    const b64token = authHeader.slice(8);
    const decoded = base64urlDecode(b64token);
    return JSON.parse(decoded) as PaymentCredential;
  } catch {
    return null;
  }
}

async function verifyTempoSignature(
  credential: PaymentCredential,
  request: PaymentRequest,
): Promise<{ valid: boolean; signer?: string }> {
  try {
    const message = JSON.stringify({
      challengeId: credential.id,
      amount: request.amount,
      asset: request.asset,
      destination: request.destination,
    });

    const recoveredAddress = await recoverMessageAddress({
      message,
      signature: credential.payload.signature as Hex,
    });

    if (credential.source) {
      const expectedPrefix = `did:pkh:eip155:${TEMPO_CHAIN_ID}:`;
      if (credential.source.startsWith(expectedPrefix)) {
        const expectedAddress = credential.source.slice(expectedPrefix.length);
        if (recoveredAddress.toLowerCase() !== expectedAddress.toLowerCase()) {
          return { valid: false };
        }
      }
    }

    return { valid: true, signer: recoveredAddress };
  } catch {
    return { valid: false };
  }
}

export function paymentAuth(config: PaymentAuthConfig): MiddlewareHandler {
  const challengeTtlMs = config.challengeTtlMs ?? 5 * 60 * 1000;

  return async (c: Context, next) => {
    const authHeader = c.req.header("Authorization");

    if (!authHeader) {
      const id = generateChallengeId();
      const expires = new Date(Date.now() + challengeTtlMs);
      const request: PaymentRequest = {
        amount: config.amount,
        asset: config.asset,
        destination: config.destination,
        expires: expires.getTime().toString(),
      };

      challenges.set(id, { request, expires, used: false });

      return c.json(
        { error: "payment_required", message: "Payment is required" },
        402,
        {
          "WWW-Authenticate": buildWwwAuthenticateHeader(id, config, request, expires),
          "Cache-Control": "no-store",
        },
      );
    }

    const credential = parseCredential(authHeader);
    if (!credential) {
      return c.json({ error: "invalid_credentials" }, 401);
    }

    const challenge = challenges.get(credential.id);
    if (!challenge) {
      return c.json({ error: "unknown_challenge" }, 401);
    }

    if (challenge.used) {
      return c.json({ error: "challenge_already_used" }, 401);
    }

    if (new Date() > challenge.expires) {
      challenges.delete(credential.id);
      return c.json({ error: "challenge_expired" }, 401);
    }

    const verification = await verifyTempoSignature(credential, challenge.request);
    if (!verification.valid) {
      return c.json({ error: "invalid_signature" }, 401);
    }

    challenge.used = true;

    const receipt: PaymentReceipt = {
      status: "success",
      method: config.method,
      timestamp: new Date().toISOString(),
      reference: `tx-${randomBytes(8).toString("hex")}`,
    };

    c.header("Payment-Receipt", base64urlEncode(JSON.stringify(receipt)));
    c.header("Cache-Control", "private");
    c.set("paymentAuth", { signer: verification.signer ?? "unknown" });

    await next();
  };
}
