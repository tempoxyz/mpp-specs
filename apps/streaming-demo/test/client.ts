import { Challenge, Credential } from 'mpay'
import {
	createWalletClient,
	http,
	type Address,
	type Hex,
} from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { tempoModerato } from '../src/config.js'
import { createStreamClient, type StreamChannelState } from '../src/lib/stream-client.js'
import { deserializeStreamReceipt } from '../src/lib/receipt.js'

/**
 * Test client for the streaming demo server.
 *
 * This validates that:
 * 1. Server generates correct 402 challenges with stream intent
 * 2. Stream client creates valid credentials
 * 3. Server accepts vouchers and returns correct receipts
 */

const BASE_URL = process.env.SERVER_URL ?? 'http://localhost:8787'
const PRIVATE_KEY = (process.env.PRIVATE_KEY ??
	'0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80') as Hex // Default Anvil key
const ESCROW_CONTRACT = (process.env.ESCROW_CONTRACT ??
	'0x7a6357db33731cfb7b9d54aca750507f13a3fec0') as Address
const CHAIN_ID = Number.parseInt(process.env.CHAIN_ID ?? '42431', 10)

async function main() {
	console.log('=== Tempo Streaming Demo Test Client ===\n')

	// Create account from private key
	const account = privateKeyToAccount(PRIVATE_KEY)
	console.log(`Account: ${account.address}`)

	// Create viem wallet client
	const walletClient = createWalletClient({
		account,
		chain: tempoModerato,
		transport: http(tempoModerato.rpcUrls.default.http[0]),
	})

	// Create stream client
	const streamClient = createStreamClient({
		walletClient,
		account,
		escrowContract: ESCROW_CONTRACT,
		chainId: CHAIN_ID,
	})

	// Step 1: Request without auth to get 402 challenge
	console.log('\n--- Step 1: Get 402 Challenge ---')
	const response402 = await fetch(`${BASE_URL}/chat?prompt=hello`)

	if (response402.status !== 402) {
		console.error(`Expected 402, got ${response402.status}`)
		process.exit(1)
	}

	const wwwAuth = response402.headers.get('WWW-Authenticate')
	if (!wwwAuth) {
		console.error('Missing WWW-Authenticate header')
		process.exit(1)
	}

	console.log('WWW-Authenticate header received')

	// Parse challenge
	const challenge = Challenge.deserialize(wwwAuth)
	console.log(`Challenge ID: ${challenge.id}`)
	console.log(`Intent: ${challenge.intent}`)
	console.log(`Method: ${challenge.method}`)

	// Validate challenge fields
	if (challenge.intent !== 'stream') {
		console.error(`Expected intent="stream", got "${challenge.intent}"`)
		process.exit(1)
	}

	if (challenge.method !== 'tempo') {
		console.error(`Expected method="tempo", got "${challenge.method}"`)
		process.exit(1)
	}

	console.log('✓ Challenge validated')

	// Step 2: Create credential with stream client
	console.log('\n--- Step 2: Create Credential ---')

	// Simulate channel state (in real flow, this would come from on-chain)
	const channelId =
		'0x0000000000000000000000000000000000000000000000000000000000000001' as Hex
	const streamChannel: StreamChannelState = {
		channelId,
		cumulativeAmount: 50000n, // Initial voucher amount
	}

	const credential = await streamClient.createCredential({
		challenge,
		context: {
			streamChannel,
			action: 'open',
			openTxHash:
				'0x0000000000000000000000000000000000000000000000000000000000000000' as Hex,
		},
	})

	console.log(`Credential created (length: ${credential.length})`)
	console.log('✓ Credential serialized')

	// Parse and validate credential
	const parsed = Credential.deserialize(credential)
	console.log(`Payload action: ${(parsed.payload as { action: string }).action}`)
	console.log(
		`Payload cumulativeAmount: ${(parsed.payload as { cumulativeAmount: string }).cumulativeAmount}`,
	)

	// Step 3: Make authenticated request
	console.log('\n--- Step 3: Authenticated Request ---')

	const responseAuth = await fetch(`${BASE_URL}/chat?prompt=hello`, {
		headers: {
			Authorization: credential,
		},
	})

	console.log(`Status: ${responseAuth.status}`)

	if (responseAuth.status === 200) {
		// Read SSE stream
		const reader = responseAuth.body?.getReader()
		if (reader) {
			const decoder = new TextDecoder()
			let buffer = ''

			console.log('\nStreaming response:')
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
							} else if (data.receipt) {
								console.log('\n\nFinal receipt:', JSON.stringify(data.receipt, null, 2))
							} else if (data.message) {
								console.log('\n\n' + data.message)
							}
						} catch {
							// Ignore parse errors
						}
					}
				}
			}
		}

		// Check receipt header
		const receiptHeader = responseAuth.headers.get('Payment-Receipt')
		if (receiptHeader) {
			const receipt = deserializeStreamReceipt(receiptHeader)
			console.log('\nPayment-Receipt header:', JSON.stringify(receipt, null, 2))
		}

		console.log('\n✓ Authenticated request successful')
	} else {
		const body = await responseAuth.json()
		console.log('Response:', JSON.stringify(body, null, 2))
		console.error('✗ Authenticated request failed')
	}

	// Step 4: Test voucher top-up via HEAD
	console.log('\n--- Step 4: Voucher Top-Up (HEAD) ---')

	// Create new credential with higher amount
	const topUpChannel: StreamChannelState = {
		channelId,
		cumulativeAmount: 100000n, // Increased voucher amount
	}

	const topUpCredential = await streamClient.createCredential({
		challenge,
		context: {
			streamChannel: topUpChannel,
			action: 'voucher',
		},
	})

	const headResponse = await fetch(`${BASE_URL}/chat`, {
		method: 'HEAD',
		headers: {
			Authorization: topUpCredential,
		},
	})

	console.log(`HEAD Status: ${headResponse.status}`)

	const topUpReceiptHeader = headResponse.headers.get('Payment-Receipt')
	if (topUpReceiptHeader) {
		const receipt = deserializeStreamReceipt(topUpReceiptHeader)
		console.log('Top-up receipt:', JSON.stringify(receipt, null, 2))
		console.log('✓ Voucher top-up successful')
	} else {
		console.log('✗ No receipt header received')
	}

	console.log('\n=== Test Complete ===')
}

main().catch((err) => {
	console.error('Test failed:', err)
	process.exit(1)
})
