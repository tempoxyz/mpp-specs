import type { PartnerConfig } from '../config.js'
import { PRICES, TOKENS, WALLETS } from '../constants.js'

/**
 * Firecrawl - Web scraping and crawling API for LLMs
 * https://firecrawl.dev
 *
 * Turn websites into LLM-ready data. Scrape, crawl, and extract structured data.
 *
 * Pricing:
 * - Scrape: $0.01 per page
 * - Crawl: $0.05 per crawl job
 * - Map: $0.01 per map
 * - Search: $0.02 per search
 * - Extract: $0.03 per extraction
 */
export const firecrawl: PartnerConfig = {
	name: 'Firecrawl',
	slug: 'firecrawl',
	upstream: 'https://api.firecrawl.dev',
	apiKeyEnvVar: 'FIRECRAWL_API_KEY',
	apiKeyHeader: 'Authorization',
	apiKeyFormat: 'Bearer {key}',
	defaultPrice: PRICES.CENT_1,
	defaultRequiresPayment: false,
	asset: TOKENS.ALPHA_USD,
	destination: WALLETS.TEST_RECEIVER,
	endpoints: [
		{ path: '/v1/scrape', methods: ['POST'], price: PRICES.CENT_1, description: 'Scrape a URL' },
		{ path: '/v1/crawl', methods: ['POST'], price: PRICES.CENT_5, description: 'Crawl a website' },
		{
			path: '/v1/crawl/:id',
			methods: ['GET'],
			requiresPayment: false,
			description: 'Get crawl status',
		},
		{ path: '/v1/map', methods: ['POST'], price: PRICES.CENT_1, description: 'Map website URLs' },
		{ path: '/v1/search', methods: ['POST'], price: PRICES.CENT_2, description: 'Search the web' },
		{
			path: '/v1/extract',
			methods: ['POST'],
			price: PRICES.CENT_3,
			description: 'Extract structured data',
		},
	],
}
