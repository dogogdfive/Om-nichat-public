#!/usr/bin/env node
/** Read-only: show which X-related env keys exist on the VPS (values masked). */
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(join(dirname(fileURLToPath(import.meta.url)), "package.json"));
const { Client } = require("ssh2");

const HOST = process.env.VPS_HOST ?? "167.233.69.105";
const KEY = join(process.env.USERPROFILE ?? "", ".ssh", "id_ed25519_omnichat");

const cmd =
  "grep -E '^X_' /opt/om-nichat/.env | sed -E 's/(SECRET|TOKEN|CT0)=(.{0,4}).*/\\1=\\2****/' ; echo '--- health ---' ; curl -s http://127.0.0.1:8787/health | python3 -c 'import sys,json; d=json.load(sys.stdin); print(\"x oauth:\", d[\"oauth\"][\"x\"]); print(\"x redirect:\", d[\"oauthRedirects\"][\"x\"]); print(\"xServerScrape:\", d.get(\"xServerScrape\"))'";

const conn = new Client();
conn
  .on("ready", () => {
    conn.exec(cmd, (err, stream) => {
      if (err) {
        console.error(err);
        process.exit(1);
      }
      stream.on("data", (d) => process.stdout.write(d));
      stream.stderr.on("data", (d) => process.stderr.write(d));
      stream.on("close", (code) => {
        conn.end();
        process.exit(code ?? 0);
      });
    });
  })
  .on("error", (e) => {
    console.error("SSH error:", e.message);
    process.exit(1);
  })
  .connect({ host: HOST, username: "root", privateKey: readFileSync(KEY), readyTimeout: 30000 });
