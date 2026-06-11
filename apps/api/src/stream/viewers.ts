import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { Platform } from "@omnichat/chat-types";
import { getTwitchAppToken } from "../adapters/twitch-badges.js";
import { probeYoutubeChannelLive } from "../adapters/youtube.js";
import { ensureFreshAccessToken } from "../auth/token-refresh.js";
import { syncWatchedChannels, getWatchedChannels } from "../adapters/watch-channels.js";
import { readEnv } from "../env.js";
import { getConnections } from "../db/repos.js";

const execFileAsync = promisify(execFile);

const CHROME_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

export type StreamViewerEntry = {
  platform: "twitch" | "kick" | "x" | "youtube";
  login: string;
  isLive: boolean;
  viewers: number | null;
  title?: string;
};

export type StreamViewerSnapshot = {
  streams: StreamViewerEntry[];
  totalViewers: number;
};

type ViewerTarget = { platform: "twitch" | "kick" | "x" | "youtube"; login: string };

function normalizeLogin(login: string): string {
  return login.replace(/^@/, "").toLowerCase();
}

export async function listStreamViewerTargetsForWorkspace(
  workspaceId: string,
  clientChannels?: Partial<Record<string, string[]>>,
): Promise<ViewerTarget[]> {
  if (clientChannels) syncWatchedChannels(workspaceId, clientChannels);

  const seen = new Set<string>();
  const targets: ViewerTarget[] = [];

  const add = (platform: "twitch" | "kick" | "x" | "youtube", login: string) => {
    const normalized = normalizeLogin(login);
    if (!normalized) return;
    const key = `${platform}:${normalized}`;
    if (seen.has(key)) return;
    seen.add(key);
    targets.push({ platform, login: normalized });
  };

  const connections = await getConnections(workspaceId);
  for (const platform of ["twitch", "kick", "x", "youtube"] as const) {
    const conn = connections[platform as Platform];
    if (conn?.status === "connected" && conn.username) {
      add(platform, conn.username);
    }
  }

  for (const platform of ["twitch", "kick", "x", "youtube"] as const) {
    for (const login of clientChannels?.[platform] ?? getWatchedChannels(workspaceId, platform)) {
      add(platform, login);
    }
  }

  return targets;
}

async function fetchTwitchStreams(logins: string[]): Promise<Map<string, StreamViewerEntry>> {
  const out = new Map<string, StreamViewerEntry>();
  if (logins.length === 0) return out;

  const token = await getTwitchAppToken();
  const clientId = readEnv("TWITCH_CLIENT_ID");
  if (!token || !clientId) {
    for (const login of logins) {
      out.set(login, { platform: "twitch", login, isLive: false, viewers: null });
    }
    return out;
  }

  const params = new URLSearchParams();
  for (const login of logins.slice(0, 100)) params.append("user_login", login);

  const res = await fetch(`https://api.twitch.tv/helix/streams?${params}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      "Client-Id": clientId,
    },
  });

  const liveByLogin = new Map<string, { viewers: number; title: string }>();
  if (res.ok) {
    const json = (await res.json()) as {
      data?: { user_login: string; viewer_count: number; title: string }[];
    };
    for (const row of json.data ?? []) {
      liveByLogin.set(row.user_login.toLowerCase(), {
        viewers: row.viewer_count,
        title: row.title,
      });
    }
  }

  for (const login of logins) {
    const live = liveByLogin.get(login);
    out.set(login, {
      platform: "twitch",
      login,
      isLive: Boolean(live),
      viewers: live?.viewers ?? null,
      title: live?.title,
    });
  }

  return out;
}

type KickChannelPayload = {
  slug?: string;
  livestream?: { viewer_count?: number; session_title?: string; is_live?: boolean } | null;
};

async function curlKickChannel(slug: string): Promise<KickChannelPayload | null> {
  const url = `https://kick.com/api/v2/channels/${encodeURIComponent(slug)}`;
  const args = ["-s", "-H", "Accept: application/json", "-H", `User-Agent: ${CHROME_UA}`, url];
  const { stdout } = await execFileAsync("curl.exe", args, { maxBuffer: 5 * 1024 * 1024 });
  return JSON.parse(stdout) as KickChannelPayload;
}

async function fetchKickChannel(slug: string): Promise<StreamViewerEntry> {
  const login = normalizeLogin(slug);
  let json: KickChannelPayload | null = null;

  const url = `https://kick.com/api/v2/channels/${encodeURIComponent(login)}`;
  try {
    const res = await fetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": CHROME_UA,
        Referer: `https://kick.com/${login}`,
      },
    });
    if (res.ok) json = (await res.json()) as KickChannelPayload;
  } catch {
    /* fall through */
  }

  if (!json && process.platform === "win32") {
    try {
      json = await curlKickChannel(login);
    } catch {
      json = null;
    }
  }

  const live = json?.livestream;
  const isLive = Boolean(live && (live.is_live ?? live.viewer_count != null));
  return {
    platform: "kick",
    login,
    isLive,
    viewers: typeof live?.viewer_count === "number" ? live.viewer_count : null,
    title: live?.session_title,
  };
}

async function fetchKickStreams(logins: string[]): Promise<Map<string, StreamViewerEntry>> {
  const out = new Map<string, StreamViewerEntry>();
  await Promise.all(
    logins.map(async (login) => {
      out.set(login, await fetchKickChannel(login));
    }),
  );
  return out;
}

async function fetchXStreams(logins: string[]): Promise<Map<string, StreamViewerEntry>> {
  const out = new Map<string, StreamViewerEntry>();
  for (const login of logins) {
    out.set(login, {
      platform: "x",
      login,
      isLive: false,
      viewers: null,
    });
  }
  return out;
}

async function fetchYoutubeStreams(
  workspaceId: string,
  logins: string[],
): Promise<Map<string, StreamViewerEntry>> {
  const out = new Map<string, StreamViewerEntry>();
  const accessToken = await ensureFreshAccessToken(workspaceId, "youtube");
  if (!accessToken) {
    for (const login of logins) {
      out.set(login, { platform: "youtube", login, isLive: false, viewers: null });
    }
    return out;
  }

  await Promise.all(
    logins.map(async (login) => {
      const probe = await probeYoutubeChannelLive(accessToken, login);
      out.set(login, {
        platform: "youtube",
        login: probe.handle || login,
        isLive: probe.isLive,
        viewers: null,
        title: probe.title,
      });
    }),
  );
  return out;
}

export async function fetchStreamViewerSnapshot(
  workspaceId: string,
  clientChannels?: Partial<Record<string, string[]>>,
): Promise<StreamViewerSnapshot> {
  const targets = await listStreamViewerTargetsForWorkspace(workspaceId, clientChannels);

  const twitchLogins = targets.filter((t) => t.platform === "twitch").map((t) => t.login);
  const kickLogins = targets.filter((t) => t.platform === "kick").map((t) => t.login);
  const xLogins = targets.filter((t) => t.platform === "x").map((t) => t.login);
  const youtubeLogins = targets.filter((t) => t.platform === "youtube").map((t) => t.login);

  const [twitchMap, kickMap, xMap, youtubeMap] = await Promise.all([
    fetchTwitchStreams(twitchLogins),
    fetchKickStreams(kickLogins),
    fetchXStreams(xLogins),
    fetchYoutubeStreams(workspaceId, youtubeLogins),
  ]);

  const streams: StreamViewerEntry[] = targets.map((target) => {
    const map =
      target.platform === "twitch"
        ? twitchMap
        : target.platform === "kick"
          ? kickMap
          : target.platform === "youtube"
            ? youtubeMap
            : xMap;
    return (
      map.get(target.login) ?? {
        platform: target.platform,
        login: target.login,
        isLive: false,
        viewers: null,
      }
    );
  });

  const totalViewers = streams.reduce((sum, s) => sum + (s.viewers ?? 0), 0);

  return { streams, totalViewers };
}
