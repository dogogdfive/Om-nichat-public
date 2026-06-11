#!/usr/bin/env node
/** Quick API deploy to VPS (OAuth fixes, billing, etc.). */
import { createRequire } from "node:module";
import { readFileSync, unlinkSync } from "node:fs";
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
const ARCHIVE = join(tmpdir(), "omnichat-api-deploy.tgz");

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

console.log("Creating archive...");
execSync(
  `tar -czf "${ARCHIVE}" --exclude=node_modules --exclude=.next --exclude=.git --exclude=data --exclude=.env --exclude=apps/web/.next -C "${REPO}" .`,
  { stdio: "inherit", shell: true },
);

const conn = new Client();
conn
  .on("ready", async () => {
    try {
      await upload(conn, ARCHIVE, "/tmp/omnichat-api-deploy.tgz");
      await exec(
        conn,
        "tar -xzf /tmp/omnichat-api-deploy.tgz -C /opt/om-nichat && rm /tmp/omnichat-api-deploy.tgz && find /opt/om-nichat -name '*.sh' -exec sed -i 's/\\r$//' {} +",
        "Extract",
      );
      await exec(conn, "cd /opt/om-nichat && bash deploy/vps/build-api.sh", "Build");
      await exec(conn, "systemctl restart omnichat-api && sleep 6", "Restart");
      await exec(conn, "curl -sk https://api.omnichat.wtf/api/auth/oauth-setup", "OAuth setup");
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
  .connect({ host: HOST, username: "root", privateKey: readFileSync(KEY), readyTimeout: 120000 });
