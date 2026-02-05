import {
	createStreamChannelServer,
	recoverCloseRequestSigner,
	type ServerChannelState,
	type SignedVoucher,
	type StreamChannelServer,
	type StreamCredentialPayload,
	type StreamRequest,
} from '@tempo/stream-channels'
import { type Address, createPublicClient, createWalletClient, type Hex } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { tempoModerato } from 'viem/chains'
import type { Env, PartnerConfig, StreamingConfig } from './config.js'
import { httpWithAuth } from './rpc.js'

export type { StreamingConfig }

/**
 * Active streaming channel state.
 */
interface ActiveChannel {
	channelId: Hex
	escrowContract: Address
	partner: PartnerConfig
	state: ServerChannelState
	createdAt: Date
}

// In-memory channel store (use Durable Objects in production)
const activeChannels = new Map<Hex, ActiveChannel>()

// Server instance cache per chain
let serverInstance: StreamChannelServer | null = null

/**
 * Get or create the stream channel server.
 */
function getStreamServer(env: Env, serverAddress: Address): StreamChannelServer {
	if (serverInstance) {
		return serverInstance
	}

	const publicClient = createPublicClient({
		chain: tempoModerato,
		transport: httpWithAuth(env.TEMPO_RPC_URL),
	})

	const walletClient = env.SETTLER_PRIVATE_KEY
		? createWalletClient({
				account: privateKeyToAccount(env.SETTLER_PRIVATE_KEY as Hex),
				chain: tempoModerato,
				transport: httpWithAuth(env.TEMPO_RPC_URL),
			})
		: null

	serverInstance = createStreamChannelServer(
		publicClient as Parameters<typeof createStreamChannelServer>[0],
		walletClient,
		serverAddress,
		tempoModerato.id,
		tempoModerato,
	)

	return serverInstance
}

/**
 * Re-hydrate channel state from on-chain after worker restart.
 * This allows vouchers to work even if the in-memory state was lost.
 * Note: We start with highestVoucherAmount = settled (from chain), so any
 * vouchers already submitted but not settled will be re-accepted. This is
 * fine for a demo - worst case we double-grant access for already-paid requests.
 */
async function rehydrateChannelFromChain(
	env: Env,
	partner: PartnerConfig,
	channelId: Hex,
	streamConfig: StreamingConfig,
): Promise<{ valid: true; state: ServerChannelState } | { valid: false; error: string }> {
	const publicClient = createPublicClient({
		chain: tempoModerato,
		transport: httpWithAuth(env.TEMPO_RPC_URL),
	})

	try {
		const { TempoStreamChannelABI } = await import('@tempo/stream-channels')

		const result = await publicClient.readContract({
			address: streamConfig.escrowContract,
			abi: TempoStreamChannelABI,
			functionName: 'getChannel',
			args: [channelId],
		})

		if (result.payer === '0x0000000000000000000000000000000000000000') {
			return { valid: false, error: 'Channel does not exist on-chain' }
		}

		if (result.finalized) {
			return { valid: false, error: 'Channel is finalized' }
		}

		// Initialize state from on-chain data
		// Use 'settled' as the starting point for highestVoucherAmount
		const state: ServerChannelState = {
			channelId,
			payer: result.payer,
			payee: result.payee,
			token: result.token,
			authorizedSigner: result.authorizedSigner,
			deposit: result.deposit,
			settled: result.settled,
			highestVoucherAmount: result.settled, // Start from settled amount
			highestVoucher: null,
		}

		// Store in memory for future requests
		// FIXME: Vouchers are stored in-memory only and will be lost on worker restart.
		// This means vouchers submitted between restarts may be re-accepted (double-granting access).
		// To fix: Add Durable Objects (PAYMENT_CHANNEL) and D1 (CHANNELS_DB) bindings to wrangler.jsonc.
		// See: migrations/0001_create_channels.sql and src/durable-objects/PaymentChannel.ts
		console.warn(
			`[streaming] FIXME: Re-hydrating channel ${channelId} from chain. ` +
				`Voucher history is not persisted - previous vouchers since last settlement may be re-accepted. ` +
				`Configure Durable Objects + D1 for production use.`,
		)
		activeChannels.set(channelId, {
			channelId,
			escrowContract: streamConfig.escrowContract,
			partner,
			state,
			createdAt: new Date(),
		})

		// Also register with the server instance
		const server = getStreamServer(env, partner.destination)
		// The server's internal channels map needs the state too
		// We access it via the verifyChannelOpen path by creating a minimal open
		;(server as any).channels?.set(channelId, state)

		return { valid: true, state }
	} catch (e) {
		return { valid: false, error: `Failed to read channel from chain: ${e}` }
	}
}

/**
 * Create a stream request challenge for a partner.
 */
export function createStreamChallenge(
	env: Env,
	partner: PartnerConfig,
	streamConfig: StreamingConfig,
	voucherEndpointBase: string,
): StreamRequest {
	const server = getStreamServer(env, partner.destination)

	const request = server.createStreamRequest({
		escrowContract: streamConfig.escrowContract,
		asset: partner.asset,
		deposit: BigInt(streamConfig.defaultDeposit),
		voucherEndpoint: `${voucherEndpointBase}/${partner.slug}/voucher`,
		minVoucherDelta: BigInt(streamConfig.minVoucherDelta),
	})

	return request
}

/**
 * Verify channel opening and initialize tracking.
 */
export async function verifyChannelOpen(
	env: Env,
	partner: PartnerConfig,
	credential: StreamCredentialPayload,
	streamConfig: StreamingConfig,
): Promise<
	{ valid: true; channelId: Hex; state: ServerChannelState } | { valid: false; error: string }
> {
	if (credential.action !== 'open') {
		return { valid: false, error: 'Expected action=open for channel opening' }
	}

	const server = getStreamServer(env, partner.destination)

	// Convert voucher from credential format to SignedVoucher
	const voucher: SignedVoucher = {
		channelId: credential.channelId,
		cumulativeAmount: BigInt(credential.voucher.payload.message.cumulativeAmount),
		signature: credential.voucher.signature,
	}

	const result = await server.verifyChannelOpen(
		streamConfig.escrowContract,
		credential.channelId,
		credential.openTxHash,
		voucher,
	)

	if (!result.valid) {
		return { valid: false, error: result.error }
	}

	// Store active channel
	activeChannels.set(credential.channelId, {
		channelId: credential.channelId,
		escrowContract: streamConfig.escrowContract,
		partner,
		state: result.state,
		createdAt: new Date(),
	})

	return { valid: true, channelId: credential.channelId, state: result.state }
}

/**
 * Verify a voucher payment.
 */
export async function verifyVoucher(
	env: Env,
	partner: PartnerConfig,
	credential: StreamCredentialPayload,
	streamConfig: StreamingConfig,
	requiredAmount: bigint,
): Promise<
	{ valid: true; state: ServerChannelState; newPayment: bigint } | { valid: false; error: string }
> {
	if (credential.action !== 'voucher') {
		return { valid: false, error: 'Expected action=voucher' }
	}

	const server = getStreamServer(env, partner.destination)

	// Convert voucher from credential format
	const voucher: SignedVoucher = {
		channelId: credential.channelId,
		cumulativeAmount: BigInt(credential.voucher.payload.message.cumulativeAmount),
		signature: credential.voucher.signature,
	}

	// Get current state to calculate delta
	let currentState = server.getChannelState(credential.channelId)

	// If channel not in memory, try to re-hydrate from chain (happens after worker restart)
	if (!currentState) {
		const rehydrated = await rehydrateChannelFromChain(
			env,
			partner,
			credential.channelId,
			streamConfig,
		)
		if (!rehydrated.valid) {
			return { valid: false, error: rehydrated.error }
		}
		currentState = rehydrated.state
	}

	const previousAmount = currentState.highestVoucherAmount

	// Verify voucher
	const result = await server.verifyVoucher(
		streamConfig.escrowContract,
		voucher,
		BigInt(streamConfig.minVoucherDelta),
	)

	if (!result.valid) {
		return { valid: false, error: result.error }
	}

	// Calculate new payment delta
	const newPayment = voucher.cumulativeAmount - previousAmount

	// Verify payment covers required amount
	if (newPayment < requiredAmount) {
		return {
			valid: false,
			error: `Payment ${newPayment} below required ${requiredAmount}`,
		}
	}

	// Update active channel
	const activeChannel = activeChannels.get(credential.channelId)
	if (activeChannel) {
		activeChannel.state = result.state
	}

	return { valid: true, state: result.state, newPayment }
}

/**
 * Verify a close request voucher (allows reusing the current highest voucher).
 */
export async function verifyCloseRequest(
	env: Env,
	partner: PartnerConfig,
	credential: StreamCredentialPayload,
	streamConfig: StreamingConfig,
): Promise<{ valid: true; state: ServerChannelState } | { valid: false; error: string }> {
	if (credential.action !== 'close') {
		return { valid: false, error: 'Expected action=close' }
	}

	const server = getStreamServer(env, partner.destination)

	let currentState = server.getChannelState(credential.channelId)

	if (!currentState) {
		const rehydrated = await rehydrateChannelFromChain(
			env,
			partner,
			credential.channelId,
			streamConfig,
		)
		if (!rehydrated.valid) {
			return { valid: false, error: rehydrated.error }
		}
		currentState = rehydrated.state
	}

	try {
		const closeRequest = credential.closeRequest
		if (closeRequest.payload.message.channelId !== credential.channelId) {
			return { valid: false, error: 'Close request channelId mismatch' }
		}
		const signer = await recoverCloseRequestSigner(streamConfig.escrowContract, tempoModerato.id, {
			channelId: closeRequest.payload.message.channelId,
			signature: closeRequest.signature,
		})
		const expectedSigner =
			currentState.authorizedSigner !== '0x0000000000000000000000000000000000000000'
				? currentState.authorizedSigner
				: currentState.payer
		if (signer.toLowerCase() !== expectedSigner.toLowerCase()) {
			return {
				valid: false,
				error: 'Close request signer must be authorizedSigner (or payer if not set)',
			}
		}
	} catch {
		return { valid: false, error: 'Invalid close request signature' }
	}

	const activeChannel = activeChannels.get(credential.channelId)
	if (activeChannel) {
		activeChannel.state = currentState
	}

	return { valid: true, state: currentState }
}

/**
 * Close a channel on-chain (server-side).
 */
export async function closeChannel(
	env: Env,
	partner: PartnerConfig,
	streamConfig: StreamingConfig,
	channelId: Hex,
): Promise<
	| {
			success: true
			txHash: Hex
			settledToPayee: bigint
			refundedToPayer: bigint
			alreadyClosed?: boolean
	  }
	| { success: false; error: string }
> {
	const server = getStreamServer(env, partner.destination)
	return server.close(streamConfig.escrowContract, channelId)
}

/**
 * Get active channel state.
 */
export function getActiveChannel(channelId: Hex): ActiveChannel | undefined {
	return activeChannels.get(channelId)
}

/**
 * Get remaining channel balance.
 */
export function getRemainingBalance(env: Env, channelId: Hex, serverAddress: Address): bigint {
	const server = getStreamServer(env, serverAddress)
	return server.getRemainingDeposit(channelId)
}

/**
 * Get unsettled amount that can be claimed.
 */
export function getUnsettledAmount(env: Env, channelId: Hex, serverAddress: Address): bigint {
	const server = getStreamServer(env, serverAddress)
	return server.getUnsettledAmount(channelId)
}

/**
 * Parse a stream credential from the Authorization header.
 */
export function parseStreamCredential(credential: unknown): StreamCredentialPayload | null {
	if (!credential || typeof credential !== 'object') {
		return null
	}

	const cred = credential as Record<string, unknown>

	if (cred.type !== 'stream') {
		return null
	}

	if (!cred.action || !['open', 'voucher', 'close'].includes(cred.action as string)) {
		return null
	}

	if (typeof cred.channelId !== 'string') {
		return null
	}

	if (cred.action === 'close') {
		if (!cred.closeRequest || typeof cred.closeRequest !== 'object') {
			return null
		}
	} else if (!cred.voucher || typeof cred.voucher !== 'object') {
		return null
	}

	return cred as unknown as StreamCredentialPayload
}

/**
 * Format stream challenge for WWW-Authenticate header.
 */
export function formatStreamChallenge(request: StreamRequest): string {
	const params = [
		`realm="payments/stream"`,
		`method="tempo"`,
		`intent="stream"`,
		`escrowContract="${request.escrowContract}"`,
		`asset="${request.asset}"`,
		`destination="${request.destination}"`,
		`deposit="${request.deposit}"`,
		`voucherEndpoint="${request.voucherEndpoint}"`,
	]

	if (request.salt) {
		params.push(`salt="${request.salt}"`)
	}
	if (request.channelId) {
		params.push(`channelId="${request.channelId}"`)
	}
	if (request.minVoucherDelta) {
		params.push(`minVoucherDelta="${request.minVoucherDelta}"`)
	}

	return `Payment ${params.join(', ')}`
}

/**
 * Format stream receipt for Payment-Receipt header.
 */
export function formatStreamReceipt(
	channelId: Hex,
	cumulativeAmount: bigint,
	remaining: bigint,
): string {
	return JSON.stringify({
		status: 'success',
		method: 'tempo',
		intent: 'stream',
		channelId,
		cumulativeAmount: cumulativeAmount.toString(),
		remaining: remaining.toString(),
		timestamp: new Date().toISOString(),
	})
}
