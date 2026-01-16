import type { Address } from 'viem'

/**
 * Configuration for a specific endpoint with custom pricing.
 */
export interface PartnerEndpoint {
	/** Path pattern (e.g., "/v1/sessions", "/v1/sessions/:id") */
	path: string
	/** HTTP methods this pricing applies to */
	methods: string[]
	/** Price in base units (e.g., "10000" = $0.01 with 6 decimals). Ignored if requiresPayment is false. */
	price?: string
	/** Whether this endpoint requires payment. Defaults to true. */
	requiresPayment?: boolean
	/** Human-readable description */
	description?: string
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
}

/**
 * Environment bindings for the proxy worker.
 */
export interface Env {
	ENVIRONMENT: string
	TEMPO_RPC_URL: string
	TEMPO_RPC_USERNAME?: string
	TEMPO_RPC_PASSWORD?: string
	/** Dynamic API keys - accessed via partner config apiKeyEnvVar */
	[key: string]: string | undefined
}

/**
 * Result of getting pricing info for a request.
 */
export interface PriceInfo {
	/** Whether this endpoint requires payment */
	requiresPayment: boolean
	/** Price in base units (only relevant if requiresPayment is true) */
	price: string
	/** Human-readable description */
	description?: string
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
				return {
					requiresPayment,
					price: endpoint.price ?? partner.defaultPrice,
					description: endpoint.description,
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
	return env[partner.apiKeyEnvVar]
}
