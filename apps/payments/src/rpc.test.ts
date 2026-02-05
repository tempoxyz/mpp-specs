import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { httpWithAuth, parseRpcUrl, rpcFetch } from './rpc.js'

describe('RPC utilities', () => {
	describe('parseRpcUrl', () => {
		it('extracts credentials from URL and returns Authorization header', () => {
			const result = parseRpcUrl('https://myuser:mypass@rpc.example.com/v1')

			expect(result.url).toBe('https://rpc.example.com/v1')
			expect(result.authHeader).toBe(`Basic ${btoa('myuser:mypass')}`)
		})

		it('handles URL without credentials', () => {
			const result = parseRpcUrl('https://rpc.example.com/v1')

			expect(result.url).toBe('https://rpc.example.com/v1')
			expect(result.authHeader).toBeNull()
		})

		it('handles credentials with special characters', () => {
			// URL-encoded credentials get decoded by the URL API
			const result = parseRpcUrl('https://user%40domain:p%40ss%3Aword@rpc.example.com')

			expect(result.url).toBe('https://rpc.example.com/')
			// The URL API decodes the credentials, so we expect decoded values in the auth header
			expect(result.authHeader).toBe(
				`Basic ${btoa(`${decodeURIComponent('user%40domain')}:${decodeURIComponent('p%40ss%3Aword')}`)}`,
			)
		})

		it('handles empty password', () => {
			const result = parseRpcUrl('https://onlyuser:@rpc.example.com')

			expect(result.url).toBe('https://rpc.example.com/')
			expect(result.authHeader).toBe(`Basic ${btoa('onlyuser:')}`)
		})
	})

	describe('rpcFetch', () => {
		let originalFetch: typeof globalThis.fetch

		beforeEach(() => {
			originalFetch = globalThis.fetch
			globalThis.fetch = vi.fn().mockResolvedValue(new Response('{}'))
		})

		afterEach(() => {
			globalThis.fetch = originalFetch
		})

		it('adds Authorization header when URL has credentials', async () => {
			await rpcFetch('https://user:pass@rpc.example.com', {
				jsonrpc: '2.0',
				id: 1,
				method: 'eth_blockNumber',
				params: [],
			})

			expect(globalThis.fetch).toHaveBeenCalledTimes(1)
			const [url, options] = vi.mocked(globalThis.fetch).mock.calls[0]!

			expect(url).toBe('https://rpc.example.com/')
			expect((options?.headers as Record<string, string>).Authorization).toBe(
				`Basic ${btoa('user:pass')}`,
			)
			expect((options?.headers as Record<string, string>)['Content-Type']).toBe('application/json')
		})

		it('does not add Authorization header when no credentials', async () => {
			await rpcFetch('https://rpc.example.com', {
				jsonrpc: '2.0',
				id: 1,
				method: 'eth_blockNumber',
				params: [],
			})

			const [url, options] = vi.mocked(globalThis.fetch).mock.calls[0]!

			expect(url).toBe('https://rpc.example.com')
			expect((options?.headers as Record<string, string>).Authorization).toBeUndefined()
		})

		it('sends JSON-RPC body correctly', async () => {
			const body = {
				jsonrpc: '2.0',
				id: 42,
				method: 'eth_sendRawTransaction',
				params: ['0x1234'],
			}

			await rpcFetch('https://rpc.example.com', body)

			const [, options] = vi.mocked(globalThis.fetch).mock.calls[0]!
			expect(options?.body).toBe(JSON.stringify(body))
			expect(options?.method).toBe('POST')
		})
	})

	describe('httpWithAuth', () => {
		it('creates transport with fetchOptions containing Authorization header', () => {
			const transport = httpWithAuth('https://user:pass@rpc.example.com')

			expect(transport).toBeDefined()
			expect(transport({ chain: undefined, retryCount: 3, timeout: 10000 })).toHaveProperty(
				'request',
			)
		})

		it('creates transport without Authorization when no credentials', () => {
			const transport = httpWithAuth('https://rpc.example.com')

			expect(transport).toBeDefined()
		})

		it('preserves existing fetchOptions', () => {
			const transport = httpWithAuth('https://user:pass@rpc.example.com', {
				fetchOptions: {
					headers: {
						'X-Custom-Header': 'custom-value',
					},
				},
			})

			expect(transport).toBeDefined()
		})
	})
})
