/**
 * Content-Digest header utilities (RFC 9530)
 * Used for request body integrity verification
 */

type DigestAlgorithm = 'sha-256' | 'sha-512'

/**
 * Compute the Content-Digest header value for a request body
 */
export async function computeContentDigest(
  body: string | ArrayBuffer | Uint8Array,
  algorithm: DigestAlgorithm = 'sha-256'
): Promise<string> {
  const data = typeof body === 'string'
    ? new TextEncoder().encode(body)
    : body instanceof Uint8Array
    ? body
    : new Uint8Array(body)
  
  const hashName = algorithm === 'sha-256' ? 'SHA-256' : 'SHA-512'
  const hash = await crypto.subtle.digest(hashName, data)
  const base64 = btoa(String.fromCharCode(...new Uint8Array(hash)))
  
  return `${algorithm}=:${base64}:`
}

/**
 * Verify the Content-Digest header matches the body
 */
export async function verifyContentDigest(
  body: string | ArrayBuffer | Uint8Array,
  contentDigest: string
): Promise<boolean> {
  // Parse the digest header
  const match = contentDigest.match(/^(sha-256|sha-512)=:([^:]+):$/)
  if (!match) {
    return false
  }
  
  const [, algorithm, providedHash] = match
  
  // Compute expected digest
  const expected = await computeContentDigest(body, algorithm as DigestAlgorithm)
  const expectedMatch = expected.match(/:([^:]+):$/)
  
  if (!expectedMatch) {
    return false
  }
  
  return expectedMatch[1] === providedHash
}

/**
 * Create a Request with Content-Digest header added
 */
export async function addContentDigest(
  request: Request,
  algorithm: DigestAlgorithm = 'sha-256'
): Promise<Request> {
  if (!request.body) {
    return request
  }
  
  const body = await request.clone().arrayBuffer()
  const digest = await computeContentDigest(body, algorithm)
  
  const headers = new Headers(request.headers)
  headers.set('Content-Digest', digest)
  
  return new Request(request.url, {
    method: request.method,
    headers,
    body,
    redirect: request.redirect
  })
}
