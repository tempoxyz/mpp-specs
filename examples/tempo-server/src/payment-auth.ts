import type { Context, MiddlewareHandler } from 'hono'
import * as Hex from 'ox/Hex'
import { TxEnvelopeTempo } from 'ox/tempo'
import { createPublicClient, http, type Hex as ViemHex, decodeFunctionData } from 'viem'
import { tempoModerato } from 'viem/chains'

const TEMPO_CHAIN_ID = 42431

const TIP20_TRANSFER_ABI = [
	{
		name: 'transfer',
		type: 'function',
		stateMutability: 'nonpayable',
		inputs: [
			{ type: 'address', name: 'to' },
			{ type: 'uint256', name: 'amount' },
		],
		outputs: [{ type: 'bool' }],
	},
] as const

export interface PaymentRequest {
	amount: string
	asset: string
	destination: string
	expires: string
	feePayer?: boolean
}

export interface PaymentCredential {
	id: string
	source?: string
	payload: {
		type: 'transaction' | 'keyAuthorization'
		signature: string
	}
}

export interface PaymentReceipt {
	status: 'success' | 'failed'
	method: string
	timestamp: string
	reference: string
	txHash?: string
	blockNumber?: number
	amount?: string
}

export interface ChallengeStore {
	request: PaymentRequest
	expires: Date
	used: boolean
}

export interface PaymentAuthConfig {
	realm: string
	destination: string
	asset: string
	amount: string
	challengeTtlMs?: number
	rpcUrl: string
}

declare module 'hono' {
	interface ContextVariableMap {
		paymentAuth: { signer: string; txHash?: string }
	}
}

const challenges = new Map<string, ChallengeStore>()

function base64urlEncode(data: string): string {
	const bytes = new TextEncoder().encode(data)
	let binary = ''
	for (const byte of bytes) {
		binary += String.fromCharCode(byte)
	}
	return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

function base64urlDecode(data: string): string {
	const padded = data + '==='.slice(0, (4 - (data.length % 4)) % 4)
	const base64 = padded.replace(/-/g, '+').replace(/_/g, '/')
	const binary = atob(base64)
	const bytes = new Uint8Array(binary.length)
	for (let i = 0; i < binary.length; i++) {
		bytes[i] = binary.charCodeAt(i)
	}
	return new TextDecoder().decode(bytes)
}

function generateChallengeId(): string {
	const bytes = crypto.getRandomValues(new Uint8Array(16))
	let binary = ''
	for (const byte of bytes) {
		binary += String.fromCharCode(byte)
	}
	return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

function buildWwwAuthenticateHeader(
	id: string,
	config: PaymentAuthConfig,
	request: PaymentRequest,
	expires: Date
): string {
	const requestEncoded = base64urlEncode(JSON.stringify(request))
	return (
		`Payment id="${id}", ` +
		`realm="${config.realm}", ` +
		`method="tempo", ` +
		`intent="charge", ` +
		`expires="${expires.toISOString()}", ` +
		`request="${requestEncoded}"`
	)
}

function parseCredential(authHeader: string): PaymentCredential | null {
	if (!authHeader.startsWith('Payment ')) {
		return null
	}
	try {
		const b64token = authHeader.slice(8)
		const decoded = base64urlDecode(b64token)
		return JSON.parse(decoded) as PaymentCredential
	} catch {
		return null
	}
}

interface TempoTransaction {
	type: 'tempo'
	chainId: number
	calls: readonly {
		to?: string
		value?: bigint
		data?: string
	}[]
	nonce?: number
	nonceKey?: bigint
	maxFeePerGas?: bigint
	maxPriorityFeePerGas?: bigint
	gas?: bigint
	feeToken?: string
	validBefore?: number
	validAfter?: number
	accessList?: readonly { address: string; storageKeys: readonly string[] }[]
	authorizationList?: unknown[]
	keyAuthorization?: unknown
	signature?: unknown
	feePayerSignature?: unknown
	from?: string
}

function deserializeTempoTransaction(serialized: ViemHex): TempoTransaction | null {
	try {
		if (!serialized.startsWith('0x76')) {
			return null
		}

		const tx = TxEnvelopeTempo.deserialize(serialized as `0x76${string}`)
		return {
			type: 'tempo',
			chainId: Number(tx.chainId),
			calls: tx.calls ?? [],
			nonce: tx.nonce !== undefined ? Number(tx.nonce) : undefined,
			nonceKey: tx.nonceKey,
			maxFeePerGas: tx.maxFeePerGas,
			maxPriorityFeePerGas: tx.maxPriorityFeePerGas,
			gas: tx.gas,
			feeToken: typeof tx.feeToken === 'string' ? tx.feeToken : tx.feeToken?.toString(),
			validBefore: tx.validBefore,
			validAfter: tx.validAfter,
			accessList: tx.accessList,
			authorizationList: tx.authorizationList ? [...tx.authorizationList] : undefined,
			keyAuthorization: tx.keyAuthorization,
			signature: tx.signature,
			feePayerSignature: tx.feePayerSignature,
			from: undefined,
		}
	} catch (e) {
		console.error('Failed to deserialize Tempo transaction:', e)
		return null
	}
}

function verifyTransactionMatchesRequest(
	tx: TempoTransaction,
	request: PaymentRequest
): { valid: boolean; error?: string } {
	if (tx.chainId !== TEMPO_CHAIN_ID) {
		return { valid: false, error: `Invalid chain ID: expected ${TEMPO_CHAIN_ID}, got ${tx.chainId}` }
	}

	if (!tx.calls || tx.calls.length === 0) {
		return { valid: false, error: 'Transaction has no calls' }
	}

	const call = tx.calls[0]
	if (!call.to || call.to.toLowerCase() !== request.asset.toLowerCase()) {
		return { valid: false, error: `Wrong asset: expected ${request.asset}, got ${call.to}` }
	}

	if (!call.data) {
		return { valid: false, error: 'Call has no data' }
	}

	try {
		const decoded = decodeFunctionData({
			abi: TIP20_TRANSFER_ABI,
			data: call.data as ViemHex,
		})

		if (decoded.functionName !== 'transfer') {
			return { valid: false, error: `Wrong function: expected transfer, got ${decoded.functionName}` }
		}

		const [to, amount] = decoded.args
		if (to.toLowerCase() !== request.destination.toLowerCase()) {
			return { valid: false, error: `Wrong destination: expected ${request.destination}, got ${to}` }
		}

		if (amount.toString() !== request.amount) {
			return { valid: false, error: `Wrong amount: expected ${request.amount}, got ${amount.toString()}` }
		}

		return { valid: true }
	} catch (e) {
		return { valid: false, error: `Failed to decode transfer call: ${e}` }
	}
}

async function broadcastTransaction(
	rpcUrl: string,
	serializedTx: ViemHex
): Promise<{ success: boolean; txHash?: string; blockNumber?: number; error?: string }> {
	const client = createPublicClient({
		chain: tempoModerato,
		transport: http(rpcUrl),
	})

	try {
		const result = await client.request({
			method: 'eth_sendRawTransactionSync' as 'eth_sendRawTransaction',
			params: [serializedTx],
		})

		if (typeof result === 'object' && result !== null && 'transactionHash' in result) {
			const receipt = result as { transactionHash: string; blockNumber: string; status: string }
			if (receipt.status === '0x0') {
				return { success: false, error: 'Transaction reverted' }
			}
			return {
				success: true,
				txHash: receipt.transactionHash,
				blockNumber: Number.parseInt(receipt.blockNumber, 16),
			}
		}

		return { success: true, txHash: result as string }
	} catch (e) {
		console.error('Failed to broadcast transaction:', e)
		return { success: false, error: `Broadcast failed: ${e}` }
	}
}

export function paymentAuth(config: PaymentAuthConfig): MiddlewareHandler {
	const challengeTtlMs = config.challengeTtlMs ?? 5 * 60 * 1000

	return async (c: Context, next) => {
		const authHeader = c.req.header('Authorization')

		if (!authHeader) {
			const id = generateChallengeId()
			const expires = new Date(Date.now() + challengeTtlMs)
			const request: PaymentRequest = {
				amount: config.amount,
				asset: config.asset,
				destination: config.destination,
				expires: expires.toISOString(),
			}

			challenges.set(id, { request, expires, used: false })

			setTimeout(() => challenges.delete(id), challengeTtlMs + 60000)

			return c.json({ error: 'payment_required', message: 'Payment is required' }, 402, {
				'WWW-Authenticate': buildWwwAuthenticateHeader(id, config, request, expires),
				'Cache-Control': 'no-store',
			})
		}

		const credential = parseCredential(authHeader)
		if (!credential) {
			return c.json({ error: 'invalid_credentials', message: 'Could not parse Payment credential' }, 401)
		}

		const challenge = challenges.get(credential.id)
		if (!challenge) {
			return c.json({ error: 'unknown_challenge', message: 'Challenge ID not recognized' }, 401)
		}

		if (challenge.used) {
			return c.json({ error: 'challenge_already_used', message: 'This challenge has already been used' }, 401)
		}

		if (new Date() > challenge.expires) {
			challenges.delete(credential.id)
			return c.json({ error: 'challenge_expired', message: 'Challenge has expired' }, 401)
		}

		if (credential.payload.type !== 'transaction') {
			return c.json(
				{
					error: 'unsupported_payload_type',
					message: `Only "transaction" payload type is supported for charge intent, got "${credential.payload.type}"`,
				},
				400
			)
		}

		const serializedTx = credential.payload.signature as ViemHex
		const tx = deserializeTempoTransaction(serializedTx)
		if (!tx) {
			return c.json({ error: 'invalid_transaction', message: 'Could not deserialize Tempo transaction' }, 400)
		}

		const verification = verifyTransactionMatchesRequest(tx, challenge.request)
		if (!verification.valid) {
			return c.json({ error: 'transaction_mismatch', message: verification.error }, 400)
		}

		const broadcast = await broadcastTransaction(config.rpcUrl, serializedTx)
		if (!broadcast.success) {
			return c.json({ error: 'settlement_failed', message: broadcast.error }, 402)
		}

		challenge.used = true

		const signer = tx.from ?? (credential.source?.split(':').pop() || 'unknown')

		const receipt: PaymentReceipt = {
			status: 'success',
			method: 'tempo',
			timestamp: new Date().toISOString(),
			reference: broadcast.txHash ?? `challenge-${credential.id}`,
			txHash: broadcast.txHash,
			blockNumber: broadcast.blockNumber,
			amount: challenge.request.amount,
		}

		c.header('Payment-Receipt', base64urlEncode(JSON.stringify(receipt)))
		c.header('Cache-Control', 'private')
		c.set('paymentAuth', { signer, txHash: broadcast.txHash })

		await next()
	}
}
