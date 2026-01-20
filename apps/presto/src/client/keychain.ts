/**
 * On-chain AccountKeychain utilities
 * For verifying key info and token limits via RPC
 */

import { type Address, createPublicClient, http } from 'viem'
import { tempoModerato } from 'viem/chains'
import { ACCOUNT_KEYCHAIN_ADDRESS, accountKeychainAbi, type KeyInfo } from './accountKeychain'

const DEFAULT_RPC_URL = 'https://rpc.moderato.tempo.xyz'

/** Create a public client for RPC calls */
function getPublicClient(rpcUrl = DEFAULT_RPC_URL) {
	return createPublicClient({
		chain: tempoModerato,
		transport: http(rpcUrl),
	})
}

/**
 * Fetch key info from on-chain AccountKeychain contract
 * Returns null if key doesn't exist or is not found
 */
export async function fetchKeyInfo(
	accountAddress: Address,
	keyId: Address,
	rpcUrl?: string,
): Promise<KeyInfo | null> {
	const client = getPublicClient(rpcUrl)

	try {
		const keyInfo = await client.readContract({
			address: ACCOUNT_KEYCHAIN_ADDRESS,
			abi: accountKeychainAbi,
			functionName: 'getKey',
			args: [accountAddress, keyId],
		})

		// Check if key exists (keyId will be zero address if not found)
		if (keyInfo.keyId === '0x0000000000000000000000000000000000000000') {
			return null
		}

		return keyInfo
	} catch (e) {
		console.error('Failed to fetch key info:', e)
		return null
	}
}

/**
 * Fetch remaining spending limit for a key and token from on-chain
 */
export async function fetchRemainingLimit(
	accountAddress: Address,
	keyId: Address,
	tokenAddress: Address,
	rpcUrl?: string,
): Promise<bigint> {
	const client = getPublicClient(rpcUrl)

	try {
		const remaining = await client.readContract({
			address: ACCOUNT_KEYCHAIN_ADDRESS,
			abi: accountKeychainAbi,
			functionName: 'getRemainingLimit',
			args: [accountAddress, keyId, tokenAddress],
		})
		return remaining
	} catch (e) {
		console.error('Failed to fetch remaining limit:', e)
		return 0n
	}
}

/** Token limit info from on-chain */
export interface OnChainTokenLimitInfo {
	token: Address
	remaining: bigint
}

/**
 * Fetch remaining limits for multiple tokens in parallel
 */
export async function fetchRemainingLimits(
	accountAddress: Address,
	keyId: Address,
	tokenAddresses: Address[],
	rpcUrl?: string,
): Promise<OnChainTokenLimitInfo[]> {
	const results = await Promise.all(
		tokenAddresses.map(async (token) => {
			const remaining = await fetchRemainingLimit(accountAddress, keyId, token, rpcUrl)
			return { token, remaining }
		}),
	)
	return results
}

/** Full on-chain key verification result */
export interface KeyVerificationResult {
	exists: boolean
	isRevoked: boolean
	isExpired: boolean
	expiry: bigint
	enforceLimits: boolean
	tokenLimits: OnChainTokenLimitInfo[]
}

/**
 * Verify a key exists and get its current status from on-chain
 * Useful for CLI to verify a stored key is still valid
 */
export async function verifyKeyOnChain(
	accountAddress: Address,
	keyId: Address,
	tokenAddresses: Address[],
	rpcUrl?: string,
): Promise<KeyVerificationResult> {
	const keyInfo = await fetchKeyInfo(accountAddress, keyId, rpcUrl)

	if (!keyInfo) {
		return {
			exists: false,
			isRevoked: false,
			isExpired: false,
			expiry: 0n,
			enforceLimits: false,
			tokenLimits: [],
		}
	}

	const now = BigInt(Math.floor(Date.now() / 1000))
	const isExpired = keyInfo.expiry < now

	const tokenLimits = await fetchRemainingLimits(accountAddress, keyId, tokenAddresses, rpcUrl)

	return {
		exists: true,
		isRevoked: keyInfo.isRevoked,
		isExpired,
		expiry: keyInfo.expiry,
		enforceLimits: keyInfo.enforceLimits,
		tokenLimits,
	}
}
