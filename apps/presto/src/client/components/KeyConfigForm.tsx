import { useState } from 'react'
import { type Address, formatUnits } from 'viem'
import type { StoredTokenLimit } from '../useAccessKey'
import type { WalletToken } from '../useWalletTokens'

/** Expiry presets in seconds */
const EXPIRY_OPTIONS = [
	{ label: '1 hour', value: 60 * 60 },
	{ label: '24 hours', value: 24 * 60 * 60 },
	{ label: '7 days', value: 7 * 24 * 60 * 60 },
	{ label: '30 days', value: 30 * 24 * 60 * 60 },
] as const

export interface KeyConfig {
	expirySeconds: number
	tokenLimits: StoredTokenLimit[]
}

interface KeyConfigFormProps {
	/** Tokens available in the user's wallet */
	walletTokens: WalletToken[]
	/** Loading state for tokens */
	isLoadingTokens?: boolean
	onSubmit: (config: KeyConfig) => void
	isSubmitting: boolean
	submitLabel?: string
}

export function KeyConfigForm({
	walletTokens,
	isLoadingTokens,
	onSubmit,
	isSubmitting,
	submitLabel = 'Create Key',
}: KeyConfigFormProps) {
	const [expirySeconds, setExpirySeconds] = useState(24 * 60 * 60) // Default 24h
	const [selectedToken, setSelectedToken] = useState<Address | null>(
		walletTokens[0]?.address ?? null,
	)
	const [limitAmount, setLimitAmount] = useState('100') // Human-readable amount

	// Update selected token when wallet tokens load
	if (selectedToken === null && walletTokens.length > 0 && walletTokens[0]) {
		setSelectedToken(walletTokens[0].address)
	}

	const selectedTokenMeta = walletTokens.find((t) => t.address === selectedToken)

	const handleSubmit = (e: React.FormEvent) => {
		e.preventDefault()

		if (!selectedToken || !selectedTokenMeta) {
			return
		}

		const amount = parseFloat(limitAmount)
		if (Number.isNaN(amount) || amount <= 0) {
			return
		}

		// Convert to base units
		const baseAmount = BigInt(Math.floor(amount * 10 ** selectedTokenMeta.decimals))

		const tokenLimits: StoredTokenLimit[] = [
			{
				token: selectedToken,
				amount: baseAmount.toString(),
				symbol: selectedTokenMeta.symbol,
				decimals: selectedTokenMeta.decimals,
			},
		]

		onSubmit({ expirySeconds, tokenLimits })
	}

	if (isLoadingTokens) {
		return <p className="auth-hint mono">Loading wallet tokens...</p>
	}

	if (walletTokens.length === 0) {
		return (
			<p className="auth-hint mono" style={{ color: 'var(--muted)' }}>
				No tokens found in wallet. Get testnet credits above.
			</p>
		)
	}

	return (
		<form onSubmit={handleSubmit} className="key-config-form">
			{/* Token Selection */}
			<div className="form-group">
				<label htmlFor="token-select" className="form-label mono">
					Token
				</label>
				<select
					id="token-select"
					className="form-select mono"
					value={selectedToken ?? ''}
					onChange={(e) => setSelectedToken(e.target.value as Address)}
					disabled={isSubmitting}
				>
					{walletTokens.map((token) => (
						<option key={token.address} value={token.address}>
							{token.symbol} (${formatUnits(token.balance, token.decimals)})
						</option>
					))}
				</select>
			</div>

			{/* Spending Limit */}
			<div className="form-group">
				<label htmlFor="spending-limit" className="form-label mono">
					Spending Limit ($)
				</label>
				<input
					id="spending-limit"
					type="number"
					className="form-input mono"
					value={limitAmount}
					onChange={(e) => setLimitAmount(e.target.value)}
					min="1"
					max={
						selectedTokenMeta
							? Number(formatUnits(selectedTokenMeta.balance, selectedTokenMeta.decimals))
							: 10000
					}
					step="1"
					placeholder="100"
					disabled={isSubmitting}
				/>
				{selectedTokenMeta && (
					<span className="form-hint mono" style={{ fontSize: 10, color: 'var(--muted)' }}>
						Max: ${formatUnits(selectedTokenMeta.balance, selectedTokenMeta.decimals)}
					</span>
				)}
			</div>

			{/* Expiry Selection */}
			<div className="form-group">
				<label htmlFor="expiry-select" className="form-label mono">
					Expires In
				</label>
				<select
					id="expiry-select"
					className="form-select mono"
					value={expirySeconds}
					onChange={(e) => setExpirySeconds(Number(e.target.value))}
					disabled={isSubmitting}
				>
					{EXPIRY_OPTIONS.map((opt) => (
						<option key={opt.value} value={opt.value}>
							{opt.label}
						</option>
					))}
				</select>
			</div>

			{/* Submit */}
			<button
				type="submit"
				className="btn"
				disabled={isSubmitting || !selectedToken || !limitAmount}
			>
				{isSubmitting ? 'Creating...' : submitLabel}
			</button>
		</form>
	)
}
