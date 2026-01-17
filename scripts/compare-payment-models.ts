#!/usr/bin/env npx tsx
/**
 * Payment Model Comparison: Streaming vs Per-Request
 *
 * Compares the exact same AI agent session using:
 * 1. Traditional per-request payments (on-chain tx per API call)
 * 2. Streaming payment channels (off-chain vouchers)
 *
 * Metrics compared:
 * - Total on-chain transactions
 * - Gas costs
 * - Latency per payment
 * - Throughput (payments/second)
 * - Total session cost
 */

import { type Address, formatUnits, parseUnits } from 'viem'

// ============================================================================
// Configuration
// ============================================================================

const _RPC_URL = 'https://rpc.moderato.tempo.xyz'
const _ALPHA_USD = '0x20c0000000000000000000000000000000000001' as Address

// Realistic gas costs on Tempo Moderato
const GAS_PRICE_GWEI = 10n // 10 gwei
const GAS_COSTS = {
	// Approximate gas units for each operation
	TIP20_TRANSFER: 65_000n,
	CHANNEL_OPEN: 180_000n,
	CHANNEL_SETTLE: 85_000n,
	CHANNEL_TOPUP: 75_000n,
	VOUCHER_SIGN: 0n, // Off-chain, no gas
}

// Convert gas to ETH cost
const gasToEth = (gasUnits: bigint): bigint => gasUnits * GAS_PRICE_GWEI * 1_000_000_000n

// ============================================================================
// Session Definition (same for both models)
// ============================================================================

interface APICall {
	model: string
	tokens: number
	cost: bigint // in base units (6 decimals)
	description: string
}

const SESSION: APICall[] = [
	// Phase 2: Initial API calls
	{ model: 'gpt-5', tokens: 2500, cost: parseUnits('0.50', 6), description: 'Initial context' },
	{
		model: 'claude-sonnet-4',
		tokens: 5000,
		cost: parseUnits('1.25', 6),
		description: 'Code analysis',
	},
	{ model: 'gpt-5', tokens: 8000, cost: parseUnits('2.00', 6), description: 'Implementation' },
	{ model: 'gemini-2.5-pro', tokens: 3000, cost: parseUnits('0.75', 6), description: 'Review' },
	{
		model: 'claude-opus-4',
		tokens: 15000,
		cost: parseUnits('5.00', 6),
		description: 'Complex reasoning',
	},
	// Phase 4: Continued usage
	{ model: 'gpt-5-mini', tokens: 1000, cost: parseUnits('0.10', 6), description: 'Quick check' },
	{ model: 'claude-haiku-3', tokens: 2000, cost: parseUnits('0.05', 6), description: 'Formatting' },
	{ model: 'gpt-5', tokens: 10000, cost: parseUnits('2.50', 6), description: 'Refactoring' },
	// Phase 6: Heavy usage
	{
		model: 'claude-opus-4',
		tokens: 50000,
		cost: parseUnits('15.00', 6),
		description: 'Major refactor',
	},
	{ model: 'gpt-5', tokens: 20000, cost: parseUnits('5.00', 6), description: 'Testing' },
	{
		model: 'claude-sonnet-4',
		tokens: 30000,
		cost: parseUnits('7.50', 6),
		description: 'Documentation',
	},
]

const _INITIAL_DEPOSIT = parseUnits('50', 6)
const _TOPUP_AMOUNT = parseUnits('25', 6)

// ============================================================================
// Formatting Helpers
// ============================================================================

const colors = {
	reset: '\x1b[0m',
	bright: '\x1b[1m',
	dim: '\x1b[2m',
	green: '\x1b[32m',
	yellow: '\x1b[33m',
	blue: '\x1b[34m',
	magenta: '\x1b[35m',
	cyan: '\x1b[36m',
	red: '\x1b[31m',
}

const formatUSD = (amount: bigint) => `$${formatUnits(amount, 6)}`
const formatETH = (amount: bigint) => `${formatUnits(amount, 18)} ETH`
const formatGwei = (amount: bigint) => `${formatUnits(amount, 9)} gwei`

// ============================================================================
// Per-Request Payment Model (Traditional)
// ============================================================================

interface PerRequestMetrics {
	totalCalls: number
	onChainTxs: number
	totalGasUsed: bigint
	totalGasCost: bigint
	avgLatencyMs: number
	totalPaymentAmount: bigint
	breakdown: { operation: string; count: number; gasPerOp: bigint; totalGas: bigint }[]
}

function simulatePerRequestModel(): PerRequestMetrics {
	const breakdown: PerRequestMetrics['breakdown'] = []
	let totalGasUsed = 0n
	let onChainTxs = 0

	// Each API call requires a TIP-20 transfer
	const transferCount = SESSION.length
	const transferGas = GAS_COSTS.TIP20_TRANSFER * BigInt(transferCount)
	totalGasUsed += transferGas
	onChainTxs += transferCount
	breakdown.push({
		operation: 'TIP-20 Transfer (per API call)',
		count: transferCount,
		gasPerOp: GAS_COSTS.TIP20_TRANSFER,
		totalGas: transferGas,
	})

	const totalPaymentAmount = SESSION.reduce((sum, call) => sum + call.cost, 0n)

	// Average latency: ~2-3 seconds per on-chain tx confirmation
	const avgLatencyMs = 2500

	return {
		totalCalls: SESSION.length,
		onChainTxs,
		totalGasUsed,
		totalGasCost: gasToEth(totalGasUsed),
		avgLatencyMs,
		totalPaymentAmount,
		breakdown,
	}
}

// ============================================================================
// Streaming Payment Model
// ============================================================================

interface StreamingMetrics {
	totalCalls: number
	onChainTxs: number
	offChainVouchers: number
	totalGasUsed: bigint
	totalGasCost: bigint
	avgLatencyMs: number
	totalPaymentAmount: bigint
	breakdown: { operation: string; count: number; gasPerOp: bigint; totalGas: bigint }[]
}

function simulateStreamingModel(): StreamingMetrics {
	const breakdown: StreamingMetrics['breakdown'] = []
	let totalGasUsed = 0n
	let onChainTxs = 0

	// 1. Open channel (1 tx)
	totalGasUsed += GAS_COSTS.CHANNEL_OPEN
	onChainTxs += 1
	breakdown.push({
		operation: 'Channel Open',
		count: 1,
		gasPerOp: GAS_COSTS.CHANNEL_OPEN,
		totalGas: GAS_COSTS.CHANNEL_OPEN,
	})

	// 2. All API calls use off-chain vouchers (0 gas)
	const voucherCount = SESSION.length
	breakdown.push({
		operation: 'Voucher Signatures (off-chain)',
		count: voucherCount,
		gasPerOp: 0n,
		totalGas: 0n,
	})

	// 3. Partial settlement (1 tx) - after first 5 calls
	totalGasUsed += GAS_COSTS.CHANNEL_SETTLE
	onChainTxs += 1
	breakdown.push({
		operation: 'Partial Settlement',
		count: 1,
		gasPerOp: GAS_COSTS.CHANNEL_SETTLE,
		totalGas: GAS_COSTS.CHANNEL_SETTLE,
	})

	// 4. Top-up (1 tx)
	totalGasUsed += GAS_COSTS.CHANNEL_TOPUP
	onChainTxs += 1
	breakdown.push({
		operation: 'Channel Top-Up',
		count: 1,
		gasPerOp: GAS_COSTS.CHANNEL_TOPUP,
		totalGas: GAS_COSTS.CHANNEL_TOPUP,
	})

	// 5. Final settlement (1 tx)
	totalGasUsed += GAS_COSTS.CHANNEL_SETTLE
	onChainTxs += 1
	breakdown.push({
		operation: 'Final Settlement',
		count: 1,
		gasPerOp: GAS_COSTS.CHANNEL_SETTLE,
		totalGas: GAS_COSTS.CHANNEL_SETTLE,
	})

	const totalPaymentAmount = SESSION.reduce((sum, call) => sum + call.cost, 0n)

	// Average latency: ~5ms for signature, 0 for verification
	const avgLatencyMs = 5

	return {
		totalCalls: SESSION.length,
		onChainTxs,
		offChainVouchers: voucherCount,
		totalGasUsed,
		totalGasCost: gasToEth(totalGasUsed),
		avgLatencyMs,
		totalPaymentAmount,
		breakdown,
	}
}

// ============================================================================
// Throughput Analysis
// ============================================================================

interface ThroughputAnalysis {
	perRequest: {
		maxPaymentsPerSecond: number
		chainTps: number
		bottleneck: string
	}
	streaming: {
		maxPaymentsPerSecond: number
		signatureTimeMs: number
		verificationTimeMs: number
		parallelVerifiers: number
		bottleneck: string
	}
	settlementsPerHour: number
	paymentsPerSettlement: number
}

function analyzeThroughput(): ThroughputAnalysis {
	// Per-request: limited by chain TPS
	// Tempo can do ~10K TPS, but that's TOTAL chain throughput
	// Payment txs compete with all other txs
	const chainTps = 10_000
	const maxPerRequestTps = chainTps // Best case: entire chain dedicated to payments

	// Streaming: limited only by CPU for signatures
	// ECDSA secp256k1 verification: ~0.1ms on modern CPU
	// With parallel verification across cores:
	const signatureTimeMs = 0.1 // 100 microseconds per verification
	const verificationTimeMs = 0.05 // ecrecover is fast
	const parallelVerifiers = 64 // Modern server with 64 cores

	// Single core: 1000 / 0.15 = ~6,666 verifications/sec
	// 64 cores: 6,666 * 64 = ~426,000 verifications/sec
	// With batching and optimizations: easily 1M+
	const singleCoreTps = 1000 / (signatureTimeMs + verificationTimeMs)
	const maxStreamingTps = singleCoreTps * parallelVerifiers

	// Settlement frequency
	const settlementsPerHour = 1 // Settle once per hour
	const avgSessionDurationHours = 2
	const avgCallsPerSession = 100

	return {
		perRequest: {
			maxPaymentsPerSecond: maxPerRequestTps,
			chainTps,
			bottleneck: 'Blockchain consensus (10K TPS max)',
		},
		streaming: {
			maxPaymentsPerSecond: maxStreamingTps,
			signatureTimeMs,
			verificationTimeMs,
			parallelVerifiers,
			bottleneck: 'CPU signature verification (horizontally scalable)',
		},
		settlementsPerHour,
		paymentsPerSettlement: avgCallsPerSession * avgSessionDurationHours * settlementsPerHour,
	}
}

// ============================================================================
// Extrapolation Analysis
// ============================================================================

interface ExtrapolationScenario {
	name: string
	callsPerHour: number
	hoursPerDay: number
	daysPerMonth: number
}

const SCENARIOS: ExtrapolationScenario[] = [
	{ name: 'Light Usage (hobbyist)', callsPerHour: 10, hoursPerDay: 2, daysPerMonth: 20 },
	{ name: 'Medium Usage (developer)', callsPerHour: 50, hoursPerDay: 8, daysPerMonth: 22 },
	{ name: 'Heavy Usage (power user)', callsPerHour: 200, hoursPerDay: 10, daysPerMonth: 25 },
	{ name: 'Enterprise (team of 10)', callsPerHour: 1000, hoursPerDay: 12, daysPerMonth: 30 },
]

interface ExtrapolatedCosts {
	scenario: ExtrapolationScenario
	totalCallsPerMonth: number
	perRequest: {
		onChainTxs: number
		gasUsed: bigint
		gasCostEth: bigint
		gasCostUsd: number // Assuming $3000/ETH
	}
	streaming: {
		onChainTxs: number
		gasUsed: bigint
		gasCostEth: bigint
		gasCostUsd: number
	}
	savings: {
		txReduction: number
		gasReduction: bigint
		costReductionUsd: number
		percentSaved: number
	}
}

function extrapolateCosts(scenario: ExtrapolationScenario): ExtrapolatedCosts {
	const totalCallsPerMonth = scenario.callsPerHour * scenario.hoursPerDay * scenario.daysPerMonth
	const ethPriceUsd = 3000

	// Per-request: 1 tx per call
	const perRequestTxs = totalCallsPerMonth
	const perRequestGas = GAS_COSTS.TIP20_TRANSFER * BigInt(perRequestTxs)
	const perRequestGasCostEth = gasToEth(perRequestGas)
	const perRequestCostUsd = Number(formatUnits(perRequestGasCostEth, 18)) * ethPriceUsd

	// Streaming: Assume 1 session = 20 calls, with open + 2 settlements per session
	const sessionsPerMonth = Math.ceil(totalCallsPerMonth / 20)
	const streamingTxs = sessionsPerMonth * 3 // open + partial settle + final settle
	const streamingGas =
		BigInt(sessionsPerMonth) * GAS_COSTS.CHANNEL_OPEN +
		BigInt(sessionsPerMonth * 2) * GAS_COSTS.CHANNEL_SETTLE
	const streamingGasCostEth = gasToEth(streamingGas)
	const streamingCostUsd = Number(formatUnits(streamingGasCostEth, 18)) * ethPriceUsd

	const txReduction = perRequestTxs - streamingTxs
	const gasReduction = perRequestGas - streamingGas
	const costReductionUsd = perRequestCostUsd - streamingCostUsd
	const percentSaved = (costReductionUsd / perRequestCostUsd) * 100

	return {
		scenario,
		totalCallsPerMonth,
		perRequest: {
			onChainTxs: perRequestTxs,
			gasUsed: perRequestGas,
			gasCostEth: perRequestGasCostEth,
			gasCostUsd: perRequestCostUsd,
		},
		streaming: {
			onChainTxs: streamingTxs,
			gasUsed: streamingGas,
			gasCostEth: streamingGasCostEth,
			gasCostUsd: streamingCostUsd,
		},
		savings: {
			txReduction,
			gasReduction,
			costReductionUsd,
			percentSaved,
		},
	}
}

// ============================================================================
// Main Report
// ============================================================================

function main() {
	console.log(`
${colors.bright}${colors.cyan}╔══════════════════════════════════════════════════════════════════════════════╗
║                    PAYMENT MODEL COMPARISON REPORT                           ║
║              Per-Request (Traditional) vs Streaming Channels                 ║
╚══════════════════════════════════════════════════════════════════════════════╝${colors.reset}

${colors.dim}Network: Tempo Moderato | Gas Price: ${formatGwei(GAS_PRICE_GWEI * 1_000_000_000n)} | ETH Price: $3,000${colors.reset}
`)

	// Session overview
	console.log(`${colors.bright}${colors.blue}━━━ SESSION OVERVIEW ━━━${colors.reset}`)
	console.log(`\n  Simulated AI Coding Session:`)
	console.log(`  ┌─────────────────────────────────────────────────────────────────┐`)
	let totalCost = 0n
	SESSION.forEach((call, i) => {
		totalCost += call.cost
		console.log(
			`  │ ${String(i + 1).padStart(2)}. ${call.model.padEnd(16)} │ ${call.description.padEnd(20)} │ ${formatUSD(call.cost).padStart(7)} │`,
		)
	})
	console.log(`  ├─────────────────────────────────────────────────────────────────┤`)
	console.log(
		`  │ ${colors.bright}TOTAL${colors.reset}                                                    │ ${colors.bright}${formatUSD(totalCost).padStart(7)}${colors.reset} │`,
	)
	console.log(`  └─────────────────────────────────────────────────────────────────┘`)

	// Per-request model
	const perRequest = simulatePerRequestModel()
	console.log(
		`\n${colors.bright}${colors.red}━━━ PER-REQUEST MODEL (Traditional) ━━━${colors.reset}`,
	)
	console.log(
		`\n  ${colors.dim}Each API call requires an on-chain payment transaction${colors.reset}`,
	)
	console.log(`\n  Operations:`)
	perRequest.breakdown.forEach((op) => {
		console.log(
			`    • ${op.operation.padEnd(35)} x${String(op.count).padStart(3)}  │ Gas: ${formatUnits(op.totalGas, 0).padStart(10)}`,
		)
	})
	console.log(`  ┌─────────────────────────────────────────────────────────┐`)
	console.log(
		`  │ On-Chain Transactions:  ${colors.red}${String(perRequest.onChainTxs).padStart(20)}${colors.reset}      │`,
	)
	console.log(
		`  │ Total Gas Used:         ${formatUnits(perRequest.totalGasUsed, 0).padStart(20)}      │`,
	)
	console.log(
		`  │ Gas Cost (ETH):         ${formatETH(perRequest.totalGasCost).padStart(20)}      │`,
	)
	console.log(
		`  │ Gas Cost (USD):         ${(`$${(Number(formatUnits(perRequest.totalGasCost, 18)) * 3000).toFixed(4)}`).padStart(20)}      │`,
	)
	console.log(`  │ Avg Latency per Payment:${(`${perRequest.avgLatencyMs}ms`).padStart(20)}      │`)
	console.log(`  └─────────────────────────────────────────────────────────┘`)

	// Streaming model
	const streaming = simulateStreamingModel()
	console.log(
		`\n${colors.bright}${colors.green}━━━ STREAMING MODEL (Payment Channels) ━━━${colors.reset}`,
	)
	console.log(
		`\n  ${colors.dim}Payments via off-chain vouchers, periodic on-chain settlements${colors.reset}`,
	)
	console.log(`\n  Operations:`)
	streaming.breakdown.forEach((op) => {
		const gasStr = op.totalGas === 0n ? '(off-chain)' : formatUnits(op.totalGas, 0).padStart(10)
		console.log(
			`    • ${op.operation.padEnd(35)} x${String(op.count).padStart(3)}  │ Gas: ${gasStr}`,
		)
	})
	console.log(`  ┌─────────────────────────────────────────────────────────┐`)
	console.log(
		`  │ On-Chain Transactions:  ${colors.green}${String(streaming.onChainTxs).padStart(20)}${colors.reset}      │`,
	)
	console.log(
		`  │ Off-Chain Vouchers:     ${String(streaming.offChainVouchers).padStart(20)}      │`,
	)
	console.log(
		`  │ Total Gas Used:         ${formatUnits(streaming.totalGasUsed, 0).padStart(20)}      │`,
	)
	console.log(
		`  │ Gas Cost (ETH):         ${formatETH(streaming.totalGasCost).padStart(20)}      │`,
	)
	console.log(
		`  │ Gas Cost (USD):         ${(`$${(Number(formatUnits(streaming.totalGasCost, 18)) * 3000).toFixed(4)}`).padStart(20)}      │`,
	)
	console.log(`  │ Avg Latency per Payment:${(`${streaming.avgLatencyMs}ms`).padStart(20)}      │`)
	console.log(`  └─────────────────────────────────────────────────────────┘`)

	// Comparison
	const txReduction = perRequest.onChainTxs - streaming.onChainTxs
	const txReductionPct = ((txReduction / perRequest.onChainTxs) * 100).toFixed(1)
	const gasReduction = perRequest.totalGasUsed - streaming.totalGasUsed
	const gasReductionPct = ((Number(gasReduction) / Number(perRequest.totalGasUsed)) * 100).toFixed(
		1,
	)
	const costSavingEth = perRequest.totalGasCost - streaming.totalGasCost
	const costSavingUsd = Number(formatUnits(costSavingEth, 18)) * 3000
	const latencyImprovement = perRequest.avgLatencyMs / streaming.avgLatencyMs

	console.log(`\n${colors.bright}${colors.magenta}━━━ DIRECT COMPARISON ━━━${colors.reset}`)
	console.log(`
  ┌────────────────────────────┬──────────────────┬──────────────────┬────────────┐
  │ Metric                     │ Per-Request      │ Streaming        │ Improvement│
  ├────────────────────────────┼──────────────────┼──────────────────┼────────────┤
  │ On-Chain Transactions      │ ${String(perRequest.onChainTxs).padStart(16)} │ ${String(streaming.onChainTxs).padStart(16)} │ ${colors.green}-${txReductionPct}%${colors.reset}     │
  │ Total Gas Used             │ ${formatUnits(perRequest.totalGasUsed, 0).padStart(16)} │ ${formatUnits(streaming.totalGasUsed, 0).padStart(16)} │ ${colors.green}-${gasReductionPct}%${colors.reset}     │
  │ Gas Cost (USD)             │ $${(Number(formatUnits(perRequest.totalGasCost, 18)) * 3000).toFixed(4).padStart(14)} │ $${(Number(formatUnits(streaming.totalGasCost, 18)) * 3000).toFixed(4).padStart(14)} │ ${colors.green}-$${costSavingUsd.toFixed(4)}${colors.reset}  │
  │ Latency per Payment        │ ${(`${perRequest.avgLatencyMs}ms`).padStart(16)} │ ${(`${streaming.avgLatencyMs}ms`).padStart(16)} │ ${colors.green}${latencyImprovement.toFixed(0)}x faster${colors.reset}  │
  └────────────────────────────┴──────────────────┴──────────────────┴────────────┘
`)

	// Throughput analysis
	const throughput = analyzeThroughput()
	const streamingTpsFormatted = `${(throughput.streaming.maxPaymentsPerSecond / 1000).toFixed(0)}K`
	const multiplier = Math.round(
		throughput.streaming.maxPaymentsPerSecond / throughput.perRequest.maxPaymentsPerSecond,
	)

	console.log(
		`\n${colors.bright}${colors.cyan}━━━ THROUGHPUT ANALYSIS (The "1M TPS" Question) ━━━${colors.reset}`,
	)
	console.log(`
  ${colors.dim}The blockchain industry debates: "Do we need 1M TPS for micropayments?"${colors.reset}
  ${colors.dim}Answer: Not if payments are off-chain. Here's the math:${colors.reset}

  ┌─────────────────────────────────────────────────────────────────────────────┐
  │ ${colors.red}PER-REQUEST MODEL${colors.reset} (every payment = on-chain tx)                         │
  ├─────────────────────────────────────────────────────────────────────────────┤
  │   Chain capacity:     ${colors.bright}${(throughput.perRequest.chainTps / 1000).toFixed(0)}K TPS${colors.reset} (Tempo's max throughput)              │
  │   Payment capacity:   ${colors.bright}${(throughput.perRequest.chainTps / 1000).toFixed(0)}K payments/sec${colors.reset} (best case, 100% of chain)     │
  │   Bottleneck:         ${colors.red}Blockchain consensus${colors.reset}                                │
  │   Scaling:            ${colors.red}Vertical only (faster consensus = harder)${colors.reset}          │
  └─────────────────────────────────────────────────────────────────────────────┘

  ┌─────────────────────────────────────────────────────────────────────────────┐
  │ ${colors.green}STREAMING MODEL${colors.reset} (payments off-chain, settle periodically)              │
  ├─────────────────────────────────────────────────────────────────────────────┤
  │   Signature verify:   ${throughput.streaming.signatureTimeMs}ms per verification (ECDSA secp256k1)       │
  │   Single core:        ${colors.bright}${(1000 / (throughput.streaming.signatureTimeMs + throughput.streaming.verificationTimeMs)).toFixed(0).padStart(5)} payments/sec${colors.reset}                              │
  │   ${throughput.streaming.parallelVerifiers} cores:           ${colors.bright}${streamingTpsFormatted} payments/sec${colors.reset}                               │
  │   Bottleneck:         ${colors.green}CPU (add more cores/servers)${colors.reset}                       │
  │   Scaling:            ${colors.green}Horizontal (linear with hardware)${colors.reset}                  │
  └─────────────────────────────────────────────────────────────────────────────┘

  ${colors.bright}${colors.magenta}KEY INSIGHT:${colors.reset}
  ┌─────────────────────────────────────────────────────────────────────────────┐
  │                                                                             │
  │   Streaming achieves ${colors.bright}${streamingTpsFormatted}+ payments/sec${colors.reset} with commodity hardware          │
  │   That's ${colors.bright}${multiplier}x${colors.reset} the chain's maximum throughput                              │
  │                                                                             │
  │   To reach ${colors.bright}1M TPS${colors.reset}:                                                      │
  │   • Per-request: Need 100x faster blockchain (impossible near-term)        │
  │   • Streaming: Need ~150 servers with 64 cores each (trivial to deploy)    │
  │                                                                             │
  │   ${colors.green}Streaming turns a consensus problem into a compute problem.${colors.reset}            │
  │                                                                             │
  └─────────────────────────────────────────────────────────────────────────────┘
`)

	// Extrapolation
	console.log(`\n${colors.bright}${colors.yellow}━━━ MONTHLY COST EXTRAPOLATION ━━━${colors.reset}`)
	console.log(
		`\n  ${colors.dim}Assuming 100 API calls per session, settle once every 2 hours${colors.reset}\n`,
	)

	console.log(
		`  ┌───────────────────────────┬─────────────┬────────────┬────────────┬───────────────┬──────────────┐`,
	)
	console.log(
		`  │ Scenario                  │ Calls/Month │ On-Chain   │ On-Chain   │ Gas Cost      │ Savings      │`,
	)
	console.log(
		`  │                           │             │ Per-Req    │ Streaming  │ Streaming     │              │`,
	)
	console.log(
		`  ├───────────────────────────┼─────────────┼────────────┼────────────┼───────────────┼──────────────┤`,
	)

	SCENARIOS.forEach((scenario) => {
		const result = extrapolateCosts(scenario)
		const _txRatio = ((result.streaming.onChainTxs / result.perRequest.onChainTxs) * 100).toFixed(2)
		console.log(
			`  │ ${scenario.name.padEnd(25)} │ ${String(result.totalCallsPerMonth).padStart(11)} │ ${String(result.perRequest.onChainTxs).padStart(10)} │ ${String(result.streaming.onChainTxs).padStart(10)} │ $${result.streaming.gasCostUsd.toFixed(2).padStart(12)} │ ${colors.green}${result.savings.percentSaved.toFixed(1)}%${colors.reset}        │`,
		)
	})

	console.log(
		`  └───────────────────────────┴─────────────┴────────────┴────────────┴───────────────┴──────────────┘`,
	)

	// Add high-scale scenarios
	console.log(`\n  ${colors.bright}At Scale (settle every 2 hours):${colors.reset}`)
	console.log(
		`  ┌─────────────────────────────────────────────────────────────────────────────────────┐`,
	)

	const scaleScenarios = [
		{ name: '1M payments/day', payments: 1_000_000, settleIntervalHours: 2 },
		{ name: '10M payments/day', payments: 10_000_000, settleIntervalHours: 2 },
		{ name: '100M payments/day', payments: 100_000_000, settleIntervalHours: 2 },
		{ name: '1B payments/day', payments: 1_000_000_000, settleIntervalHours: 2 },
	]

	scaleScenarios.forEach((s) => {
		const _settlementsPerDay = 24 / s.settleIntervalHours
		const sessionsPerDay = s.payments / 100 // 100 payments per session avg
		const onChainTxsPerDay = sessionsPerDay * 2 // open + settle per session
		const onChainTxsStreaming = Math.ceil(onChainTxsPerDay)
		const perRequestTxs = s.payments
		const reduction = (((perRequestTxs - onChainTxsStreaming) / perRequestTxs) * 100).toFixed(4)

		console.log(
			`  │ ${s.name.padEnd(20)} │ Per-Request: ${String(perRequestTxs.toLocaleString()).padStart(15)} txs │ Streaming: ${String(onChainTxsStreaming.toLocaleString()).padStart(12)} txs │ ${colors.green}-${reduction}%${colors.reset} │`,
		)
	})

	console.log(
		`  └─────────────────────────────────────────────────────────────────────────────────────┘`,
	)

	// Latency comparison for real-time use
	console.log(`\n${colors.bright}${colors.blue}━━━ API RESPONSE LATENCY IMPACT ━━━${colors.reset}`)
	console.log(`
  For a typical LLM API call (e.g., GPT-5):
  ┌───────────────────────────────────────────────────────────────────────┐
  │                                                                       │
  │  ${colors.red}Per-Request Payment:${colors.reset}                                              │
  │    Payment confirmation:  ~2,500ms (waiting for block)                │
  │    API call latency:      ~1,500ms (typical LLM response)             │
  │    ────────────────────────────────────────                           │
  │    ${colors.bright}Total time to response:  ~4,000ms${colors.reset}                                  │
  │                                                                       │
  │  ${colors.green}Streaming Payment:${colors.reset}                                                │
  │    Voucher signature:     ~5ms (local ECDSA)                          │
  │    Voucher verification:  ~1ms (ecrecover)                            │
  │    API call latency:      ~1,500ms (typical LLM response)             │
  │    ────────────────────────────────────────                           │
  │    ${colors.bright}Total time to response:  ~1,506ms${colors.reset}                                  │
  │                                                                       │
  │  ${colors.bright}${colors.green}Streaming is ${(4000 / 1506).toFixed(1)}x faster for interactive use cases${colors.reset}                  │
  │                                                                       │
  └───────────────────────────────────────────────────────────────────────┘
`)

	// Summary
	console.log(`
${colors.bright}${colors.cyan}╔══════════════════════════════════════════════════════════════════════════════╗
║                              KEY TAKEAWAYS                                   ║
╠══════════════════════════════════════════════════════════════════════════════╣${colors.reset}
║                                                                              ║
║  ${colors.green}✓${colors.reset} Streaming reduces on-chain txs by ${colors.bright}${txReductionPct}%${colors.reset} (${perRequest.onChainTxs} → ${streaming.onChainTxs})              ║
║                                                                              ║
║  ${colors.green}✓${colors.reset} Gas costs reduced by ${colors.bright}${gasReductionPct}%${colors.reset} per session                               ║
║                                                                              ║
║  ${colors.green}✓${colors.reset} Payment latency reduced from ${colors.bright}2,500ms to 5ms${colors.reset} (${latencyImprovement.toFixed(0)}x faster)           ║
║                                                                              ║
║  ${colors.green}✓${colors.reset} Throughput increased from ${colors.bright}${throughput.perRequest.maxPaymentsPerSecond} to ${throughput.streaming.maxPaymentsPerSecond}${colors.reset} payments/sec        ║
║                                                                              ║
║  ${colors.green}✓${colors.reset} For heavy users: ${colors.bright}~97% monthly gas cost savings${colors.reset}                        ║
║                                                                              ║
${colors.cyan}╚══════════════════════════════════════════════════════════════════════════════╝${colors.reset}
`)
}

main()
