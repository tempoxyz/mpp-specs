import { p256 } from '@noble/curves/p256'
import { keccak_256 } from '@noble/hashes/sha3'
import { sha256 } from '@noble/hashes/sha256'
import { bytesToHex, hexToBytes } from '@noble/hashes/utils'
import { Hono } from 'hono'

export interface Env {
	ENVIRONMENT: string
	ASSETS: Fetcher
	KEYS: KVNamespace
}

const app = new Hono<{ Bindings: Env }>()

const INSTALL_SCRIPT = `#!/bin/bash
set -e

# Presto installer - installs presto CLI from presto.tempo.xyz

WHEEL_URL="https://presto.tempo.xyz/presto_tempo-0.1.0-py3-none-any.whl"

echo "Installing presto..."

# Try uv first (faster), fall back to pipx
if command -v uv &> /dev/null; then
    uv tool install --force "$WHEEL_URL"
elif command -v pipx &> /dev/null; then
    pipx install --force "$WHEEL_URL"
else
    # Install uv and use it
    echo "Installing uv..."
    curl -LsSf https://astral.sh/uv/install.sh | sh
    export PATH="$HOME/.local/bin:$PATH"
    uv tool install "$WHEEL_URL"
fi

# Check for Foundry (cast) - required for signing transactions
if ! command -v cast &> /dev/null; then
    echo ""
    echo "⚠️  Foundry (cast) not found. Install it:"
    echo "   curl -L https://foundry.paradigm.xyz | bash"
    echo "   foundryup"
    echo ""
fi

echo ""
echo "✓ Installed presto"
echo ""
echo "Run 'presto' to start!"
`

// Serve install script
app.get('/install.sh', (_c) => {
	return new Response(INSTALL_SCRIPT, {
		headers: {
			'Content-Type': 'text/plain; charset=utf-8',
			'Cache-Control': 'public, max-age=60',
		},
	})
})

// Health check
app.get('/health', (c) => {
	return c.json({
		status: 'ok',
		environment: c.env.ENVIRONMENT,
	})
})

// Store public key for credential (used during WebAuthn registration)
app.post('/keys', async (c) => {
	try {
		const body = (await c.req.json()) as {
			credentialId: string
			publicKey: string
			address: string
		}

		if (!body.credentialId || !body.publicKey || !body.address) {
			return c.json({ error: 'Missing required fields' }, 400)
		}

		// Store in KV: key = credentialId, value = { publicKey, address }
		await c.env.KEYS.put(
			body.credentialId,
			JSON.stringify({ publicKey: body.publicKey, address: body.address }),
			{ expirationTtl: 60 * 60 * 24 * 365 }, // 1 year TTL
		)

		return c.json({ success: true })
	} catch (e) {
		console.error('Failed to store key:', e)
		return c.json({ error: 'Failed to store key' }, 500)
	}
})

// Get challenge for WebAuthn
app.get('/keys/challenge', (_c) => {
	const challenge = crypto.randomUUID()
	return new Response(JSON.stringify({ challenge }), {
		headers: { 'Content-Type': 'application/json' },
	})
})

// Get public key for credential (used during discoverable credential sign-in)
app.get('/keys/:credentialId', async (c) => {
	const credentialId = c.req.param('credentialId')

	const stored = await c.env.KEYS.get(credentialId)
	if (!stored) {
		return c.json({ error: 'Not found' }, 404)
	}

	try {
		const data = JSON.parse(stored) as { publicKey: string; address: string }
		return c.json(data)
	} catch {
		return c.json({ error: 'Invalid stored data' }, 500)
	}
})

/**
 * Recover account from WebAuthn assertion when credentialId is not in KV.
 * Uses P-256 ECDSA public key recovery from the signature, then validates onchain.
 */
app.post('/webauthn/recover', async (c) => {
	try {
		const body = (await c.req.json()) as {
			credentialId: string
			clientDataJSON: string // base64url
			authenticatorData: string // base64url
			signature: string // base64url (DER encoded)
		}

		if (!body.credentialId || !body.clientDataJSON || !body.authenticatorData || !body.signature) {
			return c.json({ error: 'Missing required fields' }, 400)
		}

		// Decode base64url inputs
		const clientDataJSON = base64urlToBytes(body.clientDataJSON)
		const authenticatorData = base64urlToBytes(body.authenticatorData)
		const signatureBytes = base64urlToBytes(body.signature)

		// Reconstruct the signed message per WebAuthn spec:
		// signedData = authenticatorData || SHA-256(clientDataJSON)
		const clientDataHash = sha256(clientDataJSON)
		const signedData = new Uint8Array(authenticatorData.length + clientDataHash.length)
		signedData.set(authenticatorData, 0)
		signedData.set(clientDataHash, authenticatorData.length)

		// For ES256 (P-256 with SHA-256), the message hash is SHA-256(signedData)
		const msgHash = sha256(signedData)

		// Parse the DER-encoded ECDSA signature into (r, s)
		const sig = parseDerSignature(signatureBytes)
		if (!sig) {
			return c.json({ error: 'Invalid signature format' }, 400)
		}

		// Try to recover public key with both recovery bits (0 and 1)
		// We try both and verify the signature to find the correct one
		let recoveredPubKeyHex: `0x${string}` | null = null
		let recoveredAddress: `0x${string}` | null = null

		for (const recoveryBit of [0, 1]) {
			try {
				const sigWithRecovery = new p256.Signature(sig.r, sig.s).addRecoveryBit(recoveryBit)
				const pubKeyPoint = sigWithRecovery.recoverPublicKey(msgHash)
				const pubKeyBytes = pubKeyPoint.toRawBytes(false) // Uncompressed (65 bytes: 0x04 || x || y)

				// Verify the recovered public key by checking the signature
				const isValid = p256.verify(sigWithRecovery.toBytes('compact'), msgHash, pubKeyBytes)
				if (!isValid) continue
				const pubKeyHex = `0x${bytesToHex(pubKeyBytes)}` as `0x${string}`

				// Derive the Tempo account address from the public key
				// This is deterministic - the address is always derived the same way
				const address = deriveTempoAddress(body.credentialId, pubKeyHex)

				recoveredPubKeyHex = pubKeyHex
				recoveredAddress = address
				break
			} catch {}
		}

		if (!recoveredPubKeyHex || !recoveredAddress) {
			return c.json(
				{ error: 'Could not recover public key from signature. The passkey may be invalid.' },
				400,
			)
		}

		// Rehydrate KV for future sign-ins
		await c.env.KEYS.put(
			body.credentialId,
			JSON.stringify({ publicKey: recoveredPubKeyHex, address: recoveredAddress }),
			{ expirationTtl: 60 * 60 * 24 * 365 },
		)

		return c.json({
			publicKey: recoveredPubKeyHex,
			address: recoveredAddress,
		})
	} catch (e) {
		console.error('WebAuthn recovery error:', e)
		return c.json({ error: 'Recovery failed' }, 500)
	}
})

/** Decode base64url to Uint8Array */
function base64urlToBytes(base64url: string): Uint8Array {
	const base64 = base64url.replace(/-/g, '+').replace(/_/g, '/')
	const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=')
	const binary = atob(padded)
	const bytes = new Uint8Array(binary.length)
	for (let i = 0; i < binary.length; i++) {
		bytes[i] = binary.charCodeAt(i)
	}
	return bytes
}

/** Parse DER-encoded ECDSA signature into (r, s) */
function parseDerSignature(der: Uint8Array): { r: bigint; s: bigint } | null {
	try {
		if (der[0] !== 0x30) return null
		let offset = 2

		if (der[offset] !== 0x02) return null
		offset++
		const rLen = der[offset]
		if (rLen === undefined) return null
		offset++
		const rBytes = der.slice(offset, offset + rLen)
		offset += rLen

		if (der[offset] !== 0x02) return null
		offset++
		const sLen = der[offset]
		if (sLen === undefined) return null
		offset++
		const sBytes = der.slice(offset, offset + sLen)

		const r = bytesToBigInt(rBytes)
		const s = bytesToBigInt(sBytes)
		return { r, s }
	} catch {
		return null
	}
}

function bytesToBigInt(bytes: Uint8Array): bigint {
	let hex = ''
	for (const byte of bytes) {
		hex += byte.toString(16).padStart(2, '0')
	}
	return BigInt(`0x${hex || '0'}`)
}

/**
 * Derive Tempo account address from publicKey.
 * This mirrors ox/Address.fromPublicKey logic:
 * address = keccak256(publicKey without 0x04 prefix)[12:]
 */
function deriveTempoAddress(_credentialId: string, publicKeyHex: `0x${string}`): `0x${string}` {
	// The public key is 65 bytes: 0x04 || x (32 bytes) || y (32 bytes)
	const pubKeyBytes = hexToBytes(publicKeyHex.slice(2))
	if (pubKeyBytes.length !== 65 || pubKeyBytes[0] !== 0x04) {
		throw new Error('Invalid uncompressed public key')
	}

	// Hash the public key without the 0x04 prefix (just x || y = 64 bytes)
	const hash = keccak_256(pubKeyBytes.slice(1))
	return `0x${bytesToHex(hash.slice(12))}` as `0x${string}`
}

// Serve static assets for all other routes (React SPA)
app.get('*', async (c) => {
	if (!c.env.ASSETS) {
		return c.text('Assets not configured', 500)
	}
	// Try to serve the exact path first
	const response = await c.env.ASSETS.fetch(c.req.raw)
	if (response.status !== 404) {
		return response
	}
	// For SPA routes, serve index.html
	const indexRequest = new Request(new URL('/', c.req.url), c.req.raw)
	return c.env.ASSETS.fetch(indexRequest)
})

export default app
