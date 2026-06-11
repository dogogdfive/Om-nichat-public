#!/usr/bin/env node
/** Set Twitch OAuth credentials on VPS from local .env, then restart API. */
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(join(here, "package.json"));
const { Client } = require("ssh2");

const HOST = process.env.VPS_HOST ?? "167.233.69.105";
const KEY = join(process.env.USERPROFILE ?? "", ".ssh", "id_ed25519_omnichat");

const localEnv = readFileSync(join(here, "..", ".env"), "utf8");
const read = (k) => {
  const m = localEnv.match(new RegExp("^" + k + "=(.*)$", "m"));
  return m ? m[1].trim() : "";
};

const updates = {
  TWITCH_CLIENT_ID: read("TWITCH_CLIENT_ID"),
  TWITCH_CLIENT_SECRET: read("TWITCH_CLIENT_SECRET"),
  TWITCH_REDIRECT_URI: "https://167-233-69-105.sslip.io/auth/twitch/callback",
};

if (!updates.TWITCH_CLIENT_ID || !updates.TWITCH_CLIENT_SECRET) {
  console.error("Missing Twitch credentials in local .env");
  process.exit(1);
}

const py = `import json, sys, pathlib
path = pathlib.Path('/opt/om-nichat/.env')
updates = json.loads(sys.argv[1])
lines = path.read_text().splitlines()
out, seen = [], set()
for line in lines:
    key = line.split('=', 1)[0] if '=' in line else None
    if key in updates:
        out.append(f"{key}={updates[key]}")
        seen.add(key)
    else:
        out.append(line)
for k, v in updates.items():
    if k not in seen:
        out.append(f"{k}={v}")
path.write_text('\\n'.join(out) + '\\n')
print('env updated:', sorted(updates.keys()))
`;

const updatesJson = JSON.stringify(updates).replace(/'/g, "'\\''");
const remoteCmd =
  `cat > /tmp/patch-twitch-oauth.py <<'PYEOF'\n${py}\nPYEOF\n` +
  `python3 /tmp/patch-twitch-oauth.py '${updatesJson}' && rm -f /tmp/patch-twitch-oauth.py && ` +
  `systemctl restart omnichat-api && sleep 6 && curl -s http://127.0.0.1:8787/health`;

const conn = new Client();
conn
  .on("ready", () => {
    conn.exec(remoteCmd, (err, stream) => {
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
