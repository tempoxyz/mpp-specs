import { useWebAuthnContext } from '../WebAuthnContext'

export function RecoveryWarningBanner() {
	const { isConnected, address, hasOnchainTx } = useWebAuthnContext()

	if (!isConnected || !address || hasOnchainTx !== false) {
		return null
	}

	return (
		<div className="recovery-warning-banner">
			<span className="recovery-warning-icon">⚠</span>
			<span className="recovery-warning-text">
				If you don't send at least one transaction onchain, you may not be able to recover this
				account on a new device.
			</span>
		</div>
	)
}
