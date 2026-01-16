import type { Context } from 'hono'
import type { Env, PartnerConfig } from './config.js'
import { formatApiKey, getApiKey } from './config.js'

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

	// Build upstream URL - properly join base path with forward path
	const baseUrl = new URL(partner.upstream)
	const basePath = baseUrl.pathname.replace(/\/$/, '') // Remove trailing slash
	const fullPath = basePath + (forwardPath.startsWith('/') ? forwardPath : '/' + forwardPath)
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
			headers.set(key, value)
		}
	}

	// In paid mode, set the partner's API key
	// In passthrough mode, the client's auth header is preserved (if any)
	if (!preserveClientAuth) {
		const apiKey = getApiKey(partner, c.env)
		if (!apiKey) {
			throw new Error(`API key not configured for partner: ${partner.slug}`)
		}
		headers.set(partner.apiKeyHeader, formatApiKey(partner, apiKey))
	}

	// Get request body if present
	let body: BodyInit | null = null
	if (c.req.method !== 'GET' && c.req.method !== 'HEAD') {
		body = await c.req.raw.clone().arrayBuffer()
	}

	// Make the upstream request
	const start = Date.now()
	const upstreamResponse = await fetch(upstreamUrl.toString(), {
		method: c.req.method,
		headers,
		body,
	})
	const upstreamLatencyMs = Date.now() - start

	// Build response headers
	const responseHeaders = new Headers()
	for (const [key, value] of upstreamResponse.headers.entries()) {
		if (!BLOCKED_RESPONSE_HEADERS.has(key.toLowerCase())) {
			responseHeaders.set(key, value)
		}
	}

	// Add proxy metadata headers
	responseHeaders.set('X-Proxy-Upstream', partner.upstream)
	responseHeaders.set('X-Proxy-Latency-Ms', upstreamLatencyMs.toString())

	// Create response with upstream body
	const response = new Response(upstreamResponse.body, {
		status: upstreamResponse.status,
		statusText: upstreamResponse.statusText,
		headers: responseHeaders,
	})

	return { response, upstreamLatencyMs }
}
