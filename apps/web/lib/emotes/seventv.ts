import { apiFetch } from "@/lib/api";

export type EmoteProvider = "7tv" | "kick" | "twitch" | "emoji" | "emoji-web";

export type ResolvedEmote = {
  id: string;
  name: string;
  url: string;
  provider?: EmoteProvider;
};

export async function fetchGlobal7tvEmotes(): Promise<ResolvedEmote[]> {
  const res = await apiFetch("/api/emotes/7tv/global");
  if (!res.ok) return [];
  const json = (await res.json()) as { emotes?: ResolvedEmote[] };
  return json.emotes ?? [];
}

export async function fetch7tvEmotesForTwitchLogin(login: string): Promise<ResolvedEmote[]> {
  const res = await apiFetch(`/api/emotes/7tv/twitch/login/${encodeURIComponent(login)}`);
  if (!res.ok) return [];
  const json = (await res.json()) as { emotes?: ResolvedEmote[] };
  return json.emotes ?? [];
}

export async function fetch7tvEmotesForKickLogin(login: string): Promise<ResolvedEmote[]> {
  const res = await apiFetch(`/api/emotes/7tv/kick/login/${encodeURIComponent(login)}`);
  if (!res.ok) return [];
  const json = (await res.json()) as { emotes?: ResolvedEmote[] };
  return json.emotes ?? [];
}

export async function fetch7tvEmotesForWorkspace(workspaceId: string): Promise<ResolvedEmote[]> {
  const res = await apiFetch(`/api/emotes/7tv/workspace/${encodeURIComponent(workspaceId)}`);
  if (!res.ok) return [];
  const json = (await res.json()) as { emotes?: ResolvedEmote[] };
  return json.emotes ?? [];
}

/** @deprecated use fetch7tvEmotesForTwitchLogin */
export async function fetch7tvEmotesForTwitchId(_twitchId: string): Promise<ResolvedEmote[]> {
  return [];
}

/** @deprecated use fetch7tvEmotesForTwitchLogin */
export async function resolveTwitchUserId(_login: string): Promise<string | null> {
  return null;
}
