#!/usr/bin/env node
/** Verify Stripe env keys exist on VPS (no secret values printed). */
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const require = createRequire(join(process.cwd(), "scripts/package.json"));
const { Client } = require("ssh2");

const KEY = join(process.env.USERPROFILE ?? "", ".ssh", "id_ed25519_omnichat");
const conn = new Client();
conn
  .on("ready", () => {
    conn.exec(
      `python3 - <<'PY'
import pathlib
keys = ["STRIPE_SECRET_KEY", "STRIPE_PRICE_ID", "STRIPE_WEBHOOK_SECRET", "WEB_APP_URL", "API_PUBLIC_URL"]
env = {}
for line in pathlib.Path("/opt/om-nichat/.env").read_text().splitlines():
    if "=" in line and not line.strip().startswith("#"):
        k, v = line.split("=", 1)
        env[k] = v
for k in keys:
    v = env.get(k, "")
    print(f"{k}: {'set (' + str(len(v)) + ' chars)' if v else 'MISSING'}")
PY`,
      (err, stream) => {
        stream.on("data", (d) => process.stdout.write(d));
        stream.on("close", () => conn.end());
      },
    );
  })
  .connect({
    host: "167.233.69.105",
    username: "root",
    privateKey: readFileSync(KEY),
  });
