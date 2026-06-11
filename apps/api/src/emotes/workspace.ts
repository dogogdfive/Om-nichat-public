import type { ChatMessage } from "@omnichat/chat-types";
import { getKickEmotesByName, kickEmoteUrl } from "../adapters/kick-emotes.js";
import { getWatchedChannels } from "../adapters/watch-channels.js";
import { fetch7tvEmotesForWorkspace, type ResolvedEmote } from "./seventv.js";

export type EmoteProvider = "7tv" | "kick";

export type WorkspaceEmote = ResolvedEmote & {
  provider?: EmoteProvider;
};

const CACHE_TTL_MS = 5 * 60 * 1000;
const emoteCache = new Map<
  string,
  { at: number; list: WorkspaceEmote[]; byName: Map<string, ResolvedEmote> }
>();

export function invalidateWorkspaceEmoteCache(workspaceId: string): void {
  emoteCache.delete(workspaceId);
}

async function buildWorkspaceEmoteList(workspaceId: string): Promise<WorkspaceEmote[]> {
  const merged: WorkspaceEmote[] = [];
  const seen = new Set<string>();

  const add = (list: WorkspaceEmote[]) => {
    for (const e of list) {
      const key = e.name.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(e);
    }
  };

  add((await fetch7tvEmotesForWorkspace(workspaceId)).map((e) => ({ ...e, provider: "7tv" as const })));

  const slugs = new Set<string>();
  for (const slug of getWatchedChannels(workspaceId, "kick")) {
    slugs.add(slug);
  }

  for (const slug of slugs) {
    const byName = await getKickEmotesByName(slug);
    add(
      [...byName.values()].map((row) => ({
        id: String(row.id),
        name: row.name,
        url: kickEmoteUrl(row.id),
        provider: "kick" as const,
      })),
    );
  }

  return merged;
}

export async function getWorkspaceEmoteMap(
  workspaceId: string,
): Promise<Map<string, ResolvedEmote>> {
  const hit = emoteCache.get(workspaceId);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.byName;

  const list = await buildWorkspaceEmoteList(workspaceId);
  const byName = emotesByName(list);
  emoteCache.set(workspaceId, { at: Date.now(), list, byName });
  return byName;
}

export async function fetchAllEmotesForWorkspace(workspaceId: string): Promise<WorkspaceEmote[]> {
  const hit = emoteCache.get(workspaceId);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.list;
  await getWorkspaceEmoteMap(workspaceId);
  return emoteCache.get(workspaceId)!.list;
}

export function emotesByName(emotes: ResolvedEmote[]): Map<string, ResolvedEmote> {
  const map = new Map<string, ResolvedEmote>();
  for (const e of emotes) {
    map.set(e.name, e);
    map.set(e.name.toLowerCase(), e);
  }
  return map;
}

export function resolveEmotesInText(
  text: string,
  byName: Map<string, ResolvedEmote>,
): { text: string; emotes: { id: string; name: string; url: string; start: number; end: number }[] } {
  const emotes: { id: string; name: string; url: string; start: number; end: number }[] = [];
  let display = "";
  let pos = 0;

  for (const part of text.split(/(\s+)/)) {
    if (/^\s+$/.test(part)) {
      display += part;
      pos += part.length;
      continue;
    }
    const stripped = part.replace(/^[^\w]+|[^\w]+$/g, "");
    const emote =
      byName.get(part) ??
      byName.get(part.toLowerCase()) ??
      (stripped ? (byName.get(stripped) ?? byName.get(stripped.toLowerCase())) : undefined);

    const start = pos;
    display += part;
    pos += part.length;

    if (emote) {
      emotes.push({
        id: emote.id,
        name: emote.name,
        url: emote.url,
        start,
        end: pos,
      });
    }
  }

  return { text: display, emotes };
}

export function filterEmotes(emotes: WorkspaceEmote[], query: string, limit = 80): WorkspaceEmote[] {
  const q = query.replace(/^:/, "").trim().toLowerCase();
  if (!q) return emotes.slice(0, limit);
  const matches = emotes.filter((e) => e.name.toLowerCase().includes(q));
  matches.sort((a, b) => {
    const al = a.name.toLowerCase();
    const bl = b.name.toLowerCase();
    const aStarts = al.startsWith(q) ? 0 : 1;
    const bStarts = bl.startsWith(q) ? 0 : 1;
    if (aStarts !== bStarts) return aStarts - bStarts;
    return al.localeCompare(bl);
  });
  return matches.slice(0, limit);
}

export async function enrichMessageEmotes(
  workspaceId: string,
  msg: ChatMessage,
): Promise<ChatMessage> {
  const byName = await getWorkspaceEmoteMap(workspaceId);
  const { emotes: resolved } = resolveEmotesInText(msg.text, byName);
  if (resolved.length === 0) return msg;
  const existing = msg.emotes ?? [];
  const seen = new Set(existing.map((e) => `${e.start}:${e.name}`));
  const merged = [...existing];
  for (const e of resolved) {
    const key = `${e.start}:${e.name}`;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(e);
  }
  return { ...msg, emotes: merged };
}

export async function searchWorkspaceEmotes(
  workspaceId: string,
  query: string,
  limit = 80,
): Promise<WorkspaceEmote[]> {
  const list = await fetchAllEmotesForWorkspace(workspaceId);
  return filterEmotes(list, query, limit);
}

export async function searchChannelEmotes(
  platform: "twitch" | "kick",
  login: string,
  query: string,
  limit = 80,
): Promise<ResolvedEmote[]> {
  const { fetch7tvEmotesForTwitchLogin, fetch7tvEmotesForKickLogin } = await import("./seventv.js");
  const list =
    platform === "kick"
      ? await fetch7tvEmotesForKickLogin(login)
      : await fetch7tvEmotesForTwitchLogin(login);
  return filterEmotes(list, query, limit);
}
