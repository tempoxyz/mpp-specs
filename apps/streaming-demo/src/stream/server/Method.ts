import { type Challenge, type Credential, Method, type Receipt } from 'mpay'
import { Mpay } from 'mpay/server'
import type { Address, Hex, WalletClient } from 'viem'
import type { Config } from '../../config.js'
import type { StreamCredentialPayload, StreamReceipt } from '../Types.js'
import { createStreamReceipt } from '../Receipt.js'
import type { ChannelStorage, SessionState } from '../Storage.js'
import { tempoMethod } from '../Method.js'
import { getOnChainChannel, verifyTopUpTransaction } from '../Chain.js'
import { parseVoucherFromPayload, verifyVoucher } from '../Voucher.js'

/**
 * Options for creating a stream server.
 */
export interface StreamServerOptions {
	config: Config
	storage: ChannelStorage
	walletClient?: WalletClient
}

/**
 * Creates a stream payment server using the mpay Method.toServer() pattern.
 *
 * @example
 * ```ts
 * const server = streamServer({
 *   config,
 *   storage: new InMemoryStorage(),
 * })
 * ```
 */
export function streamServer(options: StreamServerOptions) {
	const { config, storage, walletClient } = options

	return Method.toServer(tempoMethod, {
		defaults: {
			recipient: config.destinationAddress,
			currency: config.alphaUsd,
			escrowContract: config.escrowContract,
			chainId: config.chainId,
		},

		async verify({ credential }): Promise<Receipt.Receipt> {
			const { challenge, payload } = credential as Credential.Credential<StreamCredentialPayload>

			// Note: Challenge HMAC verification is already performed by Mpay.create()
			// Note: Payload schema validation is already performed by Mpay.create()

			// Get method details from challenge request
			const methodDetails = challenge.request.methodDetails as {
				escrowContract: Address
				chainId: number
			}

			let streamReceipt: StreamReceipt

			switch (payload.action) {
				case 'open':
					streamReceipt = await handleOpen(
						storage,
						config,
						challenge,
						payload,
						methodDetails,
						credential.source,
					)
					break

				case 'topUp':
					streamReceipt = await handleTopUp(storage, config, challenge, payload, methodDetails)
					break

				case 'voucher':
					streamReceipt = await handleVoucher(storage, config, challenge, payload, methodDetails)
					break

				case 'close':
					streamReceipt = await handleClose(storage, walletClient, challenge, payload, methodDetails)
					break

				default:
					throw new Error(`Unknown action: ${(payload as { action: string }).action}`)
			}

			// StreamReceipt is a superset of Receipt.Receipt
			return streamReceipt as unknown as Receipt.Receipt
		},
	})
}

/**
 * Creates a payment handler using Mpay.create() with the stream server.
 *
 * This is the main entry point for integrating payments into routes.
 *
 * @example
 * ```ts
 * const payment = createPaymentHandler(config, storage)
 *
 * // In route handler:
 * const result = await payment.stream({
 *   request: { amount: '25', unitType: 'llm_token', ... }
 * })(c.req.raw)
 *
 * if (result.status === 402) return result.challenge
 * return result.withReceipt(myResponse)
 * ```
 */
export function createPaymentHandler(
	config: Config,
	storage: ChannelStorage,
	walletClient?: WalletClient,
) {
	const method = streamServer({ config, storage, walletClient })

	return Mpay.create({
		method,
		realm: config.realm,
		secretKey: config.challengeSecret,
	})
}

/**
 * Atomically upsert a session with a new acceptedCumulative.
 * Creates the session if it doesn't exist, preserving spent/units if it does.
 */
function acceptVoucher(
	storage: ChannelStorage,
	challengeId: string,
	channelId: Hex,
	acceptedCumulative: bigint,
): Promise<SessionState | null> {
	return storage.updateSession(challengeId, (existing) => {
		const base: SessionState = existing ?? {
			challengeId,
			channelId,
			acceptedCumulative: 0n,
			spent: 0n,
			units: 0,
			createdAt: new Date(),
		}
		return { ...base, acceptedCumulative }
	})
}

/**
 * Handle 'open' action - verify channel opening and initial voucher.
 * Idempotent: if channel already exists, updates it instead of failing.
 */
async function handleOpen(
	storage: ChannelStorage,
	config: Config,
	challenge: Challenge.Challenge,
	payload: StreamCredentialPayload & { action: 'open' },
	methodDetails: { escrowContract: Address; chainId: number },
	source?: string,
): Promise<StreamReceipt> {
	const voucher = parseVoucherFromPayload(
		payload.channelId,
		payload.cumulativeAmount,
		payload.voucherSignature,
	)

	// Determine the authorized signer (payer or delegated)
	const signerAddress = payload.authorizedSigner ?? extractAddressFromDid(source)

	if (!signerAddress) {
		throw new Error('Cannot determine signer address')
	}

	// Verify voucher signature
	const isValid = await verifyVoucher(
		methodDetails.escrowContract,
		methodDetails.chainId,
		voucher,
		signerAddress as Address,
	)

	if (!isValid) {
		throw new Error('Invalid voucher signature')
	}

	// Query on-chain channel state for deposit tracking
	const onChain = await getOnChainChannel(
		config.rpcUrl,
		methodDetails.escrowContract,
		payload.channelId,
	)

	// Verify voucher amount does not exceed on-chain deposit
	if (voucher.cumulativeAmount > onChain.deposit) {
		throw new Error('Voucher amount exceeds on-chain deposit')
	}

	// Atomically create or update channel
	await storage.updateChannel(payload.channelId, (existing) => {
		if (existing) {
			if (voucher.cumulativeAmount > existing.highestVoucherAmount) {
				return {
					...existing,
					deposit: onChain.deposit,
					highestVoucherAmount: voucher.cumulativeAmount,
					highestVoucher: voucher,
				}
			}
			return { ...existing, deposit: onChain.deposit }
		}
		return {
			channelId: payload.channelId,
			payer: signerAddress as Address,
			payee: config.destinationAddress,
			token: config.alphaUsd,
			authorizedSigner: signerAddress as Address,
			deposit: onChain.deposit,
			highestVoucherAmount: voucher.cumulativeAmount,
			highestVoucher: voucher,
			createdAt: new Date(),
		}
	})

	const session = await acceptVoucher(storage, challenge.id, payload.channelId, voucher.cumulativeAmount)
	if (!session) throw new Error('Failed to create session')

	return createStreamReceipt({
		challengeId: challenge.id,
		channelId: payload.channelId,
		acceptedCumulative: voucher.cumulativeAmount,
		spent: session.spent,
		units: session.units,
	})
}

/**
 * Handle 'topUp' action - verify top-up and update channel state.
 */
async function handleTopUp(
	storage: ChannelStorage,
	config: Config,
	challenge: Challenge.Challenge,
	payload: StreamCredentialPayload & { action: 'topUp' },
	methodDetails: { escrowContract: Address; chainId: number },
): Promise<StreamReceipt> {
	// Get existing channel (need authorizedSigner for verification)
	const channel = await storage.getChannel(payload.channelId)
	if (!channel) {
		throw new Error('Channel not found')
	}

	// Verify the topUp transaction on-chain (compare against tracked deposit)
	const { deposit: onChainDeposit } = await verifyTopUpTransaction(
		config.rpcUrl,
		methodDetails.escrowContract,
		payload.channelId,
		payload.topUpTxHash,
		channel.deposit,
	)

	const voucher = parseVoucherFromPayload(
		payload.channelId,
		payload.cumulativeAmount,
		payload.voucherSignature,
	)

	// Verify voucher amount does not exceed on-chain deposit
	if (voucher.cumulativeAmount > onChainDeposit) {
		throw new Error('Voucher amount exceeds on-chain deposit')
	}

	// Verify voucher is increasing
	if (voucher.cumulativeAmount <= channel.highestVoucherAmount) {
		throw new Error('Voucher amount must be increasing')
	}

	// Verify minimum delta
	const delta = voucher.cumulativeAmount - channel.highestVoucherAmount
	if (delta < config.minVoucherDelta) {
		throw new Error(`Voucher delta ${delta} below minimum ${config.minVoucherDelta}`)
	}

	// Verify voucher signature
	const isValid = await verifyVoucher(
		methodDetails.escrowContract,
		methodDetails.chainId,
		voucher,
		channel.authorizedSigner,
	)

	if (!isValid) {
		throw new Error('Invalid voucher signature')
	}

	// Atomically update channel state with new deposit and voucher
	await storage.updateChannel(payload.channelId, (current) => {
		if (!current) throw new Error('Channel not found')
		if (voucher.cumulativeAmount > current.highestVoucherAmount) {
			return {
				...current,
				deposit: onChainDeposit,
				highestVoucherAmount: voucher.cumulativeAmount,
				highestVoucher: voucher,
			}
		}
		return { ...current, deposit: onChainDeposit }
	})

	const session = await acceptVoucher(storage, challenge.id, payload.channelId, voucher.cumulativeAmount)
	if (!session) throw new Error('Failed to create session')

	return createStreamReceipt({
		challengeId: challenge.id,
		channelId: payload.channelId,
		acceptedCumulative: voucher.cumulativeAmount,
		spent: session.spent,
		units: session.units,
	})
}

/**
 * Handle 'voucher' action - verify and accept a new voucher.
 */
async function handleVoucher(
	storage: ChannelStorage,
	config: Config,
	challenge: Challenge.Challenge,
	payload: StreamCredentialPayload & { action: 'voucher' },
	methodDetails: { escrowContract: Address; chainId: number },
): Promise<StreamReceipt> {
	// Get channel (need authorizedSigner + highestVoucherAmount for verification)
	const channel = await storage.getChannel(payload.channelId)
	if (!channel) {
		throw new Error('Channel not found')
	}

	const voucher = parseVoucherFromPayload(
		payload.channelId,
		payload.cumulativeAmount,
		payload.signature,
	)

	// Verify voucher is increasing
	if (voucher.cumulativeAmount <= channel.highestVoucherAmount) {
		throw new Error('Voucher amount must be increasing')
	}

	// Verify minimum delta
	const delta = voucher.cumulativeAmount - channel.highestVoucherAmount
	if (delta < config.minVoucherDelta) {
		throw new Error(`Voucher delta ${delta} below minimum ${config.minVoucherDelta}`)
	}

	// Verify voucher signature
	const isValid = await verifyVoucher(
		methodDetails.escrowContract,
		methodDetails.chainId,
		voucher,
		channel.authorizedSigner,
	)

	if (!isValid) {
		throw new Error('Invalid voucher signature')
	}

	// Atomically update channel state — re-check inside callback to prevent regression
	await storage.updateChannel(payload.channelId, (current) => {
		if (!current) throw new Error('Channel not found')
		if (voucher.cumulativeAmount > current.highestVoucherAmount) {
			return { ...current, highestVoucherAmount: voucher.cumulativeAmount, highestVoucher: voucher }
		}
		return current
	})

	const session = await acceptVoucher(storage, challenge.id, payload.channelId, voucher.cumulativeAmount)
	if (!session) throw new Error('Failed to create session')

	return createStreamReceipt({
		challengeId: challenge.id,
		channelId: payload.channelId,
		acceptedCumulative: voucher.cumulativeAmount,
		spent: session.spent,
		units: session.units,
	})
}

/**
 * Handle 'close' action - verify final voucher and close channel.
 */
async function handleClose(
	storage: ChannelStorage,
	walletClient: WalletClient | undefined,
	challenge: Challenge.Challenge,
	payload: StreamCredentialPayload & { action: 'close' },
	methodDetails: { escrowContract: Address; chainId: number },
): Promise<StreamReceipt> {
	// Get channel (need authorizedSigner for verification)
	const channel = await storage.getChannel(payload.channelId)
	if (!channel) {
		throw new Error('Channel not found')
	}

	const voucher = parseVoucherFromPayload(
		payload.channelId,
		payload.cumulativeAmount,
		payload.voucherSignature,
	)

	// Verify voucher signature
	const isValid = await verifyVoucher(
		methodDetails.escrowContract,
		methodDetails.chainId,
		voucher,
		channel.authorizedSigner,
	)

	if (!isValid) {
		throw new Error('Invalid voucher signature')
	}

	// Get session for final accounting, then delete both
	const session = await storage.getSession(challenge.id)

	// TODO: Submit on-chain close transaction if walletClient available
	let txHash: Hex | undefined
	if (walletClient) {
		// In production, submit the close transaction here
		// txHash = await submitCloseTransaction(walletClient, channel, voucher)
	}

	// Clean up storage
	await storage.updateChannel(payload.channelId, () => null)
	await storage.updateSession(challenge.id, () => null)

	return createStreamReceipt({
		challengeId: challenge.id,
		channelId: payload.channelId,
		acceptedCumulative: voucher.cumulativeAmount,
		spent: session?.spent ?? 0n,
		units: session?.units ?? 0,
		txHash,
	})
}

/**
 * Extract address from a DID string.
 * Format: did:pkh:eip155:{chainId}:{address}
 */
function extractAddressFromDid(did?: string): Address | undefined {
	if (!did) return undefined
	const match = did.match(/did:pkh:eip155:\d+:(0x[a-fA-F0-9]{40})/)
	return match?.[1] as Address | undefined
}

/**
 * Type for the stream server returned by streamServer().
 */
export type StreamServer = ReturnType<typeof streamServer>

/**
 * Type for the payment handler returned by createPaymentHandler().
 */
export type PaymentHandler = ReturnType<typeof createPaymentHandler>
