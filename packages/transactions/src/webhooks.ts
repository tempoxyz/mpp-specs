import type { Transaction } from './types'

export type WebhookEventType =
  | 'transaction.created'
  | 'transaction.processing'
  | 'transaction.completed'
  | 'transaction.failed'
  | 'transaction.cancelled'

export interface WebhookEvent {
  id: string
  type: WebhookEventType
  data: Transaction
  createdAt: string
}

interface VerifyWebhookInput {
  payload: string
  signature: string
  timestamp: string
  secret: string
}

/**
 * Verify a webhook signature
 * Uses HMAC-SHA256 for webhook signatures
 */
export async function verifyWebhook(input: VerifyWebhookInput): Promise<boolean> {
  const { payload, signature, timestamp, secret } = input
  
  // Check timestamp to prevent replay attacks
  const webhookTime = parseInt(timestamp, 10)
  const now = Date.now()
  const tolerance = 5 * 60 * 1000 // 5 minutes
  
  if (isNaN(webhookTime) || Math.abs(now - webhookTime) > tolerance) {
    return false
  }
  
  // Compute expected signature
  const signedPayload = `${timestamp}.${payload}`
  
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  
  const expectedSignature = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(signedPayload)
  )
  
  const expectedHex = Array.from(new Uint8Array(expectedSignature))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
  
  // Parse signature header (format: v1=<hex>)
  const signatureMatch = signature.match(/^v1=([a-f0-9]+)$/i)
  if (!signatureMatch) {
    return false
  }
  
  const providedHex = signatureMatch[1].toLowerCase()
  
  // Constant-time comparison
  if (expectedHex.length !== providedHex.length) {
    return false
  }
  
  let result = 0
  for (let i = 0; i < expectedHex.length; i++) {
    result |= expectedHex.charCodeAt(i) ^ providedHex.charCodeAt(i)
  }
  
  return result === 0
}

/**
 * Create a webhook signature for testing
 */
export async function signWebhook(
  payload: string,
  secret: string,
  timestamp?: number
): Promise<{ signature: string; timestamp: string }> {
  const ts = timestamp ?? Date.now()
  const signedPayload = `${ts}.${payload}`
  
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  
  const signatureBytes = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(signedPayload)
  )
  
  const signatureHex = Array.from(new Uint8Array(signatureBytes))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
  
  return {
    signature: `v1=${signatureHex}`,
    timestamp: String(ts)
  }
}
