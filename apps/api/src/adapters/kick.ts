import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type {
  ChatMessage,
  PinnedMessageEvent,
  PollEvent,
  StreamAlertEvent,
} from "@omnichat/chat-types";
import WebSocket from "ws";
import type { ChatHub } from "../hub.js";
import { ingestWithAutomod } from "../automod/pipeline.js";
import { getPlatformTokens } from "../db/repos.js";
import {
  ensureFreshAccessToken,
  forceRefreshAccessToken,
  RECONNECT_HINT,
} from "../auth/token-refresh.js";
import { getWatchedChannels } from "./watch-channels.js";
import {
  expandKickEmoteNames,
  parseKickEmoteContent,
} from "./kick-emotes.js";
import { enrichMessageEmotes } from "../emotes/workspace.js";
import { resolveKickUserId } from "../emotes/seventv.js";
import { recordKickChatter } from "../stream/kick-chatters.js";
import { recordError } from "../debug.js";
import { friendlyKickSendError } from "../chat/friendly-send-error.js";
import {
  parseKickGiftedSubscriptions,
  parseKickKicksGifted,
  parseKickSubscription,
  publishStreamAlert,
} from "../stream/stream-alerts.js";

const execFileAsync = promisify(execFile);

/** Close/terminate a WebSocket without triggering unhandled 'error' events. */
function safeDestroyWs(ws: WebSocket | null | undefined): void {
  if (!ws) return;
  ws.removeAllListeners();
  ws.on("error", () => {});
  try {
    if (ws.readyState === WebSocket.CONNECTING) ws.terminate();
    else if (ws.readyState === WebSocket.OPEN) ws.close();
  } catch (err) {
    recordError("kick:ws-cleanup", err);
  }
}

const PUSHER_URL =
  "wss://ws-us2.pusher.com/app/32cbd69e4b950bf97679?protocol=7&client=js&version=8.4.0&flash=false";
const CHAT_EVENT = "App\\Events\\ChatMessageEvent";
const POLL_UPDATE_EVENT = "App\\Events\\PollUpdateEvent";
const POLL_DELETE_EVENT = "App\\Events\\PollDeleteEvent";
const PINNED_CREATE_EVENT = "App\\Events\\PinnedMessageCreatedEvent";
const PINNED_DELETE_EVENT = "App\\Events\\PinnedMessageDeletedEvent";
const SUBSCRIPTION_EVENT = "App\\Events\\SubscriptionEvent";
const GIFTED_SUBS_EVENT = "App\\Events\\GiftedSubscriptionsEvent";
const KICKS_GIFTED_EVENT = "KicksGifted";
const CHROME_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

type KickPoolEntry = {
  ws: WebSocket | null;
  slug: string;
  chatroomId: number;
  workspaces: Set<string>;
  reconnectMs: number;
  reconnectTimer?: ReturnType<typeof setTimeout>;
};

const poolByChatroom = new Map<number, KickPoolEntry>();
/** Workspace → chatrooms currently subscribed for ingest */
const workspaceToChatrooms = new Map<string, Set<number>>();
const chatroomCache = new Map<string, number>();

export function getKickIngestStatus(): {
  connections: { chatroomId: number; slug: string; workspaces: string[]; connected: boolean }[];
} {
  return {
    connections: [...poolByChatroom.entries()].map(([chatroomId, entry]) => ({
      chatroomId,
      slug: entry.slug,
      workspaces: [...entry.workspaces],
      connected: entry.ws?.readyState === WebSocket.OPEN,
    })),
  };
}

function normalizeSlug(name: string): string {
  return name.replace(/^@/, "").toLowerCase();
}

async function curlKickV2(slug: string): Promise<{ chatroom?: { id?: number } } | null> {
  const url = `https://kick.com/api/v2/channels/${encodeURIComponent(slug)}`;
  const args = ["-s", "--max-time", "25", "-H", "Accept: application/json", "-H", `User-Agent: ${CHROME_UA}`, url];
  const curlBin = process.platform === "win32" ? "curl.exe" : "curl";
  const { stdout } = await execFileAsync(curlBin, args, { maxBuffer: 5 * 1024 * 1024 });
  return JSON.parse(stdout) as { chatroom?: { id?: number } };
}

async function fetchKickV2Channel(slug: string): Promise<{ chatroom?: { id?: number } } | null> {
  const url = `https://kick.com/api/v2/channels/${encodeURIComponent(slug)}`;
  try {
    const res = await fetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": CHROME_UA,
        Referer: `https://kick.com/${slug}`,
      },
    });
    if (res.ok) return (await res.json()) as { chatroom?: { id?: number } };
  } catch {
    /* fall through */
  }

  try {
    return await curlKickV2(slug);
  } catch (err) {
    console.warn(`[kick] chatroom curl lookup failed for ${slug}:`, err);
    return null;
  }
}

export async function resolveKickChatroomId(slug: string): Promise<number | null> {
  const normalized = normalizeSlug(slug);
  const cached = chatroomCache.get(normalized);
  if (cached) return cached;

  const json = await fetchKickV2Channel(normalized);
  const id = json?.chatroom?.id;
  if (!id) {
    console.warn(`[kick] chatroom not found for @${normalized}`);
    return null;
  }
  chatroomCache.set(normalized, id);
  return id;
}

function parseKickMessage(slug: string, payload: unknown): ChatMessage | null {
  const raw = payload as {
    id?: string | number;
    message_id?: string | number;
    content?: string;
    created_at?: string;
    sender?: { id?: number; username?: string; slug?: string };
  };
  const content = raw.content?.trim();
  if (!content) return null;
  const { text, emotes } = parseKickEmoteContent(content);
  if (!text && emotes.length === 0) return null;
  const displayText = text || emotes.map((e) => e.name).join(" ");
  const senderId = raw.sender?.id ?? "anon";
  const msgId =
    raw.id != null
      ? String(raw.id)
      : raw.message_id != null
        ? String(raw.message_id)
        : `${senderId}:${raw.created_at ?? ""}:${displayText}`;
  const username = raw.sender?.username ?? raw.sender?.slug ?? "unknown";
  recordKickChatter(slug, String(raw.sender?.id ?? username), username);
  return {
    id: `kick:${msgId}`,
    platform: "kick",
    platformMessageId: msgId,
    channelId: slug,
    author: {
      id: String(raw.sender?.id ?? "unknown"),
      displayName: username,
      username,
    },
    text: displayText,
    emotes,
    timestamp: new Date().toISOString(),
  };
}

function fanOutKickMessage(entry: KickPoolEntry, hub: ChatHub, chatMsg: ChatMessage) {
  for (const workspaceId of entry.workspaces) {
    void enrichMessageEmotes(workspaceId, chatMsg).then((enriched) =>
      ingestWithAutomod(workspaceId, enriched, hub),
    );
  }
}

function publishKickEvent(
  entry: KickPoolEntry,
  hub: ChatHub,
  event: Parameters<ChatHub["publish"]>[1],
) {
  for (const workspaceId of entry.workspaces) {
    hub.publish(`room:${workspaceId}`, event);
    hub.publish(`room:${workspaceId}:public`, event);
  }
}

function publishKickStreamAlert(entry: KickPoolEntry, hub: ChatHub, alert: StreamAlertEvent) {
  publishStreamAlert(hub, entry.workspaces, alert);
}

// Kick's unofficial Pusher poll payload:
//   { poll: { title, duration, result_display_duration,
//             options: [{ id, label, votes }], ... } }  (shape varies)
// We defensively read both `question`/`title` and `options`/`choices`.
function parseKickPoll(slug: string, payload: unknown): PollEvent | null {
  const raw = (payload ?? {}) as Record<string, unknown>;
  const poll = ((raw.poll ?? raw) as Record<string, unknown>) ?? {};
  const title =
    (poll.title as string) ?? (poll.question as string) ?? (raw.question as string) ?? "";
  const rawOptions =
    (poll.options as unknown[]) ?? (poll.choices as unknown[]) ?? (raw.options as unknown[]) ?? [];
  const choices = rawOptions.map((o, i) => {
    const opt = (o ?? {}) as Record<string, unknown>;
    return {
      id: String(opt.id ?? i),
      title: String(opt.label ?? opt.text ?? opt.title ?? ""),
      votes: Number(opt.votes ?? 0),
    };
  });
  if (choices.length === 0 && !title) return null;
  return {
    platform: "kick",
    channelId: slug,
    pollId: String(poll.id ?? raw.poll_id ?? `${slug}-poll`),
    title,
    choices,
    totalVotes: choices.reduce((sum, c) => sum + c.votes, 0),
    status: "active",
    timestamp: new Date().toISOString(),
  };
}

function parseKickPinned(slug: string, payload: unknown): PinnedMessageEvent | null {
  const raw = (payload ?? {}) as Record<string, unknown>;
  const message = ((raw.message ?? raw) as Record<string, unknown>) ?? {};
  const sender = (message.sender as Record<string, unknown>) ?? {};
  const content = (message.content as string) ?? (raw.content as string) ?? "";
  const { text, emotes } = parseKickEmoteContent(content);
  const displayText = text || emotes.map((e) => e.name).join(" ");
  if (!displayText) return null;
  const username =
    (sender.username as string) ?? (sender.slug as string) ?? "unknown";
  return {
    platform: "kick",
    channelId: slug,
    messageId: String(message.id ?? `${slug}-pinned`),
    text: displayText,
    author: { id: String(sender.id ?? ""), displayName: username },
    timestamp: new Date().toISOString(),
  };
}

function scheduleReconnect(entry: KickPoolEntry, hub: ChatHub) {
  if (entry.reconnectTimer) return;
  if (entry.workspaces.size === 0) return;
  const delay = Math.min(entry.reconnectMs, 60_000);
  entry.reconnectMs = Math.min(entry.reconnectMs * 2, 60_000);
  entry.reconnectTimer = setTimeout(() => {
    entry.reconnectTimer = undefined;
    void connectKickPusher(entry, hub);
  }, delay);
}

function connectKickPusher(entry: KickPoolEntry, hub: ChatHub): Promise<void> {
  if (entry.ws?.readyState === WebSocket.OPEN) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    safeDestroyWs(entry.ws);

    const ws = new WebSocket(PUSHER_URL);
    entry.ws = ws;

    const finish = () => resolve();

    ws.on("message", (raw) => {
      let msg: { event?: string; data?: string | unknown; channel?: string };
      try {
        msg = JSON.parse(String(raw));
      } catch {
        return;
      }

      if (msg.event === "pusher:connection_established") {
        entry.reconnectMs = 3000;
        ws.send(
          JSON.stringify({
            event: "pusher:subscribe",
            data: { auth: "", channel: `chatrooms.${entry.chatroomId}.v2` },
          }),
        );
        console.log(
          `[kick] Pusher chatrooms.${entry.chatroomId}.v2 (@${entry.slug}) → [${[...entry.workspaces].join(", ")}]`,
        );
        resolve();
        return;
      }

      const parseData = () =>
        typeof msg.data === "string" ? JSON.parse(msg.data) : msg.data;

      if (msg.event === CHAT_EVENT) {
        const chatMsg = parseKickMessage(entry.slug, parseData());
        if (chatMsg) fanOutKickMessage(entry, hub, chatMsg);
        return;
      }

      if (msg.event === POLL_UPDATE_EVENT) {
        const poll = parseKickPoll(entry.slug, parseData());
        if (poll) publishKickEvent(entry, hub, { type: "poll", poll });
        return;
      }

      if (msg.event === POLL_DELETE_EVENT) {
        publishKickEvent(entry, hub, {
          type: "poll_end",
          poll: {
            platform: "kick",
            channelId: entry.slug,
            pollId: "",
            title: "",
            choices: [],
            totalVotes: 0,
            status: "completed",
            timestamp: new Date().toISOString(),
          },
        });
        return;
      }

      if (msg.event === PINNED_CREATE_EVENT) {
        const pinned = parseKickPinned(entry.slug, parseData());
        if (pinned) publishKickEvent(entry, hub, { type: "pinned", pinned });
        return;
      }

      if (msg.event === PINNED_DELETE_EVENT) {
        publishKickEvent(entry, hub, {
          type: "pinned_clear",
          platform: "kick",
          channelId: entry.slug,
        });
        return;
      }

      if (msg.event === SUBSCRIPTION_EVENT) {
        const alert = parseKickSubscription(entry.slug, parseData());
        if (alert) publishKickStreamAlert(entry, hub, alert);
        return;
      }

      if (msg.event === GIFTED_SUBS_EVENT) {
        const alert = parseKickGiftedSubscriptions(entry.slug, parseData());
        if (alert) publishKickStreamAlert(entry, hub, alert);
        return;
      }

      if (msg.event === KICKS_GIFTED_EVENT) {
        const alert = parseKickKicksGifted(entry.slug, parseData());
        if (alert) publishKickStreamAlert(entry, hub, alert);
        return;
      }
    });

    ws.on("close", () => {
      console.warn(`[kick] Pusher disconnected (@${entry.slug})`);
      scheduleReconnect(entry, hub);
    });

    ws.on("error", (err) => {
      console.warn(`[kick] Pusher error (@${entry.slug}):`, err.message);
      recordError("kick:pusher", err, { slug: entry.slug, chatroomId: entry.chatroomId });
      finish();
    });
  });
}

function watchedKickSlugs(workspaceId: string): string[] {
  const set = new Set<string>();
  for (const ch of getWatchedChannels(workspaceId, "kick")) {
    const slug = normalizeSlug(ch);
    if (slug) set.add(slug);
  }
  return [...set];
}

async function attachWorkspaceToKickSlug(
  workspaceId: string,
  slug: string,
  hub: ChatHub,
): Promise<number | null> {
  const chatroomId = await resolveKickChatroomId(slug);
  if (!chatroomId) {
    console.warn(`[kick] skip @${slug} for ${workspaceId}: chatroom not found`);
    return null;
  }

  const existing = poolByChatroom.get(chatroomId);
  if (existing) {
    existing.workspaces.add(workspaceId);
    if (!existing.ws || existing.ws.readyState !== WebSocket.OPEN) {
      await connectKickPusher(existing, hub).catch((err) => {
        recordError("kick:connect", err, { slug, workspaceId });
      });
    }
    console.log(`[kick] workspace ${workspaceId} attached to Pusher (@${slug})`);
    return chatroomId;
  }

  const entry: KickPoolEntry = {
    ws: null,
    slug,
    chatroomId,
    workspaces: new Set([workspaceId]),
    reconnectMs: 3000,
  };
  poolByChatroom.set(chatroomId, entry);
  await connectKickPusher(entry, hub).catch((err) => {
    recordError("kick:connect", err, { slug, workspaceId });
  });
  return chatroomId;
}

export async function startKickIngest(workspaceId: string, hub: ChatHub): Promise<void> {
  const slugs = watchedKickSlugs(workspaceId);
  if (slugs.length === 0) {
    console.warn(`[kick] skip ingest ${workspaceId}: no watched kick channels`);
    detachWorkspaceFromKickChatrooms(workspaceId);
    return;
  }

  const previous = workspaceToChatrooms.get(workspaceId) ?? new Set<number>();
  const next = new Set<number>();

  const slugByChatroom = new Map<number, string>();
  for (const slug of slugs) {
    const chatroomId = await resolveKickChatroomId(slug);
    if (chatroomId != null) slugByChatroom.set(chatroomId, slug);
  }

  for (const [chatroomId, slug] of slugByChatroom) {
    const attached = await attachWorkspaceToKickSlug(workspaceId, slug, hub);
    if (attached != null) next.add(attached);
  }

  for (const chatroomId of previous) {
    if (next.has(chatroomId)) continue;
    const entry = poolByChatroom.get(chatroomId);
    if (!entry) continue;
    entry.workspaces.delete(workspaceId);
    if (entry.workspaces.size === 0) {
      if (entry.reconnectTimer) clearTimeout(entry.reconnectTimer);
      safeDestroyWs(entry.ws);
      entry.ws = null;
      poolByChatroom.delete(chatroomId);
      console.log(`[kick] Pusher stopped (@${entry.slug})`);
    }
  }

  workspaceToChatrooms.set(workspaceId, next);
}

function detachWorkspaceFromKickChatrooms(workspaceId: string): void {
  const chatrooms = workspaceToChatrooms.get(workspaceId);
  if (!chatrooms) return;
  for (const chatroomId of chatrooms) {
    const entry = poolByChatroom.get(chatroomId);
    if (!entry) continue;
    entry.workspaces.delete(workspaceId);
    if (entry.workspaces.size === 0) {
      if (entry.reconnectTimer) clearTimeout(entry.reconnectTimer);
      safeDestroyWs(entry.ws);
      entry.ws = null;
      poolByChatroom.delete(chatroomId);
      console.log(`[kick] Pusher stopped (@${entry.slug})`);
    }
  }
  workspaceToChatrooms.delete(workspaceId);
}

export function stopKickIngest(workspaceId: string): void {
  detachWorkspaceFromKickChatrooms(workspaceId);
}

export async function sendKickChat(
  workspaceId: string,
  content: string,
  targetChannel?: string,
): Promise<{ ok: boolean; error?: string }> {
  let accessToken = await ensureFreshAccessToken(workspaceId, "kick");
  let tokens = await getPlatformTokens(workspaceId, "kick");
  if (!accessToken || !tokens?.platformUserId) {
    return { ok: false, error: "kick not connected" };
  }

  const slug = (targetChannel ?? tokens.platformUsername ?? "global")
    .replace(/^@/, "")
    .toLowerCase();
  const outbound = await expandKickEmoteNames(slug, content);

  const broadcasterUserId = await resolveKickUserId(slug);
  if (!broadcasterUserId) {
    return { ok: false, error: `kick: unknown channel @${slug}` };
  }

  const trySend = async (token: string) => {
    const bodies: Record<string, unknown>[] = [
      {
        type: "user",
        broadcaster_user_id: Number(broadcasterUserId),
        content: outbound.slice(0, 500),
      },
      { type: "bot", content: outbound.slice(0, 500) },
    ];
    let saw401 = false;
    let saw403 = false;
    for (const body of bodies) {
      const res = await fetch("https://api.kick.com/public/v1/chat", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(body),
      });
      if (res.ok) return { ok: true as const };
      if (res.status === 401) {
        saw401 = true;
        continue;
      }
      if (res.status === 403) {
        saw403 = true;
        continue;
      }
      const text = await res.text().catch(() => "");
      return {
        ok: false as const,
        error: friendlyKickSendError(res.status, text, slug),
      };
    }
    if (saw401) return { ok: false as const, error: "kick unauthorized" };
    if (saw403) return { ok: false as const, error: friendlyKickSendError(403, "", slug) };
    return { ok: false as const, error: "kick send failed" };
  };

  let result = await trySend(accessToken);
  if (!result.ok && result.error === "kick unauthorized") {
    const refreshed = await forceRefreshAccessToken(workspaceId, "kick");
    if (refreshed) {
      tokens = await getPlatformTokens(workspaceId, "kick");
      result = await trySend(refreshed);
    }
  }

  if (result.ok) return { ok: true };
  const err = result.error ?? "kick send failed";
  if (err.includes("401") || err.includes("unauthorized")) {
    return { ok: false, error: `kick: missing chat:write or expired token. ${RECONNECT_HINT}` };
  }
  return { ok: false, error: err };
}
