import { useEffect, useState } from 'react'
import { AuthPage } from './pages/AuthPage'
import { InstallPage } from './pages/InstallPage'
import { WebAuthnProvider } from './WebAuthnContext'

export function App() {
	const [currentPath, setCurrentPath] = useState(window.location.pathname)

	useEffect(() => {
		const handlePopState = () => {
			setCurrentPath(window.location.pathname)
		}
		window.addEventListener('popstate', handlePopState)
		return () => window.removeEventListener('popstate', handlePopState)
	}, [])

	if (currentPath === '/install') {
		return <InstallPage />
	}

	return (
		<WebAuthnProvider>
			<AuthPage />
		</WebAuthnProvider>
	)
}
