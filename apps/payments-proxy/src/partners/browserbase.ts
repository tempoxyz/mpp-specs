import type { PartnerConfig } from '../config.js'
import { PRICES, TOKENS, WALLETS } from '../constants.js'

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
	defaultPrice: PRICES.CENT_12,
	defaultRequiresPayment: false,
	asset: TOKENS.ALPHA_USD,
	destination: WALLETS.TEST_RECEIVER,
	projectId: '0dad8d6f-deea-4d37-8087-c63b4b878b3a',
	endpoints: [
		{
			path: '/v1/sessions',
			methods: ['POST'],
			price: PRICES.CENT_12,
			description: 'Create a browser session',
		},
		{
			path: '/v1/sessions/:id/extend',
			methods: ['POST'],
			price: PRICES.CENT_12,
			description: 'Add more time to session',
		},
	],
}
