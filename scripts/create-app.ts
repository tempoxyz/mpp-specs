#!/usr/bin/env node
/**
 * Scaffold a new Tempo app from the _template
 *
 * Usage:
 *   npx ts-node scripts/create-app.ts my-app
 *   pnpm create-app my-app
 */

import {
	copyFileSync,
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	statSync,
	writeFileSync,
} from 'node:fs'
import { join } from 'node:path'

const TEMPLATE_DIR = 'apps/_template'
const APPS_DIR = 'apps'
const MAIN_WORKFLOW = '.github/workflows/main.yml'
const PR_WORKFLOW = '.github/workflows/pull-request.yml'

function main() {
	const appName = process.argv[2]

	if (!appName) {
		console.error('Usage: pnpm create-app <app-name>')
		console.error('Example: pnpm create-app my-awesome-app')
		process.exit(1)
	}

	// Validate app name
	if (!/^[a-z][a-z0-9-]*$/.test(appName)) {
		console.error(
			'Error: App name must be lowercase, start with a letter, and contain only letters, numbers, and hyphens',
		)
		process.exit(1)
	}

	if (appName.startsWith('_')) {
		console.error('Error: App name cannot start with underscore')
		process.exit(1)
	}

	const targetDir = join(APPS_DIR, appName)

	if (existsSync(targetDir)) {
		console.error(`Error: Directory ${targetDir} already exists`)
		process.exit(1)
	}

	if (!existsSync(TEMPLATE_DIR)) {
		console.error(`Error: Template directory ${TEMPLATE_DIR} not found`)
		process.exit(1)
	}

	console.log(`Creating new app: ${appName}`)
	console.log(`Target directory: ${targetDir}`)
	console.log('')

	// Copy template directory
	copyDir(TEMPLATE_DIR, targetDir)

	// Replace _template with app name in all files
	replaceInDir(targetDir, '_template', appName)

	// Update GitHub Actions workflows to include new app
	updateWorkflows(appName)

	console.log('✓ Created app directory')
	console.log('✓ Copied template files')
	console.log('✓ Updated app name in files')
	console.log('✓ Added app to CI/CD workflows')
	console.log('')
	console.log('Next steps:')
	console.log(`  1. pnpm install`)
	console.log(`  2. pnpm --filter @tempo/${appName} dev`)
	console.log('')
	console.log('To deploy:')
	console.log(`  pnpm --filter @tempo/${appName} deploy:preview`)
	console.log('')
}

function copyDir(src: string, dest: string) {
	mkdirSync(dest, { recursive: true })

	for (const entry of readdirSync(src)) {
		const srcPath = join(src, entry)
		const destPath = join(dest, entry)

		if (statSync(srcPath).isDirectory()) {
			copyDir(srcPath, destPath)
		} else {
			copyFileSync(srcPath, destPath)
		}
	}
}

function replaceInDir(dir: string, search: string, replace: string) {
	for (const entry of readdirSync(dir)) {
		const path = join(dir, entry)

		if (statSync(path).isDirectory()) {
			replaceInDir(path, search, replace)
		} else {
			const content = readFileSync(path, 'utf-8')
			if (content.includes(search)) {
				writeFileSync(path, content.replaceAll(search, replace))
			}
		}
	}
}

/**
 * Get all deployable apps from the apps directory (excluding _template)
 */
function getDeployableApps(): string[] {
	if (!existsSync(APPS_DIR)) {
		return []
	}

	const apps: string[] = []
	for (const entry of readdirSync(APPS_DIR)) {
		const appPath = join(APPS_DIR, entry)
		// Skip _template and non-directories
		if (entry.startsWith('_') || !statSync(appPath).isDirectory()) {
			continue
		}
		// Check if it has a wrangler.jsonc file (indicates it's deployable)
		if (existsSync(join(appPath, 'wrangler.jsonc'))) {
			apps.push(entry)
		}
	}
	return apps.sort()
}

/**
 * Update GitHub Actions workflows to include the new app
 */
function updateWorkflows(newApp: string) {
	const apps = getDeployableApps()

	// Update main.yml (production deployments)
	if (existsSync(MAIN_WORKFLOW)) {
		updateWorkflowMatrix(MAIN_WORKFLOW, apps)
	}

	// Update pull-request.yml (preview deployments)
	if (existsSync(PR_WORKFLOW)) {
		updateWorkflowMatrix(PR_WORKFLOW, apps)
	}
}

/**
 * Update the matrix include section in a workflow file
 */
function updateWorkflowMatrix(workflowPath: string, apps: string[]) {
	const content = readFileSync(workflowPath, 'utf-8')

	// Find the matrix include section and replace it
	const matrixIncludeRegex =
		/(\s+matrix:\s*\n\s+include:\s*\n)((?:\s+- app: [^\n]+\n)+)/

	if (!matrixIncludeRegex.test(content)) {
		console.warn(
			`Warning: Could not find matrix include section in ${workflowPath}`,
		)
		return
	}

	// Generate the new matrix include entries
	const matrixEntries = apps
		.map((app) => `          - app: ${app}`)
		.join('\n')

	const updatedContent = content.replace(
		matrixIncludeRegex,
		`$1${matrixEntries}\n`,
	)

	writeFileSync(workflowPath, updatedContent, 'utf-8')
}

main()
