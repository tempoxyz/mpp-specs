import type { Context } from 'hono'
import {
	convertRequestToAnthropic,
	convertResponseToOpenAI,
	createStreamingTransformer,
	isOpenAIChatCompletionsPath,
	isStreamingRequest,
} from './adapters/openai-to-anthropic.js'
import type { Env, PartnerConfig } from './config.js'
import { formatApiKey, getApiKey } from './config.js'
import { signS3Request } from './s3-signer.js'

/**
 * Resolve the upstream URL for a partner.
 * Supports ENV: prefix to read URL from environment variable.
 */
function resolveUpstream(partner: PartnerConfig, env: Env): string {
	if (partner.upstream.startsWith('ENV:')) {
		const envVar = partner.upstream.slice(4)
		const value = (env as unknown as Record<string, string | undefined>)[envVar]
		if (!value) {
			throw new Error(`Environment variable ${envVar} not configured for partner: ${partner.slug}`)
		}
		return value
	}
	return partner.upstream
}

/**
 * Result of proxying a request to the upstream API.
 */
export interface ProxyResult {
	response: Response
	upstreamLatencyMs: number
}

/**
 * Options for proxying a request.
 */
export interface ProxyOptions {
	/**
	 * If true, preserve the original Authorization header from the client
	 * instead of replacing it with the partner's API key.
	 * Useful for passthrough mode where the client authenticates directly.
	 */
	preserveClientAuth?: boolean
	/**
	 * Pre-read request body. If provided, this will be used instead of reading
	 * from the request. This is useful when the body needs to be preserved across
	 * async operations that might invalidate the original request body stream.
	 */
	preReadBody?: ArrayBuffer | null
}

/**
 * Headers that should not be forwarded to the upstream API (in paid mode).
 */
const BLOCKED_REQUEST_HEADERS_PAID = new Set([
	'host',
	'authorization', // We replace this with the partner's API key
	'cf-connecting-ip',
	'cf-ipcountry',
	'cf-ray',
	'cf-visitor',
	'x-forwarded-for',
	'x-forwarded-proto',
	'x-real-ip',
])

/**
 * Headers that should not be forwarded to the upstream API (in passthrough mode).
 * Note: 'authorization' is NOT blocked here - it passes through to upstream.
 */
const BLOCKED_REQUEST_HEADERS_PASSTHROUGH = new Set([
	'host',
	'cf-connecting-ip',
	'cf-ipcountry',
	'cf-ray',
	'cf-visitor',
	'x-forwarded-for',
	'x-forwarded-proto',
	'x-real-ip',
])

/**
 * Headers that should not be forwarded back to the client.
 */
const BLOCKED_RESPONSE_HEADERS = new Set([
	'content-encoding', // We'll handle this ourselves
	'transfer-encoding',
	'connection',
])

/**
 * Forward a request to the upstream API.
 *
 * @param c - Hono context
 * @param partner - Partner configuration
 * @param forwardPath - Path to forward to (relative to partner's upstream)
 * @param options - Proxy options (e.g., preserveClientAuth for passthrough mode)
 */
export async function proxyRequest(
	c: Context<{ Bindings: Env }>,
	partner: PartnerConfig,
	forwardPath: string,
	options: ProxyOptions = {},
): Promise<ProxyResult> {
	const { preserveClientAuth = false } = options

	// Check if this is an OpenAI-to-Anthropic translation request
	const needsAnthropicTranslation =
		partner.slug === 'anthropic' && isOpenAIChatCompletionsPath(forwardPath)

	// Build upstream URL - properly join base path with forward path
	const upstreamBase = resolveUpstream(partner, c.env)
	const baseUrl = new URL(upstreamBase)
	const basePath = baseUrl.pathname.replace(/\/$/, '') // Remove trailing slash
	// For Anthropic translation, redirect to /v1/messages
	const actualForwardPath = needsAnthropicTranslation ? '/v1/messages' : forwardPath
	const fullPath =
		basePath + (actualForwardPath.startsWith('/') ? actualForwardPath : `/${actualForwardPath}`)
	const upstreamUrl = new URL(fullPath, baseUrl.origin)

	// Copy query parameters
	const requestUrl = new URL(c.req.url)
	upstreamUrl.search = requestUrl.search

	// Build headers for upstream request
	const headers = new Headers()

	// Choose which headers to block based on mode
	const blockedHeaders = preserveClientAuth
		? BLOCKED_REQUEST_HEADERS_PASSTHROUGH
		: BLOCKED_REQUEST_HEADERS_PAID

	// Copy allowed headers from original request
	for (const [key, value] of c.req.raw.headers.entries()) {
		if (!blockedHeaders.has(key.toLowerCase())) {
			// Handle potentially duplicated Content-Type headers (e.g., "application/json, application/json")
			// by using only the first value
			if (key.toLowerCase() === 'content-type' && value.includes(',')) {
				headers.set(key, value.split(',')[0]!.trim())
			} else {
				headers.set(key, value)
			}
		}
	}

	// Track if we need S3 signing (deferred until after body is ready)
	let needsS3Signing = false
	let s3Credentials: { accessKeyId: string; secretAccessKey: string } | null = null

	// In paid mode, set the partner's API key
	// In passthrough mode, the client's auth header is preserved (if any)
	if (!preserveClientAuth) {
		const apiKey = getApiKey(partner, c.env)
		if (!apiKey) {
			throw new Error(`API key not configured for partner: ${partner.slug}`)
		}

		// Modal uses dual-header auth: Modal-Key and Modal-Secret
		// Credentials are stored as "key:secret" format
		if (partner.slug === 'modal') {
			const [modalKey, modalSecret] = apiKey.split(':')
			if (!modalKey || !modalSecret) {
				throw new Error('Modal credentials must be in "key:secret" format')
			}
			headers.set('Modal-Key', modalKey)
			headers.set('Modal-Secret', modalSecret)
		} else if (partner.apiKeySecretEnvVar) {
			// S3-style auth with separate access key ID and secret
			const envRecord = c.env as unknown as Record<string, string | undefined>
			const secretKey = envRecord[partner.apiKeySecretEnvVar]
			if (!secretKey) {
				throw new Error(`Secret key not configured: ${partner.apiKeySecretEnvVar}`)
			}
			needsS3Signing = true
			s3Credentials = { accessKeyId: apiKey, secretAccessKey: secretKey }
		} else {
			headers.set(partner.apiKeyHeader, formatApiKey(partner, apiKey))
		}
	}

	// Get request body if present
	let body: BodyInit | null = null
	let isStreaming = false
	if (c.req.method !== 'GET' && c.req.method !== 'HEAD') {
		// Use pre-read body if provided, otherwise read from request
		let rawBody: ArrayBuffer
		if (options.preReadBody !== undefined && options.preReadBody !== null) {
			rawBody = options.preReadBody
		} else {
			rawBody = await c.req.raw.clone().arrayBuffer()
		}

		// Check if this is a streaming request
		if (needsAnthropicTranslation) {
			isStreaming = isStreamingRequest(rawBody)
		}

		// If translating OpenAI -> Anthropic, convert the request body
		if (needsAnthropicTranslation && rawBody.byteLength > 0) {
			try {
				const openaiRequest = JSON.parse(new TextDecoder().decode(rawBody))
				const anthropicRequest = convertRequestToAnthropic(openaiRequest)
				body = JSON.stringify(anthropicRequest)
				// Anthropic requires anthropic-version header
				headers.set('anthropic-version', '2023-06-01')
			} catch {
				// If conversion fails, pass through original body
				body = rawBody
			}
		} else {
			body = rawBody
		}
	}

	// Make the upstream request with a generous timeout for LLM responses
	const start = Date.now()
	const controller = new AbortController()
	const timeoutId = setTimeout(() => controller.abort(), 300_000) // 5 minutes for LLM responses

	let upstreamResponse: Response
	try {
		// Build the request
		let upstreamRequest = new Request(upstreamUrl.toString(), {
			method: c.req.method,
			headers,
			body,
			signal: controller.signal,
		})

		// Apply S3 signing if needed
		if (needsS3Signing && s3Credentials) {
			upstreamRequest = await signS3Request(upstreamRequest, s3Credentials)
		}

		upstreamResponse = await fetch(upstreamRequest)
	} finally {
		clearTimeout(timeoutId)
	}
	const upstreamLatencyMs = Date.now() - start

	// Build response headers
	const responseHeaders = new Headers()
	for (const [key, value] of upstreamResponse.headers.entries()) {
		if (!BLOCKED_RESPONSE_HEADERS.has(key.toLowerCase())) {
			responseHeaders.set(key, value)
		}
	}

	// Add proxy metadata headers (use resolved upstream, hide credentials)
	const upstreamForHeader = new URL(upstreamBase)
	upstreamForHeader.username = ''
	upstreamForHeader.password = ''
	responseHeaders.set('X-Proxy-Upstream', upstreamForHeader.origin)
	responseHeaders.set('X-Proxy-Latency-Ms', upstreamLatencyMs.toString())

	// If translating Anthropic -> OpenAI, convert the response body
	let responseBody: BodyInit | null = upstreamResponse.body
	if (needsAnthropicTranslation && upstreamResponse.ok) {
		// Check if response is streaming - either we requested it OR Anthropic returned SSE
		const responseContentType = upstreamResponse.headers.get('content-type') || ''
		const isStreamingResponse = isStreaming || responseContentType.includes('text/event-stream')
		if (isStreamingResponse && upstreamResponse.body) {
			// For streaming responses, pipe through the transformer
			responseBody = upstreamResponse.body.pipeThrough(createStreamingTransformer())
			responseHeaders.set('Content-Type', 'text/event-stream')
			responseHeaders.set('Cache-Control', 'no-cache')
			responseHeaders.set('Connection', 'keep-alive')
		} else {
			// For non-streaming responses, convert the entire response
			try {
				const anthropicResponse = (await upstreamResponse.json()) as Parameters<
					typeof convertResponseToOpenAI
				>[0]
				const openaiResponse = convertResponseToOpenAI(anthropicResponse)
				responseBody = JSON.stringify(openaiResponse)
				responseHeaders.set('Content-Type', 'application/json')
			} catch {
				// If conversion fails, we already consumed the body, return error
				responseBody = JSON.stringify({ error: 'Failed to convert Anthropic response' })
			}
		}
	}

	// Create response with upstream body
	const response = new Response(responseBody, {
		status: upstreamResponse.status,
		statusText: upstreamResponse.statusText,
		headers: responseHeaders,
	})

	return { response, upstreamLatencyMs }
}
