import type { Address, Hex } from 'viem'

/**
 * On-chain channel state.
 */
export interface Channel {
	payer: Address
	payee: Address
	token: Address
	deposit: bigint
	settled: bigint
	expiry: bigint
	closeRequestedAt: bigint
	finalized: boolean
}

/**
 * Voucher message for EIP-712 signing.
 */
export interface VoucherMessage {
	channelId: Hex
	cumulativeAmount: bigint
	validUntil: bigint
}

/**
 * Signed voucher with signature.
 */
export interface SignedVoucher {
	channelId: Hex
	cumulativeAmount: bigint
	validUntil: bigint
	signature: Hex
}

/**
 * Stream request from server challenge.
 */
export interface StreamRequest {
	escrowContract: Address
	asset: Address
	destination: Address
	deposit: string
	expires: string
	channelId?: Hex
	salt?: Hex
	voucherEndpoint: string
	minVoucherDelta?: string
}

/**
 * Stream credential payload.
 */
export interface StreamCredentialPayload {
	type: 'stream'
	action: 'open' | 'voucher' | 'close'
	channelId: Hex
	openTxHash?: Hex
	voucher: {
		payload: VoucherTypedData
		signature: Hex
	}
}

/**
 * EIP-712 typed data for vouchers.
 */
export interface VoucherTypedData {
	primaryType: 'Voucher'
	domain: {
		name: string
		version: string
		chainId: number
		verifyingContract: Address
	}
	types: {
		EIP712Domain: Array<{ name: string; type: string }>
		Voucher: Array<{ name: string; type: string }>
	}
	message: {
		channelId: Hex
		cumulativeAmount: string
		validUntil: string
	}
}

/**
 * Channel opening parameters.
 */
export interface OpenChannelParams {
	payee: Address
	token: Address
	deposit: bigint
	expiry: bigint
	salt: Hex
}

/**
 * Server-side channel state for tracking vouchers.
 */
export interface ServerChannelState {
	channelId: Hex
	payer: Address
	payee: Address
	token: Address
	deposit: bigint
	settled: bigint
	expiry: bigint
	highestVoucherAmount: bigint
	highestVoucher: SignedVoucher | null
}
