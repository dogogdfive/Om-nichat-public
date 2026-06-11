import type { ChatMessage } from "@omnichat/chat-types";
import type { ChatHub } from "../hub.js";
import { ingestWithAutomod } from "../automod/pipeline.js";
import { enrichMessageEmotes } from "../emotes/workspace.js";
import { getPlatformTokens } from "../db/repos.js";
import { ensureFreshAccessToken } from "../auth/token-refresh.js";
import { getWatchedChannels } from "./watch-channels.js";
import { readEnv } from "../env.js";
import { debugLog, recordError } from "../debug.js";

const YT_API = "https://www.googleapis.com/youtube/v3";

type PollEntry = {
  liveChatId: string;
  channelKey: string;
  tokenWorkspaceId: string;
  workspaces: Set<string>;
  nextPageToken?: string;
  seenIds: Set<string>;
  timer?: ReturnType<typeof setTimeout>;
  pollingMs: number;
  offlineUntil?: number;
};

const pollByLiveChat = new Map<string, PollEntry>();
const workspaceTargets = new Map<string, Set<string>>();
/** Recent live video id per handle (from /live/ URL resolve) — skips scrape when valid. */
const liveVideoHintByHandle = new Map<string, string>();
const OFFLINE_RETRY_MS = 45_000;
let offlineRetryTimer: ReturnType<typeof setInterval> | undefined;
let hubRef: ChatHub | null = null;

const YT_FETCH_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

function normalizeHandle(name: string): string {
  return name.replace(/^@/, "").replace(/^#/, "").toLowerCase();
}

export function isYoutubeVideoId(value: string): boolean {
  return /^[a-zA-Z0-9_-]{11}$/.test(value.trim());
}

function parseHandleFromAuthorUrl(authorUrl?: string): string | null {
  if (!authorUrl) return null;
  try {
    const url = new URL(authorUrl);
    const parts = url.pathname.split("/").filter(Boolean);
    const first = parts[0] ?? "";
    if (first.startsWith("@")) {
      return normalizeHandle(first.slice(1));
    }
    if (first === "channel" && parts[1]) {
      return parts[1].toLowerCase();
    }
    if ((first === "c" || first === "user") && parts[1]) {
      return normalizeHandle(parts[1]);
    }
  } catch {
    return null;
  }
  return null;
}

/** Resolve a public live/watch video id to a channel handle (no OAuth). */
export async function resolveYoutubeVideoToHandle(
  videoId: string,
): Promise<{ handle: string; displayName?: string; title?: string } | null> {
  const id = videoId.trim();
  if (!isYoutubeVideoId(id)) return null;

  const watchUrl = `https://www.youtube.com/watch?v=${id}`;
  try {
    const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(watchUrl)}&format=json`;
    const res = await fetch(oembedUrl, {
      headers: { Accept: "application/json", "User-Agent": YT_FETCH_UA },
    });
    if (res.ok) {
      const json = (await res.json()) as {
        author_url?: string;
        author_name?: string;
        title?: string;
      };
      const handle = parseHandleFromAuthorUrl(json.author_url);
      if (handle) {
        rememberLiveVideoHint(handle, id);
        return { handle, displayName: json.author_name, title: json.title };
      }
    }
  } catch (err) {
    recordError("youtube:resolve-video", err, { videoId: id });
  }

  return null;
}

export async function normalizeYoutubeChannelHandle(handle: string): Promise<string> {
  const normalized = normalizeHandle(handle);
  if (!isYoutubeVideoId(normalized)) return normalized;
  const resolved = await resolveYoutubeVideoToHandle(normalized);
  return resolved?.handle ?? normalized;
}

function rememberLiveVideoHint(handle: string, videoId: string): void {
  if (!isYoutubeVideoId(videoId)) return;
  liveVideoHintByHandle.set(normalizeHandle(handle), videoId.trim());
}

function liveVideoHint(handle: string): string | null {
  return liveVideoHintByHandle.get(normalizeHandle(handle)) ?? null;
}

function hasYoutubeApiKey(): boolean {
  return Boolean(readEnv("YOUTUBE_API_KEY"));
}

function videoIdFromUrl(url: string): string | null {
  return (
    url.match(/[?&]v=([\w-]{11})/)?.[1] ??
    url.match(/\/live\/([\w-]{11})/)?.[1] ??
    null
  );
}

async function ytFetchWithApiKey(
  path: string,
  params: Record<string, string>,
): Promise<{ ok: boolean; status: number; json: Record<string, unknown> } | null> {
  const apiKey = readEnv("YOUTUBE_API_KEY");
  if (!apiKey) return null;

  const q = new URLSearchParams({ ...params, key: apiKey });
  const res = await fetch(`${YT_API}/${path}?${q}`);
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const errBody = json.error as { message?: string; errors?: unknown[] } | undefined;
    recordError("youtube:api-key", errBody?.message ?? res.statusText, {
      path,
      status: res.status,
      errors: errBody?.errors,
    });
  }
  return { ok: res.ok, status: res.status, json };
}

async function fetchLiveChatMessages(
  accessToken: string | null,
  params: Record<string, string>,
): Promise<{ ok: boolean; status: number; json: Record<string, unknown> }> {
  const keyRes = await ytFetchWithApiKey("liveChat/messages", params);
  if (keyRes?.ok) return keyRes;

  if (!accessToken) {
    return (
      keyRes ?? {
        ok: false,
        status: 401,
        json: {},
      }
    );
  }

  return ytFetch(accessToken, "liveChat/messages", params);
}

async function ytFetch(
  accessToken: string,
  path: string,
  params: Record<string, string>,
): Promise<{ ok: boolean; status: number; json: Record<string, unknown> }> {
  const q = new URLSearchParams(params);
  const res = await fetch(`${YT_API}/${path}?${q}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const errBody = json.error as { message?: string; errors?: unknown[] } | undefined;
    recordError("youtube:api", errBody?.message ?? res.statusText, {
      path,
      status: res.status,
      errors: errBody?.errors,
    });
  }
  return { ok: res.ok, status: res.status, json };
}

/**
 * Quota-free: scrape the channel's /live page to find the current live video id.
 * Avoids the YouTube `search` endpoint (100 quota units per call).
 */
async function scrapeChannelLive(
  handle: string,
): Promise<{ exists: boolean; videoId: string | null }> {
  const normalized = normalizeHandle(handle);
  const url = `https://www.youtube.com/@${encodeURIComponent(normalized)}/live`;
  let res: Response;
  try {
    res = await fetch(url, {
      headers: { "User-Agent": YT_FETCH_UA, "Accept-Language": "en-US,en;q=0.9" },
      redirect: "follow",
    });
  } catch (err) {
    recordError("youtube:scrape", err, { handle: normalized });
    return { exists: true, videoId: null };
  }
  if (res.status === 404) return { exists: false, videoId: null };
  if (!res.ok) return { exists: true, videoId: null };

  const redirectVideoId = videoIdFromUrl(res.url);
  const html = await res.text();
  const isLive =
    /"isLiveNow":\s*true/.test(html) ||
    /"isLive":\s*true/.test(html) ||
    /"liveBroadcastDetails"/.test(html) ||
    /"LIVE"/.test(html);

  const canonical = html.match(
    /<link rel="canonical" href="https:\/\/www\.youtube\.com\/watch\?v=([\w-]{11})">/,
  );
  const videoId =
    redirectVideoId ??
    canonical?.[1] ??
    html.match(/"videoId":"([\w-]{11})"/)?.[1] ??
    html.match(/"watchEndpoint":\{"videoId":"([\w-]{11})"/)?.[1] ??
    html.match(/\/watch\?v=([\w-]{11})/)?.[1] ??
    html.match(/"url":"\/watch\?v=([\w-]{11})"/)?.[1] ??
    null;

  if (!videoId) return { exists: true, videoId: null };
  if (!isLive && !redirectVideoId) return { exists: true, videoId: null };
  return { exists: true, videoId };
}

function activeLiveChatIdFromVideosJson(json: Record<string, unknown>): string | null {
  const details = (
    json.items as { liveStreamingDetails?: { activeLiveChatId?: string } }[] | undefined
  )?.[0]?.liveStreamingDetails;
  return details?.activeLiveChatId ?? null;
}

/** Cheap (1 quota unit): resolve a known live video id to its active live chat id. */
async function liveChatIdForVideo(
  accessToken: string | null,
  videoId: string,
): Promise<string | null> {
  const keyRes = await ytFetchWithApiKey("videos", {
    part: "liveStreamingDetails",
    id: videoId,
  });
  if (keyRes?.ok) {
    const chatId = activeLiveChatIdFromVideosJson(keyRes.json);
    if (chatId) return chatId;
  }

  if (hasYoutubeApiKey()) return null;

  if (!accessToken) return null;

  const videos = await ytFetch(accessToken, "videos", {
    part: "liveStreamingDetails",
    id: videoId,
  });
  return activeLiveChatIdFromVideosJson(videos.json);
}

/** Resolve a channel handle to its current active live chat id (quota-free discovery). */
async function liveChatIdForHandle(
  accessToken: string | null,
  handle: string,
): Promise<string | null> {
  const normalized = normalizeHandle(handle);

  const hinted = liveVideoHint(normalized);
  if (hinted) {
    const hintedChat = await liveChatIdForVideo(accessToken, hinted);
    if (hintedChat) return hintedChat;
  }

  const { videoId } = await scrapeChannelLive(normalized);
  if (!videoId) return null;
  rememberLiveVideoHint(normalized, videoId);
  return liveChatIdForVideo(accessToken, videoId);
}

async function ownLiveChatId(accessToken: string): Promise<string | null> {
  const res = await ytFetch(accessToken, "liveBroadcasts", {
    part: "contentDetails,snippet",
    broadcastStatus: "active",
    mine: "true",
  });
  const item = (
    res.json.items as { contentDetails?: { activeLiveChatId?: string } }[] | undefined
  )?.[0];
  return item?.contentDetails?.activeLiveChatId ?? null;
}

function toChatMessage(
  channelKey: string,
  raw: {
    id?: string;
    snippet?: { displayMessage?: string; publishedAt?: string };
    authorDetails?: {
      channelId?: string;
      displayName?: string;
      profileImageUrl?: string;
    };
  },
): ChatMessage | null {
  const text = raw.snippet?.displayMessage?.trim();
  if (!text) return null;
  const id = raw.id ?? `${Date.now()}`;
  const author = raw.authorDetails;
  return {
    id: `youtube:${id}`,
    platform: "youtube",
    platformMessageId: id,
    channelId: channelKey,
    author: {
      id: author?.channelId ?? "unknown",
      displayName: author?.displayName ?? "unknown",
      username: author?.displayName,
      avatarUrl: author?.profileImageUrl,
    },
    text,
    emotes: [],
    timestamp: raw.snippet?.publishedAt ?? new Date().toISOString(),
  };
}

function fanOut(entry: PollEntry, hub: ChatHub, msg: ChatMessage) {
  for (const workspaceId of entry.workspaces) {
    void enrichMessageEmotes(workspaceId, msg).then((enriched) =>
      ingestWithAutomod(workspaceId, enriched, hub),
    );
  }
}

async function pollLiveChat(entry: PollEntry, hub: ChatHub) {
  if (entry.workspaces.size === 0) {
    stopPoll(entry.liveChatId);
    return;
  }

  let accessToken = (await ensureFreshAccessToken(entry.tokenWorkspaceId, "youtube")) ?? null;
  if (!accessToken && !hasYoutubeApiKey()) {
    schedulePoll(entry, hub);
    return;
  }

  const params: Record<string, string> = {
    liveChatId: entry.liveChatId,
    part: "id,snippet,authorDetails",
    maxResults: "200",
  };
  if (entry.nextPageToken) params.pageToken = entry.nextPageToken;

  let res = await fetchLiveChatMessages(accessToken, params);
  if (res.status === 401) {
    accessToken = (await ensureFreshAccessToken(entry.tokenWorkspaceId, "youtube")) ?? null;
    if (accessToken || hasYoutubeApiKey()) {
      res = await fetchLiveChatMessages(accessToken, params);
    }
  }

  if (!res.ok) {
    if (res.status === 403 || res.status === 404) {
      entry.offlineUntil = Date.now() + 60_000;
      entry.pollingMs = 30_000;
      debugLog("youtube", `@${entry.channelKey} chat offline (${res.status}) — backing off`);
    }
    schedulePoll(entry, hub);
    return;
  }

  const pollingMs = Number(res.json.pollingIntervalMillis ?? entry.pollingMs);
  entry.pollingMs = Math.max(3_000, Math.min(pollingMs, 30_000));
  entry.nextPageToken = String(res.json.nextPageToken ?? "") || undefined;

  const items = (res.json.items as unknown[]) ?? [];
  for (const raw of items) {
    const msg = toChatMessage(entry.channelKey, raw as Parameters<typeof toChatMessage>[1]);
    if (!msg || entry.seenIds.has(msg.platformMessageId)) continue;
    entry.seenIds.add(msg.platformMessageId);
    if (entry.seenIds.size > 5_000) {
      entry.seenIds.clear();
    }
    fanOut(entry, hub, msg);
  }

  schedulePoll(entry, hub);
}

function schedulePoll(entry: PollEntry, hub: ChatHub) {
  if (entry.timer) clearTimeout(entry.timer);
  if (entry.workspaces.size === 0) return;
  const delay =
    entry.offlineUntil && entry.offlineUntil > Date.now()
      ? entry.offlineUntil - Date.now()
      : entry.pollingMs;
  entry.timer = setTimeout(() => {
    entry.timer = undefined;
    void pollLiveChat(entry, hub);
  }, delay);
}

function stopPoll(liveChatId: string) {
  const entry = pollByLiveChat.get(liveChatId);
  if (!entry) return;
  if (entry.timer) clearTimeout(entry.timer);
  pollByLiveChat.delete(liveChatId);
}

/** Stop polling handles this workspace no longer watches. */
function detachStaleYoutubePolls(workspaceId: string, targets: Set<string>): void {
  for (const [liveChatId, entry] of pollByLiveChat) {
    if (!entry.workspaces.has(workspaceId)) continue;
    if (targets.has(entry.channelKey)) continue;
    entry.workspaces.delete(workspaceId);
    if (entry.workspaces.size === 0) stopPoll(liveChatId);
  }
}

async function attachWorkspaceToLiveChat(
  workspaceId: string,
  liveChatId: string,
  channelKey: string,
  hub: ChatHub,
) {
  let entry = pollByLiveChat.get(liveChatId);
  const isNew = !entry;
  if (!entry) {
    entry = {
      liveChatId,
      channelKey,
      tokenWorkspaceId: workspaceId,
      workspaces: new Set(),
      seenIds: new Set(),
      pollingMs: 5_000,
    };
    pollByLiveChat.set(liveChatId, entry);
  }
  entry.workspaces.add(workspaceId);
  entry.channelKey = channelKey;
  entry.tokenWorkspaceId = workspaceId;
  if (isNew) {
    void pollLiveChat(entry, hub);
  }
}

function isHandlePolling(workspaceId: string, handle: string): boolean {
  return [...pollByLiveChat.values()].some(
    (entry) => entry.workspaces.has(workspaceId) && entry.channelKey === handle,
  );
}

function cachedLiveChatId(handle: string, workspaceId?: string): string | null {
  const normalized = normalizeHandle(handle);
  for (const entry of pollByLiveChat.values()) {
    if (entry.channelKey !== normalized) continue;
    if (workspaceId && !entry.workspaces.has(workspaceId)) continue;
    return entry.liveChatId;
  }
  return null;
}

function youtubeSendError(json: Record<string, unknown>, status: number): string {
  const err = json.error as
    | { message?: string; errors?: { reason?: string; message?: string }[] }
    | undefined;
  const reason = err?.errors?.[0]?.reason;
  if (reason === "liveChatDisabled") {
    return "This stream's chat is disabled by the owner";
  }
  if (reason === "liveChatEnded") {
    return "This stream is no longer live";
  }
  if (reason === "rateLimitExceeded") {
    return "YouTube rate limit — wait a moment and try again";
  }
  if (status === 403) {
    return (
      err?.message ??
      "YouTube blocked this message (members-only chat, slow mode, or account not allowed to chat)"
    );
  }
  return err?.message ?? "YouTube rejected the message";
}

async function resolveLiveChatForHandle(
  workspaceId: string,
  handle: string,
  accessToken: string | null,
): Promise<string | null> {
  const tokens = await getPlatformTokens(workspaceId, "youtube");
  const ownHandle = tokens?.platformUsername ? normalizeHandle(tokens.platformUsername) : null;

  if (accessToken && ownHandle && handle === ownHandle) {
    const own = await ownLiveChatId(accessToken);
    if (own) return own;
  }

  return liveChatIdForHandle(accessToken, handle);
}

async function attachYoutubeHandle(
  workspaceId: string,
  handle: string,
  accessToken: string | null,
  hub: ChatHub,
): Promise<boolean> {
  if (isHandlePolling(workspaceId, handle)) return true;

  const liveChatId = await resolveLiveChatForHandle(workspaceId, handle, accessToken);
  if (!liveChatId) return false;

  await attachWorkspaceToLiveChat(workspaceId, liveChatId, handle, hub);
  debugLog("youtube", `polling live chat for @${handle} (${liveChatId})`, { workspaceId });
  return true;
}

function ensureOfflineRetryLoop(hub: ChatHub): void {
  hubRef = hub;
  if (offlineRetryTimer) return;
  offlineRetryTimer = setInterval(() => {
    if (!hubRef) return;
    void retryOfflineYoutubeChannels(hubRef);
  }, OFFLINE_RETRY_MS);
}

async function retryOfflineYoutubeChannels(hub: ChatHub): Promise<void> {
  for (const [workspaceId, handles] of workspaceTargets) {
    if (handles.size === 0) continue;
    const accessToken = (await ensureFreshAccessToken(workspaceId, "youtube")) ?? null;
    if (!accessToken && !hasYoutubeApiKey()) continue;

    for (const handle of handles) {
      if (isHandlePolling(workspaceId, handle)) continue;
      const attached = await attachYoutubeHandle(workspaceId, handle, accessToken, hub).catch(
        (err) => {
          recordError("youtube:retry", err, { workspaceId, handle });
          return false;
        },
      );
      if (!attached) {
        debugLog("youtube", `@${handle} still offline — retry in ${OFFLINE_RETRY_MS / 1000}s`, {
          workspaceId,
        });
      }
    }
  }
}

export async function probeYoutubeChannelLive(
  accessToken: string | null,
  handle: string,
): Promise<{
  exists: boolean;
  isLive: boolean;
  handle: string;
  displayName?: string;
  title?: string;
}> {
  const normalized = normalizeHandle(handle);
  const { exists, videoId } = await scrapeChannelLive(normalized);
  if (!exists) {
    return { exists: false, isLive: false, handle: normalized };
  }
  if (!videoId) {
    return { exists: true, isLive: false, handle: normalized };
  }

  const liveChatId = await liveChatIdForVideo(accessToken, videoId);
  if (!liveChatId) {
    return { exists: true, isLive: false, handle: normalized };
  }

  // oEmbed is quota-free — use it for the title/display name.
  const meta = await resolveYoutubeVideoToHandle(videoId);
  return {
    exists: true,
    isLive: true,
    handle: normalized,
    displayName: meta?.displayName,
    title: meta?.title,
  };
}

export function getYoutubeIngestStatus(): {
  polls: { liveChatId: string; channelKey: string; workspaces: string[]; pollingMs: number }[];
  pending: { workspaceId: string; handles: string[] }[];
} {
  const pending: { workspaceId: string; handles: string[] }[] = [];
  for (const [workspaceId, handles] of workspaceTargets) {
    const waiting = [...handles].filter((handle) => !isHandlePolling(workspaceId, handle));
    if (waiting.length > 0) pending.push({ workspaceId, handles: waiting });
  }
  return {
    polls: [...pollByLiveChat.entries()].map(([liveChatId, entry]) => ({
      liveChatId,
      channelKey: entry.channelKey,
      workspaces: [...entry.workspaces],
      pollingMs: entry.pollingMs,
    })),
    pending,
  };
}

export function stopYoutubeIngest(workspaceId: string): void {
  workspaceTargets.delete(workspaceId);
  for (const entry of pollByLiveChat.values()) {
    entry.workspaces.delete(workspaceId);
    if (entry.workspaces.size === 0) stopPoll(entry.liveChatId);
  }
}

export async function startYoutubeIngest(workspaceId: string, hub: ChatHub): Promise<void> {
  const accessToken = (await ensureFreshAccessToken(workspaceId, "youtube")) ?? null;
  if (!accessToken && !hasYoutubeApiKey()) {
    console.warn(`[youtube] workspace ${workspaceId}: no tokens — connect YouTube in Settings`);
    return;
  }
  if (!accessToken && hasYoutubeApiKey()) {
    console.warn(
      `[youtube] workspace ${workspaceId}: read-only ingest via YOUTUBE_API_KEY (connect YouTube to send chat)`,
    );
  }

  const tokens = await getPlatformTokens(workspaceId, "youtube");
  const targets = new Set<string>();

  for (const ch of getWatchedChannels(workspaceId, "youtube")) {
    targets.add(normalizeHandle(ch));
  }
  if (targets.size === 0 && tokens?.platformUsername) {
    targets.add(normalizeHandle(tokens.platformUsername));
  }

  workspaceTargets.set(workspaceId, targets);
  detachStaleYoutubePolls(workspaceId, targets);
  ensureOfflineRetryLoop(hub);

  if (targets.size === 0) {
    console.warn(`[youtube] workspace ${workspaceId}: no channels to watch — add one under Channels`);
    return;
  }

  for (const handle of targets) {
    const attached = await attachYoutubeHandle(workspaceId, handle, accessToken, hub).catch(
      (err) => {
        recordError("youtube:attach", err, { workspaceId, handle });
        return false;
      },
    );
    if (!attached) {
      console.log(`[youtube] @${handle} not live — will retry every ${OFFLINE_RETRY_MS / 1000}s`);
    }
  }
}

export async function sendYoutubeChat(
  workspaceId: string,
  text: string,
  channelHandle?: string,
): Promise<{ ok: boolean; error?: string }> {
  const accessToken = (await ensureFreshAccessToken(workspaceId, "youtube")) ?? null;
  if (!accessToken) return { ok: false, error: "YouTube not connected" };

  let liveChatId: string | null = null;
  const handle = channelHandle ? normalizeHandle(channelHandle) : null;

  if (handle) {
    liveChatId = cachedLiveChatId(handle, workspaceId);
    if (!liveChatId) {
      liveChatId = await resolveLiveChatForHandle(workspaceId, handle, accessToken);
    }
    if (!liveChatId) {
      return {
        ok: false,
        error: `@${handle} is not live — YouTube chat send only works during live streams`,
      };
    }
  } else {
    liveChatId = await ownLiveChatId(accessToken);
    if (!liveChatId) {
      return {
        ok: false,
        error: "No active YouTube live stream — pick a live channel tab or go live on your channel",
      };
    }
  }

  const res = await fetch(`${YT_API}/liveChat/messages?part=snippet`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      snippet: {
        liveChatId,
        type: "textMessageEvent",
        textMessageDetails: { messageText: text },
      },
    }),
  });
  if (!res.ok) {
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    return { ok: false, error: youtubeSendError(json, res.status) };
  }
  return { ok: true };
}
