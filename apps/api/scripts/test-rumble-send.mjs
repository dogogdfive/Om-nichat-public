#!/usr/bin/env node
/**
 * Usage: node apps/api/scripts/test-rumble-send.mjs <streamIdB10> <u_s_token> <message>
 * Posts a test message to a live Rumble chat (requires your session cookie).
 */
import { randomBytes } from "node:crypto";

const streamIdB10 = Number(process.argv[2] ?? 0);
const sessionToken = (process.argv[3] ?? "").trim();
const text = process.argv.slice(4).join(" ").trim() || "omnichat test";

if (!streamIdB10 || !sessionToken) {
  console.error("Usage: node test-rumble-send.mjs <streamIdB10> <u_s_token> [message]");
  process.exit(1);
}

const requestId = randomBytes(32).toString("base64").replace(/=+$/, "").slice(0, 43);
const url = `https://web7.rumble.com/chat/api/chat/${streamIdB10}/message`;

const res = await fetch(url, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Cookie: `u_s=${sessionToken}`,
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  },
  body: JSON.stringify({
    data: {
      request_id: requestId,
      message: { text },
      rant: null,
      channel_id: null,
    },
  }),
});

const body = await res.text();
console.log("Status:", res.status);
console.log(body.slice(0, 500));
process.exit(res.ok ? 0 : 1);
