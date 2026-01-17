import type { PartnerConfig } from '../config.js'
import { PRICES, TOKENS, WALLETS } from '../constants.js'

/**
 * Exa - AI-powered web search API
 * https://exa.ai
 *
 * Neural search for the web. Find content by meaning, not just keywords.
 *
 * Pricing:
 * - Search: $0.01 per search
 * - Contents: $0.01 per request
 * - Find Similar: $0.01 per request
 * - Answer: $0.02 per answer
 */
export const exa: PartnerConfig = {
	name: 'Exa',
	slug: 'exa',
	upstream: 'https://api.exa.ai',
	apiKeyEnvVar: 'EXA_API_KEY',
	apiKeyHeader: 'x-api-key',
	defaultPrice: PRICES.CENT_1,
	defaultRequiresPayment: false,
	asset: TOKENS.ALPHA_USD,
	destination: WALLETS.TEST_RECEIVER,
	endpoints: [
		{ path: '/search', methods: ['POST'], price: PRICES.CENT_1, description: 'Search the web' },
		{
			path: '/contents',
			methods: ['POST'],
			price: PRICES.CENT_1,
			description: 'Get page contents',
		},
		{
			path: '/findSimilar',
			methods: ['POST'],
			price: PRICES.CENT_1,
			description: 'Find similar pages',
		},
		{
			path: '/answer',
			methods: ['POST'],
			price: PRICES.CENT_2,
			description: 'Get AI-powered answers',
		},
	],
}
