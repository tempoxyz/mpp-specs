import { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import { Credential } from 'mpay'
import { type Config, type Env, parseConfig } from '../config.js'
import { createStreamReceipt, serializeStreamReceipt } from '../stream/Receipt.js'
import { InMemoryStorage } from '../storage/memory.js'
import type { ChannelStorage } from '../stream/Storage.js'
import { createPaymentHandler } from '../stream/server/Method.js'
import type { StreamCredentialPayload } from '../stream/Types.js'

// Global in-memory storage (would be Durable Objects in production)
const globalStorage = new InMemoryStorage()

/**
 * Get stream request parameters from config.
 */
function getStreamRequest(config: Config) {
	return {
		amount: config.pricePerToken.toString(),
		unitType: 'llm_token',
		currency: config.alphaUsd,
		recipient: config.destinationAddress,
		suggestedDeposit: (config.pricePerToken * 1000n).toString(),
		escrowContract: config.escrowContract,
		chainId: config.chainId,
	}
}

/**
 * Create chat routes with dependency injection.
 */
export function createChatRoutes(storage?: ChannelStorage) {
	const chat = new Hono<{ Bindings: Env }>()
	const storageInstance = storage ?? globalStorage

	// Track active streams per challengeId to prevent concurrent streams
	const activeStreams = new Set<string>()

	// Cache payment handler per realm to avoid re-creating on every request
	let cachedPayment: ReturnType<typeof createPaymentHandler> | null = null
	let cachedRealm: string | null = null

	function getPaymentHandler(config: Config) {
		if (cachedPayment && cachedRealm === config.realm) return cachedPayment
		cachedPayment = createPaymentHandler(config, storageInstance)
		cachedRealm = config.realm
		return cachedPayment
	}

	/**
	 * GET /chat - Streaming LLM endpoint with payment
	 *
	 * Flow:
	 * 1. No auth → 402 with stream challenge (via Mpay.create())
	 * 2. Auth with valid credential → 200 with SSE stream
	 */
	chat.get('/chat', async (c) => {
		const hostHeader = c.req.header('Host') ?? new URL(c.req.url).host
		const config = parseConfig(c.env, hostHeader)
		const isHeadRequest = c.req.method === 'HEAD'
		const prompt = c.req.query('prompt') ?? 'Hello!'

		const payment = getPaymentHandler(config)

		// Use the stream intent handler
		const result = await payment.stream(getStreamRequest(config))(c.req.raw)

		// 402 - Return challenge
		if (result.status === 402) {
			return result.challenge as Response
		}

		// 200 - Payment verified
		// For HEAD requests (top-up/close), return receipt from the result
		if (isHeadRequest) {
			return result.withReceipt(new Response(null, { status: 200 }))
		}

		// Extract session info from credential
		const authHeader = c.req.header('Authorization')
		if (!authHeader) {
			return c.json({ error: 'Missing authorization' }, 401)
		}

		const credential = Credential.deserialize<StreamCredentialPayload>(authHeader)
		const challengeId = credential.challenge.id
		const payload = credential.payload

		// Get session for balance tracking
		const session = await storageInstance.getSession(challengeId)
		if (!session) {
			return c.json({ error: 'Session not found' }, 400)
		}

		// Check available balance
		const availableBalance = session.acceptedCumulative - session.spent
		if (availableBalance <= 0n) {
			return c.json(
				{
					error: 'Insufficient balance',
					acceptedCumulative: session.acceptedCumulative.toString(),
					spent: session.spent.toString(),
				},
				402,
			)
		}

		// Enforce at most one active stream per challengeId
		if (activeStreams.has(challengeId)) {
			return c.json({ error: 'Stream already active for this session' }, 409)
		}
		activeStreams.add(challengeId)

		// Stream response with live metering
		return streamSSE(c, async (stream) => {
			try {
				// Simulate LLM response
				const tokens = generateMockTokens(prompt)
				let tokenCount = 0
				let totalSpent = session.spent

				// Add receipt header via result.withReceipt
				const initialReceipt = createStreamReceipt({
					challengeId,
					channelId: payload.channelId,
					acceptedCumulative: session.acceptedCumulative,
					spent: totalSpent,
					units: session.units,
				})
				c.header('Payment-Receipt', serializeStreamReceipt(initialReceipt))

				for (const token of tokens) {
					// Re-fetch session to get latest acceptedCumulative (may have been topped up via HEAD)
					const currentSession = await storageInstance.getSession(challengeId)
					const acceptedCumulative = currentSession?.acceptedCumulative ?? session.acceptedCumulative

					// Check if we still have balance
					const currentBalance = acceptedCumulative - totalSpent
					const tokenCost = config.pricePerToken

					if (currentBalance < tokenCost) {
						// Out of balance, stop streaming
						await stream.writeSSE({
							event: 'balance_exhausted',
							data: JSON.stringify({
								message: 'Balance exhausted. Submit a new voucher to continue.',
								acceptedCumulative: acceptedCumulative.toString(),
								spent: totalSpent.toString(),
								units: tokenCount,
							}),
						})
						break
					}

					// Charge for token
					totalSpent += tokenCost
					tokenCount++

					// Update session state atomically
					await storageInstance.updateSession(challengeId, (current) => {
						if (!current) return null
						return { ...current, spent: totalSpent, units: tokenCount }
					})

					// Send token
					await stream.writeSSE({
						event: 'token',
						data: JSON.stringify({
							token,
							spent: totalSpent.toString(),
							remaining: (acceptedCumulative - totalSpent).toString(),
						}),
					})

					// Simulate token generation delay
					await sleep(50)
				}

				// Get final session state for receipt
				const finalSession = await storageInstance.getSession(challengeId)
				const finalAccepted = finalSession?.acceptedCumulative ?? session.acceptedCumulative

				// Send final receipt
				const finalReceipt = createStreamReceipt({
					challengeId,
					channelId: payload.channelId,
					acceptedCumulative: finalAccepted,
					spent: totalSpent,
					units: tokenCount,
				})

				await stream.writeSSE({
					event: 'done',
					data: JSON.stringify({
						receipt: finalReceipt,
					}),
				})
			} finally {
				activeStreams.delete(challengeId)
			}
		})
	})

	/**
	 * GET /channel/:id - Check if a channel exists
	 * Returns channel state if found, 404 if not
	 */
	chat.get('/channel/:id', async (c) => {
		const channelId = c.req.param('id') as `0x${string}`
		const channel = await storageInstance.getChannel(channelId)

		if (!channel) {
			return c.json({ exists: false }, 404)
		}

		return c.json({
			exists: true,
			channelId: channel.channelId,
			highestVoucherAmount: channel.highestVoucherAmount.toString(),
			createdAt: channel.createdAt.toISOString(),
		})
	})

	/**
	 * POST /chat - Alternative endpoint that accepts prompt in body
	 */
	chat.post('/chat', async (c) => {
		const hostHeader = c.req.header('Host') ?? new URL(c.req.url).host
		const config = parseConfig(c.env, hostHeader)

		let prompt = 'Hello!'
		try {
			const body = await c.req.json<{ prompt?: string }>()
			prompt = body.prompt ?? prompt
		} catch {
			// Use default prompt
		}

		// Check for Authorization header
		const authHeader = c.req.header('Authorization')

		if (!authHeader?.startsWith('Payment ')) {
			const payment = getPaymentHandler(config)
			const result = await payment.stream(getStreamRequest(config))(c.req.raw)

			if (result.status === 402) {
				return result.challenge as Response
			}
		}

		// Redirect to GET handler with prompt
		const url = new URL(c.req.url)
		url.searchParams.set('prompt', prompt)

		return c.redirect(url.toString(), 307)
	})

	return chat
}

/**
 * Generate mock LLM tokens for demo.
 * In the future we will just proxy this to OpenRouter.
 */
function generateMockTokens(prompt: string): string[] {
	const responses: Record<string, string[]> = {
		hello: ['Hello', '!', ' How', ' can', ' I', ' help', ' you', ' today', '?'],
		goodbye: ['Goodbye', '!', ' It', ' was', ' nice', ' chatting', ' with', ' you', '.'],
		default: [
			'I',
			' am',
			' a',
			' streaming',
			' AI',
			' assistant',
			'.',
			' This',
			' response',
			' is',
			' being',
			' metered',
			' per',
			' token',
			'.',
		],
	}

	const key = prompt.toLowerCase().includes('hello')
		? 'hello'
		: prompt.toLowerCase().includes('goodbye')
			? 'goodbye'
			: 'default'

	return responses[key] ?? responses.default ?? []
}

/**
 * Sleep utility.
 */
function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms))
}

// Export singleton routes
export const chat = createChatRoutes()
