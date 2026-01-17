import type { Address, Hex } from 'viem'

/**
 * Fee payment field validation result.
 * @see draft-tempo-payment-method-00 §8.3
 */
export interface FeePaymentValidationResult {
	valid: boolean
	error?: string
}

/**
 * Placeholder value for fee_payer_signature when server will sponsor fees.
 * Per spec §8.3: must be exactly "0x00" (single zero byte, hex-encoded)
 */
export const FEE_PAYER_SIGNATURE_PLACEHOLDER = '0x00' as Hex

/**
 * Valid values for fee_token when server will sponsor fees.
 * Per spec §8.3: missing, RLP null (0x80), or zero address
 */
export const VALID_FEE_TOKEN_PLACEHOLDERS: readonly (Hex | Address | undefined)[] = [
	undefined,
	'0x80', // RLP null
	'0x0000000000000000000000000000000000000000', // zero address
] as const

/**
 * Validate fee payment fields for feePayer=true credentials.
 *
 * Per spec §8.3:
 * - fee_payer_signature MUST be exactly "0x00"
 * - fee_token MUST be missing, RLP null (0x80), or zero address
 *
 * @param feePayerSignature - The fee_payer_signature field from the transaction
 * @param feeToken - The fee_token field from the transaction
 * @param feePayer - Whether server is expected to pay fees
 */
export function validateFeePaymentFields(
	feePayerSignature: Hex | undefined,
	feeToken: Hex | Address | undefined,
	feePayer: boolean,
): FeePaymentValidationResult {
	if (feePayer) {
		// For feePayer=true, validate placeholder values

		// fee_payer_signature must be exactly 0x00
		if (feePayerSignature !== FEE_PAYER_SIGNATURE_PLACEHOLDER) {
			// Check for potential signature tampering
			if (feePayerSignature && feePayerSignature.length > 4) {
				return {
					valid: false,
					error:
						'Credential rejected: fee_payer_signature contains a signature (potential tampering)',
				}
			}
			return {
				valid: false,
				error: `fee_payer_signature must be "${FEE_PAYER_SIGNATURE_PLACEHOLDER}" for feePayer=true, got: ${feePayerSignature}`,
			}
		}

		// fee_token must be placeholder value
		if (feeToken !== undefined && !isValidFeeTokenPlaceholder(feeToken)) {
			return {
				valid: false,
				error: `fee_token must be empty or zero address for feePayer=true, got: ${feeToken}`,
			}
		}

		return { valid: true }
	} else {
		// For feePayer=false, fee_token must be a valid address
		if (!feeToken || isValidFeeTokenPlaceholder(feeToken)) {
			return {
				valid: false,
				error: 'fee_token must be a valid TIP-20 address when feePayer=false',
			}
		}

		return { valid: true }
	}
}

/**
 * Check if a fee token value is a valid placeholder (empty/null/zero).
 */
function isValidFeeTokenPlaceholder(feeToken: Hex | Address | undefined): boolean {
	if (feeToken === undefined) return true

	const normalized = feeToken.toLowerCase()
	return (
		normalized === '0x80' ||
		normalized === '0x0000000000000000000000000000000000000000' ||
		normalized === '0x'
	)
}

/**
 * Validate that signature domain matches expected value.
 * For client signatures in fee-sponsored transactions, must use domain 0x76.
 *
 * @param signedTx - The signed transaction hex
 * @param expectedDomain - Expected domain (default: 0x76 for client)
 */
export function validateSignatureDomain(
	signedTx: Hex,
	expectedDomain: Hex = '0x76',
): FeePaymentValidationResult {
	// Tempo transactions start with the type byte
	if (!signedTx.startsWith(expectedDomain)) {
		return {
			valid: false,
			error: `Transaction signature domain must be ${expectedDomain}`,
		}
	}

	return { valid: true }
}
