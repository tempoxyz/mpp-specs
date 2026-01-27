import type { Address, Hex } from 'viem'

/**
 * On-chain channel state.
 */
export interface Channel {
	payer: Address
	payee: Address
	token: Address
	authorizedSigner: Address // Address authorized to sign vouchers (0 = payer)
	deposit: bigint
	settled: bigint
	closeRequestedAt: bigint
	finalized: boolean
}

/**
 * Voucher message for EIP-712 signing.
 */
export interface VoucherMessage {
	channelId: Hex
	cumulativeAmount: bigint
}

/**
 * Signed voucher with signature.
 */
export interface SignedVoucher {
	channelId: Hex
	cumulativeAmount: bigint
	signature: Hex
}

/**
 * Close request message for EIP-712 signing.
 */
export interface CloseRequestMessage {
	channelId: Hex
}

/**
 * Signed close request with signature.
 */
export interface SignedCloseRequest {
	channelId: Hex
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
	channelId?: Hex
	salt?: Hex
	voucherEndpoint: string
	minVoucherDelta?: string
}

/** Signed voucher with typed data payload */
export interface SignedVoucherPayload {
	payload: VoucherTypedData
	signature: Hex
}

/** Signed close request with typed data payload */
export interface SignedCloseRequestPayload {
	payload: CloseRequestTypedData
	signature: Hex
}

/** Open action: client opened a channel on-chain and provides first voucher */
interface StreamCredentialOpen {
	type: 'stream'
	action: 'open'
	channelId: Hex
	authorizedSigner?: Address
	openTxHash: Hex
	voucher: SignedVoucherPayload
}

/** Voucher action: client submits a new cumulative payment voucher */
interface StreamCredentialVoucher {
	type: 'stream'
	action: 'voucher'
	channelId: Hex
	voucher: SignedVoucherPayload
}

/** Close action: client requests channel closure */
interface StreamCredentialClose {
	type: 'stream'
	action: 'close'
	channelId: Hex
	closeRequest: SignedCloseRequestPayload
}

/**
 * Stream credential payload.
 * Discriminated union on `action` field.
 */
export type StreamCredentialPayload =
	| StreamCredentialOpen
	| StreamCredentialVoucher
	| StreamCredentialClose

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
	}
}

/**
 * EIP-712 typed data for close requests.
 */
export interface CloseRequestTypedData {
	primaryType: 'CloseRequest'
	domain: {
		name: string
		version: string
		chainId: number
		verifyingContract: Address
	}
	types: {
		EIP712Domain: Array<{ name: string; type: string }>
		CloseRequest: Array<{ name: string; type: string }>
	}
	message: {
		channelId: Hex
	}
}

/**
 * Channel opening parameters.
 */
export interface OpenChannelParams {
	payee: Address
	token: Address
	deposit: bigint
	salt: Hex
	authorizedSigner?: Address // Optional: address authorized to sign vouchers (default: payer)
}

/**
 * Server-side channel state for tracking vouchers.
 */
export interface ServerChannelState {
	channelId: Hex
	payer: Address
	payee: Address
	token: Address
	authorizedSigner: Address // Address authorized to sign vouchers
	deposit: bigint
	settled: bigint
	highestVoucherAmount: bigint
	highestVoucher: SignedVoucher | null
}
