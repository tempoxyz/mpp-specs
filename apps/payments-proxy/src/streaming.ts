import {
	createStreamChannelServer,
	type ServerChannelState,
	type SignedVoucher,
	type StreamChannelServer,
	type StreamCredentialPayload,
	type StreamRequest,
} from '@tempo/stream-channels'
import { type Address, createPublicClient, type Hex, http } from 'viem'
import { tempoModerato } from 'viem/chains'
import type { Env, PartnerConfig, StreamingConfig } from './config.js'

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
		transport: http(env.TEMPO_RPC_URL),
	})

	serverInstance = createStreamChannelServer(
		publicClient as Parameters<typeof createStreamChannelServer>[0],
		null, // No wallet client for now (settlement is separate)
		serverAddress,
		tempoModerato.id,
		tempoModerato,
	)

	return serverInstance
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

	const expiresAt = new Date(Date.now() + streamConfig.defaultExpirySeconds * 1000)

	const request = server.createStreamRequest({
		escrowContract: streamConfig.escrowContract,
		asset: partner.asset,
		deposit: BigInt(streamConfig.defaultDeposit),
		expiresAt,
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

	if (!credential.openTxHash) {
		return { valid: false, error: 'Missing openTxHash in credential' }
	}

	const server = getStreamServer(env, partner.destination)

	// Convert voucher from credential format to SignedVoucher
	const voucher: SignedVoucher = {
		channelId: credential.channelId,
		cumulativeAmount: BigInt(credential.voucher.payload.message.cumulativeAmount),
		validUntil: BigInt(credential.voucher.payload.message.validUntil),
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
		validUntil: BigInt(credential.voucher.payload.message.validUntil),
		signature: credential.voucher.signature,
	}

	// Get current state to calculate delta
	const currentState = server.getChannelState(credential.channelId)
	if (!currentState) {
		return { valid: false, error: 'Channel not found' }
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

	if (!cred.voucher || typeof cred.voucher !== 'object') {
		return null
	}

	return cred as unknown as StreamCredentialPayload
}

/**
 * Format stream challenge for WWW-Authenticate header.
 */
export function formatStreamChallenge(request: StreamRequest): string {
	const params = [
		`realm="payments-proxy/stream"`,
		`method="tempo"`,
		`intent="stream"`,
		`escrowContract="${request.escrowContract}"`,
		`asset="${request.asset}"`,
		`destination="${request.destination}"`,
		`deposit="${request.deposit}"`,
		`expires="${request.expires}"`,
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

/**
 * Clean up expired channels.
 */
export function cleanupExpiredChannels(): void {
	const now = Date.now()
	for (const [channelId, channel] of activeChannels) {
		// Channels expire based on their on-chain expiry
		const expiryMs = Number(channel.state.expiry) * 1000
		if (expiryMs < now) {
			activeChannels.delete(channelId)
		}
	}
}
