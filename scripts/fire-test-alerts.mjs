#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(join(here, "package.json"));
const { Client } = require("ssh2");

const HOST = process.env.VPS_HOST ?? "167.233.69.105";
const KEY = join(process.env.USERPROFILE ?? "", ".ssh", "id_ed25519_omnichat");
const workspaceId = process.argv[2] ?? "df18eb6b-17f3-4090-87d2-764046d4d5d8";
const cmd = `curl -s -X POST 'http://127.0.0.1:8787/internal/overlay/test-alerts?workspaceId=${workspaceId}'`;

const conn = new Client();
conn
  .on("ready", () => {
    conn.exec(cmd, (err, stream) => {
      if (err) throw err;
      stream.on("data", (d) => process.stdout.write(d));
      stream.stderr.on("data", (d) => process.stderr.write(d));
      stream.on("close", (code) => {
        conn.end();
        process.exit(code ?? 0);
      });
    });
  })
  .connect({ host: HOST, username: "root", privateKey: readFileSync(KEY), readyTimeout: 60000 });
