import { type Address, type Hex, type PublicClient, createPublicClient, http } from 'viem'

/**
 * Minimal ABI for the TempoStreamChannel escrow contract.
 * Only includes the functions needed for server-side verification.
 */
const escrowAbi = [
	{
		type: 'function',
		name: 'getChannel',
		inputs: [{ name: 'channelId', type: 'bytes32' }],
		outputs: [
			{
				name: '',
				type: 'tuple',
				components: [
					{ name: 'payer', type: 'address' },
					{ name: 'payee', type: 'address' },
					{ name: 'token', type: 'address' },
					{ name: 'authorizedSigner', type: 'address' },
					{ name: 'deposit', type: 'uint128' },
					{ name: 'settled', type: 'uint128' },
					{ name: 'closeRequestedAt', type: 'uint64' },
					{ name: 'finalized', type: 'bool' },
				],
			},
		],
		stateMutability: 'view',
	},
] as const

/**
 * On-chain channel state from the escrow contract.
 */
export interface OnChainChannel {
	payer: Address
	payee: Address
	token: Address
	authorizedSigner: Address
	deposit: bigint
	settled: bigint
	closeRequestedAt: bigint
	finalized: boolean
}

// Module-level client cache by rpcUrl
const clientCache = new Map<string, PublicClient>()

/**
 * Get or create a cached public client for the given RPC URL.
 */
export function getChainClient(rpcUrl: string): PublicClient {
	let client = clientCache.get(rpcUrl)
	if (!client) {
		client = createPublicClient({ transport: http(rpcUrl) })
		clientCache.set(rpcUrl, client)
	}
	return client
}

/**
 * Read channel state from the escrow contract.
 */
export async function getOnChainChannel(
	rpcUrl: string,
	escrowContract: Address,
	channelId: Hex,
): Promise<OnChainChannel> {
	const client = getChainClient(rpcUrl)
	return client.readContract({
		address: escrowContract,
		abi: escrowAbi,
		functionName: 'getChannel',
		args: [channelId],
	}) as Promise<OnChainChannel>
}

/**
 * Verify a topUp transaction on-chain.
 *
 * Checks:
 * 1. Transaction receipt exists and succeeded
 * 2. Transaction was sent to the escrow contract
 * 3. Channel deposit increased compared to previously known deposit
 */
export async function verifyTopUpTransaction(
	rpcUrl: string,
	escrowContract: Address,
	channelId: Hex,
	txHash: Hex,
	previousDeposit: bigint,
): Promise<{ deposit: bigint }> {
	const client = getChainClient(rpcUrl)

	// Verify transaction receipt
	const receipt = await client.getTransactionReceipt({ hash: txHash })
	if (receipt.status !== 'success') {
		throw new Error('TopUp transaction failed on-chain')
	}

	// Verify transaction was to the escrow contract
	const tx = await client.getTransaction({ hash: txHash })
	if (tx.to?.toLowerCase() !== escrowContract.toLowerCase()) {
		throw new Error('Transaction not sent to escrow contract')
	}

	// Read current channel state to verify deposit increased
	const channel = await getOnChainChannel(rpcUrl, escrowContract, channelId)
	if (channel.deposit <= previousDeposit) {
		throw new Error('Channel deposit did not increase')
	}

	return { deposit: channel.deposit }
}
