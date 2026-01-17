import { useCallback, useEffect, useState } from 'react'
import { formatUnits } from 'viem'
import { useWebAuthnContext } from '../WebAuthnContext'

function formatAddress(address: string): string {
	return `${address.slice(0, 6)}...${address.slice(-4)}`
}

// Network configuration
interface NetworkConfig {
	rpcUrl: string
	feeTokenName: string
	isTestnet: boolean
}

const NETWORKS: { [key: string]: NetworkConfig } = {
	mainnet: {
		rpcUrl: 'https://rpc.mainnet.tempo.xyz',
		feeTokenName: 'USD',
		isTestnet: false,
	},
	moderato: {
		rpcUrl: 'https://rpc.moderato.tempo.xyz',
		feeTokenName: 'Credits',
		isTestnet: true,
	},
}

const DEFAULT_NETWORK: NetworkConfig = {
	rpcUrl: 'https://rpc.moderato.tempo.xyz',
	feeTokenName: 'Credits',
	isTestnet: true,
}

function getNetworkConfig(network: string): NetworkConfig {
	return NETWORKS[network] || DEFAULT_NETWORK
}

// Parse URL params for CLI callback flow
function getUrlParams() {
	const params = new URLSearchParams(window.location.search)
	return {
		callback: params.get('callback'),
		state: params.get('state'),
		network: params.get('network') || 'moderato',
		account: params.get('account'),
	}
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
	const [isFinishing, setIsFinishing] = useState(false)
	const [finishError, setFinishError] = useState<string | null>(null)
	const [isRequestingFaucet, setIsRequestingFaucet] = useState(false)
	const [faucetSuccess, setFaucetSuccess] = useState(false)
	const [faucetError, setFaucetError] = useState<string | null>(null)

	// Get CLI callback params
	const urlParams = getUrlParams()
	const isCliFlow = !!urlParams.callback
	const networkConfig = getNetworkConfig(urlParams.network)

	const refreshBalance = useCallback(() => {
		if (isConnected) {
			getBalance().then(setBalance)
		}
	}, [isConnected, getBalance])

	useEffect(() => {
		refreshBalance()
	}, [refreshBalance])

	// Check if user has enough funds to create access key
	const hasFunds = balance !== null && balance > 0n

	// Request faucet for testnet and wait for tx to confirm
	const requestFaucet = useCallback(async () => {
		if (!address || !networkConfig.isTestnet) return

		setIsRequestingFaucet(true)
		setFaucetSuccess(false)
		setFaucetError(null)

		try {
			// Call tempo_fundAddress
			const res = await fetch(networkConfig.rpcUrl, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					jsonrpc: '2.0',
					id: 1,
					method: 'tempo_fundAddress',
					params: [address],
				}),
			})

			const data = (await res.json()) as { result?: string; error?: { message: string } }
			if (data.error) throw new Error(data.error.message)

			const txHash = data.result
			if (!txHash) throw new Error('No transaction hash returned')

			// Wait for transaction to confirm by polling receipt
			let attempts = 0
			const maxAttempts = 60 // 120 seconds max

			console.log(`[Faucet] Waiting for tx ${txHash} to confirm...`)

			while (attempts < maxAttempts) {
				await new Promise((resolve) => setTimeout(resolve, 2000))

				const receiptRes = await fetch(networkConfig.rpcUrl, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						jsonrpc: '2.0',
						id: 1,
						method: 'eth_getTransactionReceipt',
						params: [txHash],
					}),
				})

				const receiptData = (await receiptRes.json()) as {
					result?: { status: string } | null
					error?: { message: string }
				}

				if (receiptData.result) {
					// Transaction confirmed
					console.log(`[Faucet] Receipt received, status: ${receiptData.result.status}`)
					if (receiptData.result.status === '0x1') {
						// Success - refresh balance and unlock next step
						const newBalance = await getBalance()
						setBalance(newBalance)
						setFaucetSuccess(true)
						return
					}
					// Transaction failed
					throw new Error('Faucet transaction failed')
				}

				attempts++
				if (attempts % 10 === 0) {
					console.log(`[Faucet] Still waiting... (${attempts}/${maxAttempts})`)
				}
			}

			throw new Error('Transaction confirmation timeout')
		} catch (e) {
			console.error('Faucet error:', e)
			setFaucetError(e instanceof Error ? e.message : 'Failed to get faucet funds')
		} finally {
			setIsRequestingFaucet(false)
		}
	}, [address, networkConfig, getBalance])

	const handleCopyAddress = async () => {
		if (address) {
			await navigator.clipboard.writeText(address)
		}
	}

	// Send credentials back to CLI via form POST
	// Uses form POST instead of fetch() to avoid CORS/Private Network Access issues
	const finishSetup = useCallback(() => {
		if (!accessKey || !urlParams.callback) {
			setFinishError('Missing access key or callback URL')
			return
		}

		if (!urlParams.state) {
			setFinishError('Missing state parameter. Please restart wallet setup.')
			return
		}

		setIsFinishing(true)
		setFinishError(null)

		// Use form POST navigation (RFC 8252 approach for native app OAuth callbacks)
		const form = document.createElement('form')
		form.method = 'POST'
		form.action = urlParams.callback
		form.style.display = 'none'

		const fields: Record<string, string> = {
			access_key: accessKey.privateKey,
			account_address: accessKey.accountAddress,
			key_id: accessKey.keyId,
			expiry: accessKey.expiry.toString(),
			tx_hash: '', // TODO: capture from authorizeAccessKey
			state: urlParams.state,
		}

		for (const [name, value] of Object.entries(fields)) {
			const input = document.createElement('input')
			input.type = 'hidden'
			input.name = name
			input.value = value
			form.appendChild(input)
		}

		document.body.appendChild(form)
		form.submit()
	}, [accessKey, urlParams.callback, urlParams.state])

	return (
		<div className="install-hero">
			<div className="container">
				<header className="install-header">
					<h1 className="install-title serif">Presto</h1>
					{isCliFlow && (
						<div className="network-badge mono">
							{urlParams.network === 'mainnet' ? 'Mainnet' : 'Testnet'}
						</div>
					)}
					<p className="install-subtitle mono">
						{isCliFlow
							? 'Set up your wallet to pay for AI with crypto'
							: isConnected
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

				{finishError && (
					<div className="error-box">
						<span className="mono">{finishError}</span>
					</div>
				)}

				{!urlParams.callback && !isConnected && (
					<div className="error-box">
						<span className="mono">Run "presto" from your terminal to start setup.</span>
					</div>
				)}

				{!isConnected ? (
					<div className="auth-section">
						<p className="section-desc mono">
							Use Face ID, Touch ID, or your device password. No seed phrases or extensions needed.
						</p>

						<div className="auth-buttons">
							<button type="button" className="btn" onClick={signUp} disabled={isLoading}>
								{isLoading ? 'Creating...' : 'Create new wallet'}
							</button>

							<button
								type="button"
								className="btn btn-outline"
								onClick={signIn}
								disabled={isLoading}
							>
								{isLoading ? 'Signing in...' : 'Use existing passkey'}
							</button>
						</div>

						<p className="auth-hint mono">
							Your passkey is stored securely by your browser or device.
						</p>
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
									${formatUnits(balance, 6)}{' '}
									<span className="tag">{networkConfig.feeTokenName}</span>
								</div>
							</div>
						)}

						{/* Faucet for testnet - only show if no funds */}
						{networkConfig.isTestnet && !hasFunds && (
							<div className="faucet-section">
								{faucetError && (
									<div className="error-box">
										<span className="mono">{faucetError}</span>
									</div>
								)}
								{faucetSuccess && (
									<div className="success-box">
										<span>✓ Funds received!</span>
									</div>
								)}
								<button
									type="button"
									className={`btn ${faucetSuccess ? 'btn-success' : ''}`}
									onClick={requestFaucet}
									disabled={isRequestingFaucet || faucetSuccess}
								>
									{faucetSuccess
										? '✓ Funds received'
										: isRequestingFaucet
											? 'Confirming transaction...'
											: 'Get free testnet credits'}
								</button>
								{!faucetSuccess && !faucetError && (
									<p className="auth-hint mono" style={{ marginTop: 12 }}>
										You need testnet credits to register your CLI key.
									</p>
								)}
							</div>
						)}

						<div className="divider" />

						{/* Access Key Section */}
						<div className="access-key-section">
							<h2 className="section-title serif">CLI Key</h2>
							<p className="section-desc mono">
								{hasAccessKey
									? 'Your CLI key allows transactions without passkey prompts.'
									: 'Create a CLI key to enable seamless payments from the terminal.'}
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

									{/* Show Finish Setup button for CLI flow */}
									{isCliFlow ? (
										<button
											type="button"
											className="btn"
											onClick={finishSetup}
											disabled={isFinishing}
										>
											{isFinishing ? 'Finishing...' : 'Finish Setup'}
										</button>
									) : (
										<button
											type="button"
											className="btn btn-outline btn-danger"
											onClick={clearAccessKey}
										>
											Clear Key
										</button>
									)}
								</div>
							) : (
								<>
									<button
										type="button"
										className="btn"
										onClick={authorizeAccessKey}
										disabled={isAuthorizing || !hasFunds}
									>
										{isAuthorizing ? 'Creating...' : 'Create CLI Key'}
									</button>
									{!hasFunds && (
										<p className="auth-hint mono" style={{ marginTop: 12 }}>
											Get testnet credits above before creating your CLI key.
										</p>
									)}
								</>
							)}
						</div>

						{!isCliFlow && (
							<>
								<div className="divider" />
								<button type="button" className="btn btn-outline" onClick={disconnect}>
									Disconnect
								</button>
							</>
						)}
					</div>
				)}

				<div className="divider" />

				<div className="install-footer">
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
