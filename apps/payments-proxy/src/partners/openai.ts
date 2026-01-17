import type { PartnerConfig } from '../config.js'
import { PRICES, TOKENS, WALLETS } from '../constants.js'

/**
 * OpenAI - Pay-per-use GPT & Codex API access with crypto
 * https://openai.com
 *
 * Access GPT-4o, GPT-4, o1, Codex (gpt-5.2-codex), and other models.
 * No accounts needed—just pay and use.
 *
 * Pricing: Dynamic based on model and estimated tokens (1.5x provider cost)
 *
 * Only paid endpoints are listed below. All other endpoints pass through freely.
 */
export const openai: PartnerConfig = {
	name: 'OpenAI',
	slug: 'openai',
	aliases: ['gpt', 'codex'],
	upstream: 'https://api.openai.com',
	apiKeyEnvVar: 'OPENAI_API_KEY',
	apiKeyHeader: 'Authorization',
	apiKeyFormat: 'Bearer {key}',
	defaultPrice: PRICES.CENT_1,
	defaultRequiresPayment: false,
	asset: TOKENS.ALPHA_USD,
	destination: WALLETS.TEST_RECEIVER,
	endpoints: [
		{
			path: '/v1/responses',
			methods: ['POST'],
			dynamicPricing: true,
			description:
				'Responses API (Codex: gpt-5.2-codex, gpt-5.1-codex-max, etc.) - price varies by model',
		},
		{
			path: '/v1/responses/:id',
			methods: ['GET'],
			requiresPayment: false,
			description: 'Retrieve a response by ID',
		},
		{
			path: '/v1/responses/:id/cancel',
			methods: ['POST'],
			requiresPayment: false,
			description: 'Cancel a background response',
		},
		{
			path: '/v1/chat/completions',
			methods: ['POST'],
			dynamicPricing: true,
			description: 'Chat completions (GPT-4o, GPT-4, o1, etc.) - price varies by model',
		},
		{
			path: '/v1/embeddings',
			methods: ['POST'],
			dynamicPricing: true,
			description: 'Create embeddings - price varies by model',
		},
		{
			path: '/v1/images/generations',
			methods: ['POST'],
			price: PRICES.CENT_5,
			description: 'Generate images with DALL-E',
		},
		{
			path: '/v1/audio/transcriptions',
			methods: ['POST'],
			price: PRICES.CENT_2,
			description: 'Transcribe audio with Whisper',
		},
		{
			path: '/v1/audio/speech',
			methods: ['POST'],
			price: PRICES.CENT_2,
			description: 'Text-to-speech',
		},
	],
}
