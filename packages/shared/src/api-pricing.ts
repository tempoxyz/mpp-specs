/**
 * API Pricing Module
 *
 * Accurate API pricing based on official provider documentation (as of January 2026).
 * All prices are in USD per million tokens unless otherwise noted.
 *
 * Premium multiplier: Configurable service markup (default 10x provider cost).
 *
 * Sources:
 * - OpenAI: https://platform.openai.com/docs/pricing
 * - Anthropic: https://www.anthropic.com/pricing
 * - Google: https://ai.google.dev/gemini-api/docs/pricing
 */

/**
 * Model pricing in USD per million tokens
 */
export interface ModelPricing {
	/** Model identifier */
	model: string
	/** Provider name */
	provider: 'openai' | 'anthropic' | 'google'
	/** Input token cost per million tokens (USD) */
	inputPerMillion: number
	/** Cached input cost per million tokens (USD), if supported */
	cachedInputPerMillion?: number
	/** Output token cost per million tokens (USD) */
	outputPerMillion: number
	/** Human-readable description */
	description?: string
	/** Context window size in tokens */
	contextWindow?: number
	/** Whether this model supports caching */
	supportsCaching?: boolean
}

/**
 * OpenAI API Pricing (January 2026)
 * Source: https://platform.openai.com/docs/pricing
 */
export const OPENAI_PRICING: ModelPricing[] = [
	// GPT-5 Series (Flagship)
	{
		model: 'gpt-5.2',
		provider: 'openai',
		inputPerMillion: 1.75,
		cachedInputPerMillion: 0.175,
		outputPerMillion: 14.0,
		description: 'Best model for coding and agentic tasks',
		contextWindow: 128000,
		supportsCaching: true,
	},
	{
		model: 'gpt-5.2-pro',
		provider: 'openai',
		inputPerMillion: 21.0,
		outputPerMillion: 168.0,
		description: 'Smartest and most precise model',
		supportsCaching: false,
	},
	{
		model: 'gpt-5.1',
		provider: 'openai',
		inputPerMillion: 1.25,
		cachedInputPerMillion: 0.125,
		outputPerMillion: 10.0,
		contextWindow: 128000,
		supportsCaching: true,
	},
	{
		model: 'gpt-5',
		provider: 'openai',
		inputPerMillion: 1.25,
		cachedInputPerMillion: 0.125,
		outputPerMillion: 10.0,
		contextWindow: 128000,
		supportsCaching: true,
	},
	{
		model: 'gpt-5-mini',
		provider: 'openai',
		inputPerMillion: 0.25,
		cachedInputPerMillion: 0.025,
		outputPerMillion: 2.0,
		description: 'Faster, cheaper version for well-defined tasks',
		contextWindow: 128000,
		supportsCaching: true,
	},
	{
		model: 'gpt-5-nano',
		provider: 'openai',
		inputPerMillion: 0.05,
		cachedInputPerMillion: 0.005,
		outputPerMillion: 0.4,
		description: 'Smallest, most cost-efficient model',
		contextWindow: 128000,
		supportsCaching: true,
	},
	{
		model: 'gpt-5-pro',
		provider: 'openai',
		inputPerMillion: 15.0,
		outputPerMillion: 120.0,
		description: 'High-precision reasoning model',
		supportsCaching: false,
	},

	// GPT-4 Series
	{
		model: 'gpt-4.1',
		provider: 'openai',
		inputPerMillion: 2.0,
		cachedInputPerMillion: 0.5,
		outputPerMillion: 8.0,
		contextWindow: 128000,
		supportsCaching: true,
	},
	{
		model: 'gpt-4.1-mini',
		provider: 'openai',
		inputPerMillion: 0.4,
		cachedInputPerMillion: 0.1,
		outputPerMillion: 1.6,
		contextWindow: 128000,
		supportsCaching: true,
	},
	{
		model: 'gpt-4.1-nano',
		provider: 'openai',
		inputPerMillion: 0.1,
		cachedInputPerMillion: 0.025,
		outputPerMillion: 0.4,
		contextWindow: 128000,
		supportsCaching: true,
	},
	{
		model: 'gpt-4o',
		provider: 'openai',
		inputPerMillion: 2.5,
		cachedInputPerMillion: 1.25,
		outputPerMillion: 10.0,
		description: 'Multimodal flagship model',
		contextWindow: 128000,
		supportsCaching: true,
	},
	{
		model: 'gpt-4o-mini',
		provider: 'openai',
		inputPerMillion: 0.15,
		cachedInputPerMillion: 0.075,
		outputPerMillion: 0.6,
		description: 'Cost-efficient small multimodal model',
		contextWindow: 128000,
		supportsCaching: true,
	},

	// Reasoning Models (o-series)
	{
		model: 'o3',
		provider: 'openai',
		inputPerMillion: 2.0,
		cachedInputPerMillion: 0.5,
		outputPerMillion: 8.0,
		description: 'Advanced reasoning model',
		supportsCaching: true,
	},
	{
		model: 'o3-pro',
		provider: 'openai',
		inputPerMillion: 20.0,
		outputPerMillion: 80.0,
		description: 'Premium reasoning model',
		supportsCaching: false,
	},
	{
		model: 'o4-mini',
		provider: 'openai',
		inputPerMillion: 1.1,
		cachedInputPerMillion: 0.275,
		outputPerMillion: 4.4,
		description: 'Efficient reasoning model',
		supportsCaching: true,
	},
	{
		model: 'o1',
		provider: 'openai',
		inputPerMillion: 15.0,
		cachedInputPerMillion: 7.5,
		outputPerMillion: 60.0,
		supportsCaching: true,
	},
	{
		model: 'o1-pro',
		provider: 'openai',
		inputPerMillion: 150.0,
		outputPerMillion: 600.0,
		description: 'Most powerful reasoning model',
		supportsCaching: false,
	},

	// Realtime Models (text pricing)
	{
		model: 'gpt-realtime',
		provider: 'openai',
		inputPerMillion: 4.0,
		cachedInputPerMillion: 0.4,
		outputPerMillion: 16.0,
		description: 'Low-latency real-time conversations',
	},
	{
		model: 'gpt-realtime-mini',
		provider: 'openai',
		inputPerMillion: 0.6,
		cachedInputPerMillion: 0.06,
		outputPerMillion: 2.4,
		description: 'Efficient real-time model',
	},

	// Codex Models
	{
		model: 'gpt-5.2-codex',
		provider: 'openai',
		inputPerMillion: 1.75,
		cachedInputPerMillion: 0.175,
		outputPerMillion: 14.0,
		description: 'Optimized for code generation',
	},
	{
		model: 'gpt-5.1-codex',
		provider: 'openai',
		inputPerMillion: 1.25,
		cachedInputPerMillion: 0.125,
		outputPerMillion: 10.0,
	},
	{
		model: 'gpt-5-codex',
		provider: 'openai',
		inputPerMillion: 1.25,
		cachedInputPerMillion: 0.125,
		outputPerMillion: 10.0,
	},
	{
		model: 'codex-mini-latest',
		provider: 'openai',
		inputPerMillion: 1.5,
		cachedInputPerMillion: 0.375,
		outputPerMillion: 6.0,
	},

	// Embeddings
	{
		model: 'text-embedding-3-small',
		provider: 'openai',
		inputPerMillion: 0.02,
		outputPerMillion: 0,
		description: 'Small embedding model',
	},
	{
		model: 'text-embedding-3-large',
		provider: 'openai',
		inputPerMillion: 0.13,
		outputPerMillion: 0,
		description: 'Large embedding model',
	},
	{
		model: 'text-embedding-ada-002',
		provider: 'openai',
		inputPerMillion: 0.1,
		outputPerMillion: 0,
		description: 'Legacy embedding model',
	},
]

/**
 * Anthropic API Pricing (January 2026)
 * Source: https://www.anthropic.com/pricing
 */
export const ANTHROPIC_PRICING: ModelPricing[] = [
	// Claude 4.5 Series (Latest)
	{
		model: 'claude-opus-4.5',
		provider: 'anthropic',
		inputPerMillion: 5.0,
		cachedInputPerMillion: 0.5,
		outputPerMillion: 25.0,
		description: 'Most intelligent model for agents and coding',
		contextWindow: 200000,
		supportsCaching: true,
	},
	{
		model: 'claude-sonnet-4.5',
		provider: 'anthropic',
		inputPerMillion: 3.0,
		cachedInputPerMillion: 0.3,
		outputPerMillion: 15.0,
		description: 'Optimal balance of intelligence, cost, and speed',
		contextWindow: 200000,
		supportsCaching: true,
	},
	{
		model: 'claude-haiku-4.5',
		provider: 'anthropic',
		inputPerMillion: 1.0,
		cachedInputPerMillion: 0.1,
		outputPerMillion: 5.0,
		description: 'Fastest, most cost-efficient model',
		contextWindow: 200000,
		supportsCaching: true,
	},

	// Claude 4 Series
	{
		model: 'claude-opus-4',
		provider: 'anthropic',
		inputPerMillion: 15.0,
		cachedInputPerMillion: 1.5,
		outputPerMillion: 75.0,
		contextWindow: 200000,
		supportsCaching: true,
	},
	{
		model: 'claude-opus-4.1',
		provider: 'anthropic',
		inputPerMillion: 15.0,
		cachedInputPerMillion: 1.5,
		outputPerMillion: 75.0,
		contextWindow: 200000,
		supportsCaching: true,
	},
	{
		model: 'claude-sonnet-4',
		provider: 'anthropic',
		inputPerMillion: 3.0,
		cachedInputPerMillion: 0.3,
		outputPerMillion: 15.0,
		contextWindow: 200000,
		supportsCaching: true,
	},

	// Claude 3.5 Series (Legacy but still available)
	{
		model: 'claude-3.5-sonnet',
		provider: 'anthropic',
		inputPerMillion: 3.0,
		cachedInputPerMillion: 0.3,
		outputPerMillion: 15.0,
		contextWindow: 200000,
		supportsCaching: true,
	},
	{
		model: 'claude-3.5-haiku',
		provider: 'anthropic',
		inputPerMillion: 1.0,
		cachedInputPerMillion: 0.1,
		outputPerMillion: 5.0,
		contextWindow: 200000,
		supportsCaching: true,
	},

	// Claude 3 Series (Legacy)
	{
		model: 'claude-3-opus',
		provider: 'anthropic',
		inputPerMillion: 15.0,
		cachedInputPerMillion: 1.5,
		outputPerMillion: 75.0,
		contextWindow: 200000,
		supportsCaching: true,
	},
	{
		model: 'claude-3-haiku',
		provider: 'anthropic',
		inputPerMillion: 0.25,
		cachedInputPerMillion: 0.03,
		outputPerMillion: 1.25,
		contextWindow: 200000,
		supportsCaching: true,
	},
]

/**
 * Google Gemini API Pricing (January 2026)
 * Source: https://ai.google.dev/gemini-api/docs/pricing
 */
export const GOOGLE_PRICING: ModelPricing[] = [
	// Gemini 3 Series (Preview)
	{
		model: 'gemini-3-pro',
		provider: 'google',
		inputPerMillion: 2.0,
		cachedInputPerMillion: 0.2,
		outputPerMillion: 12.0,
		description: 'Most advanced reasoning model',
		contextWindow: 1000000,
		supportsCaching: true,
	},
	{
		model: 'gemini-3-flash',
		provider: 'google',
		inputPerMillion: 0.5,
		cachedInputPerMillion: 0.05,
		outputPerMillion: 3.0,
		contextWindow: 1000000,
		supportsCaching: true,
	},

	// Gemini 2.5 Series
	{
		model: 'gemini-2.5-pro',
		provider: 'google',
		inputPerMillion: 1.25,
		cachedInputPerMillion: 0.125,
		outputPerMillion: 10.0,
		description: 'State-of-the-art multipurpose model for coding and reasoning',
		contextWindow: 1000000,
		supportsCaching: true,
	},
	{
		model: 'gemini-2.5-flash',
		provider: 'google',
		inputPerMillion: 0.3,
		cachedInputPerMillion: 0.03,
		outputPerMillion: 2.5,
		description: 'Cost-effective with thinking enabled',
		contextWindow: 1000000,
		supportsCaching: true,
	},
	{
		model: 'gemini-2.5-flash-lite',
		provider: 'google',
		inputPerMillion: 0.1,
		cachedInputPerMillion: 0.01,
		outputPerMillion: 0.4,
		description: 'Most cost effective model for high-volume usage',
		contextWindow: 1000000,
		supportsCaching: true,
	},

	// Gemini 2.0 Series
	{
		model: 'gemini-2.0-flash',
		provider: 'google',
		inputPerMillion: 0.15,
		cachedInputPerMillion: 0.0375,
		outputPerMillion: 0.6,
		description: 'Balanced multimodal model with 1M context',
		contextWindow: 1000000,
		supportsCaching: true,
	},
	{
		model: 'gemini-2.0-flash-lite',
		provider: 'google',
		inputPerMillion: 0.075,
		cachedInputPerMillion: 0.01875,
		outputPerMillion: 0.3,
		description: 'Budget-friendly version',
		contextWindow: 1000000,
		supportsCaching: true,
	},

	// Gemini 1.5 Series (Legacy)
	{
		model: 'gemini-1.5-pro',
		provider: 'google',
		inputPerMillion: 1.25,
		cachedInputPerMillion: 0.3125,
		outputPerMillion: 5.0,
		contextWindow: 2000000,
		supportsCaching: true,
	},
	{
		model: 'gemini-1.5-flash',
		provider: 'google',
		inputPerMillion: 0.075,
		cachedInputPerMillion: 0.01875,
		outputPerMillion: 0.3,
		contextWindow: 1000000,
		supportsCaching: true,
	},
]

/**
 * All available model pricing
 */
export const ALL_PRICING: ModelPricing[] = [
	...OPENAI_PRICING,
	...ANTHROPIC_PRICING,
	...GOOGLE_PRICING,
]

/**
 * Pricing configuration with service premium
 */
export interface PricingConfig {
	/** Premium multiplier applied to base costs (default: 10x) */
	premiumMultiplier: number
	/** Base unit for price representation (6 decimals for USD stablecoins) */
	decimals: number
}

/**
 * Default pricing configuration
 */
export const DEFAULT_PRICING_CONFIG: PricingConfig = {
	premiumMultiplier: 10,
	decimals: 6,
}

/**
 * Get pricing for a specific model.
 * Matches exact model names first, then tries prefix matching for versioned models.
 * E.g., "claude-sonnet-4-20250514" matches "claude-sonnet-4"
 * Handles provider prefixes like "anthropic/claude-opus-4" or "openai/gpt-5"
 */
export function getModelPricing(model: string): ModelPricing | undefined {
	let normalizedModel = model.toLowerCase()

	// Strip provider prefix if present (e.g., "anthropic/claude-opus-4" -> "claude-opus-4")
	const providerPrefixes = ['anthropic/', 'openai/', 'google/', 'meta-llama/', 'mistralai/']
	for (const prefix of providerPrefixes) {
		if (normalizedModel.startsWith(prefix)) {
			normalizedModel = normalizedModel.slice(prefix.length)
			break
		}
	}

	// Try exact match first
	const exact = ALL_PRICING.find((p) => p.model.toLowerCase() === normalizedModel)
	if (exact) return exact

	// Try prefix match (input model starts with pricing model)
	// Sort by model name length descending to prefer more specific matches
	// E.g., "gpt-4o-mini" should match before "gpt-4o"
	const sortedPricing = [...ALL_PRICING].sort((a, b) => b.model.length - a.model.length)
	return sortedPricing.find((p) => normalizedModel.startsWith(p.model.toLowerCase()))
}

/**
 * Calculate cost for token usage
 */
export interface TokenUsage {
	inputTokens: number
	outputTokens: number
	cachedInputTokens?: number
}

/**
 * Calculate the cost in USD for token usage
 */
export function calculateCostUSD(
	pricing: ModelPricing,
	usage: TokenUsage,
	config: PricingConfig = DEFAULT_PRICING_CONFIG,
): number {
	const inputCost = (usage.inputTokens / 1_000_000) * pricing.inputPerMillion
	const outputCost = (usage.outputTokens / 1_000_000) * pricing.outputPerMillion
	const cachedCost =
		((usage.cachedInputTokens ?? 0) / 1_000_000) *
		(pricing.cachedInputPerMillion ?? pricing.inputPerMillion)

	const baseCost = inputCost + outputCost + cachedCost
	return baseCost * config.premiumMultiplier
}

/**
 * Calculate the cost in base units (for on-chain payments)
 * Base units use 6 decimals (matching USDC/AlphaUSD)
 */
export function calculateCostBaseUnits(
	pricing: ModelPricing,
	usage: TokenUsage,
	config: PricingConfig = DEFAULT_PRICING_CONFIG,
): bigint {
	const costUSD = calculateCostUSD(pricing, usage, config)
	return BigInt(Math.ceil(costUSD * 10 ** config.decimals))
}

/**
 * Get a flat per-request price for an endpoint
 * Uses average token assumptions for simple pricing
 */
export interface FlatPriceOptions {
	/** Average input tokens per request */
	avgInputTokens?: number
	/** Average output tokens per request */
	avgOutputTokens?: number
	/** Premium multiplier (default: 10x) */
	premiumMultiplier?: number
	/** Minimum price in base units */
	minPrice?: bigint
}

const DEFAULT_FLAT_PRICE_OPTIONS: Required<FlatPriceOptions> = {
	avgInputTokens: 500,
	avgOutputTokens: 1000,
	premiumMultiplier: 10,
	minPrice: BigInt(10000), // $0.01 minimum
}

/**
 * Calculate a flat per-request price for a model
 */
export function calculateFlatRequestPrice(
	pricing: ModelPricing,
	options: FlatPriceOptions = {},
): bigint {
	const opts = { ...DEFAULT_FLAT_PRICE_OPTIONS, ...options }

	const config: PricingConfig = {
		premiumMultiplier: opts.premiumMultiplier,
		decimals: 6,
	}

	const usage: TokenUsage = {
		inputTokens: opts.avgInputTokens,
		outputTokens: opts.avgOutputTokens,
	}

	const calculatedPrice = calculateCostBaseUnits(pricing, usage, config)
	return calculatedPrice > opts.minPrice ? calculatedPrice : opts.minPrice
}

/**
 * Estimate cost based on request body
 * Parses common API request patterns to estimate token usage
 */
export function estimateTokensFromRequest(body: unknown): TokenUsage {
	if (!body || typeof body !== 'object') {
		return { inputTokens: 500, outputTokens: 1000 }
	}

	const request = body as Record<string, unknown>
	let inputTokens = 0
	let outputTokens = 1000 // Default expected output

	// Handle messages array (OpenAI/Anthropic format)
	if (Array.isArray(request.messages)) {
		for (const msg of request.messages) {
			if (typeof msg === 'object' && msg !== null) {
				const content = (msg as Record<string, unknown>).content
				if (typeof content === 'string') {
					// Rough estimate: ~4 chars per token
					inputTokens += Math.ceil(content.length / 4)
				} else if (Array.isArray(content)) {
					// Multi-part content (images, etc.)
					for (const part of content) {
						if (typeof part === 'object' && part !== null) {
							const partObj = part as Record<string, unknown>
							if (typeof partObj.text === 'string') {
								inputTokens += Math.ceil(partObj.text.length / 4)
							}
							if (partObj.type === 'image' || partObj.type === 'image_url') {
								inputTokens += 765 // Standard image token count
							}
						}
					}
				}
			}
		}
	}

	// Handle prompt string (simple format)
	if (typeof request.prompt === 'string') {
		inputTokens += Math.ceil(request.prompt.length / 4)
	}

	// Handle system prompt
	if (typeof request.system === 'string') {
		inputTokens += Math.ceil(request.system.length / 4)
	}

	// Handle max_tokens if specified
	if (typeof request.max_tokens === 'number') {
		outputTokens = request.max_tokens
	}

	// Ensure minimum values
	return {
		inputTokens: Math.max(inputTokens, 100),
		outputTokens: Math.max(outputTokens, 100),
	}
}

/**
 * Get model from request body
 */
export function getModelFromRequest(body: unknown): string | undefined {
	if (!body || typeof body !== 'object') return undefined
	const request = body as Record<string, unknown>
	if (typeof request.model === 'string') return request.model
	return undefined
}

/**
 * Calculate price for an API request (dynamic pricing)
 */
export function calculateRequestPrice(
	body: unknown,
	config: PricingConfig = DEFAULT_PRICING_CONFIG,
	fallbackModel?: string,
): bigint {
	const model = getModelFromRequest(body) ?? fallbackModel
	if (!model) {
		// Return minimum price if no model specified
		return BigInt(10000)
	}

	const pricing = getModelPricing(model)
	if (!pricing) {
		// Return minimum price for unknown models
		return BigInt(10000)
	}

	const usage = estimateTokensFromRequest(body)
	return calculateCostBaseUnits(pricing, usage, config)
}

/**
 * Format price from base units to display string
 */
export function formatPrice(baseUnits: bigint | string, symbol = '$'): string {
	const units = typeof baseUnits === 'string' ? BigInt(baseUnits) : baseUnits
	const dollars = Number(units) / 1_000_000
	return `${symbol}${dollars.toFixed(6)}`
}

/**
 * Get all models for a provider
 */
export function getProviderModels(provider: 'openai' | 'anthropic' | 'google'): ModelPricing[] {
	return ALL_PRICING.filter((p) => p.provider === provider)
}

/**
 * OpenAI Built-in Tools Pricing
 */
export const OPENAI_TOOLS_PRICING = {
	codeInterpreter: {
		perSession: 0.03, // $0.03 per session
	},
	fileSearchStorage: {
		perGBPerDay: 0.1, // $0.10 per GB per day
		freeGB: 1,
	},
	fileSearchToolCall: {
		per1KCalls: 2.5, // $2.50 per 1K calls
	},
	webSearch: {
		per1KCalls: 10.0, // $10.00 per 1K calls
	},
} as const

/**
 * Anthropic Tools Pricing
 */
export const ANTHROPIC_TOOLS_PRICING = {
	webSearch: {
		per1KSearches: 10.0, // $10 per 1K searches
	},
	codeExecution: {
		freeHoursPerDay: 50,
		perHourAfterFree: 0.05,
	},
} as const

/**
 * Google Tools Pricing
 */
export const GOOGLE_TOOLS_PRICING = {
	groundingWithSearch: {
		freePromptsPerMonth: 5000,
		per1KQueriesAfterFree: 35.0,
	},
	groundingWithMaps: {
		freePromptsPerDay: 1500,
		per1KPromptsAfterFree: 25.0,
	},
	codeExecution: {
		free: true,
	},
} as const
