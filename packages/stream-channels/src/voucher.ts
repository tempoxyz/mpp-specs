import type { Address, Hex } from 'viem'
import { hashTypedData, recoverTypedDataAddress } from 'viem'
import type { SignedVoucher, VoucherMessage, VoucherTypedData } from './types.js'

/**
 * EIP-712 domain for voucher signing.
 */
export function getVoucherDomain(escrowContract: Address, chainId: number) {
	return {
		name: 'Tempo Stream Channel',
		version: '1',
		chainId,
		verifyingContract: escrowContract,
	} as const
}

/**
 * EIP-712 types for voucher signing.
 */
export const voucherTypes = {
	Voucher: [
		{ name: 'channelId', type: 'bytes32' },
		{ name: 'cumulativeAmount', type: 'uint128' },
		{ name: 'validUntil', type: 'uint64' },
	],
} as const

/**
 * Create EIP-712 typed data for a voucher.
 */
export function createVoucherTypedData(
	escrowContract: Address,
	chainId: number,
	message: VoucherMessage,
): VoucherTypedData {
	return {
		primaryType: 'Voucher',
		domain: {
			name: 'Tempo Stream Channel',
			version: '1',
			chainId,
			verifyingContract: escrowContract,
		},
		types: {
			EIP712Domain: [
				{ name: 'name', type: 'string' },
				{ name: 'version', type: 'string' },
				{ name: 'chainId', type: 'uint256' },
				{ name: 'verifyingContract', type: 'address' },
			],
			Voucher: [
				{ name: 'channelId', type: 'bytes32' },
				{ name: 'cumulativeAmount', type: 'uint128' },
				{ name: 'validUntil', type: 'uint64' },
			],
		},
		message: {
			channelId: message.channelId,
			cumulativeAmount: message.cumulativeAmount.toString(),
			validUntil: message.validUntil.toString(),
		},
	}
}

/**
 * Hash a voucher message for signing.
 */
export function hashVoucher(
	escrowContract: Address,
	chainId: number,
	message: VoucherMessage,
): Hex {
	return hashTypedData({
		domain: getVoucherDomain(escrowContract, chainId),
		types: voucherTypes,
		primaryType: 'Voucher',
		message: {
			channelId: message.channelId,
			cumulativeAmount: message.cumulativeAmount,
			validUntil: message.validUntil,
		},
	})
}

/**
 * Recover the signer address from a signed voucher.
 */
export async function recoverVoucherSigner(
	escrowContract: Address,
	chainId: number,
	voucher: SignedVoucher,
): Promise<Address> {
	return recoverTypedDataAddress({
		domain: getVoucherDomain(escrowContract, chainId),
		types: voucherTypes,
		primaryType: 'Voucher',
		message: {
			channelId: voucher.channelId,
			cumulativeAmount: voucher.cumulativeAmount,
			validUntil: voucher.validUntil,
		},
		signature: voucher.signature,
	})
}

/**
 * Verify a voucher signature matches the expected payer.
 */
export async function verifyVoucher(
	escrowContract: Address,
	chainId: number,
	voucher: SignedVoucher,
	expectedPayer: Address,
): Promise<boolean> {
	try {
		const signer = await recoverVoucherSigner(escrowContract, chainId, voucher)
		return signer.toLowerCase() === expectedPayer.toLowerCase()
	} catch {
		return false
	}
}
