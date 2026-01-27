import type { PartnerConfig } from '../config.js'
import { CONTRACTS, PRICES, STREAMING_DEFAULTS, TOKENS, WALLETS } from '../constants.js'

/**
 * OpenRouter - Pay-per-use LLM API access with crypto
 * https://openrouter.ai
 *
 * Access 100+ LLMs through a unified API. No accounts needed—just pay and use.
 *
 * Pricing: Dynamic based on model and estimated tokens (1.5x provider cost)
 * Popular models accessible via /v1/chat/completions
 *
 * Supports both charge (per-request) and stream (payment channel) payments.
 *
 * Only paid endpoints are listed below. All other endpoints pass through freely.
 */
export const openrouter: PartnerConfig = {
	name: 'OpenRouter',
	slug: 'openrouter',
	aliases: ['llm'],
	upstream: 'https://openrouter.ai/api',
	apiKeyEnvVar: 'OPENROUTER_API_KEY',
	apiKeyHeader: 'Authorization',
	apiKeyFormat: 'Bearer {key}',
	defaultPrice: PRICES.CENT_1,
	defaultRequiresPayment: false,
	asset: TOKENS.ALPHA_USD,
	destination: WALLETS.TEST_RECEIVER,
	endpoints: [
		{
			path: '/v1/chat/completions',
			methods: ['POST'],
			dynamicPricing: true,
			description: 'Chat completions (GPT-4, Claude, Llama, etc.) - price varies by model',
		},
	],
	// Enable streaming payment channels
	streaming: {
		escrowContract: CONTRACTS.STREAM_ESCROW_MODERATO,
		defaultDeposit: STREAMING_DEFAULTS.DEFAULT_DEPOSIT,
		minVoucherDelta: STREAMING_DEFAULTS.MIN_VOUCHER_DELTA,
	},
}
