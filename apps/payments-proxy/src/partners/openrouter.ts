import type { PartnerConfig } from '../config.js'

/**
 * OpenRouter - Pay-per-use LLM API access with crypto
 * https://openrouter.ai
 *
 * Access 100+ LLMs through a unified API. No accounts needed—just pay and use.
 *
 * Pricing: Variable based on model, default $0.01 per request
 * Popular models accessible via /v1/chat/completions
 *
 * Only paid endpoints are listed below. All other endpoints pass through freely.
 */
export const openrouter: PartnerConfig = {
	name: 'OpenRouter',
	slug: 'openrouter',
	upstream: 'https://openrouter.ai/api',
	apiKeyEnvVar: 'OPENROUTER_API_KEY',
	apiKeyHeader: 'Authorization',
	apiKeyFormat: 'Bearer {key}',
	defaultPrice: '10000', // $0.01 per request (6 decimals)
	defaultRequiresPayment: false, // Unlisted endpoints are free
	asset: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', // USDC on Base
	destination: '0x0000000000000000000000000000000000000000', // TODO: Set actual destination
	endpoints: [
		// POST /v1/chat/completions - Main chat endpoint (paid)
		{
			path: '/v1/chat/completions',
			methods: ['POST'],
			price: '10000', // $0.01 per request
			description: 'Chat completions (GPT-4, Claude, Llama, etc.)',
		},
	],
}
