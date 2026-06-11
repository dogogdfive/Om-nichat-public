import tmi from "tmi.js";
import "../src/load-env.js";
import { ensureFreshAccessToken } from "../src/auth/token-refresh.js";
import { getPlatformTokens } from "../src/db/repos.js";
import { initStorage } from "../src/db/storage.js";

await initStorage();

const wsId = process.argv[2] ?? "99b2bde8-827e-414e-a853-05abbea2ead0";
const accessToken = await ensureFreshAccessToken(wsId, "twitch");
const tokens = await getPlatformTokens(wsId, "twitch");
if (!tokens?.platformUsername || !accessToken) {
  console.error("missing twitch tokens for", wsId);
  process.exit(1);
}

console.log("workspace", wsId);
console.log("login", tokens.platformUsername);

const client = new tmi.Client({
  options: { skipUpdatingEmotesets: true },
  identity: { username: tokens.platformUsername, password: `oauth:${accessToken}` },
  channels: [tokens.platformUsername],
});

let count = 0;
client.on("message", (_ch, tags, msg, self) => {
  if (self) return;
  count += 1;
  console.log("MSG", tags["display-name"], String(msg).slice(0, 80));
});
client.on("connected", () => console.log("connected to irc"));
client.on("notice", (ch, msg) => console.log("NOTICE", ch, msg));

await client.connect();
setTimeout(() => {
  console.log("total messages:", count);
  void client.disconnect();
  process.exit(0);
}, 20000);
