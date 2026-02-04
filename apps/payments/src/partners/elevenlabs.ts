import type { PartnerConfig } from '../config.js'
import { PRICES, TOKENS, WALLETS } from '../constants.js'

/**
 * ElevenLabs - AI voice generation platform
 * https://elevenlabs.io
 *
 * Industry-leading text-to-speech with natural voices, voice cloning,
 * and speech-to-text transcription (Scribe).
 *
 * API Docs: https://elevenlabs.io/docs/api-reference
 *
 * Base URL: https://api.elevenlabs.io
 * Auth: xi-api-key header
 */
export const elevenlabs: PartnerConfig = {
	name: 'ElevenLabs',
	slug: 'elevenlabs',
	aliases: ['tts', 'stt', 'voice'],
	upstream: 'https://api.elevenlabs.io',
	apiKeyEnvVar: 'ELEVENLABS_API_KEY',
	apiKeyHeader: 'xi-api-key',
	apiKeyFormat: '{key}',
	defaultPrice: PRICES.CENT_3,
	defaultRequiresPayment: true,
	asset: TOKENS.ALPHA_USD,
	destination: WALLETS.TEST_RECEIVER,
	endpoints: [
		{
			path: '/v1/text-to-speech/:voiceId',
			methods: ['POST'],
			price: PRICES.CENT_3,
			description: 'Convert text to speech audio',
		},
		{
			path: '/v1/text-to-speech/:voiceId/stream',
			methods: ['POST'],
			price: PRICES.CENT_3,
			description: 'Stream text-to-speech audio',
		},
		{
			path: '/v1/speech-to-text',
			methods: ['POST'],
			price: PRICES.CENT_5,
			description: 'Transcribe audio to text (Scribe)',
		},
		{
			path: '/v1/speech-to-text/transcripts/:transcriptionId',
			methods: ['GET'],
			price: PRICES.CENT_1,
			description: 'Get a transcript by ID',
		},
		{
			path: '/v1/voices',
			methods: ['GET'],
			price: PRICES.CENT_1,
			description: 'List available voices',
		},
		{
			path: '/v1/models',
			methods: ['GET'],
			requiresPayment: false,
			description: 'List available models (free)',
		},
	],
}
