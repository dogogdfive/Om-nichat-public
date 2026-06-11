import type { ResolvedEmote } from "@/lib/emotes/seventv";

const KEY = "omnichat-emote-recent";
const MAX = 24;

function storageKey(workspaceId: string) {
  return `${KEY}:${workspaceId}`;
}

export function loadRecentEmotes(workspaceId: string | null | undefined): ResolvedEmote[] {
  if (!workspaceId || typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(storageKey(workspaceId));
    if (!raw) return [];
    const list = JSON.parse(raw) as ResolvedEmote[];
    return Array.isArray(list) ? list.filter((e) => e?.name) : [];
  } catch {
    return [];
  }
}

export function pushRecentEmote(
  workspaceId: string,
  emote: ResolvedEmote,
): ResolvedEmote[] {
  const key = emote.name.toLowerCase();
  const prev = loadRecentEmotes(workspaceId).filter((e) => e.name.toLowerCase() !== key);
  const next = [{ ...emote }, ...prev].slice(0, MAX);
  localStorage.setItem(storageKey(workspaceId), JSON.stringify(next));
  return next;
}
