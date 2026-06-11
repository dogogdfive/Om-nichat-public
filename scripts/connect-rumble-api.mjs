#!/usr/bin/env node
/** One-shot: connect Rumble Live Stream API URL to a workspace. */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import { createCipheriv, randomBytes } from "node:crypto";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
config({ path: join(root, ".env") });

const workspaceId = process.argv[2] ?? "65e7ca12-c7cd-42f7-998b-20d9843a69f6";
const apiUrl =
  process.argv[3] ??
  "https://rumble.com/-livestream-api/get-data?key=9MZQihAOBwlSFEh6hXdWKSTbQwG8BNFBCSKG-LpPeNeNw9K4-vli9BUNvTZfo20ulXfn4Sy_zz_K8uOYZ7qeig";

function encryptSecret(plain) {
  const hex = process.env.TOKEN_ENCRYPTION_KEY ?? "";
  if (hex.length !== 64) throw new Error("TOKEN_ENCRYPTION_KEY missing in .env");
  const key = Buffer.from(hex, "hex");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64")}:${tag.toString("base64")}:${enc.toString("base64")}`;
}

const res = await fetch(apiUrl, {
  headers: { "User-Agent": "Mozilla/5.0", Accept: "application/json" },
});
if (!res.ok) {
  console.error("Rumble API unreachable:", res.status);
  process.exit(1);
}
const data = await res.json();
const username = String(data.username ?? "").replace(/^@/, "").toLowerCase();
console.log("Rumble account:", username, "| live streams:", data.livestreams?.length ?? 0);

const dbPath = join(root, "data", "omnichat-local.json");
const db = JSON.parse(readFileSync(dbPath, "utf8"));
const idx = db.platformConnections.findIndex(
  (c) => c.workspaceId === workspaceId && c.platform === "rumble",
);
const row = {
  id: idx >= 0 ? db.platformConnections[idx].id : crypto.randomUUID(),
  workspaceId,
  platform: "rumble",
  accessTokenEnc: encryptSecret(apiUrl),
  refreshTokenEnc: null,
  platformUserId: data.user_id != null ? String(data.user_id) : null,
  platformUsername: username || "newearthfitnessarchive",
  scope: "livestream-api",
  expiresAt: null,
  updatedAt: new Date().toISOString(),
};
if (idx >= 0) db.platformConnections[idx] = row;
else db.platformConnections.push(row);

const slugIdx = db.workspaceSlugs.findIndex(
  (s) => s.workspaceId === workspaceId && s.platform === "rumble",
);
const slugRow = {
  id: slugIdx >= 0 ? db.workspaceSlugs[slugIdx].id : crypto.randomUUID(),
  workspaceId,
  platform: "rumble",
  slug: username || "newearthfitnessarchive",
};
if (slugIdx >= 0) db.workspaceSlugs[slugIdx] = slugRow;
else db.workspaceSlugs.push(slugRow);

writeFileSync(dbPath, JSON.stringify(db, null, 2) + "\n");
console.log("Updated local DB — restart pnpm dev:api to resume Rumble polling");
