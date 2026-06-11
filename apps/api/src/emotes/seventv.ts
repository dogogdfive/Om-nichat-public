import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import type { Platform } from "@omnichat/chat-types";
import { getWatchedChannels } from "../adapters/watch-channels.js";
import { readEmoteCache, readEmoteCacheEntry, writeEmoteCache } from "./emote-store.js";

const execFileAsync = promisify(execFile);
const CHROME_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const GQL_URL = "https://7tv.io/v3/gql";

export type ResolvedEmote = {
  id: string;
  name: string;
  url: string;
};

type SevenTvEmote = {
  id?: string;
  name?: string;
};

type SevenTvEmoteSet = {
  emotes?: SevenTvEmote[];
};

type SevenTvConnection = {
  platform?: string;
  emote_set?: SevenTvEmoteSet;
};

type SevenTvUser = {
  emote_set?: SevenTvEmoteSet;
  connections?: SevenTvConnection[];
};

type GqlEmote = {
  id?: string;
  name?: string;
  data?: { host?: { url?: string } };
};

const CACHE_MS = 10 * 60 * 1000;
/** Fresh disk cache — served without hitting 7TV. */
const DISK_TTL_MS = 60 * 60 * 1000;
/** Stale disk cache — served instantly while a background refresh runs. */
const DISK_STALE_MS = 7 * 24 * 60 * 60 * 1000;
const cache = new Map<string, { at: number; emotes: ResolvedEmote[] }>();

const USER_EMOTES_QUERY = `query UserEmotes($platform: ConnectionPlatform!, $id: String!) {
  user: userByConnection(platform: $platform, id: $id) {
    emote_sets {
      emotes {
        id
        name
        data { host { url } }
      }
    }
  }
}`;

const GLOBAL_EMOTES_QUERY = `query {
  set: namedEmoteSet(name: GLOBAL) {
    emotes {
      id
      name
      data { host { url } }
    }
  }
}`;

function emoteUrl(id: string): string {
  return `https://cdn.7tv.app/emote/${id}/2x.webp`;
}

function normalizeHostUrl(hostUrl: string | undefined, id: string): string {
  if (!hostUrl) return emoteUrl(id);
  let url = hostUrl.startsWith("//") ? `https:${hostUrl}` : hostUrl;
  if (!/\/[123]x\./.test(url)) {
    url = `${url.replace(/\/$/, "")}/2x.webp`;
  } else {
    url = url.replace(/\/1x\./, "/2x.");
  }
  return url;
}

function collectGqlEmotes(sets: { emotes?: GqlEmote[] }[] | undefined, out: ResolvedEmote[], seen: Set<string>) {
  for (const set of sets ?? []) {
    for (const e of set.emotes ?? []) {
      if (!e.id || !e.name || seen.has(e.name)) continue;
      seen.add(e.name);
      out.push({
        id: e.id,
        name: e.name,
        url: normalizeHostUrl(e.data?.host?.url, e.id),
      });
    }
  }
}

function collectFromSet(
  set: SevenTvEmoteSet | undefined,
  out: ResolvedEmote[],
  seen: Set<string>,
) {
  for (const e of set?.emotes ?? []) {
    if (!e.id || !e.name || seen.has(e.name)) continue;
    seen.add(e.name);
    out.push({ id: e.id, name: e.name, url: emoteUrl(e.id) });
  }
}

function parseSevenTvUser(json: SevenTvUser, platform?: Platform): ResolvedEmote[] {
  const out: ResolvedEmote[] = [];
  const seen = new Set<string>();
  collectFromSet(json.emote_set, out, seen);

  const want = platform?.toUpperCase();
  for (const conn of json.connections ?? []) {
    if (want && conn.platform && conn.platform.toUpperCase() !== want) continue;
    collectFromSet(conn.emote_set, out, seen);
  }
  return out;
}

function gqlPlatform(platform: Platform): string {
  if (platform === "twitch") return "TWITCH";
  if (platform === "kick") return "KICK";
  return platform.toUpperCase();
}

async function curlJson(url: string): Promise<unknown> {
  const { stdout } = await execFileAsync(
    "curl.exe",
    ["-s", "--max-time", "25", "-H", "Accept: application/json", "-H", `User-Agent: ${CHROME_UA}`, url],
    { maxBuffer: 12 * 1024 * 1024 },
  );
  return JSON.parse(stdout);
}

async function curlPostJson(url: string, body: unknown): Promise<unknown> {
  const path = join(tmpdir(), `7tv-${randomUUID()}.json`);
  await writeFile(path, JSON.stringify(body), "utf8");
  try {
    const { stdout } = await execFileAsync(
      "curl.exe",
      [
        "-s",
        "--max-time",
        "30",
        "-X",
        "POST",
        url,
        "-H",
        "Content-Type: application/json",
        "-H",
        `User-Agent: ${CHROME_UA}`,
        "-d",
        `@${path}`,
      ],
      { maxBuffer: 12 * 1024 * 1024 },
    );
    return JSON.parse(stdout);
  } finally {
    await unlink(path).catch(() => {});
  }
}

async function fetchJson(url: string): Promise<unknown | null> {
  try {
    const res = await fetch(url, {
      headers: { Accept: "application/json", "User-Agent": CHROME_UA },
    });
    if (res.ok) return res.json();
  } catch {
    /* fall through */
  }
  try {
    return await curlJson(url);
  } catch (err) {
    console.warn("[7tv] fetch failed:", url, err);
    return null;
  }
}

async function gql7tv<T>(query: string, variables?: Record<string, unknown>): Promise<T | null> {
  const body = { query, variables };

  for (let attempt = 0; attempt < 6; attempt++) {
    try {
      const res = await fetch(GQL_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          "User-Agent": CHROME_UA,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(10_000),
      });
      const text = await res.text();
      if (!text.startsWith("{")) throw new Error(`non-json response (${res.status})`);
      const json = JSON.parse(text) as { data?: T; errors?: { message?: string }[] };
      if (json.errors?.length) {
        console.warn("[7tv] gql errors:", json.errors.map((e) => e.message).join("; "));
        return null;
      }
      return json.data ?? null;
    } catch (fetchErr) {
      if (attempt === 5) {
        try {
          const json = (await curlPostJson(GQL_URL, body)) as {
            data?: T;
            errors?: { message?: string }[];
          };
          if (json.errors?.length) return null;
          return json.data ?? null;
        } catch {
          console.warn("[7tv] gql failed after retries:", fetchErr);
          return null;
        }
      }
      await new Promise((r) => setTimeout(r, 350 * (attempt + 1)));
    }
  }
  return null;
}

async function fetch7tvEmotesViaGql(platform: Platform, userId: string): Promise<ResolvedEmote[]> {
  const data = await gql7tv<{ user?: { emote_sets?: { emotes?: GqlEmote[] }[] } }>(
    USER_EMOTES_QUERY,
    { platform: gqlPlatform(platform), id: userId },
  );
  const out: ResolvedEmote[] = [];
  const seen = new Set<string>();
  collectGqlEmotes(data?.user?.emote_sets, out, seen);
  return out;
}

async function fetchGlobal7tvEmotesViaGql(): Promise<ResolvedEmote[]> {
  const data = await gql7tv<{ set?: { emotes?: GqlEmote[] } }>(GLOBAL_EMOTES_QUERY);
  const out: ResolvedEmote[] = [];
  const seen = new Set<string>();
  collectGqlEmotes(data?.set ? [data.set] : undefined, out, seen);
  return out;
}

async function cached(key: string, loader: () => Promise<ResolvedEmote[]>): Promise<ResolvedEmote[]> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.emotes;

  const freshDisk = readEmoteCache(key, DISK_TTL_MS);
  if (freshDisk?.length) {
    cache.set(key, { at: Date.now(), emotes: freshDisk });
    return freshDisk;
  }

  const persist = (emotes: ResolvedEmote[]) => {
    if (emotes.length > 0) {
      cache.set(key, { at: Date.now(), emotes });
      writeEmoteCache(key, emotes);
    }
    return emotes;
  };

  const staleEntry = readEmoteCacheEntry(key);
  const stale =
    staleEntry?.emotes?.length && Date.now() - staleEntry.at < DISK_STALE_MS
      ? staleEntry.emotes
      : null;

  if (stale?.length) {
    cache.set(key, { at: staleEntry!.at, emotes: stale });
    void loader().then(persist).catch((err) => console.warn("[7tv] background refresh failed:", key, err));
    return stale;
  }

  return persist(await loader());
}

export async function pullGlobal7tvEmotes(): Promise<ResolvedEmote[]> {
  return cached("global", async () => {
    const gql = await fetchGlobal7tvEmotesViaGql();
    if (gql.length > 0) return gql;

    const json = (await fetchJson("https://7tv.io/v3/emote-sets/global")) as SevenTvEmoteSet | null;
    const out: ResolvedEmote[] = [];
    const seen = new Set<string>();
    collectFromSet(json ?? undefined, out, seen);
    return out;
  });
}

export async function fetchGlobal7tvEmotes(): Promise<ResolvedEmote[]> {
  const mirrored = readEmoteCache("mirror:global", DISK_STALE_MS);
  if (mirrored?.length) return mirrored;
  return pullGlobal7tvEmotes();
}

export async function pull7tvEmotesForPlatformUser(
  platform: Platform,
  userId: string,
): Promise<ResolvedEmote[]> {
  const key = `${platform}:${userId}`;
  return cached(key, async () => {
    const gql = await fetch7tvEmotesViaGql(platform, userId);
    if (gql.length > 0) return gql;

    const json = (await fetchJson(
      `https://7tv.io/v3/users/${platform}/${encodeURIComponent(userId)}`,
    )) as SevenTvUser | null;
    if (!json) return [];
    return parseSevenTvUser(json, platform);
  });
}

export async function fetch7tvEmotesForPlatformUser(
  platform: Platform,
  userId: string,
): Promise<ResolvedEmote[]> {
  const mirrored = readEmoteCache(`mirror:${platform}:id:${userId}`, DISK_STALE_MS);
  if (mirrored?.length) return mirrored;
  return pull7tvEmotesForPlatformUser(platform, userId);
}

export async function resolveTwitchUserId(login: string): Promise<string | null> {
  const normalized = login.replace(/^@/, "").toLowerCase();
  if (!normalized) return null;
  const json = (await fetchJson(
    `https://api.ivr.fi/v2/twitch/user?login=${encodeURIComponent(normalized)}`,
  )) as { id?: string }[] | null;
  if (!Array.isArray(json)) return null;
  return json[0]?.id ?? null;
}

export async function resolveKickUserId(slug: string): Promise<string | null> {
  const normalized = slug.replace(/^@/, "").toLowerCase();
  if (!normalized) return null;
  const json = (await fetchJson(
    `https://kick.com/api/v2/channels/${encodeURIComponent(normalized)}`,
  )) as { user?: { id?: number }; user_id?: number } | null;
  if (!json) return null;
  const id = json.user?.id ?? json.user_id;
  return id != null ? String(id) : null;
}

export async function fetch7tvEmotesForTwitchLogin(login: string): Promise<ResolvedEmote[]> {
  const normalized = login.replace(/^@/, "").toLowerCase();
  const mirrored = readEmoteCache(`mirror:twitch:${normalized}`, DISK_STALE_MS);
  if (mirrored?.length) return mirrored;

  const twitchId = await resolveTwitchUserId(normalized);
  if (!twitchId) return [];
  return fetch7tvEmotesForPlatformUser("twitch", twitchId);
}

export async function fetch7tvEmotesForKickLogin(login: string): Promise<ResolvedEmote[]> {
  const normalized = login.replace(/^@/, "").toLowerCase();
  const mirrored = readEmoteCache(`mirror:kick:${normalized}`, DISK_STALE_MS);
  if (mirrored?.length) return mirrored;

  const kickId = await resolveKickUserId(normalized);
  if (!kickId) return [];
  return fetch7tvEmotesForPlatformUser("kick", kickId);
}

/** Unique twitch+kick lookups for each streamer slug (7TV sets often live on Twitch only). */
export function sevenTvLookupTargets(logins: Iterable<string>): Array<{ platform: "twitch" | "kick"; login: string }> {
  const seen = new Set<string>();
  const out: Array<{ platform: "twitch" | "kick"; login: string }> = [];
  const add = (platform: "twitch" | "kick", login: string) => {
    const normalized = login.replace(/^@/, "").toLowerCase();
    if (!normalized) return;
    const key = `${platform}:${normalized}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ platform, login: normalized });
  };
  for (const raw of logins) {
    const login = raw.replace(/^@/, "").toLowerCase();
    if (!login) continue;
    add("twitch", login);
    add("kick", login);
  }
  return out;
}

/** Primary platform lookup, then the other platform if empty (Kick watch → Twitch 7TV). */
export async function fetch7tvEmotesForChannelLogin(
  platform: "twitch" | "kick",
  login: string,
): Promise<ResolvedEmote[]> {
  const normalized = login.replace(/^@/, "").toLowerCase();
  const primary =
    platform === "twitch"
      ? await fetch7tvEmotesForTwitchLogin(normalized)
      : await fetch7tvEmotesForKickLogin(normalized);
  if (primary.length > 0) return primary;
  return platform === "kick"
    ? fetch7tvEmotesForTwitchLogin(normalized)
    : fetch7tvEmotesForKickLogin(normalized);
}

export async function fetch7tvEmotesForWorkspace(workspaceId: string): Promise<ResolvedEmote[]> {
  return cached(`workspace:${workspaceId}`, async () => {
    const merged: ResolvedEmote[] = [];
    const seen = new Set<string>();
    const add = (list: ResolvedEmote[]) => {
      for (const e of list) {
        if (seen.has(e.name)) continue;
        seen.add(e.name);
        merged.push(e);
      }
    };

    const loads: Promise<ResolvedEmote[]>[] = [fetchGlobal7tvEmotes()];

    const slugs = new Set<string>();
    for (const login of getWatchedChannels(workspaceId, "twitch")) slugs.add(login);
    for (const slug of getWatchedChannels(workspaceId, "kick")) slugs.add(slug);

    for (const { platform, login } of sevenTvLookupTargets(slugs)) {
      loads.push(fetch7tvEmotesForChannelLogin(platform, login));
    }

    const results = await Promise.all(loads);
    for (const list of results) add(list);

    return merged;
  });
}
