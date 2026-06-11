#!/usr/bin/env node
/** Copy built Vite overlay into Next.js public/ for OBS browser source at /overlay */
import { cpSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const distDir = join(root, "apps", "overlay", "dist");
const outDir = join(root, "apps", "web", "public", "overlay");

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });
for (const entry of readdirSync(distDir)) {
  cpSync(join(distDir, entry), join(outDir, entry), { recursive: true });
}
console.log(`Copied overlay -> apps/web/public/overlay (${readdirSync(outDir).join(", ")})`);
