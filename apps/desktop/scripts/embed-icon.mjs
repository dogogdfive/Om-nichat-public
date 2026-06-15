#!/usr/bin/env node
/** Embed yellow-star .ico into built exe (needed when signAndEditExecutable is false). */
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import rcedit from "rcedit";

const here = dirname(fileURLToPath(import.meta.url));
const desktopDir = join(here, "..");
const ico = join(desktopDir, "resources", "icon.ico");
const releaseDir = join(desktopDir, "release");

const targets = [
  join(releaseDir, "win-unpacked", "OMnichat.exe"),
  join(releaseDir, "OMnichat Setup 0.0.1.exe"),
];

if (!existsSync(ico)) {
  console.error("Missing resources/icon.ico — run pnpm prepare-icon first");
  process.exit(1);
}

for (const exe of targets) {
  if (!existsSync(exe)) continue;
  console.log("Embedding icon:", exe);
  await rcedit(exe, { icon: ico });
}

console.log("Icon embed complete.");
