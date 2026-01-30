import { useEffect, useState } from 'react'
import { codeToHtml } from 'shiki'

const INSTALL_COMMAND = 'curl -fsSL https://pget.tempo.xyz/install.sh | bash'

const EXAMPLES = `# Make a request to a paid API
pget https://api.example.com/data

# Preview payment without executing
pget --dry-run https://api.example.com/data

# Set a spending limit
pget --max-amount 100000000 https://api.example.com/data

# POST JSON to a paid endpoint
pget --json '{"prompt":"hello"}' https://api.example.com/v1/chat

# Create and use a payment method
pget method new my-wallet --generate
pget -a my-wallet https://api.example.com/data`

export function InstallPage() {
	const [copied, setCopied] = useState(false)
	const [highlightedCode, setHighlightedCode] = useState<string>('')

	useEffect(() => {
		codeToHtml(EXAMPLES, {
			lang: 'bash',
			theme: 'github-light',
		}).then(setHighlightedCode)
	}, [])

	const handleCopy = async () => {
		try {
			await navigator.clipboard.writeText(INSTALL_COMMAND)
			setCopied(true)
			setTimeout(() => setCopied(false), 2000)
		} catch {
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
				<h1>pget</h1>
				<p className="tagline">wget for paid APIs</p>

				<p className="description">
					A non-interactive commandline tool for making HTTP requests with automatic payment
					support.
				</p>

				<p className="description">
					Handles <code>402 Payment Required</code> responses with built-in payment methods and
					permissions. Designed for easy use from scripts, cron jobs, and AI agents.
				</p>

				<div className="install">
					<code>{INSTALL_COMMAND}</code>
					<button type="button" onClick={handleCopy}>
						{copied ? 'copied' : 'copy'}
					</button>
				</div>

				{/* biome-ignore lint/security/noDangerouslySetInnerHtml: shiki output is trusted */}
				<div className="examples" dangerouslySetInnerHTML={{ __html: highlightedCode }} />

				<div className="links">
					<a href="https://github.com/tempoxyz/pget" target="_blank" rel="noopener noreferrer">
						github
					</a>
					<a href="https://paymentauth.tempo.xyz" target="_blank" rel="noopener noreferrer">
						protocol
					</a>
					<a href="https://tempo.xyz" target="_blank" rel="noopener noreferrer">
						tempo labs
					</a>
				</div>
			</main>
		</div>
	)
}
