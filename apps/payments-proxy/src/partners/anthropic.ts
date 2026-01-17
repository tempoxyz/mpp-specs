import type { PartnerConfig } from '../config.js'
import { PRICES, TOKENS, WALLETS } from '../constants.js'

/**
 * Anthropic - Pay-per-use Claude API access with crypto
 * https://anthropic.com
 *
 * Access Claude models (Sonnet, Opus, Haiku) through Claude's API.
 * No accounts needed—just pay and use.
 *
 * Pricing: Dynamic based on model and estimated tokens (10x provider cost)
 *
 * Only paid endpoints are listed below. All other endpoints pass through freely.
 */
export const anthropic: PartnerConfig = {
	name: 'Anthropic',
	slug: 'anthropic',
	aliases: ['claude'],
	upstream: 'https://api.anthropic.com',
	apiKeyEnvVar: 'ANTHROPIC_API_KEY',
	apiKeyHeader: 'x-api-key',
	defaultPrice: PRICES.CENT_1,
	defaultRequiresPayment: false,
	asset: TOKENS.ALPHA_USD,
	destination: WALLETS.TEST_RECEIVER,
	endpoints: [
		{
			path: '/v1/messages',
			methods: ['POST'],
			dynamicPricing: true,
			description: 'Create messages with Claude (Sonnet, Opus, Haiku) - price varies by model',
		},
	],
}
