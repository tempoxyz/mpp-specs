import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { paymentAuth } from './payment-auth.js'

interface Env {
	TEMPO_RPC_URL: string
	TEMPO_CHAIN_ID: string
	ALPHA_USD: string
	DESTINATION_ADDRESS: string
}

const app = new Hono<{ Bindings: Env }>()

app.use(
	'*',
	cors({
		origin: '*',
		allowMethods: ['GET', 'POST', 'OPTIONS'],
		allowHeaders: ['Content-Type', 'Authorization'],
		exposeHeaders: ['WWW-Authenticate', 'Payment-Receipt', 'Payment-Authorization'],
		maxAge: 86400,
	})
)

app.get('/health', (c) => c.json({ status: 'ok' }))

app.get('/', (c) => {
	return c.json({
		name: 'Payment Auth Example Server',
		description: 'Cloudflare Worker implementing HTTP Payment Authentication with Tempo',
		endpoints: {
			'/api/weather': {
				method: 'GET',
				description: 'Weather data - costs 0.01 alphaUSD per request',
				price: '0.01 alphaUSD',
			},
			'/health': {
				method: 'GET',
				description: 'Health check (free)',
			},
		},
		documentation: {
			spec: 'https://github.com/tempoxyz/ietf-paymentauth-spec',
			tempo: 'https://docs.tempo.xyz',
		},
	})
})

app.get('/api/weather', async (c, next) => {
	const DESTINATION = c.env.DESTINATION_ADDRESS ?? '0x0000000000000000000000000000000000000001'
	const ALPHA_USD = c.env.ALPHA_USD ?? '0x20c0000000000000000000000000000000000001'
	const RPC_URL = c.env.TEMPO_RPC_URL ?? 'https://rpc.moderato.tempo.xyz'
	const AMOUNT = '10000' // 0.01 alphaUSD (6 decimals)

	const middleware = paymentAuth({
		realm: 'payment-auth-example.tempo.workers.dev',
		destination: DESTINATION,
		asset: ALPHA_USD,
		amount: AMOUNT,
		challengeTtlMs: 5 * 60 * 1000,
		rpcUrl: RPC_URL,
	})

	const result = await middleware(c, next)
	if (result) return result

	const authInfo = c.get('paymentAuth')
	return c.json({
		success: true,
		data: {
			location: 'New York, NY',
			temperature: 72,
			unit: 'fahrenheit',
			conditions: 'Partly cloudy',
			humidity: 45,
			wind: {
				speed: 12,
				direction: 'NW',
			},
			forecast: [
				{ day: 'Tomorrow', high: 75, low: 62, conditions: 'Sunny' },
				{ day: 'Wednesday', high: 68, low: 55, conditions: 'Rain' },
				{ day: 'Thursday', high: 70, low: 58, conditions: 'Cloudy' },
			],
		},
		payment: {
			payer: authInfo?.signer,
			txHash: authInfo?.txHash,
		},
		timestamp: new Date().toISOString(),
	})
})

export default app
