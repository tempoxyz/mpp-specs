import { privateKeyToAccount } from 'viem/accounts'
import { describe, expect, it } from 'vitest'
import type { SignedVoucher } from './types'
import { getVoucherDomain, recoverVoucherSigner, verifyVoucher, voucherTypes } from './voucher'

/**
 * Cross-language voucher verification test.
 *
 * This test verifies voucher signing and verification using the v2 format
 * (without validUntil). The test uses the foundry test account:
 *   Private Key: 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
 *   Address: 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
 */
describe('Cross-language voucher verification', () => {
	const TEST_ESCROW = '0x5513B62Ec86A8354D03E1dc5378886cdc2dD6A09'
	const TEST_CHAIN_ID = 42431
	const TEST_PRIVATE_KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80'

	const account = privateKeyToAccount(TEST_PRIVATE_KEY)

	it('should sign and recover correct signer', async () => {
		const channelId = '0x2a953fdfcb3e13597b6831a2cbc07dc6323a502c5dad037183358876e3838c76' as const
		const cumulativeAmount = 100000n

		const signature = await account.signTypedData({
			domain: getVoucherDomain(TEST_ESCROW, TEST_CHAIN_ID),
			types: voucherTypes,
			primaryType: 'Voucher',
			message: {
				channelId,
				cumulativeAmount,
			},
		})

		const voucher: SignedVoucher = {
			channelId,
			cumulativeAmount,
			signature,
		}

		const signer = await recoverVoucherSigner(TEST_ESCROW, TEST_CHAIN_ID, voucher)
		expect(signer.toLowerCase()).toBe(account.address.toLowerCase())
	})

	it('should verify voucher against expected signer', async () => {
		const channelId = '0x2a953fdfcb3e13597b6831a2cbc07dc6323a502c5dad037183358876e3838c76' as const
		const cumulativeAmount = 100000n

		const signature = await account.signTypedData({
			domain: getVoucherDomain(TEST_ESCROW, TEST_CHAIN_ID),
			types: voucherTypes,
			primaryType: 'Voucher',
			message: {
				channelId,
				cumulativeAmount,
			},
		})

		const voucher: SignedVoucher = {
			channelId,
			cumulativeAmount,
			signature,
		}

		const isValid = await verifyVoucher(TEST_ESCROW, TEST_CHAIN_ID, voucher, account.address)
		expect(isValid).toBe(true)
	})

	it('should reject voucher with wrong signer', async () => {
		const channelId = '0x2a953fdfcb3e13597b6831a2cbc07dc6323a502c5dad037183358876e3838c76' as const
		const cumulativeAmount = 100000n

		const signature = await account.signTypedData({
			domain: getVoucherDomain(TEST_ESCROW, TEST_CHAIN_ID),
			types: voucherTypes,
			primaryType: 'Voucher',
			message: {
				channelId,
				cumulativeAmount,
			},
		})

		const voucher: SignedVoucher = {
			channelId,
			cumulativeAmount,
			signature,
		}

		const wrongSigner = '0x0000000000000000000000000000000000000001'
		const isValid = await verifyVoucher(TEST_ESCROW, TEST_CHAIN_ID, voucher, wrongSigner)
		expect(isValid).toBe(false)
	})
})
