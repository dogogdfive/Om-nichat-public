#!/usr/bin/env node
/** Set YOUTUBE_API_KEY on VPS, then restart API. Usage: YOUTUBE_API_KEY=AIza... node scripts/vps-set-youtube-api-key.mjs */
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(join(here, "package.json"));
const { Client } = require("ssh2");

const HOST = process.env.VPS_HOST ?? "167.233.69.105";
const KEY = join(process.env.USERPROFILE ?? "", ".ssh", "id_ed25519_omnichat");
const apiKey = process.env.YOUTUBE_API_KEY?.trim();

if (!apiKey) {
  console.error("Set YOUTUBE_API_KEY env var first.");
  process.exit(1);
}

const updates = { YOUTUBE_API_KEY: apiKey };

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
  `cat > /tmp/patch-youtube-api-key.py <<'PYEOF'\n${py}\nPYEOF\n` +
  `python3 /tmp/patch-youtube-api-key.py '${updatesJson}' && rm -f /tmp/patch-youtube-api-key.py && ` +
  `systemctl restart omnichat-api && sleep 6 && curl -sk https://api.omnichat.wtf/health | python3 -c "import json,sys; h=json.load(sys.stdin); print('youtubeApiKey:', h.get('oauth',{}).get('youtubeApiKey')); print('polls:', h.get('youtubeIngest',{}).get('polls')); print('pending:', h.get('youtubeIngest',{}).get('pending'))"`;

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
