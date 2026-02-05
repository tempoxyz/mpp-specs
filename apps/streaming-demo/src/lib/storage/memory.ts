import type { Hex } from 'viem'
import type { ChannelState, ChannelStorage, SessionState } from '../storage.js'

/**
 * In-memory storage implementation for demo/tests.
 *
 * Note: This storage is ephemeral and will be cleared on worker restart.
 * Use DurableStorage for production.
 */
export class InMemoryStorage implements ChannelStorage {
	private channels = new Map<Hex, ChannelState>()
	private sessions = new Map<string, SessionState>()

	async getChannel(channelId: Hex): Promise<ChannelState | null> {
		return this.channels.get(channelId) ?? null
	}

	async setChannel(channelId: Hex, state: ChannelState): Promise<void> {
		this.channels.set(channelId, state)
	}

	async deleteChannel(channelId: Hex): Promise<void> {
		this.channels.delete(channelId)
	}

	async getSession(challengeId: string): Promise<SessionState | null> {
		return this.sessions.get(challengeId) ?? null
	}

	async setSession(challengeId: string, state: SessionState): Promise<void> {
		this.sessions.set(challengeId, state)
	}

	async deleteSession(challengeId: string): Promise<void> {
		this.sessions.delete(challengeId)
	}

	async getOrCreateSession(challengeId: string, channelId: Hex): Promise<SessionState> {
		const existing = this.sessions.get(challengeId)
		if (existing) return existing

		const newSession: SessionState = {
			challengeId,
			channelId,
			acceptedCumulative: 0n,
			spent: 0n,
			units: 0,
			createdAt: new Date(),
		}
		this.sessions.set(challengeId, newSession)
		return newSession
	}

	// Helper methods for testing
	clear(): void {
		this.channels.clear()
		this.sessions.clear()
	}

	getChannelCount(): number {
		return this.channels.size
	}

	getSessionCount(): number {
		return this.sessions.size
	}
}
