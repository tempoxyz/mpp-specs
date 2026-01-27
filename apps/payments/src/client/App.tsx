import { useEffect, useState } from 'react'

interface ServiceEndpoint {
	path: string
	methods?: string[]
	price: string
	requiresPayment?: boolean
	description?: string
}

interface Service {
	name: string
	slug: string
	aliases: string[]
	url: string
	pricing: {
		default: string
		asset: string
		destination: string
		endpoints?: ServiceEndpoint[]
	}
	streaming: {
		supported: boolean
		escrowContract?: string
		defaultDeposit?: string
	}
}

interface DiscoverResponse {
	version: string
	environment?: string
	timestamp: string
	services: Service[]
}

function formatPrice(baseUnits: string): string {
	const amount = Number(baseUnits) / 1_000_000
	if (amount < 0.01) return `$${amount.toFixed(4)}`
	return `$${amount.toFixed(2)}`
}

export function App() {
	const [services, setServices] = useState<Service[]>([])
	const [loading, setLoading] = useState(true)
	const [error, setError] = useState<string | null>(null)

	useEffect(() => {
		async function fetchServices() {
			try {
				const response = await fetch('/discover')
				if (!response.ok) throw new Error('Failed to fetch services')
				const data = (await response.json()) as DiscoverResponse
				setServices(data.services)
				setLoading(false)
			} catch (err) {
				setError(err instanceof Error ? err.message : 'Unknown error')
				setLoading(false)
			}
		}
		fetchServices()
	}, [])

	return (
		<div className="container">
			<header className="header">
				<h1 className="title">
					Tempo <span className="title-italic">Payments</span>
				</h1>
				<p className="subtitle">Agentic payments for AI services</p>
			</header>

			{error ? (
				<div className="empty-state">
					<div className="empty-title">Error</div>
					<div className="empty-text">{error}</div>
				</div>
			) : loading ? (
				<div className="empty-state">
					<div className="empty-title loading">Loading...</div>
					<div className="empty-text">Fetching available services</div>
				</div>
			) : (
				<>
					<div className="section-header">
						<h2 className="section-title">Available Services</h2>
						<span className="section-meta">{services.length} partners</span>
					</div>

					<div className="services-grid">
						{services.map((service) => (
							<a
								key={service.slug}
								href={service.url}
								target="_blank"
								rel="noopener noreferrer"
								className="service-card"
							>
								<div className="service-name">{service.name}</div>
								<div className="service-url">{new URL(service.url).hostname}</div>
								<div className="service-price">
									<span className="service-price-label">Default price</span>
									<span className="service-price-value">
										{formatPrice(service.pricing.default)}
									</span>
								</div>
								{service.streaming.supported && <div className="service-badge">Streaming</div>}
							</a>
						))}
					</div>
				</>
			)}

			<footer className="footer">
				<div className="footer-logo">Tempo</div>
				<div className="footer-links">
					<a
						href="https://docs.tempo.xyz"
						target="_blank"
						rel="noopener noreferrer"
						className="footer-link"
					>
						Docs
					</a>
					<a
						href="https://explore.tempo.xyz"
						target="_blank"
						rel="noopener noreferrer"
						className="footer-link"
					>
						Explorer
					</a>
					<a
						href="https://github.com/tempoxyz"
						target="_blank"
						rel="noopener noreferrer"
						className="footer-link"
					>
						GitHub
					</a>
				</div>
			</footer>
		</div>
	)
}
