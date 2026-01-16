import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import { HTTPException } from 'hono/http-exception'
import { z } from 'zod'

// Environment bindings type
export interface Env {
  DB: D1Database
  RECEIPTS: R2Bucket
  PAYMENT_SESSION: DurableObjectNamespace
  RATE_LIMITER: DurableObjectNamespace
  PAYMENTS_WORKER: Fetcher
  WEBHOOKS_WORKER: Fetcher
  ENVIRONMENT: string
}

const app = new Hono<{ Bindings: Env }>()

// Middleware
app.use('*', logger())
app.use('*', cors({
  origin: ['https://dashboard.tempo.xyz', 'http://localhost:3000'],
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization', 'Signature', 'Signature-Input', 'Content-Digest'],
  exposeHeaders: ['X-Request-Id'],
  credentials: true
}))

// Request ID middleware
app.use('*', async (c, next) => {
  const requestId = crypto.randomUUID()
  c.header('X-Request-Id', requestId)
  c.set('requestId', requestId)
  await next()
})

// Health check
app.get('/health', (c) => {
  return c.json({
    status: 'ok',
    environment: c.env.ENVIRONMENT,
    timestamp: new Date().toISOString()
  })
})

// API routes
const api = new Hono<{ Bindings: Env }>()

// Transaction schemas
const CreateTransactionSchema = z.object({
  amount: z.number().int().positive(),
  currency: z.string().length(3).toUpperCase(),
  recipient: z.string().min(1),
  memo: z.string().optional(),
  metadata: z.record(z.string()).optional()
})

// List transactions
api.get('/transactions', async (c) => {
  const limit = Math.min(parseInt(c.req.query('limit') ?? '50'), 100)
  const cursor = c.req.query('cursor')
  
  const results = await c.env.DB.prepare(`
    SELECT id, amount, currency, status, sender_id, recipient_id, memo, created_at
    FROM transactions
    ORDER BY created_at DESC
    LIMIT ?
  `).bind(limit).all()
  
  return c.json({
    data: results.results,
    meta: {
      count: results.results?.length ?? 0
    }
  })
})

// Get transaction by ID
api.get('/transactions/:id', async (c) => {
  const id = c.req.param('id')
  
  const tx = await c.env.DB.prepare(`
    SELECT * FROM transactions WHERE id = ?
  `).bind(id).first()
  
  if (!tx) {
    throw new HTTPException(404, { message: 'Transaction not found' })
  }
  
  return c.json({ data: tx })
})

// Create transaction
api.post('/transactions', async (c) => {
  const body = await c.req.json()
  const validated = CreateTransactionSchema.parse(body)
  
  const id = `tx_${crypto.randomUUID().replace(/-/g, '')}`
  const now = new Date().toISOString()
  
  await c.env.DB.prepare(`
    INSERT INTO transactions (id, amount, currency, recipient_id, memo, metadata, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?)
  `).bind(
    id,
    validated.amount,
    validated.currency,
    validated.recipient,
    validated.memo ?? null,
    validated.metadata ? JSON.stringify(validated.metadata) : null,
    now,
    now
  ).run()
  
  return c.json({
    data: {
      id,
      ...validated,
      status: 'pending',
      createdAt: now
    }
  }, 201)
})

app.route('/api/v1', api)

// Error handling
app.onError((err, c) => {
  const requestId = c.get('requestId') as string
  
  if (err instanceof z.ZodError) {
    return c.json({
      error: 'Validation error',
      details: err.errors,
      requestId
    }, 400)
  }
  
  if (err instanceof HTTPException) {
    return c.json({
      error: err.message,
      requestId
    }, err.status)
  }
  
  console.error('Unhandled error:', err)
  return c.json({
    error: 'Internal server error',
    requestId
  }, 500)
})

// 404 handler
app.notFound((c) => {
  return c.json({
    error: 'Not found',
    requestId: c.get('requestId')
  }, 404)
})

// Export Durable Objects
export { PaymentSession } from './durable-objects/payment-session'
export { RateLimiter } from './durable-objects/rate-limiter'

export default app
