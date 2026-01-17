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

// Root - landing page
app.get('/', (c) => {
	return c.html(`<!DOCTYPE html>
<html>
<head>
  <title>Presto</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 600px; margin: 50px auto; padding: 20px; background: #0a0a0b; color: #fafafa; }
    code { background: #1a1a1c; padding: 10px 15px; display: block; border-radius: 4px; color: #3b82f6; }
    h1 { margin-bottom: 30px; }
    a { color: #3b82f6; }
  </style>
</head>
<body>
  <h1>Presto</h1>
  <p>Minimal AI coding agent with Tempo payment authentication.</p>
  <h2>Install</h2>
  <code>curl -fsSL https://presto.tempo.xyz/install.sh | bash</code>
  <h2>Learn More</h2>
  <p><a href="https://github.com/tempoxyz/presto">GitHub</a></p>
</body>
</html>`)
})

// Health check
app.get('/health', (c) => {
	return c.json({
		status: 'ok',
		environment: c.env.ENVIRONMENT,
	})
})

// Let assets handle everything else (wheel files, etc.)
app.all('*', async (c) => {
	return c.env.ASSETS.fetch(c.req.raw)
})

export default app
