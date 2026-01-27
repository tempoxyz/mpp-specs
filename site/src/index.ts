import { Hono } from 'hono'
import { basicAuth } from 'hono/basic-auth'

interface Env {
	AUTH_USER: string
	AUTH_PASS: string
	ASSETS: Fetcher
}

const app = new Hono<{ Bindings: Env }>()

app.use(
	'*',
	basicAuth({
		verifyUser: (username, password, c) => {
			return username === c.env.AUTH_USER && password === c.env.AUTH_PASS
		},
	}),
)

app.all('*', async (c) => {
	return c.env.ASSETS.fetch(c.req.raw)
})

export default app
