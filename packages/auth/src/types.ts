/**
 * Components that can be signed in HTTP Message Signatures
 * Following RFC 9421 specification
 */
export type SignatureComponent =
	| '@method'
	| '@target-uri'
	| '@authority'
	| '@scheme'
	| '@request-target'
	| '@path'
	| '@query'
	| '@query-param'
	| 'content-type'
	| 'content-digest'
	| 'content-length'
	| 'authorization'
	| 'date'
	| 'host'
	| (string & {})

export interface SignatureParameters {
	created?: number
	expires?: number
	nonce?: string
	alg?: 'ed25519' | 'ecdsa-p256-sha256' | 'rsa-pss-sha512' | 'hmac-sha256'
	keyid?: string
	tag?: string
}

export interface SignatureComponents {
	covered: SignatureComponent[]
	parameters: SignatureParameters
}

export interface SignedMessage {
	signature: string
	signatureInput: string
}

export type Algorithm = 'ed25519' | 'ecdsa-p256-sha256' | 'rsa-pss-sha512' | 'hmac-sha256'

export interface PublicKeyInfo {
	keyId: string
	publicKey: CryptoKey | string
	algorithm: Algorithm
}
