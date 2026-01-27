import { privateKeyToAccount } from 'viem/accounts'
import { describe, expect, it } from 'vitest'
import {
	createCloseRequestTypedData,
	recoverCloseRequestSigner,
	verifyCloseRequest,
} from './close-request'
import type { SignedCloseRequest } from './types'

const TEST_ESCROW = '0x1234567890123456789012345678901234567890' as const
const TEST_CHAIN_ID = 42431

describe('close request', () => {
	const account = privateKeyToAccount(
		'0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
	)

	it('should create close request typed data', () => {
		const typedData = createCloseRequestTypedData(TEST_ESCROW, TEST_CHAIN_ID, {
			channelId: '0x1234567890123456789012345678901234567890123456789012345678901234',
		})

		expect(typedData.primaryType).toBe('CloseRequest')
		expect(typedData.domain.name).toBe('Tempo Stream Channel')
		expect(typedData.domain.version).toBe('1')
		expect(typedData.domain.chainId).toBe(TEST_CHAIN_ID)
		expect(typedData.domain.verifyingContract).toBe(TEST_ESCROW)
		expect(typedData.message.channelId).toBe(
			'0x1234567890123456789012345678901234567890123456789012345678901234',
		)
	})

	it('should sign and recover close request signer', async () => {
		const channelId = '0x1234567890123456789012345678901234567890123456789012345678901234' as const

		const signature = await account.signTypedData({
			domain: {
				name: 'Tempo Stream Channel',
				version: '1',
				chainId: TEST_CHAIN_ID,
				verifyingContract: TEST_ESCROW,
			},
			types: {
				CloseRequest: [{ name: 'channelId', type: 'bytes32' }],
			},
			primaryType: 'CloseRequest',
			message: {
				channelId,
			},
		})

		const closeRequest: SignedCloseRequest = {
			channelId,
			signature,
		}

		const signer = await recoverCloseRequestSigner(TEST_ESCROW, TEST_CHAIN_ID, closeRequest)
		expect(signer.toLowerCase()).toBe(account.address.toLowerCase())
	})

	it('should verify close request correctly', async () => {
		const channelId = '0x1234567890123456789012345678901234567890123456789012345678901234' as const

		const signature = await account.signTypedData({
			domain: {
				name: 'Tempo Stream Channel',
				version: '1',
				chainId: TEST_CHAIN_ID,
				verifyingContract: TEST_ESCROW,
			},
			types: {
				CloseRequest: [{ name: 'channelId', type: 'bytes32' }],
			},
			primaryType: 'CloseRequest',
			message: {
				channelId,
			},
		})

		const closeRequest: SignedCloseRequest = {
			channelId,
			signature,
		}

		const isValid = await verifyCloseRequest(
			TEST_ESCROW,
			TEST_CHAIN_ID,
			closeRequest,
			account.address,
		)
		expect(isValid).toBe(true)

		const isInvalid = await verifyCloseRequest(
			TEST_ESCROW,
			TEST_CHAIN_ID,
			closeRequest,
			'0x0000000000000000000000000000000000000001',
		)
		expect(isInvalid).toBe(false)
	})
})
