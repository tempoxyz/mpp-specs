import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Env } from './config.js'

/**
 * Test demonstrating how RPC requests are formatted for testnet (Moderato).
 *
 * This shows:
 * 1. URL construction with username/password authentication
 * 2. HTTP request headers
 * 3. JSON-RPC request body format
 */

describe('RPC Request Formatting for Testnet', () => {
	let originalFetch: typeof globalThis.fetch

	beforeEach(() => {
		originalFetch = globalThis.fetch
		globalThis.fetch = vi.fn()
	})

	afterEach(() => {
		globalThis.fetch = originalFetch
	})

	it('formats RPC request with username/password authentication for testnet', async () => {
		// Testnet (Moderato) configuration
		const env: Env = {
			ENVIRONMENT: 'moderato',
			TEMPO_RPC_URL: 'https://rpc.moderato.tempo.xyz',
			TEMPO_RPC_USERNAME: 'REDACTED_USERNAME',
			TEMPO_RPC_PASSWORD: 'REDACTED_PASSWORD',
		}

		// Mock a successful RPC response
		const mockResponse = {
			jsonrpc: '2.0',
			id: 1,
			result: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
		}

		vi.mocked(globalThis.fetch).mockResolvedValueOnce({
			ok: true,
			json: async () => mockResponse,
		} as Response)

		// Simulate the broadcastTransaction function logic
		let rpcUrl = env.TEMPO_RPC_URL
		if (env.TEMPO_RPC_USERNAME && env.TEMPO_RPC_PASSWORD) {
			const url = new URL(rpcUrl)
			url.username = env.TEMPO_RPC_USERNAME
			url.password = env.TEMPO_RPC_PASSWORD
			rpcUrl = url.toString()
		}

		const signedTx =
			'0x02f8a701820a9684773594008502540be4008502540be400830186a09420c00000000000000000000000000000000000000180b844a9059cbb0000000000000000000000001234567890123456789012345678901234567890000000000000000000000000000000000000000000000000000000000002710c001a0abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdefa0defabc1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef'

		const response = await fetch(rpcUrl, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				jsonrpc: '2.0',
				id: 1,
				method: 'eth_sendRawTransaction',
				params: [signedTx],
			}),
		})

		// Verify the fetch was called with correct parameters
		expect(globalThis.fetch).toHaveBeenCalledTimes(1)

		const callArgs = vi.mocked(globalThis.fetch).mock.calls[0]!
		const [actualUrl, actualOptions] = callArgs

		// Verify URL includes username/password
		// Note: URL.toString() may add a trailing slash, so we check includes
		expect(actualUrl).toContain('REDACTED_USERNAME:REDACTED_PASSWORD@rpc.moderato.tempo.xyz')
		expect(actualUrl).toMatch(
			/^https:\/\/REDACTED_USERNAME:REDACTED_PASSWORD@rpc\.moderato\.tempo\.xyz\/?$/,
		)

		// Verify HTTP method
		expect(actualOptions?.method).toBe('POST')

		// Verify headers
		expect(actualOptions?.headers).toEqual({
			'Content-Type': 'application/json',
		})

		// Verify JSON-RPC request body
		const body = JSON.parse(actualOptions?.body as string)
		expect(body).toEqual({
			jsonrpc: '2.0',
			id: 1,
			method: 'eth_sendRawTransaction',
			params: [signedTx],
		})

		// Verify response parsing
		const data = await response.json()
		expect(data).toEqual(mockResponse)
	})

	it('formats RPC request without authentication when credentials are missing', async () => {
		const env: Env = {
			ENVIRONMENT: 'moderato',
			TEMPO_RPC_URL: 'https://rpc.moderato.tempo.xyz',
			// No username/password
		}

		const mockResponse = {
			jsonrpc: '2.0',
			id: 1,
			result: '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
		}

		vi.mocked(globalThis.fetch).mockResolvedValueOnce({
			ok: true,
			json: async () => mockResponse,
		} as Response)

		// Simulate the broadcastTransaction function logic
		let rpcUrl = env.TEMPO_RPC_URL
		if (env.TEMPO_RPC_USERNAME && env.TEMPO_RPC_PASSWORD) {
			const url = new URL(rpcUrl)
			url.username = env.TEMPO_RPC_USERNAME
			url.password = env.TEMPO_RPC_PASSWORD
			rpcUrl = url.toString()
		}

		const signedTx = '0x1234567890abcdef'

		await fetch(rpcUrl, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				jsonrpc: '2.0',
				id: 1,
				method: 'eth_sendRawTransaction',
				params: [signedTx],
			}),
		})

		const callArgs = vi.mocked(globalThis.fetch).mock.calls[0]!
		const [actualUrl] = callArgs

		// URL should NOT include username/password
		expect(actualUrl).toBe('https://rpc.moderato.tempo.xyz')
	})

	it('demonstrates complete request format with example values', () => {
		// Example testnet configuration
		const testnetConfig = {
			rpcUrl: 'https://rpc.moderato.tempo.xyz',
			username: 'REDACTED_USERNAME',
			password: 'REDACTED_PASSWORD',
		}

		// Construct URL with authentication
		const url = new URL(testnetConfig.rpcUrl)
		url.username = testnetConfig.username
		url.password = testnetConfig.password

		// Example signed transaction (hex string)
		const signedTransaction =
			'0x02f8a701820a9684773594008502540be4008502540be400830186a09420c00000000000000000000000000000000000000180b844a9059cbb0000000000000000000000001234567890123456789012345678901234567890000000000000000000000000000000000000000000000000000000000002710c001a0abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdefa0defabc1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef'

		// Complete request format
		const request = {
			url: url.toString(),
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({
				jsonrpc: '2.0',
				id: 1,
				method: 'eth_sendRawTransaction',
				params: [signedTransaction],
			}),
		}

		// Verify URL format (URL.toString() may add trailing slash)
		expect(request.url).toMatch(
			/^https:\/\/REDACTED_USERNAME:REDACTED_PASSWORD@rpc\.moderato\.tempo\.xyz\/?$/,
		)

		// Verify JSON-RPC format
		const body = JSON.parse(request.body)
		expect(body.jsonrpc).toBe('2.0')
		expect(body.id).toBe(1)
		expect(body.method).toBe('eth_sendRawTransaction')
		expect(body.params).toHaveLength(1)
		expect(body.params[0]).toBe(signedTransaction)

		// Example output for documentation
		console.log('\n=== Testnet RPC Request Format ===')
		console.log('URL:', request.url)
		console.log('Method:', request.method)
		console.log('Headers:', JSON.stringify(request.headers, null, 2))
		console.log('Body:', request.body)
		console.log('===================================\n')
	})

	it('demonstrates getTransactionReceipt request format', () => {
		const testnetConfig = {
			rpcUrl: 'https://rpc.moderato.tempo.xyz',
			username: 'REDACTED_USERNAME',
			password: 'REDACTED_PASSWORD',
		}

		const url = new URL(testnetConfig.rpcUrl)
		url.username = testnetConfig.username
		url.password = testnetConfig.password

		const txHash = '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef'

		// Note: getTransactionReceipt uses viem's createPublicClient with http transport
		// which internally makes JSON-RPC calls. The URL format is the same.
		const rpcUrl = url.toString()

		// The viem http transport will make requests like:
		const request = {
			url: rpcUrl,
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({
				jsonrpc: '2.0',
				id: 1,
				method: 'eth_getTransactionReceipt',
				params: [txHash],
			}),
		}

		expect(request.url).toMatch(
			/^https:\/\/REDACTED_USERNAME:REDACTED_PASSWORD@rpc\.moderato\.tempo\.xyz\/?$/,
		)

		const body = JSON.parse(request.body)
		expect(body.method).toBe('eth_getTransactionReceipt')
		expect(body.params[0]).toBe(txHash)
	})
})
