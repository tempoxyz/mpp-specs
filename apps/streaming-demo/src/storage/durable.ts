import type { Hex } from 'viem'
import type { ChannelState, ChannelStorage, SessionState } from '../stream/Storage.js'

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

	async getSession(challengeId: string): Promise<SessionState | null> {
		const result = await this.db
			.prepare('SELECT state FROM sessions WHERE id = ?')
			.bind(challengeId)
			.first<{ state: string }>()

		if (!result) return null
		return JSON.parse(result.state, bigintReviver)
	}

	async updateChannel(
		channelId: Hex,
		fn: (current: ChannelState | null) => ChannelState | null,
	): Promise<ChannelState | null> {
		const current = await this.getChannel(channelId)
		const next = fn(current)

		const stub = this.channelDO.get(this.channelDO.idFromName(channelId))

		if (next === null) {
			await stub.fetch('http://internal/state', { method: 'DELETE' })
			await this.db.prepare('DELETE FROM channels WHERE id = ?').bind(channelId).run()
		} else {
			await stub.fetch('http://internal/state', {
				method: 'PUT',
				body: JSON.stringify(next, bigintReplacer),
			})
			await this.db
				.prepare('INSERT OR REPLACE INTO channels (id, state, updated_at) VALUES (?, ?, ?)')
				.bind(channelId, JSON.stringify(next, bigintReplacer), new Date().toISOString())
				.run()
		}

		return next
	}

	async updateSession(
		challengeId: string,
		fn: (current: SessionState | null) => SessionState | null,
	): Promise<SessionState | null> {
		const current = await this.getSession(challengeId)
		const next = fn(current)

		if (next === null) {
			await this.db.prepare('DELETE FROM sessions WHERE id = ?').bind(challengeId).run()
		} else {
			await this.db
				.prepare('INSERT OR REPLACE INTO sessions (id, channel_id, state, updated_at) VALUES (?, ?, ?, ?)')
				.bind(challengeId, next.channelId, JSON.stringify(next, bigintReplacer), new Date().toISOString())
				.run()
		}

		return next
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
		['deposit', 'highestVoucherAmount', 'acceptedCumulative', 'spent', 'cumulativeAmount'].includes(key)
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
