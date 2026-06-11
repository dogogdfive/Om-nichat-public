import type { Platform } from "@omnichat/chat-types";
import { readEnv } from "../env.js";
import { getPlatformTokens } from "../db/repos.js";

export type ChatUserProfile = {
  platform: Platform;
  userId: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  profileUrl: string;
  joinedAt: string | null;
  followerCount: number | null;
  role: string | null;
  channelSlug: string | null;
  channelDisplayName: string | null;
};

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: "long",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export async function fetchChatUserProfile(
  workspaceId: string,
  platform: Platform,
  opts: { userId: string; login?: string; displayName: string },
): Promise<ChatUserProfile> {
  const tokens = await getPlatformTokens(workspaceId, platform);
  const channelSlug = tokens?.platformUsername ?? null;
  const channelOwnerId = tokens?.platformUserId ?? null;

  const login =
    (opts.login ?? opts.displayName).replace(/^@/, "").trim().toLowerCase() || "unknown";

  if (platform === "twitch") {
    return fetchTwitchChatProfile(workspaceId, opts.userId, login, opts.displayName, {
      accessToken: tokens?.accessToken,
      channelSlug,
      channelOwnerId,
    });
  }
  if (platform === "kick") {
    return fetchKickChatProfile(opts.userId, login, opts.displayName, {
      accessToken: tokens?.accessToken,
      channelSlug,
      channelOwnerId,
    });
  }
  return fetchXChatProfile(opts.userId, login, opts.displayName, {
    accessToken: tokens?.accessToken,
    channelSlug,
    channelOwnerId,
  });
}

async function fetchTwitchChatProfile(
  _workspaceId: string,
  userId: string,
  login: string,
  displayName: string,
  ctx: {
    accessToken?: string;
    channelSlug: string | null;
    channelOwnerId: string | null;
  },
): Promise<ChatUserProfile> {
  const clientId = readEnv("TWITCH_CLIENT_ID");
  const headers: Record<string, string> = {};
  if (ctx.accessToken && clientId) {
    headers.Authorization = `Bearer ${ctx.accessToken}`;
    headers["Client-Id"] = clientId;
  } else if (clientId) {
    headers["Client-Id"] = clientId;
    const appToken = await getTwitchAppToken();
    if (appToken) headers.Authorization = `Bearer ${appToken}`;
  }

  let username = login;
  let name = displayName;
  let avatarUrl: string | null = null;
  let joinedAt: string | null = null;
  let resolvedId = userId;

  if (Object.keys(headers).length >= 2) {
    const byLogin = await fetch(
      `https://api.twitch.tv/helix/users?login=${encodeURIComponent(login)}`,
      { headers },
    );
    if (byLogin.ok) {
      const j = (await byLogin.json()) as {
        data?: {
          id: string;
          login: string;
          display_name: string;
          profile_image_url: string;
          created_at: string;
        }[];
      };
      const u = j.data?.[0];
      if (u) {
        resolvedId = u.id;
        username = u.login;
        name = u.display_name;
        avatarUrl = u.profile_image_url;
        joinedAt = formatDate(u.created_at);
      }
    } else if (userId && userId !== "unknown") {
      const byId = await fetch(`https://api.twitch.tv/helix/users?id=${userId}`, { headers });
      if (byId.ok) {
        const j = (await byId.json()) as { data?: { id: string; login: string; display_name: string; profile_image_url: string; created_at: string }[] };
        const u = j.data?.[0];
        if (u) {
          username = u.login;
          name = u.display_name;
          avatarUrl = u.profile_image_url;
          joinedAt = formatDate(u.created_at);
          resolvedId = u.id;
        }
      }
    }
  }

  let followerCount: number | null = null;
  if (headers.Authorization && resolvedId) {
    const fol = await fetch(
      `https://api.twitch.tv/helix/channels/followers?broadcaster_id=${resolvedId}&first=1`,
      { headers },
    );
    if (fol.ok) {
      const fj = (await fol.json()) as { total?: number };
      if (typeof fj.total === "number") followerCount = fj.total;
    }
  }

  const role = resolveRole(ctx.channelOwnerId, resolvedId, ctx.channelSlug, "Twitch");

  return {
    platform: "twitch",
    userId: resolvedId,
    username,
    displayName: name,
    avatarUrl,
    profileUrl: `https://www.twitch.tv/${username}`,
    joinedAt,
    followerCount,
    role,
    channelSlug: ctx.channelSlug,
    channelDisplayName: ctx.channelSlug,
  };
}

async function fetchKickChatProfile(
  userId: string,
  login: string,
  displayName: string,
  ctx: {
    accessToken?: string;
    channelSlug: string | null;
    channelOwnerId: string | null;
  },
): Promise<ChatUserProfile> {
  const headers: Record<string, string> = {};
  if (ctx.accessToken) headers.Authorization = `Bearer ${ctx.accessToken}`;

  let username = login;
  let name = displayName;
  let avatarUrl: string | null = null;
  let joinedAt: string | null = null;
  let followerCount: number | null = null;
  let resolvedId = userId;

  const channelRes = await fetch(
    `https://api.kick.com/public/v1/channels/${encodeURIComponent(login)}`,
    { headers },
  );
  if (channelRes.ok) {
    const cj = (await channelRes.json()) as {
      data?: {
        user_id?: number;
        slug?: string;
        user?: { username?: string; profile_pic?: string };
        follower_count?: number;
        created_at?: string;
      }[];
    };
    const ch = cj.data?.[0];
    if (ch) {
      resolvedId = String(ch.user_id ?? userId);
      username = ch.slug ?? ch.user?.username ?? login;
      name = ch.user?.username ?? displayName;
      avatarUrl = ch.user?.profile_pic ?? null;
      followerCount = ch.follower_count ?? null;
      if (ch.created_at) joinedAt = formatDate(ch.created_at);
    }
  }

  const role = resolveRole(ctx.channelOwnerId, resolvedId, ctx.channelSlug, "Kick", username);

  return {
    platform: "kick",
    userId: resolvedId,
    username,
    displayName: name,
    avatarUrl,
    profileUrl: `https://kick.com/${username}`,
    joinedAt,
    followerCount,
    role,
    channelSlug: ctx.channelSlug,
    channelDisplayName: ctx.channelSlug ?? username,
  };
}

async function fetchXChatProfile(
  userId: string,
  login: string,
  displayName: string,
  ctx: {
    accessToken?: string;
    channelSlug: string | null;
    channelOwnerId: string | null;
  },
): Promise<ChatUserProfile> {
  let username = login.replace(/\W/g, "_").slice(0, 15) || "user";
  let name = displayName;
  let avatarUrl: string | null = null;
  let joinedAt: string | null = null;
  let followerCount: number | null = null;

  if (ctx.accessToken && login.length > 1) {
    const res = await fetch(
      `https://api.twitter.com/2/users/by/username/${encodeURIComponent(login)}?user.fields=created_at,public_metrics,profile_image_url,name,username`,
      { headers: { Authorization: `Bearer ${ctx.accessToken}` } },
    );
    if (res.ok) {
      const j = (await res.json()) as {
        data?: {
          id: string;
          username: string;
          name?: string;
          profile_image_url?: string;
          created_at?: string;
          public_metrics?: { followers_count?: number };
        };
      };
      const u = j.data;
      if (u) {
        userId = u.id;
        username = u.username;
        name = u.name ?? displayName;
        avatarUrl = u.profile_image_url ?? null;
        if (u.created_at) joinedAt = formatDate(u.created_at);
        followerCount = u.public_metrics?.followers_count ?? null;
      }
    }
  }

  const role = resolveRole(ctx.channelOwnerId, userId, ctx.channelSlug, "X");

  return {
    platform: "x",
    userId,
    username,
    displayName: name,
    avatarUrl,
    profileUrl: `https://x.com/${username}`,
    joinedAt,
    followerCount,
    role,
    channelSlug: ctx.channelSlug,
    channelDisplayName: ctx.channelSlug,
  };
}

function resolveRole(
  channelOwnerId: string | null,
  userId: string,
  channelSlug: string | null,
  platformLabel: string,
  username?: string,
): string | null {
  if (channelOwnerId && userId === channelOwnerId) {
    const who = channelSlug ?? username ?? "this";
    return `Owner of the ${who} ${platformLabel} channel`;
  }
  return null;
}

let twitchAppToken: { token: string; exp: number } | null = null;

async function getTwitchAppToken(): Promise<string | null> {
  const clientId = readEnv("TWITCH_CLIENT_ID");
  const clientSecret = readEnv("TWITCH_CLIENT_SECRET");
  if (!clientId || !clientSecret) return null;
  if (twitchAppToken && twitchAppToken.exp > Date.now()) return twitchAppToken.token;
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
  const j = (await res.json()) as { access_token: string; expires_in: number };
  twitchAppToken = {
    token: j.access_token,
    exp: Date.now() + (j.expires_in - 60) * 1000,
  };
  return j.access_token;
}
