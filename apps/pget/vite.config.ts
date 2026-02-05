import { cloudflare } from '@cloudflare/vite-plugin'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
	plugins: [
		react(),
		cloudflare({ configPath: './wrangler.jsonc' }),
	],
	build: {
		rollupOptions: {
			input: {
				client: './src/client/index.tsx',
			},
			output: {
				entryFileNames: 'assets/[name].js',
				assetFileNames: 'assets/[name][extname]',
			},
		},
	},
	server: {
		port: 8789,
	},
})
