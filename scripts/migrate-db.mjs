import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import postgres from "postgres";

const __dir = dirname(fileURLToPath(import.meta.url));
config({ path: join(__dir, "../.env") });

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("Set DATABASE_URL in .env (Supabase connection string)");
  process.exit(1);
}

const drizzleDir = join(__dir, "../packages/db/drizzle");
const files = readdirSync(drizzleDir)
  .filter((f) => f.endsWith(".sql"))
  .sort();

const db = postgres(url, { max: 1 });
for (const file of files) {
  const sql = readFileSync(join(drizzleDir, file), "utf8");
  try {
    await db.unsafe(sql);
    console.log(`Applied ${file}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("already exists")) {
      console.log(`Skip ${file} (already applied)`);
    } else {
      throw err;
    }
  }
}
await db.end();
console.log("Migrations finished.");
