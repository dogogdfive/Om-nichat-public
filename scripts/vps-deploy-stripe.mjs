#!/usr/bin/env node
/** Deploy latest API (incl. Stripe billing) to VPS and sync Stripe env vars. */
import { createRequire } from "node:module";
import { readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { execSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(join(here, "package.json"));
const { Client } = require("ssh2");

const REPO = join(here, "..");
const HOST = process.env.VPS_HOST ?? "167.233.69.105";
const KEY = join(process.env.USERPROFILE ?? "", ".ssh", "id_ed25519_omnichat");
const ARCHIVE = join(tmpdir(), "omnichat-billing-deploy.tgz");

const localEnv = readFileSync(join(REPO, ".env"), "utf8");
const read = (k) => {
  const m = localEnv.match(new RegExp("^" + k + "=(.*)$", "m"));
  return m ? m[1].trim() : "";
};

const stripeUpdates = {
  WEB_APP_URL: "https://omnichat.wtf",
  API_PUBLIC_URL: "https://api.omnichat.wtf",
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

function exec(conn, cmd, label) {
  return new Promise((resolve, reject) => {
    console.log(`\n>>> ${label}`);
    conn.exec(cmd, (err, stream) => {
      if (err) return reject(err);
      stream.on("data", (d) => process.stdout.write(d));
      stream.stderr.on("data", (d) => process.stderr.write(d));
      stream.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`${label} exit ${code}`))));
    });
  });
}

function upload(conn, localPath, remotePath) {
  return new Promise((resolve, reject) => {
    conn.sftp((err, sftp) => {
      if (err) return reject(err);
      sftp.fastPut(localPath, remotePath, (e) => (e ? reject(e) : resolve()));
    });
  });
}

const updatesJson = JSON.stringify(stripeUpdates).replace(/'/g, "'\\''");

console.log("Creating deployment archive...");
execSync(
  `tar -czf "${ARCHIVE}" --exclude=node_modules --exclude=.next --exclude=.git --exclude=data --exclude=.env --exclude=apps/web/.next -C "${REPO}" .`,
  { stdio: "inherit", shell: true },
);

const conn = new Client();
conn
  .on("ready", async () => {
    try {
      await upload(conn, ARCHIVE, "/tmp/omnichat-billing-deploy.tgz");
      await exec(
        conn,
        "tar -xzf /tmp/omnichat-billing-deploy.tgz -C /opt/om-nichat && rm /tmp/omnichat-billing-deploy.tgz && find /opt/om-nichat -name '*.sh' -exec sed -i 's/\\r$//' {} +",
        "Extract archive",
      );
      await exec(
        conn,
        `cat > /tmp/patch-stripe.py <<'PYEOF'\n${py}\nPYEOF\n` +
          `python3 /tmp/patch-stripe.py '${updatesJson}' && rm -f /tmp/patch-stripe.py`,
        "Patch Stripe env",
      );
      await exec(conn, "cd /opt/om-nichat && bash deploy/vps/build-api.sh", "Build API");
      await exec(conn, "systemctl restart omnichat-api && sleep 8", "Restart API");
      await exec(
        conn,
        "curl -sk https://api.omnichat.wtf/health | head -c 800",
        "Health (api.omnichat.wtf)",
      );
      console.log("\nDone.");
    } catch (e) {
      console.error(e);
      process.exit(1);
    } finally {
      conn.end();
      try {
        unlinkSync(ARCHIVE);
      } catch {
        /* ignore */
      }
    }
  })
  .on("error", (e) => {
    console.error("SSH error:", e.message);
    process.exit(1);
  })
  .connect({ host: HOST, username: "root", privateKey: readFileSync(KEY), readyTimeout: 120000 });
