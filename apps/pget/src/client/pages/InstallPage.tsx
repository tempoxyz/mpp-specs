import { useState } from 'react'

const INSTALL_COMMAND = 'curl -fsSL https://pget.tempo.xyz/install.sh | bash'

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
				<h1>pget</h1>
				<p className="tagline">wget for payments</p>

				<p className="description">
					A command-line tool for making HTTP requests with automatic payment support.
				</p>

				<div className="install">
					<code>{INSTALL_COMMAND}</code>
					<button type="button" onClick={handleCopy}>
						{copied ? 'copied' : 'copy'}
					</button>
				</div>

				<div className="examples">
					<pre>{`# make a request to a paid API
pget https://api.example.com/data

# preview payment without executing
pget --dry-run https://api.example.com/data

# create a new payment method
pget method new my-wallet --generate`}</pre>
				</div>

				<div className="links">
					<a href="https://github.com/tempoxyz/pget" target="_blank" rel="noopener noreferrer">
						github
					</a>
					<a
						href="https://paymentauth.tempo.xyz"
						target="_blank"
						rel="noopener noreferrer"
					>
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
