import { privateKeyToAccount } from 'viem/accounts'
import { describe, expect, it } from 'vitest'
import type { SignedVoucher } from './types'
import { createVoucherTypedData, hashVoucher, recoverVoucherSigner, verifyVoucher } from './voucher'

const TEST_ESCROW = '0x1234567890123456789012345678901234567890' as const
const TEST_CHAIN_ID = 42431

describe('voucher', () => {
	const account = privateKeyToAccount(
		'0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
	)

	it('should create voucher typed data', () => {
		const typedData = createVoucherTypedData(TEST_ESCROW, TEST_CHAIN_ID, {
			channelId: '0x1234567890123456789012345678901234567890123456789012345678901234',
			cumulativeAmount: 1000000n,
			validUntil: 1700000000n,
		})

		expect(typedData.primaryType).toBe('Voucher')
		expect(typedData.domain.name).toBe('Tempo Stream Channel')
		expect(typedData.domain.version).toBe('1')
		expect(typedData.domain.chainId).toBe(TEST_CHAIN_ID)
		expect(typedData.domain.verifyingContract).toBe(TEST_ESCROW)
		expect(typedData.message.cumulativeAmount).toBe('1000000')
	})

	it('should hash voucher correctly', () => {
		const hash = hashVoucher(TEST_ESCROW, TEST_CHAIN_ID, {
			channelId: '0x1234567890123456789012345678901234567890123456789012345678901234',
			cumulativeAmount: 1000000n,
			validUntil: 1700000000n,
		})

		expect(hash).toMatch(/^0x[a-fA-F0-9]{64}$/)
	})

	it('should sign and recover voucher signer', async () => {
		const channelId = '0x1234567890123456789012345678901234567890123456789012345678901234' as const
		const cumulativeAmount = 1000000n
		const validUntil = 1700000000n

		const signature = await account.signTypedData({
			domain: {
				name: 'Tempo Stream Channel',
				version: '1',
				chainId: TEST_CHAIN_ID,
				verifyingContract: TEST_ESCROW,
			},
			types: {
				Voucher: [
					{ name: 'channelId', type: 'bytes32' },
					{ name: 'cumulativeAmount', type: 'uint128' },
					{ name: 'validUntil', type: 'uint64' },
				],
			},
			primaryType: 'Voucher',
			message: {
				channelId,
				cumulativeAmount,
				validUntil,
			},
		})

		const voucher: SignedVoucher = {
			channelId,
			cumulativeAmount,
			validUntil,
			signature,
		}

		const signer = await recoverVoucherSigner(TEST_ESCROW, TEST_CHAIN_ID, voucher)
		expect(signer.toLowerCase()).toBe(account.address.toLowerCase())
	})

	it('should verify voucher correctly', async () => {
		const channelId = '0x1234567890123456789012345678901234567890123456789012345678901234' as const
		const cumulativeAmount = 500000n
		const validUntil = 1800000000n

		const signature = await account.signTypedData({
			domain: {
				name: 'Tempo Stream Channel',
				version: '1',
				chainId: TEST_CHAIN_ID,
				verifyingContract: TEST_ESCROW,
			},
			types: {
				Voucher: [
					{ name: 'channelId', type: 'bytes32' },
					{ name: 'cumulativeAmount', type: 'uint128' },
					{ name: 'validUntil', type: 'uint64' },
				],
			},
			primaryType: 'Voucher',
			message: {
				channelId,
				cumulativeAmount,
				validUntil,
			},
		})

		const voucher: SignedVoucher = {
			channelId,
			cumulativeAmount,
			validUntil,
			signature,
		}

		const isValid = await verifyVoucher(TEST_ESCROW, TEST_CHAIN_ID, voucher, account.address)
		expect(isValid).toBe(true)

		// Wrong payer should fail
		const isInvalid = await verifyVoucher(
			TEST_ESCROW,
			TEST_CHAIN_ID,
			voucher,
			'0x0000000000000000000000000000000000000001',
		)
		expect(isInvalid).toBe(false)
	})
})
