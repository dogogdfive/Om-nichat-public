import { config } from "dotenv";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
config({ path: join(root, ".env") });

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL missing");
  process.exit(1);
}

const sql = postgres(url, { prepare: false, max: 1, connect_timeout: 10, ssl: "require" });
try {
  const rows = await sql`select 1 as ok`;
  console.log("connected", rows);
} catch (e) {
  console.error("failed", e.message);
  process.exit(1);
} finally {
  await sql.end();
}
