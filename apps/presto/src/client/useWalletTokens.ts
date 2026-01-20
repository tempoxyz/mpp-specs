import { useCallback, useEffect, useState } from 'react'
import { type Address, createPublicClient, http } from 'viem'
import { tempoModerato } from 'viem/chains'
import { Abis } from 'viem/tempo'

/** TIP-20 token info with balance */
export interface WalletToken {
	address: Address
	symbol: string
	name: string
	decimals: number
	balance: bigint
}

/** Well-known TIP-20 token addresses on Tempo */
const TIP20_TOKENS: Address[] = [
	'0x20c0000000000000000000000000000000000001', // AlphaUSD
	'0x20c0000000000000000000000000000000000002', // USDC
	'0x20c0000000000000000000000000000000000003', // USDT
	'0x20c0000000000000000000000000000000000000', // pathUSD
]

const publicClient = createPublicClient({
	chain: tempoModerato,
	transport: http('https://rpc.moderato.tempo.xyz'),
})

/** Fetch token metadata (name, symbol, decimals) via RPC */
async function fetchTokenMetadata(
	tokenAddress: Address,
): Promise<{ name: string; symbol: string; decimals: number } | null> {
	try {
		const [name, symbol, decimals] = await Promise.all([
			publicClient.readContract({
				address: tokenAddress,
				abi: Abis.tip20,
				functionName: 'name',
			}),
			publicClient.readContract({
				address: tokenAddress,
				abi: Abis.tip20,
				functionName: 'symbol',
			}),
			publicClient.readContract({
				address: tokenAddress,
				abi: Abis.tip20,
				functionName: 'decimals',
			}),
		])
		return { name, symbol, decimals }
	} catch (e) {
		console.error(`Failed to fetch metadata for ${tokenAddress}:`, e)
		return null
	}
}

/** Fetch balance for a token */
async function fetchTokenBalance(tokenAddress: Address, walletAddress: Address): Promise<bigint> {
	try {
		const balance = await publicClient.readContract({
			address: tokenAddress,
			abi: Abis.tip20,
			functionName: 'balanceOf',
			args: [walletAddress],
		})
		return balance
	} catch (e) {
		console.error(`Failed to fetch balance for ${tokenAddress}:`, e)
		return 0n
	}
}

/**
 * Hook to fetch wallet's TIP-20 token balances
 * Returns only tokens with non-zero balances
 */
export function useWalletTokens(walletAddress: Address | null) {
	const [tokens, setTokens] = useState<WalletToken[]>([])
	const [isLoading, setIsLoading] = useState(false)
	const [error, setError] = useState<string | null>(null)

	const fetchTokens = useCallback(async () => {
		if (!walletAddress) {
			setTokens([])
			return
		}

		setIsLoading(true)
		setError(null)

		try {
			// Fetch balances and metadata for all known tokens in parallel
			const tokenResults = await Promise.all(
				TIP20_TOKENS.map(async (tokenAddress) => {
					const [metadata, balance] = await Promise.all([
						fetchTokenMetadata(tokenAddress),
						fetchTokenBalance(tokenAddress, walletAddress),
					])

					if (!metadata) return null

					return {
						address: tokenAddress,
						symbol: metadata.symbol,
						name: metadata.name,
						decimals: metadata.decimals,
						balance,
					}
				}),
			)

			// Filter to only tokens with non-zero balance
			const tokensWithBalance = tokenResults.filter(
				(t): t is WalletToken => t !== null && t.balance > 0n,
			)

			setTokens(tokensWithBalance)
		} catch (e) {
			console.error('Failed to fetch wallet tokens:', e)
			setError(e instanceof Error ? e.message : 'Failed to fetch tokens')
		} finally {
			setIsLoading(false)
		}
	}, [walletAddress])

	useEffect(() => {
		fetchTokens()
	}, [fetchTokens])

	return {
		tokens,
		isLoading,
		error,
		refetch: fetchTokens,
	}
}
