import { Game } from './Game'
import { WalletConnect } from './WalletConnect'
import { WebAuthnProvider } from './WebAuthnContext'

export function App() {
	return (
		<WebAuthnProvider>
			<div className="container">
				<Game />
				<WalletConnect />
			</div>
		</WebAuthnProvider>
	)
}
