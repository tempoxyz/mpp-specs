/**
 * Minimal AWS SigV4 signer for S3/R2 requests.
 * Based on AWS Signature Version 4 specification.
 */

export interface S3Credentials {
	accessKeyId: string
	secretAccessKey: string
	region?: string
	service?: string
}

/**
 * Sign an S3 request with AWS SigV4.
 */
export async function signS3Request(
	request: Request,
	credentials: S3Credentials,
): Promise<Request> {
	const url = new URL(request.url)
	const region = credentials.region ?? 'auto'
	const service = credentials.service ?? 's3'

	const now = new Date()
	const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '')
	const dateStamp = amzDate.slice(0, 8)

	const headers = new Headers(request.headers)
	headers.set('x-amz-date', amzDate)
	headers.set('host', url.host)

	// Get body hash
	let bodyHash: string
	if (request.body) {
		const bodyBuffer = await request.clone().arrayBuffer()
		bodyHash = await sha256Hex(new Uint8Array(bodyBuffer))
	} else {
		bodyHash = await sha256Hex(new Uint8Array(0))
	}
	headers.set('x-amz-content-sha256', bodyHash)

	// Create canonical request - only include headers with values, and only required headers
	const requiredHeaders = ['host', 'x-amz-date', 'x-amz-content-sha256']
	const headerEntries = [...headers.entries()]
		.filter(([k, v]) => requiredHeaders.includes(k.toLowerCase()) && v.trim() !== '')
		.sort(([a], [b]) => a.localeCompare(b))

	const signedHeaders = headerEntries.map(([k]) => k.toLowerCase()).join(';')

	const canonicalHeaders = headerEntries
		.map(([k, v]) => `${k.toLowerCase()}:${v.trim()}`)
		.join('\n')

	const canonicalUri = url.pathname || '/'
	const canonicalQueryString = [...url.searchParams.entries()]
		.sort(([a], [b]) => a.localeCompare(b))
		.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
		.join('&')

	const canonicalRequest = [
		request.method,
		canonicalUri,
		canonicalQueryString,
		`${canonicalHeaders}\n`,
		signedHeaders,
		bodyHash,
	].join('\n')

	// Create string to sign
	const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`
	const stringToSign = [
		'AWS4-HMAC-SHA256',
		amzDate,
		credentialScope,
		await sha256Hex(new TextEncoder().encode(canonicalRequest)),
	].join('\n')

	// Calculate signature
	const signingKey = await getSignatureKey(credentials.secretAccessKey, dateStamp, region, service)
	const signature = await hmacHex(signingKey, stringToSign)

	// Build authorization header
	const authHeader = [
		`AWS4-HMAC-SHA256 Credential=${credentials.accessKeyId}/${credentialScope}`,
		`SignedHeaders=${signedHeaders}`,
		`Signature=${signature}`,
	].join(', ')

	headers.set('Authorization', authHeader)

	return new Request(request.url, {
		method: request.method,
		headers,
		body: request.body,
		redirect: request.redirect,
	})
}

async function sha256Hex(data: Uint8Array): Promise<string> {
	const hash = await crypto.subtle.digest('SHA-256', data)
	return Array.from(new Uint8Array(hash))
		.map((b) => b.toString(16).padStart(2, '0'))
		.join('')
}

async function hmac(key: ArrayBuffer, data: string): Promise<ArrayBuffer> {
	const cryptoKey = await crypto.subtle.importKey(
		'raw',
		key,
		{ name: 'HMAC', hash: 'SHA-256' },
		false,
		['sign'],
	)
	return crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(data))
}

async function hmacHex(key: ArrayBuffer, data: string): Promise<string> {
	const sig = await hmac(key, data)
	return Array.from(new Uint8Array(sig))
		.map((b) => b.toString(16).padStart(2, '0'))
		.join('')
}

async function getSignatureKey(
	secretKey: string,
	dateStamp: string,
	region: string,
	service: string,
): Promise<ArrayBuffer> {
	const kDate = await hmac(
		new TextEncoder().encode(`AWS4${secretKey}`).buffer as ArrayBuffer,
		dateStamp,
	)
	const kRegion = await hmac(kDate, region)
	const kService = await hmac(kRegion, service)
	return hmac(kService, 'aws4_request')
}
