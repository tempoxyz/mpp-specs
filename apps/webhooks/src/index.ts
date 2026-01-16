import { Hono } from 'hono'

interface Env {
  DB: D1Database
  ENVIRONMENT: string
}

interface WebhookMessage {
  type: string
  transactionId: string
  reason?: string
  timestamp: string
}

interface StoredWebhook {
  id: string
  url: string
  events: string
  secret: string
  status: string
}

const app = new Hono<{ Bindings: Env }>()

// Health check
app.get('/health', (c) => c.json({ status: 'ok', service: 'webhooks' }))

// HTTP handler for the Worker
export default {
  fetch: app.fetch,
  
  // Queue consumer for webhook events
  async queue(batch: MessageBatch<WebhookMessage>, env: Env): Promise<void> {
    for (const message of batch.messages) {
      try {
        await processWebhookEvent(message.body, env)
        message.ack()
      } catch (error) {
        console.error('Failed to process webhook:', error)
        message.retry()
      }
    }
  }
}

async function processWebhookEvent(event: WebhookMessage, env: Env): Promise<void> {
  // Get all active webhooks subscribed to this event type
  const webhooks = await env.DB.prepare(`
    SELECT id, url, events, secret, status
    FROM webhooks
    WHERE status = 'active'
  `).all<StoredWebhook>()
  
  if (!webhooks.results) return
  
  // Get the transaction data
  const tx = await env.DB.prepare(`
    SELECT * FROM transactions WHERE id = ?
  `).bind(event.transactionId).first()
  
  if (!tx) return
  
  const payload = JSON.stringify({
    id: `evt_${crypto.randomUUID().replace(/-/g, '').slice(0, 24)}`,
    type: event.type,
    data: tx,
    createdAt: event.timestamp
  })
  
  // Deliver to each subscribed webhook
  for (const webhook of webhooks.results) {
    const events = JSON.parse(webhook.events) as string[]
    
    if (!events.includes(event.type) && !events.includes('*')) {
      continue
    }
    
    await deliverWebhook(webhook, payload, env)
  }
}

async function deliverWebhook(
  webhook: StoredWebhook,
  payload: string,
  env: Env
): Promise<void> {
  const deliveryId = `del_${crypto.randomUUID().replace(/-/g, '').slice(0, 24)}`
  const timestamp = Date.now()
  
  // Create signature
  const signedPayload = `${timestamp}.${payload}`
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(webhook.secret),
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
  
  try {
    const response = await fetch(webhook.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Tempo-Signature': `v1=${signatureHex}`,
        'Tempo-Timestamp': String(timestamp),
        'Tempo-Delivery-Id': deliveryId
      },
      body: payload
    })
    
    // Record delivery
    await env.DB.prepare(`
      INSERT INTO webhook_deliveries (
        id, webhook_id, event_type, payload, response_status, response_body,
        attempts, delivered_at, created_at
      )
      VALUES (?, ?, ?, ?, ?, ?, 1, datetime('now'), datetime('now'))
    `).bind(
      deliveryId,
      webhook.id,
      JSON.parse(payload).type,
      payload,
      response.status,
      await response.text().catch(() => null)
    ).run()
    
  } catch (error) {
    // Record failed attempt
    const nextAttempt = new Date(Date.now() + 60_000).toISOString() // Retry in 1 min
    
    await env.DB.prepare(`
      INSERT INTO webhook_deliveries (
        id, webhook_id, event_type, payload, attempts, next_attempt_at, created_at
      )
      VALUES (?, ?, ?, ?, 1, ?, datetime('now'))
    `).bind(
      deliveryId,
      webhook.id,
      JSON.parse(payload).type,
      payload,
      nextAttempt
    ).run()
    
    throw error
  }
}
