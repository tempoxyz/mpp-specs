import type { PartnerConfig } from '../config.js'
import { PRICES, TOKENS, WALLETS } from '../constants.js'

/**
 * Twilio - Cloud communications platform
 * https://twilio.com
 *
 * Send SMS, MMS, and manage messaging at scale.
 *
 * API Docs: https://www.twilio.com/docs/messaging/api
 *
 * Base URL: https://api.twilio.com
 * Auth: HTTP Basic (Account SID as username, Auth Token as password)
 *
 * Credentials format: "ACCOUNT_SID:AUTH_TOKEN"
 * The proxy automatically:
 * - Extracts the Account SID to construct the full URL path
 * - Base64-encodes credentials for HTTP Basic auth
 *
 * Client-facing paths are simplified (no Account SID needed):
 *   POST /Messages.json -> POST /2010-04-01/Accounts/{accountSid}/Messages.json
 */
export const twilio: PartnerConfig = {
	name: 'Twilio',
	slug: 'twilio',
	aliases: ['sms'],
	upstream: 'https://api.twilio.com',
	apiKeyEnvVar: 'TWILIO_API_CREDENTIALS',
	apiKeyHeader: 'Authorization',
	apiKeyFormat: 'Basic {key}',
	defaultPrice: PRICES.CENT_1,
	defaultRequiresPayment: true,
	asset: TOKENS.ALPHA_USD,
	destination: WALLETS.TEST_RECEIVER,
	endpoints: [
		{
			path: '/Messages.json',
			methods: ['POST'],
			price: PRICES.CENT_1,
			description: 'Send an SMS or MMS message',
		},
		{
			path: '/Messages/:messageSid.json',
			methods: ['GET'],
			price: PRICES.CENT_1,
			description: 'Fetch a specific message',
		},
		{
			path: '/Messages.json',
			methods: ['GET'],
			price: PRICES.CENT_1,
			description: 'List messages',
		},
	],
}
