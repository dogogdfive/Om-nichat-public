import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema.js";

export * from "./schema.js";

let client: ReturnType<typeof postgres> | null = null;
let db: ReturnType<typeof drizzle<typeof schema>> | null = null;

export function getDb() {
  if (!db) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not set");
    client = postgres(url, {
      prepare: false,
      ssl: "require",
      connect_timeout: 15,
      max: 10,
    });
    db = drizzle(client, { schema });
  }
  return db;
}

export async function pingDb(): Promise<boolean> {
  try {
    const database = getDb();
    await database.execute(sql`select 1 as ok`);
    return true;
  } catch {
    return false;
  }
}

export async function closeDb() {
  if (client) {
    await client.end();
    client = null;
    db = null;
  }
}
