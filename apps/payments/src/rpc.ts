/**
 * RPC utilities for making authenticated JSON-RPC calls.
 *
 * Cloudflare Workers (and many other runtimes) don't automatically convert
 * URL-embedded credentials (https://user:pass@host) into Authorization headers.
 * These utilities handle that conversion.
 */

import { type HttpTransportConfig, http } from 'viem'

/**
 * Parse an RPC URL and extract credentials if present.
 * Returns the clean URL (without credentials) and the Authorization header value.
 */
export function parseRpcUrl(rpcUrl: string): {
	url: string
	authHeader: string | null
} {
	const parsed = new URL(rpcUrl)

	if (parsed.username || parsed.password) {
		// URL.username and URL.password are already percent-decoded
		// But we need to decode them for the Authorization header
		const username = decodeURIComponent(parsed.username)
		const password = decodeURIComponent(parsed.password)
		const credentials = `${username}:${password}`
		const authHeader = `Basic ${btoa(credentials)}`

		// Remove credentials from URL
		parsed.username = ''
		parsed.password = ''

		return {
			url: parsed.toString(),
			authHeader,
		}
	}

	return {
		url: rpcUrl,
		authHeader: null,
	}
}

/**
 * Make an authenticated JSON-RPC request.
 * Extracts credentials from URL and converts them to Authorization header.
 */
export async function rpcFetch(
	rpcUrl: string,
	body: unknown,
	options?: RequestInit,
): Promise<Response> {
	const { url, authHeader } = parseRpcUrl(rpcUrl)

	const headers: Record<string, string> = {
		'Content-Type': 'application/json',
		...(options?.headers as Record<string, string>),
	}

	if (authHeader) {
		headers.Authorization = authHeader
	}

	return fetch(url, {
		...options,
		method: 'POST',
		headers,
		body: JSON.stringify(body),
	})
}

/**
 * Create a viem http transport with basic auth support.
 * Extracts credentials from URL and passes them via fetchOptions.
 */
export function httpWithAuth(rpcUrl: string, config?: HttpTransportConfig) {
	const { url, authHeader } = parseRpcUrl(rpcUrl)

	const fetchOptions: HttpTransportConfig['fetchOptions'] = authHeader
		? {
				...config?.fetchOptions,
				headers: {
					...(config?.fetchOptions?.headers as Record<string, string>),
					Authorization: authHeader,
				},
			}
		: config?.fetchOptions

	return http(url, {
		...config,
		fetchOptions,
	})
}
