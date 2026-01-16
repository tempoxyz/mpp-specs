import type { PartnerConfig } from '../config.js'

/**
 * Firecrawl - Web scraping and crawling API for LLMs
 * https://firecrawl.dev
 */
export const firecrawl: PartnerConfig = {
	name: 'Firecrawl',
	slug: 'firecrawl',
	upstream: 'https://api.firecrawl.dev',
	apiKeyEnvVar: 'FIRECRAWL_API_KEY',
	apiKeyHeader: 'Authorization',
	apiKeyFormat: 'Bearer {key}',
	defaultPrice: '10000',
	defaultRequiresPayment: false,
	asset: '0x20c0000000000000000000000000000000000001',
	destination: '0x0000000000000000000000000000000000000000',
	endpoints: [
		{ path: '/v1/scrape', methods: ['POST'], price: '10000', description: 'Scrape a URL' },
		{ path: '/v1/crawl', methods: ['POST'], price: '50000', description: 'Crawl a website' },
		{ path: '/v1/crawl/:id', methods: ['GET'], requiresPayment: false, description: 'Get crawl status' },
		{ path: '/v1/map', methods: ['POST'], price: '10000', description: 'Map website URLs' },
		{ path: '/v1/search', methods: ['POST'], price: '20000', description: 'Search the web' },
		{ path: '/v1/extract', methods: ['POST'], price: '30000', description: 'Extract structured data' },
	],
}
