import { DurableObject } from 'cloudflare:workers'
import { getVoucherDomain, voucherTypes } from '@tempo/stream-channels'
import type { Address, Hex } from 'viem'
import { verifyTypedData } from 'viem'

/**
 * Channel state stored in the Durable Object.
 */
interface ChannelState {
	channelId: Hex
	payer: Address
	payee: Address
	token: Address
	escrowContract: Address
	chainId: number
	deposit: bigint
	settled: bigint
	expiry: bigint
	highestVoucherAmount: bigint
	highestVoucher: SignedVoucher | null
	createdAt: number
	lastActivityAt: number
	settlementScheduledAt: number | null
}

/**
 * Signed voucher from the payer.
 */
interface SignedVoucher {
	channelId: Hex
	cumulativeAmount: bigint
	validUntil: bigint
	signature: Hex
}

/**
 * Result of voucher verification.
 */
interface VoucherResult {
	valid: boolean
	error?: string
	delta?: bigint
	remaining?: bigint
	state?: ChannelState
}

/**
 * Environment bindings for the Durable Object.
 */
interface Env {
	TEMPO_RPC_URL: string
	SETTLEMENT_QUEUE?: Queue<SettlementJob>
	CHANNELS_DB?: D1Database
}

/**
 * Settlement job for the queue.
 */
interface SettlementJob {
	channelId: Hex
	escrowContract: Address
	voucher: SignedVoucher
	payee: Address
}

/**
 * PaymentChannel Durable Object
 *
 * One instance per payment channel (channelId).
 * Provides:
 * - Atomic voucher verification
 * - State persistence across requests
 * - Settlement scheduling via alarms
 * - WebSocket for real-time balance updates
 */
export class PaymentChannel extends DurableObject<Env> {
	private state: ChannelState | null = null
	private webSockets: Set<WebSocket> = new Set()

	/**
	 * Load state from storage on first access.
	 */
	private async loadState(): Promise<ChannelState | null> {
		if (this.state) return this.state

		const stored = await this.ctx.storage.get<ChannelState>('state')
		if (stored) {
			// Restore bigints from storage (they're stored as strings)
			this.state = {
				...stored,
				deposit: BigInt(stored.deposit),
				settled: BigInt(stored.settled),
				expiry: BigInt(stored.expiry),
				highestVoucherAmount: BigInt(stored.highestVoucherAmount),
				highestVoucher: stored.highestVoucher
					? {
							...stored.highestVoucher,
							cumulativeAmount: BigInt(stored.highestVoucher.cumulativeAmount),
							validUntil: BigInt(stored.highestVoucher.validUntil),
						}
					: null,
			}
		}
		return this.state
	}

	/**
	 * Save state to storage.
	 */
	private async saveState(): Promise<void> {
		if (!this.state) return

		// Convert bigints to strings for storage
		const toStore = {
			...this.state,
			deposit: this.state.deposit.toString(),
			settled: this.state.settled.toString(),
			expiry: this.state.expiry.toString(),
			highestVoucherAmount: this.state.highestVoucherAmount.toString(),
			highestVoucher: this.state.highestVoucher
				? {
						...this.state.highestVoucher,
						cumulativeAmount: this.state.highestVoucher.cumulativeAmount.toString(),
						validUntil: this.state.highestVoucher.validUntil.toString(),
					}
				: null,
		}

		await this.ctx.storage.put('state', toStore)
		this.state.lastActivityAt = Date.now()
	}

	/**
	 * Initialize a new channel.
	 */
	async initialize(params: {
		channelId: Hex
		payer: Address
		payee: Address
		token: Address
		escrowContract: Address
		chainId: number
		deposit: bigint
		expiry: bigint
		openTxHash: Hex
	}): Promise<{ success: boolean; error?: string }> {
		const existing = await this.loadState()
		if (existing) {
			return { success: false, error: 'Channel already initialized' }
		}

		this.state = {
			channelId: params.channelId,
			payer: params.payer,
			payee: params.payee,
			token: params.token,
			escrowContract: params.escrowContract,
			chainId: params.chainId,
			deposit: params.deposit,
			settled: 0n,
			expiry: params.expiry,
			highestVoucherAmount: 0n,
			highestVoucher: null,
			createdAt: Date.now(),
			lastActivityAt: Date.now(),
			settlementScheduledAt: null,
		}

		await this.saveState()

		// Index in D1 if available
		if (this.env.CHANNELS_DB) {
			await this.env.CHANNELS_DB.prepare(
				`INSERT INTO channels (channel_id, payer, payee, token, escrow_contract, chain_id, deposit, expiry, created_at)
				 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
			)
				.bind(
					params.channelId,
					params.payer,
					params.payee,
					params.token,
					params.escrowContract,
					params.chainId,
					params.deposit.toString(),
					params.expiry.toString(),
					new Date().toISOString(),
				)
				.run()
		}

		return { success: true }
	}

	/**
	 * Verify and accept a voucher.
	 */
	async verifyVoucher(voucher: SignedVoucher, minDelta?: bigint): Promise<VoucherResult> {
		const state = await this.loadState()
		if (!state) {
			return { valid: false, error: 'Channel not found' }
		}

		// Check voucher is newer
		if (voucher.cumulativeAmount <= state.highestVoucherAmount) {
			return { valid: false, error: 'Voucher amount not increasing' }
		}

		// Check minimum delta
		const delta = voucher.cumulativeAmount - state.highestVoucherAmount
		if (minDelta && delta < minDelta) {
			return { valid: false, error: `Voucher delta ${delta} below minimum ${minDelta}` }
		}

		// Check doesn't exceed deposit
		if (voucher.cumulativeAmount > state.deposit) {
			return { valid: false, error: 'Voucher amount exceeds deposit' }
		}

		// Check voucher hasn't expired
		if (voucher.validUntil < BigInt(Math.floor(Date.now() / 1000))) {
			return { valid: false, error: 'Voucher has expired' }
		}

		// Verify signature
		const isValid = await verifyTypedData({
			address: state.payer,
			domain: getVoucherDomain(state.escrowContract, state.chainId),
			types: voucherTypes,
			primaryType: 'Voucher',
			message: {
				channelId: voucher.channelId,
				cumulativeAmount: voucher.cumulativeAmount,
				validUntil: voucher.validUntil,
			},
			signature: voucher.signature,
		})

		if (!isValid) {
			return { valid: false, error: 'Invalid voucher signature' }
		}

		// Update state atomically
		state.highestVoucherAmount = voucher.cumulativeAmount
		state.highestVoucher = voucher
		await this.saveState()

		// Broadcast to WebSocket clients
		this.broadcastBalance()

		// Schedule settlement if threshold reached
		const unsettled = state.highestVoucherAmount - state.settled
		const threshold = state.deposit / 10n // 10% of deposit
		if (unsettled >= threshold && !state.settlementScheduledAt) {
			await this.scheduleSettlement(60_000) // 1 minute delay for batching
		}

		const remaining = state.deposit - state.highestVoucherAmount

		return {
			valid: true,
			delta,
			remaining,
			state,
		}
	}

	/**
	 * Get current channel state.
	 */
	async getState(): Promise<ChannelState | null> {
		return this.loadState()
	}

	/**
	 * Get remaining spendable balance.
	 */
	async getRemaining(): Promise<bigint> {
		const state = await this.loadState()
		if (!state) return 0n
		return state.deposit - state.highestVoucherAmount
	}

	/**
	 * Get unsettled amount.
	 */
	async getUnsettled(): Promise<bigint> {
		const state = await this.loadState()
		if (!state) return 0n
		return state.highestVoucherAmount - state.settled
	}

	/**
	 * Top up the channel (called after on-chain topUp confirmed).
	 */
	async topUp(additionalDeposit: bigint, newExpiry?: bigint): Promise<void> {
		const state = await this.loadState()
		if (!state) return

		state.deposit += additionalDeposit
		if (newExpiry && newExpiry > state.expiry) {
			state.expiry = newExpiry
		}

		await this.saveState()
		this.broadcastBalance()
	}

	/**
	 * Record settlement (called after on-chain settlement confirmed).
	 */
	async recordSettlement(settledAmount: bigint): Promise<void> {
		const state = await this.loadState()
		if (!state) return

		state.settled = settledAmount
		state.settlementScheduledAt = null

		await this.saveState()

		// Update D1 if available
		if (this.env.CHANNELS_DB) {
			await this.env.CHANNELS_DB.prepare(
				`UPDATE channels SET settled = ?, last_settlement_at = ? WHERE channel_id = ?`,
			)
				.bind(settledAmount.toString(), new Date().toISOString(), state.channelId)
				.run()
		}
	}

	/**
	 * Schedule settlement via alarm.
	 */
	private async scheduleSettlement(delayMs: number): Promise<void> {
		const state = await this.loadState()
		if (!state) return

		state.settlementScheduledAt = Date.now() + delayMs
		await this.saveState()

		await this.ctx.storage.setAlarm(Date.now() + delayMs)
	}

	/**
	 * Alarm handler for scheduled settlements.
	 */
	override async alarm(): Promise<void> {
		const state = await this.loadState()
		if (!state || !state.highestVoucher) return

		const unsettled = state.highestVoucherAmount - state.settled
		if (unsettled <= 0n) {
			state.settlementScheduledAt = null
			await this.saveState()
			return
		}

		// Enqueue settlement job
		if (this.env.SETTLEMENT_QUEUE) {
			await this.env.SETTLEMENT_QUEUE.send({
				channelId: state.channelId,
				escrowContract: state.escrowContract,
				voucher: state.highestVoucher,
				payee: state.payee,
			})
		}

		state.settlementScheduledAt = null
		await this.saveState()
	}

	/**
	 * Handle WebSocket connections for real-time balance updates.
	 */
	override async fetch(request: Request): Promise<Response> {
		const url = new URL(request.url)

		// WebSocket upgrade
		if (request.headers.get('Upgrade') === 'websocket') {
			const pair = new WebSocketPair()
			const client = pair[0]
			const server = pair[1]

			server.accept()
			this.webSockets.add(server)

			server.addEventListener('close', () => {
				this.webSockets.delete(server)
			})

			// Send initial state
			const state = await this.loadState()
			if (state) {
				server.send(
					JSON.stringify({
						type: 'state',
						channelId: state.channelId,
						deposit: state.deposit.toString(),
						spent: state.highestVoucherAmount.toString(),
						settled: state.settled.toString(),
						remaining: (state.deposit - state.highestVoucherAmount).toString(),
						expiry: state.expiry.toString(),
					}),
				)
			}

			return new Response(null, { status: 101, webSocket: client })
		}

		// REST API

		// Initialize channel
		if (url.pathname === '/init' && request.method === 'POST') {
			const body = (await request.json()) as {
				channelId: Hex
				payer: Address
				payee: Address
				token: Address
				escrowContract: Address
				chainId: number
				deposit: string
				expiry: string
				openTxHash: Hex
			}

			const result = await this.initialize({
				channelId: body.channelId,
				payer: body.payer,
				payee: body.payee,
				token: body.token,
				escrowContract: body.escrowContract,
				chainId: body.chainId,
				deposit: BigInt(body.deposit),
				expiry: BigInt(body.expiry),
				openTxHash: body.openTxHash,
			})

			return new Response(JSON.stringify(result), {
				headers: { 'Content-Type': 'application/json' },
			})
		}

		if (url.pathname === '/state' && request.method === 'GET') {
			const state = await this.loadState()
			if (!state) {
				return new Response(JSON.stringify({ error: 'Channel not found' }), { status: 404 })
			}
			return new Response(
				JSON.stringify({
					channelId: state.channelId,
					payer: state.payer,
					payee: state.payee,
					deposit: state.deposit.toString(),
					spent: state.highestVoucherAmount.toString(),
					settled: state.settled.toString(),
					remaining: (state.deposit - state.highestVoucherAmount).toString(),
					expiry: state.expiry.toString(),
				}),
			)
		}

		if (url.pathname === '/verify' && request.method === 'POST') {
			const body = (await request.json()) as { voucher: SignedVoucher; minDelta?: string }
			const voucher: SignedVoucher = {
				...body.voucher,
				cumulativeAmount: BigInt(body.voucher.cumulativeAmount),
				validUntil: BigInt(body.voucher.validUntil),
			}
			const minDelta = body.minDelta ? BigInt(body.minDelta) : undefined
			const result = await this.verifyVoucher(voucher, minDelta)
			return new Response(
				JSON.stringify({
					...result,
					delta: result.delta?.toString(),
					remaining: result.remaining?.toString(),
				}),
			)
		}

		return new Response('Not found', { status: 404 })
	}

	/**
	 * Broadcast balance update to all connected WebSocket clients.
	 */
	private broadcastBalance(): void {
		if (!this.state) return

		const message = JSON.stringify({
			type: 'balance',
			channelId: this.state.channelId,
			spent: this.state.highestVoucherAmount.toString(),
			remaining: (this.state.deposit - this.state.highestVoucherAmount).toString(),
			settled: this.state.settled.toString(),
		})

		for (const ws of this.webSockets) {
			try {
				ws.send(message)
			} catch {
				this.webSockets.delete(ws)
			}
		}
	}
}
