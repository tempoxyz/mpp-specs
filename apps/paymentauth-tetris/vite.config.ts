import { cloudflare } from '@cloudflare/vite-plugin'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

export default defineConfig((config) => {
	const env = loadEnv(config.mode, process.cwd(), '')

	return {
		plugins: [
			react(),
			cloudflare({
				configPath: './wrangler.jsonc',
				// Enable workers_dev for preview deployments
				config: (_workerConfig) => {
					// The Vite plugin generates a flat config, so we need to ensure
					// workers_dev is true for preview deployments to get a workers.dev URL
					return {
						workers_dev: true,
					}
				},
			}),
		],
		server: {
			port: Number(env.PORT ?? 8787),
		},
	}
})
