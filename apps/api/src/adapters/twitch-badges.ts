import { readEnv } from "../env.js";
import { resolveTwitchUserId } from "../emotes/seventv.js";

export type ResolvedBadge = {
  url: string;
  title?: string;
};

type BadgeVersion = {
  id: string;
  image_url_2x?: string;
  image_url_4x?: string;
  title?: string;
};

type BadgeSet = {
  set_id: string;
  versions: BadgeVersion[];
};

const CACHE_MS = 10 * 60 * 1000;

let globalCache: { at: number; bySet: Map<string, Map<string, ResolvedBadge>> } | null = null;
const channelCache = new Map<string, { at: number; bySet: Map<string, Map<string, ResolvedBadge>> }>();

let appToken: { token: string; exp: number } | null = null;

export async function getTwitchAppToken(): Promise<string | null> {
  const clientId = readEnv("TWITCH_CLIENT_ID");
  const clientSecret = readEnv("TWITCH_CLIENT_SECRET");
  if (!clientId || !clientSecret) return null;
  if (appToken && appToken.exp > Date.now()) return appToken.token;
  const res = await fetch("https://id.twitch.tv/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "client_credentials",
    }),
  });
  if (!res.ok) return null;
  const json = (await res.json()) as { access_token: string; expires_in: number };
  appToken = {
    token: json.access_token,
    exp: Date.now() + (json.expires_in - 60) * 1000,
  };
  return json.access_token;
}

function indexSets(sets: BadgeSet[]): Map<string, Map<string, ResolvedBadge>> {
  const bySet = new Map<string, Map<string, ResolvedBadge>>();
  for (const set of sets) {
    const key = set.set_id.toLowerCase();
    const versions = new Map<string, ResolvedBadge>();
    for (const v of set.versions ?? []) {
      const url = v.image_url_2x ?? v.image_url_4x;
      if (!url) continue;
      versions.set(v.id, { url, title: v.title });
    }
    if (versions.size > 0) bySet.set(key, versions);
  }
  return bySet;
}

async function fetchHelixBadgeSets(url: string, token: string): Promise<BadgeSet[]> {
  const clientId = readEnv("TWITCH_CLIENT_ID");
  if (!clientId) return [];
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      "Client-Id": clientId,
    },
  });
  if (!res.ok) return [];
  const json = (await res.json()) as { data?: BadgeSet[] };
  return json.data ?? [];
}

async function loadGlobalBadges(): Promise<Map<string, Map<string, ResolvedBadge>>> {
  if (globalCache && Date.now() - globalCache.at < CACHE_MS) return globalCache.bySet;
  const token = await getTwitchAppToken();
  if (!token) return globalCache?.bySet ?? new Map();
  const sets = await fetchHelixBadgeSets("https://api.twitch.tv/helix/chat/badges/global", token);
  const bySet = indexSets(sets);
  globalCache = { at: Date.now(), bySet };
  return bySet;
}

async function loadChannelBadges(
  channelLogin: string,
): Promise<Map<string, Map<string, ResolvedBadge>>> {
  const key = channelLogin.toLowerCase();
  const hit = channelCache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.bySet;

  const token = await getTwitchAppToken();
  if (!token) return hit?.bySet ?? new Map();

  const broadcasterId = await resolveTwitchUserId(key);
  if (!broadcasterId) return hit?.bySet ?? new Map();

  const global = await loadGlobalBadges();
  const channelSets = await fetchHelixBadgeSets(
    `https://api.twitch.tv/helix/chat/badges?broadcaster_id=${encodeURIComponent(broadcasterId)}`,
    token,
  );
  const merged = new Map(global);
  for (const [setId, versions] of indexSets(channelSets)) {
    merged.set(setId, versions);
  }
  channelCache.set(key, { at: Date.now(), bySet: merged });
  return merged;
}

export function parseBadgeTags(
  badges?: string | Record<string, string>,
): { setId: string; version: string }[] {
  if (!badges) return [];
  if (typeof badges === "object") {
    return Object.entries(badges).map(([setId, version]) => ({
      setId: setId.toLowerCase(),
      version: String(version),
    }));
  }
  return badges
    .split(",")
    .map((part) => {
      const [setId, version = "1"] = part.split("/");
      return setId ? { setId: setId.toLowerCase(), version } : null;
    })
    .filter((x): x is { setId: string; version: string } => x != null);
}

export async function prefetchTwitchBadges(channelLogin: string): Promise<void> {
  await loadChannelBadges(channelLogin.replace(/^#/, "").toLowerCase());
}

export function resolveTwitchBadges(
  channelLogin: string,
  badges?: string | Record<string, string>,
): ResolvedBadge[] {
  const key = channelLogin.replace(/^#/, "").toLowerCase();
  const cache = channelCache.get(key)?.bySet ?? globalCache?.bySet;
  if (!cache) return [];

  const out: ResolvedBadge[] = [];
  for (const { setId, version } of parseBadgeTags(badges)) {
    const versions = cache.get(setId);
    const badge = versions?.get(version) ?? versions?.get("1");
    if (badge) out.push(badge);
  }
  return out;
}

/** Warm global badge cache at startup. */
export function warmTwitchGlobalBadges(): void {
  void loadGlobalBadges();
}
