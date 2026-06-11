#!/usr/bin/env node
/**
 * Usage: node apps/api/scripts/test-rumble-sse.mjs [streamIdB10] [seconds]
 * Connects to Rumble guest SSE chat and logs message events.
 */
const streamIdB10 = Number(process.argv[2] ?? 0);
const durationMs = Number(process.argv[3] ?? 30) * 1000;

if (!streamIdB10) {
  console.error("Usage: node test-rumble-sse.mjs <streamIdB10> [seconds]");
  console.error("Tip: node apps/api/scripts/test-rumble-resolve.mjs <slug> to find a live stream id");
  process.exit(1);
}

const url = `https://web7.rumble.com/chat/api/chat/${streamIdB10}/stream`;
console.log("Connecting to", url);

const res = await fetch(url, {
  headers: {
    Accept: "text/event-stream",
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  },
});

if (!res.ok || !res.body) {
  console.error("SSE failed:", res.status, await res.text().catch(() => ""));
  process.exit(1);
}

const reader = res.body.getReader();
const decoder = new TextDecoder();
let buffer = "";
let messageCount = 0;

const timer = setTimeout(() => {
  console.log(`\nDone. Parsed ${messageCount} chat message(s).`);
  reader.cancel().catch(() => undefined);
  process.exit(0);
}, durationMs);

while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  buffer += decoder.decode(value, { stream: true });
  const parts = buffer.split("\n\n");
  buffer = parts.pop() ?? "";
  for (const part of parts) {
    const dataLine = part.split("\n").find((l) => l.startsWith("data:"));
    if (!dataLine) continue;
    const raw = dataLine.slice(5).trim();
    if (!raw) continue;
    try {
      const json = JSON.parse(raw);
      if (json.type === "init") {
        const msgs = json.data?.messages ?? [];
        console.log("INIT", msgs.length, "history messages");
      }
      if (json.type === "messages") {
        for (const m of json.data?.messages ?? []) {
          messageCount += 1;
          const user = (json.data?.users ?? []).find((u) => String(u.id) === String(m.user_id));
          console.log("CHAT", user?.username ?? m.user_id, "|", m.text);
        }
      }
    } catch {
      console.log("RAW", raw.slice(0, 200));
    }
  }
}

clearTimeout(timer);
console.log(`Stream ended. Parsed ${messageCount} chat message(s).`);
