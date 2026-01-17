import {
	type Address,
	type Chain,
	encodeFunctionData,
	type Hex,
	type PublicClient,
	type WalletClient,
} from 'viem'
import { TempoStreamChannelABI } from './abi.js'
import type { Channel, ServerChannelState, SignedVoucher, StreamRequest } from './types.js'
import { recoverVoucherSigner } from './voucher.js'

/**
 * Server-side handler for streaming payment channels.
 */
export class StreamChannelServer {
	private channels: Map<Hex, ServerChannelState> = new Map()

	constructor(
		private publicClient: PublicClient,
		private walletClient: WalletClient | null,
		private serverAddress: Address,
		private chainId: number,
		private chain?: Chain,
	) {}

	/**
	 * Create a stream request (402 challenge) for a new channel.
	 */
	createStreamRequest(params: {
		escrowContract: Address
		asset: Address
		deposit: bigint
		expiresAt: Date
		voucherEndpoint: string
		minVoucherDelta?: bigint
	}): StreamRequest {
		const salt = `0x${Array.from(crypto.getRandomValues(new Uint8Array(32)))
			.map((b) => b.toString(16).padStart(2, '0'))
			.join('')}` as Hex

		return {
			escrowContract: params.escrowContract,
			asset: params.asset,
			destination: this.serverAddress,
			deposit: params.deposit.toString(),
			expires: params.expiresAt.toISOString(),
			salt,
			voucherEndpoint: params.voucherEndpoint,
			minVoucherDelta: params.minVoucherDelta?.toString(),
		}
	}

	/**
	 * Verify channel opening and initialize server-side state.
	 */
	async verifyChannelOpen(
		escrowContract: Address,
		channelId: Hex,
		openTxHash: Hex,
		initialVoucher: SignedVoucher,
	): Promise<{ valid: true; state: ServerChannelState } | { valid: false; error: string }> {
		// Verify transaction was confirmed
		try {
			const receipt = await this.publicClient.getTransactionReceipt({ hash: openTxHash })
			if (receipt.status !== 'success') {
				return { valid: false, error: 'Channel open transaction failed' }
			}
		} catch {
			return { valid: false, error: 'Could not find channel open transaction' }
		}

		// Get channel state from contract
		let channel: Channel
		try {
			const result = await this.publicClient.readContract({
				address: escrowContract,
				abi: TempoStreamChannelABI,
				functionName: 'getChannel',
				args: [channelId],
			})

			channel = {
				payer: result.payer,
				payee: result.payee,
				token: result.token,
				deposit: result.deposit,
				settled: result.settled,
				expiry: result.expiry,
				closeRequestedAt: result.closeRequestedAt,
				finalized: result.finalized,
			}
		} catch {
			return { valid: false, error: 'Could not read channel state' }
		}

		// Verify channel matches expectations
		if (channel.payer === '0x0000000000000000000000000000000000000000') {
			return { valid: false, error: 'Channel does not exist' }
		}

		if (channel.payee.toLowerCase() !== this.serverAddress.toLowerCase()) {
			return { valid: false, error: 'Channel payee does not match server address' }
		}

		if (channel.settled !== 0n) {
			return { valid: false, error: 'Channel already has settlements' }
		}

		if (channel.finalized) {
			return { valid: false, error: 'Channel is finalized' }
		}

		// Verify initial voucher
		if (initialVoucher.cumulativeAmount !== 0n) {
			return { valid: false, error: 'Initial voucher must have cumulativeAmount = 0' }
		}

		try {
			const signer = await recoverVoucherSigner(escrowContract, this.chainId, initialVoucher)
			if (signer.toLowerCase() !== channel.payer.toLowerCase()) {
				return { valid: false, error: 'Voucher signer does not match channel payer' }
			}
		} catch {
			return { valid: false, error: 'Invalid voucher signature' }
		}

		// Initialize server-side state
		const state: ServerChannelState = {
			channelId,
			payer: channel.payer,
			payee: channel.payee,
			token: channel.token,
			deposit: channel.deposit,
			settled: 0n,
			expiry: channel.expiry,
			highestVoucherAmount: 0n,
			highestVoucher: initialVoucher,
		}

		this.channels.set(channelId, state)

		return { valid: true, state }
	}

	/**
	 * Verify and accept a new voucher.
	 */
	async verifyVoucher(
		escrowContract: Address,
		voucher: SignedVoucher,
		minDelta?: bigint,
	): Promise<{ valid: true; state: ServerChannelState } | { valid: false; error: string }> {
		const state = this.channels.get(voucher.channelId)
		if (!state) {
			return { valid: false, error: 'Channel not found in server state' }
		}

		// Verify voucher is newer
		if (voucher.cumulativeAmount <= state.highestVoucherAmount) {
			return { valid: false, error: 'Voucher amount not increasing' }
		}

		// Verify minimum delta
		if (minDelta && voucher.cumulativeAmount - state.highestVoucherAmount < minDelta) {
			return { valid: false, error: 'Voucher delta below minimum' }
		}

		// Verify amount doesn't exceed deposit
		if (voucher.cumulativeAmount > state.deposit) {
			return { valid: false, error: 'Voucher amount exceeds deposit' }
		}

		// Verify voucher hasn't expired
		if (voucher.validUntil < BigInt(Math.floor(Date.now() / 1000))) {
			return { valid: false, error: 'Voucher has expired' }
		}

		// Verify signature
		try {
			const signer = await recoverVoucherSigner(escrowContract, this.chainId, voucher)
			if (signer.toLowerCase() !== state.payer.toLowerCase()) {
				return { valid: false, error: 'Voucher signer does not match payer' }
			}
		} catch {
			return { valid: false, error: 'Invalid voucher signature' }
		}

		// Update state
		state.highestVoucherAmount = voucher.cumulativeAmount
		state.highestVoucher = voucher

		return { valid: true, state }
	}

	/**
	 * Settle the channel using the highest voucher.
	 */
	async settle(
		escrowContract: Address,
		channelId: Hex,
	): Promise<{ success: true; txHash: Hex; settled: bigint } | { success: false; error: string }> {
		if (!this.walletClient) {
			return { success: false, error: 'No wallet client configured for settlement' }
		}

		const state = this.channels.get(channelId)
		if (!state) {
			return { success: false, error: 'Channel not found in server state' }
		}

		if (!state.highestVoucher) {
			return { success: false, error: 'No voucher to settle' }
		}

		if (state.highestVoucherAmount <= state.settled) {
			return { success: false, error: 'Nothing to settle' }
		}

		const voucher = state.highestVoucher

		const data = encodeFunctionData({
			abi: TempoStreamChannelABI,
			functionName: 'settle',
			args: [channelId, voucher.cumulativeAmount, voucher.validUntil, voucher.signature],
		})

		try {
			const txHash = await this.walletClient.sendTransaction({
				account: this.serverAddress,
				chain: this.chain,
				to: escrowContract,
				data,
			})

			await this.publicClient.waitForTransactionReceipt({ hash: txHash })

			const delta = voucher.cumulativeAmount - state.settled
			state.settled = voucher.cumulativeAmount

			return { success: true, txHash, settled: delta }
		} catch (e) {
			return { success: false, error: `Settlement failed: ${e}` }
		}
	}

	/**
	 * Get server-side channel state.
	 */
	getChannelState(channelId: Hex): ServerChannelState | undefined {
		return this.channels.get(channelId)
	}

	/**
	 * Refresh channel state from on-chain.
	 */
	async refreshChannelState(escrowContract: Address, channelId: Hex): Promise<void> {
		const state = this.channels.get(channelId)
		if (!state) return

		const result = await this.publicClient.readContract({
			address: escrowContract,
			abi: TempoStreamChannelABI,
			functionName: 'getChannel',
			args: [channelId],
		})

		state.deposit = result.deposit
		state.settled = result.settled
		state.expiry = result.expiry
	}

	/**
	 * Calculate unsettled amount.
	 */
	getUnsettledAmount(channelId: Hex): bigint {
		const state = this.channels.get(channelId)
		if (!state) return 0n
		return state.highestVoucherAmount - state.settled
	}

	/**
	 * Calculate remaining spendable amount.
	 */
	getRemainingDeposit(channelId: Hex): bigint {
		const state = this.channels.get(channelId)
		if (!state) return 0n
		return state.deposit - state.highestVoucherAmount
	}
}

/**
 * Create a stream channel server.
 */
export function createStreamChannelServer(
	publicClient: PublicClient,
	walletClient: WalletClient | null,
	serverAddress: Address,
	chainId: number,
	chain?: Chain,
): StreamChannelServer {
	return new StreamChannelServer(publicClient, walletClient, serverAddress, chainId, chain)
}
