#!/usr/bin/env node
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(join(dirname(fileURLToPath(import.meta.url)), "package.json"));
const { Client } = require("ssh2");

const AUTH = process.env.X_AUTH_TOKEN;
const CT0 = process.env.X_CT0;
const HOST = process.env.VPS_HOST ?? "167.233.69.105";
const KEY = join(process.env.USERPROFILE ?? "", ".ssh", "id_ed25519_omnichat");

if (!AUTH || !CT0) {
  console.error("Set X_AUTH_TOKEN and X_CT0");
  process.exit(1);
}

const conn = new Client();
conn
  .on("ready", () => {
    conn.sftp((err, sftp) => {
      if (err) {
        console.error(err);
        process.exit(1);
      }
      const script = `import pathlib
path = pathlib.Path("/opt/om-nichat/.env")
lines = path.read_text().splitlines()
updates = {
    "X_SERVER_SCRAPE_ENABLED": "1",
    "X_SCRAPE_HEADLESS": "0",
    "X_AUTH_TOKEN": ${JSON.stringify(AUTH)},
    "X_CT0": ${JSON.stringify(CT0)},
}
out = []
seen = set()
for line in lines:
    key = line.split("=", 1)[0] if "=" in line else None
    if key in updates:
        out.append(f"{key}={updates[key]}")
        seen.add(key)
    else:
        out.append(line)
for key, val in updates.items():
    if key not in seen:
        out.append(f"{key}={val}")
path.write_text("\\n".join(out) + "\\n")
print("env updated")
`;
      const ws = sftp.createWriteStream("/tmp/patch-x-env.py");
      ws.on("close", () => {
        conn.exec(
          "python3 /tmp/patch-x-env.py && rm /tmp/patch-x-env.py && systemctl restart omnichat-api && sleep 8 && curl -s http://127.0.0.1:8787/health && echo && journalctl -u omnichat-api -n 15 --no-pager",
          (e2, stream) => {
            if (e2) {
              console.error(e2);
              process.exit(1);
            }
            stream.on("data", (d) => process.stdout.write(d));
            stream.stderr.on("data", (d) => process.stderr.write(d));
            stream.on("close", (code) => {
              conn.end();
              process.exit(code ?? 0);
            });
          },
        );
      });
      ws.on("error", (e) => {
        console.error(e);
        process.exit(1);
      });
      ws.end(script);
    });
  })
  .connect({ host: HOST, username: "root", privateKey: readFileSync(KEY), readyTimeout: 30000 });
