import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { pingDb } from "@omnichat/db";

export type DbMode = "postgres" | "local";

let mode: DbMode = "postgres";

export function getDbMode(): DbMode {
  return mode;
}

export function localDbPath(): string {
  const root = join(dirname(fileURLToPath(import.meta.url)), "../../../..");
  return join(root, "data", "omnichat-local.json");
}

export async function initStorage(): Promise<void> {
  if (process.env.USE_LOCAL_DB === "1") {
    mode = "local";
    mkdirSync(dirname(localDbPath()), { recursive: true });
    console.warn("[omnichat] USE_LOCAL_DB=1 — file database:", localDbPath());
    return;
  }
  if (process.env.USE_LOCAL_DB === "0") {
    mode = "postgres";
    return;
  }
  const ok = await pingDb();
  if (!ok) {
    mode = "local";
    mkdirSync(dirname(localDbPath()), { recursive: true });
    console.warn(
      "[omnichat] Postgres unreachable — using local file DB:",
      localDbPath(),
      "\nFix: Supabase dashboard → Database → Reset password to match .env → pnpm db:test",
    );
  }
}
