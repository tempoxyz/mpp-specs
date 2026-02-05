import { Intent, Method, MethodIntent, z } from 'mpay'

/**
 * Base stream intent for pay-as-you-go streaming payments.
 */
const streamIntent = Intent.from({
	name: 'stream',
	schema: {
		request: z.object({
			amount: z.amount(),
			unitType: z.string(),
			currency: z.string(),
			recipient: z.optional(z.string()),
			suggestedDeposit: z.optional(z.amount()),
		}),
	},
})

/**
 * Tempo-specific stream method intent.
 *
 * Adds method details for escrow contract, channel configuration,
 * and credential payloads for open/voucher/close actions.
 */
export const tempoStreamIntent = MethodIntent.fromIntent(streamIntent, {
	method: 'tempo',
	schema: {
		credential: {
			payload: z.discriminatedUnion('action', [
				// Open: client opened channel on-chain
				z.object({
					action: z.literal('open'),
					type: z.union([z.literal('hash'), z.literal('transaction')]),
					channelId: z.hash(),
					openTxHash: z.optional(z.hash()),
					signature: z.optional(z.signature()),
					authorizedSigner: z.optional(z.string()),
					cumulativeAmount: z.amount(),
					sessionHash: z.hash(),
					voucherSignature: z.signature(),
				}),
				// TopUp: client topped up existing channel
				z.object({
					action: z.literal('topUp'),
					channelId: z.hash(),
					topUpTxHash: z.hash(),
					cumulativeAmount: z.amount(),
					sessionHash: z.hash(),
					voucherSignature: z.signature(),
				}),
				// Voucher: client submits cumulative payment voucher
				z.object({
					action: z.literal('voucher'),
					channelId: z.hash(),
					cumulativeAmount: z.amount(),
					sessionHash: z.hash(),
					signature: z.signature(),
				}),
				// Close: client requests channel closure
				z.object({
					action: z.literal('close'),
					channelId: z.hash(),
					cumulativeAmount: z.amount(),
					sessionHash: z.hash(),
					voucherSignature: z.signature(),
				}),
			]),
		},
		request: {
			methodDetails: z.object({
				escrowContract: z.string(),
				channelId: z.optional(z.hash()),
				minVoucherDelta: z.optional(z.amount()),
				chainId: z.optional(z.number()),
			}),
			requires: ['recipient'],
		},
	},
})

/**
 * Tempo method with stream intent for use with Method.toClient() and Method.toServer().
 */
export const tempoMethod = Method.from({
	name: 'tempo',
	intents: {
		stream: tempoStreamIntent,
	},
})

export type TempoMethod = typeof tempoMethod
