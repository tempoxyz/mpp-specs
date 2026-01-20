import * as PublicKey from 'ox/PublicKey'
import * as Secp256k1 from 'ox/Secp256k1'
import { useCallback, useEffect, useState } from 'react'
import type { Address, Hex } from 'viem'

export type TxStage = 'idle' | 'signing' | 'sending' | 'confirming' | 'success' | 'error'

import {
	createClient,
	createPublicClient,
	encodeFunctionData,
	http,
	keccak256,
	parseAbiItem,
} from 'viem'
import { prepareTransactionRequest, signTransaction as viemSignTransaction } from 'viem/actions'
import { tempoModerato } from 'viem/chains'
import { Account as TempoAccount } from 'viem/tempo'
import {
	ACCOUNT_KEYCHAIN_ADDRESS,
	accountKeychainAbi,
	type TokenLimit as OnChainTokenLimit,
	SignatureType,
} from './accountKeychain'

export const ALPHA_USD = '0x20c0000000000000000000000000000000000001' as const
const ACCESS_KEY_STORAGE_KEY_V2 = 'presto:keys:v2'
const ACCESS_KEY_STORAGE_KEY_V1 = 'presto_access_keys' // Legacy key for migration
const DEFAULT_ACCESS_KEY_LIMIT = BigInt(100 * 1e6) // $100 spending limit in 6 decimals

/** Token spending limit with display metadata */
export interface StoredTokenLimit {
	token: Address
	amount: string // bigint as string for JSON serialization
	symbol?: string // cached for display (e.g., "ALPHA")
	decimals?: number // cached for display (e.g., 6)
}

/** Known tokens on Tempo for display */
export const KNOWN_TOKENS: Record<Address, { symbol: string; decimals: number }> = {
	'0x20c0000000000000000000000000000000000001': { symbol: 'ALPHA', decimals: 6 },
	'0x20c0000000000000000000000000000000000002': { symbol: 'USDC', decimals: 6 },
	'0x20c0000000000000000000000000000000000003': { symbol: 'USDT', decimals: 6 },
	'0x20c0000000000000000000000000000000000000': { symbol: 'pathUSD', decimals: 6 },
}

export interface StoredAccessKey {
	keyId: Address
	privateKey: Hex // Secp256k1 private key
	publicKey: Hex // Secp256k1 public key
	expiry: number // Unix timestamp
	accountAddress: Address // The account this key belongs to
	createdAt: number // Unix timestamp when key was created
	tokenLimits: StoredTokenLimit[] // Token spending limits
	chainId: number // Chain ID this key is valid for
}

/** Options for creating a new access key */
export interface AuthorizeKeyOptions {
	/** Token spending limits */
	tokenLimits?: StoredTokenLimit[]
	/** Expiry in seconds from now (default: 24 hours) */
	expirySeconds?: number
}

/** Convert StoredTokenLimit[] to on-chain format */
export function toOnChainTokenLimits(limits: StoredTokenLimit[]): OnChainTokenLimit[] {
	return limits.map((l) => ({
		token: l.token as `0x${string}`,
		amount: BigInt(l.amount),
	}))
}

/** Convert on-chain format to StoredTokenLimit[] with display metadata */
export function fromOnChainTokenLimits(limits: OnChainTokenLimit[]): StoredTokenLimit[] {
	return limits.map((l) => {
		const known = KNOWN_TOKENS[l.token.toLowerCase() as Address]
		return {
			token: l.token as Address,
			amount: l.amount.toString(),
			symbol: known?.symbol,
			decimals: known?.decimals,
		}
	})
}

interface StoredKeyStore {
	selectedKeyId: Address | null
	keys: StoredAccessKey[]
}

function getStorageKeyV2(accountAddress: Address): string {
	return `${ACCESS_KEY_STORAGE_KEY_V2}:${accountAddress.toLowerCase()}`
}

function getStorageKeyV1(accountAddress: Address): string {
	return `${ACCESS_KEY_STORAGE_KEY_V1}_${accountAddress.toLowerCase()}`
}

/** Migrate v1 keys to v2 format with tokenLimits */
function migrateV1ToV2(accountAddress: Address): StoredKeyStore | null {
	try {
		const v1Key = getStorageKeyV1(accountAddress)
		const stored = localStorage.getItem(v1Key)
		if (!stored) return null

		const parsed = JSON.parse(stored) as {
			selectedKeyId: Address | null
			keys: Array<Omit<StoredAccessKey, 'tokenLimits' | 'chainId'>>
		}

		// Migrate each key to include tokenLimits and chainId
		const migratedKeys: StoredAccessKey[] = parsed.keys.map((key) => ({
			...key,
			tokenLimits: [
				{
					token: ALPHA_USD,
					amount: DEFAULT_ACCESS_KEY_LIMIT.toString(),
					symbol: 'ALPHA',
					decimals: 6,
				},
			],
			chainId: tempoModerato.id, // Default to Moderato testnet
		}))

		const migratedStore: StoredKeyStore = {
			selectedKeyId: parsed.selectedKeyId,
			keys: migratedKeys,
		}

		// Save to v2 and remove v1
		localStorage.setItem(getStorageKeyV2(accountAddress), JSON.stringify(migratedStore))
		localStorage.removeItem(v1Key)

		console.log(
			`[Migration] Migrated ${migratedKeys.length} keys from v1 to v2 for ${accountAddress}`,
		)
		return migratedStore
	} catch (e) {
		console.error('[Migration] Failed to migrate v1 keys:', e)
		return null
	}
}

function loadKeyStore(accountAddress: Address | null): StoredKeyStore {
	if (!accountAddress) return { selectedKeyId: null, keys: [] }

	// Try v2 first
	try {
		const stored = localStorage.getItem(getStorageKeyV2(accountAddress))
		if (stored) {
			const parsed = JSON.parse(stored) as StoredKeyStore
			// Filter out expired keys
			const now = Date.now()
			const validKeys = parsed.keys.filter((k) => k.expiry * 1000 >= now)
			// If selected key was removed, clear selection
			const selectedKeyId = validKeys.some((k) => k.keyId === parsed.selectedKeyId)
				? parsed.selectedKeyId
				: (validKeys[0]?.keyId ?? null)
			return { selectedKeyId, keys: validKeys }
		}
	} catch {
		// Fall through to migration
	}

	// Try migrating from v1
	const migrated = migrateV1ToV2(accountAddress)
	if (migrated) {
		// Filter expired keys from migrated data too
		const now = Date.now()
		const validKeys = migrated.keys.filter((k) => k.expiry * 1000 >= now)
		const selectedKeyId = validKeys.some((k) => k.keyId === migrated.selectedKeyId)
			? migrated.selectedKeyId
			: (validKeys[0]?.keyId ?? null)
		return { selectedKeyId, keys: validKeys }
	}

	return { selectedKeyId: null, keys: [] }
}

function saveKeyStore(accountAddress: Address, store: StoredKeyStore): void {
	localStorage.setItem(getStorageKeyV2(accountAddress), JSON.stringify(store))
}

function addKeyToStore(key: StoredAccessKey): void {
	const store = loadKeyStore(key.accountAddress)
	// Add key if not already present
	if (!store.keys.some((k) => k.keyId === key.keyId)) {
		store.keys.push(key)
	}
	// Auto-select the new key
	store.selectedKeyId = key.keyId
	saveKeyStore(key.accountAddress, store)
}

function removeKeyFromStore(accountAddress: Address, keyId: Address): void {
	const store = loadKeyStore(accountAddress)
	store.keys = store.keys.filter((k) => k.keyId !== keyId)
	// If we removed the selected key, select another
	if (store.selectedKeyId === keyId) {
		store.selectedKeyId = store.keys[0]?.keyId ?? null
	}
	saveKeyStore(accountAddress, store)
}

function selectKeyInStore(accountAddress: Address, keyId: Address): void {
	const store = loadKeyStore(accountAddress)
	if (store.keys.some((k) => k.keyId === keyId)) {
		store.selectedKeyId = keyId
		saveKeyStore(accountAddress, store)
	}
}

// Legacy migration: convert old single-key format to new multi-key format (v2 compatible)
function migrateFromLegacy(accountAddress: Address): void {
	const legacyKey = `presto_access_key_${accountAddress.toLowerCase()}`
	try {
		const stored = localStorage.getItem(legacyKey)
		if (!stored) return
		const parsed = JSON.parse(stored) as Omit<
			StoredAccessKey,
			'createdAt' | 'tokenLimits' | 'chainId'
		>
		// Only migrate if not expired
		if (parsed.expiry * 1000 >= Date.now()) {
			const migratedKey: StoredAccessKey = {
				...parsed,
				createdAt: Date.now() / 1000, // Approximate
				tokenLimits: [
					{
						token: ALPHA_USD,
						amount: DEFAULT_ACCESS_KEY_LIMIT.toString(),
						symbol: 'ALPHA',
						decimals: 6,
					},
				],
				chainId: tempoModerato.id,
			}
			addKeyToStore(migratedKey)
		}
		// Remove legacy key
		localStorage.removeItem(legacyKey)
	} catch {
		// Ignore migration errors
	}
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
// Shared client to avoid recreating on each render
const sharedPublicClient = createPublicClient({
	chain: tempoModerato,
	transport: http('https://rpc.moderato.tempo.xyz'),
})

export function useAccessKey(
	rootKeyCredentialId: string | null,
	rootKeyPublicKey: Hex | null,
	accountAddress: Address | null,
) {
	const [keys, setKeys] = useState<StoredAccessKey[]>([])
	const [selectedKeyId, setSelectedKeyId] = useState<Address | null>(null)
	const [isAuthorizing, setIsAuthorizing] = useState(false)
	const [error, setError] = useState<string | null>(null)
	const [txStage, setTxStage] = useState<TxStage>('idle')
	const [txHash, setTxHash] = useState<Hex | null>(null)

	const publicClient = sharedPublicClient

	// The currently selected access key
	const accessKey = keys.find((k) => k.keyId === selectedKeyId) ?? null

	useEffect(() => {
		if (accountAddress) {
			// Migrate from legacy single-key format if needed
			migrateFromLegacy(accountAddress)
		}
		const store = loadKeyStore(accountAddress)
		setKeys(store.keys)
		setSelectedKeyId(store.selectedKeyId)
	}, [accountAddress])

	/**
	 * Select a different key as the active key
	 */
	const selectKey = useCallback(
		(keyId: Address) => {
			if (!accountAddress) return
			selectKeyInStore(accountAddress, keyId)
			setSelectedKeyId(keyId)
		},
		[accountAddress],
	)

	/**
	 * Authorize a new Access Key using the Root Key (passkey)
	 * This requires a passkey signature
	 * Multiple keys can coexist - this adds a new key without revoking existing ones
	 */
	const authorizeAccessKey = useCallback(
		async (
			signWithRootKey: (
				params:
					| { to: Address; data: Hex }
					| { calls: Array<{ to: Address; data: Hex; value?: bigint }> },
			) => Promise<Hex>,
			options?: AuthorizeKeyOptions,
		) => {
			if (!accountAddress || !rootKeyCredentialId || !rootKeyPublicKey) {
				throw new Error('Root key not connected')
			}

			// Use provided options or defaults
			const expirySeconds = options?.expirySeconds ?? 24 * 60 * 60 // Default 24 hours
			const tokenLimits: StoredTokenLimit[] = options?.tokenLimits ?? [
				{
					token: ALPHA_USD,
					amount: DEFAULT_ACCESS_KEY_LIMIT.toString(),
					symbol: 'ALPHA',
					decimals: 6,
				},
			]

			setIsAuthorizing(true)
			setError(null)
			setTxStage('idle')
			setTxHash(null)

			try {
				// Generate new Secp256k1 key pair using ox (compatible with cast --access-key)
				const privateKey = Secp256k1.randomPrivateKey()
				const publicKey = Secp256k1.getPublicKey({ privateKey })
				const publicKeyHex = PublicKey.toHex(publicKey)

				// Derive keyId from public key
				const keyId = deriveKeyId(publicKeyHex)

				console.log('🔑 Generated new Access Key:', keyId)
				console.log('📋 Public key:', publicKeyHex)

				// Set expiry based on options
				const expiry = BigInt(Math.floor(Date.now() / 1000) + expirySeconds)

				// Convert token limits to on-chain format
				const onChainLimits = toOnChainTokenLimits(tokenLimits)

				// Authorize the new key (no auto-revoke of existing keys)
				const calls: Array<{ to: Address; data: Hex }> = [
					{
						to: ACCOUNT_KEYCHAIN_ADDRESS,
						data: encodeFunctionData({
							abi: accountKeychainAbi,
							functionName: 'authorizeKey',
							args: [
								keyId,
								SignatureType.Secp256k1, // Using Secp256k1 for CLI compatibility
								expiry,
								true, // enforceLimits
								onChainLimits,
							],
						}),
					},
				]

				console.log(`⏳ Signing ${calls.length} call(s) with passkey...`)
				setTxStage('signing')

				// Sign and send the transaction using the Root Key (passkey)
				// This will prompt the user for passkey authentication ONCE
				const signedTx = await signWithRootKey({ calls })

				console.log('✅ Signed transaction')
				setTxStage('sending')

				// Send the transaction
				const authTxHash = await publicClient.request({
					method: 'eth_sendRawTransaction',
					params: [signedTx],
				})
				setTxHash(authTxHash)

				console.log('📤 Submitted tx:', authTxHash)
				setTxStage('confirming')

				// Wait for confirmation
				const receipt = await publicClient.waitForTransactionReceipt({
					hash: authTxHash,
				})

				if (receipt.status === 'reverted') {
					throw new Error('Transaction reverted')
				}

				console.log('✅ Access Key authorized!')
				setTxStage('success')

				const storedKey: StoredAccessKey = {
					keyId,
					privateKey,
					publicKey: publicKeyHex,
					expiry: Number(expiry),
					accountAddress,
					createdAt: Math.floor(Date.now() / 1000),
					tokenLimits,
					chainId: tempoModerato.id,
				}

				// Add to store (auto-selects the new key)
				addKeyToStore(storedKey)
				setKeys((prev) => [...prev, storedKey])
				setSelectedKeyId(keyId)

				return { keyId, txHash: authTxHash }
			} catch (e) {
				const message = e instanceof Error ? e.message : 'Failed to authorize access key'
				setError(message)
				setTxStage('error')
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

			// Get current gas price and apply 2x buffer to avoid stuck transactions
			const gasPrice = await publicClient.getGasPrice()
			const maxFeePerGas = gasPrice * 2n
			const maxPriorityFeePerGas = gasPrice

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
				maxPriorityFeePerGas,
				maxFeePerGas,
				gas: 100_000n,
			} as unknown as Parameters<typeof prepareTransactionRequest>[1])

			// Sign the transaction
			const signedTx = await viemSignTransaction(client, {
				...prepared,
				account,
			} as unknown as Parameters<typeof viemSignTransaction>[1])

			return signedTx
		},
		[accessKey, accountAddress, publicClient.getGasPrice],
	)

	/**
	 * Revoke a specific Access Key by keyId
	 * If no keyId provided, revokes the currently selected key
	 */
	const revokeAccessKey = useCallback(
		async (
			signWithRootKey: (params: { to: Address; data: Hex }) => Promise<Hex>,
			keyIdToRevoke?: Address,
		) => {
			const targetKeyId = keyIdToRevoke ?? accessKey?.keyId
			if (!targetKeyId || !accountAddress) {
				throw new Error('No access key to revoke')
			}

			const callData = encodeFunctionData({
				abi: accountKeychainAbi,
				functionName: 'revokeKey',
				args: [targetKeyId],
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

			// Remove from local store
			removeKeyFromStore(accountAddress, targetKeyId)
			setKeys((prev) => prev.filter((k) => k.keyId !== targetKeyId))
			// If we revoked the selected key, select another
			if (selectedKeyId === targetKeyId) {
				const store = loadKeyStore(accountAddress)
				setSelectedKeyId(store.selectedKeyId)
			}

			return txHash
		},
		[accessKey, accountAddress, publicClient, selectedKeyId],
	)

	/**
	 * Clear a specific access key locally without revoking on-chain
	 * If no keyId provided, clears the currently selected key
	 */
	const clearAccessKey = useCallback(
		(keyIdToClear?: Address) => {
			if (!accountAddress) return
			const targetKeyId = keyIdToClear ?? accessKey?.keyId
			if (!targetKeyId) return

			removeKeyFromStore(accountAddress, targetKeyId)
			setKeys((prev) => prev.filter((k) => k.keyId !== targetKeyId))
			if (selectedKeyId === targetKeyId) {
				const store = loadKeyStore(accountAddress)
				setSelectedKeyId(store.selectedKeyId)
			}
		},
		[accountAddress, accessKey, selectedKeyId],
	)

	/**
	 * Get the remaining spending limit for the current access key (legacy - single token)
	 * Returns the remaining amount in token units (6 decimals for ALPHA_USD)
	 */
	const getRemainingLimit = useCallback(async (): Promise<bigint | null> => {
		if (!accessKey || !accountAddress) {
			return null
		}

		try {
			const remaining = await publicClient.readContract({
				address: ACCOUNT_KEYCHAIN_ADDRESS,
				abi: accountKeychainAbi,
				functionName: 'getRemainingLimit',
				args: [accountAddress, accessKey.keyId, ALPHA_USD],
			})
			return remaining
		} catch (e) {
			console.error('Failed to get remaining limit:', e)
			return null
		}
	}, [accessKey, accountAddress, publicClient])

	/**
	 * Get the spent amount for the current access key (legacy - single token)
	 * Returns { spent, limit } in token units (6 decimals for ALPHA_USD)
	 */
	const getSpentAmount = useCallback(async (): Promise<{ spent: bigint; limit: bigint } | null> => {
		const remaining = await getRemainingLimit()
		if (remaining === null) return null
		return {
			spent: DEFAULT_ACCESS_KEY_LIMIT - remaining,
			limit: DEFAULT_ACCESS_KEY_LIMIT,
		}
	}, [getRemainingLimit])

	/**
	 * Get token limits with on-chain remaining data for a specific key
	 * Returns array of { token, symbol, decimals, limit, remaining, spent }
	 */
	const getTokenLimitsForKey = useCallback(
		async (
			key: StoredAccessKey,
		): Promise<
			Array<{
				token: Address
				symbol: string
				decimals: number
				limit: bigint
				remaining: bigint
				spent: bigint
			}>
		> => {
			if (!accountAddress) return []

			const results = await Promise.all(
				key.tokenLimits.map(async (tokenLimit) => {
					const token = tokenLimit.token
					const limit = BigInt(tokenLimit.amount)
					const known = KNOWN_TOKENS[token.toLowerCase() as Address]
					const symbol = tokenLimit.symbol ?? known?.symbol ?? token.slice(0, 6)
					const decimals = tokenLimit.decimals ?? known?.decimals ?? 6

					try {
						const remaining = await publicClient.readContract({
							address: ACCOUNT_KEYCHAIN_ADDRESS,
							abi: accountKeychainAbi,
							functionName: 'getRemainingLimit',
							args: [accountAddress, key.keyId, token],
						})
						const spent = limit > remaining ? limit - remaining : 0n
						return { token, symbol, decimals, limit, remaining, spent }
					} catch (e) {
						console.error(`Failed to get remaining limit for ${symbol}:`, e)
						return { token, symbol, decimals, limit, remaining: limit, spent: 0n }
					}
				}),
			)

			return results
		},
		[accountAddress, publicClient],
	)

	return {
		// Multi-key state
		keys,
		selectedKeyId,
		selectKey,
		// Currently selected key (for backwards compatibility)
		accessKey,
		hasAccessKey: !!accessKey,
		// Actions
		isAuthorizing,
		error,
		txStage,
		txHash,
		authorizeAccessKey,
		signWithAccessKey,
		revokeAccessKey,
		clearAccessKey,
		getRemainingLimit,
		getSpentAmount,
		getTokenLimitsForKey,
	}
}

/** Historical key entry from on-chain events */
export interface KeyHistoryEntry {
	keyId: Address
	status: 'revoked' | 'expired'
	timestamp: number // Unix seconds
}

/**
 * Hook to fetch historical key events from the AccountKeychain contract
 */
export function useKeyHistory(accountAddress: Address | null) {
	const [history, setHistory] = useState<KeyHistoryEntry[]>([])
	const [isLoading, setIsLoading] = useState(false)
	const [hasFetched, setHasFetched] = useState(false)

	const fetchHistory = useCallback(async () => {
		if (!accountAddress) {
			setHistory([])
			return
		}

		setIsLoading(true)
		try {
			const client = createPublicClient({
				chain: tempoModerato,
				transport: http('https://rpc.moderato.tempo.xyz'),
			})

			// RPC has max block range of 100,000 - query last 99,000 blocks
			const currentBlock = await client.getBlockNumber()
			const fromBlock = currentBlock > 99000n ? currentBlock - 99000n : 0n

			// Fetch KeyAuthorized events
			const authorizedLogs = await client.getLogs({
				address: ACCOUNT_KEYCHAIN_ADDRESS,
				event: parseAbiItem(
					'event KeyAuthorized(address indexed account, address indexed publicKey, uint8 signatureType, uint64 expiry)',
				),
				args: { account: accountAddress },
				fromBlock,
				toBlock: 'latest',
			})

			// Fetch KeyRevoked events
			const revokedLogs = await client.getLogs({
				address: ACCOUNT_KEYCHAIN_ADDRESS,
				event: parseAbiItem('event KeyRevoked(address indexed account, address indexed publicKey)'),
				args: { account: accountAddress },
				fromBlock,
				toBlock: 'latest',
			})

			// Build a map of keyId -> { expiry, revokedBlock }
			const keyMap = new Map<
				Address,
				{ expiry: bigint; authorizedBlock: bigint; revokedBlock?: bigint }
			>()

			for (const log of authorizedLogs) {
				const keyId = log.args.publicKey as Address
				const expiry = log.args.expiry as bigint
				keyMap.set(keyId, { expiry, authorizedBlock: log.blockNumber })
			}

			for (const log of revokedLogs) {
				const keyId = log.args.publicKey as Address
				const existing = keyMap.get(keyId)
				if (existing) {
					existing.revokedBlock = log.blockNumber
				} else {
					keyMap.set(keyId, { expiry: 0n, authorizedBlock: 0n, revokedBlock: log.blockNumber })
				}
			}

			// Filter to only revoked or expired keys
			const now = BigInt(Math.floor(Date.now() / 1000))
			const entries: KeyHistoryEntry[] = []

			for (const [keyId, data] of keyMap) {
				if (data.revokedBlock) {
					// Revoked key - use current time as approximate
					entries.push({
						keyId,
						status: 'revoked',
						timestamp: Math.floor(Date.now() / 1000),
					})
				} else if (data.expiry > 0n && data.expiry < now) {
					// Expired key
					entries.push({
						keyId,
						status: 'expired',
						timestamp: Number(data.expiry),
					})
				}
			}

			// Sort by timestamp descending (most recent first)
			entries.sort((a, b) => b.timestamp - a.timestamp)
			setHistory(entries)
			setHasFetched(true)
		} catch (e) {
			console.error('Failed to fetch key history:', e)
			setHistory([])
		} finally {
			setIsLoading(false)
		}
	}, [accountAddress])

	useEffect(() => {
		if (!hasFetched && accountAddress) {
			fetchHistory()
		}
	}, [hasFetched, accountAddress, fetchHistory])

	// Reset when account changes
	useEffect(() => {
		setHasFetched(false)
		setHistory([])
	}, [])

	return { history, isLoading, refetch: fetchHistory }
}
