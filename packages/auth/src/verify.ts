import type { Algorithm } from './types'
import type { KeyResolver } from './key-resolver'

export interface VerifierOptions {
  keyResolver: KeyResolver
  requiredComponents?: string[]
  maxAge?: number
  clockSkew?: number
  requireNonce?: boolean
}

export interface Verifier {
  verify: (request: Request) => Promise<VerifyResult>
}

export interface VerifyResult {
  valid: boolean
  keyId?: string
  error?: string
}

export function createVerifier(options: VerifierOptions): Verifier {
  return {
    verify: (request: Request) => verifyRequest(request, options)
  }
}

export async function verifyRequest(
  request: Request,
  options: VerifierOptions
): Promise<VerifyResult> {
  const signature = request.headers.get('Signature')
  const signatureInput = request.headers.get('Signature-Input')
  
  if (!signature || !signatureInput) {
    return { valid: false, error: 'Missing Signature or Signature-Input headers' }
  }
  
  // Parse signature input
  const parsed = parseSignatureInput(signatureInput)
  if (!parsed) {
    return { valid: false, error: 'Invalid Signature-Input format' }
  }
  
  const { label, components, params } = parsed
  
  // Check required components
  if (options.requiredComponents) {
    for (const required of options.requiredComponents) {
      if (!components.includes(required)) {
        return { valid: false, error: `Missing required component: ${required}` }
      }
    }
  }
  
  // Check timestamp
  if (params.created) {
    const now = Math.floor(Date.now() / 1000)
    const clockSkew = options.clockSkew ?? 60
    
    if (params.created > now + clockSkew) {
      return { valid: false, error: 'Signature created in the future' }
    }
    
    if (options.maxAge && now - params.created > options.maxAge) {
      return { valid: false, error: 'Signature expired (maxAge)' }
    }
  }
  
  // Check expires
  if (params.expires) {
    const now = Math.floor(Date.now() / 1000)
    if (now > params.expires) {
      return { valid: false, error: 'Signature expired' }
    }
  }
  
  // Check nonce
  if (options.requireNonce && !params.nonce) {
    return { valid: false, error: 'Nonce required but not provided' }
  }
  
  // Resolve key
  if (!params.keyid) {
    return { valid: false, error: 'Missing keyid in signature params' }
  }
  
  const keyInfo = await options.keyResolver.resolve(params.keyid)
  if (!keyInfo) {
    return { valid: false, error: `Key not found: ${params.keyid}` }
  }
  
  // Rebuild signature base
  const signatureBase = await rebuildSignatureBase(request, components, signatureInput, label)
  
  // Parse signature value
  const signatureValue = parseSignatureValue(signature, label)
  if (!signatureValue) {
    return { valid: false, error: 'Invalid signature value format' }
  }
  
  // Verify signature
  try {
    const publicKey = typeof keyInfo.publicKey === 'string'
      ? await importPublicKey(keyInfo.publicKey, keyInfo.algorithm)
      : keyInfo.publicKey
    
    const isValid = await crypto.subtle.verify(
      getVerifyAlgorithm(keyInfo.algorithm),
      publicKey,
      signatureValue,
      new TextEncoder().encode(signatureBase)
    )
    
    if (!isValid) {
      return { valid: false, error: 'Signature verification failed' }
    }
    
    return { valid: true, keyId: params.keyid }
  } catch (err) {
    return { valid: false, error: `Verification error: ${err}` }
  }
}

interface ParsedSignatureInput {
  label: string
  components: string[]
  params: {
    created?: number
    expires?: number
    nonce?: string
    keyid?: string
    alg?: Algorithm
  }
}

function parseSignatureInput(input: string): ParsedSignatureInput | null {
  // Format: sig1=("@method" "@target-uri");created=1234;keyid="key-1"
  const match = input.match(/^(\w+)=\(([^)]*)\);?(.*)$/)
  if (!match) return null
  
  const [, label, componentsPart, paramsPart] = match
  
  const components = componentsPart
    .split(' ')
    .map(c => c.replace(/"/g, ''))
    .filter(Boolean)
  
  const params: ParsedSignatureInput['params'] = {}
  
  if (paramsPart) {
    const paramMatches = paramsPart.matchAll(/(\w+)=(?:"([^"]+)"|(\d+))/g)
    for (const [, key, strVal, numVal] of paramMatches) {
      if (key === 'created' || key === 'expires') {
        params[key] = parseInt(numVal ?? strVal, 10)
      } else if (key === 'keyid' || key === 'nonce' || key === 'alg') {
        params[key] = strVal as any
      }
    }
  }
  
  return { label, components, params }
}

function parseSignatureValue(signature: string, label: string): Uint8Array | null {
  const match = signature.match(new RegExp(`${label}=:([^:]+):`))
  if (!match) return null
  
  const base64 = match[1]
  const binary = atob(base64)
  return new Uint8Array([...binary].map(c => c.charCodeAt(0)))
}

async function rebuildSignatureBase(
  request: Request,
  components: string[],
  signatureInput: string,
  label: string
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
        value = request.headers.get(component) ?? ''
    }
    
    lines.push(`"${component}": ${value}`)
  }
  
  // Extract just the params portion after the label
  const paramsMatch = signatureInput.match(new RegExp(`${label}=\\([^)]+\\);?(.*)$`))
  const paramsStr = paramsMatch?.[1] ?? ''
  
  const componentStr = components.map(c => `"${c}"`).join(' ')
  lines.push(`"@signature-params": (${componentStr});${paramsStr}`)
  
  return lines.join('\n')
}

function getVerifyAlgorithm(algorithm: Algorithm): AlgorithmIdentifier | RsaPssParams | EcdsaParams {
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

async function importPublicKey(key: string, algorithm: Algorithm): Promise<CryptoKey> {
  const keyData = Uint8Array.from(atob(key), c => c.charCodeAt(0))
  
  const keyAlgorithm = algorithm === 'ed25519'
    ? { name: 'Ed25519' }
    : algorithm === 'ecdsa-p256-sha256'
    ? { name: 'ECDSA', namedCurve: 'P-256' }
    : { name: 'RSA-PSS', hash: 'SHA-512' }
  
  return crypto.subtle.importKey(
    'spki',
    keyData,
    keyAlgorithm,
    true,
    ['verify']
  )
}
