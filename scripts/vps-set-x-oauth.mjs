#!/usr/bin/env node
/**
 * Set X OAuth login credentials on the VPS .env (X_CLIENT_ID/SECRET/REDIRECT_URI only),
 * then restart the API. Does NOT touch X scrape vars (X_SERVER_SCRAPE_ENABLED/AUTH_TOKEN/CT0).
 * Reads the values from the local repo .env.
 */
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
  X_CLIENT_ID: read("X_CLIENT_ID"),
  X_CLIENT_SECRET: read("X_CLIENT_SECRET"),
  X_REDIRECT_URI: "https://167-233-69-105.sslip.io/auth/x/callback",
};

if (!updates.X_CLIENT_ID || !updates.X_CLIENT_SECRET) {
  console.error("Local .env is missing X_CLIENT_ID or X_CLIENT_SECRET");
  process.exit(1);
}

// Build a Python patcher; pass updates as JSON via argv to avoid quoting issues.
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
  `cat > /tmp/patch-x-oauth.py <<'PYEOF'\n${py}\nPYEOF\n` +
  `python3 /tmp/patch-x-oauth.py '${updatesJson}' && rm -f /tmp/patch-x-oauth.py && ` +
  `systemctl restart omnichat-api && sleep 6 && curl -s http://127.0.0.1:8787/health`;

const conn = new Client();
conn
  .on("ready", () => {
    conn.exec(remoteCmd, (err, stream) => {
      if (err) {
        console.error(err);
        process.exit(1);
      }
      let out = "";
      stream.on("data", (d) => {
        out += d;
        process.stdout.write(d);
      });
      stream.stderr.on("data", (d) => process.stderr.write(d));
      stream.on("close", (code) => {
        conn.end();
        try {
          const j = JSON.parse(out.match(/\{[\s\S]*\}\s*$/)?.[0] ?? "{}");
          console.log("\n=== result ===");
          console.log("x oauth:", j.oauth?.x);
          console.log("x redirect:", j.oauthRedirects?.x);
          console.log("xServerScrape:", j.xServerScrape);
        } catch {
          /* ignore parse issues */
        }
        process.exit(code ?? 0);
      });
    });
  })
  .on("error", (e) => {
    console.error("SSH error:", e.message);
    process.exit(1);
  })
  .connect({ host: HOST, username: "root", privateKey: readFileSync(KEY), readyTimeout: 30000 });
