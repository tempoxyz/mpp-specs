import type { WalletClient, Account, Chain, Transport } from "viem";
import { encodeFunctionData, parseAbi, toHex, keccak256, concat } from "viem";

const TEMPO_CHAIN_ID = 42431;

export interface PaymentChallenge {
  id: string;
  realm: string;
  method: string;
  intent: string;
  request: string;
  expires?: string;
  description?: string;
}

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
  reference?: string;
}

export function parsePaymentChallenge(wwwAuth: string | null): PaymentChallenge {
  if (!wwwAuth) {
    throw new Error("Missing WWW-Authenticate header");
  }

  if (!wwwAuth.startsWith("Payment ")) {
    throw new Error("Invalid authentication scheme, expected 'Payment'");
  }

  const params = wwwAuth.slice(8);
  const result: Record<string, string> = {};

  const regex = /(\w+)="([^"]+)"/g;
  let match;
  while ((match = regex.exec(params)) !== null) {
    result[match[1]] = match[2];
  }

  const required = ["id", "realm", "method", "intent", "request"];
  for (const key of required) {
    if (!result[key]) {
      throw new Error(`Missing required parameter: ${key}`);
    }
  }

  return {
    id: result.id,
    realm: result.realm,
    method: result.method,
    intent: result.intent,
    request: result.request,
    expires: result.expires,
    description: result.description,
  };
}

export function decodeRequest(base64url: string): PaymentRequest {
  const json = Buffer.from(base64url, "base64url").toString("utf-8");
  return JSON.parse(json);
}

export function encodeCredential(credential: PaymentCredential): string {
  const json = JSON.stringify(credential);
  return Buffer.from(json).toString("base64url");
}

export function parseReceipt(header: string | null): PaymentReceipt | null {
  if (!header) return null;
  try {
    const json = Buffer.from(header, "base64url").toString("utf-8");
    return JSON.parse(json);
  } catch {
    return null;
  }
}

const erc20Abi = parseAbi([
  "function transfer(address to, uint256 amount) returns (bool)",
]);

export async function createCredential(
  challenge: PaymentChallenge,
  wallet: WalletClient<Transport, Chain, Account>
): Promise<PaymentCredential> {
  if (challenge.method !== "tempo") {
    throw new Error(`Unsupported payment method: ${challenge.method}`);
  }

  if (challenge.intent !== "charge") {
    throw new Error(`Unsupported payment intent: ${challenge.intent}`);
  }

  const request = decodeRequest(challenge.request);

  if (challenge.expires && new Date(challenge.expires) < new Date()) {
    throw new Error("Challenge has expired");
  }

  const data = encodeFunctionData({
    abi: erc20Abi,
    functionName: "transfer",
    args: [request.destination as `0x${string}`, BigInt(request.amount)],
  });

  const messageHash = keccak256(
    concat([
      toHex(TEMPO_CHAIN_ID),
      request.asset as `0x${string}`,
      data,
    ])
  );

  const signature = await wallet.signMessage({
    account: wallet.account!,
    message: { raw: messageHash },
  });

  const source = `did:pkh:eip155:${TEMPO_CHAIN_ID}:${wallet.account!.address}`;

  return {
    id: challenge.id,
    source,
    payload: {
      type: "transaction",
      signature,
    },
  };
}

export interface FetchWithPaymentOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: BodyInit;
}

export interface FetchWithPaymentResult {
  response: Response;
  receipt: PaymentReceipt | null;
  paid: boolean;
}

export async function fetchWithPayment(
  url: string,
  wallet: WalletClient<Transport, Chain, Account>,
  options: FetchWithPaymentOptions = {}
): Promise<FetchWithPaymentResult> {
  const res = await fetch(url, {
    method: options.method ?? "GET",
    headers: options.headers,
    body: options.body,
  });

  if (res.status !== 402) {
    return {
      response: res,
      receipt: null,
      paid: false,
    };
  }

  const wwwAuth = res.headers.get("WWW-Authenticate");
  const challenge = parsePaymentChallenge(wwwAuth);

  console.log(`[Payment] Received 402 challenge:`);
  console.log(`  Method: ${challenge.method}`);
  console.log(`  Intent: ${challenge.intent}`);
  console.log(`  Realm: ${challenge.realm}`);

  const request = decodeRequest(challenge.request);
  console.log(`  Amount: ${request.amount}`);
  console.log(`  Destination: ${request.destination}`);

  const credential = await createCredential(challenge, wallet);
  const encodedCredential = encodeCredential(credential);

  console.log(`[Payment] Submitting payment credential...`);

  const paidRes = await fetch(url, {
    method: options.method ?? "GET",
    headers: {
      ...options.headers,
      Authorization: `Payment ${encodedCredential}`,
    },
    body: options.body,
  });

  const receipt = parseReceipt(paidRes.headers.get("Payment-Receipt"));

  if (receipt) {
    console.log(`[Payment] Receipt received:`);
    console.log(`  Status: ${receipt.status}`);
    console.log(`  Reference: ${receipt.reference ?? "N/A"}`);
  }

  return {
    response: paidRes,
    receipt,
    paid: true,
  };
}
