import { type Credential, Method, type Receipt } from 'mpay'
import { Mpay } from 'mpay/server'
import type { Address, Hex, WalletClient } from 'viem'
import type { Config } from '../config.js'
import type { StreamCredentialPayload, StreamReceipt } from '../types/stream.js'
import { createStreamReceipt, toMpayReceipt } from './receipt.js'
import type { ChannelState, ChannelStorage, SessionState } from './storage.js'
import { tempoMethod } from './stream-intent.js'
import { computeSessionHash, parseVoucherFromPayload, verifyVoucher } from './voucher.js'

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

			// Compute expected sessionHash
			const expectedSessionHash = computeSessionHash(challenge.id)

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
						expectedSessionHash,
						methodDetails,
						credential.source,
					)
					break

				case 'topUp':
					streamReceipt = await handleTopUp(storage, challenge, payload, expectedSessionHash, methodDetails)
					break

				case 'voucher':
					streamReceipt = await handleVoucher(storage, config, challenge, payload, expectedSessionHash, methodDetails)
					break

				case 'close':
					streamReceipt = await handleClose(storage, walletClient, challenge, payload, expectedSessionHash, methodDetails)
					break

				default:
					throw new Error(`Unknown action: ${(payload as { action: string }).action}`)
			}

			// Convert to mpay Receipt format
			return toMpayReceipt(streamReceipt)
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
 * Handle 'open' action - verify channel opening and initial voucher.
 * Idempotent: if channel already exists, updates it instead of failing.
 */
async function handleOpen(
	storage: ChannelStorage,
	config: Config,
	challenge: Challenge.Challenge,
	payload: StreamCredentialPayload & { action: 'open' },
	expectedSessionHash: Hex,
	methodDetails: { escrowContract: Address; chainId: number },
	source?: string,
): Promise<StreamReceipt> {
	// Verify sessionHash
	if (payload.sessionHash !== expectedSessionHash) {
		throw new Error('sessionHash mismatch')
	}

	const voucher = parseVoucherFromPayload(
		payload.channelId,
		payload.cumulativeAmount,
		payload.sessionHash,
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

	// Check if channel already exists (idempotent open)
	const existingChannel = await storage.getChannel(payload.channelId)

	if (existingChannel) {
		// Channel exists - update if voucher is higher
		if (voucher.cumulativeAmount > existingChannel.highestVoucherAmount) {
			existingChannel.highestVoucherAmount = voucher.cumulativeAmount
			existingChannel.highestVoucher = voucher
			await storage.setChannel(payload.channelId, existingChannel)
		}

		// Get or create session, preserving existing spent amount
		const session = await storage.getOrCreateSession(challenge.id, payload.channelId)
		session.acceptedCumulative = voucher.cumulativeAmount
		await storage.setSession(challenge.id, session)

		return createStreamReceipt({
			challengeId: challenge.id,
			channelId: payload.channelId,
			acceptedCumulative: voucher.cumulativeAmount,
			spent: session.spent,
			units: session.units,
		})
	}

	// Create new channel state
	const channelState: ChannelState = {
		channelId: payload.channelId,
		payer: signerAddress as Address,
		payee: config.destinationAddress,
		token: config.alphaUsd,
		authorizedSigner: signerAddress as Address,
		deposit: voucher.cumulativeAmount,
		settled: 0n,
		highestVoucherAmount: voucher.cumulativeAmount,
		highestVoucher: voucher,
		createdAt: new Date(),
	}

	await storage.setChannel(payload.channelId, channelState)

	// Create session state
	const session = await storage.getOrCreateSession(challenge.id, payload.channelId)
	session.acceptedCumulative = voucher.cumulativeAmount
	await storage.setSession(challenge.id, session)

	return createStreamReceipt({
		challengeId: challenge.id,
		channelId: payload.channelId,
		acceptedCumulative: voucher.cumulativeAmount,
		spent: 0n,
		units: 0,
	})
}

/**
 * Handle 'topUp' action - verify top-up and update channel state.
 */
async function handleTopUp(
	storage: ChannelStorage,
	challenge: Challenge.Challenge,
	payload: StreamCredentialPayload & { action: 'topUp' },
	expectedSessionHash: Hex,
	methodDetails: { escrowContract: Address; chainId: number },
): Promise<StreamReceipt> {
	// Verify sessionHash
	if (payload.sessionHash !== expectedSessionHash) {
		throw new Error('sessionHash mismatch')
	}

	// Get existing channel
	const channel = await storage.getChannel(payload.channelId)
	if (!channel) {
		throw new Error('Channel not found')
	}

	const voucher = parseVoucherFromPayload(
		payload.channelId,
		payload.cumulativeAmount,
		payload.sessionHash,
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

	// Update channel state with new deposit (implied by higher voucher)
	if (voucher.cumulativeAmount > channel.highestVoucherAmount) {
		channel.highestVoucherAmount = voucher.cumulativeAmount
		channel.highestVoucher = voucher
	}
	await storage.setChannel(payload.channelId, channel)

	// Update session
	const session = await storage.getOrCreateSession(challenge.id, payload.channelId)
	session.acceptedCumulative = voucher.cumulativeAmount
	await storage.setSession(challenge.id, session)

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
	expectedSessionHash: Hex,
	methodDetails: { escrowContract: Address; chainId: number },
): Promise<StreamReceipt> {
	// Verify sessionHash
	if (payload.sessionHash !== expectedSessionHash) {
		throw new Error('sessionHash mismatch')
	}

	// Get channel
	const channel = await storage.getChannel(payload.channelId)
	if (!channel) {
		throw new Error('Channel not found')
	}

	const voucher = parseVoucherFromPayload(
		payload.channelId,
		payload.cumulativeAmount,
		payload.sessionHash,
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

	// Update channel state
	channel.highestVoucherAmount = voucher.cumulativeAmount
	channel.highestVoucher = voucher
	await storage.setChannel(payload.channelId, channel)

	// Update session
	const session = await storage.getOrCreateSession(challenge.id, payload.channelId)
	session.acceptedCumulative = voucher.cumulativeAmount
	await storage.setSession(challenge.id, session)

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
	expectedSessionHash: Hex,
	methodDetails: { escrowContract: Address; chainId: number },
): Promise<StreamReceipt> {
	// Verify sessionHash
	if (payload.sessionHash !== expectedSessionHash) {
		throw new Error('sessionHash mismatch')
	}

	// Get channel
	const channel = await storage.getChannel(payload.channelId)
	if (!channel) {
		throw new Error('Channel not found')
	}

	const voucher = parseVoucherFromPayload(
		payload.channelId,
		payload.cumulativeAmount,
		payload.sessionHash,
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

	// Update channel state with final voucher
	if (voucher.cumulativeAmount > channel.highestVoucherAmount) {
		channel.highestVoucherAmount = voucher.cumulativeAmount
		channel.highestVoucher = voucher
	}

	// Get session for final accounting
	const session = await storage.getOrCreateSession(challenge.id, payload.channelId)
	session.acceptedCumulative = voucher.cumulativeAmount

	// TODO: Submit on-chain close transaction if walletClient available
	let txHash: Hex | undefined
	if (walletClient) {
		// In production, submit the close transaction here
		// txHash = await submitCloseTransaction(walletClient, channel, voucher)
	}

	// Clean up storage
	await storage.deleteChannel(payload.channelId)
	await storage.deleteSession(challenge.id)

	return createStreamReceipt({
		challengeId: challenge.id,
		channelId: payload.channelId,
		acceptedCumulative: voucher.cumulativeAmount,
		spent: session.spent,
		units: session.units,
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
 * Update session spending (called during streaming).
 */
export async function updateSessionSpending(
	storage: ChannelStorage,
	challengeId: string,
	spent: bigint,
	units: number,
): Promise<SessionState | null> {
	const session = await storage.getSession(challengeId)
	if (!session) return null

	session.spent = spent
	session.units = units
	await storage.setSession(challengeId, session)

	return session
}

/**
 * Get available balance for a session.
 */
export async function getAvailableBalance(
	storage: ChannelStorage,
	challengeId: string,
): Promise<bigint> {
	const session = await storage.getSession(challengeId)
	if (!session) return 0n

	return session.acceptedCumulative - session.spent
}

/**
 * Type for the stream server returned by streamServer().
 */
export type StreamServer = ReturnType<typeof streamServer>

/**
 * Type for the payment handler returned by createPaymentHandler().
 */
export type PaymentHandler = ReturnType<typeof createPaymentHandler>
