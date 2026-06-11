#!/usr/bin/env node
/** Finish VPS deploy: Playwright + systemd (after pnpm build succeeded). */
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(join(dirname(fileURLToPath(import.meta.url)), "package.json"));
const { Client } = require("ssh2");

const HOST = process.env.VPS_HOST ?? "YOUR_VPS_IP";
const KEY = join(process.env.USERPROFILE ?? "", ".ssh", "id_ed25519_omnichat");
const REPO = join(dirname(fileURLToPath(import.meta.url)), "..");

function exec(conn, cmd, label) {
  return new Promise((resolve, reject) => {
    console.log(`\n>>> ${label}\n$ ${cmd}`);
    conn.exec(cmd, (err, stream) => {
      if (err) return reject(err);
      stream.on("data", (d) => process.stdout.write(d));
      stream.stderr.on("data", (d) => process.stderr.write(d));
      stream.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`${label} exit ${code}`))));
    });
  });
}

function uploadText(conn, content, remotePath) {
  return new Promise((resolve, reject) => {
    conn.sftp((err, sftp) => {
      if (err) return reject(err);
      const ws = sftp.createWriteStream(remotePath);
      ws.on("close", resolve);
      ws.on("error", reject);
      ws.end(content);
    });
  });
}

const conn = new Client();
conn
  .on("ready", async () => {
    try {
      await uploadText(
        conn,
        readFileSync(join(REPO, "deploy/vps/build-api.sh"), "utf8").replace(/\r\n/g, "\n"),
        "/opt/om-nichat/deploy/vps/build-api.sh",
      );
      await exec(
        conn,
        "cd /opt/om-nichat/apps/api && PLAYWRIGHT_HOST_PLATFORM_OVERRIDE=ubuntu22.04-x64 pnpm exec playwright install chromium",
        "Playwright browser binary (22.04 override)",
      );
      await exec(
        conn,
        "apt-get install -y libnss3 libnspr4 libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 libxkbcommon0 libxcomposite1 libxdamage1 libxfixes3 libxrandr2 libgbm1 libasound2t64 libpango-1.0-0 libcairo2 libatspi2.0-0 libxshmfence1 || apt-get install -y libnss3 libnspr4 libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 libxkbcommon0 libxcomposite1 libxdamage1 libxfixes3 libxrandr2 libgbm1 libasound2 libpango-1.0-0 libcairo2 libatspi2.0-0 libxshmfence1",
        "Playwright system libs",
      );
      await exec(conn, "cd /opt/om-nichat && bash deploy/vps/install-services.sh /opt/om-nichat", "Install service");
      await exec(conn, "ufw allow 8787/tcp || true", "Open port 8787");
      await exec(conn, "sleep 5 && curl -s http://127.0.0.1:8787/health", "Health");
      await exec(conn, "systemctl is-active omnichat-api && journalctl -u omnichat-api -n 30 --no-pager", "Status");
      console.log("\nDone: http://" + HOST + ":8787/health");
    } catch (e) {
      console.error(e);
      process.exit(1);
    } finally {
      conn.end();
    }
  })
  .connect({ host: HOST, username: "root", privateKey: readFileSync(KEY), readyTimeout: 60000 });
