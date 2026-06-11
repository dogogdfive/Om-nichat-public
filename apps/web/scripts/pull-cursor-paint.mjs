#!/usr/bin/env node
import { cpSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { ClassicLevel } from "classic-level";
import sharp from "sharp";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const rawPath = join(root, "public", "landing-paint.raw.png");
const outPath = join(root, "public", "landing-paint.png");
const metaPath = join(root, "public", "landing-paint.meta.json");

const DESIGN_W = 1920;
const DESIGN_H = 1080;

const leveldb = join(
  process.env.APPDATA ?? "",
  "Cursor",
  "Partitions",
  "cursor-browser",
  "Local Storage",
  "leveldb",
);

const tmp = join(tmpdir(), `omnichat-cursor-paint-${Date.now()}`);
mkdirSync(tmp, { recursive: true });
for (const name of readdirSync(leveldb)) {
  try {
    cpSync(join(leveldb, name), join(tmp, name));
  } catch {
    /* locked */
  }
}

const db = new ClassicLevel(tmp, { createIfMissing: false });
let paint = null;

try {
  for await (const [key, value] of db.iterator()) {
    const k = String(key);
    if (!k.includes("http://localhost:3000") || !k.includes("omnichat-landing-paint")) continue;
    paint = String(value).replace(/^\u0001+/, "").trim();
  }
} finally {
  await db.close();
  try {
    rmSync(tmp, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
}

if (!paint || !paint.startsWith("data:image")) {
  console.error("No paint found in Cursor browser for localhost:3000");
  process.exit(1);
}

const b64 = paint.replace(/^data:image\/png;base64,/, "");
const rawBuf = Buffer.from(b64, "base64");
writeFileSync(rawPath, rawBuf);

const meta = await sharp(rawBuf).metadata();
const stageW = meta.width ?? DESIGN_W;
const stageH = meta.height ?? DESIGN_H;
writeFileSync(metaPath, JSON.stringify({ stageWidth: stageW, stageHeight: stageH }, null, 2));

const scale = Math.min(stageW / DESIGN_W, stageH / DESIGN_H);
const vw = Math.round(DESIGN_W * scale);
const vh = Math.round(DESIGN_H * scale);
const ox = Math.round((stageW - vw) / 2);
const oy = Math.round((stageH - vh) / 2);

const out = await sharp(rawBuf)
  .extract({ left: ox, top: oy, width: vw, height: vh })
  .resize(DESIGN_W, DESIGN_H)
  .png()
  .toBuffer();

writeFileSync(outPath, out);
console.log(`Wrote ${outPath} (${DESIGN_W}×${DESIGN_H}, cropped from ${stageW}×${stageH} stage)`);
