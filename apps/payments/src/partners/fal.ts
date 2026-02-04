import type { PartnerConfig } from '../config.js'
import { PRICES, TOKENS, WALLETS } from '../constants.js'

/**
 * fal.ai - Generative media platform for developers
 * https://fal.ai
 *
 * Access 600+ production-ready image, video, and audio generation models.
 * Models include Flux, Stable Diffusion, Recraft, Grok Imagine, and more.
 *
 * API Docs: https://docs.fal.ai
 *
 * Base URL: https://fal.run (sync) or https://queue.fal.run (async)
 * Auth: Authorization: Key {api_key}
 *
 * Model endpoints are path-based: /{namespace}/{model}/{subpath}
 * Examples:
 *   - /fal-ai/flux/dev (image generation)
 *   - /fal-ai/flux/schnell (fast image generation)
 *   - /fal-ai/stable-video (video generation)
 *   - /fal-ai/minimax/video-01 (video generation)
 */
export const fal: PartnerConfig = {
	name: 'fal.ai',
	slug: 'fal',
	aliases: ['image', 'video', 'flux'],
	upstream: 'https://fal.run',
	apiKeyEnvVar: 'FAL_API_KEY',
	apiKeyHeader: 'Authorization',
	apiKeyFormat: 'Key {key}',
	defaultPrice: PRICES.CENT_5,
	defaultRequiresPayment: true,
	asset: TOKENS.ALPHA_USD,
	destination: WALLETS.TEST_RECEIVER,
	endpoints: [
		// Image generation - Flux models
		{
			path: '/fal-ai/flux/dev',
			methods: ['POST'],
			price: PRICES.CENT_3,
			description: 'FLUX.1 [dev] - High-quality text-to-image generation',
		},
		{
			path: '/fal-ai/flux/schnell',
			methods: ['POST'],
			price: PRICES.CENT_1,
			description: 'FLUX.1 [schnell] - Fast text-to-image (1-4 steps)',
		},
		{
			path: '/fal-ai/flux-pro/v1.1',
			methods: ['POST'],
			price: PRICES.CENT_5,
			description: 'FLUX1.1 [pro] - Professional-grade image generation',
		},
		{
			path: '/fal-ai/flux-pro/v1.1-ultra',
			methods: ['POST'],
			price: PRICES.CENT_10,
			description: 'FLUX1.1 [pro] ultra - Up to 2K resolution with improved realism',
		},
		// Image generation - Stable Diffusion
		{
			path: '/fal-ai/stable-diffusion-v35-large',
			methods: ['POST'],
			price: PRICES.CENT_3,
			description: 'Stable Diffusion 3.5 Large - MMDiT text-to-image',
		},
		{
			path: '/fal-ai/fast-sdxl',
			methods: ['POST'],
			price: PRICES.CENT_1,
			description: 'Fast SDXL - Quick Stable Diffusion XL generation',
		},
		// Image generation - Recraft
		{
			path: '/fal-ai/recraft-v3',
			methods: ['POST'],
			price: PRICES.CENT_3,
			description: 'Recraft V3 - SOTA text-to-image with long text and vector art',
		},
		// Image generation - Grok
		{
			path: '/xai/grok-imagine-image',
			methods: ['POST'],
			price: PRICES.CENT_5,
			description: 'Grok Imagine - xAI image generation',
		},
		{
			path: '/xai/grok-imagine-image/edit',
			methods: ['POST'],
			price: PRICES.CENT_5,
			description: 'Grok Imagine Edit - xAI image editing',
		},
		// Video generation
		{
			path: '/fal-ai/stable-video',
			methods: ['POST'],
			price: PRICES.CENT_10,
			description: 'Stable Video Diffusion - Image-to-video generation',
		},
		{
			path: '/fal-ai/minimax/video-01',
			methods: ['POST'],
			price: PRICES.CENT_10,
			description: 'MiniMax Video-01 - Text/image to video generation',
		},
		{
			path: '/fal-ai/minimax/video-01-live',
			methods: ['POST'],
			price: PRICES.CENT_10,
			description: 'MiniMax Video-01 Live - Real-time video generation',
		},
		{
			path: '/xai/grok-imagine-video/text-to-video',
			methods: ['POST'],
			price: PRICES.CENT_10,
			description: 'Grok Imagine Video - xAI text-to-video generation',
		},
		{
			path: '/xai/grok-imagine-video/image-to-video',
			methods: ['POST'],
			price: PRICES.CENT_10,
			description: 'Grok Imagine Video - xAI image-to-video generation',
		},
		// Catch-all for other fal-ai models
		{
			path: '/fal-ai/:model',
			methods: ['POST'],
			price: PRICES.CENT_3,
			description: 'fal.ai model generation',
		},
		{
			path: '/fal-ai/:namespace/:model',
			methods: ['POST'],
			price: PRICES.CENT_3,
			description: 'fal.ai model generation (with namespace)',
		},
	],
}
