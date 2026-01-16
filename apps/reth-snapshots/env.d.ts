/// <reference types="@cloudflare/workers-types" />

declare module 'cloudflare:workers' {
	interface Env {
		/** Destination wallet address for payments */
		DESTINATION_ADDRESS: string
		/** Tempo RPC URL */
		TEMPO_RPC_URL: string
		/** Optional: RPC username for authenticated endpoints */
		TEMPO_RPC_USERNAME?: string
		/** Optional: RPC password for authenticated endpoints */
		TEMPO_RPC_PASSWORD?: string
		/** Fee token address (pathUSD) */
		FEE_TOKEN_ADDRESS: string
		/** Price per GB in cents (default: 1) */
		PRICE_PER_GB_CENTS: string
		/** Challenge validity in seconds (default: 600 = 10 minutes) */
		CHALLENGE_VALIDITY_SECONDS: string
		/** R2 bucket for snapshots */
		SNAPSHOTS: R2Bucket
	}
	const env: Env
	export { env, Env }
}
