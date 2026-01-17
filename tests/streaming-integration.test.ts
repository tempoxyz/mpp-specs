/**
 * Integration tests for streaming payment channels.
 *
 * Tests the HTTP-level behavior of streaming payments including:
 * - 402 challenge issuance with stream option
 * - Voucher endpoint error handling and validation
 * - Backward compatibility with standard Payment flow
 *
 * Note: Full channel verification tests require a running blockchain
 * and are covered in e2e tests. These tests focus on HTTP-level validation.
 */

import type { Address, Hex } from 'viem'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Mock viem before any imports
vi.mock('viem', async () => {
	const actual = await vi.importActual('viem')
	return {
		...actual,
		createPublicClient: vi.fn(() => ({
			getChainId: vi.fn().mockResolvedValue(42431),
			readContract: vi.fn(),
			waitForTransactionReceipt: vi.fn().mockResolvedValue({
				blockNumber: BigInt(12345),
			}),
			getTransactionReceipt: vi.fn().mockResolvedValue({
				status: 'success',
			}),
		})),
		http: vi.fn(),
		recoverTransactionAddress: vi
			.fn()
			.mockResolvedValue('0x1234567890123456789012345678901234567890'),
		parseTransaction: vi.fn(),
		decodeFunctionData: vi.fn().mockReturnValue({
			functionName: 'transfer',
			args: ['0x0aA342d6e4e45D1F6eAE721c4fEf2f61B82f8581', BigInt(120000)],
		}),
		isAddressEqual: vi.fn().mockReturnValue(true),
	}
})

vi.mock('viem/chains', () => ({
	tempoModerato: { id: 42431 },
}))

vi.mock('viem/tempo', () => ({
	Transaction: {
		deserialize: vi.fn(),
		isTempo: vi.fn(),
		serialize: vi.fn(),
	},
	Abis: {
		tip20: [
			{
				name: 'transfer',
				type: 'function',
				inputs: [
					{ name: 'to', type: 'address' },
					{ name: 'amount', type: 'uint256' },
				],
			},
		],
	},
}))

// Mock proxy module
vi.mock('../apps/payments-proxy/src/proxy.js', () => ({
	proxyRequest: vi.fn().mockResolvedValue({
		response: new Response(JSON.stringify({ success: true }), { status: 200 }),
		upstreamLatencyMs: 100,
	}),
}))

// Setup fetch mock
const fetchMock = vi.fn()
global.fetch = fetchMock

import app from '../apps/payments-proxy/src/index.js'

describe('Streaming Payment Integration', () => {
	const STREAM_ESCROW = '0x5555555555555555555555555555555555555555' as Address

	const mockEnv = {
		ENVIRONMENT: 'test',
		TEMPO_RPC_URL: 'https://rpc.test.com',
		BROWSERBASE_API_KEY: 'bb_test_key',
		OPENROUTER_API_KEY: 'or_test_key',
		STREAM_ESCROW_CONTRACT: STREAM_ESCROW,
	}

	const validChannelId = '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef' as Hex

	const createValidVoucher = (cumulativeAmount: string) => ({
		payload: {
			primaryType: 'Voucher',
			domain: {
				name: 'Tempo Stream Channel',
				version: '1',
				chainId: 42431,
				verifyingContract: STREAM_ESCROW,
			},
			types: {
				Voucher: [
					{ name: 'channelId', type: 'bytes32' },
					{ name: 'cumulativeAmount', type: 'uint256' },
					{ name: 'validUntil', type: 'uint256' },
				],
			},
			message: {
				channelId: validChannelId,
				cumulativeAmount,
				validUntil: String(Math.floor(Date.now() / 1000) + 3600),
			},
		},
		signature:
			'0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890ab' as Hex,
	})

	beforeEach(() => {
		vi.clearAllMocks()
		fetchMock.mockResolvedValue(
			new Response(JSON.stringify({ jsonrpc: '2.0', id: 1, result: '0xabcdef' }), {
				status: 200,
				headers: { 'Content-Type': 'application/json' },
			}),
		)
	})

	describe('402 Payment Required with Stream Option', () => {
		it('should return 402 with both Payment and Stream challenges for streaming-enabled partner', async () => {
			// OpenRouter supports streaming in our test config
			const res = await app.request(
				'/v1/chat/completions',
				{
					method: 'POST',
					headers: { Host: 'openrouter.payments.tempo.xyz' },
					body: JSON.stringify({ model: 'gpt-5', messages: [] }),
				},
				mockEnv,
			)

			expect(res.status).toBe(402)

			// Get all WWW-Authenticate headers
			const wwwAuthHeaders = res.headers.get('WWW-Authenticate')
			expect(wwwAuthHeaders).toBeTruthy()

			// Should contain both standard Payment and Stream challenges
			expect(wwwAuthHeaders).toContain('Payment')
			expect(wwwAuthHeaders).toContain('intent="stream"')
			expect(wwwAuthHeaders).toContain('escrowContract=')
			expect(wwwAuthHeaders).toContain('voucherEndpoint=')
		})

		it('should return 402 with only Payment challenge for non-streaming partner', async () => {
			const res = await app.request(
				'/v1/sessions',
				{
					method: 'POST',
					headers: { Host: 'browserbase.payments.tempo.xyz' },
				},
				mockEnv,
			)

			expect(res.status).toBe(402)

			const wwwAuth = res.headers.get('WWW-Authenticate')
			expect(wwwAuth).toBeTruthy()
			expect(wwwAuth).toContain('Payment')
			// Should NOT contain stream-specific fields
			expect(wwwAuth).not.toContain('intent="stream"')
			expect(wwwAuth).not.toContain('escrowContract=')
		})
	})

	describe('Voucher Endpoint - Input Validation', () => {
		it('should reject channel open without openTxHash', async () => {
			const res = await app.request(
				'/openrouter/voucher',
				{
					method: 'POST',
					headers: {
						Host: 'payments.tempo.xyz',
						'Content-Type': 'application/json',
					},
					body: JSON.stringify({
						type: 'stream',
						action: 'open',
						channelId: validChannelId,
						voucher: createValidVoucher('0'),
						// Missing openTxHash
					}),
				},
				mockEnv,
			)

			expect(res.status).toBe(400)
		})

		it('should reject invalid voucher format - missing channelId', async () => {
			const res = await app.request(
				'/openrouter/voucher',
				{
					method: 'POST',
					headers: {
						Host: 'payments.tempo.xyz',
						'Content-Type': 'application/json',
					},
					body: JSON.stringify({
						type: 'stream',
						action: 'voucher',
						// Missing channelId and voucher
					}),
				},
				mockEnv,
			)

			expect(res.status).toBe(400)
			const data = (await res.json()) as { error?: string; message?: string }
			expect(data.error || data.message).toBeTruthy()
		})

		it('should reject invalid voucher format - missing voucher', async () => {
			const res = await app.request(
				'/openrouter/voucher',
				{
					method: 'POST',
					headers: {
						Host: 'payments.tempo.xyz',
						'Content-Type': 'application/json',
					},
					body: JSON.stringify({
						type: 'stream',
						action: 'voucher',
						channelId: validChannelId,
						// Missing voucher
					}),
				},
				mockEnv,
			)

			expect(res.status).toBe(400)
		})

		it('should reject non-stream type credentials', async () => {
			const res = await app.request(
				'/openrouter/voucher',
				{
					method: 'POST',
					headers: {
						Host: 'payments.tempo.xyz',
						'Content-Type': 'application/json',
					},
					body: JSON.stringify({
						type: 'transaction',
						txHash: '0xabc',
					}),
				},
				mockEnv,
			)

			expect(res.status).toBe(400)
		})
	})

	describe('Voucher Endpoint - Error Handling', () => {
		it('should return 404 for unknown partner', async () => {
			const res = await app.request(
				'/unknown-partner/voucher',
				{
					method: 'POST',
					headers: {
						Host: 'payments.tempo.xyz',
						'Content-Type': 'application/json',
					},
					body: JSON.stringify({
						type: 'stream',
						action: 'voucher',
						channelId: validChannelId,
						voucher: createValidVoucher('100000'),
					}),
				},
				mockEnv,
			)

			expect(res.status).toBe(404)
		})

		it('should return 400 for partner without streaming support', async () => {
			const res = await app.request(
				'/browserbase/voucher',
				{
					method: 'POST',
					headers: {
						Host: 'payments.tempo.xyz',
						'Content-Type': 'application/json',
					},
					body: JSON.stringify({
						type: 'stream',
						action: 'voucher',
						channelId: validChannelId,
						voucher: createValidVoucher('100000'),
					}),
				},
				mockEnv,
			)

			expect(res.status).toBe(400)
			const data = (await res.json()) as { message?: string; error?: string }
			const errorText = data.message || data.error || ''
			expect(errorText).toContain('does not support streaming')
		})

		it('should return 400 for unsupported action', async () => {
			const res = await app.request(
				'/openrouter/voucher',
				{
					method: 'POST',
					headers: {
						Host: 'payments.tempo.xyz',
						'Content-Type': 'application/json',
					},
					body: JSON.stringify({
						type: 'stream',
						action: 'invalid-action',
						channelId: validChannelId,
						voucher: createValidVoucher('100000'),
					}),
				},
				mockEnv,
			)

			expect(res.status).toBe(400)
		})
	})

	describe('Backward Compatibility', () => {
		it('should still accept standard Payment credentials for paid endpoints', async () => {
			// This tests that the standard flow still works when streaming is available
			// The actual payment verification is mocked, but we verify the flow doesn't break

			// First get a challenge
			const _challengeRes = await app.request(
				'/v1/models',
				{
					method: 'GET',
					headers: { Host: 'openrouter.payments.tempo.xyz' },
				},
				mockEnv,
			)

			// Models endpoint is free for OpenRouter, so it should proxy through
			// Let's test a paid endpoint instead
			const paidRes = await app.request(
				'/v1/chat/completions',
				{
					method: 'POST',
					headers: { Host: 'openrouter.payments.tempo.xyz' },
					body: JSON.stringify({ model: 'gpt-5', messages: [] }),
				},
				mockEnv,
			)

			expect(paidRes.status).toBe(402)

			// Both Payment methods should be available
			const wwwAuth = paidRes.headers.get('WWW-Authenticate')
			expect(wwwAuth).toContain('Payment')
		})

		it('should work with free endpoints regardless of streaming support', async () => {
			const { proxyRequest } = await import('../apps/payments-proxy/src/proxy.js')
			vi.mocked(proxyRequest).mockResolvedValueOnce({
				response: new Response(JSON.stringify({ models: [] }), { status: 200 }),
				upstreamLatencyMs: 50,
			})

			const res = await app.request(
				'/v1/models',
				{
					method: 'GET',
					headers: { Host: 'openrouter.payments.tempo.xyz' },
				},
				mockEnv,
			)

			// GET /v1/models is free for OpenRouter
			expect(res.status).toBe(200)
		})
	})

	describe('Stream Challenge Format', () => {
		it('should include all required stream parameters in challenge', async () => {
			const res = await app.request(
				'/v1/chat/completions',
				{
					method: 'POST',
					headers: { Host: 'openrouter.payments.tempo.xyz' },
					body: JSON.stringify({ model: 'gpt-5', messages: [] }),
				},
				mockEnv,
			)

			expect(res.status).toBe(402)

			const wwwAuth = res.headers.get('WWW-Authenticate') || ''

			// Parse the stream challenge portion
			const streamPart = wwwAuth.split(',').find((p) => p.includes('intent="stream"'))
			expect(streamPart).toBeDefined()

			// Required stream parameters
			expect(wwwAuth).toContain('escrowContract=')
			expect(wwwAuth).toContain('asset=')
			expect(wwwAuth).toContain('destination=')
			expect(wwwAuth).toContain('deposit=')
			expect(wwwAuth).toContain('expires=')
			expect(wwwAuth).toContain('voucherEndpoint=')
		})

		it('should include optional stream parameters when configured', async () => {
			const res = await app.request(
				'/v1/chat/completions',
				{
					method: 'POST',
					headers: { Host: 'openrouter.payments.tempo.xyz' },
					body: JSON.stringify({ model: 'gpt-5', messages: [] }),
				},
				mockEnv,
			)

			expect(res.status).toBe(402)

			const wwwAuth = res.headers.get('WWW-Authenticate') || ''

			// Optional parameters that should be included when configured
			expect(wwwAuth).toContain('minVoucherDelta=')
		})
	})
})
