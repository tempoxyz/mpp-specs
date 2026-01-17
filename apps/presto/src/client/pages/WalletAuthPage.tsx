import { useState } from 'react'

type ConnectionState = 'disconnected' | 'connecting' | 'connected'

interface WalletOption {
	id: string
	name: string
	icon: string
}

const WALLET_OPTIONS: WalletOption[] = [
	{ id: 'injected', name: 'Browser Wallet', icon: '◈' },
	{ id: 'walletconnect', name: 'WalletConnect', icon: '◎' },
	{ id: 'coinbase', name: 'Coinbase Wallet', icon: '◉' },
]

export function WalletAuthPage() {
	const [state, setState] = useState<ConnectionState>('disconnected')
	const [address, setAddress] = useState<string | null>(null)
	const [error, setError] = useState<string | null>(null)

	const handleConnect = async (walletId: string) => {
		setState('connecting')
		setError(null)

		try {
			// Check if ethereum provider exists
			if (walletId === 'injected' && typeof window !== 'undefined' && 'ethereum' in window) {
				const ethereum = (
					window as unknown as {
						ethereum: { request: (args: { method: string }) => Promise<string[]> }
					}
				).ethereum
				const accounts = await ethereum.request({ method: 'eth_requestAccounts' })
				if (accounts[0]) {
					setAddress(accounts[0])
					setState('connected')
					return
				}
			}

			// Fallback / placeholder for other wallets
			await new Promise((resolve) => setTimeout(resolve, 1500))
			setError(`${walletId} not available. Install a browser wallet extension.`)
			setState('disconnected')
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Connection failed')
			setState('disconnected')
		}
	}

	const handleDisconnect = () => {
		setAddress(null)
		setState('disconnected')
		setError(null)
	}

	return (
		<div className="install-hero">
			<div className="container">
				<header className="install-header">
					<div className="status mono" style={{ marginBottom: 24 }}>
						<span
							className={`status-dot ${state === 'connected' ? 'connected' : 'disconnected'}`}
						/>
						{state === 'connected'
							? 'Connected'
							: state === 'connecting'
								? 'Connecting...'
								: 'Disconnected'}
					</div>
					<h1 className="install-title serif">Presto</h1>
					<p className="install-subtitle mono">
						{state === 'connected'
							? 'Your wallet is connected. You can now use Presto with payment authentication.'
							: 'Connect your wallet to authenticate and make payments for AI assistance.'}
					</p>
				</header>

				{state === 'connected' && address ? (
					<>
						<div style={{ marginBottom: 32 }}>
							<div className="install-command-label mono">Connected Address</div>
							<div className="address">{address}</div>
						</div>

						<div style={{ marginBottom: 48 }}>
							<button type="button" className="btn btn-outline" onClick={handleDisconnect}>
								Disconnect
							</button>
						</div>

						<div className="divider" />

						<div className="install-features">
							<div className="feature">
								<span className="feature-num">✓</span>
								<p className="feature-text">
									<strong>Ready to use.</strong> Open a terminal and run{' '}
									<code style={{ background: 'rgba(255,255,255,0.1)', padding: '2px 6px' }}>
										presto
									</code>{' '}
									to start.
								</p>
							</div>
						</div>
					</>
				) : (
					<>
						{error && (
							<div
								style={{
									marginBottom: 24,
									padding: '12px 16px',
									border: '1px solid var(--border)',
									background: 'rgba(255,255,255,0.03)',
								}}
							>
								<span className="mono" style={{ fontSize: 12, color: 'var(--muted)' }}>
									{error}
								</span>
							</div>
						)}

						<div className="wallet-container" style={{ marginBottom: 48 }}>
							{WALLET_OPTIONS.map((wallet) => (
								<button
									key={wallet.id}
									type="button"
									className="wallet-btn"
									onClick={() => handleConnect(wallet.id)}
									disabled={state === 'connecting'}
								>
									<span className="icon">{wallet.icon}</span>
									<span className="label">{wallet.name}</span>
									<span className="arrow">→</span>
								</button>
							))}
						</div>
					</>
				)}

				<div className="divider" />

				<div className="install-footer">
					<a href="/agent">Install CLI</a>
					<a href="https://github.com/tempoxyz/presto" target="_blank" rel="noopener noreferrer">
						GitHub
					</a>
					<a href="https://docs.tempo.xyz" target="_blank" rel="noopener noreferrer">
						Docs
					</a>
				</div>
			</div>
		</div>
	)
}
