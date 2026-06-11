#!/usr/bin/env node
/** Point VPS API at api.omnichat.wtf + production OAuth/Stripe env. */
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
  WEB_APP_URL: "https://omnichat.wtf",
  API_PUBLIC_URL: "https://api.omnichat.wtf",
  TWITCH_REDIRECT_URI: "https://api.omnichat.wtf/auth/twitch/callback",
  KICK_REDIRECT_URI: "https://api.omnichat.wtf/auth/kick/callback",
  X_REDIRECT_URI: "https://api.omnichat.wtf/auth/x/callback",
  GOOGLE_REDIRECT_URI: "https://api.omnichat.wtf/auth/google/callback",
  YOUTUBE_REDIRECT_URI: "https://api.omnichat.wtf/auth/youtube/callback",
  STRIPE_SECRET_KEY: read("STRIPE_SECRET_KEY"),
  STRIPE_PRICE_ID: read("STRIPE_PRICE_ID"),
  STRIPE_WEBHOOK_SECRET: read("STRIPE_WEBHOOK_SECRET"),
};

const py = `import json, sys, pathlib
path = pathlib.Path('/opt/om-nichat/.env')
updates = json.loads(sys.argv[1])
lines = path.read_text().splitlines()
out, seen = [], set()
for line in lines:
    key = line.split('=', 1)[0] if '=' in line else None
    if key in updates and updates[key]:
        out.append(f"{key}={updates[key]}")
        seen.add(key)
    else:
        out.append(line)
for k, v in updates.items():
    if k not in seen and v:
        out.append(f"{k}={v}")
path.write_text('\\n'.join(out) + '\\n')
print('env updated:', sorted(k for k,v in updates.items() if v))
`;

const caddyfile = `api.omnichat.wtf {
	reverse_proxy localhost:8787
}
167-233-69-105.sslip.io {
	reverse_proxy localhost:8787
}
`;

const updatesJson = JSON.stringify(updates).replace(/'/g, "'\\''");
const remoteCmd =
  `cat > /etc/caddy/Caddyfile <<'CADDYEOF'\n${caddyfile}\nCADDYEOF\n` +
  `systemctl restart caddy 2>/dev/null || true\n` +
  `cat > /tmp/patch-omnichat-wtf.py <<'PYEOF'\n${py}\nPYEOF\n` +
  `python3 /tmp/patch-omnichat-wtf.py '${updatesJson}' && rm -f /tmp/patch-omnichat-wtf.py\n` +
  `systemctl restart omnichat-api && sleep 10 && curl -sk https://api.omnichat.wtf/health | head -c 600`;

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
  .connect({ host: HOST, username: "root", privateKey: readFileSync(KEY), readyTimeout: 120000 });
