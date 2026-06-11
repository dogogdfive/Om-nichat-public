#!/usr/bin/env node
/** Enable X server scrape + auto re-login credentials on VPS. */
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(join(dirname(fileURLToPath(import.meta.url)), "package.json"));
const { Client } = require("ssh2");

const HOST = process.env.VPS_HOST ?? "167.233.69.105";
const KEY = join(process.env.USERPROFILE ?? "", ".ssh", "id_ed25519_omnichat");

const updates = {
  X_SERVER_SCRAPE_ENABLED: process.env.X_SERVER_SCRAPE_ENABLED ?? "1",
  X_SCRAPE_HEADLESS: process.env.X_SCRAPE_HEADLESS ?? "0",
  X_LOGIN_USERNAME: process.env.X_LOGIN_USERNAME ?? "",
  X_LOGIN_PASSWORD: process.env.X_LOGIN_PASSWORD ?? "",
  X_LOGIN_EMAIL: process.env.X_LOGIN_EMAIL ?? "",
};

if (!updates.X_LOGIN_USERNAME || !updates.X_LOGIN_PASSWORD) {
  console.error("Set X_LOGIN_USERNAME and X_LOGIN_PASSWORD");
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
updates = ${JSON.stringify(updates)}
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
print("env updated:", ", ".join(updates.keys()))
`;
      const ws = sftp.createWriteStream("/tmp/patch-x-scrape-env.py");
      ws.on("close", () => {
        conn.exec(
          "python3 /tmp/patch-x-scrape-env.py && rm /tmp/patch-x-scrape-env.py && systemctl restart omnichat-api",
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
  .on("error", (e) => {
    console.error(e);
    process.exit(1);
  })
  .connect({ host: HOST, username: "root", privateKey: readFileSync(KEY), readyTimeout: 30000 });
