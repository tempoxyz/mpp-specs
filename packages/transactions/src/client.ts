import { computeContentDigest, signRequest, TempoSigner } from '@tempo/auth'
import type { AccessKey, CreateAccessKeyInput } from './access-keys'
import type {
	ApiResponse,
	CreateTransactionInput,
	ListTransactionsInput,
	ListTransactionsResponse,
	Transaction,
} from './types'

export interface TempoClientOptions {
	baseUrl: string
	keyId: string
	privateKey: string
	fetch?: typeof globalThis.fetch
}

export class TempoClient {
	private baseUrl: string
	private signer: TempoSigner
	private fetch: typeof globalThis.fetch

	readonly transactions: TransactionsAPI
	readonly accessKeys: AccessKeysAPI
	readonly webhooks: WebhooksAPI

	constructor(options: TempoClientOptions) {
		this.baseUrl = options.baseUrl.replace(/\/$/, '')
		this.signer = new TempoSigner({
			keyId: options.keyId,
			privateKey: options.privateKey,
		})
		this.fetch = options.fetch ?? globalThis.fetch.bind(globalThis)

		this.transactions = new TransactionsAPI(this)
		this.accessKeys = new AccessKeysAPI(this)
		this.webhooks = new WebhooksAPI(this)
	}

	async request<T>(method: string, path: string, body?: unknown): Promise<ApiResponse<T>> {
		const url = `${this.baseUrl}${path}`
		const headers: HeadersInit = {
			'Content-Type': 'application/json',
			Accept: 'application/json',
		}

		let request = new Request(url, {
			method,
			headers,
			body: body ? JSON.stringify(body) : undefined,
		})

		// Add Content-Digest for requests with body
		if (body) {
			const digest = await computeContentDigest(JSON.stringify(body))
			request = new Request(request.url, {
				method: request.method,
				headers: {
					...Object.fromEntries(request.headers),
					'Content-Digest': digest,
				},
				body: JSON.stringify(body),
			})
		}

		// Sign the request
		request = await signRequest(request, this.signer, {
			covered: [
				'@method',
				'@target-uri',
				'@authority',
				'content-type',
				...(body ? ['content-digest'] : []),
			],
		})

		const response = await this.fetch(request)

		if (!response.ok) {
			const errorBody = (await response.json().catch(() => ({ error: 'Unknown error' }))) as {
				error?: string
				code?: string
				requestId?: string
			}
			throw new TempoAPIError(
				errorBody.error ?? 'Request failed',
				response.status,
				errorBody.code,
				errorBody.requestId,
			)
		}

		return response.json()
	}
}

class TransactionsAPI {
	constructor(private client: TempoClient) {}

	async create(input: CreateTransactionInput): Promise<Transaction> {
		const headers: Record<string, string> = {}
		if (input.idempotencyKey) {
			headers['Tempo-Idempotency-Key'] = input.idempotencyKey
		}

		const response = await this.client.request<Transaction>('POST', '/api/v1/transactions', input)
		return response.data
	}

	async get(id: string): Promise<Transaction> {
		const response = await this.client.request<Transaction>('GET', `/api/v1/transactions/${id}`)
		return response.data
	}

	async list(input: ListTransactionsInput = {}): Promise<ListTransactionsResponse> {
		const params = new URLSearchParams()
		if (input.status) params.set('status', input.status)
		if (input.createdAfter) params.set('created_after', input.createdAfter)
		if (input.createdBefore) params.set('created_before', input.createdBefore)
		if (input.limit) params.set('limit', String(input.limit))
		if (input.cursor) params.set('cursor', input.cursor)

		const query = params.toString()
		const path = `/api/v1/transactions${query ? `?${query}` : ''}`

		const response = await this.client.request<ListTransactionsResponse>('GET', path)
		return response.data
	}

	async cancel(id: string, reason?: string): Promise<Transaction> {
		const response = await this.client.request<Transaction>(
			'POST',
			`/api/v1/transactions/${id}/cancel`,
			{ reason },
		)
		return response.data
	}
}

class AccessKeysAPI {
	constructor(private client: TempoClient) {}

	async create(input: CreateAccessKeyInput): Promise<AccessKey & { privateKey: string }> {
		const response = await this.client.request<AccessKey & { privateKey: string }>(
			'POST',
			'/api/v1/access-keys',
			input,
		)
		return response.data
	}

	async get(id: string): Promise<AccessKey> {
		const response = await this.client.request<AccessKey>('GET', `/api/v1/access-keys/${id}`)
		return response.data
	}

	async list(): Promise<AccessKey[]> {
		const response = await this.client.request<AccessKey[]>('GET', '/api/v1/access-keys')
		return response.data
	}

	async rotate(id: string): Promise<AccessKey & { privateKey: string }> {
		const response = await this.client.request<AccessKey & { privateKey: string }>(
			'POST',
			`/api/v1/access-keys/${id}/rotate`,
		)
		return response.data
	}

	async revoke(id: string): Promise<void> {
		await this.client.request<void>('DELETE', `/api/v1/access-keys/${id}`)
	}
}

class WebhooksAPI {
	constructor(private client: TempoClient) {}

	async create(input: {
		url: string
		events: string[]
		secret?: string
	}): Promise<{ id: string; secret: string }> {
		const response = await this.client.request<{ id: string; secret: string }>(
			'POST',
			'/api/v1/webhooks',
			input,
		)
		return response.data
	}

	async delete(id: string): Promise<void> {
		await this.client.request<void>('DELETE', `/api/v1/webhooks/${id}`)
	}
}

export class TempoAPIError extends Error {
	constructor(
		message: string,
		public status: number,
		public code?: string,
		public requestId?: string,
	) {
		super(message)
		this.name = 'TempoAPIError'
	}
}
