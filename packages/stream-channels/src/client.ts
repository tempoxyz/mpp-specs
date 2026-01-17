import {
	type Account,
	type Address,
	type Chain,
	encodeFunctionData,
	type Hex,
	type PublicClient,
	type WalletClient,
} from 'viem'
import { TempoStreamChannelABI } from './abi.js'
import type { Channel, OpenChannelParams, SignedVoucher, StreamRequest } from './types.js'
import { createVoucherTypedData, getVoucherDomain, voucherTypes } from './voucher.js'

/**
 * Client for interacting with streaming payment channels.
 */
export class StreamChannelClient {
	constructor(
		private publicClient: PublicClient,
		private walletClient: WalletClient,
		private account: Account | Address,
		private chain: Chain,
	) {}

	/**
	 * Get the chain ID from the client.
	 */
	async getChainId(): Promise<number> {
		return this.publicClient.getChainId()
	}

	/**
	 * Compute a channel ID for given parameters.
	 */
	async computeChannelId(escrowContract: Address, params: OpenChannelParams): Promise<Hex> {
		const payer = typeof this.account === 'string' ? this.account : this.account.address
		return this.publicClient.readContract({
			address: escrowContract,
			abi: TempoStreamChannelABI,
			functionName: 'computeChannelId',
			args: [payer, params.payee, params.token, params.deposit, params.expiry, params.salt],
		})
	}

	/**
	 * Open a new payment channel.
	 */
	async openChannel(
		escrowContract: Address,
		params: OpenChannelParams,
	): Promise<{ channelId: Hex; txHash: Hex }> {
		const _payer = typeof this.account === 'string' ? this.account : this.account.address

		// First approve the escrow contract to spend tokens
		const approveData = encodeFunctionData({
			abi: [
				{
					type: 'function',
					name: 'approve',
					inputs: [
						{ name: 'spender', type: 'address' },
						{ name: 'amount', type: 'uint256' },
					],
					outputs: [{ name: '', type: 'bool' }],
				},
			],
			functionName: 'approve',
			args: [escrowContract, params.deposit],
		})

		const approveTxHash = await this.walletClient.sendTransaction({
			account: this.account,
			chain: this.chain,
			to: params.token,
			data: approveData,
		})

		await this.publicClient.waitForTransactionReceipt({ hash: approveTxHash })

		// Compute channel ID
		const channelId = await this.computeChannelId(escrowContract, params)

		// Open the channel
		const openData = encodeFunctionData({
			abi: TempoStreamChannelABI,
			functionName: 'open',
			args: [params.payee, params.token, params.deposit, params.expiry, params.salt],
		})

		const txHash = await this.walletClient.sendTransaction({
			account: this.account,
			chain: this.chain,
			to: escrowContract,
			data: openData,
		})

		await this.publicClient.waitForTransactionReceipt({ hash: txHash })

		return { channelId, txHash }
	}

	/**
	 * Open a channel from a stream request (from 402 challenge).
	 */
	async openChannelFromRequest(request: StreamRequest): Promise<{ channelId: Hex; txHash: Hex }> {
		if (!request.salt) {
			throw new Error('Stream request must include salt for new channel')
		}

		const expiry = BigInt(Math.floor(new Date(request.expires).getTime() / 1000))

		return this.openChannel(request.escrowContract, {
			payee: request.destination,
			token: request.asset,
			deposit: BigInt(request.deposit),
			expiry,
			salt: request.salt,
		})
	}

	/**
	 * Get channel state from the contract.
	 */
	async getChannel(escrowContract: Address, channelId: Hex): Promise<Channel> {
		const result = await this.publicClient.readContract({
			address: escrowContract,
			abi: TempoStreamChannelABI,
			functionName: 'getChannel',
			args: [channelId],
		})

		return {
			payer: result.payer,
			payee: result.payee,
			token: result.token,
			deposit: result.deposit,
			settled: result.settled,
			expiry: result.expiry,
			closeRequestedAt: result.closeRequestedAt,
			finalized: result.finalized,
		}
	}

	/**
	 * Sign a voucher for a given cumulative amount.
	 */
	async signVoucher(
		escrowContract: Address,
		channelId: Hex,
		cumulativeAmount: bigint,
		validUntil: bigint,
	): Promise<SignedVoucher> {
		const chainId = await this.getChainId()

		const signature = await this.walletClient.signTypedData({
			account: this.account,
			domain: getVoucherDomain(escrowContract, chainId),
			types: voucherTypes,
			primaryType: 'Voucher',
			message: {
				channelId,
				cumulativeAmount,
				validUntil,
			},
		})

		return {
			channelId,
			cumulativeAmount,
			validUntil,
			signature,
		}
	}

	/**
	 * Create a signed voucher with typed data for transmission.
	 */
	async createVoucherCredential(
		escrowContract: Address,
		channelId: Hex,
		cumulativeAmount: bigint,
		validUntil: bigint,
	) {
		const chainId = await this.getChainId()
		const voucher = await this.signVoucher(escrowContract, channelId, cumulativeAmount, validUntil)
		const typedData = createVoucherTypedData(escrowContract, chainId, {
			channelId,
			cumulativeAmount,
			validUntil,
		})

		return {
			voucher,
			typedData,
		}
	}

	/**
	 * Top up a channel with more funds and/or extend expiry.
	 */
	async topUp(
		escrowContract: Address,
		channelId: Hex,
		additionalDeposit: bigint,
		newExpiry: bigint,
	): Promise<Hex> {
		// Approve additional deposit if needed
		if (additionalDeposit > 0n) {
			const channel = await this.getChannel(escrowContract, channelId)
			const approveData = encodeFunctionData({
				abi: [
					{
						type: 'function',
						name: 'approve',
						inputs: [
							{ name: 'spender', type: 'address' },
							{ name: 'amount', type: 'uint256' },
						],
						outputs: [{ name: '', type: 'bool' }],
					},
				],
				functionName: 'approve',
				args: [escrowContract, additionalDeposit],
			})

			const approveTxHash = await this.walletClient.sendTransaction({
				account: this.account,
				chain: this.chain,
				to: channel.token,
				data: approveData,
			})

			await this.publicClient.waitForTransactionReceipt({ hash: approveTxHash })
		}

		const data = encodeFunctionData({
			abi: TempoStreamChannelABI,
			functionName: 'topUp',
			args: [channelId, additionalDeposit, newExpiry],
		})

		const txHash = await this.walletClient.sendTransaction({
			account: this.account,
			chain: this.chain,
			to: escrowContract,
			data,
		})

		await this.publicClient.waitForTransactionReceipt({ hash: txHash })
		return txHash
	}

	/**
	 * Request early channel closure.
	 */
	async requestClose(escrowContract: Address, channelId: Hex): Promise<Hex> {
		const data = encodeFunctionData({
			abi: TempoStreamChannelABI,
			functionName: 'requestClose',
			args: [channelId],
		})

		const txHash = await this.walletClient.sendTransaction({
			account: this.account,
			chain: this.chain,
			to: escrowContract,
			data,
		})

		await this.publicClient.waitForTransactionReceipt({ hash: txHash })
		return txHash
	}

	/**
	 * Withdraw remaining funds after expiry.
	 */
	async withdraw(escrowContract: Address, channelId: Hex): Promise<Hex> {
		const data = encodeFunctionData({
			abi: TempoStreamChannelABI,
			functionName: 'withdraw',
			args: [channelId],
		})

		const txHash = await this.walletClient.sendTransaction({
			account: this.account,
			chain: this.chain,
			to: escrowContract,
			data,
		})

		await this.publicClient.waitForTransactionReceipt({ hash: txHash })
		return txHash
	}
}

/**
 * Create a stream channel client.
 */
export function createStreamChannelClient(
	publicClient: PublicClient,
	walletClient: WalletClient,
	account: Account | Address,
	chain: Chain,
): StreamChannelClient {
	return new StreamChannelClient(publicClient, walletClient, account, chain)
}
