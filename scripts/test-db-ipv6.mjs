import dns from "node:dns";
import postgres from "postgres";

dns.setDefaultResultOrder("ipv6first");

const password = process.env.DB_PASSWORD;
const ref = process.env.SUPABASE_PROJECT_REF;
if (!password || !ref) {
  console.error("Set DB_PASSWORD and SUPABASE_PROJECT_REF");
  process.exit(1);
}

const url = `postgresql://postgres:${encodeURIComponent(password)}@db.${ref}.supabase.co:5432/postgres`;

const sql = postgres(url, { prepare: false, max: 1, ssl: "require", connect_timeout: 15 });
try {
  const rows = await sql`select 1 as ok`;
  console.log("direct ipv6 ok", rows);
} catch (e) {
  console.error("direct ipv6 fail", e.message);
  process.exit(1);
} finally {
  await sql.end();
}
