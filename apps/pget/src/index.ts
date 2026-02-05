import { Hono } from 'hono'
import { createElement } from 'react'
import { renderToReadableStream } from 'react-dom/server.edge'
import { App } from './client/App'

export interface Env {
	ENVIRONMENT: string
	ASSETS: Fetcher
}

const app = new Hono<{ Bindings: Env }>()

const R2_INSTALL_SCRIPT_URL = 'https://pget-binaries.tempo.xyz/install.sh'

app.get('/install.sh', async (_c) => {
	const response = await fetch(R2_INSTALL_SCRIPT_URL)
	if (!response.ok) {
		return new Response('Failed to fetch install script', { status: 502 })
	}
	return new Response(response.body, {
		headers: {
			'Content-Type': 'text/plain; charset=utf-8',
			'Cache-Control': 'public, max-age=60',
		},
	})
})

const LLMS_TXT = `# pget

> A wget-like CLI tool for making HTTP requests with automatic payment support. Handles 402 Payment Required responses with built-in payment methods and permissions.

pget is designed for easy use from scripts, cron jobs, and AI agents. It supports the Web Payment Auth standard (IETF HTTP authentication-based payments).

## Install

- [Install script](https://pget.tempo.xyz/install.sh): Install pget via \`curl -fsSL https://pget.tempo.xyz/install.sh | bash\`

## Docs

- [GitHub repository](https://github.com/tempoxyz/pget): Source code, issues, and documentation
- [Web Payment Auth protocol](https://paymentauth.tempo.xyz): The payment authentication protocol pget implements

## Usage

- \`pget <URL>\`: Make an HTTP request (handles 402 payments automatically)
- \`pget --dry-run <URL>\`: Preview payment without executing
- \`pget --confirm <URL>\`: Require confirmation before paying
- \`pget --max-amount <AMOUNT> <URL>\`: Set maximum payment amount (atomic units)
- \`pget --network <NETWORKS> <URL>\`: Filter to specific networks
- \`pget -v <URL>\`: Verbose output with headers
- \`pget -o <FILE> <URL>\`: Write output to file
- \`pget --json '<DATA>' <URL>\`: POST JSON to a paid endpoint
- \`pget init\`: Initialize or reconfigure your pget setup
- \`pget config\`: View current configuration
- \`pget balance\`: Check wallet balance
- \`pget method list\`: List available payment methods/keystores
- \`pget method new <NAME> --generate\`: Create a new payment method

## About

- [Tempo Labs](https://tempo.xyz): The company behind pget
`

app.get('/llms.txt', (c) => {
	return c.text(LLMS_TXT, 200, {
		'Content-Type': 'text/plain; charset=utf-8',
		'Cache-Control': 'public, max-age=3600',
	})
})

app.get('/health', (c) => {
	return c.json({
		status: 'ok',
		environment: c.env.ENVIRONMENT,
	})
})

app.get('/', async (_c) => {
	const appStream = await renderToReadableStream(createElement(App), {
		bootstrapModules: import.meta.env.DEV ? ['/src/client/index.tsx'] : ['/assets/client.js'],
	})

	const { readable, writable } = new TransformStream()
	const writer = writable.getWriter()
	const encoder = new TextEncoder()

	const cssHref = import.meta.env.DEV ? '/src/client/styles.css' : '/assets/client.css'

	const preamble = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>wget for payments</title>
<meta name="description" content="A wget-like CLI tool for making HTTP requests with automatic payment support. Supports the Web Payment Auth standard." />
<link rel="stylesheet" href="${cssHref}" />
</head>
<body>
<div id="root">`

	const postamble = '</div>\n</body>\n</html>'

	const pipe = async () => {
		await writer.write(encoder.encode(preamble))
		const reader = appStream.getReader()
		while (true) {
			const { done, value } = await reader.read()
			if (done) break
			await writer.write(value)
		}
		await writer.write(encoder.encode(postamble))
		await writer.close()
	}
	pipe()

	return new Response(readable, {
		headers: { 'Content-Type': 'text/html; charset=utf-8' },
	})
})

app.get('*', async (c) => {
	if (!c.env.ASSETS) {
		return c.text('Assets not configured', 500)
	}
	const response = await c.env.ASSETS.fetch(c.req.raw)
	if (response.status !== 404) {
		return response
	}
	const indexRequest = new Request(new URL('/', c.req.url), c.req.raw)
	return c.env.ASSETS.fetch(indexRequest)
})

export default app
