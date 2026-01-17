import { Hono } from 'hono'
import { cors } from 'hono/cors'

interface Env {
	ENVIRONMENT: string
	TEMPO_RPC_URL: string
	ASSETS: Fetcher
}

const app = new Hono<{ Bindings: Env }>()

app.use('*', cors())

// Health check
app.get('/api/health', (c) => {
	return c.json({ status: 'ok', environment: c.env.ENVIRONMENT })
})

// Proxy RPC requests to Tempo
app.post('/api/rpc', async (c) => {
	const body = await c.req.json()
	const response = await fetch(c.env.TEMPO_RPC_URL, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(body),
	})
	return c.json(await response.json())
})

// Get recent blocks with transactions
app.get('/api/blocks', async (c) => {
	const limit = Number(c.req.query('limit') ?? 10)

	// Get latest block number
	const blockNumResponse = await fetch(c.env.TEMPO_RPC_URL, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			jsonrpc: '2.0',
			method: 'eth_blockNumber',
			params: [],
			id: 1,
		}),
	})
	const blockNumResult = (await blockNumResponse.json()) as { result: string }
	const latestBlock = Number.parseInt(blockNumResult.result, 16)

	// Fetch recent blocks
	const blocks = []
	for (let i = 0; i < limit; i++) {
		const blockNumber = latestBlock - i
		if (blockNumber < 0) break

		const blockResponse = await fetch(c.env.TEMPO_RPC_URL, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				jsonrpc: '2.0',
				method: 'eth_getBlockByNumber',
				params: [`0x${blockNumber.toString(16)}`, true],
				id: i + 2,
			}),
		})
		const blockResult = (await blockResponse.json()) as { result: unknown }
		if (blockResult.result) {
			blocks.push(blockResult.result)
		}
	}

	return c.json({ blocks, latestBlock })
})

export default app
