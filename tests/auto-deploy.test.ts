/**
 * Verify that all apps in the monorepo are configured for auto-deployment
 * or explicitly listed in the allowlist.
 *
 * This test ensures that new apps don't ship without deployment configuration.
 */

import * as fs from 'node:fs'
import * as path from 'node:path'
import { describe, expect, it } from 'vitest'
import yaml from 'yaml'

/**
 * Parse JSONC (JSON with comments) by stripping comments.
 * Handles single-line comments that aren't inside strings.
 */
function parseJsonc(content: string): unknown {
	// Process line by line to handle comments more safely
	const lines = content.split('\n')
	const processedLines: string[] = []

	for (const line of lines) {
		// Find comment position, but not inside strings
		let inString = false
		let commentIndex = -1

		for (let i = 0; i < line.length; i++) {
			const char = line[i]
			const prevChar = i > 0 ? line[i - 1] : ''

			// Toggle string state on unescaped quotes
			if (char === '"' && prevChar !== '\\') {
				inString = !inString
			}

			// Check for // comment start outside of strings
			if (!inString && char === '/' && line[i + 1] === '/') {
				commentIndex = i
				break
			}
		}

		// Remove comment if found
		const processedLine = commentIndex >= 0 ? line.substring(0, commentIndex) : line
		processedLines.push(processedLine)
	}

	const withoutSingleLine = processedLines.join('\n')
	// Remove multi-line comments (/* ... */)
	const withoutComments = withoutSingleLine.replace(/\/\*[\s\S]*?\*\//g, '')
	return JSON.parse(withoutComments)
}

// Apps that are excluded from multi-environment deployment requirement
const AUTO_DEPLOY_ALLOWLIST: string[] = [
	// Add apps here that don't need testnet/moderato/mainnet environments
	'presto', // Cloudflare Pages static app - single deployment, no multi-env
]

// Required environments for all apps (matching tempo-apps fee-payer pattern)
const REQUIRED_ENVS = ['testnet', 'moderato', 'mainnet']

// Apps that use TEMPO_RPC_URL and need specific RPC URL validation
const RPC_DEPENDENT_APPS = [
	'payments-dashboard',
	'payments-proxy',
	'paymentauth-tetris',
	'paymentauth-basic',
	'paymentauth-x402',
	'reth-snapshots',
]

// Expected RPC URLs for each environment (only for RPC-dependent apps)
// With keep_vars: true, moderato inherits from top-level, so we check effective value
// Note: testnet uses moderato RPC because *-testnet.tempo.xyz is the canonical testnet
// that points to the current testnet chain (currently Moderato, chain ID 42431)
const EXPECTED_RPC_URLS: Record<string, string> = {
	testnet: 'https://rpc.moderato.tempo.xyz',
	moderato: 'https://rpc.moderato.tempo.xyz',
	mainnet: 'https://rpc.tempo.xyz',
}

interface WorkflowMatrix {
	include?: Array<{ app: string; [key: string]: unknown }>
}

interface DeployJob {
	strategy?: {
		matrix?: WorkflowMatrix
	}
}

interface Workflow {
	jobs?: {
		deploy?: DeployJob
		[key: string]: unknown
	}
}

function getAllApps(appsDir: string): string[] {
	const apps: string[] = []
	const entries = fs.readdirSync(appsDir, { withFileTypes: true })

	for (const entry of entries) {
		// Skip hidden files, templates, and non-directories
		if (entry.name.startsWith('.') || entry.name.startsWith('_') || !entry.isDirectory()) {
			continue
		}

		// Check if it has a package.json to confirm it's an app
		const packageJsonPath = path.join(appsDir, entry.name, 'package.json')
		if (fs.existsSync(packageJsonPath)) {
			apps.push(entry.name)
		}
	}

	return apps.sort()
}

function getDeployedApps(workflowPath: string): string[] {
	const workflowContent = fs.readFileSync(workflowPath, 'utf8')
	const workflow = yaml.parse(workflowContent) as Workflow

	const deployJob = workflow.jobs?.deploy
	const matrix = deployJob?.strategy?.matrix?.include || []

	return matrix.map((item) => item.app).sort()
}

describe('Auto-deployment configuration', () => {
	const rootDir = path.resolve(__dirname, '..')
	const appsDir = path.join(rootDir, 'apps')
	const mainWorkflowPath = path.join(rootDir, '.github', 'workflows', 'main.yml')

	it('should have all apps configured for auto-deployment or in allowlist', () => {
		const allApps = getAllApps(appsDir)
		const deployedApps = getDeployedApps(mainWorkflowPath)

		// Check for apps that are neither deployed nor allowlisted
		const missingApps = allApps.filter(
			(app) => !deployedApps.includes(app) && !AUTO_DEPLOY_ALLOWLIST.includes(app),
		)

		if (missingApps.length > 0) {
			const errorMessage = [
				'The following apps are not configured for auto-deployment:',
				...missingApps.map((app) => `  - ${app}`),
				'',
				'To fix this, either:',
				'  1. Add the app to the deployment matrix in .github/workflows/main.yml',
				'  2. Add the app to AUTO_DEPLOY_ALLOWLIST in tests/auto-deploy.test.ts',
			].join('\n')

			throw new Error(errorMessage)
		}

		expect(missingApps).toEqual([])
	})

	it("should not have apps in workflow that don't exist", () => {
		const allApps = getAllApps(appsDir)
		const deployedApps = getDeployedApps(mainWorkflowPath)

		const extraApps = deployedApps.filter((app) => !allApps.includes(app))

		if (extraApps.length > 0) {
			const errorMessage = [
				"The following apps are configured for deployment but don't exist:",
				...extraApps.map((app) => `  - ${app}`),
			].join('\n')

			throw new Error(errorMessage)
		}

		expect(extraApps).toEqual([])
	})

	it('should have apps directory', () => {
		expect(fs.existsSync(appsDir)).toBe(true)
	})

	it('should have main workflow file', () => {
		expect(fs.existsSync(mainWorkflowPath)).toBe(true)
	})
})

interface WranglerEnvConfig {
	name?: string
	vars?: {
		TEMPO_RPC_URL?: string
		[key: string]: unknown
	}
	[key: string]: unknown
}

interface WranglerConfig {
	keep_vars?: boolean
	vars?: {
		TEMPO_RPC_URL?: string
		[key: string]: unknown
	}
	env?: Record<string, WranglerEnvConfig>
	[key: string]: unknown
}

interface WorkflowMatrixItem {
	app: string
	env?: string
	[key: string]: unknown
}

function getWranglerConfig(appPath: string): WranglerConfig | null {
	const wranglerPath = path.join(appPath, 'wrangler.jsonc')
	if (!fs.existsSync(wranglerPath)) {
		return null
	}
	const content = fs.readFileSync(wranglerPath, 'utf8')
	return parseJsonc(content) as WranglerConfig
}

/**
 * Get the effective RPC URL for an environment, considering keep_vars inheritance
 */
function getEffectiveRpcUrl(config: WranglerConfig, env: string): string | undefined {
	const envConfig = config.env?.[env]
	if (!envConfig) return undefined

	// If env has explicit TEMPO_RPC_URL, use it
	if (envConfig.vars?.TEMPO_RPC_URL) {
		return envConfig.vars.TEMPO_RPC_URL
	}

	// If keep_vars is true, inherit from top-level
	if (config.keep_vars && config.vars?.TEMPO_RPC_URL) {
		return config.vars.TEMPO_RPC_URL
	}

	return undefined
}

function getDeployedAppsWithEnv(workflowPath: string): WorkflowMatrixItem[] {
	const workflowContent = fs.readFileSync(workflowPath, 'utf8')
	const workflow = yaml.parse(workflowContent) as Workflow
	const deployJob = workflow.jobs?.deploy
	return (deployJob?.strategy?.matrix?.include || []) as WorkflowMatrixItem[]
}

describe('Multi-environment configuration', () => {
	const rootDir = path.resolve(__dirname, '..')
	const appsDir = path.join(rootDir, 'apps')
	const mainWorkflowPath = path.join(rootDir, '.github', 'workflows', 'main.yml')

	it('should have all apps deployed to testnet, moderato, and mainnet', () => {
		const allApps = getAllApps(appsDir)
		const matrixItems = getDeployedAppsWithEnv(mainWorkflowPath)

		for (const app of allApps) {
			if (AUTO_DEPLOY_ALLOWLIST.includes(app)) continue

			const appEnvs = matrixItems
				.filter((item) => item.app === app && item.env)
				.map((item) => item.env)

			const missingEnvs = REQUIRED_ENVS.filter((env) => !appEnvs.includes(env))

			if (missingEnvs.length > 0) {
				throw new Error(
					`App "${app}" is missing deployments for environments: ${missingEnvs.join(', ')}. ` +
						`Add entries to .github/workflows/main.yml matrix with env: testnet, env: moderato, and env: mainnet.`,
				)
			}
		}
	})

	it('should have all apps with testnet, moderato, and mainnet environments in wrangler.jsonc', () => {
		const allApps = getAllApps(appsDir)

		for (const app of allApps) {
			if (AUTO_DEPLOY_ALLOWLIST.includes(app)) continue

			const appPath = path.join(appsDir, app)
			const config = getWranglerConfig(appPath)

			if (!config) {
				throw new Error(`Missing wrangler.jsonc for app: ${app}`)
			}

			for (const env of REQUIRED_ENVS) {
				const envConfig = config.env?.[env]

				if (!envConfig) {
					throw new Error(
						`App "${app}" is missing environment "${env}" in wrangler.jsonc. ` +
							`All apps must have testnet, moderato, and mainnet environments.`,
					)
				}
			}
		}
	})

	it('should have correct RPC URLs for RPC-dependent apps', () => {
		for (const app of RPC_DEPENDENT_APPS) {
			const appPath = path.join(appsDir, app)
			const config = getWranglerConfig(appPath)

			if (!config) {
				throw new Error(`Missing wrangler.jsonc for RPC-dependent app: ${app}`)
			}

			for (const env of REQUIRED_ENVS) {
				const envConfig = config.env?.[env]

				if (!envConfig) {
					throw new Error(`App "${app}" is missing environment "${env}" in wrangler.jsonc`)
				}

				// Use effective RPC URL (considering keep_vars inheritance)
				const rpcUrl = getEffectiveRpcUrl(config, env)
				const expectedUrl = EXPECTED_RPC_URLS[env]

				if (rpcUrl !== expectedUrl) {
					throw new Error(
						`App "${app}" env "${env}" has incorrect TEMPO_RPC_URL. ` +
							`Expected: ${expectedUrl}, Got: ${rpcUrl || 'undefined'}`,
					)
				}
			}
		}
	})

	it('should have RPC-dependent apps listed in RPC_DEPENDENT_APPS constant', () => {
		// Verify that all apps with TEMPO_RPC_URL in their wrangler.jsonc are tracked
		const allApps = getAllApps(appsDir)

		for (const app of allApps) {
			const appPath = path.join(appsDir, app)
			const config = getWranglerConfig(appPath)

			if (!config) continue

			// Check if top-level vars have TEMPO_RPC_URL
			const topLevelConfig = config as { vars?: { TEMPO_RPC_URL?: string } }
			const hasRpcUrl = !!topLevelConfig.vars?.TEMPO_RPC_URL

			if (hasRpcUrl && !RPC_DEPENDENT_APPS.includes(app)) {
				throw new Error(
					`App "${app}" has TEMPO_RPC_URL but is not listed in RPC_DEPENDENT_APPS. ` +
						`Add it to the RPC_DEPENDENT_APPS array in tests/auto-deploy.test.ts`,
				)
			}
		}
	})
})

interface WranglerRoute {
	pattern: string
	zone_name?: string
	custom_domain?: boolean
}

/**
 * Extract partner slugs from the partners/index.ts file
 */
function getPartnerSlugsFromSource(appPath: string): string[] {
	const partnersIndexPath = path.join(appPath, 'src', 'partners', 'index.ts')
	if (!fs.existsSync(partnersIndexPath)) {
		return []
	}

	const content = fs.readFileSync(partnersIndexPath, 'utf8')

	// Extract partner file imports (e.g., import { browserbase } from './browserbase.js')
	const importMatches = content.matchAll(
		/import\s*{\s*(\w+)\s*}\s*from\s*['"]\.\/([\w-]+)\.js['"]/g,
	)
	const partnerFiles = Array.from(importMatches).map((m) => m[2])

	const slugs: string[] = []

	for (const partnerFile of partnerFiles) {
		const partnerPath = path.join(appPath, 'src', 'partners', `${partnerFile}.ts`)
		if (!fs.existsSync(partnerPath)) continue

		const partnerContent = fs.readFileSync(partnerPath, 'utf8')

		// Extract slug from partner config
		const slugMatch = partnerContent.match(/slug:\s*['"](\w+)['"]/)
		if (slugMatch) {
			slugs.push(slugMatch[1])
		}

		// Extract aliases from partner config
		const aliasesMatch = partnerContent.match(/aliases:\s*\[([^\]]+)\]/)
		if (aliasesMatch) {
			const aliasesStr = aliasesMatch[1]
			const aliases = aliasesStr.match(/['"]([\w-]+)['"]/g)
			if (aliases) {
				for (const alias of aliases) {
					slugs.push(alias.replace(/['"]/g, ''))
				}
			}
		}
	}

	return slugs
}

/**
 * Extract subdomain from a route pattern
 * e.g., "browserbase.payments.testnet.tempo.xyz" -> "browserbase"
 */
function extractSubdomainFromPattern(pattern: string): string | null {
	const match = pattern.match(/^(\w+)\.payments\./)
	return match ? match[1] : null
}

describe('Payments-proxy partner routes', () => {
	const rootDir = path.resolve(__dirname, '..')
	const paymentsProxyPath = path.join(rootDir, 'apps', 'payments-proxy')

	it('should have all partners covered by routes in each environment', () => {
		const config = getWranglerConfig(paymentsProxyPath)
		if (!config) {
			throw new Error('Missing wrangler.jsonc for payments-proxy')
		}

		const partnerSlugs = getPartnerSlugsFromSource(paymentsProxyPath)
		if (partnerSlugs.length === 0) {
			throw new Error('Could not extract partner slugs from payments-proxy source')
		}

		for (const env of REQUIRED_ENVS) {
			const envConfig = config.env?.[env]
			if (!envConfig) {
				throw new Error(`Missing environment "${env}" in payments-proxy wrangler.jsonc`)
			}

			const routes = (envConfig as { routes?: WranglerRoute[] }).routes || []
			const configuredSubdomains = routes
				.map((r) => extractSubdomainFromPattern(r.pattern))
				.filter((s): s is string => s !== null)

			const missingPartners = partnerSlugs.filter((slug) => !configuredSubdomains.includes(slug))

			if (missingPartners.length > 0) {
				throw new Error(
					`Payments-proxy env "${env}" is missing routes for partners: ${missingPartners.join(
						', ',
					)}. ` +
						`Add routes like { "pattern": "${missingPartners[0]}.payments.${
							env === 'mainnet' ? '' : `${env}.`
						}tempo.xyz", "zone_name": "tempo.xyz", "custom_domain": true } ` +
						`to the wrangler.jsonc routes array for the ${env} environment.`,
				)
			}
		}
	})

	it('should not have routes for non-existent partners', () => {
		const config = getWranglerConfig(paymentsProxyPath)
		if (!config) {
			throw new Error('Missing wrangler.jsonc for payments-proxy')
		}

		const partnerSlugs = getPartnerSlugsFromSource(paymentsProxyPath)

		for (const env of REQUIRED_ENVS) {
			const envConfig = config.env?.[env]
			if (!envConfig) continue

			const routes = (envConfig as { routes?: WranglerRoute[] }).routes || []
			const configuredSubdomains = routes
				.map((r) => extractSubdomainFromPattern(r.pattern))
				.filter((s): s is string => s !== null)

			const extraSubdomains = configuredSubdomains.filter(
				(subdomain) => !partnerSlugs.includes(subdomain),
			)

			if (extraSubdomains.length > 0) {
				throw new Error(
					`Payments-proxy env "${env}" has routes for non-existent partners: ${extraSubdomains.join(
						', ',
					)}. ` +
						`Either add these partners to src/partners/ or remove the routes from wrangler.jsonc.`,
				)
			}
		}
	})
})
