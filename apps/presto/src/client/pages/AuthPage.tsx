import { useEffect, useState } from 'react'
import { formatUnits } from 'viem'
import { useWebAuthnContext } from '../WebAuthnContext'

function formatAddress(address: string): string {
	return `${address.slice(0, 6)}...${address.slice(-4)}`
}

export function AuthPage() {
	const {
		address,
		isConnected,
		isLoading,
		error,
		signUp,
		signIn,
		disconnect,
		getBalance,
		hasAccessKey,
		accessKey,
		isAuthorizing,
		accessKeyError,
		authorizeAccessKey,
		clearAccessKey,
	} = useWebAuthnContext()

	const [balance, setBalance] = useState<bigint | null>(null)
	const [hasStoredCredential, setHasStoredCredential] = useState(false)

	// biome-ignore lint/correctness/useExhaustiveDependencies: intentionally refresh on connect state change
	useEffect(() => {
		const stored = localStorage.getItem('presto_webauthn_credential')
		setHasStoredCredential(!!stored)
	}, [isConnected])

	useEffect(() => {
		if (isConnected) {
			getBalance().then(setBalance)
		}
	}, [isConnected, getBalance])

	const handleCopyAddress = async () => {
		if (address) {
			await navigator.clipboard.writeText(address)
		}
	}

	return (
		<div className="install-hero">
			<div className="container">
				<header className="install-header">
					<h1 className="install-title serif">Presto</h1>
					<p className="install-subtitle mono">
						{isConnected
							? 'Manage your passkey and access key for AI payments.'
							: 'Create or sign in with your passkey to get started.'}
					</p>
				</header>

				{error && (
					<div className="error-box">
						<span className="mono">{error}</span>
					</div>
				)}

				{accessKeyError && (
					<div className="error-box">
						<span className="mono">{accessKeyError}</span>
					</div>
				)}

				{!isConnected ? (
					<div className="auth-section">
						<div className="auth-buttons">
							<button type="button" className="btn" onClick={signUp} disabled={isLoading}>
								{isLoading ? 'Creating...' : 'Create Passkey'}
							</button>

							{hasStoredCredential && (
								<button
									type="button"
									className="btn btn-outline"
									onClick={signIn}
									disabled={isLoading}
								>
									{isLoading ? 'Signing in...' : 'Sign In'}
								</button>
							)}
						</div>

						<p className="auth-hint mono">Your passkey is stored securely on this device.</p>
					</div>
				) : (
					<div className="auth-section">
						{/* Account Info */}
						<div className="info-block">
							<div className="info-label mono">Account</div>
							<button
								type="button"
								className="info-value address"
								onClick={handleCopyAddress}
								title="Click to copy"
							>
								{address}
							</button>
						</div>

						{balance !== null && (
							<div className="info-block">
								<div className="info-label mono">Balance</div>
								<div className="info-value mono">
									${formatUnits(balance, 6)} <span className="tag">AlphaUSD</span>
								</div>
							</div>
						)}

						<div className="divider" />

						{/* Access Key Section */}
						<div className="access-key-section">
							<h2 className="section-title serif">Access Key</h2>
							<p className="section-desc mono">
								{hasAccessKey
									? 'Your access key allows transactions without passkey prompts.'
									: 'Authorize an access key to enable seamless payments from the CLI.'}
							</p>

							{hasAccessKey && accessKey ? (
								<div className="access-key-info">
									<div className="info-block">
										<div className="info-label mono">Key ID</div>
										<div className="info-value mono">{formatAddress(accessKey.keyId)}</div>
									</div>
									<div className="info-block">
										<div className="info-label mono">Expires</div>
										<div className="info-value mono">
											{new Date(accessKey.expiry * 1000).toLocaleString()}
										</div>
									</div>
									<button
										type="button"
										className="btn btn-outline btn-danger"
										onClick={clearAccessKey}
									>
										Clear Key
									</button>
								</div>
							) : (
								<button
									type="button"
									className="btn"
									onClick={authorizeAccessKey}
									disabled={isAuthorizing}
								>
									{isAuthorizing ? 'Authorizing...' : 'Authorize Access Key'}
								</button>
							)}
						</div>

						<div className="divider" />

						<button type="button" className="btn btn-outline" onClick={disconnect}>
							Disconnect
						</button>
					</div>
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
