import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import type { Env } from './config.js'
import { chat } from './routes/chat.js'
import { health } from './routes/health.js'

/**
 * Streaming Demo Worker
 *
 * Demonstrates the Tempo Stream Intent protocol for pay-as-you-go
 * streaming payments, such as LLM token metering.
 */
const app = new Hono<{ Bindings: Env }>()

// Middleware
app.use('*', logger())
app.use(
	'*',
	cors({
		origin: '*',
		allowMethods: ['GET', 'POST', 'HEAD', 'OPTIONS'],
		allowHeaders: ['Authorization', 'Content-Type'],
		exposeHeaders: ['WWW-Authenticate', 'Payment-Receipt', 'X-Request-Id'],
	}),
)

// Request ID middleware
app.use('*', async (c, next) => {
	const requestId = crypto.randomUUID()
	c.header('X-Request-Id', requestId)
	await next()
})

// Root endpoint
app.get('/', (c) => {
	return c.json({
		name: 'Tempo Streaming Demo',
		version: '0.1.0',
		description: 'Demonstrates Tempo Stream Intent for pay-as-you-go streaming payments',
		endpoints: {
			'/health': 'Health check',
			'/chat': 'Protected streaming LLM endpoint (GET, POST, HEAD)',
		},
		documentation: {
			streamIntent: 'https://github.com/tempoxyz/payment-auth-spec/pull/92',
			protocol: 'https://github.com/tempoxyz/payment-auth-spec',
		},
	})
})

// Mount routes
app.route('/', health)
app.route('/', chat)

// Error handling
app.onError((err, c) => {
	console.error('Unhandled error:', err)

	if (err.message === 'Missing Authorization header.') {
		return c.json({ error: 'Authorization required' }, 401)
	}

	return c.json(
		{
			error: 'Internal server error',
			message: err instanceof Error ? err.message : 'Unknown error',
		},
		500,
	)
})

// 404 handler
app.notFound((c) => {
	return c.json(
		{
			error: 'Not found',
			path: c.req.path,
		},
		404,
	)
})

export default app
