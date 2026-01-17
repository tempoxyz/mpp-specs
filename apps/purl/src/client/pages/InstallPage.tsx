import { useState } from 'react'

const INSTALL_COMMAND = 'curl -fsSL https://purl.tempo.xyz/install.sh | bash'

export function InstallPage() {
	const [copied, setCopied] = useState(false)

	const handleCopy = async () => {
		try {
			await navigator.clipboard.writeText(INSTALL_COMMAND)
			setCopied(true)
			setTimeout(() => setCopied(false), 2000)
		} catch {
			// Fallback
			const textarea = document.createElement('textarea')
			textarea.value = INSTALL_COMMAND
			document.body.appendChild(textarea)
			textarea.select()
			document.execCommand('copy')
			document.body.removeChild(textarea)
			setCopied(true)
			setTimeout(() => setCopied(false), 2000)
		}
	}

	return (
		<div className="page">
			<main>
				<h1>purl</h1>
				<p className="tagline">curl for payments</p>

				<p className="description">
					A command-line tool for making HTTP requests with automatic payment support.
				</p>
				<p className="description">
					Works with IETF Web Payment Auth and x402 protocols across Tempo, Solana, and other EVM chains.
				</p>

				<div className="install">
					<code>{INSTALL_COMMAND}</code>
					<button type="button" onClick={handleCopy}>
						{copied ? 'copied' : 'copy'}
					</button>
				</div>

				<div className="examples">
					<pre>{`# make a request to a paid API
purl https://api.example.com/data

# preview payment without executing
purl --dry-run https://api.example.com/data

# create a new payment method
purl method new my-wallet --generate`}</pre>
				</div>

				<div className="links">
					<a href="https://github.com/tempoxyz/purl">github</a>
					<a href="https://datatracker.ietf.org/doc/draft-ietf-httpauth-payment/">ietf</a>
					<a href="https://www.x402.org/">x402</a>
				</div>
			</main>
		</div>
	)
}
