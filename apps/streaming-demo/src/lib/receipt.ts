import { Base64 } from 'ox'
import type { Hex } from 'viem'
import type { StreamReceipt } from '../types/stream.js'

/**
 * Create a stream receipt.
 */
export function createStreamReceipt(params: {
	challengeId: string
	channelId: Hex
	acceptedCumulative: bigint
	spent: bigint
	units?: number
	txHash?: Hex
}): StreamReceipt {
	return {
		method: 'tempo',
		intent: 'stream',
		status: 'success',
		timestamp: new Date().toISOString(),
		reference: params.challengeId,
		channelId: params.channelId,
		acceptedCumulative: params.acceptedCumulative.toString(),
		spent: params.spent.toString(),
		units: params.units,
		txHash: params.txHash,
	}
}

/**
 * Serialize a stream receipt to the Payment-Receipt header format.
 */
export function serializeStreamReceipt(receipt: StreamReceipt): string {
	const json = JSON.stringify(receipt)
	return Base64.fromString(json, { pad: false, url: true })
}

/**
 * Deserialize a Payment-Receipt header value to a stream receipt.
 */
export function deserializeStreamReceipt(encoded: string): StreamReceipt {
	const json = Base64.toString(encoded)
	return JSON.parse(json) as StreamReceipt
}

/**
 * Format stream receipt for the standard mpay Receipt format.
 * This allows interoperability with mpay's Receipt.fromResponse().
 */
export function toMpayReceipt(receipt: StreamReceipt): {
	method: string
	reference: string
	status: 'success'
	timestamp: string
} {
	return {
		method: receipt.method,
		reference: receipt.reference,
		status: receipt.status,
		timestamp: receipt.timestamp,
	}
}
