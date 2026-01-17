import type { Address } from 'viem'
import { isAddressEqual } from 'viem'

/**
 * Fee token whitelist configuration.
 * @see draft-tempo-payment-method-00 §9.1.6
 */
export interface FeeTokenConfig {
	/** Token address */
	address: Address
	/** Human-readable name */
	name: string
	/** Minimum AMM TVL required (USD) */
	minTvl?: number
}

/**
 * Fee validation configuration.
 */
export interface FeeValidationConfig {
	/** Whitelisted fee tokens */
	whitelist: FeeTokenConfig[]
	/** Maximum fee as percentage of payment amount (default: 0.01 = 1%) */
	maxFeePercentage?: number
	/** Maximum absolute fee in base units (default: 1000000 = $1.00 with 6 decimals) */
	maxAbsoluteFee?: bigint
	/** Maximum AMM slippage allowed (default: 0.005 = 0.5%) */
	maxSlippage?: number
}

/**
 * Default fee token whitelist for Tempo Moderato (testnet).
 */
export const MODERATO_FEE_TOKENS: FeeTokenConfig[] = [
	{
		address: '0x20c0000000000000000000000000000000000001',
		name: 'alphaUSD',
		minTvl: 100_000,
	},
]

/**
 * Default fee validation configuration.
 */
export const DEFAULT_FEE_VALIDATION_CONFIG: FeeValidationConfig = {
	whitelist: MODERATO_FEE_TOKENS,
	maxFeePercentage: 0.01, // 1%
	maxAbsoluteFee: 1_000_000n, // $1.00 with 6 decimals
	maxSlippage: 0.005, // 0.5%
}

/**
 * Result of fee token validation.
 */
export interface FeeValidationResult {
	valid: boolean
	error?: 'fee_token_rejected' | 'fee_limit_exceeded' | 'fee_slippage_exceeded'
	message?: string
}

/**
 * Validate a fee token against the whitelist and configuration.
 * @param feeToken - The fee token address to validate
 * @param paymentAmount - The payment amount in base units
 * @param estimatedFee - The estimated fee in base units
 * @param config - Fee validation configuration
 */
export function validateFeeToken(
	feeToken: Address,
	paymentAmount: bigint,
	estimatedFee: bigint,
	config: FeeValidationConfig = DEFAULT_FEE_VALIDATION_CONFIG,
): FeeValidationResult {
	// Check whitelist
	const isWhitelisted = config.whitelist.some((t) => isAddressEqual(t.address, feeToken))
	if (!isWhitelisted) {
		return {
			valid: false,
			error: 'fee_token_rejected',
			message: `Fee token ${feeToken} is not in approved whitelist`,
		}
	}

	// Check absolute fee cap
	const maxAbsolute = config.maxAbsoluteFee ?? 1_000_000n
	if (estimatedFee > maxAbsolute) {
		return {
			valid: false,
			error: 'fee_limit_exceeded',
			message: `Fee ${estimatedFee} exceeds maximum absolute fee ${maxAbsolute}`,
		}
	}

	// Check percentage fee cap
	const maxPercentage = config.maxFeePercentage ?? 0.01
	if (paymentAmount > 0n) {
		const feePercentage = Number(estimatedFee) / Number(paymentAmount)
		if (feePercentage > maxPercentage) {
			return {
				valid: false,
				error: 'fee_limit_exceeded',
				message: `Fee ${(feePercentage * 100).toFixed(2)}% exceeds maximum ${(maxPercentage * 100).toFixed(2)}%`,
			}
		}
	}

	return { valid: true }
}

/**
 * Check if slippage is within acceptable bounds.
 * @param expectedAmount - Expected output amount
 * @param actualAmount - Actual output amount
 * @param maxSlippage - Maximum allowed slippage (default: 0.5%)
 */
export function validateSlippage(
	expectedAmount: bigint,
	actualAmount: bigint,
	maxSlippage = 0.005,
): FeeValidationResult {
	if (expectedAmount === 0n) {
		return { valid: true }
	}

	const slippage = Number(expectedAmount - actualAmount) / Number(expectedAmount)
	if (slippage > maxSlippage) {
		return {
			valid: false,
			error: 'fee_slippage_exceeded',
			message: `Slippage ${(slippage * 100).toFixed(2)}% exceeds maximum ${(maxSlippage * 100).toFixed(2)}%`,
		}
	}

	return { valid: true }
}
