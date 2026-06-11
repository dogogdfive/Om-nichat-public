#!/usr/bin/env node
/**
 * Bakes Brave-exported landing layout into lib/landing-baked.ts
 *
 * Usage:
 *   1. node apps/web/scripts/export-landing-layout.mjs  (copy snippet into Brave console)
 *   2. Save download as apps/web/landing-layout.export.json
 *   3. node apps/web/scripts/bake-landing-layout.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const exportPath = join(root, "landing-layout.export.json");
const outPath = join(root, "lib", "landing-baked.ts");

const raw = JSON.parse(readFileSync(exportPath, "utf8"));
const keys = Object.keys(raw).filter((k) => k.startsWith("omnichat-landing-") && k !== "omnichat-landing-paint");
if (keys.length === 0) {
  console.error("No omnichat-landing-* keys in export (paint excluded).");
  process.exit(1);
}

const entries = keys.sort().map((k) => `  ${JSON.stringify(k)}: ${JSON.stringify(raw[k])},`);
const body = `import { LANDING_LAYOUT_EDITORS_ENABLED } from "@/lib/landing-edit-mode";

/**
 * Committed layout snapshot — regenerated ${new Date().toISOString().slice(0, 10)}.
 * Export from Brave → landing-layout.export.json → bake-landing-layout.mjs
 */
export const LANDING_BAKED_RAW: Record<string, string> = {
${entries.join("\n")}
};

/**
 * Layout settings: prefer baked snapshot when editors are off (same look everywhere).
 * Paint (\`omnichat-landing-paint\`) should keep using localStorage directly.
 */
export function readLandingStorage(key: string): string | null {
  const baked = LANDING_BAKED_RAW[key] ?? null;
  if (!LANDING_LAYOUT_EDITORS_ENABLED && baked) return baked;
  try {
    return localStorage.getItem(key) ?? baked;
  } catch {
    return baked;
  }
}

export function loadBakedJson<T>(storageKey: string, parse: (raw: string) => T): T | null {
  const raw = readLandingStorage(storageKey);
  if (!raw) return null;
  try {
    return parse(raw);
  } catch {
    return null;
  }
}
`;

writeFileSync(outPath, body, "utf8");
console.log(`Baked ${keys.length} keys into ${outPath}`);
keys.forEach((k) => console.log("  -", k));
