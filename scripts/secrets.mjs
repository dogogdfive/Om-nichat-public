#!/usr/bin/env node
/**
 * Encrypt/decrypt local env files for git backup.
 * Plaintext stays gitignored; only secrets/*.enc is committed.
 *
 * Usage:
 *   node scripts/secrets.mjs init          # create .secrets-key (once)
 *   node scripts/secrets.mjs encrypt       # .env -> secrets/*.enc
 *   node scripts/secrets.mjs decrypt       # secrets/*.enc -> .env
 *
 * Key file: .secrets-key (gitignored). Back this up outside the repo.
 * Override: SECRETS_KEY=<hex> node scripts/secrets.mjs ...
 */

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const KEY_FILE = path.join(ROOT, ".secrets-key");
const OUT_DIR = path.join(ROOT, "secrets");
const MANIFEST = path.join(OUT_DIR, "manifest.json");

/** @type {{ target: string; enc: string }[]} */
const FILES = [
  { target: ".env", enc: "env.enc" },
  { target: "apps/web/.env.local", enc: "web-env-local.enc" },
  { target: "scripts/vercel-production-env.txt", enc: "vercel-production-env.enc" },
];

function readKey() {
  const hex = process.env.SECRETS_KEY?.trim() || fs.readFileSync(KEY_FILE, "utf8").trim();
  if (!/^[0-9a-f]{64}$/i.test(hex)) {
    throw new Error("Invalid key: need 32-byte hex in .secrets-key or SECRETS_KEY");
  }
  return Buffer.from(hex, "hex");
}

function initKey() {
  if (fs.existsSync(KEY_FILE)) {
    console.error(".secrets-key already exists — delete it first to regenerate.");
    process.exit(1);
  }
  const hex = crypto.randomBytes(32).toString("hex");
  fs.writeFileSync(KEY_FILE, hex + "\n", { mode: 0o600 });
  console.log("Created .secrets-key — back this file up outside the repo (password manager, etc.).");
}

function encryptBuffer(key, plaintext) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return JSON.stringify({
    v: 1,
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
    data: enc.toString("base64"),
  });
}

function decryptBuffer(key, jsonText) {
  const { v, iv, tag, data } = JSON.parse(jsonText);
  if (v !== 1) throw new Error("Unsupported secrets format version");
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64"));
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(data, "base64")), decipher.final()]);
}

function encryptAll() {
  const key = readKey();
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const manifest = [];

  for (const { target, enc } of FILES) {
    const abs = path.join(ROOT, target);
    if (!fs.existsSync(abs)) {
      console.log(`skip (missing): ${target}`);
      continue;
    }
    const plain = fs.readFileSync(abs);
    const out = path.join(OUT_DIR, enc);
    fs.writeFileSync(out, encryptBuffer(key, plain));
    manifest.push({ target, enc });
    console.log(`encrypted: ${target} -> secrets/${enc}`);
  }

  fs.writeFileSync(MANIFEST, JSON.stringify({ version: 1, files: manifest }, null, 2) + "\n");
  console.log("Done. Commit secrets/*.enc — safe to open-source without .secrets-key.");
}

function decryptAll() {
  const key = readKey();
  if (!fs.existsSync(MANIFEST)) {
    throw new Error("secrets/manifest.json not found — run encrypt first");
  }
  const { files } = JSON.parse(fs.readFileSync(MANIFEST, "utf8"));

  for (const { target, enc } of files) {
    const encPath = path.join(OUT_DIR, enc);
    if (!fs.existsSync(encPath)) {
      console.log(`skip (missing): secrets/${enc}`);
      continue;
    }
    const plain = decryptBuffer(key, fs.readFileSync(encPath, "utf8"));
    const abs = path.join(ROOT, target);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, plain);
    console.log(`decrypted: secrets/${enc} -> ${target}`);
  }
  console.log("Done.");
}

const cmd = process.argv[2];
try {
  if (cmd === "init") initKey();
  else if (cmd === "encrypt") encryptAll();
  else if (cmd === "decrypt") decryptAll();
  else {
    console.error("Usage: node scripts/secrets.mjs <init|encrypt|decrypt>");
    process.exit(1);
  }
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
}
