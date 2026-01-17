import type { PartnerConfig } from '../config.js'
import { PRICES, TOKENS, WALLETS } from '../constants.js'

/**
 * Anthropic - Pay-per-use Claude API access with crypto
 * https://anthropic.com
 *
 * Access Claude models (Sonnet, Opus, Haiku) through Claude's API.
 * No accounts needed—just pay and use.
 *
 * Pricing: Variable based on model, default $0.01 per request
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
			price: PRICES.CENT_1,
			description: 'Create messages with Claude (Sonnet, Opus, Haiku)',
		},
	],
}
