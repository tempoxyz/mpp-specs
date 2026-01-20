import { useCallback, useEffect, useState } from 'react'
import { formatUnits } from 'viem'
import { type KeyConfig, KeyConfigForm } from '../components/KeyConfigForm'
import { RecoveryWarningBanner } from '../components/RecoveryWarningBanner'
import { useWalletTokens } from '../useWalletTokens'
import { useWebAuthnContext } from '../WebAuthnContext'

function formatAddress(address: string): string {
	return `${address.slice(0, 6)}...${address.slice(-4)}`
}

function formatRelativeTime(timestamp: number): string {
	const now = Date.now()
	const diff = timestamp * 1000 - now
	const absDiff = Math.abs(diff)
	const isPast = diff < 0

	if (absDiff < 60 * 1000) return isPast ? 'just now' : 'in < 1m'
	if (absDiff < 60 * 60 * 1000) {
		const mins = Math.floor(absDiff / (60 * 1000))
		return isPast ? `${mins}m ago` : `in ${mins}m`
	}
	if (absDiff < 24 * 60 * 60 * 1000) {
		const hours = Math.floor(absDiff / (60 * 60 * 1000))
		return isPast ? `${hours}h ago` : `in ${hours}h`
	}
	const days = Math.floor(absDiff / (24 * 60 * 60 * 1000))
	return isPast ? `${days}d ago` : `in ${days}d`
}

function formatDateTime(timestamp: number): string {
	return new Date(timestamp * 1000).toLocaleString(undefined, {
		month: 'short',
		day: 'numeric',
		hour: '2-digit',
		minute: '2-digit',
	})
}

// Network configuration
interface NetworkConfig {
	rpcUrl: string
	displayName: string
	isTestnet: boolean
}

const NETWORKS: { [key: string]: NetworkConfig } = {
	mainnet: {
		rpcUrl: 'https://rpc.mainnet.tempo.xyz',
		displayName: 'Mainnet',
		isTestnet: false,
	},
	moderato: {
		rpcUrl: 'https://rpc.moderato.tempo.xyz',
		displayName: 'Moderato Testnet',
		isTestnet: true,
	},
}

const DEFAULT_NETWORK: NetworkConfig = {
	rpcUrl: 'https://rpc.moderato.tempo.xyz',
	displayName: 'Moderato Testnet',
	isTestnet: true,
}

function formatBalance(balance: bigint): string {
	const num = Number(balance) / 1e6
	return num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
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
		flow: (params.get('flow') as 'setup' | 'newkey') || 'setup',
	}
}

function getTxStageMessage(stage: string, txHash: string | null): string | null {
	switch (stage) {
		case 'signing':
			return 'Signing with passkey...'
		case 'sending':
			return 'Sending to chain...'
		case 'confirming':
			return txHash
				? `Waiting for confirmation... (${txHash.slice(0, 10)}...)`
				: 'Waiting for confirmation...'
		default:
			return null
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
		// Multi-key state
		keys,
		selectedKeyId,
		selectKey,
		hasAccessKey,
		accessKey,
		isAuthorizing,
		accessKeyError,
		txStage,
		txHash,
		authorizeAccessKey,
		revokeAccessKey,
		getSpentAmount,
		getTokenLimitsForKey,
		keyHistory,
		isLoadingKeyHistory,
		refetchKeyHistory,
	} = useWebAuthnContext()

	const [balance, setBalance] = useState<bigint | null>(null)
	const [isFinishing, setIsFinishing] = useState(false)
	const [finishError, setFinishError] = useState<string | null>(null)
	const [isRequestingFaucet, setIsRequestingFaucet] = useState(false)
	const [faucetSuccess, setFaucetSuccess] = useState(false)
	const [faucetError, setFaucetError] = useState<string | null>(null)
	const [createdKeyThisSession, setCreatedKeyThisSession] = useState(false)
	const [copied, setCopied] = useState(false)
	const [revokingKeyId, setRevokingKeyId] = useState<string | null>(null)
	const [_spentData, setSpentData] = useState<{ spent: bigint; limit: bigint } | null>(null)

	// Token limits per key (keyed by keyId)
	type TokenLimitData = {
		token: string
		symbol: string
		decimals: number
		limit: bigint
		remaining: bigint
		spent: bigint
	}
	const [keyTokenLimits, setKeyTokenLimits] = useState<Record<string, TokenLimitData[]>>({})

	// Fetch wallet tokens for key creation form
	const {
		tokens: walletTokens,
		isLoading: isLoadingWalletTokens,
		refetch: refetchWalletTokens,
	} = useWalletTokens(address)

	// Get CLI callback params
	const urlParams = getUrlParams()
	const isCliFlow = !!urlParams.callback
	const isNewKeyFlow = urlParams.flow === 'newkey'
	const networkConfig = getNetworkConfig(urlParams.network)

	// Account mismatch check - only applies when URL specifies an expected account
	const accountMismatch =
		isCliFlow &&
		urlParams.account &&
		address &&
		urlParams.account.toLowerCase() !== address.toLowerCase()

	const refreshBalance = useCallback(() => {
		if (isConnected) {
			getBalance().then(setBalance)
		}
	}, [isConnected, getBalance])

	const refreshSpentData = useCallback(() => {
		if (hasAccessKey) {
			getSpentAmount().then(setSpentData)
		} else {
			setSpentData(null)
		}
	}, [hasAccessKey, getSpentAmount])

	useEffect(() => {
		refreshBalance()
	}, [refreshBalance])

	useEffect(() => {
		refreshSpentData()
	}, [refreshSpentData])

	// Fetch on-chain token limits for all keys
	useEffect(() => {
		if (keys.length === 0) return

		const fetchAllTokenLimits = async () => {
			const results: Record<string, TokenLimitData[]> = {}
			await Promise.all(
				keys.map(async (key) => {
					const limits = await getTokenLimitsForKey(key)
					results[key.keyId] = limits
				}),
			)
			setKeyTokenLimits(results)
		}

		fetchAllTokenLimits()
	}, [keys, getTokenLimitsForKey])

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

			const data = (await res.json()) as { result?: string | string[]; error?: { message: string } }
			if (data.error) throw new Error(data.error.message)

			// tempo_fundAddress returns an array of tx hashes (one per token)
			const result = data.result
			if (!result) throw new Error('No transaction hash returned')
			const txHash = Array.isArray(result) ? result[0] : result
			if (!txHash) throw new Error('No transaction hash returned')

			console.log(`[Faucet] Got tx hash: ${txHash}`)

			// Wait for transaction to confirm by polling receipt
			let attempts = 0
			const maxAttempts = 60 // 120 seconds max

			console.log(`[Faucet] Waiting for tx ${txHash} to confirm...`)

			while (attempts < maxAttempts) {
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

				console.log(`[Faucet] Poll ${attempts + 1}: receiptData =`, receiptData)

				if (receiptData.result) {
					// Transaction confirmed
					console.log(`[Faucet] Receipt received, status: ${receiptData.result.status}`)
					if (receiptData.result.status === '0x1') {
						// Success - refresh balance and wallet tokens
						const newBalance = await getBalance()
						setBalance(newBalance)
						await refetchWalletTokens()
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

				// Wait before next poll
				await new Promise((resolve) => setTimeout(resolve, 2000))
			}

			throw new Error('Transaction confirmation timeout')
		} catch (e) {
			console.error('Faucet error:', e)
			setFaucetError(e instanceof Error ? e.message : 'Failed to get faucet funds')
		} finally {
			setIsRequestingFaucet(false)
		}
	}, [address, networkConfig, getBalance, refetchWalletTokens])

	const handleCopyAddress = async () => {
		if (address) {
			await navigator.clipboard.writeText(address)
			setCopied(true)
			setTimeout(() => setCopied(false), 2000)
		}
	}

	// Wrap authorizeAccessKey to track when key is created this session
	const handleCreateAccessKey = useCallback(
		async (config: KeyConfig) => {
			await authorizeAccessKey({
				tokenLimits: config.tokenLimits,
				expirySeconds: config.expirySeconds,
			})
			setCreatedKeyThisSession(true)
			await refetchKeyHistory()
		},
		[authorizeAccessKey, refetchKeyHistory],
	)

	// Revoke a specific access key on-chain
	const handleRevokeKey = useCallback(
		async (keyId: string) => {
			setRevokingKeyId(keyId)
			try {
				await revokeAccessKey(keyId as `0x${string}`)
				await refetchKeyHistory()
			} catch (e) {
				console.error('Failed to revoke key:', e)
			} finally {
				setRevokingKeyId(null)
			}
		},
		[revokeAccessKey, refetchKeyHistory],
	)

	// Cancel and send error back to CLI
	const handleCancel = useCallback(() => {
		if (!urlParams.callback || !urlParams.state) {
			window.close()
			return
		}

		// Send cancel message back to CLI via form POST
		const form = document.createElement('form')
		form.method = 'POST'
		form.action = urlParams.callback

		const stateInput = document.createElement('input')
		stateInput.type = 'hidden'
		stateInput.name = 'state'
		stateInput.value = urlParams.state
		form.appendChild(stateInput)

		const errorInput = document.createElement('input')
		errorInput.type = 'hidden'
		errorInput.name = 'error'
		errorInput.value = 'cancelled'
		form.appendChild(errorInput)

		document.body.appendChild(form)
		form.submit()
	}, [urlParams.callback, urlParams.state])

	// Send credentials back to CLI via form POST
	// Uses form POST instead of fetch() to avoid CORS/Private Network Access issues
	// Includes full token scope payload for CLI to store
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

		// Build full key payload with token scope for CLI storage
		const keyPayload = {
			keyId: accessKey.keyId,
			privateKey: accessKey.privateKey,
			publicKey: accessKey.publicKey,
			accountAddress: accessKey.accountAddress,
			expiry: accessKey.expiry,
			createdAt: accessKey.createdAt,
			chainId: accessKey.chainId,
			tokenLimits: accessKey.tokenLimits,
		}

		// Base64url encode the payload
		const payloadJson = JSON.stringify(keyPayload)
		const payloadBase64 = btoa(payloadJson)
			.replace(/\+/g, '-')
			.replace(/\//g, '_')
			.replace(/=+$/, '')

		// Use form POST navigation (RFC 8252 approach for native app OAuth callbacks)
		const form = document.createElement('form')
		form.method = 'POST'
		form.action = urlParams.callback
		form.style.display = 'none'

		// Include both legacy fields (for backward compat) and new payload
		const fields: Record<string, string> = {
			// Legacy fields
			access_key: accessKey.privateKey,
			account_address: accessKey.accountAddress,
			key_id: accessKey.keyId,
			expiry: accessKey.expiry.toString(),
			// New: full payload with token scope
			key_payload: payloadBase64,
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

	// Auto-finish setup when access key is created in CLI flow
	// For 'setup' flow: auto-finish only if key was created THIS session (not pre-existing)
	// For 'newkey' flow: never auto-finish, always require explicit action
	useEffect(() => {
		if (isCliFlow && !isNewKeyFlow && createdKeyThisSession && accessKey && !isFinishing) {
			finishSetup()
		}
	}, [isCliFlow, isNewKeyFlow, createdKeyThisSession, accessKey, isFinishing, finishSetup])

	return (
		<div className="install-hero">
			<div className="container">
				<header className="install-header">
					<div className="header-row">
						<h1 className="install-title serif">Presto</h1>
						{isCliFlow && <div className="network-badge mono">{networkConfig.displayName}</div>}
					</div>
					<p className="install-subtitle mono">
						{isCliFlow
							? 'Set up your wallet to pay for AI with crypto.'
							: isConnected
								? 'Manage your passkey and CLI keys.'
								: 'Create or sign in with your passkey.'}
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

				{accountMismatch && (
					<div className="error-box">
						<span className="mono">
							Account mismatch: Expected {urlParams.account?.slice(0, 10)}... but connected as{' '}
							{address?.slice(0, 10)}...
						</span>
						<div style={{ marginTop: 8 }}>
							<button type="button" className="btn btn-outline" onClick={disconnect}>
								Switch Account
							</button>
						</div>
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
						{/* Account & Balance row */}
						<div className="info-row">
							<div className="info-block">
								<div className="info-label mono">
									Account {copied && <span style={{ color: '#059669' }}>✓ Copied</span>}
								</div>
								<button
									type="button"
									className={`info-value address${copied ? ' copied' : ''}`}
									onClick={handleCopyAddress}
									title="Click to copy"
								>
									{address}
								</button>
							</div>
							{balance !== null && (
								<div className="info-block">
									<div className="info-label mono">Balance</div>
									<div className="info-value mono">${formatBalance(balance)}</div>
								</div>
							)}
						</div>

						{/* Recovery warning - show if no onchain transactions */}
						<RecoveryWarningBanner />

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
										? '✓ Received'
										: isRequestingFaucet
											? 'Confirming...'
											: 'Get testnet credits'}
								</button>
							</div>
						)}

						<div className="divider" />

						{/* CLI Keys Section */}
						<div className="info-label mono" style={{ marginBottom: 8 }}>
							CLI Keys{' '}
							{keys.length > 0 && <span style={{ color: 'var(--muted)' }}>({keys.length})</span>}
						</div>

						{keys.length > 0 ? (
							<div className="key-list">
								{keys.map((key) => {
									const isSelected = key.keyId === selectedKeyId
									const isRevoking = revokingKeyId === key.keyId
									const tokenLimits = keyTokenLimits[key.keyId] ?? []
									return (
										// biome-ignore lint/a11y/useKeyWithClickEvents: key-card contains nested buttons; adding keyboard handler would conflict with child button navigation
										// biome-ignore lint/a11y/noStaticElementInteractions: key-card is intentionally a clickable container with nested button children
										<div
											key={key.keyId}
											className={`key-card ${isSelected ? 'key-card-selected' : ''}`}
											onClick={() => !isSelected && selectKey(key.keyId)}
											style={{ cursor: isSelected ? 'default' : 'pointer' }}
										>
											<div className="key-card-header">
												<code className="key-card-id mono">{key.keyId}</code>
												{isSelected && <span className="tag">Selected</span>}
											</div>
											{/* Token chips */}
											<div
												className="key-token-chips"
												style={{ display: 'flex', gap: 4, marginBottom: 8 }}
											>
												{tokenLimits.length > 0 ? (
													tokenLimits.map((tl) => (
														<span
															key={tl.token}
															className="tag"
															style={{ fontSize: 10, padding: '2px 6px' }}
														>
															{tl.symbol}
														</span>
													))
												) : (
													<span style={{ color: 'var(--muted)', fontSize: 11 }}>
														Loading tokens...
													</span>
												)}
											</div>
											<div className="key-card-meta">
												<div className="key-meta-item">
													<span className="key-meta-label">Expires</span>
													<span className="key-meta-value mono">
														{formatRelativeTime(key.expiry)}
													</span>
												</div>
												{/* Token limits - show spent/limit per token */}
												{tokenLimits.map((tl) => (
													<div key={tl.token} className="key-meta-item">
														<span className="key-meta-label">{tl.symbol} Spent</span>
														<span className="key-meta-value mono">
															${formatUnits(tl.spent, tl.decimals)} / $
															{formatUnits(tl.limit, tl.decimals)}
														</span>
													</div>
												))}
												<div className="key-card-actions">
													{isCliFlow && isSelected && !createdKeyThisSession && (
														<button
															type="button"
															className="btn btn-small"
															onClick={(e) => {
																e.stopPropagation()
																finishSetup()
															}}
															disabled={isFinishing || !!accountMismatch}
														>
															{isFinishing ? 'Returning...' : 'Use this key'}
														</button>
													)}
													<button
														type="button"
														className="btn btn-outline btn-small btn-danger"
														onClick={(e) => {
															e.stopPropagation()
															handleRevokeKey(key.keyId)
														}}
														disabled={isRevoking}
													>
														{isRevoking ? '...' : 'Revoke'}
													</button>
												</div>
											</div>
										</div>
									)
								})}
							</div>
						) : (
							<div className="info-value mono" style={{ color: 'var(--muted)', marginBottom: 10 }}>
								No keys configured
							</div>
						)}

						{/* Key History */}
						<details className="key-history">
							<summary className="info-label mono">Key History</summary>
							{isLoadingKeyHistory ? (
								<p className="auth-hint mono">Loading...</p>
							) : keyHistory.length === 0 ? (
								<p className="auth-hint mono">No previous keys</p>
							) : (
								<ul className="key-history-list">
									{keyHistory.map((entry) => (
										<li key={entry.keyId} className="key-history-item">
											<code className="mono">{formatAddress(entry.keyId)}</code>
											<span className={`tag tag-${entry.status}`}>
												{entry.status === 'revoked' ? 'Revoked' : 'Expired'}
											</span>
											<span className="key-history-date mono">
												{formatDateTime(entry.timestamp)}
											</span>
										</li>
									))}
								</ul>
							)}
						</details>

						{/* Action buttons */}
						<div className="auth-actions">
							{isCliFlow ? (
								<>
									{createdKeyThisSession && accessKey ? (
										<>
											<p className="auth-hint mono" style={{ color: '#059669', marginBottom: 8 }}>
												✓ Key created successfully
											</p>
											<button
												type="button"
												className="btn"
												onClick={finishSetup}
												disabled={isFinishing}
											>
												{isFinishing ? 'Returning...' : 'Return to CLI'}
											</button>
										</>
									) : (
										<>
											{isAuthorizing && (
												<p className="auth-hint mono" style={{ marginBottom: 8 }}>
													{getTxStageMessage(txStage, txHash) ?? 'Creating...'}
												</p>
											)}
											<KeyConfigForm
												walletTokens={walletTokens}
												isLoadingTokens={isLoadingWalletTokens}
												onSubmit={handleCreateAccessKey}
												isSubmitting={isAuthorizing || !!accountMismatch}
												submitLabel={hasAccessKey ? 'Create new key' : 'Create Key'}
											/>
										</>
									)}

									{!createdKeyThisSession && (
										<button
											type="button"
											className="btn btn-outline"
											onClick={handleCancel}
											style={{ marginTop: 8 }}
										>
											Cancel
										</button>
									)}
								</>
							) : (
								<>
									{isAuthorizing && (
										<p className="auth-hint mono" style={{ marginBottom: 8 }}>
											{getTxStageMessage(txStage, txHash) ?? 'Creating...'}
										</p>
									)}
									<KeyConfigForm
										walletTokens={walletTokens}
										isLoadingTokens={isLoadingWalletTokens}
										onSubmit={handleCreateAccessKey}
										isSubmitting={isAuthorizing}
										submitLabel={hasAccessKey ? 'Add Key' : 'Create Key'}
									/>
								</>
							)}
						</div>

						{!isCliFlow && (
							<button
								type="button"
								className="btn btn-outline"
								onClick={disconnect}
								style={{ marginTop: 12 }}
							>
								Disconnect
							</button>
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
					<button
						type="button"
						className="footer-link"
						onClick={() => {
							if (
								window.confirm(
									'Are you sure? This will clear all local data including your stored passkey reference and access keys.',
								)
							) {
								localStorage.clear()
								sessionStorage.clear()
								window.location.href = window.location.pathname
							}
						}}
					>
						Reset App
					</button>
				</div>
			</div>
		</div>
	)
}
