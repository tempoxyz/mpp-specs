#!/usr/bin/env tsx
/**
 * Tempo Stream Intent Demo - Stateless Client
 *
 * This demo uses the mpay Fetch.from() pattern with deterministic
 * channelId derivation, eliminating the need for client-side persistence.
 *
 * Usage:
 *   pnpm tsx scripts/demo.ts              # Stream with payment
 *   pnpm tsx scripts/demo.ts --close      # Close channel
 *   pnpm tsx scripts/demo.ts --status     # Query channel status
 *
 * The channelId is derived from keccak256(payerAddress, serverRealm),
 * so the same payer + same server always gets the same channel.
 */

import { parseArgs } from 'node:util'
import { Challenge } from 'mpay'
import { createWalletClient, http, type Address, type Hex } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { tempoModerato } from '../src/config.js'
import { streamClient, type StreamContext } from '../src/lib/stream-client.js'
import { deserializeStreamReceipt } from '../src/lib/receipt.js'
import { deriveChannelId } from '../src/lib/voucher.js'

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
Tempo Stream Intent Demo (Stateless)

Usage:
  pnpm tsx scripts/demo.ts [options]

Options:
  -s, --status           Show current channel status
      --close            Close channel and settle
  -d, --deposit <amount> Voucher amount (default: 100000)
  -p, --prompt <text>    Prompt to send (default: "Hello!")
  -h, --help             Show this help

Channel ID is derived deterministically from your address + server realm.
No local state file needed!
`)
	process.exit(0)
}

const BASE_URL = process.env.SERVER_URL ?? 'http://localhost:8787'
const PRIVATE_KEY = (process.env.PRIVATE_KEY ??
	'0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80') as Hex
const ESCROW_CONTRACT = (process.env.ESCROW_CONTRACT ??
	'0x7a6357db33731cfb7b9d54aca750507f13a3fec0') as Address
const CHAIN_ID = Number.parseInt(process.env.CHAIN_ID ?? '42431', 10)

function step(num: number, text: string) {
	console.log(`\n[${num}] ${text}`)
	console.log('-'.repeat(50))
}

async function main() {
	const prompt = args.prompt ?? 'Hello!'
	const voucherAmount = BigInt(args.deposit ?? '100000')

	// Setup wallet
	const account = privateKeyToAccount(PRIVATE_KEY)
	const walletClient = createWalletClient({
		account,
		chain: tempoModerato,
		transport: http(tempoModerato.rpcUrls.default.http[0]),
	})

	// Create stream client using Method.toClient() pattern
	const client = streamClient({
		walletClient,
		account,
		escrowContract: ESCROW_CONTRACT,
		chainId: CHAIN_ID,
	})

	console.log('═'.repeat(50))
	console.log('TEMPO STREAM DEMO (STATELESS)')
	console.log('═'.repeat(50))
	console.log(`Address: ${account.address}`)
	console.log(`Server:  ${BASE_URL}`)

	// Step 1: Get challenge to determine realm
	step(1, 'Get 402 challenge')
	const res402 = await fetch(`${BASE_URL}/chat?prompt=${encodeURIComponent(prompt)}`)
	if (res402.status !== 402) {
		throw new Error(`Expected 402, got ${res402.status}`)
	}
	const challenge = Challenge.deserialize(res402.headers.get('WWW-Authenticate')!)
	console.log(`Challenge: ${challenge.id.slice(0, 24)}...`)
	console.log(`Realm:     ${challenge.realm}`)

	// Derive channelId deterministically - NO PERSISTENCE NEEDED
	const channelId = deriveChannelId(account.address, challenge.realm)
	console.log(`ChannelId: ${channelId.slice(0, 24)}... (derived)`)

	// Status check only
	// Step 2: Check if channel exists
	step(2, 'Check channel status')
	const statusRes = await fetch(`${BASE_URL}/channel/${channelId}`)
	const channelExists = statusRes.status === 200
	let currentHighest = 0n

	if (channelExists) {
		const status = (await statusRes.json()) as { highestVoucherAmount: string; createdAt: string }
		currentHighest = BigInt(status.highestVoucherAmount)

		if (args.status) {
			console.log(`Channel exists!`)
			console.log(`  Highest voucher: ${status.highestVoucherAmount}`)
			console.log(`  Created at: ${status.createdAt}`)
			console.log('\n' + '═'.repeat(50))
			return
		}
	} else if (args.status) {
		console.log('Channel does not exist yet.')
		console.log('\n' + '═'.repeat(50))
		return
	}

	// Determine action based on channel existence
	let action: 'open' | 'voucher' | 'close'
	let cumulativeAmount: bigint

	if (args.close) {
		action = 'close'
		cumulativeAmount = currentHighest // Use current highest for close
	} else if (channelExists) {
		action = 'voucher'
		cumulativeAmount = currentHighest + voucherAmount // Add to existing balance
		console.log(`Channel exists (balance: ${currentHighest}), topping up by ${voucherAmount}`)
	} else {
		action = 'open'
		cumulativeAmount = voucherAmount
		console.log('Channel does not exist, opening new channel')
	}

	const context: StreamContext = {
		action,
		cumulativeAmount,
		openTxHash: action === 'open'
			? '0x0000000000000000000000000000000000000000000000000000000000000001'
			: undefined,
	}

	// Step 3: Create credential using stream client
	step(3, `Create ${action} credential`)
	const credential = await client.createCredential({
		challenge,
		context,
	})
	console.log(`Action:     ${action}`)
	console.log(`Cumulative: ${cumulativeAmount}`)

	// Close channel?
	if (args.close) {
		step(4, 'Send close request')
		const closeRes = await fetch(`${BASE_URL}/chat`, {
			method: 'HEAD',
			headers: { Authorization: credential },
		})
		console.log(`Status: ${closeRes.status}`)

		const receiptHeader = closeRes.headers.get('Payment-Receipt')
		if (closeRes.status === 200 && receiptHeader) {
			const receipt = deserializeStreamReceipt(receiptHeader)
			console.log(`Final deposit: ${receipt.acceptedCumulative}`)
			console.log(`Total spent:   ${receipt.spent}`)
			console.log(`Refund:        ${BigInt(receipt.acceptedCumulative) - BigInt(receipt.spent)}`)
			console.log('\n✓ Channel closed')
		} else {
			console.log('Close failed (check server logs)')
		}
		console.log('\n' + '═'.repeat(50))
		return
	}

	// Step 4: Stream with payment
	step(4, 'Stream response with payment')
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
	let accepted = voucherAmount

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

	console.log('\n' + '═'.repeat(50))
}

main().catch((err) => {
	console.error('Error:', err.message)
	process.exit(1)
})
