import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const envFile = join(root, ".env");
if (!existsSync(envFile)) {
  console.error("Missing .env at repo root:", envFile);
  process.exit(1);
}
config({ path: envFile });

const apiDir = join(root, "apps", "api");
const child = spawn(
  process.platform === "win32" ? "pnpm.cmd" : "pnpm",
  ["exec", "tsx", "watch", "src/index.ts"],
  {
    cwd: apiDir,
    stdio: "inherit",
    env: process.env,
    shell: process.platform === "win32",
  },
);

child.on("exit", (code) => process.exit(code ?? 0));
