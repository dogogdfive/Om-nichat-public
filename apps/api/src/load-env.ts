import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";

function findRootEnv(): string | undefined {
  const seeds = [
    dirname(fileURLToPath(import.meta.url)),
    process.cwd(),
  ];
  for (const seed of seeds) {
    let dir = seed;
    for (let i = 0; i < 8; i++) {
      const candidate = resolve(dir, ".env");
      if (existsSync(candidate)) return candidate;
      const parent = resolve(dir, "..");
      if (parent === dir) break;
      dir = parent;
    }
  }
  return undefined;
}

const envPath = findRootEnv();
if (envPath) {
  config({ path: envPath });
} else {
  config();
}

export const loadedEnvPath = envPath;
