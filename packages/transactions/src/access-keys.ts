import type { Algorithm } from '@tempo/auth'

export type Scope =
  | 'transactions:read'
  | 'transactions:write'
  | 'balance:read'
  | 'webhooks:manage'
  | 'keys:manage'

export interface RateLimit {
  requests: number
  window: '1m' | '1h' | '1d'
}

export interface AccessKey {
  id: string
  name: string
  publicKey: string
  algorithm: Algorithm
  scopes: Scope[]
  rateLimit?: RateLimit
  expiresAt?: string
  createdAt: string
  lastUsedAt?: string
  revokedAt?: string
  metadata?: Record<string, string>
}

export interface CreateAccessKeyInput {
  name: string
  scopes: Scope[]
  rateLimit?: RateLimit
  expiresAt?: Date | string
  metadata?: Record<string, string>
}

interface Env {
  DB: D1Database
}

/**
 * Create a new access key
 * Returns the key with privateKey (only available once)
 */
export async function createAccessKey(
  env: Env,
  input: CreateAccessKeyInput
): Promise<AccessKey & { privateKey: string }> {
  // Generate Ed25519 key pair
  const keyPair = await crypto.subtle.generateKey(
    { name: 'Ed25519' },
    true,
    ['sign', 'verify']
  )
  
  // Export keys
  const publicKeyBuffer = await crypto.subtle.exportKey('spki', keyPair.publicKey)
  const privateKeyBuffer = await crypto.subtle.exportKey('pkcs8', keyPair.privateKey)
  
  const publicKeyBase64 = btoa(String.fromCharCode(...new Uint8Array(publicKeyBuffer)))
  const privateKeyBase64 = btoa(String.fromCharCode(...new Uint8Array(privateKeyBuffer)))
  
  const id = `ak_${crypto.randomUUID().replace(/-/g, '').slice(0, 24)}`
  const now = new Date().toISOString()
  
  const expiresAt = input.expiresAt
    ? (input.expiresAt instanceof Date ? input.expiresAt.toISOString() : input.expiresAt)
    : null
  
  await env.DB.prepare(`
    INSERT INTO access_keys (
      id, name, public_key, algorithm, scopes, rate_limit, 
      expires_at, created_at, metadata
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id,
    input.name,
    publicKeyBase64,
    'ed25519',
    JSON.stringify(input.scopes),
    input.rateLimit ? JSON.stringify(input.rateLimit) : null,
    expiresAt,
    now,
    input.metadata ? JSON.stringify(input.metadata) : null
  ).run()
  
  return {
    id,
    name: input.name,
    publicKey: publicKeyBase64,
    privateKey: privateKeyBase64,
    algorithm: 'ed25519',
    scopes: input.scopes,
    rateLimit: input.rateLimit,
    expiresAt: expiresAt ?? undefined,
    createdAt: now,
    metadata: input.metadata
  }
}

/**
 * Rotate an access key (create new key pair, invalidate old)
 */
export async function rotateAccessKey(
  env: Env,
  keyId: string
): Promise<AccessKey & { privateKey: string }> {
  // Get existing key
  const existing = await env.DB.prepare(`
    SELECT name, scopes, rate_limit, expires_at, metadata
    FROM access_keys
    WHERE id = ? AND revoked_at IS NULL
  `).bind(keyId).first<{
    name: string
    scopes: string
    rate_limit: string | null
    expires_at: string | null
    metadata: string | null
  }>()
  
  if (!existing) {
    throw new Error('Access key not found')
  }
  
  // Revoke old key
  await revokeAccessKey(env, keyId)
  
  // Create new key with same settings
  return createAccessKey(env, {
    name: existing.name,
    scopes: JSON.parse(existing.scopes),
    rateLimit: existing.rate_limit ? JSON.parse(existing.rate_limit) : undefined,
    expiresAt: existing.expires_at ?? undefined,
    metadata: existing.metadata ? JSON.parse(existing.metadata) : undefined
  })
}

/**
 * Revoke an access key
 */
export async function revokeAccessKey(
  env: Env,
  keyId: string
): Promise<void> {
  const now = new Date().toISOString()
  
  await env.DB.prepare(`
    UPDATE access_keys
    SET revoked_at = ?
    WHERE id = ? AND revoked_at IS NULL
  `).bind(now, keyId).run()
}
