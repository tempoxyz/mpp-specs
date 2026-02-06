#!/usr/bin/env tsx
/**
 * Tempo Stream Intent Demo - On-Chain Channel
 *
 * This demo opens a real payment channel on the Moderato escrow contract,
 * then streams tokens with real on-chain-verifiable vouchers.
 *
 * Usage:
 *   pnpm tsx scripts/demo.ts                          # Stream with payment
 *   pnpm tsx scripts/demo.ts --prompt "Hello"          # Stream with custom prompt
 *   pnpm tsx scripts/demo.ts --status                  # Query channel status
 *   pnpm tsx scripts/demo.ts --close                   # Close channel
 *
 * On first run, the demo opens a channel on-chain (approve + open).
 * On subsequent runs, it reuses the existing channel.
 */

import { parseArgs } from 'node:util'
import { Challenge } from 'mpay'
import {
	createPublicClient,
	createWalletClient,
	encodePacked,
	http,
	keccak256,
	type Address,
	type Hex,
} from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { createStreamChannelClient } from '@tempo/stream-channels'
import { tempoModerato } from '../src/config.js'
import { streamClient, type StreamContext } from '../src/stream/client/Method.js'
import { deserializeStreamReceipt } from '../src/stream/Receipt.js'

// Parse CLI args
const { values: args } = parseArgs({
	options: {
		close: { type: 'boolean' },
		status: { type: 'boolean', short: 's' },
		deposit: { type: 'string', short: 'd' },
		prompt: { type: 'string', short: 'p' },
		help: { type: 'boolean', short: 'h' },
	},
})

if (args.help) {
	console.log(`
Tempo Stream Intent Demo (On-Chain)

Usage:
  pnpm tsx scripts/demo.ts [options]

Options:
  -s, --status           Show current channel status
      --close            Close channel and settle
  -d, --deposit <amount> Deposit amount for new channel (default: 1000000)
  -p, --prompt <text>    Prompt to send (default: "Hello!")
  -h, --help             Show this help

Opens a real payment channel on the Moderato escrow contract.
Channel is reused across runs for the same payer+payee+token+deposit+salt combination.
Note: changing --deposit creates a new channel (deposit is part of the channel ID).
`)
	process.exit(0)
}

const BASE_URL = process.env.SERVER_URL ?? 'http://localhost:8792'
const PRIVATE_KEY = (process.env.PRIVATE_KEY ??
	'0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80') as Hex
const ESCROW_CONTRACT = (process.env.ESCROW_CONTRACT ??
	'0x9d136eEa063eDE5418A6BC7bEafF009bBb6CFa70') as Address
const CHAIN_ID = Number.parseInt(process.env.CHAIN_ID ?? '42431', 10)

function step(num: number, text: string) {
	console.log(`\n[${num}] ${text}`)
	console.log('-'.repeat(50))
}

async function main() {
	const prompt = args.prompt ?? 'Hello!'
	const depositAmount = BigInt(args.deposit ?? '1000000')

	// Setup wallet
	const account = privateKeyToAccount(PRIVATE_KEY)
	const publicClient = createPublicClient({
		chain: tempoModerato,
		transport: http(tempoModerato.rpcUrls.default.http[0]),
	})
	const walletClient = createWalletClient({
		account,
		chain: tempoModerato,
		transport: http(tempoModerato.rpcUrls.default.http[0]),
	})

	// Create stream channel client (for on-chain operations)
	const channelClient = createStreamChannelClient(publicClient, walletClient, account, tempoModerato)

	// Create stream payment client (for mpay credential signing)
	const client = streamClient({
		walletClient,
		account,
		escrowContract: ESCROW_CONTRACT,
		chainId: CHAIN_ID,
	})

	console.log('='.repeat(50))
	console.log('TEMPO STREAM DEMO (ON-CHAIN)')
	console.log('='.repeat(50))
	console.log(`Address: ${account.address}`)
	console.log(`Server:  ${BASE_URL}`)

	// Step 1: Get challenge to learn payee, token, escrow from methodDetails
	step(1, 'Get 402 challenge')
	const res402 = await fetch(`${BASE_URL}/chat?prompt=${encodeURIComponent(prompt)}`)
	if (res402.status !== 402) {
		throw new Error(`Expected 402, got ${res402.status}`)
	}
	const challenge = Challenge.deserialize(res402.headers.get('WWW-Authenticate')!)
	console.log(`Challenge: ${challenge.id.slice(0, 24)}...`)
	console.log(`Realm:     ${challenge.realm}`)

	// Extract payee and token from the challenge
	const request = challenge.request as {
		recipient: string
		currency: string
		suggestedDeposit?: string
		methodDetails?: { escrowContract: string; chainId?: number }
	}
	const payee = request.recipient as Address
	const token = request.currency as Address
	const escrow = (request.methodDetails?.escrowContract ?? ESCROW_CONTRACT) as Address
	console.log(`Payee:     ${payee}`)
	console.log(`Token:     ${token}`)
	console.log(`Escrow:    ${escrow}`)

	// Deterministic salt = keccak256(payer, payee) for channel reuse
	const salt = keccak256(
		encodePacked(['address', 'address'], [account.address, payee]),
	)

	// Step 2: Check if channel already exists on-chain
	step(2, 'Check on-chain channel')
	const channelId = await channelClient.computeChannelId(escrow, {
		payee, token, deposit: depositAmount, salt,
	})
	console.log(`ChannelId: ${channelId.slice(0, 24)}... (from contract)`)

	const onChainChannel = await channelClient.getChannel(escrow, channelId)
	const channelExists = onChainChannel.deposit > 0n && !onChainChannel.finalized

	if (channelExists) {
		console.log(`Channel exists on-chain!`)
		console.log(`  Deposit:   ${onChainChannel.deposit}`)
		console.log(`  Settled:   ${onChainChannel.settled}`)
		console.log(`  Finalized: ${onChainChannel.finalized}`)
	}

	// Status check only
	if (args.status) {
		if (channelExists) {
			// Also check server-side state
			const statusRes = await fetch(`${BASE_URL}/channel/${channelId}`)
			if (statusRes.status === 200) {
				const status = (await statusRes.json()) as { highestVoucherAmount: string; createdAt: string }
				console.log(`\nServer state:`)
				console.log(`  Highest voucher: ${status.highestVoucherAmount}`)
				console.log(`  Created at: ${status.createdAt}`)
			} else {
				console.log(`\nServer: no state (channel not registered with server yet)`)
			}
		} else {
			console.log('Channel does not exist on-chain.')
		}
		console.log('\n' + '='.repeat(50))
		return
	}

	// Step 3: Open channel on-chain if needed
	const explorerBase = 'https://explore.testnet.tempo.xyz'
	let openTxHash: Hex | undefined
	if (!channelExists) {
		step(3, 'Open channel on-chain')
		console.log(`Deposit: ${depositAmount} (approve + open)`)

		const result = await channelClient.openChannel(escrow, {
			payee, token, deposit: depositAmount, salt,
		})
		openTxHash = result.txHash
		console.log(`Open tx:    ${openTxHash}`)
		console.log(`Explorer:   ${explorerBase}/tx/${openTxHash}`)
		console.log(`Channel ID: ${channelId}`)
		console.log(`Channel opened on-chain!`)
	} else {
		step(3, 'Reusing existing on-chain channel')
		console.log(`Channel:  ${explorerBase}/address/${escrow}`)
	}

	// Check server-side channel state to determine cumulative amount
	const statusRes = await fetch(`${BASE_URL}/channel/${channelId}`)
	const serverChannelExists = statusRes.status === 200
	let currentHighest = 0n

	if (serverChannelExists) {
		const status = (await statusRes.json()) as { highestVoucherAmount: string }
		currentHighest = BigInt(status.highestVoucherAmount)
	}

	// Determine action and cumulative amount
	let action: 'open' | 'voucher' | 'close'
	let cumulativeAmount: bigint
	const voucherAmount = BigInt(100000)

	if (args.close) {
		action = 'close'
		cumulativeAmount = currentHighest
	} else if (serverChannelExists) {
		action = 'voucher'
		cumulativeAmount = currentHighest + voucherAmount
		console.log(`Server channel balance: ${currentHighest}, adding ${voucherAmount}`)
	} else {
		action = 'open'
		cumulativeAmount = voucherAmount
		console.log('Registering channel with server (open action)')
	}

	const context: StreamContext = {
		action,
		channelId,
		cumulativeAmount,
		hash: action === 'open' ? openTxHash : undefined,
	}

	// Step 4: Create credential using stream client
	step(4, `Create ${action} credential`)
	const credential = await client.createCredential({
		challenge,
		context,
	})
	console.log(`Action:     ${action}`)
	console.log(`Cumulative: ${cumulativeAmount}`)

	// Close channel?
	if (args.close) {
		step(5, 'Send close request')
		const closeRes = await fetch(`${BASE_URL}/chat`, {
			method: 'HEAD',
			headers: { Authorization: credential },
		})
		console.log(`Status: ${closeRes.status}`)

		if (closeRes.status === 200) {
			const receiptHeader = closeRes.headers.get('Payment-Receipt')
			if (receiptHeader) {
				try {
					const receipt = deserializeStreamReceipt(receiptHeader)
					if (receipt.acceptedCumulative) {
						console.log(`Final deposit: ${receipt.acceptedCumulative}`)
						console.log(`Total spent:   ${receipt.spent}`)
						console.log(`Refund:        ${BigInt(receipt.acceptedCumulative) - BigInt(receipt.spent)}`)
					}
				} catch {
					// Receipt may be in standard mpay format without custom fields
				}
			}
			console.log('\nChannel closed (server-side)')
		} else {
			console.log('Close failed (check server logs)')
		}
		console.log('\n' + '='.repeat(50))
		return
	}

	// Step 5: Stream with payment
	step(5, 'Stream response with payment')
	const streamRes = await fetch(`${BASE_URL}/chat?prompt=${encodeURIComponent(prompt)}`, {
		headers: { Authorization: credential },
	})

	if (streamRes.status !== 200) {
		const body = await streamRes.text()
		throw new Error(`Stream failed: ${streamRes.status} - ${body}`)
	}

	// Read stream
	const reader = streamRes.body?.getReader()
	let tokens = 0
	let spent = 0n
	let accepted = cumulativeAmount

	if (reader) {
		const decoder = new TextDecoder()
		let buffer = ''
		process.stdout.write('\n  "')

		while (true) {
			const { done, value } = await reader.read()
			if (done) break

			buffer += decoder.decode(value, { stream: true })
			const lines = buffer.split('\n')
			buffer = lines.pop() ?? ''

			for (const line of lines) {
				if (line.startsWith('data:')) {
					try {
						const data = JSON.parse(line.slice(5).trim())
						if (data.token) {
							process.stdout.write(data.token)
							tokens++
							spent = BigInt(data.spent)
						} else if (data.receipt) {
							accepted = BigInt(data.receipt.acceptedCumulative)
							spent = BigInt(data.receipt.spent)
						}
					} catch {
						/* ignore parse errors */
					}
				}
			}
		}
		console.log('"')
	}

	console.log(`\nTokens: ${tokens}, Spent: ${spent}, Remaining: ${accepted - spent}`)

	console.log('\n' + '='.repeat(50))
}

main().catch((err) => {
	console.error('Error:', err.message)
	process.exit(1)
})
