import { beforeEach, describe, expect, it, vi } from 'vitest'
import { setupFetchMock } from './mocks.js'
import { proxyRequest } from './proxy.js'
import {
	createMockContext,
	createMockEnv,
	createMockPartner,
	createMockUpstreamResponse,
} from './test-utils.js'

// Mock fetch globally
const fetchMock = setupFetchMock()
global.fetch = fetchMock

describe('proxyRequest', () => {
	const mockEnv = createMockEnv({
		TEST_API_KEY: 'test-api-key-123',
	})

	const mockPartner = createMockPartner()

	beforeEach(() => {
		vi.clearAllMocks()
		// Reset fetch mock to default behavior
		fetchMock.mockResolvedValue(createMockUpstreamResponse({ success: true }))
	})

	it('should proxy GET request with API key', async () => {
		const mockResponse = createMockUpstreamResponse({ data: 'test' })
		fetchMock.mockResolvedValueOnce(mockResponse)

		const req = new Request('https://test.com/v1/data?foo=bar', {
			method: 'GET',
		})
		const c = createMockContext(req, mockEnv)

		const result = await proxyRequest(c, mockPartner, '/v1/data')

		expect(result.response.status).toBe(200)
		expect(result.upstreamLatencyMs).toBeGreaterThanOrEqual(0)

		// Verify fetch was called with correct Request
		const fetchCall = vi.mocked(global.fetch).mock.calls[0]
		expect(fetchCall).toBeDefined()
		const upstreamRequest = fetchCall![0] as Request
		expect(upstreamRequest.url).toBe('https://api.test.com/v1/data?foo=bar')
		expect(upstreamRequest.method).toBe('GET')
		expect(upstreamRequest.headers.get('Authorization')).toBe('Bearer test-api-key-123')
	})

	it('should proxy POST request with body', async () => {
		const mockResponse = createMockUpstreamResponse({ success: true }, 201)
		fetchMock.mockResolvedValueOnce(mockResponse)

		const body = JSON.stringify({ name: 'test' })
		const req = new Request('https://test.com/v1/create', {
			method: 'POST',
			body,
			headers: { 'Content-Type': 'application/json' },
		})
		const c = createMockContext(req, mockEnv)

		const result = await proxyRequest(c, mockPartner, '/v1/create')

		expect(result.response.status).toBe(201)

		const fetchCall = vi.mocked(global.fetch).mock.calls[0]
		expect(fetchCall).toBeDefined()
		const upstreamRequest = fetchCall![0] as Request
		expect(upstreamRequest.method).toBe('POST')
		const upstreamBody = await upstreamRequest.text()
		expect(upstreamBody).toBe(body)
	})

	it('should preserve client Authorization header in passthrough mode', async () => {
		const mockResponse = createMockUpstreamResponse('OK')
		fetchMock.mockResolvedValueOnce(mockResponse)

		const req = new Request('https://test.com/v1/data', {
			method: 'GET',
			headers: { Authorization: 'Bearer client-token' },
		})
		const c = createMockContext(req, mockEnv)

		await proxyRequest(c, mockPartner, '/v1/data', {
			preserveClientAuth: true,
		})

		const fetchCall = vi.mocked(global.fetch).mock.calls[0]
		expect(fetchCall).toBeDefined()
		const upstreamRequest = fetchCall![0] as Request
		expect(upstreamRequest.headers.get('Authorization')).toBe('Bearer client-token')
	})

	it('should block sensitive headers', async () => {
		const mockResponse = createMockUpstreamResponse('OK')
		fetchMock.mockResolvedValueOnce(mockResponse)

		const req = new Request('https://test.com/v1/data', {
			method: 'GET',
			headers: {
				Host: 'test.com',
				'X-Forwarded-For': '1.2.3.4',
				'CF-Ray': 'abc123',
				'Custom-Header': 'should-pass',
			},
		})
		const c = createMockContext(req, mockEnv)

		await proxyRequest(c, mockPartner, '/v1/data')

		const fetchCall = vi.mocked(global.fetch).mock.calls[0]
		expect(fetchCall).toBeDefined()
		const upstreamRequest = fetchCall![0] as Request

		// Blocked headers should not be present
		expect(upstreamRequest.headers.get('Host')).toBeNull()
		expect(upstreamRequest.headers.get('X-Forwarded-For')).toBeNull()
		expect(upstreamRequest.headers.get('CF-Ray')).toBeNull()

		// Custom header should pass through
		expect(upstreamRequest.headers.get('Custom-Header')).toBe('should-pass')
	})

	it('should add proxy metadata headers to response', async () => {
		const mockResponse = createMockUpstreamResponse('OK', 200, {
			'Content-Type': 'text/plain',
		})
		fetchMock.mockResolvedValueOnce(mockResponse)

		const req = new Request('https://test.com/v1/data', { method: 'GET' })
		const c = createMockContext(req, mockEnv)

		const result = await proxyRequest(c, mockPartner, '/v1/data')

		expect(result.response.headers.get('X-Proxy-Upstream')).toBe('https://api.test.com')
		expect(result.response.headers.get('X-Proxy-Latency-Ms')).toBeTruthy()
	})

	it('should handle upstream URL path joining correctly', async () => {
		const partner = createMockPartner({
			upstream: 'https://api.test.com/base',
		})

		const mockResponse = createMockUpstreamResponse('OK')
		fetchMock.mockResolvedValueOnce(mockResponse)

		const req = new Request('https://test.com/v1/data', { method: 'GET' })
		const c = createMockContext(req, mockEnv)

		await proxyRequest(c, partner, '/v1/data')

		const fetchCall = vi.mocked(global.fetch).mock.calls[0]
		expect(fetchCall).toBeDefined()
		const upstreamRequest = fetchCall![0] as Request
		expect(upstreamRequest.url).toBe('https://api.test.com/base/v1/data')
	})

	it('should handle upstream URL with trailing slash', async () => {
		const partner = createMockPartner({
			upstream: 'https://api.test.com/base/',
		})

		const mockResponse = createMockUpstreamResponse('OK')
		fetchMock.mockResolvedValueOnce(mockResponse)

		const req = new Request('https://test.com/v1/data', { method: 'GET' })
		const c = createMockContext(req, mockEnv)

		await proxyRequest(c, partner, '/v1/data')

		const fetchCall = vi.mocked(global.fetch).mock.calls[0]
		expect(fetchCall).toBeDefined()
		const upstreamRequest = fetchCall![0] as Request
		expect(upstreamRequest.url).toBe('https://api.test.com/base/v1/data')
	})

	it('should throw error when API key is missing', async () => {
		const envWithoutKey = createMockEnv({
			TEST_API_KEY: undefined,
		})

		const req = new Request('https://test.com/v1/data', { method: 'GET' })
		const c = createMockContext(req, envWithoutKey)

		await expect(proxyRequest(c, mockPartner, '/v1/data')).rejects.toThrow('API key not configured')
	})

	it('should use custom API key header', async () => {
		const partner = createMockPartner({
			apiKeyHeader: 'X-API-Key',
			apiKeyFormat: undefined, // No format
		})

		const mockResponse = createMockUpstreamResponse('OK')
		fetchMock.mockResolvedValueOnce(mockResponse)

		const req = new Request('https://test.com/v1/data', { method: 'GET' })
		const c = createMockContext(req, mockEnv)

		await proxyRequest(c, partner, '/v1/data')

		const fetchCall = vi.mocked(global.fetch).mock.calls[0]
		expect(fetchCall).toBeDefined()
		const upstreamRequest = fetchCall![0] as Request
		expect(upstreamRequest.headers.get('X-API-Key')).toBe('test-api-key-123')
	})

	it('should preserve query parameters', async () => {
		const mockResponse = createMockUpstreamResponse('OK')
		fetchMock.mockResolvedValueOnce(mockResponse)

		const req = new Request('https://test.com/v1/data?foo=bar&baz=qux', {
			method: 'GET',
		})
		const c = createMockContext(req, mockEnv)

		await proxyRequest(c, mockPartner, '/v1/data')

		const fetchCall = vi.mocked(global.fetch).mock.calls[0]
		expect(fetchCall).toBeDefined()
		const upstreamRequest = fetchCall![0] as Request
		expect(upstreamRequest.url).toBe('https://api.test.com/v1/data?foo=bar&baz=qux')
	})

	it('should block response headers correctly', async () => {
		const mockResponse = createMockUpstreamResponse('OK', 200, {
			'Content-Type': 'text/plain',
			'Content-Encoding': 'gzip',
			'Transfer-Encoding': 'chunked',
			Connection: 'keep-alive',
			'Custom-Header': 'should-pass',
		})
		fetchMock.mockResolvedValueOnce(mockResponse)

		const req = new Request('https://test.com/v1/data', { method: 'GET' })
		const c = createMockContext(req, mockEnv)

		const result = await proxyRequest(c, mockPartner, '/v1/data')

		// Blocked headers should not be present
		expect(result.response.headers.get('Content-Encoding')).toBeNull()
		expect(result.response.headers.get('Transfer-Encoding')).toBeNull()
		expect(result.response.headers.get('Connection')).toBeNull()

		// Other headers should pass through
		expect(result.response.headers.get('Content-Type')).toContain('text/plain')
		expect(result.response.headers.get('Custom-Header')).toBe('should-pass')
	})
})
