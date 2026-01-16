export type TransactionStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled'

export interface Transaction {
	id: string
	amount: number
	currency: string
	status: TransactionStatus
	senderId: string
	recipientId: string
	memo?: string
	metadata?: Record<string, string>
	createdAt: string
	updatedAt: string
	completedAt?: string
	failedAt?: string
	failureReason?: string
}

export interface CreateTransactionInput {
	amount: number
	currency: string
	recipient: string
	memo?: string
	metadata?: Record<string, string>
	idempotencyKey?: string
}

export interface ListTransactionsInput {
	status?: TransactionStatus
	createdAfter?: string
	createdBefore?: string
	limit?: number
	cursor?: string
}

export interface ListTransactionsResponse {
	data: Transaction[]
	hasMore: boolean
	cursor?: string
}

export interface ApiResponse<T> {
	data: T
	meta?: {
		requestId: string
	}
}

export interface ApiError {
	error: string
	code?: string
	details?: Record<string, unknown>
	requestId?: string
}
