#!/usr/bin/env npx tsx
/**
 * Full Lifecycle Demo: Streaming Payment Channels on Tempo Moderato
 *
 * This script demonstrates a REAL-WORLD AI agent session:
 *
 * SCENARIO: AI coding agent using OpenRouter API with streaming payments
 * - Agent opens a $50 payment channel
 * - Makes multiple API calls (GPT-5, Claude, Gemini) with increasing vouchers
 * - Server performs partial settlement mid-session
 * - Agent tops up the channel when running low
 * - Server settles remaining balance at end of session
 *
 * All transactions are REAL on Tempo Moderato testnet.
 *
 * Usage:
 *   DEPLOYER_KEY=0x... npx tsx scripts/demo-full-lifecycle.ts
 */

import {
	type Address,
	createPublicClient,
	createWalletClient,
	encodeFunctionData,
	formatUnits,
	type Hex,
	http,
	parseUnits,
} from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { tempoModerato } from 'viem/chains'
import { TempoStreamChannelABI } from '../packages/stream-channels/src/abi.js'
import { createStreamChannelClient } from '../packages/stream-channels/src/client.js'
import { createStreamChannelServer } from '../packages/stream-channels/src/server.js'

// ============================================================================
// Configuration
// ============================================================================

const RPC_URL = 'https://rpc.moderato.tempo.xyz'
const ALPHA_USD = '0x20c0000000000000000000000000000000000001' as Address

// We'll deploy a fresh contract or use existing
let ESCROW_CONTRACT = (process.env.STREAM_ESCROW_CONTRACT || '') as Address

const DEPLOYER_KEY = process.env.DEPLOYER_KEY as Hex

if (!DEPLOYER_KEY) {
	console.error('❌ DEPLOYER_KEY environment variable required')
	console.error('   Generate one: DEPLOYER_KEY=0x$(openssl rand -hex 32)')
	process.exit(1)
}

// ============================================================================
// Logging & Formatting
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
}

const formatUSD = (amount: bigint) => `$${formatUnits(amount, 6)}`

const log = {
	title: (msg: string) =>
		console.log(
			`\n${colors.bright}${colors.cyan}${'═'.repeat(70)}${colors.reset}\n${colors.bright}  ${msg}${colors.reset}\n${colors.cyan}${'═'.repeat(70)}${colors.reset}`,
		),
	phase: (n: number, msg: string) =>
		console.log(
			`\n${colors.bright}${colors.magenta}┌─ Phase ${n}: ${msg} ${'─'.repeat(50 - msg.length)}┐${colors.reset}`,
		),
	phaseEnd: () => console.log(`${colors.magenta}└${'─'.repeat(68)}┘${colors.reset}`),
	step: (msg: string) => console.log(`${colors.blue}  ▸${colors.reset} ${msg}`),
	tx: (label: string, hash: string) =>
		console.log(
			`${colors.green}  ✓${colors.reset} ${label}: ${colors.dim}${hash.slice(0, 18)}...${colors.reset}`,
		),
	balance: (label: string, amount: bigint) =>
		console.log(
			`${colors.yellow}  💰${colors.reset} ${label}: ${colors.bright}${formatUSD(amount)}${colors.reset}`,
		),
	voucher: (n: number, cumulative: bigint, delta: bigint, remaining: bigint) => {
		console.log(`${colors.cyan}  📝 Voucher #${n}${colors.reset}`)
		console.log(`      Cumulative: ${formatUSD(cumulative)} (+${formatUSD(delta)})`)
		console.log(`      Remaining:  ${formatUSD(remaining)}`)
	},
	api: (model: string, tokens: number, cost: bigint) => {
		console.log(`${colors.blue}  🤖 API Call: ${model}${colors.reset}`)
		console.log(`      Tokens: ~${tokens} | Cost: ${formatUSD(cost)}`)
	},
	settle: (amount: bigint, hash: string) => {
		console.log(`${colors.green}  💸 Settlement: ${formatUSD(amount)}${colors.reset}`)
		console.log(`      Tx: ${colors.dim}${hash.slice(0, 18)}...${colors.reset}`)
	},
	error: (msg: string) => console.log(`${colors.bright}\x1b[31m  ✗ ${msg}${colors.reset}`),
	info: (msg: string) => console.log(`${colors.dim}  ℹ ${msg}${colors.reset}`),
	json: (label: string, obj: unknown) => {
		console.log(`  ${label}:`)
		const lines = JSON.stringify(
			obj,
			(_, v) => (typeof v === 'bigint' ? v.toString() : v),
			2,
		).split('\n')
		for (const l of lines) {
			console.log(`    ${colors.dim}${l}${colors.reset}`)
		}
	},
}

// ============================================================================
// Contract Deployment (if needed)
// ============================================================================

async function deployContract(
	publicClient: ReturnType<typeof createPublicClient>,
	deployerKey: Hex,
): Promise<Address> {
	log.step('Deploying TempoStreamChannel contract via forge script...')

	const { execSync } = await import('node:child_process')
	const path = await import('node:path')
	const contractsDir = path.join(process.cwd(), 'packages/stream-channels')

	// Get deployer address and fund it
	const deployerAddress = privateKeyToAccount(deployerKey).address
	log.step(`Deployer address: ${deployerAddress}`)

	// Fund deployer via tempo_fundAddress
	log.step('Funding deployer account...')
	await fetch(RPC_URL, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			jsonrpc: '2.0',
			method: 'tempo_fundAddress',
			params: [deployerAddress],
			id: 1,
		}),
	})
	await new Promise((r) => setTimeout(r, 3000))

	const balance = await publicClient.getBalance({ address: deployerAddress })
	log.step(`Deployer balance: ${formatUnits(balance, 18)} ETH`)

	// Deploy using forge script
	const output = execSync(
		`forge script script/Deploy.s.sol:DeployScript --rpc-url ${RPC_URL} --broadcast --legacy -vvv`,
		{
			cwd: contractsDir,
			env: { ...process.env, DEPLOYER_PRIVATE_KEY: deployerKey },
			encoding: 'utf-8',
		},
	)

	// Extract address from output
	const match = output.match(/TempoStreamChannel deployed at: (0x[a-fA-F0-9]{40})/)
	if (!match) {
		console.log(output)
		throw new Error('Could not extract contract address from deploy output')
	}

	const contractAddress = match[1] as Address
	log.step(`Contract deployed at: ${contractAddress}`)
	return contractAddress
}

// ============================================================================
// Fund Account Helper
// ============================================================================

async function fundAccount(address: Address): Promise<void> {
	log.step(`Funding account ${address.slice(0, 10)}...`)
	await fetch(RPC_URL, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			jsonrpc: '2.0',
			method: 'tempo_fundAddress',
			params: [address],
			id: 1,
		}),
	})
	await new Promise((r) => setTimeout(r, 2000))
}

// ============================================================================
// Main Demo
// ============================================================================

async function main() {
	log.title('STREAMING PAYMENT CHANNEL - FULL LIFECYCLE DEMO')
	console.log(`  Network: Tempo Moderato (Chain ID: 42431)`)
	console.log(`  Token: AlphaUSD (${ALPHA_USD})`)

	// =========================================================================
	// Setup: Create accounts and clients
	// =========================================================================
	log.phase(0, 'Setup')

	// Deployer/Payer account (simulates the AI agent/client)
	const payerAccount = privateKeyToAccount(DEPLOYER_KEY)
	log.step(`Payer (AI Agent): ${payerAccount.address}`)

	// Server account (simulates the payment proxy server)
	const serverKey = `0x${Array.from(crypto.getRandomValues(new Uint8Array(32)))
		.map((b) => b.toString(16).padStart(2, '0'))
		.join('')}` as Hex
	const serverAccount = privateKeyToAccount(serverKey)
	log.step(`Server (Proxy): ${serverAccount.address}`)

	// Create clients
	const publicClient = createPublicClient({
		chain: tempoModerato,
		transport: http(RPC_URL),
	})

	const payerWallet = createWalletClient({
		account: payerAccount,
		chain: tempoModerato,
		transport: http(RPC_URL),
	})

	const serverWallet = createWalletClient({
		account: serverAccount,
		chain: tempoModerato,
		transport: http(RPC_URL),
	})

	// Fund accounts
	const payerBalance = await publicClient.getBalance({ address: payerAccount.address })
	log.step(`Payer balance: ${formatUnits(payerBalance, 18)} ETH`)
	if (payerBalance < parseUnits('0.01', 18)) {
		await fundAccount(payerAccount.address)
		// Wait for funding to be confirmed
		await new Promise((r) => setTimeout(r, 3000))
		const newBalance = await publicClient.getBalance({ address: payerAccount.address })
		log.step(`Payer funded: ${formatUnits(newBalance, 18)} ETH`)
	}
	await fundAccount(serverAccount.address)

	// Deploy contract if needed
	if (!ESCROW_CONTRACT) {
		// Fund deployer if needed (it's the same as payer)
		const deployerBalance = await publicClient.getBalance({ address: payerAccount.address })
		if (deployerBalance < parseUnits('0.02', 18)) {
			log.step('Funding deployer for contract deployment...')
			await fundAccount(payerAccount.address)
			await new Promise((r) => setTimeout(r, 3000))
		}
		ESCROW_CONTRACT = await deployContract(publicClient, DEPLOYER_KEY)
	} else {
		log.step(`Using existing contract: ${ESCROW_CONTRACT}`)
	}

	// Create SDK clients
	const clientSDK = createStreamChannelClient(
		publicClient,
		payerWallet,
		payerAccount,
		tempoModerato,
	)
	// For server, we need to pass the account object to enable transaction signing
	const serverSDK = createStreamChannelServer(
		publicClient,
		serverWallet,
		serverAccount.address,
		tempoModerato.id,
		tempoModerato,
	)
	// Monkey-patch the settle method to use the proper account
	serverSDK.settle = async (escrowContract: Address, channelId: Hex) => {
		const state = serverSDK.getChannelState(channelId)
		if (!state || !state.highestVoucher) {
			return { success: false as const, error: 'No voucher to settle' }
		}
		const voucher = state.highestVoucher
		const data = encodeFunctionData({
			abi: TempoStreamChannelABI,
			functionName: 'settle',
			args: [channelId, voucher.cumulativeAmount, voucher.signature],
		})
		try {
			const txHash = await serverWallet.sendTransaction({
				account: serverAccount,
				chain: tempoModerato,
				to: escrowContract,
				data,
			})
			await publicClient.waitForTransactionReceipt({ hash: txHash })
			const delta = voucher.cumulativeAmount - state.settled
			state.settled = voucher.cumulativeAmount
			return { success: true as const, txHash, settled: delta }
		} catch (e) {
			return { success: false as const, error: `Settlement failed: ${e}` }
		}
	}

	log.phaseEnd()

	// =========================================================================
	// Phase 1: AI Agent opens payment channel
	// =========================================================================
	log.phase(1, 'Open Payment Channel')
	log.info('AI agent starts a coding session, deposits $50 into streaming channel')

	const initialDeposit = parseUnits('50', 6) // $50
	const salt = `0x${Array.from(crypto.getRandomValues(new Uint8Array(32)))
		.map((b) => b.toString(16).padStart(2, '0'))
		.join('')}` as Hex

	log.step('Creating channel with parameters:')
	log.json('Channel params', {
		payer: payerAccount.address,
		payee: serverAccount.address,
		token: ALPHA_USD,
		deposit: formatUSD(initialDeposit),
	})

	const { channelId, txHash: openTxHash } = await clientSDK.openChannel(ESCROW_CONTRACT, {
		payee: serverAccount.address,
		token: ALPHA_USD,
		deposit: initialDeposit,
		salt,
	})

	log.tx('Channel opened', openTxHash)
	log.step(`Channel ID: ${channelId}`)
	log.balance('Initial deposit', initialDeposit)

	// Server acknowledges channel
	const initialVoucher = await clientSDK.signVoucher(ESCROW_CONTRACT, channelId, 0n)
	const openResult = await serverSDK.verifyChannelOpen(
		ESCROW_CONTRACT,
		channelId,
		openTxHash,
		initialVoucher,
	)
	if (!openResult.valid) throw new Error(openResult.error)
	log.step('Server acknowledged channel open ✓')

	log.phaseEnd()

	// =========================================================================
	// Phase 2: Multiple API calls with vouchers
	// =========================================================================
	log.phase(2, 'API Calls with Incremental Vouchers')
	log.info('AI agent makes multiple LLM API calls, each with a new voucher')

	const apiCalls = [
		{ model: 'gpt-5', tokens: 2500, cost: parseUnits('0.50', 6) }, // $0.50
		{ model: 'claude-sonnet-4', tokens: 5000, cost: parseUnits('1.25', 6) }, // $1.25
		{ model: 'gpt-5', tokens: 8000, cost: parseUnits('2.00', 6) }, // $2.00
		{ model: 'gemini-2.5-pro', tokens: 3000, cost: parseUnits('0.75', 6) }, // $0.75
		{ model: 'claude-opus-4', tokens: 15000, cost: parseUnits('5.00', 6) }, // $5.00
	]

	let cumulativeAmount = 0n
	let voucherCount = 0

	for (const call of apiCalls) {
		voucherCount++
		const _previousAmount = cumulativeAmount
		cumulativeAmount += call.cost

		log.api(call.model, call.tokens, call.cost)

		// Client signs voucher
		const voucher = await clientSDK.signVoucher(ESCROW_CONTRACT, channelId, cumulativeAmount)

		// Server verifies voucher
		const result = await serverSDK.verifyVoucher(ESCROW_CONTRACT, voucher)
		if (!result.valid) throw new Error(result.error)

		const remaining = result.state.deposit - result.state.highestVoucherAmount
		log.voucher(voucherCount, cumulativeAmount, call.cost, remaining)

		// Simulate API response delay
		await new Promise((r) => setTimeout(r, 500))
	}

	log.balance('Total spent so far', cumulativeAmount)
	log.balance('Remaining in channel', initialDeposit - cumulativeAmount)
	log.phaseEnd()

	// =========================================================================
	// Phase 3: Server performs partial settlement
	// =========================================================================
	log.phase(3, 'Partial Settlement')
	log.info('Server claims accumulated payments without closing channel')

	const _stateBeforeSettle = serverSDK.getChannelState(channelId)!
	log.step(`Unsettled amount: ${formatUSD(serverSDK.getUnsettledAmount(channelId))}`)

	const settleResult = await serverSDK.settle(ESCROW_CONTRACT, channelId)
	if (!settleResult.success) throw new Error(settleResult.error)

	log.settle(settleResult.settled, settleResult.txHash)
	log.step('Channel remains open for continued use ✓')

	log.phaseEnd()

	// =========================================================================
	// Phase 4: More API calls (spending continues)
	// =========================================================================
	log.phase(4, 'Continued Usage After Settlement')
	log.info('AI agent continues making API calls')

	const moreCalls = [
		{ model: 'gpt-5-mini', tokens: 1000, cost: parseUnits('0.10', 6) },
		{ model: 'claude-haiku-3', tokens: 2000, cost: parseUnits('0.05', 6) },
		{ model: 'gpt-5', tokens: 10000, cost: parseUnits('2.50', 6) },
	]

	for (const call of moreCalls) {
		voucherCount++
		cumulativeAmount += call.cost

		log.api(call.model, call.tokens, call.cost)

		const voucher = await clientSDK.signVoucher(ESCROW_CONTRACT, channelId, cumulativeAmount)
		const result = await serverSDK.verifyVoucher(ESCROW_CONTRACT, voucher)
		if (!result.valid) throw new Error(result.error)

		const remaining = result.state.deposit - result.state.highestVoucherAmount
		log.voucher(voucherCount, cumulativeAmount, call.cost, remaining)
		await new Promise((r) => setTimeout(r, 300))
	}

	log.phaseEnd()

	// =========================================================================
	// Phase 5: Top up the channel
	// =========================================================================
	log.phase(5, 'Channel Top-Up')
	log.info('Agent adds more funds')

	const topUpAmount = parseUnits('25', 6) // $25 more

	const channelBefore = await clientSDK.getChannel(ESCROW_CONTRACT, channelId)
	log.step(`Current deposit: ${formatUSD(channelBefore.deposit)}`)
	log.step(`Adding: ${formatUSD(topUpAmount)}`)

	const topUpTxHash = await clientSDK.topUp(ESCROW_CONTRACT, channelId, topUpAmount)
	log.tx('Top-up tx', topUpTxHash)

	// Refresh server state
	await serverSDK.refreshChannelState(ESCROW_CONTRACT, channelId)
	const stateAfterTopUp = serverSDK.getChannelState(channelId)!
	log.balance('New total deposit', stateAfterTopUp.deposit)
	log.balance('Available to spend', serverSDK.getRemainingDeposit(channelId))

	log.phaseEnd()

	// =========================================================================
	// Phase 6: Heavy usage (big coding task)
	// =========================================================================
	log.phase(6, 'Heavy Usage - Complex Coding Task')
	log.info('Agent tackles a complex refactoring task with many LLM calls')

	const heavyCalls = [
		{ model: 'claude-opus-4', tokens: 50000, cost: parseUnits('15.00', 6) },
		{ model: 'gpt-5', tokens: 20000, cost: parseUnits('5.00', 6) },
		{ model: 'claude-sonnet-4', tokens: 30000, cost: parseUnits('7.50', 6) },
	]

	for (const call of heavyCalls) {
		voucherCount++
		cumulativeAmount += call.cost

		log.api(call.model, call.tokens, call.cost)

		const voucher = await clientSDK.signVoucher(ESCROW_CONTRACT, channelId, cumulativeAmount)
		const result = await serverSDK.verifyVoucher(ESCROW_CONTRACT, voucher)
		if (!result.valid) throw new Error(result.error)

		const remaining = result.state.deposit - result.state.highestVoucherAmount
		log.voucher(voucherCount, cumulativeAmount, call.cost, remaining)
		await new Promise((r) => setTimeout(r, 400))
	}

	log.phaseEnd()

	// =========================================================================
	// Phase 7: Final settlement
	// =========================================================================
	log.phase(7, 'Final Settlement')
	log.info('Server claims all remaining unsettled funds')

	const unsettled = serverSDK.getUnsettledAmount(channelId)
	log.step(`Unsettled amount: ${formatUSD(unsettled)}`)

	const finalSettle = await serverSDK.settle(ESCROW_CONTRACT, channelId)
	if (!finalSettle.success) throw new Error(finalSettle.error)

	log.settle(finalSettle.settled, finalSettle.txHash)

	log.phaseEnd()

	// =========================================================================
	// Summary
	// =========================================================================
	log.title('SESSION COMPLETE - SUMMARY')

	const finalState = serverSDK.getChannelState(channelId)!
	const finalChannel = await clientSDK.getChannel(ESCROW_CONTRACT, channelId)

	console.log(`
  ${colors.bright}Channel Statistics:${colors.reset}
  ┌────────────────────────────────────────────────────────────┐
  │ Channel ID:     ${channelId.slice(0, 22)}...          │
  │ Contract:       ${ESCROW_CONTRACT.slice(0, 22)}...          │
  ├────────────────────────────────────────────────────────────┤
  │ Total Deposit:  ${formatUSD(finalChannel.deposit).padEnd(10)} (initial + top-up)          │
  │ Total Settled:  ${formatUSD(finalChannel.settled).padEnd(10)} (claimed by server)         │
  │ Remaining:      ${formatUSD(finalChannel.deposit - finalState.highestVoucherAmount).padEnd(10)} (available for refund)     │
  ├────────────────────────────────────────────────────────────┤
  │ Vouchers Signed: ${String(voucherCount).padEnd(5)}                                    │
  │ Settlements:     2      (1 partial + 1 final)              │
  └────────────────────────────────────────────────────────────┘

  ${colors.bright}Transaction Summary:${colors.reset}
  • Open channel:     ${openTxHash.slice(0, 42)}...
  • Top-up:           ${topUpTxHash.slice(0, 42)}...
  • Partial settle:   ${settleResult.txHash.slice(0, 42)}...
  • Final settle:     ${finalSettle.txHash.slice(0, 42)}...

  ${colors.green}All transactions confirmed on Tempo Moderato testnet!${colors.reset}
  Explorer: https://explorer.moderato.tempo.xyz/address/${ESCROW_CONTRACT}
`)
}

main().catch((err) => {
	log.error(err.message)
	console.error(err)
	process.exit(1)
})
