import * as PublicKey from 'ox/PublicKey'
import * as Secp256k1 from 'ox/Secp256k1'
import { useCallback, useEffect, useState } from 'react'
import type { Address, Hex } from 'viem'
import { createClient, createPublicClient, encodeFunctionData, http, keccak256 } from 'viem'
import { prepareTransactionRequest, signTransaction as viemSignTransaction } from 'viem/actions'
import { tempoModerato } from 'viem/chains'
import { Account as TempoAccount } from 'viem/tempo'
import { ACCOUNT_KEYCHAIN_ADDRESS, accountKeychainAbi, SignatureType } from './accountKeychain'

const ALPHA_USD = '0x20c0000000000000000000000000000000000001' as const
const ACCESS_KEY_STORAGE_KEY = 'presto_access_key'

interface StoredAccessKey {
	keyId: Address
	privateKey: Hex // Secp256k1 private key
	publicKey: Hex // Secp256k1 public key
	expiry: number // Unix timestamp
	accountAddress: Address // The account this key belongs to
}

function getStorageKey(accountAddress: Address): string {
	return `${ACCESS_KEY_STORAGE_KEY}_${accountAddress.toLowerCase()}`
}

function loadStoredAccessKey(accountAddress: Address | null): StoredAccessKey | null {
	if (!accountAddress) return null
	try {
		const stored = localStorage.getItem(getStorageKey(accountAddress))
		if (!stored) return null
		const parsed = JSON.parse(stored) as StoredAccessKey
		if (parsed.expiry * 1000 < Date.now()) {
			localStorage.removeItem(getStorageKey(accountAddress))
			return null
		}
		return parsed
	} catch {
		return null
	}
}

function saveAccessKey(key: StoredAccessKey): void {
	localStorage.setItem(getStorageKey(key.accountAddress), JSON.stringify(key))
}

function removeAccessKey(accountAddress: Address): void {
	localStorage.removeItem(getStorageKey(accountAddress))
}

/**
 * Derive a keyId (address) from a Secp256k1 public key
 * keyId = last 20 bytes of keccak256(publicKeyWithoutPrefix)
 */
function deriveKeyId(publicKeyHex: Hex): Address {
	// Remove 0x04 prefix if present (uncompressed Secp256k1 public key is 65 bytes)
	const keyWithoutPrefix = publicKeyHex.startsWith('0x04')
		? (`0x${publicKeyHex.slice(4)}` as Hex)
		: publicKeyHex.slice(2).length === 128
			? (`0x${publicKeyHex.slice(2)}` as Hex)
			: publicKeyHex

	const hash = keccak256(keyWithoutPrefix)
	return `0x${hash.slice(-40)}` as Address
}

/**
 * Hook for managing Tempo Access Keys
 * Access Keys allow signing transactions without passkey prompts
 */
export function useAccessKey(
	rootKeyCredentialId: string | null,
	rootKeyPublicKey: Hex | null,
	accountAddress: Address | null,
) {
	const [accessKey, setAccessKey] = useState<StoredAccessKey | null>(null)
	const [isAuthorizing, setIsAuthorizing] = useState(false)
	const [error, setError] = useState<string | null>(null)

	const publicClient = createPublicClient({
		chain: tempoModerato,
		transport: http('https://rpc.moderato.tempo.xyz'),
	})

	useEffect(() => {
		const stored = loadStoredAccessKey(accountAddress)
		if (stored) {
			setAccessKey(stored)
		} else {
			setAccessKey(null)
		}
	}, [accountAddress])

	/**
	 * Authorize a new Access Key using the Root Key (passkey)
	 * This requires a passkey signature
	 */
	const authorizeAccessKey = useCallback(
		async (signWithRootKey: (params: { to: Address; data: Hex }) => Promise<Hex>) => {
			if (!accountAddress || !rootKeyCredentialId || !rootKeyPublicKey) {
				throw new Error('Root key not connected')
			}

			setIsAuthorizing(true)
			setError(null)

			try {
				// Generate new Secp256k1 key pair using ox (compatible with cast --access-key)
				const privateKey = Secp256k1.randomPrivateKey()
				const publicKey = Secp256k1.getPublicKey({ privateKey })
				const publicKeyHex = PublicKey.toHex(publicKey)

				// Derive keyId from public key
				const keyId = deriveKeyId(publicKeyHex)

				console.log('🔑 Generated new Access Key:', keyId)
				console.log('📋 Public key:', publicKeyHex)

				// Set expiry to 24 hours from now
				const expiry = BigInt(Math.floor(Date.now() / 1000) + 24 * 60 * 60)

				// Encode the authorizeKey call
				const callData = encodeFunctionData({
					abi: accountKeychainAbi,
					functionName: 'authorizeKey',
					args: [
						keyId,
						SignatureType.Secp256k1, // Using Secp256k1 for CLI compatibility
						expiry,
						true, // enforceLimits
						[{ token: ALPHA_USD, amount: BigInt(100 * 1e6) }], // $100 spending limit
					],
				})

				console.log('⏳ Signing authorizeKey transaction with passkey...')

				// Sign and send the transaction using the Root Key (passkey)
				// This will prompt the user for passkey authentication
				const signedTx = await signWithRootKey({
					to: ACCOUNT_KEYCHAIN_ADDRESS,
					data: callData,
				})

				console.log('✅ Signed authorizeKey transaction')

				// Send the transaction
				const txHash = await publicClient.request({
					method: 'eth_sendRawTransaction',
					params: [signedTx],
				})

				console.log('📤 Submitted tx:', txHash)

				// Wait for confirmation
				const receipt = await publicClient.waitForTransactionReceipt({
					hash: txHash,
				})

				if (receipt.status === 'reverted') {
					throw new Error('Transaction reverted')
				}

				console.log('✅ Access Key authorized!')

				const storedKey: StoredAccessKey = {
					keyId,
					privateKey,
					publicKey: publicKeyHex,
					expiry: Number(expiry),
					accountAddress,
				}

				saveAccessKey(storedKey)
				setAccessKey(storedKey)

				return { keyId, txHash }
			} catch (e) {
				const message = e instanceof Error ? e.message : 'Failed to authorize access key'
				setError(message)
				console.error('Access key authorization error:', e)
				throw e
			} finally {
				setIsAuthorizing(false)
			}
		},
		[accountAddress, rootKeyCredentialId, rootKeyPublicKey, publicClient],
	)

	/**
	 * Sign a transaction using the Access Key
	 * No passkey prompt required!
	 */
	const signWithAccessKey = useCallback(
		async (params: { to: Address; data: Hex; value?: bigint }): Promise<Hex> => {
			if (!accessKey || !accountAddress) {
				throw new Error('Access key not available')
			}

			// Create a Tempo account using Secp256k1 with our access key's private key
			// The `access` option tells Tempo this is an access key for the parent account,
			// so transactions will be FROM the parent account (which has funds),
			// but SIGNED BY this Secp256k1 key (which is authorized in the keychain)
			const account = TempoAccount.fromSecp256k1(accessKey.privateKey, {
				access: accountAddress,
			})

			const chain = tempoModerato.extend({ feeToken: ALPHA_USD })
			const client = createClient({
				chain,
				transport: http('https://rpc.moderato.tempo.xyz'),
			})

			// Prepare the transaction
			// The Tempo protocol will validate the signature against the keychain
			const prepared = await prepareTransactionRequest(client, {
				type: 'tempo',
				account,
				calls: [
					{
						to: params.to,
						data: params.data,
						value: params.value ?? 0n,
					},
				],
				feeToken: ALPHA_USD,
				maxPriorityFeePerGas: 1_000_000_000n,
				maxFeePerGas: 10_000_000_000n,
				gas: 100_000n,
			} as unknown as Parameters<typeof prepareTransactionRequest>[1])

			// Sign the transaction
			const signedTx = await viemSignTransaction(client, {
				...prepared,
				account,
			} as unknown as Parameters<typeof viemSignTransaction>[1])

			return signedTx
		},
		[accessKey, accountAddress],
	)

	/**
	 * Revoke the current Access Key
	 */
	const revokeAccessKey = useCallback(
		async (signWithRootKey: (params: { to: Address; data: Hex }) => Promise<Hex>) => {
			if (!accessKey || !accountAddress) {
				throw new Error('No access key to revoke')
			}

			const callData = encodeFunctionData({
				abi: accountKeychainAbi,
				functionName: 'revokeKey',
				args: [accessKey.keyId],
			})

			const signedTx = await signWithRootKey({
				to: ACCOUNT_KEYCHAIN_ADDRESS,
				data: callData,
			})

			const txHash = await publicClient.request({
				method: 'eth_sendRawTransaction',
				params: [signedTx],
			})

			await publicClient.waitForTransactionReceipt({ hash: txHash })

			if (accountAddress) {
				removeAccessKey(accountAddress)
			}
			setAccessKey(null)

			return txHash
		},
		[accessKey, accountAddress, publicClient],
	)

	/**
	 * Clear the local access key without revoking on-chain
	 */
	const clearAccessKey = useCallback(() => {
		if (accountAddress) {
			removeAccessKey(accountAddress)
		}
		setAccessKey(null)
	}, [accountAddress])

	return {
		accessKey,
		hasAccessKey: !!accessKey,
		isAuthorizing,
		error,
		authorizeAccessKey,
		signWithAccessKey,
		revokeAccessKey,
		clearAccessKey,
	}
}
