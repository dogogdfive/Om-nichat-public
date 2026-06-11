import { execFile } from "node:child_process";
import { promisify } from "node:util";
import "../src/load-env.js";
import { ensureFreshAccessToken } from "../src/auth/token-refresh.js";
import { initStorage } from "../src/db/storage.js";

const execFileAsync = promisify(execFile);
process.env.USE_LOCAL_DB = "1";

await initStorage();
const wsId = "99b2bde8-827e-414e-a853-05abbea2ead0";
const token = await ensureFreshAccessToken(wsId, "kick");

async function curlJson(url, extraHeaders = []) {
  const args = ["-s", "-H", "Accept: application/json", ...extraHeaders, url];
  const { stdout } = await execFileAsync("curl.exe", args, { maxBuffer: 5 * 1024 * 1024 });
  return JSON.parse(stdout);
}

if (token) {
  const res = await fetch("https://api.kick.com/public/v1/channels", {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
  const j = await res.json();
  console.log("official channel keys", Object.keys(j.data?.[0] ?? {}));
  console.log(JSON.stringify(j.data?.[0], null, 2).slice(0, 2000));
}

const v2 = await curlJson("https://kick.com/api/v2/channels/sergioisbananas", [
  "-H",
  "User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
]);
console.log("v2 chatroom", v2.chatroom?.id);
