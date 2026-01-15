import type { PaymentChallenge, PaymentCredential, PaymentReceipt } from './types.js'

export function base64urlEncode(input: string): string {
	const base64 = btoa(input)
	return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function base64urlDecode(input: string): string {
	let base64 = input.replace(/-/g, '+').replace(/_/g, '/')
	const padding = base64.length % 4
	if (padding) {
		base64 += '='.repeat(4 - padding)
	}
	return atob(base64)
}

function encodeJson<T>(obj: T): string {
	return base64urlEncode(JSON.stringify(obj))
}

export function decodeJson<T>(encoded: string): T {
	return JSON.parse(base64urlDecode(encoded)) as T
}

export function generateChallengeId(): string {
	const bytes = new Uint8Array(16)
	crypto.getRandomValues(bytes)
	return base64urlEncode(String.fromCharCode(...bytes))
}

export function formatWwwAuthenticate<T>(challenge: PaymentChallenge<T>): string {
	const parts: string[] = ['Payment']

	const params: string[] = [
		`id="${challenge.id}"`,
		`realm="${challenge.realm}"`,
		`method="${challenge.method}"`,
		`intent="${challenge.intent}"`,
		`request="${encodeJson(challenge.request)}"`,
	]

	if (challenge.expires) {
		params.push(`expires="${challenge.expires}"`)
	}

	if (challenge.description) {
		params.push(`description="${challenge.description}"`)
	}

	parts.push(params.join(', '))
	return parts.join(' ')
}

export function formatAuthorization(credential: PaymentCredential): string {
	return `Payment ${encodeJson(credential)}`
}

export function formatReceipt(receipt: PaymentReceipt): string {
	return encodeJson(receipt)
}
