#!/usr/bin/env npx tsx

/**
 * Payment Auth Client - TypeScript HTTP client with 402 payment handling
 *
 * Usage:
 *   PRIVATE_KEY=0x... npx tsx demo.ts <method> <url>
 *   PRIVATE_KEY=0x... npx tsx demo.ts GET http://localhost:3001/ping/paid
 *
 * Environment:
 *   PRIVATE_KEY       - Required for signing payments (hex string with 0x prefix)
 *   TEMPO_RPC_URL     - Tempo RPC endpoint (default: https://rpc.moderato.tempo.xyz)
 *   BASE_RPC_URL      - Base Sepolia RPC endpoint (default: https://sepolia.base.org)
 *   VERBOSE           - Set to 1 for debug output
 */

import {
	type ChargeRequest,
	formatAuthorization,
	type PaymentChallenge,
	type PaymentCredential,
	parseReceipt,
	parseWwwAuthenticate,
} from '@tempo/paymentauth-protocol'
import { createClient, encodeFunctionData, type Hex, http, parseAbi } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { prepareTransactionRequest, signTransaction } from 'viem/actions'
import { baseSepolia, tempoModerato } from 'viem/chains'

// Configuration
const config = {
	privateKey: process.env.PRIVATE_KEY as Hex | undefined,
	tempoRpcUrl: process.env.TEMPO_RPC_URL ?? 'https://rpc.moderato.tempo.xyz',
	baseRpcUrl: process.env.BASE_RPC_URL ?? 'https://sepolia.base.org',
	verbose: false, // Will be set from CLI args
}

// Logging utilities
const colors = {
	red: '\x1b[0;31m',
	green: '\x1b[0;32m',
	blue: '\x1b[0;34m',
	yellow: '\x1b[0;33m',
	dim: '\x1b[2m',
	reset: '\x1b[0m',
}

const debug = (msg: string) => {
	if (config.verbose) console.error(`${colors.dim}[debug]${colors.reset} ${msg}`)
}
const info = (msg: string) => console.error(`${colors.blue}▶${colors.reset} ${msg}`)
const success = (msg: string) => console.error(`${colors.green}${colors.reset} ${msg}`)
const warn = (msg: string) => console.error(`${colors.yellow}${colors.reset} ${msg}`)
const error = (msg: string): never => {
	console.error(`${colors.red}${colors.reset} ${msg}`)
	process.exit(1)
}

function usage(): never {
	console.error(`Payment Auth Client

Usage:
  PRIVATE_KEY=0x... npx tsx demo.ts <method> <url> [--verbose] [-d <data>] [-H <header>]

Options:
  --verbose         Show debug output and progress messages
  -d, --data        Request body data (for POST/PUT/PATCH)
  -H, --header      Additional HTTP header (can be used multiple times)

Environment:
  PRIVATE_KEY       Required for paid endpoints (0x-prefixed hex)
  TEMPO_RPC_URL     Tempo RPC endpoint (default: https://rpc.moderato.tempo.xyz)
  BASE_RPC_URL      Base Sepolia RPC endpoint (default: https://sepolia.base.org)

Examples:
  npx tsx demo.ts GET http://localhost:3001/ping
  PRIVATE_KEY=0x... npx tsx demo.ts GET http://localhost:3001/ping/paid
  PRIVATE_KEY=0x... npx tsx demo.ts POST http://localhost:8787/browserbase/v1/sessions \\
    -d '{"projectId": "your-project-id"}'
  PRIVATE_KEY=0x... npx tsx demo.ts GET http://localhost:8787/browserbase/v1/sessions \\
    -H "X-BB-API-Key: YOUR_KEY"
`)
	process.exit(1)
}

/**
 * Create and sign a Tempo transaction for payment.
 */
async function signTempoPayment(request: ChargeRequest): Promise<Hex> {
	const privateKey = config.privateKey
	if (!privateKey) throw error('PRIVATE_KEY required for paid endpoints')

	const account = privateKeyToAccount(privateKey)
	const { amount, asset, destination } = request

	// Encode transfer call
	const transferData = encodeFunctionData({
		abi: parseAbi(['function transfer(address to, uint256 amount)']),
		functionName: 'transfer',
		args: [destination, BigInt(amount)],
	})

	// Create client with Tempo chain config
	const chain = tempoModerato.extend({ feeToken: asset })
	const client = createClient({
		chain,
		transport: http(config.tempoRpcUrl),
	})

	// Prepare transaction to get the correct nonce
	const prepared = await prepareTransactionRequest(client, {
		type: 'tempo',
		account,
		calls: [{ to: asset, data: transferData }],
		feeToken: asset,
		maxPriorityFeePerGas: 1_000_000_000n, // 1 gwei
		maxFeePerGas: 10_000_000_000n, // 10 gwei
		gas: 100_000n,
	})

	// Sign the prepared transaction
	const signedTx = await signTransaction(client, {
		...prepared,
		account,
	})

	debug(`Signed Tempo TX: ${signedTx.slice(0, 50)}...${signedTx.slice(-30)}`)
	return signedTx
}

/**
 * Create and sign a Base (EIP-1559) transaction for payment.
 */
async function signBasePayment(request: ChargeRequest): Promise<Hex> {
	const privateKey = config.privateKey
	if (!privateKey) throw error('PRIVATE_KEY required for paid endpoints')

	const account = privateKeyToAccount(privateKey)
	const { amount, asset, destination } = request

	// Encode transfer call
	const transferData = encodeFunctionData({
		abi: parseAbi(['function transfer(address to, uint256 amount)']),
		functionName: 'transfer',
		args: [destination, BigInt(amount)],
	})

	// Create client with Base Sepolia chain config
	const client = createClient({
		chain: baseSepolia,
		transport: http(config.baseRpcUrl),
	})

	// Prepare transaction to get the correct nonce and gas estimates
	const prepared = await prepareTransactionRequest(client, {
		type: 'eip1559',
		account,
		to: asset,
		data: transferData,
		gas: 100_000n,
	})

	// Sign the prepared transaction
	const signedTx = await signTransaction(client, {
		...prepared,
		account,
	})

	debug(`Signed Base TX: ${signedTx.slice(0, 50)}...${signedTx.slice(-30)}`)
	return signedTx
}

/**
 * Sign a payment based on the method specified in the challenge.
 */
async function signPayment(
	challenge: PaymentChallenge<ChargeRequest>,
): Promise<{ signedTx: Hex; chainId: number }> {
	const method = challenge.method

	if (method === 'tempo') {
		info('Detected Tempo payment method')
		const signedTx = await signTempoPayment(challenge.request)
		return { signedTx, chainId: tempoModerato.id }
	} else if (method === 'base') {
		info('Detected Base Sepolia payment method')
		const signedTx = await signBasePayment(challenge.request)
		return { signedTx, chainId: baseSepolia.id }
	} else {
		throw error(`Unsupported payment method: ${method}`)
	}
}

async function main() {
	const args = process.argv.slice(2)
	if (args.length < 2) usage()

	// Parse flags
	const verboseIndex = args.indexOf('--verbose')
	if (verboseIndex !== -1) {
		config.verbose = true
		args.splice(verboseIndex, 1)
	}

	// Parse headers (-H or --header)
	const headers: Record<string, string> = {}
	let i = 2 // Start after method and URL
	while (i < args.length) {
		if ((args[i] === '-H' || args[i] === '--header') && i + 1 < args.length) {
			const header = args[i + 1]
			const [key, ...valueParts] = header.split(':')
			if (valueParts.length > 0) {
				headers[key.trim()] = valueParts.join(':').trim()
			}
			args.splice(i, 2)
		} else {
			i++
		}
	}

	// Parse data (-d or --data)
	let body: string | undefined
	i = 2
	while (i < args.length) {
		if ((args[i] === '-d' || args[i] === '--data') && i + 1 < args.length) {
			body = args[i + 1]
			args.splice(i, 2)
		} else {
			i++
		}
	}

	if (args.length < 2) usage()

	const method = args[0].toUpperCase()
	const url = args[1]

	const validMethods = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS']
	if (!validMethods.includes(method)) error(`Invalid method: ${method}`)

	// Set Content-Type for body if not already set
	if (body && !headers['Content-Type'] && !headers['content-type']) {
		headers['Content-Type'] = 'application/json'
	}

	debug(`Method: ${method}, URL: ${url}`)
	if (body) debug(`Body: ${body.slice(0, 100)}${body.length > 100 ? '...' : ''}`)

	// Initial request
	const response = await fetch(url, {
		method,
		headers,
		body,
	})
	debug(`Initial status: ${response.status}`)

	// If not 402, output response (opaque result)
	if (response.status !== 402) {
		const text = await response.text()
		try {
			const json = JSON.parse(text)
			console.log(config.verbose ? JSON.stringify(json, null, 2) : JSON.stringify(json))
		} catch {
			console.log(text)
		}
		process.exit(0)
	}

	info('Received 402 Payment Required')

	const privateKey = config.privateKey
	if (!privateKey) throw error('PRIVATE_KEY required. Set PRIVATE_KEY=0x... environment variable.')

	const account = privateKeyToAccount(privateKey)
	const walletAddress = account.address
	debug(`Wallet: ${walletAddress}`)

	// Parse challenge
	const wwwAuth = response.headers.get('www-authenticate')
	if (!wwwAuth) throw error('Missing WWW-Authenticate header in 402 response')

	const challenge = parseWwwAuthenticate<ChargeRequest>(wwwAuth)
	debug(`Challenge ID: ${challenge.id}`)
	debug(`Payment method: ${challenge.method}`)
	debug(`Request: ${JSON.stringify(challenge.request)}`)

	const { amount, asset } = challenge.request
	const amountFormatted = (Number(amount) / 1_000_000).toFixed(6)
	info(`Payment: ${amountFormatted} USD to ${asset.slice(0, 10)}...${asset.slice(-6)}`)

	// Sign payment based on method
	info(`Creating signed ${challenge.method.toUpperCase()} transaction...`)
	const { signedTx, chainId } = await signPayment(challenge)

	// Build credential
	const credential: PaymentCredential = {
		id: challenge.id,
		source: `did:pkh:eip155:${chainId}:${walletAddress}`,
		payload: {
			type: 'transaction',
			signature: signedTx,
		},
	}

	const authHeader = formatAuthorization(credential)
	debug(`Auth header length: ${authHeader.length}`)

	// Retry with authorization
	info('Submitting payment to server...')
	const paidResponse = await fetch(url, {
		method,
		headers: {
			...headers,
			Authorization: authHeader,
		},
		body,
	})

	debug(`Paid status: ${paidResponse.status}`)

	if (paidResponse.status === 200) {
		success('Payment accepted!')

		const receiptHeader = paidResponse.headers.get('payment-receipt')
		if (receiptHeader) {
			try {
				const receipt = parseReceipt(receiptHeader)
				info(`TX Hash: ${receipt.reference}`)
			} catch {
				// Ignore parse errors
			}
		}
		if (config.verbose) console.log()
	} else {
		warn(`Payment request returned status ${paidResponse.status}`)
	}

	// Output opaque result (final response body)
	const text = await paidResponse.text()
	try {
		const json = JSON.parse(text)
		console.log(config.verbose ? JSON.stringify(json, null, 2) : JSON.stringify(json))
	} catch {
		console.log(text)
	}
}

main().catch((err) => {
	error(err.message || String(err))
})
