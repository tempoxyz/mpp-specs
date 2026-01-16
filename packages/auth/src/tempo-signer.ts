import type { Signer } from './sign'
import type { Algorithm } from './types'

export interface TempoSignerOptions {
	keyId: string
	privateKey: string | CryptoKey
	algorithm?: Algorithm
}

/**
 * Tempo-specific signer implementation
 * Wraps the generic signer with Tempo defaults
 */
export class TempoSigner implements Signer {
	readonly keyId: string
	readonly algorithm: Algorithm
	private privateKey: CryptoKey | null = null
	private privateKeyString: string | null = null

	constructor(options: TempoSignerOptions) {
		this.keyId = options.keyId
		this.algorithm = options.algorithm ?? 'ed25519'

		if (typeof options.privateKey === 'string') {
			this.privateKeyString = options.privateKey
		} else {
			this.privateKey = options.privateKey
		}
	}

	async sign(data: Uint8Array): Promise<Uint8Array> {
		const key = await this.getPrivateKey()

		const signature = await crypto.subtle.sign(this.getSignAlgorithm(), key, data)

		return new Uint8Array(signature)
	}

	private async getPrivateKey(): Promise<CryptoKey> {
		if (this.privateKey) {
			return this.privateKey
		}

		if (!this.privateKeyString) {
			throw new Error('No private key available')
		}

		// Import the key
		const keyData = Uint8Array.from(atob(this.privateKeyString), (c) => c.charCodeAt(0))

		this.privateKey = await crypto.subtle.importKey(
			'pkcs8',
			keyData,
			this.getKeyAlgorithm(),
			false,
			['sign'],
		)

		return this.privateKey
	}

	private getKeyAlgorithm(): Parameters<typeof crypto.subtle.importKey>[2] {
		switch (this.algorithm) {
			case 'ed25519':
				return { name: 'Ed25519' }
			case 'ecdsa-p256-sha256':
				return { name: 'ECDSA', namedCurve: 'P-256' }
			case 'rsa-pss-sha512':
				return { name: 'RSA-PSS', hash: 'SHA-512' }
			default:
				throw new Error(`Unsupported algorithm: ${this.algorithm}`)
		}
	}

	private getSignAlgorithm(): Parameters<typeof crypto.subtle.sign>[0] {
		switch (this.algorithm) {
			case 'ed25519':
				return { name: 'Ed25519' }
			case 'ecdsa-p256-sha256':
				return { name: 'ECDSA', hash: 'SHA-256' }
			case 'rsa-pss-sha512':
				return { name: 'RSA-PSS', saltLength: 64 }
			default:
				throw new Error(`Unsupported algorithm: ${this.algorithm}`)
		}
	}
}
