/**
 * Standard API response wrapper
 */
export interface ApiResponseType<T> {
  data: T
  meta?: {
    requestId: string
    timestamp: string
  }
}

/**
 * Standard API error
 */
export interface ApiErrorType {
  error: string
  code?: string
  details?: Record<string, unknown>
  requestId?: string
}

/**
 * Create a success response
 */
export function ApiResponse<T>(
  data: T,
  requestId?: string
): Response {
  const body: ApiResponseType<T> = {
    data,
    meta: requestId ? {
      requestId,
      timestamp: new Date().toISOString()
    } : undefined
  }
  
  return Response.json(body)
}

/**
 * Create an error response
 */
export function ApiError(
  error: string,
  status: number,
  options?: {
    code?: string
    details?: Record<string, unknown>
    requestId?: string
  }
): Response {
  const body: ApiErrorType = {
    error,
    ...options
  }
  
  return Response.json(body, { status })
}
