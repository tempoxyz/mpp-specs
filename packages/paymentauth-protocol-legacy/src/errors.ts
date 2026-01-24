import type { PaymentError } from './types.js'

/**
 * Base class for Payment Auth errors.
 * Provides a consistent interface for creating error responses.
 */
export abstract class PaymentAuthError extends Error {
	abstract readonly code: PaymentError['error']

	constructor(message: string) {
		super(message)
		this.name = this.constructor.name
	}

	/**
	 * Convert to a PaymentError JSON object for HTTP responses.
	 */
	toJSON(): PaymentError {
		return {
			error: this.code,
			message: this.message,
		}
	}
}

/**
 * 402 Payment Required - No payment provided.
 */
export class PaymentRequiredError extends PaymentAuthError {
	readonly code = 'payment_required' as const

	constructor(message = 'Payment required') {
		super(message)
	}
}

/**
 * 402 Payment Required - Payment amount was insufficient.
 */
export class PaymentInsufficientError extends PaymentAuthError {
	readonly code = 'payment_insufficient' as const

	constructor(message = 'Payment amount insufficient') {
		super(message)
	}
}

/**
 * 402 Payment Required - Payment or challenge has expired.
 */
export class PaymentExpiredError extends PaymentAuthError {
	readonly code = 'payment_expired' as const

	constructor(message = 'Payment has expired') {
		super(message)
	}
}

/**
 * 401 Unauthorized - Payment verification failed.
 */
export class PaymentVerificationFailedError extends PaymentAuthError {
	readonly code = 'payment_verification_failed' as const

	constructor(message = 'Payment verification failed') {
		super(message)
	}
}

/**
 * 400 Bad Request - Payment method not supported.
 */
export class PaymentMethodUnsupportedError extends PaymentAuthError {
	readonly code = 'payment_method_unsupported' as const

	constructor(message = 'Payment method not supported') {
		super(message)
	}
}

/**
 * 400 Bad Request - Malformed payment proof/credential.
 */
export class MalformedProofError extends PaymentAuthError {
	readonly code = 'malformed_proof' as const

	constructor(message = 'Malformed payment proof') {
		super(message)
	}
}

/**
 * 503 Service Unavailable - Server cannot sponsor fees.
 */
export class FeeUnavailableError extends PaymentAuthError {
	readonly code = 'fee_unavailable' as const
	readonly retryAfter?: number

	constructor(message = 'Server fee balance insufficient', retryAfter?: number) {
		super(message)
		this.retryAfter = retryAfter
	}

	override toJSON(): PaymentError {
		return {
			error: this.code,
			message: this.message,
			...(this.retryAfter !== undefined && { retry_after: this.retryAfter }),
		}
	}
}

/**
 * 400 Bad Request - Fee token not whitelisted.
 */
export class FeeTokenRejectedError extends PaymentAuthError {
	readonly code = 'fee_token_rejected' as const

	constructor(message = 'Fee token is not whitelisted') {
		super(message)
	}
}

/**
 * 400 Bad Request - Fee would exceed configured caps.
 */
export class FeeLimitExceededError extends PaymentAuthError {
	readonly code = 'fee_limit_exceeded' as const

	constructor(message = 'Fee would exceed configured limits') {
		super(message)
	}
}

/**
 * 400 Bad Request - AMM slippage exceeds threshold.
 */
export class FeeSlippageExceededError extends PaymentAuthError {
	readonly code = 'fee_slippage_exceeded' as const

	constructor(message = 'AMM slippage exceeds threshold') {
		super(message)
	}
}

/**
 * 429 Too Many Requests - Rate limit exceeded for fee sponsorship.
 */
export class FeePayerOverloadedError extends PaymentAuthError {
	readonly code = 'fee_payer_overloaded' as const
	readonly retryAfter?: number

	constructor(message = 'Fee sponsorship rate limit exceeded', retryAfter?: number) {
		super(message)
		this.retryAfter = retryAfter
	}

	override toJSON(): PaymentError {
		return {
			error: this.code,
			message: this.message,
			...(this.retryAfter !== undefined && { retry_after: this.retryAfter }),
		}
	}
}
