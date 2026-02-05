import { cloudflare } from '@cloudflare/vite-plugin'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
	plugins: [
		react(),
		// configPath ensures the Vite plugin uses our wrangler.jsonc with all settings
		// (workers_dev, preview_urls, routes, etc). Without it, the plugin generates a
		// new config that may be missing these settings.
		cloudflare({ configPath: './wrangler.jsonc' }),
	],
	server: {
		port: 8787,
		allowedHosts: true,
	},
})
