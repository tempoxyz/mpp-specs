import type { Address, Hex } from 'viem'
import type { SignedVoucher } from '../types/stream.js'

/**
 * Channel state tracked by the server.
 */
export interface ChannelState {
	channelId: Hex
	payer: Address
	payee: Address
	token: Address
	authorizedSigner: Address
	deposit: bigint
	settled: bigint
	highestVoucherAmount: bigint
	highestVoucher: SignedVoucher | null
	createdAt: Date
}

/**
 * Session state for per-challenge accounting.
 */
export interface SessionState {
	challengeId: string
	channelId: Hex
	acceptedCumulative: bigint // Highest voucher accepted
	spent: bigint // Amount charged for service
	units: number // Units consumed
	createdAt: Date
}

/**
 * Storage interface for channel state persistence.
 * Implementations can use in-memory, Durable Objects, D1, Redis, etc.
 */
export interface ChannelStorage {
	/** Get channel state by ID */
	getChannel(channelId: Hex): Promise<ChannelState | null>

	/** Save or update channel state */
	setChannel(channelId: Hex, state: ChannelState): Promise<void>

	/** Delete channel (on close) */
	deleteChannel(channelId: Hex): Promise<void>

	/** Get session state (tracks per-challenge accounting) */
	getSession(challengeId: string): Promise<SessionState | null>

	/** Save or update session state */
	setSession(challengeId: string, state: SessionState): Promise<void>

	/** Delete session (on channel close) */
	deleteSession(challengeId: string): Promise<void>

	/** Get or create session for a channel */
	getOrCreateSession(challengeId: string, channelId: Hex): Promise<SessionState>
}

/**
 * Serialize ChannelState for storage.
 */
export function serializeChannelState(state: ChannelState): string {
	return JSON.stringify({
		...state,
		deposit: state.deposit.toString(),
		settled: state.settled.toString(),
		highestVoucherAmount: state.highestVoucherAmount.toString(),
		highestVoucher: state.highestVoucher
			? {
					...state.highestVoucher,
					cumulativeAmount: state.highestVoucher.cumulativeAmount.toString(),
				}
			: null,
		createdAt: state.createdAt.toISOString(),
	})
}

/**
 * Deserialize ChannelState from storage.
 */
export function deserializeChannelState(data: string): ChannelState {
	const parsed = JSON.parse(data)
	return {
		...parsed,
		deposit: BigInt(parsed.deposit),
		settled: BigInt(parsed.settled),
		highestVoucherAmount: BigInt(parsed.highestVoucherAmount),
		highestVoucher: parsed.highestVoucher
			? {
					...parsed.highestVoucher,
					cumulativeAmount: BigInt(parsed.highestVoucher.cumulativeAmount),
				}
			: null,
		createdAt: new Date(parsed.createdAt),
	}
}

/**
 * Serialize SessionState for storage.
 */
export function serializeSessionState(state: SessionState): string {
	return JSON.stringify({
		...state,
		acceptedCumulative: state.acceptedCumulative.toString(),
		spent: state.spent.toString(),
		createdAt: state.createdAt.toISOString(),
	})
}

/**
 * Deserialize SessionState from storage.
 */
export function deserializeSessionState(data: string): SessionState {
	const parsed = JSON.parse(data)
	return {
		...parsed,
		acceptedCumulative: BigInt(parsed.acceptedCumulative),
		spent: BigInt(parsed.spent),
		createdAt: new Date(parsed.createdAt),
	}
}
