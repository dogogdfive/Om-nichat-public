#!/usr/bin/env node
import { cpSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { ClassicLevel } from "classic-level";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outExport = join(root, "landing-layout.export.json");
const outBaked = join(root, "lib", "landing-baked.ts");

const leveldb = join(
  process.env.LOCALAPPDATA ?? "",
  "BraveSoftware",
  "Brave-Browser",
  "User Data",
  "Default",
  "Local Storage",
  "leveldb",
);

const tmp = join(tmpdir(), `omnichat-brave-ls-${Date.now()}`);
mkdirSync(tmp, { recursive: true });

for (const name of readdirSync(leveldb)) {
  try {
    cpSync(join(leveldb, name), join(tmp, name));
  } catch {
    /* skip locked files — level may still open */
  }
}

const db = new ClassicLevel(tmp, { createIfMissing: false });
const exportObj = {};

function cleanValue(value) {
  return String(value).replace(/^\u0001+/, "").trim();
}

try {
  for await (const [key, value] of db.iterator()) {
    const k = String(key);
    if (!k.includes("http://localhost:3000") || !k.includes("omnichat-landing-")) continue;
    const match = k.match(/omnichat-landing-[a-z0-9-]+/);
    if (!match) continue;
    const storageKey = match[0];
    const val = cleanValue(value);
    if (!val) continue;
    if (!exportObj[storageKey] || val.length > exportObj[storageKey].length) {
      exportObj[storageKey] = val;
    }
  }
} finally {
  await db.close();
  try {
    rmSync(tmp, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
}

const sortedKeys = Object.keys(exportObj).sort();
if (sortedKeys.length === 0) {
  console.error("No omnichat-landing keys in Brave leveldb:", leveldb);
  process.exit(1);
}

writeFileSync(outExport, JSON.stringify(exportObj, null, 2), "utf8");
console.log(`Wrote ${sortedKeys.length} keys to ${outExport}`);
sortedKeys.forEach((k) => console.log(" ", k, `(${exportObj[k].length} chars)`));

const bakeKeys = sortedKeys.filter(
  (k) => k !== "omnichat-landing-paint" && k !== "omnichat-landing-om-star",
);
const entries = bakeKeys.map((k) => `  ${JSON.stringify(k)}: ${JSON.stringify(exportObj[k])},`);
const body = `import { LANDING_LAYOUT_EDITORS_ENABLED } from "@/lib/landing-edit-mode";

/**
 * Committed layout snapshot — auto-extracted from Brave ${new Date().toISOString().slice(0, 10)}.
 */
export const LANDING_BAKED_RAW: Record<string, string> = {
${entries.join("\n")}
};

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

writeFileSync(outBaked, body, "utf8");
console.log(`Baked ${bakeKeys.length} layout keys into ${outBaked}`);
