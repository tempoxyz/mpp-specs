import { describe, expect, it } from 'vitest'
import {
	ALL_PRICING,
	ANTHROPIC_PRICING,
	calculateCostBaseUnits,
	calculateCostUSD,
	calculateFlatRequestPrice,
	calculateRequestPrice,
	DEFAULT_PRICING_CONFIG,
	estimateTokensFromRequest,
	formatPrice,
	GOOGLE_PRICING,
	getModelFromRequest,
	getModelPricing,
	getProviderModels,
	OPENAI_PRICING,
	type PricingConfig,
	type TokenUsage,
} from '../packages/shared/src/api-pricing'

describe('api-pricing', () => {
	describe('getModelPricing', () => {
		it('finds OpenAI models', () => {
			const gpt5 = getModelPricing('gpt-5')
			expect(gpt5).toBeDefined()
			expect(gpt5?.provider).toBe('openai')
			expect(gpt5?.inputPerMillion).toBe(1.25)
			expect(gpt5?.outputPerMillion).toBe(10.0)
		})

		it('finds Anthropic models', () => {
			const claude = getModelPricing('claude-sonnet-4.5')
			expect(claude).toBeDefined()
			expect(claude?.provider).toBe('anthropic')
			expect(claude?.inputPerMillion).toBe(3.0)
			expect(claude?.outputPerMillion).toBe(15.0)
		})

		it('finds Google models', () => {
			const gemini = getModelPricing('gemini-2.5-pro')
			expect(gemini).toBeDefined()
			expect(gemini?.provider).toBe('google')
			expect(gemini?.inputPerMillion).toBe(1.25)
			expect(gemini?.outputPerMillion).toBe(10.0)
		})

		it('returns undefined for unknown models', () => {
			expect(getModelPricing('unknown-model')).toBeUndefined()
		})

		it('finds models case-insensitively', () => {
			expect(getModelPricing('GPT-5')).toBeDefined()
			expect(getModelPricing('CLAUDE-SONNET-4.5')).toBeDefined()
		})
	})

	describe('calculateCostUSD', () => {
		it('calculates cost with default 10x premium', () => {
			const pricing = getModelPricing('gpt-5')!
			const usage: TokenUsage = {
				inputTokens: 1_000_000,
				outputTokens: 1_000_000,
			}
			// Base: $1.25 input + $10 output = $11.25
			// With 10x premium: $112.50
			const cost = calculateCostUSD(pricing, usage)
			expect(cost).toBe(112.5)
		})

		it('calculates cost with custom premium', () => {
			const pricing = getModelPricing('gpt-5')!
			const usage: TokenUsage = {
				inputTokens: 1_000_000,
				outputTokens: 1_000_000,
			}
			const config: PricingConfig = { premiumMultiplier: 1, decimals: 6 }
			// Base cost without premium: $11.25
			const cost = calculateCostUSD(pricing, usage, config)
			expect(cost).toBe(11.25)
		})

		it('includes cached tokens', () => {
			const pricing = getModelPricing('gpt-5')!
			const usage: TokenUsage = {
				inputTokens: 0,
				outputTokens: 0,
				cachedInputTokens: 1_000_000,
			}
			const config: PricingConfig = { premiumMultiplier: 1, decimals: 6 }
			// Cached: $0.125 per million
			const cost = calculateCostUSD(pricing, usage, config)
			expect(cost).toBe(0.125)
		})
	})

	describe('calculateCostBaseUnits', () => {
		it('returns bigint in 6 decimal base units', () => {
			const pricing = getModelPricing('gpt-5')!
			const usage: TokenUsage = {
				inputTokens: 1_000_000,
				outputTokens: 1_000_000,
			}
			const config: PricingConfig = { premiumMultiplier: 10, decimals: 6 }
			// Input: 1M * $1.25/M = $1.25
			// Output: 1M * $10/M = $10
			// Total: $11.25 * 10 = $112.50
			// Base units (6 decimals): 112500000
			const cost = calculateCostBaseUnits(pricing, usage, config)
			expect(typeof cost).toBe('bigint')
			expect(cost).toBe(BigInt(112500000))
		})
	})

	describe('calculateFlatRequestPrice', () => {
		it('calculates flat price with defaults', () => {
			const pricing = getModelPricing('gpt-4o-mini')!
			const price = calculateFlatRequestPrice(pricing)
			// Should be at least minimum price
			expect(price).toBeGreaterThanOrEqual(BigInt(10000))
		})

		it('respects minimum price', () => {
			const pricing = getModelPricing('gpt-5-nano')!
			const price = calculateFlatRequestPrice(pricing, {
				avgInputTokens: 10,
				avgOutputTokens: 10,
				minPrice: BigInt(50000),
			})
			expect(price).toBe(BigInt(50000))
		})

		it('uses custom premium multiplier', () => {
			const pricing = getModelPricing('gpt-5')!
			const price1x = calculateFlatRequestPrice(pricing, { premiumMultiplier: 1 })
			const price10x = calculateFlatRequestPrice(pricing, { premiumMultiplier: 10 })
			expect(price10x).toBeGreaterThan(price1x)
		})
	})

	describe('estimateTokensFromRequest', () => {
		it('estimates tokens from messages array', () => {
			const body = {
				messages: [
					{ role: 'user', content: 'Hello, how are you today?' },
					{ role: 'assistant', content: 'I am doing well, thank you!' },
				],
			}
			const usage = estimateTokensFromRequest(body)
			expect(usage.inputTokens).toBeGreaterThan(0)
			expect(usage.outputTokens).toBe(1000) // Default output
		})

		it('estimates tokens from prompt string', () => {
			const body = { prompt: 'Write a poem about AI' }
			const usage = estimateTokensFromRequest(body)
			expect(usage.inputTokens).toBeGreaterThan(0)
		})

		it('respects max_tokens', () => {
			const body = {
				messages: [{ role: 'user', content: 'Hello' }],
				max_tokens: 500,
			}
			const usage = estimateTokensFromRequest(body)
			expect(usage.outputTokens).toBe(500)
		})

		it('handles multipart content with images', () => {
			const body = {
				messages: [
					{
						role: 'user',
						content: [
							{ type: 'text', text: 'What is in this image?' },
							{ type: 'image', url: 'https://example.com/image.png' },
						],
					},
				],
			}
			const usage = estimateTokensFromRequest(body)
			expect(usage.inputTokens).toBeGreaterThanOrEqual(765) // At least image tokens
		})

		it('returns defaults for invalid input', () => {
			const usage = estimateTokensFromRequest(null)
			expect(usage.inputTokens).toBe(500)
			expect(usage.outputTokens).toBe(1000)
		})
	})

	describe('getModelFromRequest', () => {
		it('extracts model from request', () => {
			expect(getModelFromRequest({ model: 'gpt-5' })).toBe('gpt-5')
		})

		it('returns undefined for missing model', () => {
			expect(getModelFromRequest({ messages: [] })).toBeUndefined()
		})

		it('returns undefined for invalid input', () => {
			expect(getModelFromRequest(null)).toBeUndefined()
			expect(getModelFromRequest('string')).toBeUndefined()
		})
	})

	describe('calculateRequestPrice', () => {
		it('calculates price from request body', () => {
			const body = {
				model: 'gpt-5',
				messages: [{ role: 'user', content: 'Hello' }],
			}
			const price = calculateRequestPrice(body)
			expect(price).toBeGreaterThan(BigInt(0))
		})

		it('uses fallback model', () => {
			const body = { messages: [{ role: 'user', content: 'Hello' }] }
			const price = calculateRequestPrice(body, DEFAULT_PRICING_CONFIG, 'gpt-5')
			expect(price).toBeGreaterThan(BigInt(0))
		})

		it('returns minimum for unknown model', () => {
			const body = { model: 'unknown-model' }
			const price = calculateRequestPrice(body)
			expect(price).toBe(BigInt(10000))
		})
	})

	describe('formatPrice', () => {
		it('formats base units to USD string', () => {
			expect(formatPrice(BigInt(1000000))).toBe('$1.000000')
			expect(formatPrice(BigInt(10000))).toBe('$0.010000')
			expect(formatPrice('50000')).toBe('$0.050000')
		})
	})

	describe('getProviderModels', () => {
		it('returns OpenAI models', () => {
			const models = getProviderModels('openai')
			expect(models.length).toBe(OPENAI_PRICING.length)
			expect(models.every((m) => m.provider === 'openai')).toBe(true)
		})

		it('returns Anthropic models', () => {
			const models = getProviderModels('anthropic')
			expect(models.length).toBe(ANTHROPIC_PRICING.length)
			expect(models.every((m) => m.provider === 'anthropic')).toBe(true)
		})

		it('returns Google models', () => {
			const models = getProviderModels('google')
			expect(models.length).toBe(GOOGLE_PRICING.length)
			expect(models.every((m) => m.provider === 'google')).toBe(true)
		})
	})

	describe('pricing data integrity', () => {
		it('all models have required fields', () => {
			for (const pricing of ALL_PRICING) {
				expect(pricing.model).toBeDefined()
				expect(pricing.provider).toBeDefined()
				expect(pricing.inputPerMillion).toBeGreaterThanOrEqual(0)
				expect(pricing.outputPerMillion).toBeGreaterThanOrEqual(0)
			}
		})

		it('cached input is always cheaper than regular input', () => {
			for (const pricing of ALL_PRICING) {
				if (pricing.cachedInputPerMillion !== undefined) {
					expect(pricing.cachedInputPerMillion).toBeLessThan(pricing.inputPerMillion)
				}
			}
		})

		it('has expected flagship models', () => {
			// OpenAI
			expect(getModelPricing('gpt-5.2')).toBeDefined()
			expect(getModelPricing('gpt-4o')).toBeDefined()
			expect(getModelPricing('o3')).toBeDefined()

			// Anthropic
			expect(getModelPricing('claude-opus-4.5')).toBeDefined()
			expect(getModelPricing('claude-sonnet-4.5')).toBeDefined()
			expect(getModelPricing('claude-haiku-4.5')).toBeDefined()

			// Google
			expect(getModelPricing('gemini-2.5-pro')).toBeDefined()
			expect(getModelPricing('gemini-2.5-flash')).toBeDefined()
		})
	})
})
