import type { Address, Hex } from 'viem'

/**
 * Payment method identifier.
 * @see https://datatracker.ietf.org/doc/html/draft-ietf-httpauth-payment-01#section-6
 */
export type PaymentMethod = 'tempo' | 'x402' | (string & {})

/**
 * Payment intent type.
 * @see https://datatracker.ietf.org/doc/html/draft-ietf-httpauth-payment-01#section-7
 *
 * Note: 'approve' is DEPRECATED and will be removed in a future version.
 * Use 'authorize' instead. Servers MUST accept both during the transition period.
 */
export type PaymentIntent =
	| 'charge'
	| 'authorize'
	| 'approve' // DEPRECATED: use 'authorize'
	| 'subscription'
	| 'stream'
	| (string & {})

/**
 * Normalize payment intent, converting deprecated names to current ones.
 * @param intent - The intent from client request
 * @returns The normalized intent name
 */
export function normalizeIntent(intent: PaymentIntent): PaymentIntent {
	if (intent === 'approve') {
		console.warn('[DEPRECATED] intent="approve" is deprecated, use "authorize" instead')
		return 'authorize'
	}
	return intent
}

/**
 * Payment challenge sent in WWW-Authenticate header.
 * @see https://datatracker.ietf.org/doc/html/draft-ietf-httpauth-payment-01#section-5.1
 */
export interface PaymentChallenge<TRequest = unknown> {
	/** Unique identifier for this payment challenge (128+ bits entropy) */
	id: string
	/** Protection space identifier */
	realm: string
	/** Payment method identifier */
	method: PaymentMethod
	/** Payment intent type */
	intent: PaymentIntent
	/** Base64url-encoded JSON payment request (decoded here) */
	request: TRequest
	/** Optional expiry timestamp (ISO 8601) */
	expires?: string
	/** Optional human-readable description */
	description?: string
}

/**
 * Charge request for tempo method with intent="charge".
 * @see https://datatracker.ietf.org/doc/html/draft-tempo-payment-method-00#section-6.1
 */
export interface ChargeRequest {
	/** Amount in base units (stringified number, e.g., "10000" = 0.01 with 6 decimals) */
	amount: string
	/** TIP-20 token address */
	asset: Address
	/** Recipient address */
	destination: Address
	/** Expiry timestamp (ISO 8601) */
	expires: string
	/** If true, server will pay transaction fees */
	feePayer?: boolean
}

/**
 * Authorize request for tempo method with intent="authorize".
 * @see https://datatracker.ietf.org/doc/html/draft-tempo-payment-method-00#section-6.2
 */
export interface AuthorizeRequest {
	/** TIP-20 token address */
	asset: Address
	/** Authorized spender address (required for transaction fulfillment) */
	destination?: Address
	/** Expiry timestamp (ISO 8601) */
	expires: string
	/** Maximum spend amount in base units */
	limit: string
	/** Optional start timestamp (ISO 8601) */
	validFrom?: string
	/** If true, server will pay transaction fees */
	feePayer?: boolean
}

/**
 * Subscription request for tempo method with intent="subscription".
 * @see https://datatracker.ietf.org/doc/html/draft-tempo-payment-method-00#section-6.3
 */
export interface SubscriptionRequest {
	/** Amount per period in base units */
	amount: string
	/** TIP-20 token address */
	asset: Address
	/** Total expiry timestamp (ISO 8601) */
	expires: string
	/** Period duration in seconds (stringified number) */
	period: string
	/** Optional start timestamp (ISO 8601) */
	validFrom?: string
}

/**
 * Stream request for tempo method with intent="stream".
 * @see https://datatracker.ietf.org/doc/html/draft-tempo-stream-extension-00#section-5
 */
export interface StreamRequest {
	/** Address of the channel escrow contract */
	escrowContract: Address
	/** TIP-20 token address */
	asset: Address
	/** Payee address (server's address for withdrawals) */
	destination: Address
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
}

/** EIP-712 domain for stream channel signatures */
interface StreamDomain {
	name: string
	version: string
	chainId: number
	verifyingContract: Address
}

/** Signed voucher payload */
export interface SignedVoucherPayload {
	payload: {
		primaryType: 'Voucher'
		domain: StreamDomain
		types: Record<string, Array<{ name: string; type: string }>>
		message: {
			channelId: Hex
			cumulativeAmount: string
		}
	}
	signature: Hex
}

/** Signed close request payload */
export interface SignedCloseRequestPayload {
	payload: {
		primaryType: 'CloseRequest'
		domain: StreamDomain
		types: Record<string, Array<{ name: string; type: string }>>
		message: {
			channelId: Hex
		}
	}
	signature: Hex
}

/** Open action: client opened a channel on-chain and provides first voucher */
interface StreamCredentialOpen {
	type: 'stream'
	action: 'open'
	channelId: Hex
	openTxHash: Hex
	voucher: SignedVoucherPayload
}

/** Voucher action: client submits a new cumulative payment voucher */
interface StreamCredentialVoucher {
	type: 'stream'
	action: 'voucher'
	channelId: Hex
	voucher: SignedVoucherPayload
}

/** Close action: client requests channel closure */
interface StreamCredentialClose {
	type: 'stream'
	action: 'close'
	channelId: Hex
	closeRequest: SignedCloseRequestPayload
}

/**
 * Stream credential payload for intent="stream".
 * Discriminated union on `action` field.
 */
export type StreamCredentialPayload =
	| StreamCredentialOpen
	| StreamCredentialVoucher
	| StreamCredentialClose

/**
 * Payload type in payment credential.
 */
export type PayloadType = 'transaction' | 'keyAuthorization' | 'stream'

/**
 * Payment credential payload.
 * @see https://datatracker.ietf.org/doc/html/draft-tempo-payment-method-00#section-7.2
 */
export interface PaymentPayload {
	/** Fulfillment type */
	type: PayloadType
	/** Hex-encoded RLP-serialized signed data */
	signature: Hex
}

/**
 * Payment credential sent in Authorization header.
 * @see https://datatracker.ietf.org/doc/html/draft-ietf-httpauth-payment-01#section-5.2
 */
export interface PaymentCredential {
	/** Challenge ID from the server's WWW-Authenticate header */
	id: string
	/** Optional payer identifier as a DID */
	source?: string
	/** Tempo-specific payload */
	payload: PaymentPayload
}

/**
 * Payment receipt returned in Payment-Receipt header.
 * @see https://datatracker.ietf.org/doc/html/draft-ietf-httpauth-payment-01#section-5.3
 */
export interface PaymentReceipt {
	/** Payment status */
	status: 'success' | 'failed'
	/** Payment method used */
	method: PaymentMethod
	/** ISO 8601 settlement time */
	timestamp: string
	/** Method-specific reference (e.g., transaction hash) */
	reference: string
	/** TIP-20 token used for fees (only if server sponsored fees) */
	feeToken?: Address
	/** Server's fee payer address (only if server sponsored fees) */
	feePayer?: Address
}

/**
 * Error response body for 402 responses.
 * @see https://datatracker.ietf.org/doc/html/draft-ietf-httpauth-payment-01#section-8
 */
export interface PaymentError {
	error:
		| 'payment_required'
		| 'payment_insufficient'
		| 'payment_expired'
		| 'payment_verification_failed'
		| 'payment_method_unsupported'
		| 'malformed_proof'
		| 'fee_unavailable'
		| 'fee_token_rejected'
		| 'fee_limit_exceeded'
		| 'fee_slippage_exceeded'
		| 'fee_payer_overloaded'
	message: string
	/** Seconds to wait before retry (for 429/503 errors) */
	retry_after?: number
}
