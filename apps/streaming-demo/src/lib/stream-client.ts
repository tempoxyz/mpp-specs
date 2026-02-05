import { Credential, Method, z } from 'mpay'
import type { Account, Address, Hex, WalletClient } from 'viem'
import type { StreamCredentialPayload } from '../types/stream.js'
import { tempoMethod } from './stream-intent.js'
import { computeSessionHash, deriveChannelId, signVoucher } from './voucher.js'

/**
 * Context schema for stream credential creation.
 * This is passed per-request to the createCredential function.
 */
export const streamContextSchema = z.object({
	/** Action to perform: open, topUp, voucher, or close */
	action: z.enum(['open', 'topUp', 'voucher', 'close']),
	/** Cumulative amount for the voucher */
	cumulativeAmount: z.bigint(),
	/** Transaction hash for open action (optional - can derive channelId) */
	openTxHash: z.optional(z.string()),
	/** Transaction hash for topUp action */
	topUpTxHash: z.optional(z.string()),
	/** Resource hash for session binding (optional) */
	resourceHash: z.optional(z.string()),
	/** Override authorized signer (defaults to account address) */
	authorizedSigner: z.optional(z.string()),
})

export type StreamContext = z.infer<typeof streamContextSchema>

/**
 * Creates a stream payment client using the mpay Method.toClient() pattern.
 *
 * The client derives channelId deterministically from the payer address
 * and server realm, eliminating the need for client-side persistence.
 *
 * @example
 * ```ts
 * const client = streamClient({
 *   account: privateKeyToAccount('0x...'),
 *   walletClient,
 *   escrowContract: '0x...',
 *   chainId: 42431,
 * })
 *
 * // Use with Fetch.from() or Mpay.create()
 * const paidFetch = Fetch.from({ methods: [client] })
 * ```
 */
export function streamClient(parameters: streamClient.Parameters) {
	const { account, walletClient, escrowContract, chainId } = parameters

	return Method.toClient(tempoMethod, {
		context: streamContextSchema,

		async createCredential({ challenge, context }) {
			const { action, cumulativeAmount, openTxHash, topUpTxHash, resourceHash, authorizedSigner } =
				context

			// Derive channelId deterministically from account address + realm
			// This eliminates the need for client-side persistence
			const channelId = deriveChannelId(account.address, challenge.realm)

			// Compute sessionHash = keccak256(challengeId, resourceHash)
			// This binds the voucher to this specific session
			const sessionHash = computeSessionHash(challenge.id, resourceHash as Hex | undefined)

			// Sign voucher with sessionHash
			const signature = await signVoucher(
				walletClient,
				account,
				{
					channelId,
					cumulativeAmount,
					sessionHash,
				},
				escrowContract,
				chainId,
			)

			let payload: StreamCredentialPayload

			switch (action) {
				case 'open':
					payload = {
						action: 'open',
						type: openTxHash ? 'hash' : 'transaction',
						channelId,
						openTxHash: openTxHash as Hex | undefined,
						authorizedSigner: (authorizedSigner as Address) ?? account.address,
						cumulativeAmount: cumulativeAmount.toString(),
						sessionHash,
						voucherSignature: signature,
					}
					break

				case 'topUp':
					if (!topUpTxHash) {
						throw new Error('topUpTxHash required for topUp action')
					}
					payload = {
						action: 'topUp',
						channelId,
						topUpTxHash: topUpTxHash as Hex,
						cumulativeAmount: cumulativeAmount.toString(),
						sessionHash,
						voucherSignature: signature,
					}
					break

				case 'voucher':
					payload = {
						action: 'voucher',
						channelId,
						cumulativeAmount: cumulativeAmount.toString(),
						sessionHash,
						signature,
					}
					break

				case 'close':
					payload = {
						action: 'close',
						channelId,
						cumulativeAmount: cumulativeAmount.toString(),
						sessionHash,
						voucherSignature: signature,
					}
					break
			}

			return Credential.serialize({
				challenge,
				payload,
				source: `did:pkh:eip155:${chainId}:${account.address}`,
			})
		},
	})
}

export declare namespace streamClient {
	type Parameters = {
		/** Account to sign vouchers with */
		account: Account
		/** Wallet client for signing */
		walletClient: WalletClient
		/** Escrow contract address */
		escrowContract: Address
		/** Chain ID */
		chainId: number
	}
}

/**
 * Type for the stream client returned by streamClient().
 */
export type StreamClient = ReturnType<typeof streamClient>
