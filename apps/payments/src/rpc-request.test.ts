import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Env } from './config.js'

/**
 * Test demonstrating how RPC requests are formatted for testnet (Moderato).
 *
 * This shows:
 * 1. URL construction with embedded credentials
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

	it('formats RPC request with embedded credentials in URL for testnet', async () => {
		// Testnet (Moderato) configuration with embedded credentials
		const env: Env = {
			ENVIRONMENT: 'moderato',
			TEMPO_RPC_URL: 'https://REDACTED_USERNAME:REDACTED_PASSWORD@rpc.moderato.tempo.xyz',
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

		const signedTx =
			'0x02f8a701820a9684773594008502540be4008502540be400830186a09420c00000000000000000000000000000000000000180b844a9059cbb0000000000000000000000001234567890123456789012345678901234567890000000000000000000000000000000000000000000000000000000000002710c001a0abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdefa0defabc1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef'

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

		// Verify the fetch was called with correct parameters
		expect(globalThis.fetch).toHaveBeenCalledTimes(1)

		const callArgs = vi.mocked(globalThis.fetch).mock.calls[0]!
		const [actualUrl, actualOptions] = callArgs

		// Verify URL includes embedded credentials
		expect(actualUrl).toContain('REDACTED_USERNAME:REDACTED_PASSWORD@rpc.moderato.tempo.xyz')

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

	it('formats RPC request without authentication when no credentials embedded', async () => {
		const env: Env = {
			ENVIRONMENT: 'moderato',
			TEMPO_RPC_URL: 'https://rpc.moderato.tempo.xyz',
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

		const signedTx = '0x1234567890abcdef'

		await fetch(env.TEMPO_RPC_URL, {
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

		// URL should NOT include credentials
		expect(actualUrl).toBe('https://rpc.moderato.tempo.xyz')
	})

	it('demonstrates complete request format with example values', () => {
		// Example testnet configuration with embedded credentials
		const rpcUrl = 'https://REDACTED_USERNAME:REDACTED_PASSWORD@rpc.moderato.tempo.xyz'

		// Example signed transaction (hex string)
		const signedTransaction =
			'0x02f8a701820a9684773594008502540be4008502540be400830186a09420c00000000000000000000000000000000000000180b844a9059cbb0000000000000000000000001234567890123456789012345678901234567890000000000000000000000000000000000000000000000000000000000002710c001a0abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdefa0defabc1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef'

		// Complete request format
		const request = {
			url: rpcUrl,
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

		// Verify URL format
		expect(request.url).toBe('https://REDACTED_USERNAME:REDACTED_PASSWORD@rpc.moderato.tempo.xyz')

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
		// URL with embedded credentials
		const rpcUrl = 'https://REDACTED_USERNAME:REDACTED_PASSWORD@rpc.moderato.tempo.xyz'

		const txHash = '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef'

		// Note: getTransactionReceipt uses viem's createPublicClient with http transport
		// which internally makes JSON-RPC calls. The URL format is the same.
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

		expect(request.url).toBe('https://REDACTED_USERNAME:REDACTED_PASSWORD@rpc.moderato.tempo.xyz')

		const body = JSON.parse(request.body)
		expect(body.method).toBe('eth_getTransactionReceipt')
		expect(body.params[0]).toBe(txHash)
	})
})
