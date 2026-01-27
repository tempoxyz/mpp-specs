import type { Address } from 'viem'
import { recoverTypedDataAddress } from 'viem'
import type { CloseRequestMessage, CloseRequestTypedData, SignedCloseRequest } from './types.js'
import { getVoucherDomain } from './voucher.js'

/**
 * EIP-712 types for close requests.
 */
export const closeRequestTypes = {
	CloseRequest: [{ name: 'channelId', type: 'bytes32' }],
} as const

/**
 * Create EIP-712 typed data for a close request.
 */
export function createCloseRequestTypedData(
	escrowContract: Address,
	chainId: number,
	message: CloseRequestMessage,
): CloseRequestTypedData {
	return {
		primaryType: 'CloseRequest',
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
			CloseRequest: [{ name: 'channelId', type: 'bytes32' }],
		},
		message: {
			channelId: message.channelId,
		},
	}
}

/**
 * Recover the signer address from a signed close request.
 */
export async function recoverCloseRequestSigner(
	escrowContract: Address,
	chainId: number,
	closeRequest: SignedCloseRequest,
): Promise<Address> {
	return recoverTypedDataAddress({
		domain: getVoucherDomain(escrowContract, chainId),
		types: closeRequestTypes,
		primaryType: 'CloseRequest',
		message: {
			channelId: closeRequest.channelId,
		},
		signature: closeRequest.signature,
	})
}

/**
 * Verify a close request signature matches the expected payer.
 */
export async function verifyCloseRequest(
	escrowContract: Address,
	chainId: number,
	closeRequest: SignedCloseRequest,
	expectedPayer: Address,
): Promise<boolean> {
	try {
		const signer = await recoverCloseRequestSigner(escrowContract, chainId, closeRequest)
		return signer.toLowerCase() === expectedPayer.toLowerCase()
	} catch {
		return false
	}
}
