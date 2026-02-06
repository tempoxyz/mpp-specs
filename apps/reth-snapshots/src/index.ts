import {
	type ChargeRequest,
	formatReceipt,
	formatWwwAuthenticate,
	generateChallengeId,
	MalformedProofError,
	type PaymentChallenge,
	type PaymentCredential,
	PaymentExpiredError,
	type PaymentReceipt,
	PaymentRequiredError,
	PaymentVerificationFailedError,
	parseAuthorization,
} from '@ai-payments/protocol'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import {
	type Address,
	createPublicClient,
	decodeFunctionData,
	type Hex,
	http,
	isAddressEqual,
	parseTransaction,
	recoverTransactionAddress,
	type TransactionSerialized,
} from 'viem'
import { tempoModerato } from 'viem/chains'
import { Abis, Transaction as TempoTransaction } from 'viem/tempo'

interface Env {
	DESTINATION_ADDRESS: string
	TEMPO_RPC_URL: string
	TEMPO_RPC_USERNAME?: string
	TEMPO_RPC_PASSWORD?: string
	FEE_TOKEN_ADDRESS: string
	PRICE_PER_GB_CENTS: string
	CHALLENGE_VALIDITY_SECONDS: string
	SNAPSHOTS: R2Bucket
}

const BYTES_PER_GB = 1024 * 1024 * 1024

function getFeeTokenAddress(env: Env): Address {
	return env.FEE_TOKEN_ADDRESS as Address
}

function getPricePerGbCents(env: Env): number {
	return Number(env.PRICE_PER_GB_CENTS ?? '1')
}

function getChallengeValidityMs(env: Env): number {
	const seconds = Number(env.CHALLENGE_VALIDITY_SECONDS ?? '600')
	return seconds * 1000
}

function calculatePrice(sizeBytes: number, env: Env): string {
	const sizeGb = Math.ceil(sizeBytes / BYTES_PER_GB)
	const pricePerGbCents = getPricePerGbCents(env)
	const totalBaseUnits = sizeGb * pricePerGbCents * 10000
	return totalBaseUnits.toString()
}

function formatSize(bytes: number): string {
	const gb = bytes / BYTES_PER_GB
	if (gb >= 1) {
		return `${gb.toFixed(2)} GB`
	}
	const mb = bytes / (1024 * 1024)
	return `${mb.toFixed(2)} MB`
}

const challengeStore = new Map<
	string,
	{ challenge: PaymentChallenge<ChargeRequest>; used: boolean; filename: string }
>()

function createChallenge(
	env: Env,
	amount: string,
	filename: string,
	description?: string,
): PaymentChallenge<ChargeRequest> {
	const destinationAddress = env.DESTINATION_ADDRESS as Address
	const expiresAt = new Date(Date.now() + getChallengeValidityMs(env))

	const request: ChargeRequest = {
		version: 1,
		amount,
		asset: getFeeTokenAddress(env),
		destination: destinationAddress,
		expires: expiresAt.toISOString(),
	}

	const challenge: PaymentChallenge<ChargeRequest> = {
		id: generateChallengeId(),
		realm: 'reth-snapshots',
		method: 'tempo',
		intent: 'charge',
		request,
		expires: expiresAt.toISOString(),
		description,
	}

	challengeStore.set(challenge.id, { challenge, used: false, filename })

	for (const [id, entry] of challengeStore) {
		if (entry.challenge.expires && new Date(entry.challenge.expires) < new Date()) {
			challengeStore.delete(id)
		}
	}

	return challenge
}

async function verifyTransaction(
	signedTx: Hex,
	challenge: ChargeRequest,
): Promise<{
	valid: boolean
	error?: string
	from?: Address
	tx?: TempoTransaction.TransactionSerializableTempo
}> {
	const tempoResult = await verifyTempoTransaction(signedTx, challenge)
	if (tempoResult.valid) {
		return tempoResult
	}

	const standardResult = await verifyStandardTransaction(signedTx, challenge)
	if (standardResult.valid) {
		return standardResult
	}

	return tempoResult.error?.includes('Failed to parse') ? standardResult : tempoResult
}

async function verifyTempoTransaction(
	signedTx: Hex,
	challenge: ChargeRequest,
): Promise<{
	valid: boolean
	error?: string
	from?: Address
	tx?: TempoTransaction.TransactionSerializableTempo
}> {
	try {
		const parsed = TempoTransaction.deserialize(signedTx)

		if (!TempoTransaction.isTempo(parsed)) {
			return { valid: false, error: 'Transaction is not a Tempo transaction' }
		}

		const tempoTx = parsed as TempoTransaction.TransactionSerializableTempo

		if (!tempoTx.calls || tempoTx.calls.length === 0) {
			return { valid: false, error: 'Transaction has no calls' }
		}

		const call = tempoTx.calls[0]
		if (!call.to) {
			return { valid: false, error: 'Transaction call missing "to" field' }
		}

		if (!isAddressEqual(call.to, challenge.asset)) {
			return {
				valid: false,
				error: `Transaction target ${call.to} does not match asset ${challenge.asset}`,
			}
		}

		if (!call.data) {
			return { valid: false, error: 'Transaction call missing data' }
		}

		try {
			const decoded = decodeFunctionData({
				abi: Abis.tip20,
				data: call.data,
			})

			if (decoded.functionName !== 'transfer') {
				return {
					valid: false,
					error: 'Transaction does not call transfer function',
				}
			}

			const [recipient, amount] = decoded.args as [Address, bigint]

			if (!isAddressEqual(recipient, challenge.destination)) {
				return {
					valid: false,
					error: `Transfer recipient ${recipient} does not match destination ${challenge.destination}`,
				}
			}

			const expectedAmount = BigInt(challenge.amount)
			if (amount !== expectedAmount) {
				return {
					valid: false,
					error: `Transfer amount ${amount} does not match expected ${expectedAmount}`,
				}
			}
		} catch (e) {
			return { valid: false, error: `Failed to decode transfer data: ${e}` }
		}

		let from: Address | undefined
		try {
			from = await recoverTransactionAddress({
				serializedTransaction: signedTx,
				serializer: TempoTransaction.serialize,
			} as Parameters<typeof recoverTransactionAddress>[0])
		} catch {
			from = (tempoTx as { from?: Address }).from
		}

		return { valid: true, from, tx: tempoTx }
	} catch (e) {
		return { valid: false, error: `Failed to parse Tempo transaction: ${e}` }
	}
}

async function verifyStandardTransaction(
	signedTx: Hex,
	challenge: ChargeRequest,
): Promise<{
	valid: boolean
	error?: string
	from?: Address
}> {
	try {
		const parsed = parseTransaction(signedTx as TransactionSerialized)

		if (!parsed.to) {
			return { valid: false, error: 'Transaction missing "to" field' }
		}

		if (!isAddressEqual(parsed.to, challenge.asset)) {
			return {
				valid: false,
				error: `Transaction target ${parsed.to} does not match asset ${challenge.asset}`,
			}
		}

		if (!parsed.data) {
			return { valid: false, error: 'Transaction missing data' }
		}

		try {
			const decoded = decodeFunctionData({
				abi: Abis.tip20,
				data: parsed.data,
			})

			if (decoded.functionName !== 'transfer') {
				return {
					valid: false,
					error: 'Transaction does not call transfer function',
				}
			}

			const [recipient, amount] = decoded.args as [Address, bigint]

			if (!isAddressEqual(recipient, challenge.destination)) {
				return {
					valid: false,
					error: `Transfer recipient ${recipient} does not match destination ${challenge.destination}`,
				}
			}

			const expectedAmount = BigInt(challenge.amount)
			if (amount !== expectedAmount) {
				return {
					valid: false,
					error: `Transfer amount ${amount} does not match expected ${expectedAmount}`,
				}
			}
		} catch (e) {
			return { valid: false, error: `Failed to decode transfer data: ${e}` }
		}

		let from: Address | undefined
		try {
			from = await recoverTransactionAddress({
				serializedTransaction: signedTx as TransactionSerialized,
			})
		} catch {}

		return { valid: true, from }
	} catch (e) {
		return { valid: false, error: `Failed to parse transaction: ${e}` }
	}
}

async function broadcastTransaction(
	signedTx: Hex,
	env: Env,
): Promise<{ success: true; transactionHash: Hex } | { success: false; error: string }> {
	try {
		let rpcUrl = env.TEMPO_RPC_URL
		if (env.TEMPO_RPC_USERNAME && env.TEMPO_RPC_PASSWORD) {
			const url = new URL(rpcUrl)
			url.username = env.TEMPO_RPC_USERNAME
			url.password = env.TEMPO_RPC_PASSWORD
			rpcUrl = url.toString()
		}

		const response = await fetch(rpcUrl, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				jsonrpc: '2.0',
				id: 1,
				method: 'eth_sendRawTransaction',
				params: [signedTx],
			}),
		})

		const data = (await response.json()) as {
			result?: { transactionHash: Hex } | Hex
			error?: { code: number; message: string; data?: unknown }
		}

		if (data.error) {
			return {
				success: false,
				error: `RPC Error (${data.error.code}): ${
					data.error.message || 'Transaction broadcast failed'
				}`,
			}
		}

		const transactionHash =
			typeof data.result === 'object' && data.result !== null
				? data.result.transactionHash
				: data.result

		if (!transactionHash) {
			return {
				success: false,
				error: 'No transaction hash returned from RPC',
			}
		}

		return { success: true, transactionHash }
	} catch (error) {
		return {
			success: false,
			error: `Failed to broadcast transaction: ${
				error instanceof Error ? error.message : 'Unknown error'
			}`,
		}
	}
}

async function getTransactionReceipt(
	txHash: Hex,
	env: Env,
): Promise<{ blockNumber: bigint | null; status: 'success' | 'reverted' | null }> {
	try {
		let rpcUrl = env.TEMPO_RPC_URL
		if (env.TEMPO_RPC_USERNAME && env.TEMPO_RPC_PASSWORD) {
			const url = new URL(rpcUrl)
			url.username = env.TEMPO_RPC_USERNAME
			url.password = env.TEMPO_RPC_PASSWORD
			rpcUrl = url.toString()
		}

		const client = createPublicClient({
			chain: tempoModerato,
			transport: http(rpcUrl),
		})

		const receipt = await client.waitForTransactionReceipt({
			hash: txHash,
			timeout: 30_000,
		})

		return { blockNumber: receipt.blockNumber, status: receipt.status }
	} catch {
		return { blockNumber: null, status: null }
	}
}

const app = new Hono<{ Bindings: Env }>()

app.use('*', cors())

app.use('*', async (c, next) => {
	const start = Date.now()
	console.log(`→ ${c.req.method} ${c.req.path}`)
	await next()
	const ms = Date.now() - start
	console.log(`← ${c.req.method} ${c.req.path} ${c.res.status} (${ms}ms)`)
})

app.get('/health', (c) => c.json({ status: 'ok' }))

app.get('/snapshots', async (c) => {
	try {
		const listed = await c.env.SNAPSHOTS.list()
		const pricePerGbCents = getPricePerGbCents(c.env)

		const snapshots = listed.objects.map((obj) => {
			const sizeGb = obj.size / BYTES_PER_GB
			const priceBaseUnits = calculatePrice(obj.size, c.env)
			const priceUsd = Number(priceBaseUnits) / 1_000_000

			return {
				filename: obj.key,
				size: formatSize(obj.size),
				sizeBytes: obj.size,
				sizeGb: sizeGb.toFixed(2),
				priceUsd: `$${priceUsd.toFixed(2)}`,
				priceBaseUnits,
				uploaded: obj.uploaded.toISOString(),
			}
		})

		return c.json({
			snapshots,
			pricing: {
				perGbCents: pricePerGbCents,
				perGbUsd: `$${(pricePerGbCents / 100).toFixed(2)}`,
				token: getFeeTokenAddress(c.env),
			},
		})
	} catch (error) {
		console.error('Failed to list snapshots:', error)
		return c.json({ error: 'Failed to list snapshots' }, 500)
	}
})

app.get('/snapshots/:filename', async (c) => {
	const filename = c.req.param('filename')

	const object = await c.env.SNAPSHOTS.head(filename)
	if (!object) {
		return c.json({ error: 'Snapshot not found' }, 404)
	}

	const price = calculatePrice(object.size, c.env)
	const priceUsd = Number(price) / 1_000_000
	const authHeader = c.req.header('Authorization')

	if (!authHeader || !authHeader.startsWith('Payment ')) {
		const description = `Download ${filename} (${formatSize(object.size)}) for $${priceUsd.toFixed(2)}`
		const challenge = createChallenge(c.env, price, filename, description)

		c.header('WWW-Authenticate', formatWwwAuthenticate(challenge))
		c.header('Cache-Control', 'no-store')

		return c.json(
			new PaymentRequiredError(
				`Payment of $${priceUsd.toFixed(2)} required to download ${filename}`,
			).toJSON(),
			402,
		)
	}

	let credential: PaymentCredential
	try {
		credential = parseAuthorization(authHeader)
	} catch {
		return c.json(new MalformedProofError('Invalid Authorization header format').toJSON(), 400)
	}

	const storedChallenge = challengeStore.get(credential.id)
	if (!storedChallenge) {
		const challenge = createChallenge(
			c.env,
			price,
			filename,
			`Download ${filename} (${formatSize(object.size)}) for $${priceUsd.toFixed(2)}`,
		)
		c.header('WWW-Authenticate', formatWwwAuthenticate(challenge))
		return c.json(
			new PaymentVerificationFailedError('Unknown or expired challenge ID').toJSON(),
			401,
		)
	}

	if (storedChallenge.filename !== filename) {
		return c.json(
			new PaymentVerificationFailedError('Challenge was issued for a different file').toJSON(),
			400,
		)
	}

	if (storedChallenge.used) {
		const challenge = createChallenge(
			c.env,
			price,
			filename,
			`Download ${filename} (${formatSize(object.size)}) for $${priceUsd.toFixed(2)}`,
		)
		c.header('WWW-Authenticate', formatWwwAuthenticate(challenge))
		return c.json(
			new PaymentVerificationFailedError('Challenge has already been used').toJSON(),
			401,
		)
	}

	if (
		storedChallenge.challenge.expires &&
		new Date(storedChallenge.challenge.expires) < new Date()
	) {
		challengeStore.delete(credential.id)
		const challenge = createChallenge(
			c.env,
			price,
			filename,
			`Download ${filename} (${formatSize(object.size)}) for $${priceUsd.toFixed(2)}`,
		)
		c.header('WWW-Authenticate', formatWwwAuthenticate(challenge))
		return c.json(new PaymentExpiredError('Challenge has expired').toJSON(), 402)
	}

	if (
		!credential.payload ||
		!['transaction', 'keyAuthorization'].includes(credential.payload.type)
	) {
		return c.json(new MalformedProofError('Invalid payload type').toJSON(), 400)
	}

	const signedTx = credential.payload.signature as Hex
	const timestamp = new Date().toISOString()

	const verification = await verifyTransaction(signedTx, storedChallenge.challenge.request)
	if (!verification.valid) {
		return c.json(
			new PaymentVerificationFailedError(
				verification.error || 'Transaction verification failed',
			).toJSON(),
			400,
		)
	}

	storedChallenge.used = true

	const broadcastResult = await broadcastTransaction(signedTx, c.env)

	if (!broadcastResult.success) {
		storedChallenge.used = false
		return c.json(
			new PaymentVerificationFailedError(`Broadcast failed: ${broadcastResult.error}`).toJSON(),
			500,
		)
	}

	const txHash = broadcastResult.transactionHash
	const receiptData = await getTransactionReceipt(txHash, c.env)
	if (receiptData.status === 'reverted') {
		return c.json(
			{
				...new PaymentVerificationFailedError(`Transaction reverted`).toJSON(),
				hash: txHash,
			},
			500,
		)
	}

	const blockNumber = receiptData.blockNumber

	const receipt: PaymentReceipt & { blockNumber?: string } = {
		status: 'success',
		method: 'tempo',
		timestamp,
		reference: txHash,
	}

	if (blockNumber !== null) {
		receipt.blockNumber = blockNumber.toString()
	}

	c.header('Payment-Receipt', formatReceipt(receipt))

	const fullObject = await c.env.SNAPSHOTS.get(filename)
	if (!fullObject) {
		return c.json({ error: 'Snapshot not found during download' }, 500)
	}

	c.header('Content-Type', 'application/octet-stream')
	c.header('Content-Length', fullObject.size.toString())
	c.header('Content-Disposition', `attachment; filename="${filename}"`)
	c.header('X-Payment-TxHash', txHash)
	if (blockNumber !== null) {
		c.header('X-Payment-BlockNumber', blockNumber.toString())
	}

	return c.body(fullObject.body)
})

export default app
