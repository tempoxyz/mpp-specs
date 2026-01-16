import type { PartnerConfig } from '../config.js'

/**
 * Twitter/X - X API v2
 * https://developer.x.com
 *
 * Access posts, users, spaces, and more from the X platform.
 */
export const twitter: PartnerConfig = {
	name: 'Twitter',
	slug: 'twitter',
	upstream: 'https://api.x.com',
	apiKeyEnvVar: 'TWITTER_BEARER_TOKEN',
	apiKeyHeader: 'Authorization',
	apiKeyFormat: 'Bearer {key}',
	defaultPrice: '10000',
	defaultRequiresPayment: false,
	asset: '0x20c0000000000000000000000000000000000001',
	destination: '0x0000000000000000000000000000000000000000',
	endpoints: [
		{ path: '/2/tweets', methods: ['GET'], price: '10000', description: 'Look up tweets by ID' },
		{ path: '/2/tweets/:id', methods: ['GET'], price: '10000', description: 'Look up a single tweet' },
		{ path: '/2/tweets', methods: ['POST'], price: '50000', description: 'Create a new tweet' },
		{ path: '/2/users/:id', methods: ['GET'], price: '10000', description: 'Look up a user by ID' },
		{ path: '/2/users/by/username/:username', methods: ['GET'], price: '10000', description: 'Look up user by username' },
		{ path: '/2/tweets/search/recent', methods: ['GET'], price: '20000', description: 'Search recent tweets' },
		{ path: '/2/users/:id/tweets', methods: ['GET'], price: '10000', description: 'Get user tweet timeline' },
	],
}
