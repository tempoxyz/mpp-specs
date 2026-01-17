/**
 * Centralized mock definitions for payments tests
 * This file provides type-safe mock factories and utilities
 */

import type { Address, Hex } from 'viem'
import { vi } from 'vitest'

/**
 * Mock viem transaction verification result
 */
export interface MockTransactionVerification {
	valid: boolean
	error?: string
	from?: Address
}

/**
 * Factory for creating mock transaction verification results
 */
export function createMockVerification(
	overrides: Partial<MockTransactionVerification> = {},
): MockTransactionVerification {
	return {
		valid: true,
		from: '0x1234567890123456789012345678901234567890' as Address,
		...overrides,
	}
}

/**
 * Setup default mocks for viem functions
 */
export function setupViemMocks() {
	const mocks = {
		recoverTransactionAddress: vi.fn(),
		parseTransaction: vi.fn(),
		decodeFunctionData: vi.fn(),
		isAddressEqual: vi.fn(),
		createPublicClient: vi.fn(),
		http: vi.fn(),
	}

	// Set default return values
	mocks.isAddressEqual.mockReturnValue(true)
	mocks.decodeFunctionData.mockReturnValue({
		functionName: 'transfer',
		args: ['0x0aA342d6e4e45D1F6eAE721c4fEf2f61B82f8581' as Address, BigInt(120000)],
	})
	mocks.recoverTransactionAddress.mockResolvedValue(
		'0x1234567890123456789012345678901234567890' as Address,
	)
	mocks.createPublicClient.mockReturnValue({
		waitForTransactionReceipt: vi.fn().mockResolvedValue({
			blockNumber: BigInt(12345),
		}),
	})

	return mocks
}

/**
 * Setup default mocks for viem/tempo functions
 */
export function setupTempoMocks() {
	const mocks = {
		deserialize: vi.fn(),
		isTempo: vi.fn(),
		serialize: vi.fn(),
	}

	// Set default return values
	mocks.isTempo.mockReturnValue(true)
	mocks.deserialize.mockReturnValue({
		calls: [
			{
				to: '0x20c0000000000000000000000000000000000001' as Address,
				data: '0xa9059cbb' as Hex, // transfer function selector
			},
		],
		from: '0x1234567890123456789012345678901234567890' as Address,
	})

	return mocks
}

/**
 * Setup default fetch mock for RPC calls
 */
export function setupFetchMock() {
	const fetchMock = vi.fn()

	fetchMock.mockResolvedValue(
		new Response(
			JSON.stringify({
				jsonrpc: '2.0',
				id: 1,
				result: '0xabcdef1234567890',
			}),
			{ status: 200 },
		),
	)

	return fetchMock
}

/**
 * Reset all mocks to their default state
 */
export function resetAllMocks() {
	vi.clearAllMocks()
}
