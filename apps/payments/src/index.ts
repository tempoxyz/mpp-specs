import {
	type ChargeRequest,
	formatReceipt,
	formatWwwAuthenticate,
	MalformedProofError,
	type PaymentChallenge,
	type PaymentCredential,
	PaymentExpiredError,
	type PaymentReceipt,
	PaymentRequiredError,
	PaymentVerificationFailedError,
	parseAuthorization,
} from '@tempo/paymentauth-protocol-legacy'
import { calculateRequestPrice } from '@tempo/shared'
import { type Context, Hono } from 'hono'
import { cors } from 'hono/cors'
import { HTTPException } from 'hono/http-exception'
import {
	type Address,
	createPublicClient,
	decodeFunctionData,
	type Hex,
	http,
	isAddressEqual,
	parseTransaction,
	recoverTransactionAddress,
	type TransactionSerialized,
} from 'viem'
import { tempoModerato } from 'viem/chains'
import { Abis, Transaction as TempoTransaction } from 'viem/tempo'
import type { Env, PartnerConfig } from './config.js'
import { debug, getPriceForRequest } from './config.js'
import { getPartner, partners } from './partners/index.js'
import { proxyRequest } from './proxy.js'
import {
	closeChannel,
	createStreamChallenge,
	formatStreamChallenge,
	formatStreamReceipt,
	parseStreamCredential,
	verifyChannelOpen,
	verifyCloseRequest,
	verifyVoucher,
} from './streaming.js'

// Stateless challenge: encode challenge data + HMAC in the ID itself
// Replay protection comes from on-chain tx nonce uniqueness
const CHALLENGE_SECRET = 'tempo-payments-challenge-v1' // Could move to env var

async function signChallenge(data: string): Promise<string> {
	const encoder = new TextEncoder()
	const key = await crypto.subtle.importKey(
		'raw',
		encoder.encode(CHALLENGE_SECRET),
		{ name: 'HMAC', hash: 'SHA-256' },
		false,
		['sign'],
	)
	const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(data))
	return btoa(String.fromCharCode(...new Uint8Array(signature))).replace(/[+/=]/g, (c) =>
		c === '+' ? '-' : c === '/' ? '_' : '',
	)
}

async function verifyChallenge(
	id: string,
): Promise<
	{ valid: true; data: { partnerSlug: string; price: string; expires: string } } | { valid: false }
> {
	try {
		const [dataPart, sig] = id.split('.')
		if (!dataPart || !sig) return { valid: false }
		const data = JSON.parse(atob(dataPart.replace(/-/g, '+').replace(/_/g, '/')))
		const expectedSig = await signChallenge(dataPart)
		if (sig !== expectedSig) return { valid: false }
		return { valid: true, data }
	} catch {
		return { valid: false }
	}
}

/**
 * Extract partner slug from hostname subdomain.
 * e.g., "browserbase.payments.tempo.xyz" -> "browserbase"
 * e.g., "browserbase.localhost:8787" -> "browserbase" (for local dev)
 */
function getPartnerFromHost(host: string): string | null {
	const hostWithoutPort = host.split(':')[0] ?? ''
	const parts = hostWithoutPort.split('.')

	// Skip workers.dev hostnames - they use path-based routing
	// e.g., "payments-moderato.porto.workers.dev" should use path routing
	if (hostWithoutPort.endsWith('.workers.dev')) {
		return null
	}

	// Skip IP addresses (e.g., 127.0.0.1, 192.168.1.1) - use path-based routing
	if (/^\d+\.\d+\.\d+\.\d+$/.test(hostWithoutPort)) {
		return null
	}

	// For production/preview: partner.payments.tempo.xyz (4+ parts)
	// For local dev with Host header: partner.localhost (2 parts)
	if (parts.length >= 4 && parts[0]) {
		return parts[0]
	}
	// Local dev: partner.localhost (2 parts)
	if (parts.length === 2 && parts[1] === 'localhost' && parts[0]) {
		return parts[0]
	}

	return null
}

/**
 * Create a new payment challenge for a partner request.
 * Challenge ID is a signed token containing all data needed for stateless verification.
 */
async function createChallenge(
	_env: Env,
	partner: PartnerConfig,
	price: string,
	description?: string,
): Promise<PaymentChallenge<ChargeRequest>> {
	const validityMs = 300_000 // 5 minutes
	const expiresAt = new Date(Date.now() + validityMs)

	const request: ChargeRequest = {
		amount: price,
		asset: partner.asset,
		destination: partner.destination,
		expires: expiresAt.toISOString(),
	}

	// Encode challenge data in the ID for stateless verification
	// Include 128-bit random nonce per IETF spec requirement (Section 5.1.1)
	const nonceBytes = new Uint8Array(16)
	crypto.getRandomValues(nonceBytes)
	const nonce = btoa(String.fromCharCode(...nonceBytes)).replace(/[+/=]/g, (c) =>
		c === '+' ? '-' : c === '/' ? '_' : '',
	)
	const challengeData = {
		partnerSlug: partner.slug,
		price,
		expires: expiresAt.toISOString(),
		nonce, // 128-bit entropy for unpredictability
	}
	const dataPart = btoa(JSON.stringify(challengeData)).replace(/[+/=]/g, (c) =>
		c === '+' ? '-' : c === '/' ? '_' : '',
	)
	const sig = await signChallenge(dataPart)
	const statelessId = `${dataPart}.${sig}`

	const challenge: PaymentChallenge<ChargeRequest> = {
		id: statelessId,
		realm: `payments/${partner.slug}`,
		method: 'tempo',
		intent: 'charge',
		request,
		expires: expiresAt.toISOString(),
		description: description ?? `Pay to access ${partner.name} API`,
	}

	return challenge
}

/**
 * Verify a signed transaction matches the payment challenge.
 */
async function verifyTransaction(
	signedTx: Hex,
	challenge: ChargeRequest,
): Promise<{
	valid: boolean
	error?: string
	from?: Address
}> {
	// Try Tempo transaction first
	const tempoResult = await verifyTempoTransaction(signedTx, challenge)
	if (tempoResult.valid) {
		return tempoResult
	}

	// Fall back to standard transaction
	const standardResult = await verifyStandardTransaction(signedTx, challenge)
	if (standardResult.valid) {
		return standardResult
	}

	return tempoResult.error?.includes('Failed to parse') ? standardResult : tempoResult
}

/**
 * Verify a Tempo (type 0x76) transaction.
 */
async function verifyTempoTransaction(
	signedTx: Hex,
	challenge: ChargeRequest,
): Promise<{
	valid: boolean
	error?: string
	from?: Address
}> {
	try {
		const parsed = TempoTransaction.deserialize(signedTx)

		if (!TempoTransaction.isTempo(parsed)) {
			return { valid: false, error: 'Transaction is not a Tempo transaction' }
		}

		const tempoTx = parsed as TempoTransaction.TransactionSerializableTempo

		const call = tempoTx.calls?.[0]
		if (!call) {
			return { valid: false, error: 'Transaction has no calls' }
		}

		if (!call.to) {
			return { valid: false, error: 'Transaction call missing "to" field' }
		}

		if (!isAddressEqual(call.to, challenge.asset)) {
			return {
				valid: false,
				error: `Transaction target ${call.to} does not match asset ${challenge.asset}`,
			}
		}

		if (!call.data) {
			return { valid: false, error: 'Transaction call missing data' }
		}

		try {
			const decoded = decodeFunctionData({
				abi: Abis.tip20,
				data: call.data,
			})

			if (decoded.functionName !== 'transfer') {
				return {
					valid: false,
					error: 'Transaction does not call transfer function',
				}
			}

			const [recipient, amount] = decoded.args as [Address, bigint]

			if (!isAddressEqual(recipient, challenge.destination)) {
				return {
					valid: false,
					error: `Transfer recipient ${recipient} does not match destination ${challenge.destination}`,
				}
			}

			const expectedAmount = BigInt(challenge.amount)
			if (amount !== expectedAmount) {
				return {
					valid: false,
					error: `Transfer amount ${amount} does not match expected ${expectedAmount}`,
				}
			}
		} catch (e) {
			return { valid: false, error: `Failed to decode transfer data: ${e}` }
		}

		let from: Address | undefined
		try {
			from = await recoverTransactionAddress({
				serializedTransaction: signedTx,
				serializer: TempoTransaction.serialize,
			} as Parameters<typeof recoverTransactionAddress>[0])
		} catch {
			from = (tempoTx as { from?: Address }).from
		}

		return { valid: true, from }
	} catch (e) {
		return { valid: false, error: `Failed to parse Tempo transaction: ${e}` }
	}
}

/**
 * Verify a standard (legacy/EIP-1559) transaction.
 */
async function verifyStandardTransaction(
	signedTx: Hex,
	challenge: ChargeRequest,
): Promise<{
	valid: boolean
	error?: string
	from?: Address
}> {
	try {
		const parsed = parseTransaction(signedTx as TransactionSerialized)

		if (!parsed.to) {
			return { valid: false, error: 'Transaction missing "to" field' }
		}

		if (!isAddressEqual(parsed.to, challenge.asset)) {
			return {
				valid: false,
				error: `Transaction target ${parsed.to} does not match asset ${challenge.asset}`,
			}
		}

		if (!parsed.data) {
			return { valid: false, error: 'Transaction missing data' }
		}

		try {
			const decoded = decodeFunctionData({
				abi: Abis.tip20,
				data: parsed.data,
			})

			if (decoded.functionName !== 'transfer') {
				return {
					valid: false,
					error: 'Transaction does not call transfer function',
				}
			}

			const [recipient, amount] = decoded.args as [Address, bigint]

			if (!isAddressEqual(recipient, challenge.destination)) {
				return {
					valid: false,
					error: `Transfer recipient ${recipient} does not match destination ${challenge.destination}`,
				}
			}

			const expectedAmount = BigInt(challenge.amount)
			if (amount !== expectedAmount) {
				return {
					valid: false,
					error: `Transfer amount ${amount} does not match expected ${expectedAmount}`,
				}
			}
		} catch (e) {
			return { valid: false, error: `Failed to decode transfer data: ${e}` }
		}

		let from: Address | undefined
		try {
			from = await recoverTransactionAddress({
				serializedTransaction: signedTx as TransactionSerialized,
			})
		} catch {}

		return { valid: true, from }
	} catch (e) {
		return { valid: false, error: `Failed to parse transaction: ${e}` }
	}
}

/**
 * Broadcast a signed transaction to the network.
 */
async function broadcastTransaction(
	signedTx: Hex,
	env: Env,
): Promise<{ success: true; transactionHash: Hex } | { success: false; error: string }> {
	try {
		debug(env, 'broadcast', 'Sending eth_sendRawTransaction', {
			signedTx: `${signedTx.slice(0, 20)}...`,
		})

		const response = await fetch(env.TEMPO_RPC_URL, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				jsonrpc: '2.0',
				id: 1,
				method: 'eth_sendRawTransaction',
				params: [signedTx],
			}),
		})

		const data = (await response.json()) as {
			result?: { transactionHash: Hex } | Hex
			error?: { code: number; message: string; data?: unknown }
		}

		debug(env, 'broadcast', 'RPC response', data)

		if (data.error) {
			debug(env, 'broadcast', 'RPC error', data.error)
			return {
				success: false,
				error: `RPC Error (${data.error.code}): ${
					data.error.message || 'Transaction broadcast failed'
				}`,
			}
		}

		const transactionHash =
			typeof data.result === 'object' && data.result !== null
				? data.result.transactionHash
				: data.result

		if (!transactionHash) {
			debug(env, 'broadcast', 'No transaction hash in response')
			return { success: false, error: 'No transaction hash returned from RPC' }
		}

		debug(env, 'broadcast', 'Transaction broadcast successful', { transactionHash })
		return { success: true, transactionHash }
	} catch (error) {
		return {
			success: false,
			error: `Failed to broadcast transaction: ${
				error instanceof Error ? error.message : 'Unknown error'
			}`,
		}
	}
}

/**
 * Wait for transaction confirmation and get block number.
 */
async function getTransactionReceipt(
	txHash: Hex,
	env: Env,
): Promise<{ blockNumber: bigint | null }> {
	try {
		const client = createPublicClient({
			chain: tempoModerato,
			transport: http(env.TEMPO_RPC_URL),
		})

		const receipt = await client.waitForTransactionReceipt({
			hash: txHash,
			timeout: 30_000,
		})

		return { blockNumber: receipt.blockNumber }
	} catch {
		return { blockNumber: null }
	}
}

// Create the Hono app
const app = new Hono<{ Bindings: Env }>()

// CORS middleware
app.use('*', cors())

// Request logging middleware
app.use('*', async (c, next) => {
	const start = Date.now()
	console.log(`→ ${c.req.method} ${c.req.path} [${c.req.header('host')}]`)
	await next()
	const ms = Date.now() - start
	console.log(`← ${c.req.method} ${c.req.path} ${c.res.status} (${ms}ms)`)
	// Debug: prove which worker handled the request
	c.res.headers.set('X-Payments-Worker', 'payments-v2')
	c.res.headers.set('X-Payments-Host', c.req.header('host') || 'unknown')
	c.res.headers.set('X-Payments-Time', String(Date.now()))
})

// Health check
app.get('/health', (c) => {
	return c.json({
		status: 'ok',
		environment: c.env.ENVIRONMENT,
		timestamp: new Date().toISOString(),
	})
})

// === Dashboard API routes (for payments.tempo.xyz root domain) ===

// Dashboard health check
app.get('/api/health', (c) => {
	return c.json({ status: 'ok', environment: c.env.ENVIRONMENT })
})

// Dashboard RPC proxy
app.post('/api/rpc', async (c) => {
	const body = await c.req.json()
	const response = await fetch(c.env.TEMPO_RPC_URL, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(body),
	})
	return c.json(await response.json())
})

// Get recent blocks with transactions (for dashboard)
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

/**
 * Check if this request is for the dashboard (root domain, not a partner subdomain)
 */
function isDashboardRequest(host: string): boolean {
	const hostWithoutPort = host.split(':')[0] ?? ''
	if (hostWithoutPort.endsWith('.workers.dev')) return false
	const parts = hostWithoutPort.split('.')
	// payments.tempo.xyz = 3 parts, but NOT openrouter.payments.tempo.xyz (4+ parts)
	if (parts.length === 3 && parts[0] === 'payments') return true
	// localhost:8787 without subdomain
	if (parts.length === 1 && parts[0] === 'localhost') return true
	return false
}

// Root route - serve dashboard or simple healthcheck
app.get('/', async (c) => {
	const host = c.req.header('host') || ''
	if (isDashboardRequest(host) && c.env.ASSETS) {
		return c.env.ASSETS.fetch(c.req.raw)
	}
	return c.text('tm!')
})

// Discovery API - list all available services
// Support both /discover and /directory paths
const discoverHandler = (c: Context<{ Bindings: Env }>) => {
	const host = c.req.header('host') || 'payments.tempo.xyz'
	const protocol = host.includes('localhost') ? 'http' : 'https'

	// Build service URLs using partner subdomain
	// e.g., payments.tempo.xyz -> openrouter.payments.tempo.xyz
	const services = partners.map((partner) => {
		const serviceUrl = `${protocol}://${partner.slug}.${host}`

		return {
			name: partner.name,
			slug: partner.slug,
			aliases: partner.aliases || [],
			url: serviceUrl,
			pricing: {
				default: partner.defaultPrice,
				asset: partner.asset,
				destination: partner.destination,
				endpoints: partner.endpoints?.map((ep) => ({
					path: ep.path,
					methods: ep.methods,
					price: ep.price,
					requiresPayment: ep.requiresPayment ?? partner.defaultRequiresPayment,
					description: ep.description,
				})),
			},
			streaming: partner.streaming
				? {
						supported: true,
						escrowContract: partner.streaming.escrowContract,
						defaultDeposit: partner.streaming.defaultDeposit,
					}
				: { supported: false },
		}
	})

	return c.json({
		version: '1.0',
		environment: c.env.ENVIRONMENT,
		timestamp: new Date().toISOString(),
		services,
	})
}

app.get('/discover', discoverHandler)
app.get('/directory', discoverHandler)

// Get specific service info
const discoverSlugHandler = (c: Context<{ Bindings: Env }>) => {
	const slug = c.req.param('slug')
	const partner = getPartner(slug)

	if (!partner) {
		throw new HTTPException(404, { message: `Unknown service: ${slug}` })
	}

	const host = c.req.header('host') || 'payments.tempo.xyz'
	const protocol = host.includes('localhost') ? 'http' : 'https'

	const serviceUrl = host.includes('localhost')
		? `${protocol}://${host}/${partner.slug}`
		: `${protocol}://${partner.slug}.${host}`

	return c.json({
		name: partner.name,
		slug: partner.slug,
		aliases: partner.aliases || [],
		url: serviceUrl,
		pricing: {
			default: partner.defaultPrice,
			asset: partner.asset,
			destination: partner.destination,
			endpoints: partner.endpoints?.map((ep) => ({
				path: ep.path,
				methods: ep.methods,
				price: ep.price,
				requiresPayment: ep.requiresPayment ?? partner.defaultRequiresPayment,
				dynamicPricing: ep.dynamicPricing,
				description: ep.description,
			})),
		},
		streaming: partner.streaming
			? {
					supported: true,
					escrowContract: partner.streaming.escrowContract,
					defaultDeposit: partner.streaming.defaultDeposit,
					minVoucherDelta: partner.streaming.minVoucherDelta,
				}
			: { supported: false },
	})
}

app.get('/discover/:slug', discoverSlugHandler)
app.get('/directory/:slug', discoverSlugHandler)

// Voucher submission endpoint for streaming channels
app.post('/:partner/voucher', async (c) => {
	const partnerSlug = c.req.param('partner')
	const partner = getPartner(partnerSlug)

	if (!partner) {
		throw new HTTPException(404, { message: `Unknown partner: ${partnerSlug}` })
	}

	if (!partner.streaming) {
		throw new HTTPException(400, {
			message: `Partner ${partnerSlug} does not support streaming channels`,
		})
	}

	const body = await c.req.json()
	const credential = parseStreamCredential(body)

	if (!credential) {
		throw new HTTPException(400, { message: 'Invalid stream credential' })
	}

	// Handle channel opening
	if (credential.action === 'open') {
		const result = await verifyChannelOpen(c.env, partner, credential, partner.streaming)
		if (!result.valid) {
			throw new HTTPException(400, { message: result.error })
		}

		return c.json({
			status: 'ok',
			channelId: result.channelId,
			deposit: result.state.deposit.toString(),
			remaining: result.state.deposit.toString(),
		})
	}

	// Handle voucher submission
	if (credential.action === 'voucher') {
		const result = await verifyVoucher(c.env, partner, credential, partner.streaming, 0n)
		if (!result.valid) {
			throw new HTTPException(400, { message: result.error })
		}

		const remaining = result.state.deposit - result.state.highestVoucherAmount

		return c.json({
			status: 'ok',
			channelId: credential.channelId,
			cumulativeAmount: result.state.highestVoucherAmount.toString(),
			remaining: remaining.toString(),
			newPayment: result.newPayment.toString(),
		})
	}

	// Handle close requests
	if (credential.action === 'close') {
		const verifyResult = await verifyCloseRequest(c.env, partner, credential, partner.streaming)
		if (!verifyResult.valid) {
			throw new HTTPException(400, { message: verifyResult.error })
		}

		const closeResult = await closeChannel(c.env, partner, partner.streaming, credential.channelId)
		if (!closeResult.success) {
			throw new HTTPException(503, { message: closeResult.error })
		}

		return c.json({
			status: 'ok',
			channelId: credential.channelId,
			txHash: closeResult.txHash,
			settledToPayee: closeResult.settledToPayee.toString(),
			refundedToPayer: closeResult.refundedToPayer.toString(),
			...(closeResult.alreadyClosed ? { alreadyClosed: true } : {}),
		})
	}

	throw new HTTPException(400, {
		message: `Unsupported action: ${(credential as { action: string }).action}`,
	})
})

// Partner proxy routes (subdomain-based only)
app.all('/*', async (c) => {
	// Prefer X-Forwarded-Host for local dev (Vite rewrites Host header)
	const host = c.req.header('x-forwarded-host') || c.req.header('host') || ''
	console.log('🔀 Catch-all route hit', { host, path: c.req.path, method: c.req.method })
	const partnerSlug = getPartnerFromHost(host)
	const forwardPath = c.req.path || '/'

	if (!partnerSlug) {
		throw new HTTPException(400, {
			message: `Invalid request. Access via partner subdomain (e.g., browserbase.payments.tempo.xyz). Available partners: ${partners
				.map((p) => p.slug)
				.join(', ')}`,
		})
	}

	// Look up partner by slug or alias
	const partner = getPartner(partnerSlug)

	if (!partner) {
		throw new HTTPException(404, {
			message: `Unknown partner: ${partnerSlug}. Available: ${partners
				.map((p) => p.slug)
				.join(', ')}`,
		})
	}

	// Get pricing for this request
	const priceInfo = getPriceForRequest(partner, c.req.method, forwardPath)

	// If this endpoint doesn't require payment, use proxy's API key (no payment needed)
	if (!priceInfo.requiresPayment) {
		try {
			const { response: upstreamResponse } = await proxyRequest(c, partner, forwardPath)
			return upstreamResponse
		} catch (error) {
			return c.json(
				{
					error: 'Upstream request failed',
					message: error instanceof Error ? error.message : 'Unknown error',
				},
				502,
			)
		}
	}

	// Check for payment authorization
	const authHeader = c.req.header('Authorization')

	// Read the body early - it may become unavailable after async operations
	// (transaction broadcast, receipt waiting, etc.)
	let preReadBody: ArrayBuffer | null = null
	let requestBody: unknown = null
	if (c.req.method !== 'GET' && c.req.method !== 'HEAD') {
		preReadBody = await c.req.raw.clone().arrayBuffer()
		// Try to parse as JSON for dynamic pricing
		try {
			const textDecoder = new TextDecoder()
			requestBody = JSON.parse(textDecoder.decode(preReadBody))
		} catch {
			// Not JSON - that's fine, we'll use default pricing
		}
	}

	// Calculate price - use dynamic pricing if configured, otherwise use static price
	let price: string
	const { description } = priceInfo
	if (priceInfo.dynamicPricing) {
		// Dynamic pricing based on model and token estimation
		const dynamicPrice = calculateRequestPrice(requestBody)
		price = dynamicPrice.toString()
	} else {
		// Static pricing from endpoint config
		price = priceInfo.price ?? partner.defaultPrice
	}

	if (!authHeader || !authHeader.startsWith('Payment ')) {
		// No payment - issue challenge(s)
		const challenge = await createChallenge(
			c.env,
			partner,
			price,
			description ??
				`Pay ${formatPrice(price)} to access ${partner.name} ${c.req.method} ${forwardPath}`,
		)

		// If partner supports streaming, put stream challenge FIRST so Python's urllib sees it
		// (Python's headers.get() only returns the first value for multi-value headers)
		if (partner.streaming) {
			const host = c.req.header('host') || 'payments.tempo.xyz'
			const protocol = host.includes('localhost') ? 'http' : 'https'
			const voucherBase = `${protocol}://${host}`
			const streamChallenge = createStreamChallenge(c.env, partner, partner.streaming, voucherBase)
			c.header('WWW-Authenticate', formatStreamChallenge(streamChallenge))
			c.header('WWW-Authenticate', formatWwwAuthenticate(challenge), { append: true })
		} else {
			c.header('WWW-Authenticate', formatWwwAuthenticate(challenge))
		}

		c.header('Cache-Control', 'no-store')

		return c.json(
			new PaymentRequiredError(
				`Payment of ${formatPrice(price)} required to access ${partner.name} API`,
			).toJSON(),
			402,
		)
	}

	// Parse payment credential
	let credential: PaymentCredential
	try {
		credential = parseAuthorization(authHeader)
	} catch {
		return c.json(new MalformedProofError('Invalid Authorization header format').toJSON(), 400)
	}

	// Validate challenge (stateless - decode and verify signature from ID)
	const challengeResult = await verifyChallenge(credential.id)
	if (!challengeResult.valid) {
		c.header(
			'WWW-Authenticate',
			formatWwwAuthenticate(await createChallenge(c.env, partner, price)),
		)
		return c.json(
			new PaymentVerificationFailedError('Unknown or expired challenge ID').toJSON(),
			401,
		)
	}

	// Verify challenge matches current request context
	if (challengeResult.data.partnerSlug !== partner.slug) {
		c.header(
			'WWW-Authenticate',
			formatWwwAuthenticate(await createChallenge(c.env, partner, price)),
		)
		return c.json(new PaymentVerificationFailedError('Challenge partner mismatch').toJSON(), 401)
	}

	// Check expiry
	if (new Date(challengeResult.data.expires) < new Date()) {
		c.header(
			'WWW-Authenticate',
			formatWwwAuthenticate(await createChallenge(c.env, partner, price)),
		)
		return c.json(new PaymentExpiredError('Challenge has expired').toJSON(), 402)
	}

	// Validate payload type
	if (!credential.payload) {
		return c.json(new MalformedProofError('Missing payload').toJSON(), 400)
	}

	// Handle stream voucher payments
	const streamCred = parseStreamCredential(credential.payload)
	if (streamCred && partner.streaming) {
		// Verify the voucher covers the required payment
		const requiredAmount = BigInt(price)
		const voucherResult = await verifyVoucher(
			c.env,
			partner,
			streamCred,
			partner.streaming,
			requiredAmount,
		)

		if (!voucherResult.valid) {
			return c.json(new PaymentVerificationFailedError(voucherResult.error).toJSON(), 400)
		}

		// Stream payment successful - proxy the request
		try {
			const { response: upstreamResponse } = await proxyRequest(c, partner, forwardPath, {
				preReadBody,
			})

			// Add stream payment receipt
			const responseHeaders = new Headers(upstreamResponse.headers)
			const remaining = voucherResult.state.deposit - voucherResult.state.highestVoucherAmount
			responseHeaders.set(
				'Payment-Receipt',
				formatStreamReceipt(
					streamCred.channelId,
					voucherResult.state.highestVoucherAmount,
					remaining,
				),
			)
			responseHeaders.set('X-Payment-ChannelId', streamCred.channelId)
			responseHeaders.set('X-Payment-Remaining', remaining.toString())

			return new Response(upstreamResponse.body, {
				status: upstreamResponse.status,
				statusText: upstreamResponse.statusText,
				headers: responseHeaders,
			})
		} catch (error) {
			console.error(`[stream-voucher] Proxy error:`, error)
			return c.json(
				{
					error: 'Upstream request failed after payment',
					message: error instanceof Error ? error.message : 'Unknown error',
					payment: {
						status: 'success',
						channelId: streamCred.channelId,
						cumulativeAmount: voucherResult.state.highestVoucherAmount.toString(),
					},
				},
				502,
			)
		}
	}

	// Handle transaction-based payments
	if (!['transaction', 'keyAuthorization'].includes(credential.payload.type)) {
		return c.json(new MalformedProofError('Invalid payload type').toJSON(), 400)
	}

	const signedTx = credential.payload.signature as Hex
	const timestamp = new Date().toISOString()

	// Reconstruct challenge request from stateless data for verification
	const expectedRequest: ChargeRequest = {
		amount: challengeResult.data.price,
		asset: partner.asset,
		destination: partner.destination,
		expires: challengeResult.data.expires,
	}

	// Verify the transaction
	const verification = await verifyTransaction(signedTx, expectedRequest)
	if (!verification.valid) {
		return c.json(
			new PaymentVerificationFailedError(
				verification.error || 'Transaction verification failed',
			).toJSON(),
			400,
		)
	}

	// No need to mark as used - replay protection comes from on-chain tx nonce

	// Broadcast the transaction
	const broadcastResult = await broadcastTransaction(signedTx, c.env)

	if (!broadcastResult.success) {
		return c.json(
			new PaymentVerificationFailedError(`Broadcast failed: ${broadcastResult.error}`).toJSON(),
			500,
		)
	}

	const txHash = broadcastResult.transactionHash
	const receiptData = await getTransactionReceipt(txHash, c.env)
	const blockNumber = receiptData.blockNumber

	// Create payment receipt
	const receipt: PaymentReceipt & { blockNumber?: string } = {
		status: 'success',
		method: 'tempo',
		timestamp,
		reference: txHash,
	}

	if (blockNumber !== null) {
		receipt.blockNumber = blockNumber.toString()
	}

	// Now proxy the request to the upstream API
	try {
		const { response: upstreamResponse } = await proxyRequest(c, partner, forwardPath, {
			preReadBody,
		})

		// Add payment receipt header to the response
		const responseHeaders = new Headers(upstreamResponse.headers)
		responseHeaders.set('Payment-Receipt', formatReceipt(receipt))
		responseHeaders.set('X-Payment-TxHash', txHash)
		if (blockNumber !== null) {
			responseHeaders.set('X-Payment-BlockNumber', blockNumber.toString())
		}
		responseHeaders.set('X-Payment-Explorer', `https://explore.tempo.xyz/tx/${txHash}`)

		return new Response(upstreamResponse.body, {
			status: upstreamResponse.status,
			statusText: upstreamResponse.statusText,
			headers: responseHeaders,
		})
	} catch (error) {
		// If proxy fails after payment, still return success with error info
		// The payment was already processed
		return c.json(
			{
				error: 'Upstream request failed after payment',
				message: error instanceof Error ? error.message : 'Unknown error',
				payment: {
					status: 'success',
					txHash,
					blockNumber: blockNumber?.toString() || null,
					explorer: `https://explore.tempo.xyz/tx/${txHash}`,
				},
			},
			502,
		)
	}
})

/**
 * Format a price in base units to a human-readable string.
 */
function formatPrice(baseUnits: string): string {
	const amount = Number(baseUnits) / 1_000_000
	return `$${amount.toFixed(2)}`
}

// Error handling
app.onError((err, c) => {
	if (err instanceof HTTPException) {
		return c.json({ error: err.message }, err.status)
	}

	console.error('Unhandled error:', err, 'Stack:', err instanceof Error ? err.stack : 'N/A')
	return c.json({ error: 'Internal server error' }, 500)
})

// 404 handler - serve dashboard assets for SPA routes, or return JSON 404
app.notFound(async (c) => {
	const host = c.req.header('host') || ''
	// If on dashboard domain and ASSETS binding exists, try to serve static assets
	if (isDashboardRequest(host) && c.env.ASSETS) {
		// For SPA routing, serve index.html for HTML requests
		const accept = c.req.header('accept') || ''
		if (accept.includes('text/html')) {
			const indexRequest = new Request(new URL('/', c.req.url), c.req.raw)
			return c.env.ASSETS.fetch(indexRequest)
		}
		// Try to serve the asset directly
		return c.env.ASSETS.fetch(c.req.raw)
	}
	return c.json({ error: 'Not found' }, 404)
})

export default app
