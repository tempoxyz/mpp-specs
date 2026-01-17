import type { PartnerConfig } from '../config.js'
import { PRICES, TOKENS, WALLETS } from '../constants.js'

/**
 * Modal - Serverless GPU compute for AI/ML
 * https://modal.com
 *
 * Run GPU workloads (LLM inference, finetuning, image generation) on-demand.
 * Pay per second of compute with crypto - no Modal account needed.
 *
 * Pricing: Variable based on GPU type:
 * - A10G: ~$1.10/hr ($0.0003/sec)
 * - A100-40GB: ~$2.30/hr ($0.0006/sec)
 * - A100-80GB: ~$2.78/hr ($0.0008/sec)
 * - H100: ~$3.95/hr ($0.0011/sec)
 *
 * Default: $0.01 per API call (covers ~30sec of A10G compute)
 *
 * Authentication: Modal uses Modal-Key and Modal-Secret headers.
 * The proxy injects both from a combined credential format: "key:secret"
 */
export const modal: PartnerConfig = {
	name: 'Modal',
	slug: 'modal',
	aliases: ['gpu', 'compute'],
	upstream: 'https://api.modal.com',
	apiKeyEnvVar: 'MODAL_API_CREDENTIALS',
	apiKeyHeader: 'Modal-Key',
	apiKeyFormat: '{key}',
	defaultPrice: PRICES.CENT_10,
	defaultRequiresPayment: true,
	asset: TOKENS.ALPHA_USD,
	destination: WALLETS.TEST_RECEIVER,
	endpoints: [
		{
			path: '/v1/apps',
			methods: ['GET'],
			requiresPayment: false,
			description: 'List apps (free)',
		},
		{
			path: '/v1/apps/:appId',
			methods: ['GET'],
			requiresPayment: false,
			description: 'Get app details (free)',
		},
		{
			path: '/v1/apps/:appId/functions',
			methods: ['GET'],
			requiresPayment: false,
			description: 'List functions (free)',
		},
		{
			path: '/v1/functions/:functionId/invoke',
			methods: ['POST'],
			price: PRICES.CENT_10,
			description: 'Invoke a Modal function (GPU compute)',
		},
		{
			path: '/v1/functions/:functionId/map',
			methods: ['POST'],
			price: PRICES.CENT_10,
			description: 'Map inputs to a Modal function',
		},
		{
			path: '/v1/sandboxes',
			methods: ['POST'],
			price: PRICES.CENT_10,
			description: 'Create a sandbox for code execution',
		},
		{
			path: '/v1/sandboxes/:sandboxId',
			methods: ['GET'],
			requiresPayment: false,
			description: 'Get sandbox status (free)',
		},
		{
			path: '/v1/sandboxes/:sandboxId/exec',
			methods: ['POST'],
			price: PRICES.CENT_5,
			description: 'Execute command in sandbox',
		},
	],
}
