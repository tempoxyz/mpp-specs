import type { PaymentError } from './types.js'

export abstract class PaymentAuthError extends Error {
	abstract readonly code: PaymentError['error']

	constructor(message: string) {
		super(message)
		this.name = this.constructor.name
	}

	toJSON(): PaymentError {
		return {
			error: this.code,
			message: this.message,
		}
	}
}

export class PaymentRequiredError extends PaymentAuthError {
	readonly code = 'payment_required' as const

	constructor(message = 'Payment required') {
		super(message)
	}
}

export class PaymentInsufficientError extends PaymentAuthError {
	readonly code = 'payment_insufficient' as const

	constructor(message = 'Payment amount insufficient') {
		super(message)
	}
}

export class PaymentExpiredError extends PaymentAuthError {
	readonly code = 'payment_expired' as const

	constructor(message = 'Payment has expired') {
		super(message)
	}
}

export class PaymentVerificationFailedError extends PaymentAuthError {
	readonly code = 'payment_verification_failed' as const

	constructor(message = 'Payment verification failed') {
		super(message)
	}
}

export class PaymentMethodUnsupportedError extends PaymentAuthError {
	readonly code = 'payment_method_unsupported' as const

	constructor(message = 'Payment method not supported') {
		super(message)
	}
}

export class MalformedProofError extends PaymentAuthError {
	readonly code = 'malformed_proof' as const

	constructor(message = 'Malformed payment proof') {
		super(message)
	}
}
