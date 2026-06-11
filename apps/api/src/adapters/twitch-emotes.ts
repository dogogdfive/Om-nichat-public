import { readEnv } from "../env.js";
import { resolveTwitchUserId } from "../emotes/seventv.js";
import { getTwitchAppToken } from "./twitch-badges.js";

export type TwitchResolvedEmote = {
  id: string;
  name: string;
  url: string;
};

type HelixEmote = {
  id: string;
  name: string;
  images?: {
    url_2x?: string;
    url_4x?: string;
    url_1x?: string;
  };
};

const CACHE_MS = 10 * 60 * 1000;
const globalCache = { at: 0, emotes: [] as TwitchResolvedEmote[] };
const channelCache = new Map<string, { at: number; emotes: TwitchResolvedEmote[] }>();

function helixHeaders(token: string) {
  const clientId = readEnv("TWITCH_CLIENT_ID") ?? "";
  return {
    Authorization: `Bearer ${token}`,
    "Client-Id": clientId,
  };
}

function mapHelixEmotes(rows: HelixEmote[]): TwitchResolvedEmote[] {
  return rows.map((e) => ({
    id: e.id,
    name: e.name,
    url: e.images?.url_2x ?? e.images?.url_4x ?? e.images?.url_1x ?? "",
  })).filter((e) => e.url);
}

async function fetchHelixEmotes(url: string): Promise<TwitchResolvedEmote[]> {
  const token = await getTwitchAppToken();
  if (!token) return [];
  const res = await fetch(url, { headers: helixHeaders(token) });
  if (!res.ok) return [];
  const json = (await res.json()) as { data?: HelixEmote[] };
  return mapHelixEmotes(json.data ?? []);
}

export async function fetchTwitchGlobalEmotes(): Promise<TwitchResolvedEmote[]> {
  if (globalCache.emotes.length > 0 && Date.now() - globalCache.at < CACHE_MS) {
    return globalCache.emotes;
  }
  const emotes = await fetchHelixEmotes("https://api.twitch.tv/helix/chat/emotes/global");
  globalCache.at = Date.now();
  globalCache.emotes = emotes;
  return emotes;
}

export async function fetchTwitchChannelEmotes(login: string): Promise<TwitchResolvedEmote[]> {
  const normalized = login.replace(/^@/, "").toLowerCase();
  const cached = channelCache.get(normalized);
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.emotes;

  const global = await fetchTwitchGlobalEmotes();
  let channel: TwitchResolvedEmote[] = [];

  const broadcasterId = await resolveTwitchUserId(normalized);
  if (broadcasterId) {
    channel = await fetchHelixEmotes(
      `https://api.twitch.tv/helix/chat/emotes/channel?broadcaster_id=${encodeURIComponent(broadcasterId)}`,
    );
  }

  const seen = new Set<string>();
  const merged: TwitchResolvedEmote[] = [];
  for (const e of [...channel, ...global]) {
    const key = e.name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(e);
  }

  channelCache.set(normalized, { at: Date.now(), emotes: merged });
  return merged;
}
