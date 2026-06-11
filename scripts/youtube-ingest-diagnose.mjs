#!/usr/bin/env node
/** Quick YouTube ingest diagnostic: scrape → videos.list → one liveChat poll. */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const envPath = join(here, "..", ".env");
try {
  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
} catch {
  /* optional local .env */
}

const handle = process.argv[2] ?? "jynxzi";
const apiKey = process.env.YOUTUBE_API_KEY;
const YT_API = "https://www.googleapis.com/youtube/v3";
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

async function scrapeLiveVideoId(name) {
  const url = `https://www.youtube.com/@${encodeURIComponent(name)}/live`;
  const res = await fetch(url, { headers: { "User-Agent": UA }, redirect: "follow" });
  const html = await res.text();
  const videoId =
    html.match(/<link rel="canonical" href="https:\/\/www\.youtube\.com\/watch\?v=([\w-]{11})">/)?.[1] ??
    html.match(/"videoId":"([\w-]{11})"/)?.[1] ??
    html.match(/\/watch\?v=([\w-]{11})/)?.[1] ??
    null;
  return { status: res.status, videoId, isLive: /"isLiveNow":\s*true|"isLive":\s*true/.test(html) };
}

async function liveChatIdForVideo(videoId) {
  if (!apiKey) return { error: "YOUTUBE_API_KEY not set" };
  const q = new URLSearchParams({ part: "liveStreamingDetails", id: videoId, key: apiKey });
  const res = await fetch(`${YT_API}/videos?${q}`);
  const json = await res.json();
  if (!res.ok) return { status: res.status, error: json.error?.message ?? res.statusText };
  const chatId = json.items?.[0]?.liveStreamingDetails?.activeLiveChatId ?? null;
  return { status: res.status, liveChatId: chatId };
}

async function sampleChat(liveChatId) {
  if (!apiKey) return { skipped: true };
  const q = new URLSearchParams({
    part: "snippet,authorDetails",
    liveChatId,
    maxResults: "5",
    key: apiKey,
  });
  const res = await fetch(`${YT_API}/liveChat/messages?${q}`);
  const json = await res.json();
  if (!res.ok) {
    return {
      status: res.status,
      error: json.error?.message ?? res.statusText,
      note: "liveChat/messages usually requires OAuth, not API key",
    };
  }
  return {
    status: res.status,
    messageCount: json.items?.length ?? 0,
    pollingIntervalMillis: json.pollingIntervalMillis,
  };
}

console.log(`Diagnosing @${handle} ...`);
console.log("YOUTUBE_API_KEY:", apiKey ? `${apiKey.slice(0, 8)}…` : "(missing)");

const scrape = await scrapeLiveVideoId(handle);
console.log("\n1) Scrape @handle/live:", scrape);

if (!scrape.videoId) {
  console.log("\nNo live video id — stream may be offline or scrape patterns need update.");
  process.exit(1);
}

const chat = await liveChatIdForVideo(scrape.videoId);
console.log("\n2) videos.list (API key):", chat);

if (chat.liveChatId) {
  const poll = await sampleChat(chat.liveChatId);
  console.log("\n3) liveChat/messages sample:", poll);
}
