import { createContext, type ReactNode, useContext, useEffect, useMemo } from 'react'
import type { Address, Hex } from 'viem'
import {
	type AuthorizeKeyOptions,
	type KeyHistoryEntry,
	type StoredAccessKey,
	type TxStage,
	useAccessKey,
	useKeyHistory,
} from './useAccessKey'
import { useOnchainActivity } from './useOnchainActivity'
import { useWebAuthn } from './useWebAuthn'

export type { AuthorizeKeyOptions }

type WebAuthnContextType = ReturnType<typeof useWebAuthn> & {
	// Multi-key state
	keys: StoredAccessKey[]
	selectedKeyId: Address | null
	selectKey: (keyId: Address) => void
	// Currently selected key (for backwards compatibility)
	accessKey: ReturnType<typeof useAccessKey>['accessKey']
	hasAccessKey: boolean
	// Actions
	isAuthorizing: boolean
	accessKeyError: string | null
	txStage: TxStage
	txHash: Hex | null
	authorizeAccessKey: (options?: AuthorizeKeyOptions) => Promise<{ keyId: string; txHash: string }>
	signWithAccessKey: ReturnType<typeof useAccessKey>['signWithAccessKey']
	revokeAccessKey: (keyId?: Address) => Promise<string>
	clearAccessKey: (keyId?: Address) => void
	getSpentAmount: ReturnType<typeof useAccessKey>['getSpentAmount']
	getTokenLimitsForKey: ReturnType<typeof useAccessKey>['getTokenLimitsForKey']
	// Key History
	keyHistory: KeyHistoryEntry[]
	isLoadingKeyHistory: boolean
	refetchKeyHistory: () => Promise<void>
	// Onchain activity (for recovery warning)
	hasOnchainTx: boolean | null
	isCheckingOnchainTx: boolean
	refetchOnchainTxStatus: () => Promise<void>
}

const WebAuthnContext = createContext<WebAuthnContextType | null>(null)

export function WebAuthnProvider({ children }: { children: ReactNode }) {
	const webauthn = useWebAuthn()

	const accessKeyHook = useAccessKey(
		webauthn.storedCredential?.id ?? null,
		webauthn.storedCredential?.publicKey ?? null,
		webauthn.address,
	)

	const keyHistoryHook = useKeyHistory(webauthn.address)

	const onchainActivity = useOnchainActivity({
		address: webauthn.address,
		txHash: accessKeyHook.txHash,
	})

	const value = useMemo<WebAuthnContextType>(
		() => ({
			...webauthn,
			// Multi-key state
			keys: accessKeyHook.keys,
			selectedKeyId: accessKeyHook.selectedKeyId,
			selectKey: accessKeyHook.selectKey,
			// Currently selected key (for backwards compatibility)
			accessKey: accessKeyHook.accessKey,
			hasAccessKey: accessKeyHook.hasAccessKey,
			// Actions
			isAuthorizing: accessKeyHook.isAuthorizing,
			accessKeyError: accessKeyHook.error,
			txStage: accessKeyHook.txStage,
			txHash: accessKeyHook.txHash,
			authorizeAccessKey: (options?: AuthorizeKeyOptions) =>
				accessKeyHook.authorizeAccessKey(webauthn.signTransaction, options),
			signWithAccessKey: accessKeyHook.signWithAccessKey,
			revokeAccessKey: (keyId?: Address) =>
				accessKeyHook.revokeAccessKey(webauthn.signTransaction, keyId),
			clearAccessKey: accessKeyHook.clearAccessKey,
			getSpentAmount: accessKeyHook.getSpentAmount,
			getTokenLimitsForKey: accessKeyHook.getTokenLimitsForKey,
			// Key History
			keyHistory: keyHistoryHook.history,
			isLoadingKeyHistory: keyHistoryHook.isLoading,
			refetchKeyHistory: keyHistoryHook.refetch,
			// Onchain activity (for recovery warning)
			hasOnchainTx: onchainActivity.hasOnchainTx,
			isCheckingOnchainTx: onchainActivity.isChecking,
			refetchOnchainTxStatus: onchainActivity.refetch,
		}),
		[webauthn, accessKeyHook, keyHistoryHook, onchainActivity],
	)

	// Expose debug utilities on window for console access
	useEffect(() => {
		if (typeof window !== 'undefined') {
			;(window as any).presto = {
				cancelStuckTx: webauthn.cancelStuckTransaction,
				getPendingNonces: webauthn.getPendingNonces,
				address: webauthn.address,
			}
		}
	}, [webauthn.cancelStuckTransaction, webauthn.getPendingNonces, webauthn.address])

	return <WebAuthnContext.Provider value={value}>{children}</WebAuthnContext.Provider>
}

export function useWebAuthnContext() {
	const context = useContext(WebAuthnContext)
	if (!context) {
		throw new Error('useWebAuthnContext must be used within a WebAuthnProvider')
	}
	return context
}
