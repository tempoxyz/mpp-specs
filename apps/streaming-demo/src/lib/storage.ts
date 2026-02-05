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
	acceptedCumulative: bigint
	spent: bigint
	units: number
	createdAt: Date
}

/**
 * Storage interface for channel state persistence.
 */
export interface ChannelStorage {
	getChannel(channelId: Hex): Promise<ChannelState | null>
	setChannel(channelId: Hex, state: ChannelState): Promise<void>
	deleteChannel(channelId: Hex): Promise<void>
	getSession(challengeId: string): Promise<SessionState | null>
	setSession(challengeId: string, state: SessionState): Promise<void>
	deleteSession(challengeId: string): Promise<void>
	getOrCreateSession(challengeId: string, channelId: Hex): Promise<SessionState>
}
