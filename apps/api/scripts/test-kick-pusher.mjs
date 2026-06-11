import WebSocket from "ws";

// Usage: node test-kick-pusher.mjs [chatroomId] [seconds]
// Logs EVERY Pusher event name + payload so we can discover poll / pinned
// message events (App\Events\PollUpdateEvent, PinnedMessageCreatedEvent, ...).
const chatroomId = Number(process.argv[2] ?? 2771654);
const durationMs = Number(process.argv[3] ?? 60) * 1000;
const url =
  "wss://ws-us2.pusher.com/app/32cbd69e4b950bf97679?protocol=7&client=js&version=8.4.0&flash=false";

const ws = new WebSocket(url);
const counts = new Map();

function bump(event) {
  counts.set(event, (counts.get(event) ?? 0) + 1);
}

ws.on("open", () => console.log("ws open"));
ws.on("message", (raw) => {
  let msg;
  try {
    msg = JSON.parse(String(raw));
  } catch {
    console.log("RAW (unparseable)", String(raw).slice(0, 200));
    return;
  }

  const event = msg.event ?? "(no event)";
  bump(event);

  if (event === "pusher:connection_established") {
    console.log("connected, subscribing to", `chatrooms.${chatroomId}.v2`);
    ws.send(
      JSON.stringify({
        event: "pusher:subscribe",
        data: { auth: "", channel: `chatrooms.${chatroomId}.v2` },
      }),
    );
    return;
  }

  if (event === "pusher_internal:subscription_succeeded") {
    console.log("subscribed to", msg.channel);
    return;
  }

  const data = typeof msg.data === "string" ? safeParse(msg.data) : msg.data;

  // Compact line for chat, full dump for everything else (polls/pinned/etc).
  if (event === "App\\Events\\ChatMessageEvent") {
    console.log("CHAT", data?.sender?.username, "|", data?.content);
    return;
  }

  console.log("\n==== EVENT:", event, "====");
  console.log(JSON.stringify(data, null, 2));
});

function safeParse(s) {
  try {
    return JSON.parse(s);
  } catch {
    return s;
  }
}

ws.on("error", (err) => console.error("ws error", err));

setTimeout(() => {
  console.log("\n==== EVENT COUNTS ====");
  for (const [event, n] of [...counts.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`${n}\t${event}`);
  }
  ws.close();
  process.exit(0);
}, durationMs);
