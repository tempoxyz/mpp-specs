import { Hono } from 'hono'
import type { Env } from '../config.js'

const health = new Hono<{ Bindings: Env }>()

health.get('/health', (c) => {
	return c.json({
		status: 'ok',
		timestamp: new Date().toISOString(),
	})
})

health.get('/ping', (c) => {
	return c.json({
		message: 'pong',
		timestamp: new Date().toISOString(),
	})
})

export { health }
