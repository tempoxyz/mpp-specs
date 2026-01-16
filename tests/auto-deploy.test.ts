/**
 * Verify that all apps in the monorepo are configured for auto-deployment
 * or explicitly listed in the allowlist.
 *
 * This test ensures that new apps don't ship without deployment configuration.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import yaml from "yaml";

// Apps that are excluded from auto-deployment requirement
const AUTO_DEPLOY_ALLOWLIST: string[] = [
	// Add apps here that should NOT be auto-deployed
	// Example: "experimental-app" - reason for exclusion
];

interface WorkflowMatrix {
	include?: Array<{ app: string; [key: string]: unknown }>;
}

interface DeployJob {
	strategy?: {
		matrix?: WorkflowMatrix;
	};
}

interface Workflow {
	jobs?: {
		deploy?: DeployJob;
		[key: string]: unknown;
	};
}

function getAllApps(appsDir: string): string[] {
	const apps: string[] = [];
	const entries = fs.readdirSync(appsDir, { withFileTypes: true });

	for (const entry of entries) {
		// Skip hidden files, templates, and non-directories
		if (
			entry.name.startsWith(".") ||
			entry.name.startsWith("_") ||
			!entry.isDirectory()
		) {
			continue;
		}

		// Check if it has a package.json to confirm it's an app
		const packageJsonPath = path.join(appsDir, entry.name, "package.json");
		if (fs.existsSync(packageJsonPath)) {
			apps.push(entry.name);
		}
	}

	return apps.sort();
}

function getDeployedApps(workflowPath: string): string[] {
	const workflowContent = fs.readFileSync(workflowPath, "utf8");
	const workflow = yaml.parse(workflowContent) as Workflow;

	const deployJob = workflow.jobs?.deploy;
	const matrix = deployJob?.strategy?.matrix?.include || [];

	return matrix.map((item) => item.app).sort();
}

describe("Auto-deployment configuration", () => {
	const rootDir = path.resolve(__dirname, "..");
	const appsDir = path.join(rootDir, "apps");
	const mainWorkflowPath = path.join(
		rootDir,
		".github",
		"workflows",
		"main.yml",
	);

	it("should have all apps configured for auto-deployment or in allowlist", () => {
		const allApps = getAllApps(appsDir);
		const deployedApps = getDeployedApps(mainWorkflowPath);

		// Check for apps that are neither deployed nor allowlisted
		const missingApps = allApps.filter(
			(app) =>
				!deployedApps.includes(app) && !AUTO_DEPLOY_ALLOWLIST.includes(app),
		);

		if (missingApps.length > 0) {
			const errorMessage = [
				"The following apps are not configured for auto-deployment:",
				...missingApps.map((app) => `  - ${app}`),
				"",
				"To fix this, either:",
				"  1. Add the app to the deployment matrix in .github/workflows/main.yml",
				"  2. Add the app to AUTO_DEPLOY_ALLOWLIST in tests/auto-deploy.test.ts",
			].join("\n");

			throw new Error(errorMessage);
		}

		expect(missingApps).toEqual([]);
	});

	it("should not have apps in workflow that don't exist", () => {
		const allApps = getAllApps(appsDir);
		const deployedApps = getDeployedApps(mainWorkflowPath);

		const extraApps = deployedApps.filter((app) => !allApps.includes(app));

		if (extraApps.length > 0) {
			const errorMessage = [
				"The following apps are configured for deployment but don't exist:",
				...extraApps.map((app) => `  - ${app}`),
			].join("\n");

			throw new Error(errorMessage);
		}

		expect(extraApps).toEqual([]);
	});

	it("should have apps directory", () => {
		expect(fs.existsSync(appsDir)).toBe(true);
	});

	it("should have main workflow file", () => {
		expect(fs.existsSync(mainWorkflowPath)).toBe(true);
	});
});
