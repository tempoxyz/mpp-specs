import type { Hex } from 'viem'
import type { ChannelState, ChannelStorage, SessionState } from '../storage.js'

/**
 * Durable Objects + D1 storage implementation for production.
 *
 * Uses Durable Objects for hot channel state (low latency reads/writes)
 * and D1 for durable persistence and querying.
 */
export class DurableStorage implements ChannelStorage {
	constructor(
		private readonly channelDO: DurableObjectNamespace,
		private readonly db: D1Database,
	) {}

	async getChannel(channelId: Hex): Promise<ChannelState | null> {
		const stub = this.channelDO.get(this.channelDO.idFromName(channelId))
		const response = await stub.fetch('http://internal/state')
		if (response.status === 404) return null
		return response.json()
	}

	async setChannel(channelId: Hex, state: ChannelState): Promise<void> {
		const stub = this.channelDO.get(this.channelDO.idFromName(channelId))
		await stub.fetch('http://internal/state', {
			method: 'PUT',
			body: JSON.stringify(state, bigintReplacer),
		})

		// Also persist to D1 for durability
		await this.db
			.prepare('INSERT OR REPLACE INTO channels (id, state, updated_at) VALUES (?, ?, ?)')
			.bind(channelId, JSON.stringify(state, bigintReplacer), new Date().toISOString())
			.run()
	}

	async deleteChannel(channelId: Hex): Promise<void> {
		const stub = this.channelDO.get(this.channelDO.idFromName(channelId))
		await stub.fetch('http://internal/state', { method: 'DELETE' })
		await this.db.prepare('DELETE FROM channels WHERE id = ?').bind(channelId).run()
	}

	async getSession(challengeId: string): Promise<SessionState | null> {
		const result = await this.db
			.prepare('SELECT state FROM sessions WHERE id = ?')
			.bind(challengeId)
			.first<{ state: string }>()

		if (!result) return null
		return JSON.parse(result.state, bigintReviver)
	}

	async setSession(challengeId: string, state: SessionState): Promise<void> {
		await this.db
			.prepare('INSERT OR REPLACE INTO sessions (id, channel_id, state, updated_at) VALUES (?, ?, ?, ?)')
			.bind(challengeId, state.channelId, JSON.stringify(state, bigintReplacer), new Date().toISOString())
			.run()
	}

	async deleteSession(challengeId: string): Promise<void> {
		await this.db.prepare('DELETE FROM sessions WHERE id = ?').bind(challengeId).run()
	}

	async getOrCreateSession(challengeId: string, channelId: Hex): Promise<SessionState> {
		const existing = await this.getSession(challengeId)
		if (existing) return existing

		const newSession: SessionState = {
			challengeId,
			channelId,
			acceptedCumulative: 0n,
			spent: 0n,
			units: 0,
			createdAt: new Date(),
		}
		await this.setSession(challengeId, newSession)
		return newSession
	}
}

/**
 * JSON replacer for BigInt serialization.
 */
function bigintReplacer(_key: string, value: unknown): unknown {
	if (typeof value === 'bigint') {
		return value.toString()
	}
	return value
}

/**
 * JSON reviver for BigInt deserialization.
 */
function bigintReviver(key: string, value: unknown): unknown {
	if (
		typeof value === 'string' &&
		['deposit', 'settled', 'highestVoucherAmount', 'acceptedCumulative', 'spent', 'cumulativeAmount'].includes(key)
	) {
		return BigInt(value)
	}
	if (key === 'createdAt' && typeof value === 'string') {
		return new Date(value)
	}
	return value
}

/**
 * D1 schema for channels and sessions tables.
 * Run this to set up the database.
 */
export const D1_SCHEMA = `
CREATE TABLE IF NOT EXISTS channels (
  id TEXT PRIMARY KEY,
  state TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  channel_id TEXT NOT NULL,
  state TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS sessions_channel_id ON sessions(channel_id);
`
