import type { ChatMessage } from "@omnichat/chat-types";
import type { ChatHub } from "../hub.js";
import { ingestWithAutomod } from "../automod/pipeline.js";
import { enrichMessageEmotes } from "../emotes/workspace.js";
import { getWatchedChannels } from "./watch-channels.js";
import { recordError } from "../debug.js";
import { resolveRumbleLiveStream } from "./rumble-resolve.js";
import {
  attachRumbleSseWatcher,
  detachRumbleSseWatcher,
  getRumbleSseStatus,
  stopRumbleSseForWorkspace,
} from "./rumble-sse.js";
import { getRumbleApiUrl } from "./rumble-tokens.js";
import {
  isRumbleServerIngestEnabled,
  normalizeRumbleSlug,
  rumbleOfflineRetryMs,
} from "./rumble-session.js";

const CHROME_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

type RumbleChatMessage = {
  id?: string;
  text?: string;
  username?: string;
  created_on?: string;
  user_id?: string | number;
  badges?: string[];
};

type RumbleLivestream = {
  id?: string | number;
  title?: string;
  is_live?: boolean;
  chat?: { recent_messages?: RumbleChatMessage[] };
};

type RumbleLivestreamApi = {
  username?: string;
  livestreams?: RumbleLivestream[];
};

type ApiPoolEntry = {
  apiUrl: string;
  workspaces: Set<string>;
  pollTimer?: ReturnType<typeof setInterval>;
  seenIds: Set<string>;
};

const poolByApiUrl = new Map<string, ApiPoolEntry>();
const workspaceToApiUrl = new Map<string, string>();
const offlineSlugsByWorkspace = new Map<string, Set<string>>();
const attachedSlugsByWorkspace = new Map<string, Set<string>>();
let offlineRetryTimer: ReturnType<typeof setInterval> | undefined;

function normalizeApiUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (trimmed.includes("livestream-api")) {
    try {
      return new URL(trimmed).toString();
    } catch {
      return null;
    }
  }
  const key = trimmed.replace(/^key[=:/]+/i, "");
  if (!key) return null;
  return `https://rumble.com/-livestream-api/get-data?key=${encodeURIComponent(key)}`;
}

async function fetchLivestreamData(apiUrl: string): Promise<RumbleLivestreamApi | null> {
  try {
    const res = await fetch(apiUrl, {
      headers: { "User-Agent": CHROME_UA, Accept: "application/json" },
    });
    if (!res.ok) return null;
    return (await res.json()) as RumbleLivestreamApi;
  } catch (err) {
    recordError("rumble:fetch", err);
    return null;
  }
}

function toChatMessage(
  msg: RumbleChatMessage,
  channelSlug: string,
  streamId: string,
): ChatMessage | null {
  const text = msg.text?.trim();
  const username = msg.username?.trim();
  if (!text || !username) return null;

  const messageId = msg.id ?? `${username}:${msg.created_on ?? text}`;
  const userId = msg.user_id != null ? String(msg.user_id) : username.toLowerCase();

  return {
    id: `rumble:${streamId}:${messageId}`,
    platform: "rumble",
    platformMessageId: messageId,
    channelId: channelSlug,
    author: {
      id: userId,
      displayName: username,
      username: username.toLowerCase(),
    },
    text,
    emotes: [],
    badges: msg.badges?.length
      ? msg.badges.map((b) => ({ url: `https://rumble.com/badge/${b}`, title: b }))
      : undefined,
    timestamp: msg.created_on ?? new Date().toISOString(),
  };
}

async function pollApiPoolEntry(entry: ApiPoolEntry, hub: ChatHub): Promise<void> {
  const data = await fetchLivestreamData(entry.apiUrl);
  if (!data?.livestreams?.length) return;

  const channelSlug = normalizeRumbleSlug(data.username ?? "rumble");

  for (const stream of data.livestreams) {
    if (stream.is_live === false) continue;
    const streamId = String(stream.id ?? channelSlug);

    for (const msg of stream.chat?.recent_messages ?? []) {
      const dedupeKey = msg.id ?? `${msg.username}:${msg.created_on}:${msg.text}`;
      if (!dedupeKey || entry.seenIds.has(dedupeKey)) continue;
      entry.seenIds.add(dedupeKey);
      if (entry.seenIds.size > 5000) {
        entry.seenIds = new Set([...entry.seenIds].slice(-2500));
      }

      const chatMsg = toChatMessage(msg, channelSlug, streamId);
      if (!chatMsg) continue;

      for (const workspaceId of entry.workspaces) {
        const watched = getWatchedChannels(workspaceId, "rumble");
        if (watched.length > 0 && !watched.includes(channelSlug)) continue;

        void enrichMessageEmotes(workspaceId, chatMsg).then((enriched) =>
          ingestWithAutomod(workspaceId, enriched, hub),
        );
      }
    }
  }
}

function attachApiWorkspace(entry: ApiPoolEntry, workspaceId: string, hub: ChatHub): void {
  entry.workspaces.add(workspaceId);
  if (entry.pollTimer) return;

  void pollApiPoolEntry(entry, hub);
  entry.pollTimer = setInterval(() => {
    void pollApiPoolEntry(entry, hub);
  }, 3000);
}

function detachApiWorkspace(apiUrl: string, workspaceId: string): void {
  const entry = poolByApiUrl.get(apiUrl);
  if (!entry) return;
  entry.workspaces.delete(workspaceId);
  if (entry.workspaces.size === 0) {
    if (entry.pollTimer) clearInterval(entry.pollTimer);
    poolByApiUrl.delete(apiUrl);
  }
}

function ensureOfflineRetryLoop(hub: ChatHub): void {
  if (offlineRetryTimer) return;
  offlineRetryTimer = setInterval(() => {
    for (const [workspaceId, slugs] of offlineSlugsByWorkspace) {
      if (slugs.size === 0) continue;
      void attachServerIngestSlugs(workspaceId, [...slugs], hub).catch((err) =>
        recordError("rumble:offline-retry", err, { workspaceId }),
      );
    }
  }, rumbleOfflineRetryMs());
}

async function attachServerIngestSlugs(
  workspaceId: string,
  slugs: string[],
  hub: ChatHub,
): Promise<void> {
  if (!isRumbleServerIngestEnabled()) return;

  ensureOfflineRetryLoop(hub);

  let attached = attachedSlugsByWorkspace.get(workspaceId);
  if (!attached) {
    attached = new Set();
    attachedSlugsByWorkspace.set(workspaceId, attached);
  }

  let offline = offlineSlugsByWorkspace.get(workspaceId);
  if (!offline) {
    offline = new Set();
    offlineSlugsByWorkspace.set(workspaceId, offline);
  }

  const normalized = slugs.map(normalizeRumbleSlug).filter(Boolean);
  for (const slug of attached) {
    if (!normalized.includes(slug)) {
      detachRumbleSseWatcher(workspaceId, slug);
      attached.delete(slug);
    }
  }

  for (const slug of normalized) {
    const resolved = await resolveRumbleLiveStream(slug);
    if (!resolved) {
      offline.add(slug);
      if (attached.has(slug)) {
        detachRumbleSseWatcher(workspaceId, slug);
        attached.delete(slug);
      }
      console.log(`[rumble] @${slug} not live — will retry every ${rumbleOfflineRetryMs() / 1000}s`);
      continue;
    }

    offline.delete(slug);
    attachRumbleSseWatcher(workspaceId, slug, resolved.streamIdB10, hub);
    attached.add(slug);
    console.log(`[rumble] SSE attached @${slug} stream=${resolved.streamIdB10} workspace=${workspaceId}`);
  }
}

async function startApiIngest(workspaceId: string, hub: ChatHub): Promise<void> {
  const apiUrl = await getRumbleApiUrl(workspaceId);

  const prev = workspaceToApiUrl.get(workspaceId);
  if (prev && prev !== apiUrl) {
    detachApiWorkspace(prev, workspaceId);
    workspaceToApiUrl.delete(workspaceId);
  }

  if (!apiUrl) return;

  let entry = poolByApiUrl.get(apiUrl);
  if (!entry) {
    entry = { apiUrl, workspaces: new Set(), seenIds: new Set() };
    poolByApiUrl.set(apiUrl, entry);
  }

  workspaceToApiUrl.set(workspaceId, apiUrl);
  attachApiWorkspace(entry, workspaceId, hub);
  console.log(`[rumble] polling Live Stream API for workspace ${workspaceId}`);
}

export function getRumbleIngestStatus(): {
  serverIngestEnabled: boolean;
  apiConnections: { apiUrl: string; workspaces: string[] }[];
  sse: ReturnType<typeof getRumbleSseStatus>;
  offline: { workspaceId: string; slugs: string[] }[];
} {
  return {
    serverIngestEnabled: isRumbleServerIngestEnabled(),
    apiConnections: [...poolByApiUrl.entries()].map(([apiUrl, entry]) => ({
      apiUrl: apiUrl.replace(/key=[^&]+/, "key=***"),
      workspaces: [...entry.workspaces],
    })),
    sse: getRumbleSseStatus(),
    offline: [...offlineSlugsByWorkspace.entries()].map(([workspaceId, slugs]) => ({
      workspaceId,
      slugs: [...slugs],
    })),
  };
}

export async function startRumbleIngest(workspaceId: string, hub: ChatHub): Promise<void> {
  const watched = getWatchedChannels(workspaceId, "rumble");

  if (watched.length > 0 && isRumbleServerIngestEnabled()) {
    await attachServerIngestSlugs(workspaceId, watched, hub);
  } else if (watched.length > 0) {
    console.log(
      `[rumble] workspace ${workspaceId}: watching ${watched.join(", ")} — server ingest disabled`,
    );
  }

  await startApiIngest(workspaceId, hub);
}

export function stopRumbleIngest(workspaceId: string): void {
  const apiUrl = workspaceToApiUrl.get(workspaceId);
  if (apiUrl) {
    detachApiWorkspace(apiUrl, workspaceId);
    workspaceToApiUrl.delete(workspaceId);
  }

  stopRumbleSseForWorkspace(workspaceId);
  attachedSlugsByWorkspace.delete(workspaceId);
  offlineSlugsByWorkspace.delete(workspaceId);
}

export async function validateRumbleApiUrl(raw: string): Promise<{
  ok: boolean;
  apiUrl?: string;
  username?: string;
  error?: string;
}> {
  const apiUrl = normalizeApiUrl(raw);
  if (!apiUrl) return { ok: false, error: "Invalid Live Stream API URL or key" };

  const data = await fetchLivestreamData(apiUrl);
  if (!data) return { ok: false, error: "Could not reach Rumble Live Stream API" };

  return {
    ok: true,
    apiUrl,
    username: data.username ? normalizeRumbleSlug(data.username) : undefined,
  };
}

export { normalizeApiUrl };
