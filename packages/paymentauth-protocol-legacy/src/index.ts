// Types

export type { FeePaymentValidationResult } from './credential-validation.js'
// Credential validation
export {
	FEE_PAYER_SIGNATURE_PLACEHOLDER,
	VALID_FEE_TOKEN_PLACEHOLDERS,
	validateFeePaymentFields,
	validateSignatureDomain,
} from './credential-validation.js'

// Encoding utilities
export {
	base64urlDecode,
	base64urlEncode,
	formatAuthorization,
	formatReceipt,
	formatWwwAuthenticate,
	generateChallengeId,
} from './encode.js'
// Error classes
export {
	FeeLimitExceededError,
	FeePayerOverloadedError,
	FeeSlippageExceededError,
	FeeTokenRejectedError,
	FeeUnavailableError,
	MalformedProofError,
	PaymentAuthError,
	PaymentExpiredError,
	PaymentInsufficientError,
	PaymentMethodUnsupportedError,
	PaymentRequiredError,
	PaymentVerificationFailedError,
} from './errors.js'
export type {
	FeeTokenConfig,
	FeeValidationConfig,
	FeeValidationResult,
} from './fee-validation.js'
// Fee validation utilities
export {
	DEFAULT_FEE_VALIDATION_CONFIG,
	MODERATO_FEE_TOKENS,
	validateFeeToken,
	validateSlippage,
} from './fee-validation.js'
// Parsing utilities
export {
	parseAuthorization,
	parseReceipt,
	parseWwwAuthenticate,
} from './parse.js'
export type {
	AuthorizeRequest,
	ChargeRequest,
	PayloadType,
	PaymentChallenge,
	PaymentCredential,
	PaymentError,
	PaymentIntent,
	PaymentMethod,
	PaymentPayload,
	PaymentReceipt,
	SubscriptionRequest,
} from './types.js'
