import postgres from "postgres";

const password = process.env.DB_PASSWORD;
if (!password) {
  console.error("Set DB_PASSWORD");
  process.exit(1);
}
const ref = process.env.SUPABASE_PROJECT_REF;
if (!ref) {
  console.error("Set SUPABASE_PROJECT_REF");
  process.exit(1);
}

const urls = [
  `postgresql://postgres.${ref}:${encodeURIComponent(password)}@aws-1-us-west-1.pooler.supabase.com:5432/postgres`,
  `postgresql://postgres.${ref}:${encodeURIComponent(password)}@aws-0-us-west-1.pooler.supabase.com:5432/postgres`,
  `postgresql://postgres:${encodeURIComponent(password)}@aws-1-us-west-1.pooler.supabase.com:5432/postgres?options=reference%3D${ref}`,
  `postgresql://postgres.${ref}:${encodeURIComponent(password)}@aws-1-us-west-1.pooler.supabase.com:6543/postgres`,
  `postgresql://postgres:${encodeURIComponent(password)}@db.${ref}.supabase.co:5432/postgres`,
];

for (const url of urls) {
  const label = url.replace(/:[^:@]+@/, ":***@");
  const sql = postgres(url, { prepare: false, max: 1, connect_timeout: 10, ssl: "require" });
  try {
    const rows = await sql`select 1 as ok`;
    console.log("OK", label, rows);
    await sql.end();
    process.exit(0);
  } catch (e) {
    console.log("FAIL", label, e.message);
    await sql.end({ timeout: 1 }).catch(() => {});
  }
}
process.exit(1);
