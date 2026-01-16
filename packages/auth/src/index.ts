/**
 * @tempo/auth - IETF HTTP Message Signatures (RFC 9421) implementation for Tempo
 *
 * This package provides request signing and verification following RFC 9421
 * for secure payment authorization.
 */

export { computeContentDigest, verifyContentDigest } from './content-digest'
export { type KeyResolver, TempoKeyResolver } from './key-resolver'
export { createSigner, type Signer, type SignerOptions, signRequest } from './sign'
export { TempoSigner } from './tempo-signer'
export type { Algorithm, SignatureComponents, SignatureParameters } from './types'
export {
	createVerifier,
	type Verifier,
	type VerifierOptions,
	type VerifyResult,
	verifyRequest,
} from './verify'
