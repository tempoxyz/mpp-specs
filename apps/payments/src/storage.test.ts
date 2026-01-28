import { describe, expect, it } from 'vitest'
import { getPriceForRequest } from './config.js'
import {
	calculateStoragePrice,
	STORAGE_BASE_FEE,
	STORAGE_MAX_UPLOAD_BYTES,
	STORAGE_PER_MB_FEE,
	storage,
} from './partners/storage.js'

describe('Storage Pricing', () => {
	describe('calculateStoragePrice', () => {
		it('should return base fee for 0 bytes', () => {
			const price = calculateStoragePrice(0)
			// 0 MB = base fee only
			expect(price).toBe(STORAGE_BASE_FEE)
		})

		it('should charge for 1 MB (rounded up from 1 byte)', () => {
			const price = calculateStoragePrice(1)
			// 1 byte rounds up to 1 MB
			const expected = BigInt(STORAGE_BASE_FEE) + BigInt(STORAGE_PER_MB_FEE)
			expect(price).toBe(expected.toString())
		})

		it('should charge for 1 MB for exactly 1 MB', () => {
			const price = calculateStoragePrice(1024 * 1024)
			const expected = BigInt(STORAGE_BASE_FEE) + BigInt(STORAGE_PER_MB_FEE)
			expect(price).toBe(expected.toString())
		})

		it('should charge for 2 MB when size is 1 MB + 1 byte', () => {
			const price = calculateStoragePrice(1024 * 1024 + 1)
			// Rounds up to 2 MB
			const expected = BigInt(STORAGE_BASE_FEE) + BigInt(STORAGE_PER_MB_FEE) * 2n
			expect(price).toBe(expected.toString())
		})

		it('should calculate correct price for 10 MB', () => {
			const price = calculateStoragePrice(10 * 1024 * 1024)
			// $0.001 base + $0.01 * 10 = $0.101 = 101000 base units
			const expected = BigInt(STORAGE_BASE_FEE) + BigInt(STORAGE_PER_MB_FEE) * 10n
			expect(price).toBe(expected.toString())
			expect(price).toBe('101000') // $0.101
		})

		it('should calculate correct price for 100 MB (max upload)', () => {
			const price = calculateStoragePrice(STORAGE_MAX_UPLOAD_BYTES)
			// $0.001 base + $0.01 * 100 = $1.001 = 1001000 base units
			const expected = BigInt(STORAGE_BASE_FEE) + BigInt(STORAGE_PER_MB_FEE) * 100n
			expect(price).toBe(expected.toString())
			expect(price).toBe('1001000') // $1.001
		})

		it('should handle large files correctly', () => {
			// 50 MB file
			const price = calculateStoragePrice(50 * 1024 * 1024)
			// $0.001 base + $0.01 * 50 = $0.501 = 501000 base units
			expect(price).toBe('501000')
		})
	})

	describe('Constants', () => {
		it('should have correct base fee ($0.001)', () => {
			expect(STORAGE_BASE_FEE).toBe('1000')
		})

		it('should have correct per-MB fee ($0.01)', () => {
			expect(STORAGE_PER_MB_FEE).toBe('10000')
		})

		it('should have correct max upload size (100 MB)', () => {
			expect(STORAGE_MAX_UPLOAD_BYTES).toBe(100 * 1024 * 1024)
		})
	})

	describe('Partner Config', () => {
		it('should have correct slug and aliases', () => {
			expect(storage.slug).toBe('storage')
			expect(storage.aliases).toEqual(['s3', 'r2', 'object-storage'])
		})

		it('should use ENV: prefix for upstream', () => {
			expect(storage.upstream).toBe('ENV:STORAGE_ENDPOINT')
		})

		it('should have GET endpoint with dynamic pricing', () => {
			const priceInfo = getPriceForRequest(storage, 'GET', '/bucket/key')
			expect(priceInfo.requiresPayment).toBe(true)
			expect(priceInfo.dynamicPricing).toBe(true)
		})

		it('should have PUT endpoint with dynamic pricing', () => {
			const priceInfo = getPriceForRequest(storage, 'PUT', '/bucket/key')
			expect(priceInfo.requiresPayment).toBe(true)
			expect(priceInfo.dynamicPricing).toBe(true)
		})

		it('should have HEAD endpoint as free', () => {
			const priceInfo = getPriceForRequest(storage, 'HEAD', '/bucket/key')
			expect(priceInfo.requiresPayment).toBe(false)
		})

		it('should have DELETE endpoint with base fee', () => {
			const priceInfo = getPriceForRequest(storage, 'DELETE', '/bucket/key')
			expect(priceInfo.requiresPayment).toBe(true)
			expect(priceInfo.price).toBe(STORAGE_BASE_FEE)
		})

		it('should have LIST endpoint with static price', () => {
			const priceInfo = getPriceForRequest(storage, 'GET', '/bucket')
			expect(priceInfo.requiresPayment).toBe(true)
			expect(priceInfo.price).toBe('10000') // $0.01
		})
	})
})
