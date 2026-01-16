import type { Algorithm, SignatureComponent } from './types'

export interface SignerOptions {
	keyId: string
	privateKey: CryptoKey
	algorithm: Algorithm
}

export interface Signer {
	keyId: string
	sign: (data: Uint8Array) => Promise<Uint8Array>
	algorithm: Algorithm
}

export function createSigner(options: SignerOptions): Signer {
	return {
		keyId: options.keyId,
		algorithm: options.algorithm,
		sign: async (data: Uint8Array) => {
			const signature = await crypto.subtle.sign(
				getSignAlgorithm(options.algorithm),
				options.privateKey,
				data,
			)
			return new Uint8Array(signature)
		},
	}
}

function getSignAlgorithm(algorithm: Algorithm): Parameters<typeof crypto.subtle.sign>[0] {
	switch (algorithm) {
		case 'ed25519':
			return { name: 'Ed25519' }
		case 'ecdsa-p256-sha256':
			return { name: 'ECDSA', hash: 'SHA-256' }
		case 'rsa-pss-sha512':
			return { name: 'RSA-PSS', saltLength: 64 }
		case 'hmac-sha256':
			return { name: 'HMAC' }
		default:
			throw new Error(`Unsupported algorithm: ${algorithm}`)
	}
}

export interface SignRequestOptions {
	covered: SignatureComponent[]
	created?: number
	expires?: number
	nonce?: string
	label?: string
}

export async function signRequest(
	request: Request,
	signer: Signer,
	options: SignRequestOptions,
): Promise<Request> {
	const label = options.label ?? 'sig1'
	const created = options.created ?? Math.floor(Date.now() / 1000)
	const expires = options.expires
	const nonce = options.nonce ?? crypto.randomUUID()

	// Build signature base
	const signatureBase = await buildSignatureBase(request, options.covered)

	// Build signature params
	const params: string[] = []
	params.push(`created=${created}`)
	if (expires) params.push(`expires=${expires}`)
	params.push(`nonce="${nonce}"`)
	params.push(`keyid="${signer.keyId}"`)
	params.push(`alg="${signer.algorithm}"`)

	const coveredComponents = options.covered.map((c) => `"${c}"`).join(' ')
	const signatureInput = `${label}=(${coveredComponents});${params.join(';')}`

	// Add signature params to base
	const fullBase = `${signatureBase}"@signature-params": (${coveredComponents});${params.join(';')}`

	// Sign
	const signatureBytes = await signer.sign(new TextEncoder().encode(fullBase))
	const signature = `${label}=:${btoa(String.fromCharCode(...signatureBytes))}:`

	// Clone request with new headers
	const headers = new Headers(request.headers)
	headers.set('Signature', signature)
	headers.set('Signature-Input', signatureInput)

	return new Request(request.url, {
		method: request.method,
		headers,
		body: request.body,
		redirect: request.redirect,
	})
}

async function buildSignatureBase(
	request: Request,
	components: SignatureComponent[],
): Promise<string> {
	const url = new URL(request.url)
	const lines: string[] = []

	for (const component of components) {
		let value: string

		switch (component) {
			case '@method':
				value = request.method.toUpperCase()
				break
			case '@target-uri':
				value = request.url
				break
			case '@authority':
				value = url.host
				break
			case '@scheme':
				value = url.protocol.replace(':', '')
				break
			case '@path':
				value = url.pathname
				break
			case '@query':
				value = url.search ? `?${url.search.slice(1)}` : '?'
				break
			default:
				// Header component
				value = request.headers.get(component) ?? ''
		}

		lines.push(`"${component}": ${value}`)
	}

	return `${lines.join('\n')}\n`
}
