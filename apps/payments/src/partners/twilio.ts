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
 * Base URL: https://api.twilio.com/2010-04-01
 * Auth: HTTP Basic (API Key as username, API Secret as password)
 *
 * Note: Twilio requires Account SID in the URL path for most endpoints.
 * The API credentials should be in format: "ACCOUNT_SID:AUTH_TOKEN" or "API_KEY:API_SECRET"
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
			path: '/2010-04-01/Accounts/:accountSid/Messages.json',
			methods: ['POST'],
			price: PRICES.CENT_1,
			description: 'Send an SMS or MMS message',
		},
		{
			path: '/2010-04-01/Accounts/:accountSid/Messages/:messageSid.json',
			methods: ['GET'],
			price: PRICES.CENT_1,
			description: 'Fetch a specific message',
		},
		{
			path: '/2010-04-01/Accounts/:accountSid/Messages.json',
			methods: ['GET'],
			price: PRICES.CENT_1,
			description: 'List messages',
		},
	],
}
