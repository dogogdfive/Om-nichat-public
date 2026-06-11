import type { ChatMessage } from "@omnichat/chat-types";
import tmi, { type ChatUserstate } from "tmi.js";
import type { ChatHub } from "../hub.js";
import { ingestWithAutomod } from "../automod/pipeline.js";
import { enrichMessageEmotes } from "../emotes/workspace.js";
import { getPlatformTokens, upsertPlatformTokens } from "../db/repos.js";
import { readEnv } from "../env.js";
import {
  ensureFreshAccessToken,
  forceRefreshAccessToken,
  RECONNECT_HINT,
} from "../auth/token-refresh.js";
import {
  parseBadgeTags,
  prefetchTwitchBadges,
  resolveTwitchBadges,
  warmTwitchGlobalBadges,
} from "./twitch-badges.js";
import { getTwitchAppToken } from "./twitch-badges.js";
import { resolveTwitchUserId } from "../emotes/seventv.js";
import { getWatchedChannels } from "./watch-channels.js";
import { friendlyTwitchSendError } from "../chat/friendly-send-error.js";
import type { StreamAlertEvent } from "@omnichat/chat-types";
import {
  parseTwitchBitsCheer,
  parseTwitchUserNotice,
  publishStreamAlert,
} from "../stream/stream-alerts.js";

type PoolEntry = {
  client: tmi.Client;
  login: string;
  channels: string[];
  workspaces: Set<string>;
};

/** One IRC connection per Twitch account — multiple workspaces can share it. */
const poolByTwitchUser = new Map<string, PoolEntry>();
const workspaceToTwitchUser = new Map<string, string>();

/** Read-only IRC for watched channels when the workspace has no Twitch OAuth token. */
const anonRead = {
  client: null as tmi.Client | null,
  channels: new Set<string>(),
  byWorkspace: new Map<string, Set<string>>(),
};

let hubRef: ChatHub | null = null;

function fanOutAnonMessage(
  hub: ChatHub,
  channelLogin: string,
  tags: ChatUserstate,
  message: string,
) {
  const bitsAlert = parseTwitchBitsCheer(tags, message, channelLogin);
  if (bitsAlert) {
    fanOutAnonStreamAlert(hub, channelLogin, bitsAlert);
    return;
  }

  const chatMsg = toChatMessage(tags, message, channelLogin);
  for (const [workspaceId, chs] of anonRead.byWorkspace) {
    if (!chs.has(channelLogin)) continue;
    void enrichMessageEmotes(workspaceId, chatMsg).then((enriched) =>
      ingestWithAutomod(workspaceId, enriched, hub),
    );
  }
}

function workspacesWatchingAnonChannel(channelLogin: string): string[] {
  const ids: string[] = [];
  for (const [workspaceId, chs] of anonRead.byWorkspace) {
    if (chs.has(channelLogin)) ids.push(workspaceId);
  }
  return ids;
}

function fanOutAnonStreamAlert(
  hub: ChatHub,
  channelLogin: string,
  alert: StreamAlertEvent,
) {
  const workspaceIds = workspacesWatchingAnonChannel(channelLogin);
  if (workspaceIds.length === 0) return;
  publishStreamAlert(hub, workspaceIds, alert);
}

function fanOutAnonUserNotice(
  hub: ChatHub,
  channelLogin: string,
  tags: ChatUserstate,
) {
  const alert = parseTwitchUserNotice(tags, channelLogin);
  if (!alert) return;
  fanOutAnonStreamAlert(hub, channelLogin, alert);
}

function fanOutStreamAlert(
  workspaceIds: Iterable<string>,
  hub: ChatHub,
  alert: StreamAlertEvent,
) {
  publishStreamAlert(hub, workspaceIds, alert);
}

async function refreshAnonTwitchClient(hub: ChatHub): Promise<void> {
  const needed = new Set<string>();
  for (const chs of anonRead.byWorkspace.values()) {
    for (const c of chs) needed.add(c);
  }

  if (needed.size === 0) {
    if (anonRead.client) {
      await anonRead.client.disconnect().catch(() => {});
      anonRead.client = null;
    }
    anonRead.channels.clear();
    return;
  }

  const channelList = [...needed];

  if (!anonRead.client) {
    const client = new tmi.Client({
      options: { skipUpdatingEmotesets: true },
      channels: channelList,
    });
    client.on("message", (...args: unknown[]) => {
      const [channel, tags, message, self] = args as [string, ChatUserstate, string, boolean];
      if (self) return;
      fanOutAnonMessage(hub, normalizeChannel(channel), tags, String(message));
    });
    client.on("usernotice", (...args: unknown[]) => {
      const [channel, tags, , self] = args as [string, ChatUserstate, string, boolean];
      if (self) return;
      fanOutAnonUserNotice(hub, normalizeChannel(channel), tags);
    });
    client.on("connected", () =>
      console.log(`[twitch] read-only IRC joined [${channelList.join(", ")}]`),
    );
    await client.connect();
    anonRead.client = client;
    anonRead.channels = new Set(needed);
    warmTwitchGlobalBadges();
    for (const ch of channelList) void prefetchTwitchBadges(ch);
    return;
  }

  const missing = channelList.filter((c) => !anonRead.channels.has(c));
  if (missing.length > 0) {
    const joinable = anonRead.client as tmi.Client & {
      join: (channel: string) => Promise<unknown>;
    };
    for (const ch of missing) {
      await joinable.join(`#${ch}`).catch(() => undefined);
      anonRead.channels.add(ch);
    }
    console.log(`[twitch] read-only IRC joined additional: ${missing.join(", ")}`);
    for (const ch of missing) void prefetchTwitchBadges(ch);
  }

  const stale = [...anonRead.channels].filter((c) => !needed.has(c));
  if (stale.length > 0 && anonRead.client) {
    const partable = anonRead.client as tmi.Client & {
      part: (channel: string) => Promise<unknown>;
    };
    for (const ch of stale) {
      await partable.part(`#${ch}`).catch(() => undefined);
      anonRead.channels.delete(ch);
    }
    console.log(`[twitch] read-only IRC left: ${stale.join(", ")}`);
  }
}

async function syncAnonTwitchRead(workspaceId: string, hub: ChatHub): Promise<void> {
  const watched = getWatchedChannels(workspaceId, "twitch")
    .map(normalizeChannel)
    .filter(Boolean);

  if (watched.length === 0) {
    anonRead.byWorkspace.delete(workspaceId);
    await refreshAnonTwitchClient(hub);
    return;
  }

  const tokens = await getPlatformTokens(workspaceId, "twitch");
  const hasOAuth = Boolean(tokens?.accessToken && tokens?.platformUsername);

  if (hasOAuth) {
    const oauthJoined = getOauthJoinedChannelsForWorkspace(workspaceId);
    const anonOnly = watched.filter((ch) => !oauthJoined.has(ch));
    if (anonOnly.length === 0) {
      anonRead.byWorkspace.delete(workspaceId);
    } else {
      anonRead.byWorkspace.set(workspaceId, new Set(anonOnly));
      console.log(`[twitch] read-only fallback for ${workspaceId}: [${anonOnly.join(", ")}]`);
    }
  } else {
    anonRead.byWorkspace.set(workspaceId, new Set(watched));
  }
  await refreshAnonTwitchClient(hub);
}

function getOauthJoinedChannelsForWorkspace(workspaceId: string): Set<string> {
  const twitchUserId = workspaceToTwitchUser.get(workspaceId);
  if (!twitchUserId) return new Set();
  const entry = poolByTwitchUser.get(twitchUserId);
  if (!entry) return new Set();
  return new Set(entry.channels.map(normalizeChannel));
}

async function joinOAuthChannels(entry: PoolEntry, channels: string[]): Promise<void> {
  if (!entry.client) return;
  const joinable = entry.client as tmi.Client & { join: (channel: string) => Promise<unknown> };
  for (const ch of channels) {
    const normalized = normalizeChannel(ch);
    if (!normalized || entry.channels.includes(normalized)) continue;
    try {
      await joinable.join(`#${normalized}`);
      entry.channels.push(normalized);
      console.log(`[twitch] ${entry.login} joined #${normalized}`);
      void prefetchTwitchBadges(normalized);
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      console.warn(`[twitch] join #${normalized} failed (${reason}) → anonymous read`);
    }
  }
}

export function getTwitchIngestStatus(): {
  connections: { twitchUserId: string; login: string; channels: string[]; workspaces: string[] }[];
} {
  return {
    connections: [...poolByTwitchUser.entries()].map(([twitchUserId, entry]) => ({
      twitchUserId,
      login: entry.login,
      channels: entry.channels,
      workspaces: [...entry.workspaces],
    })),
  };
}

export async function enrichTwitchProfile(workspaceId: string): Promise<void> {
  const tokens = await getPlatformTokens(workspaceId, "twitch");
  if (!tokens?.accessToken) return;
  const clientId = process.env.TWITCH_CLIENT_ID;
  if (!clientId) return;
  const res = await fetch("https://api.twitch.tv/helix/users", {
    headers: {
      Authorization: `Bearer ${tokens.accessToken}`,
      "Client-Id": clientId,
    },
  });
  if (!res.ok) return;
  const data = (await res.json()) as { data?: { id: string; login: string; display_name: string }[] };
  const user = data.data?.[0];
  if (!user) return;
  await upsertPlatformTokens(workspaceId, "twitch", {
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    scope: tokens.scope,
    expiresAt: tokens.expiresAt ? new Date(tokens.expiresAt) : undefined,
    platformUserId: user.id,
    platformUsername: user.login,
  });
}

function normalizeChannel(name: string): string {
  return name.replace(/^@/, "").replace(/^#/, "").toLowerCase();
}

function workspaceWatchesTwitchChannel(
  workspaceId: string,
  channelLogin: string,
  oauthLogin?: string,
): boolean {
  const normalized = normalizeChannel(channelLogin);
  for (const ch of getWatchedChannels(workspaceId, "twitch")) {
    if (normalizeChannel(ch) === normalized) return true;
  }
  if (oauthLogin && normalizeChannel(oauthLogin) === normalized) return true;
  return false;
}

function toChatMessage(tags: ChatUserstate, message: string, channelLogin: string): ChatMessage {
  const id = tags.id ?? `${Date.now()}-${tags["user-id"] ?? "anon"}`;
  const rawBadges = tags.badges as string | Record<string, string> | undefined;
  const badges = resolveTwitchBadges(channelLogin, rawBadges);
  if (parseBadgeTags(rawBadges).length > 0 && badges.length === 0) {
    void prefetchTwitchBadges(channelLogin);
  }
  return {
    id: `twitch:${id}`,
    platform: "twitch",
    platformMessageId: id,
    channelId: channelLogin,
    author: {
      id: tags["user-id"] ?? "unknown",
      displayName: tags["display-name"] ?? tags.username ?? "unknown",
      username: tags.username,
      color: tags.color,
    },
    text: message,
    emotes: [],
    badges,
    timestamp: new Date().toISOString(),
  };
}

function collectChannels(login: string | undefined, workspaceId: string): string[] {
  const set = new Set<string>();
  if (login) set.add(normalizeChannel(login));
  for (const ch of getWatchedChannels(workspaceId, "twitch")) {
    set.add(normalizeChannel(ch));
  }
  return [...set];
}

function fanOutMessage(
  entry: PoolEntry,
  hub: ChatHub,
  channelLogin: string,
  tags: ChatUserstate,
  message: string,
) {
  const bitsAlert = parseTwitchBitsCheer(tags, message, channelLogin);
  if (bitsAlert) {
    fanOutStreamAlert(entry.workspaces, hub, bitsAlert);
    return;
  }

  const chatMsg = toChatMessage(tags, message, channelLogin);
  const modCtx = {
    twitchBadges: tags.badges as string | Record<string, string> | undefined,
  };
  for (const workspaceId of entry.workspaces) {
    if (!workspaceWatchesTwitchChannel(workspaceId, channelLogin, entry.login)) continue;
    void enrichMessageEmotes(workspaceId, chatMsg).then((enriched) =>
      ingestWithAutomod(workspaceId, enriched, hub, modCtx),
    );
  }
}

function fanOutUserNotice(
  entry: PoolEntry,
  hub: ChatHub,
  channelLogin: string,
  tags: ChatUserstate,
) {
  const alert = parseTwitchUserNotice(tags, channelLogin);
  if (!alert) return;
  const workspaceIds = [...entry.workspaces].filter((workspaceId) =>
    workspaceWatchesTwitchChannel(workspaceId, channelLogin, entry.login),
  );
  if (workspaceIds.length === 0) return;
  fanOutStreamAlert(workspaceIds, hub, alert);
}

function bindHandlers(client: tmi.Client, entry: PoolEntry, hub: ChatHub) {
  client.on("message", (...args: unknown[]) => {
    const [channel, tags, message, self] = args as [string, ChatUserstate, string, boolean];
    if (self) return;
    const channelLogin = normalizeChannel(channel);
    fanOutMessage(entry, hub, channelLogin, tags, String(message));
  });
  client.on("usernotice", (...args: unknown[]) => {
    const [channel, tags, , self] = args as [string, ChatUserstate, string, boolean];
    if (self) return;
    fanOutUserNotice(entry, hub, normalizeChannel(channel), tags);
  });
  client.on("disconnected", (reason) => {
    console.warn(`[twitch] IRC disconnected (${entry.login}):`, reason);
  });
}

async function connectPoolClient(
  entry: PoolEntry,
  hub: ChatHub,
  login: string,
  accessToken: string,
  channels: string[],
): Promise<tmi.Client> {
  const loginNorm = normalizeChannel(login);
  const clientOptions: ConstructorParameters<typeof tmi.Client>[0] = {
    options: { skipUpdatingEmotesets: true },
    channels: [loginNorm],
    identity: { username: login, password: `oauth:${accessToken}` },
  };

  const client = new tmi.Client(clientOptions);
  bindHandlers(client, entry, hub);
  client.on("connected", () =>
    console.log(
      `[twitch] IRC ${login} joined [#${loginNorm}] → workspaces [${[...entry.workspaces].join(", ")}]`,
    ),
  );
  await client.connect();
  entry.client = client;
  entry.channels = [loginNorm];
  warmTwitchGlobalBadges();
  void prefetchTwitchBadges(loginNorm);

  const extra = channels.filter((c) => normalizeChannel(c) !== loginNorm);
  if (extra.length > 0) await joinOAuthChannels(entry, extra);
  return client;
}

async function mergeChannelsForPool(twitchUserId: string): Promise<string[]> {
  const entry = poolByTwitchUser.get(twitchUserId);
  if (!entry) return [];
  const set = new Set<string>([normalizeChannel(entry.login)]);
  for (const wsId of entry.workspaces) {
    for (const ch of collectChannels(entry.login, wsId)) set.add(ch);
  }
  return [...set];
}

export async function startTwitchIngest(workspaceId: string, hub: ChatHub): Promise<void> {
  hubRef = hub;
  await enrichTwitchProfile(workspaceId);
  const accessToken = await ensureFreshAccessToken(workspaceId, "twitch");
  const tokens = await getPlatformTokens(workspaceId, "twitch");
  const login = tokens?.platformUsername;
  const twitchUserId = tokens?.platformUserId;

  if (!login || !twitchUserId || !accessToken) {
    const watched = getWatchedChannels(workspaceId, "twitch");
    if (watched.length > 0) {
      console.log(
        `[twitch] read-only ingest for ${workspaceId} (no OAuth): [${watched.join(", ")}]`,
      );
    }
    await syncAnonTwitchRead(workspaceId, hub);
    return;
  }

  await syncAnonTwitchRead(workspaceId, hub);

  const channels = collectChannels(login, workspaceId);
  if (channels.length === 0) {
    console.warn(`[twitch] no channels for ${workspaceId}`);
    return;
  }

  const existing = poolByTwitchUser.get(twitchUserId);
  if (existing) {
    existing.workspaces.add(workspaceId);
    workspaceToTwitchUser.set(workspaceId, twitchUserId);
    const merged = await mergeChannelsForPool(twitchUserId);
    const missing = merged.filter((c) => !existing.channels.includes(c));
    if (missing.length > 0) {
      await joinOAuthChannels(existing, missing);
    }
    await syncAnonTwitchRead(workspaceId, hub);
    console.log(`[twitch] workspace ${workspaceId} attached to shared IRC (${login})`);
    return;
  }

  const entry: PoolEntry = {
    client: null as unknown as tmi.Client,
    login,
    channels,
    workspaces: new Set([workspaceId]),
  };
  poolByTwitchUser.set(twitchUserId, entry);
  workspaceToTwitchUser.set(workspaceId, twitchUserId);

  try {
    await connectPoolClient(entry, hub, login, accessToken, channels);
    await syncAnonTwitchRead(workspaceId, hub);
  } catch (err) {
    console.error(`[twitch] connect failed for ${login}:`, err);
    poolByTwitchUser.delete(twitchUserId);
    workspaceToTwitchUser.delete(workspaceId);
    const refreshed = await forceRefreshAccessToken(workspaceId, "twitch");
    if (refreshed) {
      entry.workspaces = new Set([workspaceId]);
      poolByTwitchUser.set(twitchUserId, entry);
      workspaceToTwitchUser.set(workspaceId, twitchUserId);
      await connectPoolClient(entry, hub, login, refreshed, channels);
      await syncAnonTwitchRead(workspaceId, hub);
    } else {
      throw err;
    }
  }
}

export function stopTwitchIngest(workspaceId: string): void {
  const twitchUserId = workspaceToTwitchUser.get(workspaceId);
  if (twitchUserId) {
    const entry = poolByTwitchUser.get(twitchUserId);
    if (!entry) {
      workspaceToTwitchUser.delete(workspaceId);
    } else {
      entry.workspaces.delete(workspaceId);
      workspaceToTwitchUser.delete(workspaceId);

      if (entry.workspaces.size === 0) {
        entry.client?.disconnect().catch(() => {});
        poolByTwitchUser.delete(twitchUserId);
        console.log(`[twitch] IRC disconnected (${entry.login}) — no workspaces left`);
      }
    }
  }

  anonRead.byWorkspace.delete(workspaceId);
  if (hubRef) void refreshAnonTwitchClient(hubRef);
}

function getClientForWorkspace(workspaceId: string): tmi.Client | undefined {
  const twitchUserId = workspaceToTwitchUser.get(workspaceId);
  if (!twitchUserId) return undefined;
  return poolByTwitchUser.get(twitchUserId)?.client;
}

async function resolveTargetBroadcasterId(
  channelLogin: string,
  senderLogin: string,
  senderId: string,
): Promise<string | null> {
  if (channelLogin === normalizeChannel(senderLogin)) return senderId;

  const clientId = readEnv("TWITCH_CLIENT_ID");
  const appToken = await getTwitchAppToken();
  if (appToken && clientId) {
    const res = await fetch(
      `https://api.twitch.tv/helix/users?login=${encodeURIComponent(channelLogin)}`,
      { headers: { Authorization: `Bearer ${appToken}`, "Client-Id": clientId } },
    );
    if (res.ok) {
      const json = (await res.json()) as { data?: { id: string }[] };
      const id = json.data?.[0]?.id;
      if (id) return id;
    }
  }

  return resolveTwitchUserId(channelLogin);
}

async function ensureJoinedToChannel(
  workspaceId: string,
  channelLogin: string,
): Promise<void> {
  const twitchUserId = workspaceToTwitchUser.get(workspaceId);
  if (!twitchUserId) return;
  const entry = poolByTwitchUser.get(twitchUserId);
  if (!entry?.client) return;
  if (entry.channels.includes(channelLogin)) return;
  try {
    const joinable = entry.client as tmi.Client & { join: (channel: string) => Promise<unknown> };
    await joinable.join(`#${channelLogin}`);
    entry.channels.push(channelLogin);
    console.log(`[twitch] joined #${channelLogin} for send`);
  } catch (err) {
    console.warn(`[twitch] join #${channelLogin} before send failed:`, err);
  }
}

export async function sendTwitchChat(
  workspaceId: string,
  message: string,
  targetChannel?: string,
): Promise<{ ok: boolean; error?: string; channel?: string; via?: "helix" | "irc" }> {
  let accessToken = await ensureFreshAccessToken(workspaceId, "twitch");
  let tokens = await getPlatformTokens(workspaceId, "twitch");
  const login = tokens?.platformUsername;
  const senderId = tokens?.platformUserId;
  const clientId = readEnv("TWITCH_CLIENT_ID");
  if (!login || !accessToken || !senderId || !clientId) {
    return { ok: false, error: "twitch not connected" };
  }

  const channelLogin = normalizeChannel(targetChannel ?? login);
  const targetBroadcasterId = await resolveTargetBroadcasterId(channelLogin, login, senderId);
  if (!targetBroadcasterId) {
    return { ok: false, error: `twitch: unknown channel #${channelLogin}`, channel: channelLogin };
  }

  const sendHelix = async (token: string) => {
    const res = await fetch("https://api.twitch.tv/helix/chat/messages", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Client-Id": clientId,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        broadcaster_id: targetBroadcasterId,
        sender_id: senderId,
        message: message.slice(0, 500),
      }),
    });
    const body = await res.text().catch(() => "");
    let json: {
      data?: {
        is_sent?: boolean;
        message_id?: string;
        drop_reason?: { code?: string; message?: string };
      }[];
      message?: string;
    } = {};
    try {
      json = JSON.parse(body) as typeof json;
    } catch {
      /* ignore */
    }
    if (!res.ok) {
      return { ok: false as const, status: res.status, body, detail: json.message };
    }
    const entry = json.data?.[0];
    if (entry?.is_sent === false) {
      const drop =
        entry.drop_reason?.message ??
        entry.drop_reason?.code ??
        "Twitch rejected the message (follower-only, sub-only, slow mode, or verified phone required)";
      return { ok: false as const, status: res.status, body, detail: drop, dropped: true };
    }
    return { ok: true as const };
  };

  let helix = await sendHelix(accessToken);
  if (!helix.ok && helix.status === 401) {
    const refreshed = await forceRefreshAccessToken(workspaceId, "twitch");
    if (refreshed) helix = await sendHelix(refreshed);
  }

  if (helix.ok) {
    return { ok: true, channel: channelLogin, via: "helix" };
  }

  const client = getClientForWorkspace(workspaceId);
  if (client) {
    await ensureJoinedToChannel(workspaceId, channelLogin);
    try {
      const say = (client as tmi.Client & { say: (channel: string, message: string) => Promise<unknown> }).say;
      await say.call(client, `#${channelLogin}`, message);
      return { ok: true, channel: channelLogin, via: "irc" };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn("[twitch] IRC say failed after Helix:", msg);
      const banMsg = friendlyTwitchSendError(channelLogin, msg);
      if (banMsg) {
        return { ok: false, error: banMsg, channel: channelLogin };
      }
    }
  }

  const detail = helix.detail ?? helix.body?.slice(0, 200) ?? "";
  const banMsg = friendlyTwitchSendError(channelLogin, detail, helix.body);
  if (banMsg) {
    return { ok: false, error: banMsg, channel: channelLogin };
  }
  if (detail.includes("user:write:chat") || helix.status === 401) {
    return {
      ok: false,
      error: `twitch: missing user:write:chat scope — reconnect Twitch in Settings. ${RECONNECT_HINT}`,
      channel: channelLogin,
    };
  }
  if (helix.dropped) {
    return { ok: false, error: `twitch/#${channelLogin}: ${detail}`, channel: channelLogin };
  }
  return {
    ok: false,
    error: `twitch/#${channelLogin}: helix ${helix.status}: ${detail}`,
    channel: channelLogin,
  };
}
