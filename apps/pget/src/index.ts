import { Hono } from 'hono'

export interface Env {
	ENVIRONMENT: string
	ASSETS: Fetcher
}

const app = new Hono<{ Bindings: Env }>()

// Purl binary bucket name used for back compat 
// This binary is really named pget.
const R2_INSTALL_SCRIPT_URL = 'https://purl-binaries.tempo.xyz/install.sh'

// Proxy install script from R2 (single source of truth in pget repo)
app.get('/install.sh', async (_c) => {
	const response = await fetch(R2_INSTALL_SCRIPT_URL)
	if (!response.ok) {
		return new Response('Failed to fetch install script', { status: 502 })
	}
	return new Response(response.body, {
		headers: {
			'Content-Type': 'text/plain; charset=utf-8',
			'Cache-Control': 'public, max-age=60',
		},
	})
})

// Health check
app.get('/health', (c) => {
	return c.json({
		status: 'ok',
		environment: c.env.ENVIRONMENT,
	})
})

// Serve static assets for all other routes (React SPA)
app.get('*', async (c) => {
	if (!c.env.ASSETS) {
		return c.text('Assets not configured', 500)
	}
	// Try to serve the exact path first
	const response = await c.env.ASSETS.fetch(c.req.raw)
	if (response.status !== 404) {
		return response
	}
	// For SPA routes, serve index.html
	const indexRequest = new Request(new URL('/', c.req.url), c.req.raw)
	return c.env.ASSETS.fetch(indexRequest)
})

export default app
