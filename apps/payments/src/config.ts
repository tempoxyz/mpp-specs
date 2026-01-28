import type { Address } from 'viem'

/**
 * Debug logger that only logs when DEBUG env var is set.
 * Usage: debug(env, 'tag', 'message', data)
 */
export function debug(env: { DEBUG?: string }, tag: string, message: string, data?: unknown): void {
	if (!env.DEBUG) return
	const prefix = `[${tag}]`
	if (data !== undefined) {
		console.log(prefix, message, data)
	} else {
		console.log(prefix, message)
	}
}

/**
 * Configuration for streaming payment channels.
 */
export interface StreamingConfig {
	/** Escrow contract address */
	escrowContract: Address
	/** Default deposit amount in base units */
	defaultDeposit: string
	/** Minimum voucher delta (minimum payment increment) */
	minVoucherDelta: string
}

/**
 * Configuration for a specific endpoint with custom pricing.
 */
export interface PartnerEndpoint {
	/** Path pattern (e.g., "/v1/sessions", "/v1/sessions/:id") */
	path: string
	/** HTTP methods this pricing applies to */
	methods: string[]
	/** Price in base units (e.g., "10000" = $0.01 with 6 decimals). Ignored if requiresPayment is false or dynamicPricing is true. */
	price?: string
	/** Whether this endpoint requires payment. Defaults to true. */
	requiresPayment?: boolean
	/** Human-readable description */
	description?: string
	/** Use dynamic pricing based on model and token estimation. When true, price is calculated from request body. */
	dynamicPricing?: boolean
}

/**
 * Configuration for a partner API.
 */
export interface PartnerConfig {
	/** Display name for the partner */
	name: string
	/** URL path prefix (e.g., "browserbase", "openai") */
	slug: string
	/** Additional slugs that route to this partner (e.g., ["llm"] for generic access) */
	aliases?: string[]
	/** Base URL of the upstream API */
	upstream: string
	/** Environment variable name containing the API key */
	apiKeyEnvVar: string
	/** Header name to use for the API key (e.g., "Authorization", "X-API-Key") */
	apiKeyHeader: string
	/** Format string for the API key value (use {key} as placeholder, e.g., "Bearer {key}") */
	apiKeyFormat?: string
	/** Default price per request in base units. Used when no endpoint matches and defaultRequiresPayment is true. */
	defaultPrice: string
	/** Whether unmatched endpoints require payment by default. Defaults to true. */
	defaultRequiresPayment?: boolean
	/** Custom pricing for specific endpoints */
	endpoints?: PartnerEndpoint[]
	/** TIP-20 token address for payments */
	asset: Address
	/** Destination wallet address for payments */
	destination: Address
	/** Partner-specific project ID (e.g., for Browserbase) */
	projectId?: string
	/** Streaming channel configuration (if streaming payments are supported) */
	streaming?: StreamingConfig
}

/**
 * Environment bindings for the proxy worker.
 */
export interface Env {
	ENVIRONMENT: string
	DEBUG?: string
	/** Tempo RPC URL (with credentials embedded if needed, e.g., https://user:pass@rpc.tempo.xyz) */
	TEMPO_RPC_URL: string
	/** Static assets for dashboard (Vite-built client) */
	ASSETS?: Fetcher
	/** Escrow contract address for streaming channels */
	STREAM_ESCROW_CONTRACT?: string
	/** Durable Object binding for payment channels */
	PAYMENT_CHANNEL?: DurableObjectNamespace
	/** D1 database for channel index */
	CHANNELS_DB?: D1Database
	/** Queue for settlement jobs */
	SETTLEMENT_QUEUE?: Queue
	/** Private key for server-initiated streaming settlements/close */
	SETTLER_PRIVATE_KEY?: string
	/** Dynamic API keys - accessed via partner config apiKeyEnvVar */
	BROWSERBASE_API_KEY?: string
	EXA_API_KEY?: string
	FIRECRAWL_API_KEY?: string
	MODAL_API_CREDENTIALS?: string
	OPENAI_API_KEY?: string
	OPENROUTER_API_KEY?: string
	TWITTER_BEARER_TOKEN?: string
	ANTHROPIC_API_KEY?: string
	/** S3/R2 storage endpoint URL (e.g., https://bucket.s3.amazonaws.com or R2 URL) */
	STORAGE_ENDPOINT?: string
	/** S3/R2 pre-signed auth or access key for storage proxy */
	STORAGE_ACCESS_KEY?: string
	/** Allow additional string keys for tests and future API keys */
	[key: string]: string | DurableObjectNamespace | D1Database | Queue | Fetcher | undefined
}

/**
 * Result of getting pricing info for a request.
 */
export interface PriceInfo {
	/** Whether this endpoint requires payment */
	requiresPayment: boolean
	/** Price in base units (only relevant if requiresPayment is true). Null if dynamicPricing is true. */
	price: string | null
	/** Human-readable description */
	description?: string
	/** Whether this endpoint uses dynamic pricing based on request body */
	dynamicPricing?: boolean
}

/**
 * Get the price for a specific request based on partner config.
 * Matches against endpoint patterns and returns the appropriate price and payment requirement.
 */
export function getPriceForRequest(
	partner: PartnerConfig,
	method: string,
	path: string,
): PriceInfo {
	// Normalize path (remove leading slash for matching)
	const normalizedPath = path.startsWith('/') ? path : `/${path}`

	if (partner.endpoints) {
		for (const endpoint of partner.endpoints) {
			// Check if method matches
			if (!endpoint.methods.includes(method.toUpperCase())) {
				continue
			}

			// Convert path pattern to regex (handle :param patterns)
			const pattern = endpoint.path.replace(/:[^/]+/g, '[^/]+')
			const regex = new RegExp(`^${pattern}$`)

			if (regex.test(normalizedPath)) {
				// Endpoint matched - check if it requires payment
				const requiresPayment = endpoint.requiresPayment !== false
				const dynamicPricing = endpoint.dynamicPricing === true
				return {
					requiresPayment,
					price: dynamicPricing ? null : (endpoint.price ?? partner.defaultPrice),
					description: endpoint.description,
					dynamicPricing,
				}
			}
		}
	}

	// No endpoint matched - use default behavior
	const requiresPayment = partner.defaultRequiresPayment !== false
	return { requiresPayment, price: partner.defaultPrice }
}

/**
 * Format the API key according to the partner's format string.
 */
export function formatApiKey(partner: PartnerConfig, apiKey: string): string {
	if (!partner.apiKeyFormat) {
		return apiKey
	}
	return partner.apiKeyFormat.replace('{key}', apiKey)
}

/**
 * Get the API key for a partner from environment variables.
 */
export function getApiKey(partner: PartnerConfig, env: Env): string | undefined {
	// Access the env as a record since API keys are dynamic
	const envRecord = env as unknown as Record<string, string | undefined>
	return envRecord[partner.apiKeyEnvVar]
}
