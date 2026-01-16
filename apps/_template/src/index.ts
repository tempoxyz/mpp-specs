import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import { HTTPException } from 'hono/http-exception'
import { z } from 'zod'

// Environment bindings type
export interface Env {
  ENVIRONMENT: string
  // Add your bindings here:
  // DB: D1Database
  // BUCKET: R2Bucket
  // KV: KVNamespace
  // RATE_LIMITER: DurableObjectNamespace
}

const app = new Hono<{ Bindings: Env }>()

// Middleware
app.use('*', logger())
app.use('*', cors({
  origin: '*',
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
  exposeHeaders: ['X-Request-Id'],
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

// Example API routes
const api = new Hono<{ Bindings: Env }>()

// Example: List items
api.get('/items', async (c) => {
  // Replace with your logic
  return c.json({
    data: [
      { id: '1', name: 'Item 1' },
      { id: '2', name: 'Item 2' },
    ],
    meta: { count: 2 }
  })
})

// Example: Create item with validation
const CreateItemSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().optional(),
})

api.post('/items', async (c) => {
  const body = await c.req.json()
  const validated = CreateItemSchema.parse(body)
  
  const id = crypto.randomUUID()
  
  // Replace with your logic (e.g., D1 insert)
  // await c.env.DB.prepare('INSERT INTO items (id, name, description) VALUES (?, ?, ?)')
  //   .bind(id, validated.name, validated.description ?? null)
  //   .run()
  
  return c.json({
    data: { id, ...validated }
  }, 201)
})

// Mount API routes
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

// Uncomment if using Durable Objects
// export { RateLimiter } from './durable-objects/rate-limiter'

// Uncomment for scheduled tasks (cron triggers)
// export default {
//   async fetch(request: Request, env: Env, ctx: ExecutionContext) {
//     return app.fetch(request, env, ctx)
//   },
//   async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
//     console.log('Cron triggered:', event.cron)
//     // Your scheduled task logic here
//   }
// }

export default app
