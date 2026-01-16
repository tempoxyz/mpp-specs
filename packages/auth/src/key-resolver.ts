import type { Algorithm, PublicKeyInfo } from './types'

export interface KeyResolver {
  resolve: (keyId: string) => Promise<PublicKeyInfo | null>
}

interface StoredKey {
  id: string
  public_key: string
  algorithm: string
  revoked_at: string | null
}

/**
 * Tempo-specific key resolver that looks up keys from D1
 */
export class TempoKeyResolver implements KeyResolver {
  constructor(private db: D1Database) {}
  
  async resolve(keyId: string): Promise<PublicKeyInfo | null> {
    const key = await this.db.prepare(`
      SELECT id, public_key, algorithm, revoked_at
      FROM access_keys
      WHERE id = ? AND revoked_at IS NULL
    `).bind(keyId).first<StoredKey>()
    
    if (!key) {
      return null
    }
    
    return {
      keyId: key.id,
      publicKey: key.public_key,
      algorithm: key.algorithm as Algorithm
    }
  }
}

/**
 * In-memory key resolver for testing
 */
export class InMemoryKeyResolver implements KeyResolver {
  private keys = new Map<string, PublicKeyInfo>()
  
  addKey(keyId: string, publicKey: string, algorithm: Algorithm = 'ed25519'): void {
    this.keys.set(keyId, { keyId, publicKey, algorithm })
  }
  
  removeKey(keyId: string): void {
    this.keys.delete(keyId)
  }
  
  async resolve(keyId: string): Promise<PublicKeyInfo | null> {
    return this.keys.get(keyId) ?? null
  }
}
