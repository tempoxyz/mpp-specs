import { Hono } from 'hono'

export interface Env {
	ENVIRONMENT: string
	ASSETS: Fetcher
}

const app = new Hono<{ Bindings: Env }>()

const INSTALL_SCRIPT = `#!/usr/bin/env bash
set -e

# purl installer script

PURL_BANNER="
 ____  _   _ ____  _
|  _ \\| | | |  _ \\| |
| |_) | | | | |_) | |
|  __/| |_| |  _ <| |___
|_|    \\___/|_| \\_\\_____|

"

echo "$PURL_BANNER"
echo "purl installer"
echo ""

INSTALL_DIR="/usr/local/bin"
BINARY_NAME="purl"

detect_platform() {
    local platform="$(uname -s | tr '[:upper:]' '[:lower:]')"

    case "\${platform}" in
        linux*)     PLATFORM="linux" ;;
        darwin*)    PLATFORM="darwin" ;;
        *)
            echo "Error: Unsupported platform '\${platform}'"
            exit 1
            ;;
    esac
}

detect_arch() {
    local arch="$(uname -m)"

    case "\${arch}" in
        x86_64|amd64)   ARCH="amd64" ;;
        aarch64|arm64)  ARCH="arm64" ;;
        *)
            echo "Error: Unsupported architecture '\${arch}'"
            exit 1
            ;;
    esac
}

install_purl() {
    local download_url="https://purl.tempo.xyz/purl-\${PLATFORM}-\${ARCH}"
    local tmp_file="/tmp/\${BINARY_NAME}"

    echo ""
    echo "Downloading purl..."
    echo "URL: \${download_url}"

    if ! curl -L --progress-bar "\${download_url}" -o "\${tmp_file}"; then
        echo "Error: Download failed"
        exit 1
    fi

    echo ""
    echo "Making binary executable..."
    chmod +x "\${tmp_file}"

    echo "Installing to \${INSTALL_DIR}/\${BINARY_NAME}..."

    if mv "\${tmp_file}" "\${INSTALL_DIR}/\${BINARY_NAME}" 2>/dev/null; then
        echo "Installation successful!"
    elif sudo mv "\${tmp_file}" "\${INSTALL_DIR}/\${BINARY_NAME}"; then
        echo "Installation successful!"
    else
        echo "Error: Failed to install to \${INSTALL_DIR}"
        echo "Try running with sudo or install manually"
        exit 1
    fi
}

verify_installation() {
    echo ""
    if command -v purl >/dev/null 2>&1; then
        echo "purl is installed and available in PATH"
        echo ""
        purl --version
    else
        echo "purl was installed but is not in PATH"
        echo "Make sure \${INSTALL_DIR} is in your PATH"
    fi
}

main() {
    detect_platform
    detect_arch
    install_purl
    verify_installation

    echo ""
    echo "Installation complete!"
    echo ""
    echo "Get started:"
    echo "  purl init          # Configure your wallets"
    echo "  purl --help        # Show all options"
    echo ""
    echo "Documentation:"
    echo "  https://github.com/tempoxyz/purl"
    echo ""
}

main
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
