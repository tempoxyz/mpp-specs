/**
 * @tempo/auth - IETF HTTP Message Signatures (RFC 9421) implementation for Tempo
 * 
 * This package provides request signing and verification following RFC 9421
 * for secure payment authorization.
 */

export { signRequest, createSigner, type SignerOptions, type Signer } from './sign'
export { verifyRequest, createVerifier, type VerifierOptions, type Verifier, type VerifyResult } from './verify'
export { TempoSigner } from './tempo-signer'
export { TempoKeyResolver, type KeyResolver } from './key-resolver'
export { computeContentDigest, verifyContentDigest } from './content-digest'
export type { SignatureComponents, SignatureParameters } from './types'
