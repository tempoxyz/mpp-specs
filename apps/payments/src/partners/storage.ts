import type { PartnerConfig } from '../config.js'
import { PRICES, TOKENS, WALLETS } from '../constants.js'

/**
 * S3/R2 Compatible Object Storage - Requester Pays via MPP
 *
 * Enable pay-per-request access to S3 or R2 buckets without API keys.
 * Clients pay per operation using Tempo blockchain payments.
 *
 * This is the MPP equivalent of AWS "Requester Pays" buckets, but:
 * - No AWS account required for requesters
 * - No API keys to manage
 * - Payments settled on Tempo blockchain
 * - Works with any S3-compatible storage (AWS S3, Cloudflare R2, MinIO, etc.)
 *
 * Dynamic Pricing (based on content size):
 * - Base fee: $0.001 per request
 * - Transfer fee: $0.01 per MB (both upload and download)
 * - Max upload size: 100MB (to prevent abuse)
 *
 * For downloads, proxy does HEAD request first to get Content-Length.
 * For uploads, price is calculated from Content-Length header.
 *
 * Usage:
 *   GET /storage/{bucket}/{key}     - Download object (paid by size)
 *   PUT /storage/{bucket}/{key}     - Upload object (paid by size, max 100MB)
 *   DELETE /storage/{bucket}/{key}  - Delete object (base fee only)
 *   GET /storage/{bucket}           - List objects (base fee only)
 *   HEAD /storage/{bucket}/{key}    - Check object exists (free)
 */

/** Base fee per request: $0.001 (1000 base units) */
export const STORAGE_BASE_FEE = '1000'

/** Fee per MB transferred: $0.01 (10000 base units) */
export const STORAGE_PER_MB_FEE = '10000'

/** Maximum upload size in bytes: 100MB */
export const STORAGE_MAX_UPLOAD_BYTES = 100 * 1024 * 1024

/**
 * Calculate storage price based on content size.
 * @param sizeBytes - Content size in bytes
 * @returns Price in base units (6 decimals)
 */
export function calculateStoragePrice(sizeBytes: number): string {
	const baseFee = BigInt(STORAGE_BASE_FEE)
	const perMbFee = BigInt(STORAGE_PER_MB_FEE)
	const sizeMb = Math.ceil(sizeBytes / (1024 * 1024))
	const transferFee = perMbFee * BigInt(sizeMb)
	return (baseFee + transferFee).toString()
}

export const storage: PartnerConfig = {
	name: 'Object Storage',
	slug: 'storage',
	aliases: ['s3', 'r2', 'object-storage'],
	upstream: 'ENV:STORAGE_ENDPOINT', // Set via env var, e.g., https://bucket.s3.amazonaws.com or R2 URL
	apiKeyEnvVar: 'STORAGE_ACCESS_KEY_ID', // Used with STORAGE_ACCESS_KEY_SECRET for S3 signing
	apiKeySecretEnvVar: 'STORAGE_ACCESS_KEY_SECRET', // Secret key for S3 signing
	apiKeyHeader: 'Authorization',
	apiKeyFormat: '{key}',
	defaultPrice: STORAGE_BASE_FEE,
	defaultRequiresPayment: true,
	asset: TOKENS.ALPHA_USD,
	destination: WALLETS.TEST_RECEIVER,
	endpoints: [
		// Object download - dynamic pricing based on object size (HEAD first)
		{
			path: '/:bucket/:key',
			methods: ['GET'],
			dynamicPricing: true,
			description: 'Download object ($0.001 base + $0.01/MB)',
		},
		// Object upload - dynamic pricing based on Content-Length header
		{
			path: '/:bucket/:key',
			methods: ['PUT'],
			dynamicPricing: true,
			description: 'Upload object ($0.001 base + $0.01/MB, max 100MB)',
		},
		// Delete - base fee only
		{
			path: '/:bucket/:key',
			methods: ['DELETE'],
			price: STORAGE_BASE_FEE,
			description: 'Delete object ($0.001)',
		},
		// HEAD - free (needed for size checks)
		{
			path: '/:bucket/:key',
			methods: ['HEAD'],
			requiresPayment: false,
			description: 'Check object metadata (free)',
		},
		// List bucket - base fee only
		{
			path: '/:bucket',
			methods: ['GET'],
			price: PRICES.CENT_1,
			description: 'List objects in bucket ($0.01)',
		},
		// Multipart upload - base fee (parts charged separately)
		{
			path: '/:bucket/:key',
			methods: ['POST'],
			price: STORAGE_BASE_FEE,
			description: 'Initiate/complete multipart upload ($0.001)',
		},
	],
}
