#!/usr/bin/env tsx
/**
 * Error handling test cases for the streaming demo.
 */

import { Challenge, Credential } from 'mpay'
import { createWalletClient, http, type Address, type Hex } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { tempoModerato } from '../src/config.js'
import {
	createStreamClient,
	type StreamChannelState,
} from '../src/lib/stream-client.js'

const BASE_URL = process.env.SERVER_URL ?? 'http://localhost:8787'
const PRIVATE_KEY = (process.env.PRIVATE_KEY ??
	'0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80') as Hex
const ESCROW_CONTRACT = (process.env.ESCROW_CONTRACT ??
	'0x7a6357db33731cfb7b9d54aca750507f13a3fec0') as Address
const CHAIN_ID = Number.parseInt(process.env.CHAIN_ID ?? '42431', 10)

// Different private key for wrong signer tests
const WRONG_PRIVATE_KEY =
	'0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d' as Hex

let passed = 0
let failed = 0

function test(name: string, fn: () => Promise<void>) {
	return { name, fn }
}

async function runTest(t: { name: string; fn: () => Promise<void> }) {
	process.stdout.write(`  ${t.name}... `)
	try {
		await t.fn()
		console.log('✓')
		passed++
	} catch (error) {
		console.log('✗')
		console.log(`    Error: ${error instanceof Error ? error.message : error}`)
		failed++
	}
}

function assert(condition: boolean, message: string) {
	if (!condition) throw new Error(message)
}

async function getChallenge(): Promise<Challenge.Challenge> {
	const response = await fetch(`${BASE_URL}/chat?prompt=hello`)
	assert(response.status === 402, `Expected 402, got ${response.status}`)
	const wwwAuth = response.headers.get('WWW-Authenticate')
	assert(!!wwwAuth, 'Missing WWW-Authenticate header')
	return Challenge.deserialize(wwwAuth)
}

async function main() {
	console.log('=== Error Handling Tests ===\n')

	const account = privateKeyToAccount(PRIVATE_KEY)
	const wrongAccount = privateKeyToAccount(WRONG_PRIVATE_KEY)

	const walletClient = createWalletClient({
		account,
		chain: tempoModerato,
		transport: http(tempoModerato.rpcUrls.default.http[0]),
	})

	const wrongWalletClient = createWalletClient({
		account: wrongAccount,
		chain: tempoModerato,
		transport: http(tempoModerato.rpcUrls.default.http[0]),
	})

	const streamClient = createStreamClient({
		walletClient,
		account,
		escrowContract: ESCROW_CONTRACT,
		chainId: CHAIN_ID,
	})

	const wrongSignerClient = createStreamClient({
		walletClient: wrongWalletClient,
		account: wrongAccount,
		escrowContract: ESCROW_CONTRACT,
		chainId: CHAIN_ID,
	})

	const tests = [
		// Test 1: Missing Authorization header
		test('Missing Authorization header returns 402', async () => {
			const response = await fetch(`${BASE_URL}/chat?prompt=hello`)
			assert(response.status === 402, `Expected 402, got ${response.status}`)
			const wwwAuth = response.headers.get('WWW-Authenticate')
			assert(!!wwwAuth, 'Missing WWW-Authenticate header')
		}),

		// Test 2: Invalid Authorization format
		test('Invalid Authorization format returns 402', async () => {
			const response = await fetch(`${BASE_URL}/chat?prompt=hello`, {
				headers: { Authorization: 'Bearer invalid-token' },
			})
			assert(response.status === 402, `Expected 402, got ${response.status}`)
		}),

		// Test 3: Malformed Payment credential
		test('Malformed Payment credential returns 401', async () => {
			const response = await fetch(`${BASE_URL}/chat?prompt=hello`, {
				headers: { Authorization: 'Payment garbage-data' },
			})
			assert(response.status === 401, `Expected 401, got ${response.status}`)
		}),

		// Test 4: Tampered challenge (modified realm)
		test('Tampered challenge returns 401', async () => {
			const challenge = await getChallenge()
			// Tamper with the realm
			const tamperedChallenge = { ...challenge, realm: 'evil.com' }

			const channelId = '0x0000000000000000000000000000000000000000000000000000000000000001' as Hex
			const streamChannel: StreamChannelState = {
				channelId,
				cumulativeAmount: 50000n,
			}

			// Create credential with tampered challenge
			const credential = Credential.serialize({
				challenge: tamperedChallenge,
				payload: {
					action: 'voucher',
					channelId,
					cumulativeAmount: '50000',
					sessionHash: '0x' + '0'.repeat(64),
					signature: '0x' + '0'.repeat(130),
				},
				source: `did:pkh:eip155:${CHAIN_ID}:${account.address}`,
			})

			const response = await fetch(`${BASE_URL}/chat?prompt=hello`, {
				headers: { Authorization: credential },
			})
			assert(response.status === 401, `Expected 401, got ${response.status}`)
			const body = await response.json()
			assert(body.error === 'Invalid challenge', `Expected 'Invalid challenge', got '${body.error}'`)
		}),

		// Test 5: Wrong signer on voucher after channel established
		// Note: On "open", the demo trusts the signer (since we can't verify on-chain).
		// But subsequent vouchers must be signed by the same signer.
		test('Wrong signer on subsequent voucher returns 401', async () => {
			const challenge = await getChallenge()
			const channelId = '0x0000000000000000000000000000000000000000000000000000000000000002' as Hex

			// First, open channel with correct signer
			const openCredential = await streamClient.createCredential({
				challenge,
				context: {
					streamChannel: { channelId, cumulativeAmount: 50000n },
					action: 'open',
					openTxHash: '0x0000000000000000000000000000000000000000000000000000000000000000' as Hex,
				},
			})
			const openResponse = await fetch(`${BASE_URL}/chat?prompt=hello`, {
				headers: { Authorization: openCredential },
			})
			assert(openResponse.status === 200, `Open: Expected 200, got ${openResponse.status}`)
			await openResponse.text() // consume stream

			// Now try to top up with WRONG signer
			const wrongCredential = await wrongSignerClient.createCredential({
				challenge,
				context: {
					streamChannel: { channelId, cumulativeAmount: 100000n },
					action: 'voucher',
				},
			})

			const wrongResponse = await fetch(`${BASE_URL}/chat`, {
				method: 'HEAD',
				headers: { Authorization: wrongCredential },
			})
			// Should fail - wrong signer
			assert(
				wrongResponse.status === 401 || wrongResponse.status === 400,
				`Expected 401 or 400, got ${wrongResponse.status}`,
			)
		}),

		// Test 6: Valid credential works (sanity check)
		test('Valid credential returns 200', async () => {
			const challenge = await getChallenge()
			const channelId = '0x0000000000000000000000000000000000000000000000000000000000000003' as Hex
			const streamChannel: StreamChannelState = {
				channelId,
				cumulativeAmount: 50000n,
			}

			const credential = await streamClient.createCredential({
				challenge,
				context: {
					streamChannel,
					action: 'open',
					openTxHash: '0x0000000000000000000000000000000000000000000000000000000000000000' as Hex,
				},
			})

			const response = await fetch(`${BASE_URL}/chat?prompt=hello`, {
				headers: { Authorization: credential },
			})
			assert(response.status === 200, `Expected 200, got ${response.status}`)
		}),

		// Test 7: Streaming works with minimum balance
		// Note: Balance exhaustion is tested separately in test/isolated-balance.ts
		// This just verifies streaming works with the minimum allowed balance
		test('Streaming works with minimum balance', async () => {
			// Use a unique channel ID to avoid conflicts
			const uniqueId = Date.now().toString(16).padStart(16, '0')
			const channelId = `0x${uniqueId}${'0'.repeat(48)}` as Hex

			const challenge = await getChallenge()
			const credential = await streamClient.createCredential({
				challenge,
				context: {
					streamChannel: { channelId, cumulativeAmount: 1000n },
					action: 'open',
					openTxHash: '0x0000000000000000000000000000000000000000000000000000000000000000' as Hex,
				},
			})

			const response = await fetch(`${BASE_URL}/chat?prompt=hello`, {
				headers: { Authorization: credential },
			})
			assert(response.status === 200, `Expected 200, got ${response.status}`)

			// Just consume the stream
			await response.text()
		}),

		// Test 8: Voucher with lower cumulative than previous
		test('Lower cumulative amount is rejected', async () => {
			// Use unique channel ID
			const uniqueId = (Date.now() + 1).toString(16).padStart(16, '0')
			const channelId = `0x${uniqueId}${'0'.repeat(48)}` as Hex
			const challenge = await getChallenge()

			// First, open with high amount
			const openCredential = await streamClient.createCredential({
				challenge,
				context: {
					streamChannel: { channelId, cumulativeAmount: 100000n },
					action: 'open',
					openTxHash: '0x0000000000000000000000000000000000000000000000000000000000000000' as Hex,
				},
			})

			const openResponse = await fetch(`${BASE_URL}/chat?prompt=hello`, {
				headers: { Authorization: openCredential },
			})
			assert(openResponse.status === 200, `Open: Expected 200, got ${openResponse.status}`)
			await openResponse.text()

			// Now try to top up with LOWER amount
			const lowerCredential = await streamClient.createCredential({
				challenge,
				context: {
					streamChannel: { channelId, cumulativeAmount: 50000n },
					action: 'voucher',
				},
			})

			const lowerResponse = await fetch(`${BASE_URL}/chat`, {
				method: 'HEAD',
				headers: { Authorization: lowerCredential },
			})
			// Should be rejected - cumulative can only increase
			assert(
				lowerResponse.status === 400 || lowerResponse.status === 401,
				`Expected 400 or 401, got ${lowerResponse.status}`,
			)
		}),

		// Test 9: POST endpoint works
		test('POST endpoint returns 402 without auth', async () => {
			const response = await fetch(`${BASE_URL}/chat`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ prompt: 'test' }),
			})
			assert(response.status === 402, `Expected 402, got ${response.status}`)
		}),

		// Test 10: Health endpoint
		test('Health endpoint returns 200', async () => {
			const response = await fetch(`${BASE_URL}/health`)
			assert(response.status === 200, `Expected 200, got ${response.status}`)
		}),
	]

	console.log('Running tests...\n')

	for (const t of tests) {
		await runTest(t)
	}

	console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`)

	if (failed > 0) {
		process.exit(1)
	}
}

main().catch((err) => {
	console.error('Test suite failed:', err)
	process.exit(1)
})
