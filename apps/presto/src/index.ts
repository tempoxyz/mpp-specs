import { Hono } from 'hono'

export interface Env {
	ENVIRONMENT: string
	ASSETS: Fetcher
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
	// For now, just acknowledge - in production this would store in KV
	return c.json({ success: true })
})

// Get challenge for WebAuthn
app.get('/keys/challenge', (_c) => {
	const challenge = crypto.randomUUID()
	return new Response(JSON.stringify({ challenge }), {
		headers: { 'Content-Type': 'application/json' },
	})
})

// Get public key for credential
app.get('/keys/:credentialId', async (_c) => {
	// For now, return not found - in production this would query KV
	return new Response(JSON.stringify({ error: 'Not found' }), {
		status: 404,
		headers: { 'Content-Type': 'application/json' },
	})
})

export default app
