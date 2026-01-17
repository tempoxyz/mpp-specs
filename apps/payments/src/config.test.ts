import { describe, expect, it } from 'vitest'
import type { Env, PartnerConfig } from './config.js'
import { formatApiKey, getApiKey, getPriceForRequest } from './config.js'

describe('getPriceForRequest', () => {
	const mockPartner: PartnerConfig = {
		name: 'Test Partner',
		slug: 'test',
		upstream: 'https://api.test.com',
		apiKeyEnvVar: 'TEST_API_KEY',
		apiKeyHeader: 'Authorization',
		defaultPrice: '10000',
		defaultRequiresPayment: true,
		asset: '0x20c0000000000000000000000000000000000001',
		destination: '0x0aA342d6e4e45D1F6eAE721c4fEf2f61B82f8581',
	}

	it('should return default price for unmatched endpoint', () => {
		const result = getPriceForRequest(mockPartner, 'GET', '/unknown')
		expect(result.requiresPayment).toBe(true)
		expect(result.price).toBe('10000')
	})

	it('should match endpoint by path pattern', () => {
		const partner: PartnerConfig = {
			...mockPartner,
			endpoints: [
				{
					path: '/v1/sessions',
					methods: ['POST'],
					price: '50000',
					description: 'Create session',
				},
			],
		}

		const result = getPriceForRequest(partner, 'POST', '/v1/sessions')
		expect(result.requiresPayment).toBe(true)
		expect(result.price).toBe('50000')
		expect(result.description).toBe('Create session')
	})

	it('should match endpoint with path parameters', () => {
		const partner: PartnerConfig = {
			...mockPartner,
			endpoints: [
				{
					path: '/v1/sessions/:id/extend',
					methods: ['POST'],
					price: '30000',
				},
			],
		}

		const result = getPriceForRequest(partner, 'POST', '/v1/sessions/abc123/extend')
		expect(result.requiresPayment).toBe(true)
		expect(result.price).toBe('30000')
	})

	it("should not match if method doesn't match", () => {
		const partner: PartnerConfig = {
			...mockPartner,
			endpoints: [
				{
					path: '/v1/sessions',
					methods: ['POST'],
					price: '50000',
				},
			],
		}

		const result = getPriceForRequest(partner, 'GET', '/v1/sessions')
		expect(result.requiresPayment).toBe(true)
		expect(result.price).toBe('10000') // Default price
	})

	it('should handle free endpoints', () => {
		const partner: PartnerConfig = {
			...mockPartner,
			endpoints: [
				{
					path: '/v1/health',
					methods: ['GET'],
					requiresPayment: false,
				},
			],
		}

		const result = getPriceForRequest(partner, 'GET', '/v1/health')
		expect(result.requiresPayment).toBe(false)
	})

	it('should use endpoint price when provided', () => {
		const partner: PartnerConfig = {
			...mockPartner,
			endpoints: [
				{
					path: '/v1/sessions',
					methods: ['POST'],
					// No price specified, should use default
				},
			],
		}

		const result = getPriceForRequest(partner, 'POST', '/v1/sessions')
		expect(result.price).toBe('10000') // Default price
	})

	it('should handle defaultRequiresPayment: false', () => {
		const partner: PartnerConfig = {
			...mockPartner,
			defaultRequiresPayment: false,
		}

		const result = getPriceForRequest(partner, 'GET', '/unknown')
		expect(result.requiresPayment).toBe(false)
	})

	it('should normalize path without leading slash', () => {
		const partner: PartnerConfig = {
			...mockPartner,
			endpoints: [
				{
					path: '/v1/sessions',
					methods: ['POST'],
					price: '50000',
				},
			],
		}

		const result1 = getPriceForRequest(partner, 'POST', '/v1/sessions')
		const result2 = getPriceForRequest(partner, 'POST', 'v1/sessions')
		expect(result1).toEqual(result2)
	})
})

describe('formatApiKey', () => {
	const mockPartner: PartnerConfig = {
		name: 'Test Partner',
		slug: 'test',
		upstream: 'https://api.test.com',
		apiKeyEnvVar: 'TEST_API_KEY',
		apiKeyHeader: 'Authorization',
		defaultPrice: '10000',
		asset: '0x20c0000000000000000000000000000000000001',
		destination: '0x0aA342d6e4e45D1F6eAE721c4fEf2f61B82f8581',
	}

	it('should return key as-is when no format specified', () => {
		const result = formatApiKey(mockPartner, 'test-key-123')
		expect(result).toBe('test-key-123')
	})

	it('should format key with Bearer prefix', () => {
		const partner: PartnerConfig = {
			...mockPartner,
			apiKeyFormat: 'Bearer {key}',
		}

		const result = formatApiKey(partner, 'test-key-123')
		expect(result).toBe('Bearer test-key-123')
	})

	it('should handle custom format strings', () => {
		const partner: PartnerConfig = {
			...mockPartner,
			apiKeyFormat: 'ApiKey {key}',
		}

		const result = formatApiKey(partner, 'test-key-123')
		expect(result).toBe('ApiKey test-key-123')
	})
})

describe('getApiKey', () => {
	const mockPartner: PartnerConfig = {
		name: 'Test Partner',
		slug: 'test',
		upstream: 'https://api.test.com',
		apiKeyEnvVar: 'TEST_API_KEY',
		apiKeyHeader: 'Authorization',
		defaultPrice: '10000',
		asset: '0x20c0000000000000000000000000000000000001',
		destination: '0x0aA342d6e4e45D1F6eAE721c4fEf2f61B82f8581',
	}

	it('should return API key from environment', () => {
		const env: Env = {
			ENVIRONMENT: 'test',
			TEMPO_RPC_URL: 'https://rpc.test.com',
			TEST_API_KEY: 'test-key-123',
		}

		const result = getApiKey(mockPartner, env)
		expect(result).toBe('test-key-123')
	})

	it('should return undefined when key not in environment', () => {
		const env: Env = {
			ENVIRONMENT: 'test',
			TEMPO_RPC_URL: 'https://rpc.test.com',
		}

		const result = getApiKey(mockPartner, env)
		expect(result).toBeUndefined()
	})

	it('should handle different env var names', () => {
		const partner: PartnerConfig = {
			...mockPartner,
			apiKeyEnvVar: 'CUSTOM_API_KEY',
		}

		const env: Env = {
			ENVIRONMENT: 'test',
			TEMPO_RPC_URL: 'https://rpc.test.com',
			CUSTOM_API_KEY: 'custom-key-456',
		}

		const result = getApiKey(partner, env)
		expect(result).toBe('custom-key-456')
	})
})
