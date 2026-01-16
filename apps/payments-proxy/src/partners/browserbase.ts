import type { PartnerConfig } from '../config.js'

/**
 * Browserbase x402 - Pay-per-use browser sessions with crypto
 * https://browserbase.com
 *
 * No API keys, no accounts—just pay and connect via x402.
 *
 * Configuration:
 * - API Key: REDACTED_BROWSERBASE_KEY
 * - Project ID: 0dad8d6f-deea-4d37-8087-c63b4b878b3a
 *
 * Pricing: $0.12/hour (paid in AlphaUSD on Tempo Moderato testnet)
 *
 * Only paid endpoints are listed below. All other endpoints pass through freely.
 */
export const browserbase: PartnerConfig = {
	name: 'Browserbase',
	slug: 'browserbase',
	upstream: 'https://api.browserbase.com',
	apiKeyEnvVar: 'BROWSERBASE_API_KEY',
	apiKeyHeader: 'X-BB-API-Key',
	defaultPrice: '120000', // $0.12/hour
	defaultRequiresPayment: false, // Unlisted endpoints are free
	asset: '0x20c0000000000000000000000000000000000001', // AlphaUSD on Tempo Moderato (testnet)
	destination: '0x0aA342d6e4e45D1F6eAE721c4fEf2f61B82f8581', // Test receiver wallet
	projectId: '0dad8d6f-deea-4d37-8087-c63b4b878b3a',
	endpoints: [
		// POST /v1/sessions - Create a browser session (paid)
		{
			path: '/v1/sessions',
			methods: ['POST'],
			price: '120000', // $0.12/hour
			description: 'Create a browser session',
		},
		// POST /v1/sessions/:id/extend - Add more time (paid)
		{
			path: '/v1/sessions/:id/extend',
			methods: ['POST'],
			price: '120000', // $0.12/hour
			description: 'Add more time to session',
		},
	],
}
