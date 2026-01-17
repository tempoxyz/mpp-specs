import { useEffect, useState } from 'react'
import { AuthPage } from './pages/AuthPage'
import { InstallPage } from './pages/InstallPage'
import { WebAuthnProvider } from './WebAuthnContext'

export function App() {
	const [currentPath, setCurrentPath] = useState(window.location.pathname)
	const [hasCallback, setHasCallback] = useState(false)

	useEffect(() => {
		const handlePopState = () => {
			setCurrentPath(window.location.pathname)
		}
		window.addEventListener('popstate', handlePopState)
		return () => window.removeEventListener('popstate', handlePopState)
	}, [])

	// Check for CLI callback param on mount
	useEffect(() => {
		const params = new URLSearchParams(window.location.search)
		setHasCallback(params.has('callback'))
	}, [])

	// /wallet or /?callback=... shows the auth/passkey flow
	if (currentPath === '/wallet' || hasCallback) {
		return (
			<WebAuthnProvider>
				<AuthPage />
			</WebAuthnProvider>
		)
	}

	// / without callback shows the install landing page
	return <InstallPage />
}
