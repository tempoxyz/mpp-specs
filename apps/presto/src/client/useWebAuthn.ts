import * as PublicKey from 'ox/PublicKey'
import * as WebAuthnP256 from 'ox/WebAuthnP256'
import { useCallback, useEffect, useState } from 'react'
import type { Address, Hex as HexType } from 'viem'
import { createClient, createPublicClient, http } from 'viem'
import { prepareTransactionRequest, signTransaction as viemSignTransaction } from 'viem/actions'
import { tempoModerato } from 'viem/chains'
import { Abis, Account as TempoAccount } from 'viem/tempo'

const ALPHA_USD = '0x20c0000000000000000000000000000000000001' as const

// Storage keys
const CREDENTIAL_STORAGE_KEY = 'presto_webauthn_credential'

/** Convert ArrayBuffer to base64url string */
function arrayBufferToBase64url(buffer: ArrayBuffer): string {
	const bytes = new Uint8Array(buffer)
	let binary = ''
	for (const byte of bytes) {
		binary += String.fromCharCode(byte)
	}
	return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

interface StoredCredential {
	id: string
	publicKey: HexType // Public key as hex string
	address: Address
}

export function useWebAuthn() {
	const [address, setAddress] = useState<Address | null>(null)
	const [isConnected, setIsConnected] = useState(false)
	const [isLoading, setIsLoading] = useState(false)
	const [error, setError] = useState<string | null>(null)
	const [storedCredential, setStoredCredential] = useState<StoredCredential | null>(null)

	const publicClient = createPublicClient({
		chain: tempoModerato,
		transport: http('https://rpc.moderato.tempo.xyz'),
	})

	// Load stored credential on mount
	useEffect(() => {
		const stored = localStorage.getItem(CREDENTIAL_STORAGE_KEY)
		if (stored) {
			try {
				const parsed = JSON.parse(stored) as StoredCredential
				setStoredCredential(parsed)
				setAddress(parsed.address)
				setIsConnected(true)
			} catch {
				localStorage.removeItem(CREDENTIAL_STORAGE_KEY)
			}
		}
	}, [])

	// Sign up - create new passkey
	const signUp = useCallback(async () => {
		setIsLoading(true)
		setError(null)

		try {
			// Create WebAuthn credential
			const cred = await WebAuthnP256.createCredential({
				name: 'Presto',
			})

			// Serialize public key to hex
			const publicKeyHex = PublicKey.toHex(cred.publicKey)

			// Create a Tempo account from the WebAuthn credential to get the address
			const account = TempoAccount.fromWebAuthnP256({
				id: cred.id,
				publicKey: publicKeyHex,
			})

			// Store public key on server for reference
			const storeRes = await fetch('/keys', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					credentialId: cred.id,
					publicKey: publicKeyHex,
					address: account.address,
				}),
			})

			if (!storeRes.ok) {
				throw new Error('Failed to store credential')
			}

			// Store locally
			const storedCred: StoredCredential = {
				id: cred.id,
				publicKey: publicKeyHex,
				address: account.address,
			}
			localStorage.setItem(CREDENTIAL_STORAGE_KEY, JSON.stringify(storedCred))

			setStoredCredential(storedCred)
			setAddress(account.address)
			setIsConnected(true)
		} catch (e) {
			const message = e instanceof Error ? e.message : 'Sign up failed'
			setError(message)
			console.error('WebAuthn sign up error:', e)
		} finally {
			setIsLoading(false)
		}
	}, [])

	// Sign in - authenticate with existing passkey (supports discovery from 1Password, etc.)
	const signIn = useCallback(async () => {
		setIsLoading(true)
		setError(null)

		try {
			const randomBytes = crypto.getRandomValues(new Uint8Array(32))
			const challenge = `0x${Array.from(randomBytes)
				.map((b) => b.toString(16).padStart(2, '0'))
				.join('')}` as `0x${string}`

			// Try local fast-path if we have a stored credential
			const stored = localStorage.getItem(CREDENTIAL_STORAGE_KEY)
			if (stored) {
				try {
					const storedCred = JSON.parse(stored) as StoredCredential
					await WebAuthnP256.sign({
						credentialId: storedCred.id,
						challenge,
					})
					setStoredCredential(storedCred)
					setAddress(storedCred.address)
					setIsConnected(true)
					return
				} catch {
					// Fall through to discovery flow
					console.log('Local credential failed, trying discovery...')
				}
			}

			// Discovery flow: no credentialId => browser/1Password can offer any matching passkey
			const result = await WebAuthnP256.sign({ challenge })
			const discoveredId = result.raw.id

			// Look up public key by credentialId from server
			let publicKey: HexType
			let storedAddress: Address

			const keyRes = await fetch(`/keys/${encodeURIComponent(discoveredId)}`)
			if (keyRes.ok) {
				const data = (await keyRes.json()) as { publicKey: HexType; address: Address }
				publicKey = data.publicKey
				storedAddress = data.address
			} else {
				// Key not in KV - try onchain recovery using the WebAuthn assertion
				console.log('Key not found in KV, attempting onchain recovery...')

				// Extract assertion data from the sign result for recovery
				const response = result.raw.response as AuthenticatorAssertionResponse
				const clientDataJSON = arrayBufferToBase64url(response.clientDataJSON)
				const authenticatorData = arrayBufferToBase64url(response.authenticatorData)
				const signature = arrayBufferToBase64url(response.signature)

				const recoveryRes = await fetch('/webauthn/recover', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						credentialId: discoveredId,
						clientDataJSON,
						authenticatorData,
						signature,
					}),
				})

				if (!recoveryRes.ok) {
					const error = (await recoveryRes.json().catch(() => ({}))) as { error?: string }
					throw new Error(
						error.error ||
							'Passkey found, but could not recover account from onchain. This passkey may not be registered.',
					)
				}

				const recovered = (await recoveryRes.json()) as { publicKey: HexType; address: Address }
				publicKey = recovered.publicKey
				storedAddress = recovered.address
				console.log('Successfully recovered account from onchain:', storedAddress)
			}

			// Derive account to verify (or use stored address)
			const account = TempoAccount.fromWebAuthnP256({
				id: discoveredId,
				publicKey,
			})

			const finalAddress = storedAddress || account.address

			// Cache locally for future sign-ins
			const storedCred: StoredCredential = {
				id: discoveredId,
				publicKey,
				address: finalAddress,
			}
			localStorage.setItem(CREDENTIAL_STORAGE_KEY, JSON.stringify(storedCred))

			setStoredCredential(storedCred)
			setAddress(finalAddress)
			setIsConnected(true)
		} catch (e) {
			const message = e instanceof Error ? e.message : 'Sign in failed'
			setError(message)
			console.error('WebAuthn sign in error:', e)
		} finally {
			setIsLoading(false)
		}
	}, [])

	// Disconnect
	const disconnect = useCallback(() => {
		setAddress(null)
		setIsConnected(false)
		setStoredCredential(null)
		// Don't remove stored credential - user can sign in again
	}, [])

	// Sign a transaction using the WebAuthn credential
	// Uses viem/tempo's native WebAuthn account support with Tempo transaction format
	// Supports either single call { to, data, value? } or batched { calls: [...] }
	const signTransaction = useCallback(
		async (
			params:
				| { to: Address; data: HexType; value?: bigint }
				| { calls: Array<{ to: Address; data: HexType; value?: bigint }> },
		): Promise<HexType> => {
			if (!storedCredential || !address) {
				throw new Error('Not connected')
			}

			// Normalize to calls array
			const calls =
				'calls' in params
					? params.calls.map((c) => ({ to: c.to, data: c.data, value: c.value ?? 0n }))
					: [{ to: params.to, data: params.data, value: params.value ?? 0n }]

			// Create the Tempo account from the stored WebAuthn credential
			const account = TempoAccount.fromWebAuthnP256({
				id: storedCredential.id,
				publicKey: storedCredential.publicKey,
			})

			console.log('🔑 WebAuthn account address:', account.address)
			console.log('📋 Stored address:', address)
			console.log('🔑 Public key:', storedCredential.publicKey)

			// Create client with Tempo chain config extended with feeToken
			// This enables paying gas with TIP-20 stablecoins
			const chain = tempoModerato.extend({ feeToken: ALPHA_USD })
			const client = createClient({
				chain,
				transport: http('https://rpc.moderato.tempo.xyz'),
			})

			// Get current gas price and apply 2x buffer to avoid stuck transactions
			const gasPrice = await publicClient.getGasPrice()
			const maxFeePerGas = gasPrice * 2n
			const maxPriorityFeePerGas = gasPrice

			// Prepare the Tempo transaction with feeToken
			const prepared = await prepareTransactionRequest(client, {
				type: 'tempo',
				account,
				calls,
				feeToken: ALPHA_USD, // Pay gas with stablecoin
				maxPriorityFeePerGas,
				maxFeePerGas,
				gas: calls.length > 1 ? 250_000n : 100_000n,
			} as any)

			// Sign the prepared transaction
			const signedTx = await viemSignTransaction(client, {
				...prepared,
				account,
			} as any)

			return signedTx
		},
		[storedCredential, address, publicClient.getGasPrice],
	)

	// Get balance
	const getBalance = useCallback(async () => {
		if (!address) return null

		try {
			const balance = await publicClient.readContract({
				address: ALPHA_USD,
				abi: Abis.tip20,
				functionName: 'balanceOf',
				args: [address],
			})
			return balance
		} catch {
			return null
		}
	}, [address, publicClient])

	/**
	 * Cancel a stuck transaction by sending a 0-value self-transfer at the same nonce
	 * with a higher gas price. This replaces the stuck tx in the mempool.
	 */
	const cancelStuckTransaction = useCallback(
		async (stuckNonce: bigint): Promise<HexType> => {
			if (!storedCredential || !address) {
				throw new Error('Not connected')
			}

			console.log(`🔄 Cancelling stuck transaction at nonce ${stuckNonce}...`)

			const account = TempoAccount.fromWebAuthnP256({
				id: storedCredential.id,
				publicKey: storedCredential.publicKey,
			})

			const chain = tempoModerato.extend({ feeToken: ALPHA_USD })
			const client = createClient({
				chain,
				transport: http('https://rpc.moderato.tempo.xyz'),
			})

			// Use high gas price to ensure replacement (100 gwei should beat most txs)
			const gasPrice = await publicClient.getGasPrice()
			const maxFeePerGas = gasPrice * 10n // 10x current price to ensure replacement
			const maxPriorityFeePerGas = gasPrice * 5n

			// Prepare a 0-value self-transfer to cancel the stuck tx
			// AA transactions need higher gas for signature verification (~30k+)
			const prepared = await prepareTransactionRequest(client, {
				type: 'tempo',
				account,
				calls: [{ to: address, data: '0x', value: 0n }],
				feeToken: ALPHA_USD,
				maxPriorityFeePerGas,
				maxFeePerGas,
				gas: 50_000n,
				nonce: Number(stuckNonce),
			} as any)

			const signedTx = await viemSignTransaction(client, {
				...prepared,
				account,
			} as any)

			// Send the cancellation tx
			const txHash = await publicClient.request({
				method: 'eth_sendRawTransaction',
				params: [signedTx],
			})

			console.log(`✅ Cancellation tx sent: ${txHash}`)
			return txHash
		},
		[storedCredential, address, publicClient],
	)

	/**
	 * Get pending transactions for this account from the mempool
	 */
	const getPendingNonces = useCallback(async (): Promise<bigint[]> => {
		if (!address) return []

		try {
			const [pendingCount, confirmedCount] = await Promise.all([
				publicClient.getTransactionCount({ address, blockTag: 'pending' }),
				publicClient.getTransactionCount({ address, blockTag: 'latest' }),
			])

			const pendingNonces: bigint[] = []
			for (let i = confirmedCount; i < pendingCount; i++) {
				pendingNonces.push(BigInt(i))
			}
			return pendingNonces
		} catch {
			return []
		}
	}, [address, publicClient])

	return {
		address,
		isConnected,
		isLoading,
		error,
		storedCredential, // Expose for access key hook
		signUp,
		signIn,
		disconnect,
		signTransaction,
		getBalance,
		cancelStuckTransaction,
		getPendingNonces,
	}
}
