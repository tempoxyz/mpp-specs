import { Hono } from 'hono'
import { basicAuth } from 'hono/basic-auth'

interface Env {
	AUTH_USER: string
	AUTH_PASS: string
	ASSETS: Fetcher
}

const app = new Hono<{ Bindings: Env }>()

app.use('*', async (c, next) => {
	// Skip auth in local dev (no credentials configured)
	if (!c.env.AUTH_USER || !c.env.AUTH_PASS) {
		return next()
	}

	const auth = basicAuth({
		verifyUser: (username, password, ctx) => {
			return username === ctx.env.AUTH_USER && password === ctx.env.AUTH_PASS
		},
	})
	return auth(c, next)
})

app.all('*', async (c) => {
	return c.env.ASSETS.fetch(c.req.raw)
})

export default app
