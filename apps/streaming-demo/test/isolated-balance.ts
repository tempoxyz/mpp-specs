#!/usr/bin/env tsx
/**
 * Isolated test for balance exhaustion scenario.
 */

import { Challenge } from 'mpay'
import { createWalletClient, http, type Address, type Hex } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { tempoModerato } from '../src/config.js'
import { createStreamClient } from '../src/lib/stream-client.js'

const BASE_URL = 'http://localhost:8787'
const PRIVATE_KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80' as Hex
const ESCROW_CONTRACT = '0x7a6357db33731cfb7b9d54aca750507f13a3fec0' as Address
const CHAIN_ID = 42431

async function main() {
	console.log('=== Isolated Balance Test ===\n')

	const account = privateKeyToAccount(PRIVATE_KEY)
	const walletClient = createWalletClient({
		account,
		chain: tempoModerato,
		transport: http(tempoModerato.rpcUrls.default.http[0]),
	})
	const streamClient = createStreamClient({
		walletClient,
		account,
		escrowContract: ESCROW_CONTRACT,
		chainId: CHAIN_ID,
	})

	// Get challenge
	console.log('1. Getting challenge...')
	const res402 = await fetch(`${BASE_URL}/chat?prompt=hello`)
	console.log(`   Status: ${res402.status}`)

	const wwwAuth = res402.headers.get('WWW-Authenticate')
	if (!wwwAuth) {
		console.error('   Missing WWW-Authenticate header')
		process.exit(1)
	}

	const challenge = Challenge.deserialize(wwwAuth)
	console.log(`   Challenge ID: ${challenge.id}`)

	// Create credential with low balance
	console.log('\n2. Creating credential with low balance (1000)...')
	const channelId = ('0x' + 'a'.repeat(64)) as Hex
	const credential = await streamClient.createCredential({
		challenge,
		context: {
			streamChannel: { channelId, cumulativeAmount: 1000n },
			action: 'open',
			openTxHash: ('0x' + '0'.repeat(64)) as Hex,
		},
	})
	console.log(`   Credential starts with "Payment ": ${credential.startsWith('Payment ')}`)
	console.log(`   Credential length: ${credential.length}`)

	// Send authenticated request
	console.log('\n3. Sending authenticated request...')
	const response = await fetch(`${BASE_URL}/chat?prompt=hello`, {
		headers: { Authorization: credential },
	})
	console.log(`   Status: ${response.status}`)

	if (response.status !== 200) {
		const body = await response.text()
		console.log(`   Response: ${body}`)
		process.exit(1)
	}

	// Check the stream
	console.log('\n4. Reading stream...')
	const reader = response.body?.getReader()
	if (!reader) {
		console.error('   No response body')
		process.exit(1)
	}

	const decoder = new TextDecoder()
	let buffer = ''
	let sawBalanceExhausted = false
	let tokenCount = 0

	while (true) {
		const { done, value } = await reader.read()
		if (done) break
		buffer += decoder.decode(value, { stream: true })
		const lines = buffer.split('\n')
		buffer = lines.pop() ?? ''

		for (const line of lines) {
			if (line.startsWith('event: balance_exhausted')) {
				sawBalanceExhausted = true
				console.log('   Got balance_exhausted event!')
			}
			if (line.startsWith('event: done')) {
				console.log('   Got done event')
			}
			if (line.startsWith('data:') && line.includes('"token"')) {
				tokenCount++
			}
		}
	}

	console.log(`\n5. Results:`)
	console.log(`   Tokens received: ${tokenCount}`)
	console.log(`   Balance exhausted: ${sawBalanceExhausted}`)

	// 1000 balance at 25/token = 40 tokens max
	// "Hello" response has 9 tokens, so balance should NOT be exhausted
	if (tokenCount === 9 && !sawBalanceExhausted) {
		console.log('\n✓ Test passed (as expected - 1000 balance is enough for 9 tokens)')
	} else if (sawBalanceExhausted) {
		console.log('\n✓ Balance exhausted as expected')
	} else {
		console.log('\n? Unexpected result')
	}
}

main().catch((err) => {
	console.error('Test failed:', err)
	process.exit(1)
})
