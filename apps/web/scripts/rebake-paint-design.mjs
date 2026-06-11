#!/usr/bin/env node
/**
 * Crops a full-stage paint PNG to the centered 1920×1080 design viewport,
 * then resizes to design resolution so paint aligns in every browser.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const inPath = process.argv[2] ?? join(root, "public", "landing-paint.png");
const outPath = process.argv[3] ?? inPath;
const metaPath = join(root, "public", "landing-paint.meta.json");

const DESIGN_W = 1920;
const DESIGN_H = 1080;

const meta = JSON.parse(readFileSync(metaPath, "utf8"));
const stageW = meta.stageWidth;
const stageH = meta.stageHeight;

const scale = Math.min(stageW / DESIGN_W, stageH / DESIGN_H);
const vw = Math.round(DESIGN_W * scale);
const vh = Math.round(DESIGN_H * scale);
const ox = Math.round((stageW - vw) / 2);
const oy = Math.round((stageH - vh) / 2);

const out = await sharp(inPath)
  .extract({ left: ox, top: oy, width: vw, height: vh })
  .resize(DESIGN_W, DESIGN_H)
  .png()
  .toBuffer();

writeFileSync(outPath, out);
console.log(`Rebaked ${outPath} from ${stageW}×${stageH} stage → ${DESIGN_W}×${DESIGN_H} (crop ${ox},${oy} ${vw}×${vh})`);
