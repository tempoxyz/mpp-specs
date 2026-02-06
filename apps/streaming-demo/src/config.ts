import type { Address } from 'viem'

/**
 * Environment bindings for Cloudflare Worker.
 */
export interface Env {
	// RPC
	TEMPO_RPC_URL: string

	// Contract addresses
	ESCROW_CONTRACT: string
	CHAIN_ID: string
	ALPHA_USD: string

	// Pricing
	PRICE_PER_TOKEN: string
	MIN_VOUCHER_DELTA: string

	// Server config
	DESTINATION_ADDRESS?: string
	CHALLENGE_SECRET: string

	// Optional Cloudflare bindings
	CHANNELS_DO?: DurableObjectNamespace
	DB?: D1Database
}

/**
 * Parsed configuration from environment.
 */
export interface Config {
	rpcUrl: string
	escrowContract: Address
	chainId: number
	alphaUsd: Address
	pricePerToken: bigint
	minVoucherDelta: bigint
	destinationAddress: Address
	challengeSecret: string
	realm: string
}

/**
 * Parse environment variables into typed config.
 * The realm is typically set from the request Host header, so it's passed separately.
 */
export function parseConfig(env: Env, realm?: string): Config {
	return {
		rpcUrl: env.TEMPO_RPC_URL,
		escrowContract: env.ESCROW_CONTRACT as Address,
		chainId: Number.parseInt(env.CHAIN_ID, 10),
		alphaUsd: env.ALPHA_USD as Address,
		pricePerToken: BigInt(env.PRICE_PER_TOKEN),
		minVoucherDelta: BigInt(env.MIN_VOUCHER_DELTA),
		destinationAddress: (env.DESTINATION_ADDRESS ??
			'0x0000000000000000000000000000000000000000') as Address,
		challengeSecret: env.CHALLENGE_SECRET,
		realm: realm ?? 'streaming-demo',
	}
}

/**
 * Tempo Moderato testnet chain definition.
 */
export const tempoModerato = {
	id: 42431,
	name: 'Tempo Moderato',
	nativeCurrency: {
		decimals: 18,
		name: 'Tempo',
		symbol: 'TEMPO',
	},
	rpcUrls: {
		default: {
			http: ['https://rpc.moderato.tempo.xyz'],
		},
	},
	blockExplorers: {
		default: {
			name: 'Tempo Explorer',
			url: 'https://explore.testnet.tempo.xyz',
		},
	},
} as const
