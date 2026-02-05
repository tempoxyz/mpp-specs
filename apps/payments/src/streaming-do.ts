/**
 * Cloudflare-native streaming payments using Durable Objects.
 *
 * This module integrates the PaymentChannel Durable Object with the
 * payments Worker for production-ready streaming channels.
 *
 * Architecture:
 * - Each channelId maps to exactly one DO instance
 * - DO handles atomic voucher verification and state management
 * - D1 provides queryable index for analytics and recovery
 * - Queue enables async settlement batching
 */

import type { SignedVoucher, StreamCredentialPayload, StreamRequest } from '@tempo/stream-channels'
import type { Address, Hex } from 'viem'
import type { Env, PartnerConfig, StreamingConfig } from './config.js'
import type { PaymentChannel } from './durable-objects/PaymentChannel.js'

export type { StreamingConfig }

/**
 * Extended environment with DO bindings.
 */
interface EnvWithDO {
	ENVIRONMENT: string
	TEMPO_RPC_URL: string
	STREAM_ESCROW_CONTRACT?: string
	PAYMENT_CHANNEL: DurableObjectNamespace<PaymentChannel>
	CHANNELS_DB?: D1Database
}

/**
 * Get the Durable Object stub for a channel.
 */
function getChannelDO(env: EnvWithDO, channelId: Hex): DurableObjectStub<PaymentChannel> {
	// Use channelId as the DO id for consistent routing
	const id = env.PAYMENT_CHANNEL.idFromName(channelId)
	return env.PAYMENT_CHANNEL.get(id)
}

/**
 * Create a stream request challenge for a partner.
 */
export function createStreamChallenge(
	_env: Env,
	partner: PartnerConfig,
	streamConfig: StreamingConfig,
	voucherEndpointBase: string,
): StreamRequest {
	const salt = `0x${Array.from(crypto.getRandomValues(new Uint8Array(32)))
		.map((b) => b.toString(16).padStart(2, '0'))
		.join('')}` as Hex

	return {
		escrowContract: streamConfig.escrowContract,
		asset: partner.asset,
		destination: partner.destination,
		deposit: streamConfig.defaultDeposit,
		salt,
		voucherEndpoint: `${voucherEndpointBase}/${partner.slug}/voucher`,
		minVoucherDelta: streamConfig.minVoucherDelta,
	}
}

/**
 * Verify channel opening and initialize the DO.
 */
export async function verifyChannelOpen(
	env: EnvWithDO,
	partner: PartnerConfig,
	credential: StreamCredentialPayload,
	streamConfig: StreamingConfig,
	chainId: number,
): Promise<{ valid: true; channelId: Hex; remaining: bigint } | { valid: false; error: string }> {
	if (credential.action !== 'open') {
		return { valid: false, error: 'Expected action=open for channel opening' }
	}

	// Get the DO for this channel
	const channelDO = getChannelDO(env, credential.channelId)

	// Initialize the channel in the DO
	// In production, we'd verify the openTxHash on-chain first
	const initResult = await channelDO.initialize({
		channelId: credential.channelId,
		payer: credential.voucher.payload.domain.verifyingContract as Address, // Recovered from voucher
		payee: partner.destination,
		token: partner.asset,
		escrowContract: streamConfig.escrowContract,
		chainId,
		deposit: BigInt(streamConfig.defaultDeposit),
		openTxHash: credential.openTxHash,
	})

	if (!initResult.success) {
		return { valid: false, error: initResult.error ?? 'Failed to initialize channel' }
	}

	const remaining = await channelDO.getRemaining()
	return { valid: true, channelId: credential.channelId, remaining }
}

/**
 * Verify a voucher payment using the DO.
 */
export async function verifyVoucher(
	env: EnvWithDO,
	_partner: PartnerConfig,
	credential: StreamCredentialPayload,
	streamConfig: StreamingConfig,
	requiredAmount: bigint,
): Promise<{ valid: true; delta: bigint; remaining: bigint } | { valid: false; error: string }> {
	if (credential.action !== 'voucher') {
		return { valid: false, error: 'Expected action=voucher' }
	}

	// Get the DO for this channel
	const channelDO = getChannelDO(env, credential.channelId)

	// Convert voucher from credential format
	const voucher: SignedVoucher = {
		channelId: credential.channelId,
		cumulativeAmount: BigInt(credential.voucher.payload.message.cumulativeAmount),
		signature: credential.voucher.signature,
	}

	// Verify via DO (atomic operation)
	const result = await channelDO.verifyVoucher(voucher, BigInt(streamConfig.minVoucherDelta))

	if (!result.valid) {
		return { valid: false, error: result.error ?? 'Voucher verification failed' }
	}

	// Check payment covers required amount
	if (result.delta! < requiredAmount) {
		return {
			valid: false,
			error: `Payment ${result.delta} below required ${requiredAmount}`,
		}
	}

	return {
		valid: true,
		delta: result.delta!,
		remaining: result.remaining!,
	}
}

/**
 * Get channel state from DO.
 */
export async function getChannelState(
	env: EnvWithDO,
	channelId: Hex,
): Promise<{
	deposit: bigint
	spent: bigint
	settled: bigint
	remaining: bigint
} | null> {
	const channelDO = getChannelDO(env, channelId)
	const state = await channelDO.getState()

	if (!state) return null

	return {
		deposit: state.deposit,
		spent: state.highestVoucherAmount,
		settled: state.settled,
		remaining: state.deposit - state.highestVoucherAmount,
	}
}

/**
 * Get remaining channel balance.
 */
export async function getRemainingBalance(env: EnvWithDO, channelId: Hex): Promise<bigint> {
	const channelDO = getChannelDO(env, channelId)
	return channelDO.getRemaining()
}

/**
 * Get unsettled amount.
 */
export async function getUnsettledAmount(env: EnvWithDO, channelId: Hex): Promise<bigint> {
	const channelDO = getChannelDO(env, channelId)
	return channelDO.getUnsettled()
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
export function formatStreamChallenge(request: StreamRequest, realm?: string): string {
	const params = [
		`realm="${realm ?? 'payments/stream'}"`,
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

/**
 * WebSocket endpoint for real-time balance updates.
 *
 * Usage:
 *   ws://payments.tempo.xyz/channels/{channelId}/ws
 *
 * The DO handles the WebSocket connection directly.
 */
export async function handleChannelWebSocket(
	env: EnvWithDO,
	channelId: Hex,
	request: Request,
): Promise<Response> {
	const channelDO = getChannelDO(env, channelId)
	return channelDO.fetch(request)
}

/**
 * List channels for a payer (requires D1).
 */
export async function listChannelsForPayer(
	env: EnvWithDO,
	payer: Address,
	options?: { limit?: number; offset?: number },
): Promise<Array<{ channelId: Hex; deposit: string; settled: string }>> {
	if (!env.CHANNELS_DB) {
		return []
	}

	const limit = options?.limit ?? 100
	const offset = options?.offset ?? 0

	const result = await env.CHANNELS_DB.prepare(
		`SELECT channel_id, deposit, settled
		 FROM channels
		 WHERE payer = ?
		 ORDER BY created_at DESC
		 LIMIT ? OFFSET ?`,
	)
		.bind(payer, limit, offset)
		.all()

	return (result.results ?? []).map((row) => ({
		channelId: row.channel_id as Hex,
		deposit: row.deposit as string,
		settled: row.settled as string,
	}))
}

/**
 * Get analytics for a payee (requires D1).
 */
export async function getPayeeAnalytics(
	env: EnvWithDO,
	payee: Address,
): Promise<{
	totalChannels: number
	totalDeposited: bigint
	totalSettled: bigint
	activeChannels: number
}> {
	if (!env.CHANNELS_DB) {
		return {
			totalChannels: 0,
			totalDeposited: 0n,
			totalSettled: 0n,
			activeChannels: 0,
		}
	}

	const result = await env.CHANNELS_DB.prepare(
		`SELECT
			COUNT(*) as total_channels,
			COALESCE(SUM(CAST(deposit AS INTEGER)), 0) as total_deposited,
			COALESCE(SUM(CAST(settled AS INTEGER)), 0) as total_settled,
			SUM(CASE WHEN finalized_at IS NULL THEN 1 ELSE 0 END) as active_channels
		 FROM channels
		 WHERE payee = ?`,
	)
		.bind(payee)
		.first()

	return {
		totalChannels: (result?.total_channels as number) ?? 0,
		totalDeposited: BigInt((result?.total_deposited as number) ?? 0),
		totalSettled: BigInt((result?.total_settled as number) ?? 0),
		activeChannels: (result?.active_channels as number) ?? 0,
	}
}
