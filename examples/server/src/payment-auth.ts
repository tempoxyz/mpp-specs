import { Request, Response, NextFunction } from "express";
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

export function paymentAuth(config: PaymentAuthConfig) {
  const challengeTtlMs = config.challengeTtlMs ?? 5 * 60 * 1000;

  return async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    const authHeader = req.headers.authorization;

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

      res
        .status(402)
        .set(
          "WWW-Authenticate",
          buildWwwAuthenticateHeader(id, config, request, expires),
        )
        .json({ error: "payment_required", message: "Payment is required" });
      return;
    }

    const credential = parseCredential(authHeader);
    if (!credential) {
      res.status(401).json({ error: "invalid_credentials" });
      return;
    }

    const challenge = challenges.get(credential.id);
    if (!challenge) {
      res.status(401).json({ error: "unknown_challenge" });
      return;
    }

    if (challenge.used) {
      res.status(401).json({ error: "challenge_already_used" });
      return;
    }

    if (new Date() > challenge.expires) {
      challenges.delete(credential.id);
      res.status(401).json({ error: "challenge_expired" });
      return;
    }

    const verification = await verifyTempoSignature(
      credential,
      challenge.request,
    );
    if (!verification.valid) {
      res.status(401).json({ error: "invalid_signature" });
      return;
    }

    challenge.used = true;

    const receipt: PaymentReceipt = {
      status: "success",
      method: config.method,
      timestamp: new Date().toISOString(),
      reference: `tx-${randomBytes(8).toString("hex")}`,
    };

    res.set("Payment-Receipt", base64urlEncode(JSON.stringify(receipt)));

    (req as Request & { paymentAuth: { signer: string } }).paymentAuth = {
      signer: verification.signer ?? "unknown",
    };

    next();
  };
}
