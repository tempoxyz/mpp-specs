import type { Account, Address, Hex, WalletClient } from 'viem'
import { encodePacked, keccak256, recoverTypedDataAddress, toHex } from 'viem'
import type { SignedVoucher, Voucher } from '../types/stream.js'

/**
 * Derive channelId deterministically from payer address and server realm.
 * channelId = keccak256(payerAddress, realm)
 */
export function deriveChannelId(payerAddress: Address, realm: string): Hex {
	return keccak256(encodePacked(['address', 'string'], [payerAddress, realm]))
}

/**
 * EIP-712 domain for voucher signing.
 */
function getVoucherDomain(escrowContract: Address, chainId: number) {
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
const voucherTypes = {
	Voucher: [
		{ name: 'channelId', type: 'bytes32' },
		{ name: 'cumulativeAmount', type: 'uint128' },
		{ name: 'sessionHash', type: 'bytes32' },
	],
} as const

/**
 * Compute sessionHash from challengeId and resourceHash.
 * This binds vouchers to specific sessions, preventing replay attacks.
 */
export function computeSessionHash(challengeId: string, resourceHash?: Hex): Hex {
	const resource = resourceHash ?? (`0x${'0'.repeat(64)}` as Hex)
	const challengeBytes = toHex(new TextEncoder().encode(challengeId))
	return keccak256((challengeBytes + resource.slice(2)) as Hex)
}

/**
 * Sign a voucher with an account.
 */
export async function signVoucher(
	client: WalletClient,
	account: Account,
	message: Voucher,
	escrowContract: Address,
	chainId: number,
): Promise<Hex> {
	return client.signTypedData({
		account,
		domain: getVoucherDomain(escrowContract, chainId),
		types: voucherTypes,
		primaryType: 'Voucher',
		message: {
			channelId: message.channelId,
			cumulativeAmount: message.cumulativeAmount,
			sessionHash: message.sessionHash,
		},
	})
}

/**
 * Verify a voucher signature matches the expected signer.
 */
export async function verifyVoucher(
	escrowContract: Address,
	chainId: number,
	voucher: SignedVoucher,
	expectedSigner: Address,
): Promise<boolean> {
	try {
		const signer = await recoverTypedDataAddress({
			domain: getVoucherDomain(escrowContract, chainId),
			types: voucherTypes,
			primaryType: 'Voucher',
			message: {
				channelId: voucher.channelId,
				cumulativeAmount: voucher.cumulativeAmount,
				sessionHash: voucher.sessionHash,
			},
			signature: voucher.signature,
		})
		return signer.toLowerCase() === expectedSigner.toLowerCase()
	} catch {
		return false
	}
}

/**
 * Parse a voucher from credential payload.
 */
export function parseVoucherFromPayload(
	channelId: Hex,
	cumulativeAmount: string,
	sessionHash: Hex,
	signature: Hex,
): SignedVoucher {
	return {
		channelId,
		cumulativeAmount: BigInt(cumulativeAmount),
		sessionHash,
		signature,
	}
}
