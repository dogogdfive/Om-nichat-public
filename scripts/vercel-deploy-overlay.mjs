#!/usr/bin/env node
/**
 * Build overlay locally, then deploy prebuilt static files to Vercel (omnichat-overlay).
 * Usage (repo root): node scripts/vercel-deploy-overlay.mjs
 */
import { execSync } from "node:child_process";
import { cpSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const overlayDir = join(root, "apps", "overlay");
const stageDir = join(tmpdir(), "omnichat-overlay-deploy");
const projectId = "prj_vrXuzNlbxobAUHh1jJ3Amq4Kg2zx";
const orgId = "team_MGbAASTCOKk4mESxQ5dfx4dD";

console.log("Building overlay...");
execSync("pnpm --filter @omnichat/chat-types build && pnpm --filter @omnichat/overlay build", {
  cwd: root,
  stdio: "inherit",
});

rmSync(stageDir, { recursive: true, force: true });
mkdirSync(stageDir, { recursive: true });
const distDir = join(overlayDir, "dist");
for (const entry of readdirSync(distDir)) {
  cpSync(join(distDir, entry), join(stageDir, entry), { recursive: true });
}
cpSync(join(overlayDir, "vercel.json"), join(stageDir, "vercel.json"));

console.log("Deploying to Vercel (omnichat-overlay)...");
execSync("vercel deploy --prod --yes", {
  cwd: stageDir,
  stdio: "inherit",
  env: {
    ...process.env,
    VERCEL_ORG_ID: orgId,
    VERCEL_PROJECT_ID: projectId,
  },
});

console.log("Adding overlay.omnichat.wtf domain...");
try {
  execSync("vercel domains add overlay.omnichat.wtf --project omnichat-overlay", {
    cwd: overlayDir,
    stdio: "inherit",
  });
} catch {
  console.log("(domain may already be attached)");
}

console.log("Done: https://overlay.omnichat.wtf");
