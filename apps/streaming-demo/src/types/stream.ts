import type { Address, Hex } from 'viem'

/**
 * Voucher with sessionHash.
 * The sessionHash prevents cross-session replay attacks.
 */
export interface Voucher {
	channelId: Hex
	cumulativeAmount: bigint
	sessionHash: Hex
}

/**
 * Signed voucher with EIP-712 signature.
 */
export interface SignedVoucher extends Voucher {
	signature: Hex
}

/**
 * Open action: client opened a channel on-chain.
 */
export interface OpenPayload {
	action: 'open'
	type: 'hash' | 'transaction'
	channelId: Hex
	openTxHash?: Hex
	signature?: Hex
	authorizedSigner?: Address
	cumulativeAmount: string
	sessionHash: Hex
	voucherSignature: Hex
}

/**
 * TopUp action: client topped up an existing channel.
 */
export interface TopUpPayload {
	action: 'topUp'
	channelId: Hex
	topUpTxHash: Hex
	cumulativeAmount: string
	sessionHash: Hex
	voucherSignature: Hex
}

/**
 * Voucher action: client submits a new cumulative payment voucher.
 */
export interface VoucherPayload {
	action: 'voucher'
	channelId: Hex
	cumulativeAmount: string
	sessionHash: Hex
	signature: Hex
}

/**
 * Close action: client requests channel closure.
 */
export interface ClosePayload {
	action: 'close'
	channelId: Hex
	cumulativeAmount: string
	sessionHash: Hex
	voucherSignature: Hex
}

/**
 * Stream credential payload (discriminated union).
 */
export type StreamCredentialPayload = OpenPayload | TopUpPayload | VoucherPayload | ClosePayload

/**
 * Stream receipt returned in Payment-Receipt header.
 */
export interface StreamReceipt {
	method: 'tempo'
	intent: 'stream'
	status: 'success'
	timestamp: string
	reference: string
	channelId: Hex
	acceptedCumulative: string
	spent: string
	units?: number
	txHash?: Hex
}
