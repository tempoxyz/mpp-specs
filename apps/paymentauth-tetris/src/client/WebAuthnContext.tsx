import { createContext, type ReactNode, useContext, useMemo } from 'react'
import { useAccessKey } from './useAccessKey'
import { useWebAuthn } from './useWebAuthn'

type WebAuthnContextType = ReturnType<typeof useWebAuthn> & {
	// Access Key functionality
	accessKey: ReturnType<typeof useAccessKey>['accessKey']
	hasAccessKey: boolean
	isAuthorizing: boolean
	accessKeyError: string | null
	authorizeAccessKey: () => Promise<{ keyId: string; txHash: string }>
	signWithAccessKey: ReturnType<typeof useAccessKey>['signWithAccessKey']
	revokeAccessKey: () => Promise<string>
	clearAccessKey: () => void
}

const WebAuthnContext = createContext<WebAuthnContextType | null>(null)

export function WebAuthnProvider({ children }: { children: ReactNode }) {
	const webauthn = useWebAuthn()

	const accessKeyHook = useAccessKey(
		webauthn.storedCredential?.id ?? null,
		webauthn.storedCredential?.publicKey ?? null,
		webauthn.address,
	)

	const value = useMemo<WebAuthnContextType>(
		() => ({
			...webauthn,
			// Access Key functionality
			accessKey: accessKeyHook.accessKey,
			hasAccessKey: accessKeyHook.hasAccessKey,
			isAuthorizing: accessKeyHook.isAuthorizing,
			accessKeyError: accessKeyHook.error,
			authorizeAccessKey: () => accessKeyHook.authorizeAccessKey(webauthn.signTransaction),
			signWithAccessKey: accessKeyHook.signWithAccessKey,
			revokeAccessKey: () => accessKeyHook.revokeAccessKey(webauthn.signTransaction),
			clearAccessKey: accessKeyHook.clearAccessKey,
		}),
		[webauthn, accessKeyHook],
	)

	return <WebAuthnContext.Provider value={value}>{children}</WebAuthnContext.Provider>
}

export function useWebAuthnContext() {
	const context = useContext(WebAuthnContext)
	if (!context) {
		throw new Error('useWebAuthnContext must be used within a WebAuthnProvider')
	}
	return context
}
