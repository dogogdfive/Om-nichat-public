import "../src/load-env.js";
import { ensureFreshAccessToken } from "../src/auth/token-refresh.js";
import { getPlatformTokens } from "../src/db/repos.js";
import { initStorage } from "../src/db/storage.js";
import { resolveKickChatroomId } from "../src/adapters/kick.js";

await initStorage();
const wsId = process.argv[2] ?? "99b2bde8-827e-414e-a853-05abbea2ead0";
const tokens = await getPlatformTokens(wsId, "kick");
const token = await ensureFreshAccessToken(wsId, "kick");
const slug = tokens?.platformUsername ?? "sergioisbananas";
console.log("slug", slug);

for (const url of [
  `https://api.kick.com/public/v1/channels/${slug}`,
  `https://api.kick.com/public/v1/users/${tokens?.platformUserId}`,
  `https://kick.com/api/v2/channels/${slug}`,
]) {
  const res = await fetch(url, {
    headers: {
      Accept: "application/json",
      Authorization: token ? `Bearer ${token}` : "",
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      Referer: "https://kick.com/",
    },
  });
  console.log(url, res.status, (await res.text()).slice(0, 200));
}

const id = await resolveKickChatroomId(slug);
console.log("resolveKickChatroomId", id);
