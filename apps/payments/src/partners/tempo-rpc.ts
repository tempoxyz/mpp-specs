import type { PartnerConfig } from '../config.js'
import { CONTRACTS, PRICES, STREAMING_DEFAULTS, TOKENS, WALLETS } from '../constants.js'

/**
 * Tempo RPC - Pay-per-use blockchain RPC access
 *
 * Access Tempo blockchain RPC endpoints with payment authentication.
 * Supports both Moderato (testnet) and Presto (mainnet).
 *
 * Pricing: $0.001 per RPC call (1000 base units)
 * Free endpoints: eth_chainId, net_version
 *
 * Supports streaming payment channels for high-frequency usage.
 */
export const temporpc: PartnerConfig = {
	name: 'Tempo RPC',
	slug: 'rpc',
	aliases: ['chain'],
	upstream: 'ENV:TEMPO_RPC_UPSTREAM_URL',
	apiKeyEnvVar: 'TEMPO_RPC_AUTH',
	apiKeyHeader: 'Authorization',
	apiKeyFormat: 'Basic {key}',
	defaultPrice: PRICES.CENT_1,
	defaultRequiresPayment: true,
	asset: TOKENS.ALPHA_USD,
	destination: WALLETS.TEST_RECEIVER,
	endpoints: [
		{
			path: '/',
			methods: ['POST'],
			price: '1000',
			dynamicPricing: false,
			description: 'JSON-RPC calls - $0.001 per call',
		},
	],
	streaming: {
		escrowContract: CONTRACTS.STREAM_ESCROW_MODERATO,
		defaultDeposit: STREAMING_DEFAULTS.DEFAULT_DEPOSIT,
		defaultExpirySeconds: STREAMING_DEFAULTS.DEFAULT_EXPIRY_SECONDS,
		minVoucherDelta: STREAMING_DEFAULTS.MIN_VOUCHER_DELTA,
	},
}
