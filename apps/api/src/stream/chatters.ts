import { getTwitchAppToken } from "../adapters/twitch-badges.js";
import { ensureFreshAccessToken } from "../auth/token-refresh.js";
import { getPlatformTokens } from "../db/repos.js";
import { readEnv } from "../env.js";
import { getKickChannelChatters } from "./kick-chatters.js";

export type ChatterEntry = {
  login: string;
  userId: string;
};

export type ChannelChattersResult = {
  platform: "twitch" | "kick";
  channel: string;
  chatters: ChatterEntry[];
  total: number;
  source: "api" | "activity" | "unavailable";
  error?: string;
};

function normalizeLogin(login: string): string {
  return login.replace(/^@/, "").toLowerCase();
}

async function resolveTwitchBroadcasterId(login: string): Promise<string | null> {
  const clientId = readEnv("TWITCH_CLIENT_ID");
  const token = await getTwitchAppToken();
  if (!token || !clientId) return null;
  const res = await fetch(
    `https://api.twitch.tv/helix/users?login=${encodeURIComponent(normalizeLogin(login))}`,
    { headers: { Authorization: `Bearer ${token}`, "Client-Id": clientId } },
  );
  if (!res.ok) return null;
  const json = (await res.json()) as { data?: { id: string }[] };
  return json.data?.[0]?.id ?? null;
}

export async function fetchTwitchChannelChatters(
  workspaceId: string,
  channelLogin: string,
): Promise<ChannelChattersResult> {
  const channel = normalizeLogin(channelLogin);
  const accessToken = await ensureFreshAccessToken(workspaceId, "twitch");
  const tokens = await getPlatformTokens(workspaceId, "twitch");
  const clientId = readEnv("TWITCH_CLIENT_ID");
  const moderatorId = tokens?.platformUserId;

  if (!accessToken || !moderatorId || !clientId) {
    return {
      platform: "twitch",
      channel,
      chatters: [],
      total: 0,
      source: "unavailable",
      error: "twitch_not_connected",
    };
  }

  const broadcasterId = await resolveTwitchBroadcasterId(channel);
  if (!broadcasterId) {
    return {
      platform: "twitch",
      channel,
      chatters: [],
      total: 0,
      source: "unavailable",
      error: "unknown_channel",
    };
  }

  const chatters: ChatterEntry[] = [];
  let cursor: string | undefined;
  let total = 0;

  for (let page = 0; page < 10; page++) {
    const params = new URLSearchParams({
      broadcaster_id: broadcasterId,
      moderator_id: moderatorId,
      first: "1000",
    });
    if (cursor) params.set("after", cursor);

    const res = await fetch(`https://api.twitch.tv/helix/chat/chatters?${params}`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Client-Id": clientId,
      },
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      const error =
        res.status === 403
          ? "not_a_moderator"
          : body.includes("moderator:read:chatters")
            ? "missing_scope"
            : `helix_${res.status}`;
      return {
        platform: "twitch",
        channel,
        chatters: [],
        total: 0,
        source: "unavailable",
        error,
      };
    }

    const json = (await res.json()) as {
      total?: number;
      data?: { user_id: string; user_login: string }[];
      pagination?: { cursor?: string };
    };

    total = json.total ?? chatters.length;
    for (const row of json.data ?? []) {
      chatters.push({ userId: row.user_id, login: row.user_login });
    }

    cursor = json.pagination?.cursor;
    if (!cursor) break;
  }

  return {
    platform: "twitch",
    channel,
    chatters,
    total,
    source: "api",
  };
}

export function fetchKickChannelChatters(channelLogin: string): ChannelChattersResult {
  const channel = normalizeLogin(channelLogin);
  const { chatters, total } = getKickChannelChatters(channel);
  return {
    platform: "kick",
    channel,
    chatters,
    total,
    source: "activity",
  };
}

export async function fetchWorkspaceChatters(
  workspaceId: string,
  channels: { platform: string; login: string }[],
): Promise<ChannelChattersResult[]> {
  const twitch = channels.filter((c) => c.platform === "twitch");
  const kick = channels.filter((c) => c.platform === "kick");

  const [twitchResults, kickResults] = await Promise.all([
    Promise.all(twitch.map((c) => fetchTwitchChannelChatters(workspaceId, c.login))),
    Promise.resolve(kick.map((c) => fetchKickChannelChatters(c.login))),
  ]);

  return [...twitchResults, ...kickResults];
}
