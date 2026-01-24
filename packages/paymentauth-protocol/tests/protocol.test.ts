import { describe, expect, it } from 'vitest'
import {
	type ChargeRequest,
	createEchoedChallenge,
	decodeEchoedRequest,
	decodeJson,
	encodeJson,
	formatAuthorization,
	formatWwwAuthenticate,
	generateChallengeId,
	getChallengeId,
	type PaymentChallenge,
	type PaymentCredential,
	parseAuthorization,
	parseWwwAuthenticate,
} from '../src/index.js'

describe('WWW-Authenticate formatting and parsing', () => {
	const sampleChallenge: PaymentChallenge<ChargeRequest> = {
		id: 'test-challenge-id',
		realm: 'api.example.com',
		method: 'tempo',
		intent: 'charge',
		request: {
			amount: '1000000',
			currency: '0x20c0000000000000000000000000000000000001',
			recipient: '0x742d35Cc6634C0532925a3b844Bc9e7595f8fE00',
			expires: '2025-01-15T12:00:00Z',
			methodDetails: {
				chainId: 42431,
				feePayer: true,
			},
		},
		expires: '2025-01-15T12:05:00Z',
		description: 'Pay to access API',
	}

	it('formats challenge to WWW-Authenticate header', () => {
		const header = formatWwwAuthenticate(sampleChallenge)

		expect(header).toMatch(/^Payment /)
		expect(header).toContain('id="test-challenge-id"')
		expect(header).toContain('realm="api.example.com"')
		expect(header).toContain('method="tempo"')
		expect(header).toContain('intent="charge"')
		expect(header).toContain('request="')
		expect(header).toContain('expires="2025-01-15T12:05:00Z"')
		expect(header).toContain('description="Pay to access API"')
	})

	it('parses WWW-Authenticate header back to challenge', () => {
		const header = formatWwwAuthenticate(sampleChallenge)
		const parsed = parseWwwAuthenticate<ChargeRequest>(header)

		expect(parsed.id).toBe('test-challenge-id')
		expect(parsed.realm).toBe('api.example.com')
		expect(parsed.method).toBe('tempo')
		expect(parsed.intent).toBe('charge')
		expect(parsed.request.amount).toBe('1000000')
		expect(parsed.request.currency).toBe('0x20c0000000000000000000000000000000000001')
		expect(parsed.request.recipient).toBe('0x742d35Cc6634C0532925a3b844Bc9e7595f8fE00')
		expect(parsed.request.methodDetails?.chainId).toBe(42431)
		expect(parsed.request.methodDetails?.feePayer).toBe(true)
	})

	it('throws on invalid header prefix', () => {
		expect(() => parseWwwAuthenticate('Bearer token')).toThrow('must start with "Payment "')
	})

	it('throws on missing required parameters', () => {
		expect(() => parseWwwAuthenticate('Payment id="abc"')).toThrow('missing required parameters')
	})
})

describe('Authorization credential formatting and parsing', () => {
	const sampleCredential: PaymentCredential<ChargeRequest> = {
		challenge: {
			id: 'test-challenge-id',
			realm: 'api.example.com',
			method: 'tempo',
			intent: 'charge',
			request: encodeJson({
				amount: '1000000',
				currency: '0x20c0000000000000000000000000000000000001',
				recipient: '0x742d35Cc6634C0532925a3b844Bc9e7595f8fE00',
				expires: '2025-01-15T12:00:00Z',
			}),
			expires: '2025-01-15T12:05:00Z',
		},
		source: 'did:pkh:eip155:42431:0x1234567890abcdef1234567890abcdef12345678',
		payload: {
			type: 'transaction',
			signature: '0x76f901...',
		},
	}

	it('formats credential to Authorization header', () => {
		const header = formatAuthorization(sampleCredential)

		expect(header).toMatch(/^Payment /)
		expect(header.length).toBeGreaterThan('Payment '.length)
	})

	it('parses Authorization header back to credential', () => {
		const header = formatAuthorization(sampleCredential)
		const parsed = parseAuthorization(header)

		expect(parsed.challenge.id).toBe('test-challenge-id')
		expect(parsed.challenge.realm).toBe('api.example.com')
		expect(parsed.challenge.method).toBe('tempo')
		expect(parsed.challenge.intent).toBe('charge')
		expect(parsed.source).toBe('did:pkh:eip155:42431:0x1234567890abcdef1234567890abcdef12345678')
		expect(parsed.payload.type).toBe('transaction')
		expect(parsed.payload.signature).toBe('0x76f901...')
	})

	it('getChallengeId extracts challenge ID', () => {
		const id = getChallengeId(sampleCredential)
		expect(id).toBe('test-challenge-id')
	})

	it('decodeEchoedRequest decodes request from credential', () => {
		const request = decodeEchoedRequest<ChargeRequest>(sampleCredential)
		expect(request.amount).toBe('1000000')
		expect(request.currency).toBe('0x20c0000000000000000000000000000000000001')
	})

	it('throws on invalid header prefix', () => {
		expect(() => parseAuthorization('Bearer token')).toThrow('must start with "Payment "')
	})

	it('throws on missing challenge field', () => {
		const badCredential = encodeJson({ payload: { type: 'transaction', signature: '0x...' } })
		expect(() => parseAuthorization(`Payment ${badCredential}`)).toThrow('missing "challenge"')
	})
})

describe('createEchoedChallenge', () => {
	it('creates echoed challenge from parsed challenge', () => {
		const challenge: PaymentChallenge<ChargeRequest> = {
			id: 'test-id',
			realm: 'api.test.com',
			method: 'tempo',
			intent: 'charge',
			request: {
				amount: '500000',
				currency: '0x20c0000000000000000000000000000000000001',
				recipient: '0xabcd',
				expires: '2025-01-20T00:00:00Z',
			},
			expires: '2025-01-15T12:00:00Z',
		}

		const echoed = createEchoedChallenge(challenge)

		expect(echoed.id).toBe('test-id')
		expect(echoed.realm).toBe('api.test.com')
		expect(echoed.method).toBe('tempo')
		expect(echoed.intent).toBe('charge')
		expect(echoed.expires).toBe('2025-01-15T12:00:00Z')
		expect(typeof echoed.request).toBe('string') // base64url encoded

		// Decode and verify
		const decoded = decodeJson<ChargeRequest>(echoed.request)
		expect(decoded.amount).toBe('500000')
	})
})

describe('generateChallengeId', () => {
	it('generates unique IDs', () => {
		const id1 = generateChallengeId()
		const id2 = generateChallengeId()

		expect(id1).not.toBe(id2)
		expect(id1.length).toBeGreaterThan(10)
	})
})

describe('New spec field names', () => {
	it('ChargeRequest uses currency and recipient', () => {
		const request: ChargeRequest = {
			amount: '1000',
			currency: '0x20c0000000000000000000000000000000000001',
			recipient: '0x742d35Cc6634C0532925a3b844Bc9e7595f8fE00',
			expires: '2025-01-15T12:00:00Z',
			methodDetails: {
				chainId: 42431,
				feePayer: true,
			},
		}

		expect(request.currency).toBeDefined()
		expect(request.recipient).toBeDefined()
		// @ts-expect-error - Old field names should not exist
		expect(request.asset).toBeUndefined()
		// @ts-expect-error - Old field names should not exist
		expect(request.destination).toBeUndefined()
	})
})
