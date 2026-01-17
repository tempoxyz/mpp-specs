/**
 * Settlement Queue Consumer
 *
 * Processes batched settlements from streaming payment channels.
 * Settlements are triggered by DO alarms when unsettled amounts exceed threshold.
 *
 * Benefits of queue-based settlement:
 * - Batching: Multiple settlements can be processed together
 * - Retry: Failed settlements are automatically retried
 * - Backpressure: Queue handles burst of settlement requests
 * - Async: DOes not block voucher verification
 */

import { TempoStreamChannelABI } from '@tempo/stream-channels'
import {
	type Address,
	createPublicClient,
	createWalletClient,
	encodeFunctionData,
	type Hex,
	http,
} from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { tempoModerato } from 'viem/chains'
import type { PaymentChannel } from '../durable-objects/PaymentChannel.js'

/**
 * Settlement job from the queue.
 */
interface SettlementJob {
	channelId: Hex
	escrowContract: Address
	voucher: {
		channelId: Hex
		cumulativeAmount: bigint
		validUntil: bigint
		signature: Hex
	}
	payee: Address
}

/**
 * Environment with settlement configuration.
 */
interface Env {
	ENVIRONMENT: string
	TEMPO_RPC_URL: string
	SETTLER_PRIVATE_KEY?: string
	PAYMENT_CHANNEL: DurableObjectNamespace<PaymentChannel>
	CHANNELS_DB?: D1Database
}

/**
 * Process a batch of settlement jobs.
 */
export async function processSettlementBatch(
	batch: MessageBatch<SettlementJob>,
	env: Env,
): Promise<void> {
	// Skip if no settler key configured
	if (!env.SETTLER_PRIVATE_KEY) {
		console.warn('SETTLER_PRIVATE_KEY not configured, skipping settlements')
		batch.ackAll()
		return
	}

	// Use moderato for testnet, mainnet chain when available
	const chain = tempoModerato

	const publicClient = createPublicClient({
		chain,
		transport: http(env.TEMPO_RPC_URL),
	})

	const account = privateKeyToAccount(env.SETTLER_PRIVATE_KEY as Hex)
	const walletClient = createWalletClient({
		account,
		chain,
		transport: http(env.TEMPO_RPC_URL),
	})

	// Process each settlement job
	for (const message of batch.messages) {
		const job = message.body

		try {
			// Encode settlement transaction
			const data = encodeFunctionData({
				abi: TempoStreamChannelABI,
				functionName: 'settle',
				args: [
					job.channelId,
					job.voucher.cumulativeAmount,
					job.voucher.validUntil,
					job.voucher.signature,
				],
			})

			// Send transaction
			const txHash = await walletClient.sendTransaction({
				chain,
				to: job.escrowContract,
				data,
			})

			// Wait for confirmation
			const receipt = await publicClient.waitForTransactionReceipt({
				hash: txHash,
				timeout: 60_000, // 1 minute timeout
			})

			if (receipt.status === 'success') {
				// Update DO with settlement confirmation
				const channelId = env.PAYMENT_CHANNEL.idFromName(job.channelId)
				const channelDO = env.PAYMENT_CHANNEL.get(channelId)
				await channelDO.recordSettlement(job.voucher.cumulativeAmount)

				// Record in D1 if available
				if (env.CHANNELS_DB) {
					await env.CHANNELS_DB.prepare(
						`INSERT INTO settlements (channel_id, amount, tx_hash, settled_at)
						 VALUES (?, ?, ?, ?)`,
					)
						.bind(
							job.channelId,
							job.voucher.cumulativeAmount.toString(),
							txHash,
							new Date().toISOString(),
						)
						.run()
				}

				console.log(`Settlement successful: ${job.channelId} -> ${txHash}`)
				message.ack()
			} else {
				console.error(`Settlement reverted: ${job.channelId} -> ${txHash}`)
				message.retry()
			}
		} catch (error) {
			console.error(`Settlement failed: ${job.channelId}`, error)
			message.retry()
		}
	}
}

/**
 * Export queue handler.
 */
export default {
	async queue(batch: MessageBatch<SettlementJob>, env: Env, _ctx: ExecutionContext): Promise<void> {
		await processSettlementBatch(batch, env)
	},
}
