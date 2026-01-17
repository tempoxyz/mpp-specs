import { useState, useEffect } from 'react'
import { InstallPage } from './pages/InstallPage'
import { WalletAuthPage } from './pages/WalletAuthPage'

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

	return <WalletAuthPage />
}
