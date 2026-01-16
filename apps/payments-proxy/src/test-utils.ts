/**
 * Shared test utilities and mock factories for payments-proxy tests
 */

import type { Context } from "hono";
import type { Address, Hex } from "viem";
import type { Env, PartnerConfig } from "./config.js";

/**
 * Create a mock Hono context for testing
 */
export function createMockContext(
  req: Request,
  env: Env
): Context<{ Bindings: Env }> {
  return {
    req: {
      raw: req,
      url: req.url,
      method: req.method,
      path: new URL(req.url).pathname,
      header: (name: string) => req.headers.get(name) ?? undefined,
    } as any,
    env,
    json: (data: unknown, status?: number) => {
      return new Response(JSON.stringify(data), {
        status: status ?? 200,
        headers: { "Content-Type": "application/json" },
      });
    },
    header: (_name: string, _value: string) => {
      // Mock header setting - in real Hono this modifies response headers
      return undefined as any;
    },
  } as Context<{ Bindings: Env }>;
}

/**
 * Create a mock environment for testing
 */
export function createMockEnv(overrides: Partial<Env> = {}): Env {
  return {
    ENVIRONMENT: "test",
    TEMPO_RPC_URL: "https://rpc.test.com",
    BROWSERBASE_API_KEY: "bb_test_key",
    OPENROUTER_API_KEY: "or_test_key",
    ...overrides,
  };
}

/**
 * Create a mock partner config for testing
 */
export function createMockPartner(
  overrides: Partial<PartnerConfig> = {}
): PartnerConfig {
  return {
    name: "Test Partner",
    slug: "test",
    upstream: "https://api.test.com",
    apiKeyEnvVar: "TEST_API_KEY",
    apiKeyHeader: "Authorization",
    apiKeyFormat: "Bearer {key}",
    defaultPrice: "10000",
    defaultRequiresPayment: true,
    asset: "0x20c0000000000000000000000000000000000001" as Address,
    destination: "0x0aA342d6e4e45D1F6eAE721c4fEf2f61B82f8581" as Address,
    ...overrides,
  };
}

/**
 * Create a mock transaction hash
 */
export function createMockTxHash(): Hex {
  return "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890" as Hex;
}

/**
 * Create a mock address
 */
export function createMockAddress(seed = 1): Address {
  const hex = seed.toString(16).padStart(40, "0");
  return `0x${hex}` as Address;
}

/**
 * Create a mock RPC response
 */
export function createMockRpcResponse(result: unknown, id = 1): Response {
  return new Response(
    JSON.stringify({
      jsonrpc: "2.0",
      id,
      result,
    }),
    {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }
  );
}

/**
 * Create a mock RPC error response
 */
export function createMockRpcError(
  code: number,
  message: string,
  id = 1
): Response {
  return new Response(
    JSON.stringify({
      jsonrpc: "2.0",
      id,
      error: { code, message },
    }),
    {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }
  );
}

/**
 * Create a mock upstream API response
 */
export function createMockUpstreamResponse(
  data: unknown,
  status = 200,
  headers: Record<string, string> = {}
): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
  });
}

/**
 * Extract challenge ID from WWW-Authenticate header
 */
export function extractChallengeId(
  wwwAuth: string | null | undefined
): string | null {
  if (!wwwAuth) return null;
  const match = wwwAuth.match(/id="([^"]+)"/);
  return match ? match[1] ?? null : null;
}

/**
 * Wait for a short delay (useful for testing async behavior)
 */
export function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
