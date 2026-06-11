#!/usr/bin/env node
/** Resume VPS deploy after archive is already uploaded. */
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(join(dirname(fileURLToPath(import.meta.url)), "package.json"));
const { Client } = require("ssh2");

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..");
const HOST = process.env.VPS_HOST ?? "YOUR_VPS_IP";
const KEY = join(process.env.USERPROFILE ?? "", ".ssh", "id_ed25519_omnichat");

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

const conn = new Client();
conn
  .on("ready", async () => {
    try {
      await exec(conn, "find /opt/om-nichat/deploy/vps -name '*.sh' -exec sed -i 's/\\r$//' {} +", "Fix CRLF");
      await uploadText(
        conn,
        readFileSync(join(REPO, "deploy/vps/install-deps.sh"), "utf8").replace(/\r\n/g, "\n"),
        "/opt/om-nichat/deploy/vps/install-deps.sh",
      );
      console.log("\n>>> Upload fixed install-deps.sh");
      await exec(conn, "cd /opt/om-nichat && bash deploy/vps/install-deps.sh", "Install deps");
      await exec(conn, "cd /opt/om-nichat && bash deploy/vps/build-api.sh", "Build API");
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
