#!/usr/bin/env node
/** Same yellow star as the browser tab favicon → Windows .ico + PNG app icons. */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import toIco from "to-ico";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..", "..");
const src = join(root, "apps", "web", "public", "om-login-star.png");
const outDir = join(here, "..", "resources");
const outPng = join(outDir, "icon.png");
const outIco = join(outDir, "icon.ico");

mkdirSync(outDir, { recursive: true });

const sizes = [16, 24, 32, 48, 64, 128, 256];
const pngBuffers = await Promise.all(
  sizes.map((size) =>
    sharp(src)
      .resize(size, size, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toBuffer(),
  ),
);

writeFileSync(outIco, await toIco(pngBuffers));
await sharp(src)
  .resize(512, 512, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
  .png()
  .toFile(outPng);

console.log("Icons written:", outIco, outPng);
