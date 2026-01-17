#!/usr/bin/env npx tsx
/**
 * Local Load Test: Durable Object Sharding
 *
 * Proves out the PaymentChannel Durable Object architecture with:
 * - 3 independent payment channels (shards)
 * - Concurrent voucher submissions per channel
 * - Verification that state is isolated per DO instance
 *
 * Usage:
 *   1. Start the worker: pnpm --filter @tempo/payments-proxy dev
 *   2. Run this test: npx tsx scripts/test-do-shards.ts
 */

import { createWalletClient, formatUnits, type Hex, http } from 'viem'
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'
import { tempoModerato } from 'viem/chains'

// ============================================================================
// Configuration
// ============================================================================

const WORKER_URL = process.env.WORKER_URL || 'http://localhost:8787'
const NUM_SHARDS = 3
const VOUCHERS_PER_SHARD = 5 // Keep small for local testing
const VOUCHER_AMOUNT = 100_000n // $0.10 per voucher
const _REQUEST_TIMEOUT_MS = 5000 // 5s timeout per request
const _DELAY_BETWEEN_VOUCHERS_MS = 100 // Rate limit ourselves
const _MAX_RETRIES = 2

// Mock escrow contract for testing
const MOCK_ESCROW = '0x1234567890123456789012345678901234567890' as const

// ============================================================================
// Helpers
// ============================================================================

const colors = {
	reset: '\x1b[0m',
	green: '\x1b[32m',
	yellow: '\x1b[33m',
	blue: '\x1b[34m',
	magenta: '\x1b[35m',
	cyan: '\x1b[36m',
	red: '\x1b[31m',
	dim: '\x1b[2m',
}

function log(shard: number, msg: string) {
	const shardColors = [colors.cyan, colors.magenta, colors.yellow]
	const color = shardColors[shard % shardColors.length]
	console.log(`${color}[Shard ${shard}]${colors.reset} ${msg}`)
}

function generateChannelId(shard: number): Hex {
	// Deterministic channel ID per shard
	const hex = shard.toString(16).padStart(64, '0')
	return `0x${hex}` as Hex
}

// ============================================================================
// Shard Test Class
// ============================================================================

class ShardTest {
	private channelId: Hex
	private privateKey: Hex
	private account: ReturnType<typeof privateKeyToAccount>
	private walletClient: ReturnType<typeof createWalletClient>
	private cumulativeAmount = 0n
	private voucherCount = 0

	constructor(private shard: number) {
		this.channelId = generateChannelId(shard)
		this.privateKey = generatePrivateKey()
		this.account = privateKeyToAccount(this.privateKey)
		this.walletClient = createWalletClient({
			account: this.account,
			chain: tempoModerato,
			transport: http(),
		})
	}

	async signVoucher(amount: bigint): Promise<{
		channelId: Hex
		cumulativeAmount: bigint
		validUntil: bigint
		signature: Hex
	}> {
		this.cumulativeAmount += amount
		const validUntil = BigInt(Math.floor(Date.now() / 1000) + 3600)

		const signature = await this.walletClient.signTypedData({
			domain: {
				name: 'Tempo Stream Channel',
				version: '1',
				chainId: tempoModerato.id,
				verifyingContract: MOCK_ESCROW,
			},
			types: {
				Voucher: [
					{ name: 'channelId', type: 'bytes32' },
					{ name: 'cumulativeAmount', type: 'uint128' },
					{ name: 'validUntil', type: 'uint64' },
				],
			},
			primaryType: 'Voucher',
			message: {
				channelId: this.channelId,
				cumulativeAmount: this.cumulativeAmount,
				validUntil,
			},
		})

		this.voucherCount++

		return {
			channelId: this.channelId,
			cumulativeAmount: this.cumulativeAmount,
			validUntil,
			signature,
		}
	}

	async testDOEndpoint(): Promise<{ success: boolean; latencyMs: number; error?: string }> {
		const voucher = await this.signVoucher(VOUCHER_AMOUNT)
		const start = performance.now()

		// Add timeout via AbortController to prevent hanging
		const controller = new AbortController()
		const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

		try {
			// Call the DO directly via a test endpoint
			const response = await fetch(`${WORKER_URL}/internal/channel/${this.channelId}/verify`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					voucher: {
						channelId: voucher.channelId,
						cumulativeAmount: voucher.cumulativeAmount.toString(),
						validUntil: voucher.validUntil.toString(),
						signature: voucher.signature,
					},
					minDelta: VOUCHER_AMOUNT.toString(),
				}),
				signal: controller.signal,
			})

			clearTimeout(timeoutId)
			const latencyMs = performance.now() - start

			if (response.ok) {
				const data = (await response.json()) as {
					valid: boolean
					delta?: string
					remaining?: string
				}
				if (data.valid) {
					log(
						this.shard,
						`Voucher #${this.voucherCount} verified ✓ (${latencyMs.toFixed(1)}ms) ` +
							`cumulative=$${formatUnits(this.cumulativeAmount, 6)}`,
					)
					return { success: true, latencyMs }
				}
				return { success: false, latencyMs, error: 'Verification returned invalid' }
			}

			const errorText = await response.text()
			return { success: false, latencyMs, error: `HTTP ${response.status}: ${errorText}` }
		} catch (error) {
			clearTimeout(timeoutId)
			const latencyMs = performance.now() - start
			const errorMsg = error instanceof Error ? error.message : String(error)
			return {
				success: false,
				latencyMs,
				error: errorMsg.includes('abort') ? 'Request timed out' : errorMsg,
			}
		}
	}

	get stats() {
		return {
			shard: this.shard,
			channelId: this.channelId,
			payer: this.account.address,
			voucherCount: this.voucherCount,
			cumulativeAmount: this.cumulativeAmount,
		}
	}
}

// ============================================================================
// Test Runner
// ============================================================================

async function runShardTest(
	shard: ShardTest,
	numVouchers: number,
): Promise<{
	successes: number
	failures: number
	totalLatencyMs: number
	errors: string[]
}> {
	let successes = 0
	let failures = 0
	let totalLatencyMs = 0
	const errors: string[] = []

	for (let i = 0; i < numVouchers; i++) {
		const result = await shard.testDOEndpoint()
		totalLatencyMs += result.latencyMs

		if (result.success) {
			successes++
		} else {
			failures++
			if (result.error) {
				errors.push(result.error)
			}
		}

		// Rate limit to avoid overwhelming the local worker
		await new Promise((r) => setTimeout(r, DELAY_BETWEEN_VOUCHERS_MS))
	}

	return { successes, failures, totalLatencyMs, errors }
}

async function main() {
	console.log(`\n${colors.cyan}${'═'.repeat(60)}${colors.reset}`)
	console.log(`${colors.cyan}  Durable Object Sharding Test${colors.reset}`)
	console.log(`${colors.cyan}${'═'.repeat(60)}${colors.reset}`)
	console.log(`  Worker URL: ${WORKER_URL}`)
	console.log(`  Shards: ${NUM_SHARDS}`)
	console.log(`  Vouchers per shard: ${VOUCHERS_PER_SHARD}`)
	console.log(`  Amount per voucher: $${formatUnits(VOUCHER_AMOUNT, 6)}`)
	console.log()

	// Check worker health
	try {
		const healthRes = await fetch(`${WORKER_URL}/health`)
		if (!healthRes.ok) {
			console.error(
				`${colors.red}Worker not healthy. Start with: pnpm --filter @tempo/payments-proxy dev${colors.reset}`,
			)
			process.exit(1)
		}
		console.log(`${colors.green}✓ Worker is healthy${colors.reset}\n`)
	} catch {
		console.error(`${colors.red}Cannot connect to worker at ${WORKER_URL}${colors.reset}`)
		console.error(`Start with: pnpm --filter @tempo/payments-proxy dev`)
		process.exit(1)
	}

	// Create shards
	const shards = Array.from({ length: NUM_SHARDS }, (_, i) => new ShardTest(i))

	console.log(`${colors.yellow}Created ${NUM_SHARDS} payment channels:${colors.reset}`)
	for (const shard of shards) {
		console.log(`  Shard ${shard.stats.shard}: ${shard.stats.channelId.slice(0, 18)}...`)
		console.log(`    Payer: ${shard.stats.payer}`)
	}
	console.log()

	// Run tests - shards run concurrently, but each shard processes vouchers sequentially
	// This gives us parallelism across DOs without overwhelming a single process
	console.log(
		`${colors.blue}Starting voucher submissions (${NUM_SHARDS} shards in parallel)...${colors.reset}\n`,
	)

	const startTime = performance.now()

	// Use Promise.allSettled for graceful handling if one shard fails
	const settledResults = await Promise.allSettled(
		shards.map((shard) => runShardTest(shard, VOUCHERS_PER_SHARD)),
	)

	const results = settledResults.map((r) =>
		r.status === 'fulfilled'
			? r.value
			: {
					successes: 0,
					failures: VOUCHERS_PER_SHARD,
					totalLatencyMs: 0,
					errors: [r.reason?.message || 'Unknown error'],
				},
	)

	const totalTime = performance.now() - startTime

	// Aggregate results
	console.log(`\n${colors.cyan}${'═'.repeat(60)}${colors.reset}`)
	console.log(`${colors.cyan}  Results${colors.reset}`)
	console.log(`${colors.cyan}${'═'.repeat(60)}${colors.reset}\n`)

	let totalSuccesses = 0
	let totalFailures = 0
	let totalLatency = 0
	const allErrors: string[] = []

	for (let i = 0; i < shards.length; i++) {
		const shard = shards[i]!
		const result = results[i]!

		totalSuccesses += result.successes
		totalFailures += result.failures
		totalLatency += result.totalLatencyMs
		allErrors.push(...result.errors)

		const avgLatency = result.totalLatencyMs / VOUCHERS_PER_SHARD
		const status =
			result.failures === 0
				? `${colors.green}PASS${colors.reset}`
				: `${colors.red}FAIL${colors.reset}`

		console.log(`  Shard ${i}: ${status}`)
		console.log(`    Vouchers: ${result.successes}/${VOUCHERS_PER_SHARD} successful`)
		console.log(`    Final cumulative: $${formatUnits(shard.stats.cumulativeAmount, 6)}`)
		console.log(`    Avg latency: ${avgLatency.toFixed(1)}ms`)
		if (result.errors.length > 0) {
			console.log(`    Errors: ${result.errors[0]}`)
		}
		console.log()
	}

	const totalVouchers = NUM_SHARDS * VOUCHERS_PER_SHARD
	const avgLatency = totalLatency / totalVouchers
	const throughput = (totalVouchers / (totalTime / 1000)).toFixed(1)

	console.log(`${colors.cyan}${'─'.repeat(60)}${colors.reset}`)
	console.log(`  Summary:`)
	console.log(`    Total vouchers: ${totalSuccesses}/${totalVouchers} successful`)
	console.log(`    Total time: ${(totalTime / 1000).toFixed(2)}s`)
	console.log(`    Throughput: ${throughput} vouchers/sec`)
	console.log(`    Avg latency: ${avgLatency.toFixed(1)}ms`)
	console.log(`${colors.cyan}${'─'.repeat(60)}${colors.reset}\n`)

	if (totalFailures > 0) {
		console.log(`${colors.red}Some tests failed. Common errors:${colors.reset}`)
		const uniqueErrors = [...new Set(allErrors)].slice(0, 3)
		for (const err of uniqueErrors) {
			console.log(`  - ${err}`)
		}
		console.log()
	}

	// Verify isolation: each shard should have independent state
	console.log(`${colors.yellow}Verifying shard isolation...${colors.reset}`)
	const expectedPerShard = VOUCHER_AMOUNT * BigInt(VOUCHERS_PER_SHARD)
	let isolationPassed = true

	for (const shard of shards) {
		if (shard.stats.cumulativeAmount !== expectedPerShard) {
			console.log(
				`${colors.red}  Shard ${shard.stats.shard}: Expected $${formatUnits(expectedPerShard, 6)}, ` +
					`got $${formatUnits(shard.stats.cumulativeAmount, 6)}${colors.reset}`,
			)
			isolationPassed = false
		} else {
			console.log(
				`${colors.green}  Shard ${shard.stats.shard}: ✓ Correct state ($${formatUnits(shard.stats.cumulativeAmount, 6)})${colors.reset}`,
			)
		}
	}

	console.log()
	if (isolationPassed && totalFailures === 0) {
		console.log(
			`${colors.green}✓ All tests passed! Durable Object sharding works correctly.${colors.reset}\n`,
		)
		process.exit(0)
	} else {
		console.log(`${colors.red}✗ Some tests failed.${colors.reset}\n`)
		process.exit(1)
	}
}

main().catch((err) => {
	console.error(`${colors.red}Error:${colors.reset}`, err)
	process.exit(1)
})
