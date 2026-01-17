import { useCallback, useEffect, useState } from 'react'

interface Transaction {
	hash: string
	from: string
	to: string | null
	value: string
	blockNumber: string
	timestamp: number
}

interface Block {
	number: string
	hash: string
	timestamp: string
	transactions: Transaction[]
	gasUsed: string
	gasLimit: string
}

interface Stats {
	totalTxCount: number
	blocksPerMinute: number
	avgTxPerBlock: number
	latestBlock: number
}

function formatAddress(addr: string | null): string {
	if (!addr) return '—'
	return `${addr.slice(0, 6)}...${addr.slice(-4)}`
}

function formatValue(value: string): string {
	const wei = BigInt(value)
	const eth = Number(wei) / 1e18
	if (eth === 0) return '0'
	if (eth < 0.0001) return '<0.0001'
	return eth.toFixed(4)
}

function formatTime(timestamp: number): string {
	const now = Date.now() / 1000
	const diff = now - timestamp
	if (diff < 60) return `${Math.floor(diff)}s ago`
	if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
	if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
	return `${Math.floor(diff / 86400)}d ago`
}

export function App() {
	const [blocks, setBlocks] = useState<Block[]>([])
	const [stats, setStats] = useState<Stats>({
		totalTxCount: 0,
		blocksPerMinute: 0,
		avgTxPerBlock: 0,
		latestBlock: 0,
	})
	const [loading, setLoading] = useState(true)
	const [error, setError] = useState<string | null>(null)

	const fetchBlocks = useCallback(async () => {
		try {
			const response = await fetch('/api/blocks?limit=20')
			if (!response.ok) throw new Error('Failed to fetch blocks')

			const data = (await response.json()) as { blocks: Block[]; latestBlock: number }

			setBlocks(data.blocks)

			// Calculate stats
			const totalTxCount = data.blocks.reduce((sum, b) => sum + b.transactions.length, 0)
			const avgTxPerBlock = data.blocks.length > 0 ? totalTxCount / data.blocks.length : 0

			// Calculate blocks per minute from timestamps
			let blocksPerMinute = 0
			if (data.blocks.length >= 2) {
				const firstBlock = data.blocks[data.blocks.length - 1]
				const lastBlock = data.blocks[0]
				if (firstBlock && lastBlock) {
					const timeDiff =
						Number.parseInt(lastBlock.timestamp, 16) - Number.parseInt(firstBlock.timestamp, 16)
					if (timeDiff > 0) {
						blocksPerMinute = (data.blocks.length / timeDiff) * 60
					}
				}
			}

			setStats({
				totalTxCount,
				blocksPerMinute: Math.round(blocksPerMinute * 10) / 10,
				avgTxPerBlock: Math.round(avgTxPerBlock * 10) / 10,
				latestBlock: data.latestBlock,
			})

			setLoading(false)
			setError(null)
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Unknown error')
			setLoading(false)
		}
	}, [])

	useEffect(() => {
		fetchBlocks()
		const interval = setInterval(fetchBlocks, 2000)
		return () => clearInterval(interval)
	}, [fetchBlocks])

	// Flatten all transactions from blocks
	const transactions = blocks.flatMap((block) =>
		block.transactions.map((tx) => ({
			...tx,
			blockNumber: block.number,
			timestamp: Number.parseInt(block.timestamp, 16),
		})),
	)

	const latestBlock = blocks[0]

	return (
		<div className="container">
			<header className="header">
				<h1 className="title">
					Payment <span className="title-italic">Channels</span>
				</h1>
				<p className="subtitle">Real-time Tempo blockchain activity</p>
			</header>

			{/* Stats */}
			<div className="stats-grid">
				<div className="stat-card">
					<div className="stat-label">Latest Block</div>
					<div className="stat-value">
						{loading ? <span className="loading">—</span> : stats.latestBlock.toLocaleString()}
					</div>
				</div>
				<div className="stat-card">
					<div className="stat-label">Transactions (20 blocks)</div>
					<div className="stat-value">
						{loading ? <span className="loading">—</span> : stats.totalTxCount}
					</div>
				</div>
				<div className="stat-card">
					<div className="stat-label">Blocks / Minute</div>
					<div className="stat-value">
						{loading ? <span className="loading">—</span> : stats.blocksPerMinute}
					</div>
				</div>
				<div className="stat-card">
					<div className="stat-label">Avg TX / Block</div>
					<div className="stat-value">
						{loading ? <span className="loading">—</span> : stats.avgTxPerBlock}
					</div>
				</div>
			</div>

			{/* Block indicator */}
			{latestBlock && (
				<div className="block-indicator">
					<div className="block-pulse" />
					<div className="block-info">
						<div className="block-number">
							Block #{Number.parseInt(latestBlock.number, 16).toLocaleString()}
						</div>
						<div className="block-meta">
							{latestBlock.transactions.length} transactions •{' '}
							{formatTime(Number.parseInt(latestBlock.timestamp, 16))}
						</div>
					</div>
				</div>
			)}

			{/* Activity feed */}
			<div className="section-header">
				<h2 className="section-title">Live Activity</h2>
				<span className="section-meta">{transactions.length} transactions</span>
			</div>

			{error ? (
				<div className="empty-state">
					<div className="empty-title">Connection Error</div>
					<div className="empty-text">{error}</div>
				</div>
			) : loading ? (
				<div className="empty-state">
					<div className="empty-title loading">Loading...</div>
					<div className="empty-text">Connecting to Tempo network</div>
				</div>
			) : transactions.length === 0 ? (
				<div className="empty-state">
					<div className="empty-title">No transactions yet</div>
					<div className="empty-text">Waiting for payment channel activity</div>
				</div>
			) : (
				<div className="tx-list">
					{transactions.slice(0, 50).map((tx) => (
						<div key={tx.hash} className="tx-item">
							<div className="tx-time">{formatTime(tx.timestamp)}</div>
							<a
								href={`https://explore.tempo.xyz/tx/${tx.hash}`}
								target="_blank"
								rel="noopener noreferrer"
								className="tx-hash"
							>
								{tx.hash}
							</a>
							<div className="tx-addresses">
								<span className="tx-address">{formatAddress(tx.from)}</span>
								<span className="tx-arrow">→</span>
								<span className="tx-address">{formatAddress(tx.to)}</span>
							</div>
							<div className="tx-amount">
								{formatValue(tx.value)}
								<span className="tx-amount-unit">ETH</span>
							</div>
						</div>
					))}
				</div>
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
