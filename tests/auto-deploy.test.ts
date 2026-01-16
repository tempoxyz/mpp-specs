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

/**
 * Parse JSONC (JSON with comments) by stripping comments.
 * Handles single-line comments that aren't inside strings.
 */
function parseJsonc(content: string): unknown {
  // Process line by line to handle comments more safely
  const lines = content.split("\n");
  const processedLines: string[] = [];

  for (const line of lines) {
    // Find comment position, but not inside strings
    let inString = false;
    let commentIndex = -1;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      const prevChar = i > 0 ? line[i - 1] : "";

      // Toggle string state on unescaped quotes
      if (char === '"' && prevChar !== "\\") {
        inString = !inString;
      }

      // Check for // comment start outside of strings
      if (!inString && char === "/" && line[i + 1] === "/") {
        commentIndex = i;
        break;
      }
    }

    // Remove comment if found
    const processedLine =
      commentIndex >= 0 ? line.substring(0, commentIndex) : line;
    processedLines.push(processedLine);
  }

  const withoutSingleLine = processedLines.join("\n");
  // Remove multi-line comments (/* ... */)
  const withoutComments = withoutSingleLine.replace(/\/\*[\s\S]*?\*\//g, "");
  return JSON.parse(withoutComments);
}

// Apps that are excluded from auto-deployment requirement
const AUTO_DEPLOY_ALLOWLIST: string[] = [
  // Add apps here that should NOT be auto-deployed
  // Example: "experimental-app" - reason for exclusion
];

// Required environments for all apps
const REQUIRED_ENVS = ["moderato", "presto"];

// Apps that use TEMPO_RPC_URL and need specific RPC URL validation
const RPC_DEPENDENT_APPS = [
  "payments-proxy",
  "paymentauth-tetris",
  "paymentauth-basic",
  "paymentauth-x402",
  "reth-snapshots",
];

// Expected RPC URLs for each environment (only for RPC-dependent apps)
const EXPECTED_RPC_URLS: Record<string, string> = {
  moderato: "https://rpc.moderato.tempo.xyz",
  presto: "https://rpc.presto.tempo.xyz",
};

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
    "main.yml"
  );

  it("should have all apps configured for auto-deployment or in allowlist", () => {
    const allApps = getAllApps(appsDir);
    const deployedApps = getDeployedApps(mainWorkflowPath);

    // Check for apps that are neither deployed nor allowlisted
    const missingApps = allApps.filter(
      (app) =>
        !deployedApps.includes(app) && !AUTO_DEPLOY_ALLOWLIST.includes(app)
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

interface WranglerEnvConfig {
  name?: string;
  vars?: {
    TEMPO_RPC_URL?: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

interface WranglerConfig {
  env?: Record<string, WranglerEnvConfig>;
  [key: string]: unknown;
}

interface WorkflowMatrixItem {
  app: string;
  env?: string;
  [key: string]: unknown;
}

function getWranglerConfig(appPath: string): WranglerConfig | null {
  const wranglerPath = path.join(appPath, "wrangler.jsonc");
  if (!fs.existsSync(wranglerPath)) {
    return null;
  }
  const content = fs.readFileSync(wranglerPath, "utf8");
  return parseJsonc(content) as WranglerConfig;
}

function getDeployedAppsWithEnv(workflowPath: string): WorkflowMatrixItem[] {
  const workflowContent = fs.readFileSync(workflowPath, "utf8");
  const workflow = yaml.parse(workflowContent) as Workflow;
  const deployJob = workflow.jobs?.deploy;
  return (deployJob?.strategy?.matrix?.include || []) as WorkflowMatrixItem[];
}

describe("Multi-environment configuration", () => {
  const rootDir = path.resolve(__dirname, "..");
  const appsDir = path.join(rootDir, "apps");
  const mainWorkflowPath = path.join(
    rootDir,
    ".github",
    "workflows",
    "main.yml"
  );

  it("should have all apps deployed to both moderato and presto", () => {
    const allApps = getAllApps(appsDir);
    const matrixItems = getDeployedAppsWithEnv(mainWorkflowPath);

    for (const app of allApps) {
      if (AUTO_DEPLOY_ALLOWLIST.includes(app)) continue;

      const appEnvs = matrixItems
        .filter((item) => item.app === app && item.env)
        .map((item) => item.env);

      const missingEnvs = REQUIRED_ENVS.filter((env) => !appEnvs.includes(env));

      if (missingEnvs.length > 0) {
        throw new Error(
          `App "${app}" is missing deployments for environments: ${missingEnvs.join(
            ", "
          )}. ` +
            `Add entries to .github/workflows/main.yml matrix with env: moderato and env: presto.`
        );
      }
    }
  });

  it("should have all apps with moderato and presto environments in wrangler.jsonc", () => {
    const allApps = getAllApps(appsDir);

    for (const app of allApps) {
      if (AUTO_DEPLOY_ALLOWLIST.includes(app)) continue;

      const appPath = path.join(appsDir, app);
      const config = getWranglerConfig(appPath);

      if (!config) {
        throw new Error(`Missing wrangler.jsonc for app: ${app}`);
      }

      for (const env of REQUIRED_ENVS) {
        const envConfig = config.env?.[env];

        if (!envConfig) {
          throw new Error(
            `App "${app}" is missing environment "${env}" in wrangler.jsonc. ` +
              `All apps must have both moderato and presto environments.`
          );
        }
      }
    }
  });

  it("should have correct RPC URLs for RPC-dependent apps", () => {
    for (const app of RPC_DEPENDENT_APPS) {
      const appPath = path.join(appsDir, app);
      const config = getWranglerConfig(appPath);

      if (!config) {
        throw new Error(`Missing wrangler.jsonc for RPC-dependent app: ${app}`);
      }

      for (const env of REQUIRED_ENVS) {
        const envConfig = config.env?.[env];

        if (!envConfig) {
          throw new Error(
            `App "${app}" is missing environment "${env}" in wrangler.jsonc`
          );
        }

        const rpcUrl = envConfig.vars?.TEMPO_RPC_URL;
        const expectedUrl = EXPECTED_RPC_URLS[env];

        if (rpcUrl !== expectedUrl) {
          throw new Error(
            `App "${app}" env "${env}" has incorrect TEMPO_RPC_URL. ` +
              `Expected: ${expectedUrl}, Got: ${rpcUrl || "undefined"}`
          );
        }
      }
    }
  });

  it("should have RPC-dependent apps listed in RPC_DEPENDENT_APPS constant", () => {
    // Verify that all apps with TEMPO_RPC_URL in their wrangler.jsonc are tracked
    const allApps = getAllApps(appsDir);

    for (const app of allApps) {
      const appPath = path.join(appsDir, app);
      const config = getWranglerConfig(appPath);

      if (!config) continue;

      // Check if top-level vars have TEMPO_RPC_URL
      const topLevelConfig = config as { vars?: { TEMPO_RPC_URL?: string } };
      const hasRpcUrl = !!topLevelConfig.vars?.TEMPO_RPC_URL;

      if (hasRpcUrl && !RPC_DEPENDENT_APPS.includes(app)) {
        throw new Error(
          `App "${app}" has TEMPO_RPC_URL but is not listed in RPC_DEPENDENT_APPS. ` +
            `Add it to the RPC_DEPENDENT_APPS array in tests/auto-deploy.test.ts`
        );
      }
    }
  });
});
