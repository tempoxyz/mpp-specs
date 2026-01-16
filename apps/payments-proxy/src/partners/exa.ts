import type { PartnerConfig } from '../config.js'

/**
 * Exa - AI-powered web search API
 * https://exa.ai
 */
export const exa: PartnerConfig = {
	name: 'Exa',
	slug: 'exa',
	upstream: 'https://api.exa.ai',
	apiKeyEnvVar: 'EXA_API_KEY',
	apiKeyHeader: 'x-api-key',
	defaultPrice: '10000',
	defaultRequiresPayment: false,
	asset: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
	destination: '0x0000000000000000000000000000000000000000',
	endpoints: [
		{ path: '/search', methods: ['POST'], price: '10000', description: 'Search the web' },
		{ path: '/contents', methods: ['POST'], price: '10000', description: 'Get page contents' },
		{ path: '/findSimilar', methods: ['POST'], price: '10000', description: 'Find similar pages' },
		{ path: '/answer', methods: ['POST'], price: '20000', description: 'Get AI-powered answers' },
	],
}
