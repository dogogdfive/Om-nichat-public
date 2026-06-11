#!/usr/bin/env node
/**
 * One-shot remote VPS bootstrap via SSH password.
 * Usage: node scripts/vps-remote-bootstrap.mjs
 */
import { Client } from "ssh2";
import { createReadStream, readFileSync, writeFileSync, unlinkSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";

const HOST = process.env.VPS_HOST ?? "167.233.69.105";
const USER = process.env.VPS_USER ?? "root";
let PASS = process.env.VPS_PASSWORD;
const NEW_PASS = process.env.VPS_NEW_PASSWORD ?? randomBytes(24).toString("base64url");
const REPO = process.cwd();
const ARCHIVE = join(tmpdir(), "omnichat-deploy.tgz");

if (!PASS) {
  console.error("Set VPS_PASSWORD");
  process.exit(1);
}

function exec(conn, cmd, label) {
  return new Promise((resolve, reject) => {
    console.log(`\n>>> ${label}\n$ ${cmd.slice(0, 200)}${cmd.length > 200 ? "..." : ""}`);
    conn.exec(cmd, (err, stream) => {
      if (err) return reject(err);
      let out = "";
      let errOut = "";
      stream.on("data", (d) => {
        const s = d.toString();
        out += s;
        process.stdout.write(s);
      });
      stream.stderr.on("data", (d) => {
        const s = d.toString();
        errOut += s;
        process.stderr.write(s);
      });
      stream.on("close", (code) => {
        if (code !== 0) {
          reject(new Error(`${label} failed (exit ${code}): ${errOut || out}`));
          return;
        }
        resolve({ out, errOut });
      });
    });
  });
}

function connect(password) {
  const conn = new Client();
  return new Promise((resolve, reject) => {
    conn
      .on("ready", () => resolve(conn))
      .on("error", reject)
      .connect({ host: HOST, port: 22, username: USER, password, readyTimeout: 60000 });
  });
}

/** Hetzner forces root password change on first login; exec() has no TTY. Use shell+PTY. */
function rotateExpiredPassword(conn, oldPass, newPass) {
  return new Promise((resolve, reject) => {
    conn.shell({ term: "xterm-256color", cols: 120, rows: 40 }, (err, stream) => {
      if (err) return reject(err);
      let buf = "";
      let done = false;
      const finish = (ok, message) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        try {
          stream.end();
        } catch {
          /* ignore */
        }
        ok ? resolve() : reject(new Error(message ?? "password rotation failed"));
      };
      const timer = setTimeout(() => finish(false, "password rotation timeout"), 45000);

      stream.on("data", (chunk) => {
        const s = chunk.toString();
        buf += s;
        process.stdout.write(s);
        const lower = buf.toLowerCase();
        if (lower.includes("omni_chpasswd_done")) {
          PASS = newPass;
          finish(true);
          return;
        }
        if (lower.includes("current password:") || lower.includes("current unix password")) {
          stream.write(`${oldPass}\n`);
          buf = "";
        } else if (lower.includes("retype new password:")) {
          stream.write(`${newPass}\n`);
          buf = "";
        } else if (lower.includes("new password:")) {
          stream.write(`${newPass}\n`);
          buf = "";
        } else if (
          lower.includes("password updated successfully") ||
          lower.includes("passwd: password updated")
        ) {
          PASS = newPass;
          finish(true);
        }
      });
      stream.on("close", (code) => {
        if (!done) {
          if (code === 0 || buf.includes("OMNI_CHPASSWD_DONE")) {
            PASS = newPass;
            finish(true);
          } else {
            finish(false, `shell closed (code ${code})`);
          }
        }
      });
      stream.stderr?.on("data", (d) => process.stderr.write(d));

      setTimeout(() => {
        stream.write(`echo 'root:${newPass}' | chpasswd && echo OMNI_CHPASSWD_DONE\n`);
      }, 800);
    });
  });
}

function upload(conn, localPath, remotePath) {
  return new Promise((resolve, reject) => {
    conn.sftp((err, sftp) => {
      if (err) return reject(err);
      const read = createReadStream(localPath);
      const write = sftp.createWriteStream(remotePath);
      read.pipe(write);
      write.on("close", () => resolve());
      write.on("error", reject);
      read.on("error", reject);
    });
  });
}

function buildEnv() {
  const local = readFileSync(join(REPO, ".env"), "utf8");
  const get = (key) => {
    const m = local.match(new RegExp(`^${key}=(.*)$`, "m"));
    return m?.[1]?.trim() ?? "";
  };

  const apiUrl = `http://${HOST}:8787`;
  const lines = [
    "PORT=8787",
    "NODE_ENV=production",
    `API_PUBLIC_URL=${apiUrl}`,
    `WEB_APP_URL=${get("WEB_APP_URL") || "http://localhost:3000"}`,
    "USE_LOCAL_DB=1",
    "",
    `SESSION_SECRET=${get("SESSION_SECRET")}`,
    `TOKEN_ENCRYPTION_KEY=${get("TOKEN_ENCRYPTION_KEY")}`,
    `JWT_SECRET=${get("JWT_SECRET")}`,
    "",
    `SUPER_ADMIN_EMAILS=${get("SUPER_ADMIN_EMAILS") || "you@example.com"}`,
    "",
    "X_SERVER_SCRAPE_ENABLED=1",
    "X_SCRAPE_HEADLESS=0",
    `X_AUTH_TOKEN=${get("X_AUTH_TOKEN")}`,
    `X_CT0=${get("X_CT0")}`,
    "X_SCRAPE_STALL_MS=180000",
    "X_SCRAPE_RECYCLE_MS=1800000",
    "",
    "RUMBLE_SERVER_INGEST_ENABLED=1",
    "RUMBLE_OFFLINE_RETRY_MS=45000",
    "RUMBLE_SCRAPE_HEADLESS=1",
    "",
    `TWITCH_CLIENT_ID=${get("TWITCH_CLIENT_ID")}`,
    `TWITCH_CLIENT_SECRET=${get("TWITCH_CLIENT_SECRET")}`,
    `TWITCH_REDIRECT_URI=${apiUrl}/auth/twitch/callback`,
    "",
    `KICK_CLIENT_ID=${get("KICK_CLIENT_ID")}`,
    `KICK_CLIENT_SECRET=${get("KICK_CLIENT_SECRET")}`,
    `KICK_REDIRECT_URI=${apiUrl}/auth/kick/callback`,
    "",
    `X_CLIENT_ID=${get("X_CLIENT_ID")}`,
    `X_CLIENT_SECRET=${get("X_CLIENT_SECRET")}`,
    `X_REDIRECT_URI=${apiUrl}/auth/x/callback`,
    "",
    `GOOGLE_CLIENT_ID=${get("GOOGLE_CLIENT_ID")}`,
    `GOOGLE_CLIENT_SECRET=${get("GOOGLE_CLIENT_SECRET")}`,
    `GOOGLE_REDIRECT_URI=${apiUrl}/auth/google/callback`,
    "",
    `YOUTUBE_REDIRECT_URI=${apiUrl}/auth/youtube/callback`,
  ];
  return lines.join("\n") + "\n";
}

async function main() {
  const pubKey = readFileSync(
    existsSync(join(process.env.USERPROFILE ?? "", ".ssh", "id_ed25519_omnichat.pub"))
      ? join(process.env.USERPROFILE ?? "", ".ssh", "id_ed25519_omnichat.pub")
      : join(process.env.USERPROFILE ?? "", ".ssh", "id_ed25519.pub"),
    "utf8",
  ).trim();

  console.log("Creating deployment archive...");
  execSync(
    `tar -czf "${ARCHIVE}" --exclude=node_modules --exclude=.next --exclude=.git --exclude=data --exclude=.env --exclude=apps/web/.next --exclude=apps/web/node_modules --exclude=apps/api/node_modules -C "${REPO}" .`,
    { stdio: "inherit", shell: true },
  );

  const envContent = buildEnv();
  const envPath = join(tmpdir(), "omnichat-vps.env");
  writeFileSync(envPath, envContent, "utf8");

  let conn = await connect(PASS);
  console.log("Connected to VPS");

  try {
    console.log("\n>>> Rotate expired root password (Hetzner first-login)");
    await rotateExpiredPassword(conn, PASS, NEW_PASS);
    conn.end();
    PASS = NEW_PASS;
    console.log("Root password rotated; reconnecting…");
    conn = await connect(PASS);
    console.log("Reconnected with new password");

    await exec(
      conn,
      `mkdir -p ~/.ssh && chmod 700 ~/.ssh && grep -qxF '${pubKey}' ~/.ssh/authorized_keys 2>/dev/null || echo '${pubKey}' >> ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys`,
      "Install SSH public key",
    );

    await exec(conn, "mkdir -p /opt/om-nichat && rm -rf /opt/om-nichat/* /opt/om-nichat/.[!.]* 2>/dev/null || true", "Prepare /opt/om-nichat");

    console.log("\n>>> Upload archive");
    await upload(conn, ARCHIVE, "/tmp/omnichat-deploy.tgz");
    await exec(conn, "tar -xzf /tmp/omnichat-deploy.tgz -C /opt/om-nichat && rm /tmp/omnichat-deploy.tgz", "Extract archive");
    await exec(
      conn,
      "find /opt/om-nichat/deploy/vps -name '*.sh' -exec sed -i 's/\\r$//' {} +",
      "Fix shell script line endings",
    );

    console.log("\n>>> Upload .env");
    await upload(conn, envPath, "/opt/om-nichat/.env");

    await exec(conn, "cd /opt/om-nichat && bash deploy/vps/install-deps.sh", "Install system deps");
    await exec(conn, "cd /opt/om-nichat && bash deploy/vps/build-api.sh", "Build API + Playwright");
    await exec(conn, "cd /opt/om-nichat && bash deploy/vps/install-services.sh /opt/om-nichat", "Install systemd service");
    await exec(conn, "ufw allow 8787/tcp || true", "Open API port 8787");

    await exec(conn, "sleep 3 && curl -s http://127.0.0.1:8787/health", "Health check");
    await exec(conn, "systemctl is-active omnichat-api && journalctl -u omnichat-api -n 20 --no-pager", "Service status");
  } finally {
    conn.end();
    try {
      unlinkSync(ARCHIVE);
    } catch {
      /* ignore */
    }
    try {
      unlinkSync(envPath);
    } catch {
      /* ignore */
    }
  }

  const credPath = join(REPO, "deploy", "vps", ".credentials.local");
  writeFileSync(
    credPath,
    `# Generated ${new Date().toISOString()} — do not commit\nHOST=${HOST}\nUSER=${USER}\nPASSWORD=${NEW_PASS}\nAPI=http://${HOST}:8787\n`,
    "utf8",
  );
  console.log("\nDone. API: http://" + HOST + ":8787/health");
  console.log("New root password saved to deploy/vps/.credentials.local (gitignored)");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
