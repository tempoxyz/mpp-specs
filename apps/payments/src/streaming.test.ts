import type { Address, Hex } from 'viem'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { formatStreamChallenge, formatStreamReceipt, parseStreamCredential } from './streaming.js'
import { createMockPartner } from './test-utils.js'

// Mock stream-channels
vi.mock('@tempo/stream-channels', () => ({
	createStreamChannelServer: vi.fn(() => ({
		createStreamRequest: vi.fn(
			(params: {
				escrowContract: Address
				asset: Address
				deposit: bigint
				voucherEndpoint: string
				minVoucherDelta: bigint
			}) => ({
				escrowContract: params.escrowContract,
				asset: params.asset,
				destination: '0x0aA342d6e4e45D1F6eAE721c4fEf2f61B82f8581' as Address,
				deposit: params.deposit.toString(),
				salt: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef' as Hex,
				voucherEndpoint: params.voucherEndpoint,
				minVoucherDelta: params.minVoucherDelta.toString(),
			}),
		),
		verifyChannelOpen: vi.fn(),
		verifyVoucher: vi.fn(),
		getChannelState: vi.fn(),
		getRemainingDeposit: vi.fn(() => BigInt(100000)),
		getUnsettledAmount: vi.fn(() => BigInt(50000)),
	})),
}))

vi.mock('viem', async () => {
	const actual = await vi.importActual('viem')
	return {
		...actual,
		createPublicClient: vi.fn(() => ({
			getChainId: vi.fn().mockResolvedValue(42431),
			readContract: vi.fn(),
			waitForTransactionReceipt: vi.fn(),
		})),
		http: vi.fn(),
	}
})

vi.mock('viem/chains', () => ({
	tempoModerato: { id: 42431 },
}))

describe('streaming', () => {
	beforeEach(() => {
		vi.clearAllMocks()
	})

	describe('parseStreamCredential', () => {
		it('should return null for null input', () => {
			expect(parseStreamCredential(null)).toBeNull()
		})

		it('should return null for non-object input', () => {
			expect(parseStreamCredential('string')).toBeNull()
			expect(parseStreamCredential(123)).toBeNull()
		})

		it('should return null if type is not stream', () => {
			expect(parseStreamCredential({ type: 'transaction' })).toBeNull()
		})

		it('should return null for invalid action', () => {
			expect(parseStreamCredential({ type: 'stream', action: 'invalid' })).toBeNull()
		})

		it('should return null for missing channelId', () => {
			expect(parseStreamCredential({ type: 'stream', action: 'voucher' })).toBeNull()
		})

		it('should return null for missing voucher', () => {
			expect(
				parseStreamCredential({
					type: 'stream',
					action: 'voucher',
					channelId: '0x1234',
				}),
			).toBeNull()
		})

		it('should return null for missing closeRequest', () => {
			expect(
				parseStreamCredential({
					type: 'stream',
					action: 'close',
					channelId: '0x1234',
				}),
			).toBeNull()
		})

		it('should parse valid stream credential', () => {
			const credential = {
				type: 'stream',
				action: 'voucher',
				channelId: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
				voucher: {
					payload: {
						primaryType: 'Voucher',
						domain: {
							name: 'Tempo Stream Channel',
							version: '1',
							chainId: 42431,
							verifyingContract: '0x5678' as Address,
						},
						types: {},
						message: {
							channelId: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
							cumulativeAmount: '100000',
						},
					},
					signature: '0xsig' as Hex,
				},
			}

			const result = parseStreamCredential(credential)
			expect(result).not.toBeNull()
			expect(result?.type).toBe('stream')
			expect(result?.action).toBe('voucher')
			expect(result?.channelId).toBe(
				'0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
			)
		})

		it('should parse valid close request credential', () => {
			const credential = {
				type: 'stream',
				action: 'close',
				channelId: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
				closeRequest: {
					payload: {
						primaryType: 'CloseRequest',
						domain: {
							name: 'Tempo Stream Channel',
							version: '1',
							chainId: 42431,
							verifyingContract: '0x5678' as Address,
						},
						types: {},
						message: {
							channelId: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
						},
					},
					signature: '0xsig' as Hex,
				},
			}

			const result = parseStreamCredential(credential)
			expect(result).not.toBeNull()
			expect(result?.action).toBe('close')
		})
	})

	describe('formatStreamChallenge', () => {
		it('should format basic stream challenge', () => {
			const request = {
				escrowContract: '0xEscrow' as Address,
				asset: '0xAsset' as Address,
				destination: '0xDest' as Address,
				deposit: '1000000',
				voucherEndpoint: 'https://example.com/voucher',
			}

			const result = formatStreamChallenge(request)

			expect(result).toContain('Payment')
			expect(result).toContain('intent="stream"')
			expect(result).toContain('escrowContract="0xEscrow"')
			expect(result).toContain('asset="0xAsset"')
			expect(result).toContain('destination="0xDest"')
			expect(result).toContain('deposit="1000000"')
			expect(result).toContain('voucherEndpoint="https://example.com/voucher"')
		})

		it('should include optional salt', () => {
			const request = {
				escrowContract: '0xEscrow' as Address,
				asset: '0xAsset' as Address,
				destination: '0xDest' as Address,
				deposit: '1000000',
				voucherEndpoint: 'https://example.com/voucher',
				salt: '0xSalt123' as Hex,
			}

			const result = formatStreamChallenge(request)
			expect(result).toContain('salt="0xSalt123"')
		})

		it('should include optional channelId', () => {
			const request = {
				escrowContract: '0xEscrow' as Address,
				asset: '0xAsset' as Address,
				destination: '0xDest' as Address,
				deposit: '1000000',
				voucherEndpoint: 'https://example.com/voucher',
				channelId: '0xChannel' as Hex,
			}

			const result = formatStreamChallenge(request)
			expect(result).toContain('channelId="0xChannel"')
		})

		it('should include optional minVoucherDelta', () => {
			const request = {
				escrowContract: '0xEscrow' as Address,
				asset: '0xAsset' as Address,
				destination: '0xDest' as Address,
				deposit: '1000000',
				voucherEndpoint: 'https://example.com/voucher',
				minVoucherDelta: '1000',
			}

			const result = formatStreamChallenge(request)
			expect(result).toContain('minVoucherDelta="1000"')
		})
	})

	describe('formatStreamReceipt', () => {
		it('should format stream receipt as JSON', () => {
			const channelId = '0x1234' as Hex
			const cumulativeAmount = BigInt(500000)
			const remaining = BigInt(500000)

			const result = formatStreamReceipt(channelId, cumulativeAmount, remaining)
			const parsed = JSON.parse(result)

			expect(parsed.status).toBe('success')
			expect(parsed.method).toBe('tempo')
			expect(parsed.intent).toBe('stream')
			expect(parsed.channelId).toBe('0x1234')
			expect(parsed.cumulativeAmount).toBe('500000')
			expect(parsed.remaining).toBe('500000')
			expect(parsed.timestamp).toBeDefined()
		})
	})

	describe('partner streaming config', () => {
		it('should allow partner without streaming config', () => {
			const partner = createMockPartner()
			expect(partner.streaming).toBeUndefined()
		})

		it('should support partner with streaming config', () => {
			const partner = createMockPartner({
				streaming: {
					escrowContract: '0x5678' as Address,
					defaultDeposit: '10000000', // $10
					minVoucherDelta: '10000', // $0.01
				},
			})

			expect(partner.streaming).toBeDefined()
			expect(partner.streaming?.escrowContract).toBe('0x5678')
			expect(partner.streaming?.defaultDeposit).toBe('10000000')
			expect(partner.streaming?.minVoucherDelta).toBe('10000')
		})
	})
})
