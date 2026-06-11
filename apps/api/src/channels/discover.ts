import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { Platform } from "@omnichat/chat-types";
import { getTwitchAppToken } from "../adapters/twitch-badges.js";
import {
  normalizeYoutubeChannelHandle,
  probeYoutubeChannelLive,
} from "../adapters/youtube.js";
import { ensureFreshAccessToken } from "../auth/token-refresh.js";
import { readEnv } from "../env.js";

const execFileAsync = promisify(execFile);

const CHROME_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

const DISCOVER_PLATFORMS = ["twitch", "kick", "youtube", "x"] as const;
export type DiscoverPlatform = (typeof DISCOVER_PLATFORMS)[number];

export type DiscoveredChannel = {
  platform: DiscoverPlatform;
  handle: string;
  exists: boolean;
  isLive: boolean;
  displayName?: string;
  viewers?: number | null;
  title?: string;
};

export type ChannelDiscoveryResult = {
  seed: { platform: DiscoverPlatform; handle: string };
  candidates: string[];
  channels: DiscoveredChannel[];
  live: DiscoveredChannel[];
};

function normalizeHandle(value: string): string {
  return value.replace(/^@/, "").replace(/\s+/g, "").toLowerCase();
}

function channelKey(platform: string, handle: string): string {
  return `${platform}:${normalizeHandle(handle)}`;
}

export function buildHandleCandidates(handle: string): string[] {
  const base = normalizeHandle(handle);
  const seen = new Set<string>();
  const add = (value: string) => {
    const n = normalizeHandle(value);
    if (n.length >= 2) seen.add(n);
  };
  add(base);
  add(handle.replace(/\s+/g, "_"));
  return [...seen];
}

async function lookupTwitchAliases(candidates: string[]): Promise<string[]> {
  const token = await getTwitchAppToken();
  const clientId = readEnv("TWITCH_CLIENT_ID");
  if (!token || !clientId) return candidates;

  const out = new Set(candidates);
  for (const login of candidates.slice(0, 5)) {
    const res = await fetch(
      `https://api.twitch.tv/helix/users?login=${encodeURIComponent(login)}`,
      { headers: { Authorization: `Bearer ${token}`, "Client-Id": clientId } },
    );
    if (!res.ok) continue;
    const json = (await res.json()) as {
      data?: { login: string; display_name: string }[];
    };
    const user = json.data?.[0];
    if (!user) continue;
    out.add(user.login.toLowerCase());
    out.add(normalizeHandle(user.display_name));
  }
  return [...out];
}

async function probeTwitch(candidates: string[]): Promise<DiscoveredChannel | null> {
  const token = await getTwitchAppToken();
  const clientId = readEnv("TWITCH_CLIENT_ID");
  if (!token || !clientId) return null;

  for (const login of candidates) {
    const userRes = await fetch(
      `https://api.twitch.tv/helix/users?login=${encodeURIComponent(login)}`,
      { headers: { Authorization: `Bearer ${token}`, "Client-Id": clientId } },
    );
    if (!userRes.ok) continue;
    const userJson = (await userRes.json()) as {
      data?: { id: string; login: string; display_name: string }[];
    };
    const user = userJson.data?.[0];
    if (!user) continue;

    const streamRes = await fetch(
      `https://api.twitch.tv/helix/streams?user_id=${encodeURIComponent(user.id)}`,
      { headers: { Authorization: `Bearer ${token}`, "Client-Id": clientId } },
    );
    const streamJson = streamRes.ok
      ? ((await streamRes.json()) as {
          data?: { viewer_count: number; title: string }[];
        })
      : { data: [] };
    const stream = streamJson.data?.[0];

    return {
      platform: "twitch",
      handle: user.login,
      exists: true,
      isLive: Boolean(stream),
      displayName: user.display_name,
      viewers: stream?.viewer_count ?? null,
      title: stream?.title,
    };
  }
  return null;
}

type KickChannelPayload = {
  slug?: string;
  user?: { username?: string };
  livestream?: { viewer_count?: number; session_title?: string; is_live?: boolean } | null;
  chatroom?: { id?: number };
};

async function curlKickChannel(slug: string): Promise<KickChannelPayload | null> {
  const url = `https://kick.com/api/v2/channels/${encodeURIComponent(slug)}`;
  const args = ["-s", "-H", "Accept: application/json", "-H", `User-Agent: ${CHROME_UA}`, url];
  const { stdout } = await execFileAsync("curl.exe", args, { maxBuffer: 5 * 1024 * 1024 });
  return JSON.parse(stdout) as KickChannelPayload;
}

async function fetchKickChannel(slug: string): Promise<KickChannelPayload | null> {
  const login = normalizeHandle(slug);
  const url = `https://kick.com/api/v2/channels/${encodeURIComponent(login)}`;
  try {
    const res = await fetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": CHROME_UA,
        Referer: `https://kick.com/${login}`,
      },
    });
    if (res.ok) return (await res.json()) as KickChannelPayload;
  } catch {
    /* fall through */
  }
  if (process.platform === "win32") {
    try {
      return await curlKickChannel(login);
    } catch {
      return null;
    }
  }
  return null;
}

async function probeKick(candidates: string[]): Promise<DiscoveredChannel | null> {
  for (const login of candidates) {
    const json = await fetchKickChannel(login);
    if (!json?.chatroom?.id && !json?.slug) continue;
    const handle = json.slug ?? json.user?.username ?? login;
    const live = json.livestream;
    const isLive = Boolean(live && (live.is_live ?? live.viewer_count != null));
    return {
      platform: "kick",
      handle: normalizeHandle(handle),
      exists: true,
      isLive,
      displayName: json.user?.username ?? handle,
      viewers: typeof live?.viewer_count === "number" ? live.viewer_count : null,
      title: live?.session_title,
    };
  }
  return null;
}

async function probeYoutube(
  workspaceId: string,
  candidates: string[],
): Promise<DiscoveredChannel | null> {
  const accessToken = await ensureFreshAccessToken(workspaceId, "youtube");
  if (!accessToken) return null;

  for (const login of candidates) {
    const probe = await probeYoutubeChannelLive(accessToken, login);
    if (!probe.exists) continue;
    return {
      platform: "youtube",
      handle: probe.handle,
      exists: true,
      isLive: probe.isLive,
      displayName: probe.displayName,
      title: probe.title,
    };
  }
  return null;
}

/** X live chat has no public viewer API — handle is kept for manual/extension ingest only. */
async function probeX(candidates: string[]): Promise<DiscoveredChannel | null> {
  for (const login of candidates) {
    const handle = normalizeHandle(login);
    if (handle.length < 2) continue;
    return {
      platform: "x",
      handle,
      exists: true,
      isLive: false,
    };
  }
  return null;
}

export async function discoverStreamerChannels(
  workspaceId: string,
  seed: { platform: DiscoverPlatform; handle: string },
): Promise<ChannelDiscoveryResult> {
  let handle = normalizeHandle(seed.handle);
  if (seed.platform === "youtube") {
    handle = await normalizeYoutubeChannelHandle(handle);
  }

  const candidates = await lookupTwitchAliases(buildHandleCandidates(handle));

  const [twitch, kick, youtube, x] = await Promise.all([
    probeTwitch(candidates),
    probeKick(candidates),
    probeYoutube(workspaceId, candidates),
    probeX(candidates),
  ]);

  const channels = [twitch, kick, youtube, x].filter(Boolean) as DiscoveredChannel[];

  if (!channels.some((c) => c.platform === seed.platform)) {
    channels.push({
      platform: seed.platform,
      handle,
      exists: true,
      isLive: false,
    });
  }

  const live = channels.filter((c) => c.isLive);

  return {
    seed: { platform: seed.platform, handle },
    candidates,
    channels,
    live,
  };
}

export type ExpandedChannels = Partial<Record<Platform, string[]>>;

export async function expandChannelsWithLiveMirrors(
  workspaceId: string,
  incoming: ExpandedChannels,
): Promise<{ channels: ExpandedChannels; discovered: DiscoveredChannel[] }> {
  const merged: ExpandedChannels = {};
  const seen = new Set<string>();
  const discovered: DiscoveredChannel[] = [];

  const add = (platform: Platform, handle: string) => {
    const normalized = normalizeHandle(handle);
    if (!normalized) return;
    const key = channelKey(platform, normalized);
    if (seen.has(key)) return;
    seen.add(key);
    if (!merged[platform]) merged[platform] = [];
    merged[platform]!.push(normalized);
  };

  for (const platform of DISCOVER_PLATFORMS) {
    for (const handle of incoming[platform as Platform] ?? []) {
      let normalized = handle;
      if (platform === "youtube") {
        normalized = await normalizeYoutubeChannelHandle(handle);
      }
      add(platform as Platform, normalized);
    }
  }

  const seeds = new Set<string>();
  for (const platform of DISCOVER_PLATFORMS) {
    for (const handle of incoming[platform as Platform] ?? []) {
      seeds.add(normalizeHandle(handle));
    }
  }

  for (const seedHandle of seeds) {
    const sourcePlatform =
      (DISCOVER_PLATFORMS.find((p) =>
        (incoming[p as Platform] ?? []).some((h) => normalizeHandle(h) === seedHandle),
      ) as DiscoverPlatform | undefined) ?? "twitch";

    const result = await discoverStreamerChannels(workspaceId, {
      platform: sourcePlatform,
      handle: seedHandle,
    });

    for (const ch of result.channels) {
      if (!ch.exists) continue;
      const key = channelKey(ch.platform, ch.handle);
      if (seen.has(key)) continue;
      discovered.push(ch);
      add(ch.platform as Platform, ch.handle);
    }
  }

  return { channels: merged, discovered };
}
