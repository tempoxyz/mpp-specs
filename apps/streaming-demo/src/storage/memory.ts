import type { Hex } from 'viem'
import type { ChannelState, ChannelStorage, SessionState } from '../stream/Storage.js'

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

	async getSession(challengeId: string): Promise<SessionState | null> {
		return this.sessions.get(challengeId) ?? null
	}

	async updateChannel(
		channelId: Hex,
		fn: (current: ChannelState | null) => ChannelState | null,
	): Promise<ChannelState | null> {
		const current = this.channels.get(channelId) ?? null
		const next = fn(current)
		if (next === null) {
			this.channels.delete(channelId)
		} else {
			this.channels.set(channelId, next)
		}
		return next
	}

	async updateSession(
		challengeId: string,
		fn: (current: SessionState | null) => SessionState | null,
	): Promise<SessionState | null> {
		const current = this.sessions.get(challengeId) ?? null
		const next = fn(current)
		if (next === null) {
			this.sessions.delete(challengeId)
		} else {
			this.sessions.set(challengeId, next)
		}
		return next
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
