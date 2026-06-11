import type { ChatMessage } from "@omnichat/chat-types";
import type { ChatHub } from "../hub.js";
import { ingestWithAutomod } from "../automod/pipeline.js";
import { enrichMessageEmotes } from "../emotes/workspace.js";
import { debugLog, recordError } from "../debug.js";
import { rumbleChatSseUrl } from "./rumble-resolve.js";
import { rumbleFetchHeaders } from "./rumble-session.js";

type SseUser = {
  id: number;
  username: string;
  badges?: string[];
};

type SseMessage = {
  id?: number | string;
  user_id?: number | string;
  channel_id?: number | string;
  text?: string;
  time?: string;
};

type Watcher = {
  workspaceId: string;
  slug: string;
};

type StreamPoolEntry = {
  streamIdB10: number;
  watchers: Map<string, Watcher>;
  seenIds: Set<string>;
  users: Map<number, SseUser>;
  abort?: AbortController;
  running: boolean;
  reconnectMs: number;
};

const poolByStreamId = new Map<number, StreamPoolEntry>();
const workspaceWatchKeys = new Map<string, Set<string>>();
let hubRef: ChatHub | null = null;

function watchKey(workspaceId: string, slug: string): string {
  return `${workspaceId}:${slug}`;
}

function sseMessageToChatMessage(
  msg: SseMessage,
  slug: string,
  streamIdB10: number,
  users: Map<number, SseUser>,
): ChatMessage | null {
  const text = msg.text?.trim();
  if (!text) return null;
  const userId = msg.user_id != null ? Number(msg.user_id) : 0;
  const user = users.get(userId);
  const username = user?.username?.trim() || `user_${userId}` || "rumble_user";
  const messageId = msg.id != null ? String(msg.id) : `${userId}:${msg.time ?? text}`;

  return {
    id: `rumble:${streamIdB10}:${messageId}`,
    platform: "rumble",
    platformMessageId: messageId,
    channelId: slug,
    author: {
      id: String(userId),
      displayName: username,
      username: username.toLowerCase(),
    },
    text,
    emotes: [],
    badges: user?.badges?.length
      ? user.badges.map((b) => ({ url: `https://rumble.com/badge/${b}`, title: b }))
      : undefined,
    timestamp: msg.time ?? new Date().toISOString(),
  };
}

function updateUsers(entry: StreamPoolEntry, users: SseUser[] | undefined): void {
  for (const u of users ?? []) {
    if (u.id == null || !u.username) continue;
    entry.users.set(Number(u.id), u);
  }
}

function ingestMessages(
  entry: StreamPoolEntry,
  messages: SseMessage[] | undefined,
  hub: ChatHub,
): void {
  for (const msg of messages ?? []) {
    const dedupeKey = msg.id != null ? String(msg.id) : `${msg.user_id}:${msg.time}:${msg.text}`;
    if (!dedupeKey || entry.seenIds.has(dedupeKey)) continue;
    entry.seenIds.add(dedupeKey);
    if (entry.seenIds.size > 5000) {
      entry.seenIds = new Set([...entry.seenIds].slice(-2500));
    }

    for (const watcher of entry.watchers.values()) {
      const chatMsg = sseMessageToChatMessage(msg, watcher.slug, entry.streamIdB10, entry.users);
      if (!chatMsg) continue;
      void enrichMessageEmotes(watcher.workspaceId, chatMsg).then((enriched) =>
        ingestWithAutomod(watcher.workspaceId, enriched, hub),
      );
    }
  }
}

function handleSseJson(entry: StreamPoolEntry, hub: ChatHub, json: Record<string, unknown>): void {
  const type = json.type as string | undefined;
  const data = (json.data ?? {}) as {
    messages?: SseMessage[];
    users?: SseUser[];
  };

  if (type === "init" || type === "messages") {
    updateUsers(entry, data.users);
    ingestMessages(entry, data.messages, hub);
  }
}

function parseSseBlock(block: string): { event?: string; data?: string } {
  const lines = block.split("\n");
  let event: string | undefined;
  let data = "";
  for (const line of lines) {
    if (line.startsWith("event:")) event = line.slice(6).trim();
    else if (line.startsWith("data:")) data += line.slice(5).trim();
  }
  return { event, data: data || undefined };
}

async function runSseLoop(entry: StreamPoolEntry, hub: ChatHub): Promise<void> {
  while (entry.running && entry.watchers.size > 0) {
    entry.abort = new AbortController();
    const url = rumbleChatSseUrl(entry.streamIdB10);
    try {
      const res = await fetch(url, {
        headers: rumbleFetchHeaders({ Accept: "text/event-stream" }),
        signal: entry.abort.signal,
      });
      if (!res.ok || !res.body) {
        throw new Error(`SSE HTTP ${res.status}`);
      }

      entry.reconnectMs = 3000;
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (entry.running) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n\n");
        buffer = parts.pop() ?? "";
        for (const part of parts) {
          const trimmed = part.trim();
          if (!trimmed || trimmed.startsWith(":")) continue;
          const { data } = parseSseBlock(trimmed);
          if (!data) continue;
          try {
            const json = JSON.parse(data) as Record<string, unknown>;
            handleSseJson(entry, hub, json);
          } catch (err) {
            recordError("rumble:sse:parse", err, { streamId: entry.streamIdB10 });
          }
        }
      }
    } catch (err) {
      if (entry.abort?.signal.aborted) break;
      recordError("rumble:sse:connect", err, { streamId: entry.streamIdB10 });
      entry.reconnectMs = Math.min(entry.reconnectMs * 2, 60_000);
      await new Promise((r) => setTimeout(r, entry.reconnectMs));
      continue;
    } finally {
      entry.abort = undefined;
    }

    if (entry.running && entry.watchers.size > 0) {
      await new Promise((r) => setTimeout(r, entry.reconnectMs));
    }
  }
}

function ensureStreamPool(streamIdB10: number, hub: ChatHub): StreamPoolEntry {
  let entry = poolByStreamId.get(streamIdB10);
  if (!entry) {
    entry = {
      streamIdB10,
      watchers: new Map(),
      seenIds: new Set(),
      users: new Map(),
      running: true,
      reconnectMs: 3000,
    };
    poolByStreamId.set(streamIdB10, entry);
    void runSseLoop(entry, hub);
    debugLog("rumble:sse", "started stream pool", { streamIdB10 });
  }
  return entry;
}

export function attachRumbleSseWatcher(
  workspaceId: string,
  slug: string,
  streamIdB10: number,
  hub: ChatHub,
): void {
  hubRef = hub;
  const key = watchKey(workspaceId, slug);
  let keys = workspaceWatchKeys.get(workspaceId);
  if (!keys) {
    keys = new Set();
    workspaceWatchKeys.set(workspaceId, keys);
  }
  keys.add(key);

  const entry = ensureStreamPool(streamIdB10, hub);
  entry.watchers.set(key, { workspaceId, slug });
}

export function detachRumbleSseWatcher(workspaceId: string, slug: string): void {
  const key = watchKey(workspaceId, slug);
  workspaceWatchKeys.get(workspaceId)?.delete(key);

  for (const entry of poolByStreamId.values()) {
    entry.watchers.delete(key);
    if (entry.watchers.size === 0) {
      entry.running = false;
      entry.abort?.abort();
      poolByStreamId.delete(entry.streamIdB10);
      debugLog("rumble:sse", "stopped stream pool", { streamId: entry.streamIdB10 });
    }
  }
}

export function stopRumbleSseForWorkspace(workspaceId: string): void {
  const keys = workspaceWatchKeys.get(workspaceId);
  if (!keys) return;
  for (const key of [...keys]) {
    const slug = key.slice(workspaceId.length + 1);
    detachRumbleSseWatcher(workspaceId, slug);
  }
  workspaceWatchKeys.delete(workspaceId);
}

export function getRumbleSseStatus(): {
  streams: {
    streamIdB10: number;
    watchers: Watcher[];
  }[];
} {
  return {
    streams: [...poolByStreamId.entries()].map(([streamIdB10, entry]) => ({
      streamIdB10,
      watchers: [...entry.watchers.values()],
    })),
  };
}

export function getActiveRumbleStreamIdForSlug(slug: string): number | undefined {
  const normalized = slug.toLowerCase();
  for (const entry of poolByStreamId.values()) {
    for (const watcher of entry.watchers.values()) {
      if (watcher.slug === normalized) return entry.streamIdB10;
    }
  }
  return undefined;
}

export function getRumbleSseHub(): ChatHub | null {
  return hubRef;
}
