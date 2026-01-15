import type { Address, Hex } from 'viem'

export type PaymentMethod = 'tempo' | 'x402' | (string & {})
export type PaymentIntent = 'charge' | 'authorize' | 'subscription' | (string & {})

export interface PaymentChallenge<TRequest = unknown> {
	id: string
	realm: string
	method: PaymentMethod
	intent: PaymentIntent
	request: TRequest
	expires?: string
	description?: string
}

export interface ChargeRequest {
	amount: string
	asset: Address
	destination: Address
	expires: string
	feePayer?: boolean
}

export interface AuthorizeRequest {
	asset: Address
	destination?: Address
	expires: string
	limit: string
	validFrom?: string
	feePayer?: boolean
}

export interface SubscriptionRequest {
	amount: string
	asset: Address
	expires: string
	period: string
	validFrom?: string
}

export type PayloadType = 'transaction' | 'keyAuthorization'

export interface PaymentPayload {
	type: PayloadType
	signature: Hex
}

export interface PaymentCredential {
	id: string
	source?: string
	payload: PaymentPayload
}

export interface PaymentReceipt {
	status: 'success' | 'failed'
	method: PaymentMethod
	timestamp: string
	reference: string
}

export interface PaymentError {
	error:
		| 'payment_required'
		| 'payment_insufficient'
		| 'payment_expired'
		| 'payment_verification_failed'
		| 'payment_method_unsupported'
		| 'malformed_proof'
	message: string
}
