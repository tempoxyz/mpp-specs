import { useState } from 'react'

const INSTALL_COMMAND = 'curl -fsSL https://presto.tempo.xyz/install.sh | bash'

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
					<h1 className="install-title serif">Presto</h1>
					<p className="install-subtitle mono">
						Minimal AI coding agent with Tempo payment authentication. 
						Pay-per-use AI assistance powered by blockchain micropayments.
					</p>
				</header>

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

				<div className="install-features">
					<div className="feature">
						<span className="feature-num">1</span>
						<p className="feature-text">
							<strong>Instant setup.</strong> One command installs everything. 
							Works with uv, pipx, or pip.
						</p>
					</div>
					<div className="feature">
						<span className="feature-num">2</span>
						<p className="feature-text">
							<strong>Pay as you go.</strong> Micropayments via Tempo blockchain.
							No subscriptions, no API keys to manage.
						</p>
					</div>
					<div className="feature">
						<span className="feature-num">3</span>
						<p className="feature-text">
							<strong>Local-first.</strong> Your code stays on your machine.
							We only process your queries.
						</p>
					</div>
				</div>

				<div className="divider" />

				<div className="install-footer">
					<a href="https://github.com/tempoxyz/presto" target="_blank" rel="noopener noreferrer">
						GitHub
					</a>
					<a href="https://docs.tempo.xyz" target="_blank" rel="noopener noreferrer">
						Docs
					</a>
					<a href="/" onClick={(e) => { e.preventDefault(); window.location.href = '/' }}>
						Connect Wallet
					</a>
				</div>
			</div>
		</div>
	)
}
