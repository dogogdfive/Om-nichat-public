import type { ChatterEntry } from "./chatters.js";

const PRESENT_MS = 15 * 60 * 1000;

type TrackedChatter = ChatterEntry & { lastSeen: number };

const byChannel = new Map<string, Map<string, TrackedChatter>>();

function normalizeSlug(slug: string): string {
  return slug.replace(/^@/, "").toLowerCase();
}

/** Record a Kick user seen in chat (from live Pusher ingest). */
export function recordKickChatter(
  channelSlug: string,
  userId: string,
  login: string,
): void {
  const channel = normalizeSlug(channelSlug);
  const key = login.replace(/^@/, "").toLowerCase();
  if (!channel || !key) return;

  let chatters = byChannel.get(channel);
  if (!chatters) {
    chatters = new Map();
    byChannel.set(channel, chatters);
  }

  chatters.set(key, {
    userId: userId || key,
    login: login.replace(/^@/, ""),
    lastSeen: Date.now(),
  });
}

export function getKickChannelChatters(channelSlug: string): {
  chatters: ChatterEntry[];
  total: number;
} {
  const channel = normalizeSlug(channelSlug);
  const chatters = byChannel.get(channel);
  if (!chatters) return { chatters: [], total: 0 };

  const cutoff = Date.now() - PRESENT_MS;
  const active = [...chatters.values()]
    .filter((c) => c.lastSeen >= cutoff)
    .sort((a, b) => a.login.localeCompare(b.login, undefined, { sensitivity: "base" }));

  return {
    chatters: active.map(({ userId, login }) => ({ userId, login })),
    total: active.length,
  };
}
