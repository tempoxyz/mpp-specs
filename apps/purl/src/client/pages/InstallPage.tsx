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
		<div className="install-hero">
			<div className="container">
				<header className="install-header">
					<h1 className="install-title mono">purl</h1>
					<p className="install-tagline mono">p(ay)URL</p>
					<p className="install-subtitle mono">
						curl for internet native payments.	
					</p>
				</header>

				<div className="install-protocols">
					<div className="protocol-label mono">Supported Protocols</div>
					<div className="protocols">
						<a
							href="https://www.x402.org/"
							target="_blank"
							rel="noopener noreferrer"
							className="protocol mono"
						>
							<span className="protocol-check">✓</span>
							<span>x402</span>
							<span className="protocol-desc">HTTP 402 payment protocol for EVM and Solana</span>
						</a>
						<a
							href="https://datatracker.ietf.org/doc/draft-ietf-httpauth-payment/"
							target="_blank"
							rel="noopener noreferrer"
							className="protocol mono"
						>
							<span className="protocol-check">✓</span>
							<span>Web Payment Auth</span>
							<span className="protocol-desc">
								IETF standard for HTTP authentication-based payments
							</span>
						</a>
					</div>
				</div>

				<div className="install-command">
					<div className="install-command-label mono">Install</div>
					<div className="code-block">
						<code>{INSTALL_COMMAND}</code>
						<button
							type="button"
							className={`copy-btn ${copied ? 'copied' : ''}`}
							onClick={handleCopy}
						>
							{copied ? 'Copied' : 'Copy'}
						</button>
					</div>
				</div>

				<div className="install-examples">
					<div className="examples-label mono">Example Usage</div>
					<div className="examples-grid">
						<div className="example">
							<code className="example-cmd mono">purl https://api.example.com/data</code>
							<span className="example-desc mono">Make a payment request</span>
						</div>
						<div className="example">
							<code className="example-cmd mono">purl --dry-run https://api.example.com/data</code>
							<span className="example-desc mono">Preview without executing</span>
						</div>
						<div className="example">
							<code className="example-cmd mono">purl --confirm https://api.example.com/data</code>
							<span className="example-desc mono">Require confirmation before payment</span>
						</div>
						<div className="example">
							<code className="example-cmd mono">purl method new my-wallet --generate</code>
							<span className="example-desc mono">Create a new payment method</span>
						</div>
						<div className="example">
							<code className="example-cmd mono">purl config</code>
							<span className="example-desc mono">View configuration</span>
						</div>
					</div>
				</div>

				<div className="install-features">
					<div className="feature">
						<span className="feature-num mono">1</span>
						<p className="feature-text mono">
							<strong>Multi-chain.</strong> Supports EVM networks (Tempo, Ethereum, Base,
							Optimism, Arbitrum) and Solana.
						</p>
					</div>
					<div className="feature">
						<span className="feature-num mono">2</span>
						<p className="feature-text mono">
							<strong>Secure.</strong> Encrypted keystores for wallet management. Password
							caching for convenience.
						</p>
					</div>
					<div className="feature">
						<span className="feature-num mono">3</span>
						<p className="feature-text mono">
							<strong>curl-compatible.</strong> Familiar flags like -v, -H, -o, -X. Drop-in
							replacement for paid APIs.
						</p>
					</div>
				</div>

				<div className="divider" />

				<div className="install-footer">
					<a
						href="https://github.com/brendanjryan/purl"
						target="_blank"
						rel="noopener noreferrer"
					>
						GitHub
					</a>
					<a href="https://www.x402.org/" target="_blank" rel="noopener noreferrer">
						x402 Spec
					</a>
					<a
						href="https://datatracker.ietf.org/doc/draft-ietf-httpauth-payment/"
						target="_blank"
						rel="noopener noreferrer"
					>
						Web Payment Auth
					</a>
				</div>
			</div>
		</div>
	)
}
