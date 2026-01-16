import type { PartnerConfig } from '../config.js'
import { PRICES, TOKENS, WALLETS } from '../constants.js'

/**
 * Twitter/X - X API v2
 * https://developer.x.com
 *
 * Access posts, users, spaces, and more from the X platform.
 *
 * Pricing:
 * - Tweet lookup: $0.01 per request
 * - User lookup: $0.01 per request
 * - Search: $0.02 per search
 * - Create tweet: $0.05 per tweet
 */
export const twitter: PartnerConfig = {
	name: 'Twitter',
	slug: 'twitter',
	upstream: 'https://api.x.com',
	apiKeyEnvVar: 'TWITTER_BEARER_TOKEN',
	apiKeyHeader: 'Authorization',
	apiKeyFormat: 'Bearer {key}',
	defaultPrice: PRICES.CENT_1,
	defaultRequiresPayment: false,
	asset: TOKENS.ALPHA_USD,
	destination: WALLETS.TEST_RECEIVER,
	endpoints: [
		{
			path: '/2/tweets',
			methods: ['GET'],
			price: PRICES.CENT_1,
			description: 'Look up tweets by ID',
		},
		{
			path: '/2/tweets/:id',
			methods: ['GET'],
			price: PRICES.CENT_1,
			description: 'Look up a single tweet',
		},
		{
			path: '/2/tweets',
			methods: ['POST'],
			price: PRICES.CENT_5,
			description: 'Create a new tweet',
		},
		{
			path: '/2/users/:id',
			methods: ['GET'],
			price: PRICES.CENT_1,
			description: 'Look up a user by ID',
		},
		{
			path: '/2/users/by/username/:username',
			methods: ['GET'],
			price: PRICES.CENT_1,
			description: 'Look up user by username',
		},
		{
			path: '/2/tweets/search/recent',
			methods: ['GET'],
			price: PRICES.CENT_2,
			description: 'Search recent tweets',
		},
		{
			path: '/2/users/:id/tweets',
			methods: ['GET'],
			price: PRICES.CENT_1,
			description: 'Get user tweet timeline',
		},
	],
}
