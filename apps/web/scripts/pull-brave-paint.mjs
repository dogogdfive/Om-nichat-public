#!/usr/bin/env node
import { cpSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { ClassicLevel } from "classic-level";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const rawPath = join(root, "public", "landing-paint.raw.png");
const outPath = join(root, "public", "landing-paint.png");
const metaPath = join(root, "public", "landing-paint.meta.json");

const defaultHosts = [
  "omnichat-web-alpha.vercel.app",
  "localhost:3000",
  "127.0.0.1:3000",
];
const hosts = process.argv.length > 2 ? process.argv.slice(2) : defaultHosts;

const leveldb = join(
  process.env.LOCALAPPDATA ?? "",
  "BraveSoftware",
  "Brave-Browser",
  "User Data",
  "Default",
  "Local Storage",
  "leveldb",
);

const tmp = join(tmpdir(), `omnichat-brave-paint-${Date.now()}`);
mkdirSync(tmp, { recursive: true });
for (const name of readdirSync(leveldb)) {
  try {
    cpSync(join(leveldb, name), join(tmp, name));
  } catch {
    /* locked — close Brave and retry */
  }
}

const db = new ClassicLevel(tmp, { createIfMissing: false });
const paintsByHost = new Map();

try {
  for await (const [key, value] of db.iterator()) {
    const k = String(key);
    if (!k.includes("omnichat-landing-paint")) continue;
    for (const host of hosts) {
      if (!k.includes(host)) continue;
      paintsByHost.set(
        host,
        String(value).replace(/^\u0001+/, "").trim(),
      );
    }
  }
} finally {
  await db.close();
  try {
    rmSync(tmp, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
}

let paint = null;
let matchedHost = null;
for (const host of hosts) {
  const candidate = paintsByHost.get(host);
  if (candidate?.startsWith("data:image")) {
    paint = candidate;
    matchedHost = host;
    break;
  }
}

if (!paint || !paint.startsWith("data:image")) {
  console.error(`No paint found in Brave for: ${hosts.join(", ")}`);
  console.error("Close Brave completely, then run this script again.");
  process.exit(1);
}

const b64 = paint.replace(/^data:image\/png;base64,/, "");
writeFileSync(rawPath, Buffer.from(b64, "base64"));
writeFileSync(outPath, Buffer.from(b64, "base64"));
console.log(`Pulled paint from ${matchedHost} → ${outPath} (${Math.round(b64.length / 1024)} KB base64)`);

try {
  const sharp = (await import("sharp")).default;
  const { width, height } = await sharp(rawPath).metadata();
  if (width && height) {
    writeFileSync(metaPath, `${JSON.stringify({ stageWidth: width, stageHeight: height }, null, 2)}\n`);
    console.log(`Updated ${metaPath} → ${width}×${height}`);
  }
} catch (e) {
  console.warn("Could not update meta.json (sharp missing?):", e.message);
}
