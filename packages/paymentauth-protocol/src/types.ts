import type { Address, Hex } from 'viem'

/**
 * Payment method identifier.
 * @see https://github.com/tempoxyz/payment-auth-spec/blob/main/specs/core/draft-core-protocol-00.md
 */
export type PaymentMethod = 'tempo' | 'stripe' | 'invoice' | (string & {})

/**
 * Payment intent type.
 * @see https://github.com/tempoxyz/payment-auth-spec/blob/main/specs/intents/
 */
export type PaymentIntent = 'charge' | 'authorize' | 'subscription' | 'stream' | (string & {})

/**
 * Payment challenge sent in WWW-Authenticate header.
 *
 * Format: Payment id="...", realm="...", method="...", intent="...", request="<base64url>"
 *
 * @see https://github.com/tempoxyz/payment-auth-spec/blob/main/specs/core/draft-core-protocol-00.md#51-www-authenticate-challenge
 */
export interface PaymentChallenge<TRequest = unknown> {
	/** Unique identifier for this payment challenge (128+ bits entropy) */
	id: string
	/** Protection space identifier (e.g., domain name) */
	realm: string
	/** Payment method identifier */
	method: PaymentMethod
	/** Payment intent type */
	intent: PaymentIntent
	/** Payment request (decoded from base64url JSON) */
	request: TRequest
	/** Optional expiry timestamp (ISO 8601 / RFC 3339) */
	expires?: string
	/** Optional human-readable description (display only, not for verification) */
	description?: string
	/** Optional content digest for POST/PUT/PATCH requests (RFC 9530) */
	digest?: string
}

/**
 * Method-specific details for Tempo payments.
 * @see https://github.com/tempoxyz/payment-auth-spec/blob/main/specs/methods/tempo/
 */
export interface TempoMethodDetails {
	/** Chain ID for the Tempo network */
	chainId: number
	/** If true, server will pay transaction fees */
	feePayer?: boolean
}

/**
 * Charge request for intent="charge".
 * @see https://github.com/tempoxyz/payment-auth-spec/blob/main/specs/intents/draft-charge-intent-00.md
 */
export interface ChargeRequest {
	/** Amount in base units (stringified number, e.g., "1000000" = 1.00 with 6 decimals) */
	amount: string
	/** Currency identifier (ISO 4217 code or token address) */
	currency: string | Address
	/** Payment recipient address or account ID */
	recipient: string | Address
	/** Expiry timestamp (ISO 8601 / RFC 3339) */
	expires: string
	/** Optional human-readable description */
	description?: string
	/** Optional merchant reference ID */
	externalId?: string
	/** Method-specific details */
	methodDetails?: TempoMethodDetails
}

/**
 * Authorize request for intent="authorize".
 * @see https://github.com/tempoxyz/payment-auth-spec/blob/main/specs/intents/draft-authorize-intent-00.md
 */
export interface AuthorizeRequest {
	/** Maximum authorization amount in base units */
	amount: string
	/** Currency identifier (ISO 4217 code or token address) */
	currency: string | Address
	/** Authorized spender address */
	recipient?: string | Address
	/** Authorization window expiry (ISO 8601 / RFC 3339) */
	expires: string
	/** Optional human-readable description */
	description?: string
	/** Method-specific details */
	methodDetails?: TempoMethodDetails
}

/**
 * Subscription request for intent="subscription".
 */
export interface SubscriptionRequest {
	/** Amount per period in base units */
	amount: string
	/** Currency identifier (ISO 4217 code or token address) */
	currency: string | Address
	/** Payment recipient */
	recipient: string | Address
	/** Total expiry timestamp (ISO 8601) */
	expires: string
	/** Period duration in seconds (stringified number) */
	period: string
	/** Optional start timestamp (ISO 8601) */
	validFrom?: string
	/** Method-specific details */
	methodDetails?: TempoMethodDetails
}

/**
 * Stream request for intent="stream".
 */
export interface StreamRequest {
	/** Address of the channel escrow contract */
	escrowContract: Address
	/** Currency identifier (token address) */
	currency: Address
	/** Payee address (server's address for withdrawals) */
	recipient: Address
	/** Required deposit amount in base units */
	deposit: string
	/** Channel ID if channel already exists */
	channelId?: Hex
	/** Random salt for new channel; server-generated */
	salt?: Hex
	/** HTTPS URL for voucher submission */
	voucherEndpoint: string
	/** Minimum amount increase between vouchers (default: "1") */
	minVoucherDelta?: string
	/** Method-specific details */
	methodDetails?: TempoMethodDetails
}

/**
 * Payload type in payment credential.
 */
export type PayloadType = 'transaction' | 'hash' | 'keyAuthorization' | 'stream'

/**
 * Payment credential payload.
 * @see https://github.com/tempoxyz/payment-auth-spec/blob/main/specs/core/draft-core-protocol-00.md#52-authorization-credential
 */
export interface PaymentPayload {
	/** Fulfillment type */
	type: PayloadType
	/** Hex-encoded signed data (transaction bytes or hash) */
	signature: Hex
}

/**
 * Echoed challenge in the credential.
 * Client MUST echo all challenge parameters for server verification.
 */
export interface EchoedChallenge<_TRequest = unknown> {
	/** Challenge ID from WWW-Authenticate */
	id: string
	/** Echoed realm */
	realm: string
	/** Echoed method */
	method: PaymentMethod
	/** Echoed intent */
	intent: PaymentIntent
	/** Echoed request (base64url-encoded in wire format) */
	request: string
	/** Echoed expiry if present */
	expires?: string
	/** Echoed digest if present */
	digest?: string
}

/**
 * Payment credential sent in Authorization header.
 *
 * Format: Payment <base64url-encoded JSON>
 *
 * The credential includes the full echoed challenge for server verification.
 *
 * @see https://github.com/tempoxyz/payment-auth-spec/blob/main/specs/core/draft-core-protocol-00.md#52-authorization-credential
 */
export interface PaymentCredential<TRequest = unknown> {
	/** Echoed challenge from WWW-Authenticate header */
	challenge: EchoedChallenge<TRequest>
	/** Optional payer identifier (recommended: DID format, e.g., did:pkh:eip155:42431:0x...) */
	source?: string
	/** Payment proof payload */
	payload: PaymentPayload
}

/**
 * Payment receipt returned in Payment-Receipt header.
 * @see https://github.com/tempoxyz/payment-auth-spec/blob/main/specs/core/draft-core-protocol-00.md#53-payment-receipt
 */
export interface PaymentReceipt {
	/** Payment status */
	status: 'success' | 'failed'
	/** Payment method used */
	method: PaymentMethod
	/** ISO 8601 settlement timestamp */
	timestamp: string
	/** Method-specific reference (e.g., transaction hash) */
	reference: string
	/** TIP-20 token used for fees (only if server sponsored fees) */
	feeToken?: Address
	/** Server's fee payer address (only if server sponsored fees) */
	feePayer?: Address
}

/**
 * Error types for 402 responses.
 * @see https://github.com/tempoxyz/payment-auth-spec/blob/main/specs/core/draft-core-protocol-00.md#8-error-handling
 */
export type PaymentErrorType =
	| 'payment_required'
	| 'payment_insufficient'
	| 'payment_expired'
	| 'payment_verification_failed'
	| 'payment_method_unsupported'
	| 'malformed_credential'
	| 'invalid_challenge'
	| 'fee_unavailable'
	| 'fee_token_rejected'
	| 'fee_limit_exceeded'
	| 'fee_slippage_exceeded'
	| 'fee_payer_overloaded'

/**
 * Error response body for 402 responses.
 */
export interface PaymentError {
	error: PaymentErrorType
	message: string
	/** Seconds to wait before retry (for 429/503 errors) */
	retry_after?: number
}
