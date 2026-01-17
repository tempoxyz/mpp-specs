import type { Address } from 'viem'

/**
 * Token addresses for payment assets.
 */
export const TOKENS = {
	/** AlphaUSD on Tempo Moderato (testnet) */
	ALPHA_USD: '0x20c0000000000000000000000000000000000001' as Address,
	/** USDC on Base */
	USDC_BASE: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as Address,
} as const

/**
 * Wallet addresses for receiving payments.
 */
export const WALLETS = {
	/** Test receiver wallet for development/testnet */
	TEST_RECEIVER: '0x0aA342d6e4e45D1F6eAE721c4fEf2f61B82f8581' as Address,
} as const

/**
 * Common price points in base units (6 decimals).
 *
 * Examples:
 * - $0.01 = 10000
 * - $0.10 = 100000
 * - $1.00 = 1000000
 */
export const PRICES = {
	/** $0.01 */
	CENT_1: '10000',
	/** $0.02 */
	CENT_2: '20000',
	/** $0.03 */
	CENT_3: '30000',
	/** $0.05 */
	CENT_5: '50000',
	/** $0.10 */
	CENT_10: '100000',
	/** $0.12 */
	CENT_12: '120000',
} as const

/**
 * Contract addresses for streaming payment channels.
 */
export const CONTRACTS = {
	/** TempoStreamChannel escrow contract on Moderato (testnet) */
	STREAM_ESCROW_MODERATO: '0x0000000000000000000000000000000000000000' as Address, // TODO: Deploy and update
} as const

/**
 * Default streaming channel configuration.
 */
export const STREAMING_DEFAULTS = {
	/** Default deposit: $10 */
	DEFAULT_DEPOSIT: '10000000',
	/** Default expiry: 1 hour */
	DEFAULT_EXPIRY_SECONDS: 3600,
	/** Minimum voucher delta: $0.001 */
	MIN_VOUCHER_DELTA: '1000',
} as const
