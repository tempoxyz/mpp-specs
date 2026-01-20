import { useCallback, useEffect, useRef, useState } from 'react'
import type { Address, Hex } from 'viem'
import { createPublicClient, http } from 'viem'
import { tempoModerato } from 'viem/chains'

const publicClient = createPublicClient({
	chain: tempoModerato,
	transport: http('https://rpc.moderato.tempo.xyz'),
})

interface UseOnchainActivityOptions {
	address: Address | null
	txHash?: Hex | null
}

interface UseOnchainActivityResult {
	hasOnchainTx: boolean | null
	isChecking: boolean
	refetch: () => Promise<void>
}

export function useOnchainActivity({
	address,
	txHash,
}: UseOnchainActivityOptions): UseOnchainActivityResult {
	const [hasOnchainTx, setHasOnchainTx] = useState<boolean | null>(null)
	const [isChecking, setIsChecking] = useState(false)
	const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

	const checkTxCount = useCallback(async () => {
		if (!address) {
			setHasOnchainTx(null)
			return
		}

		setIsChecking(true)
		try {
			const count = await publicClient.getTransactionCount({
				address,
				blockTag: 'latest',
			})
			setHasOnchainTx(count > 0)
		} catch (err) {
			console.error('Failed to check tx count:', err)
		} finally {
			setIsChecking(false)
		}
	}, [address])

	const refetch = useCallback(async () => {
		await checkTxCount()
	}, [checkTxCount])

	useEffect(() => {
		if (address) {
			checkTxCount()
		} else {
			setHasOnchainTx(null)
		}
	}, [address, checkTxCount])

	useEffect(() => {
		if (!txHash || !address) return

		const waitForReceipt = async () => {
			try {
				await publicClient.waitForTransactionReceipt({ hash: txHash })
				await checkTxCount()
			} catch (err) {
				console.error('Failed to wait for tx receipt:', err)
			}
		}

		waitForReceipt()
	}, [txHash, address, checkTxCount])

	useEffect(() => {
		if (pollIntervalRef.current) {
			clearInterval(pollIntervalRef.current)
			pollIntervalRef.current = null
		}

		if (address && hasOnchainTx === false) {
			pollIntervalRef.current = setInterval(() => {
				checkTxCount()
			}, 30_000)
		}

		return () => {
			if (pollIntervalRef.current) {
				clearInterval(pollIntervalRef.current)
				pollIntervalRef.current = null
			}
		}
	}, [address, hasOnchainTx, checkTxCount])

	return {
		hasOnchainTx,
		isChecking,
		refetch,
	}
}
