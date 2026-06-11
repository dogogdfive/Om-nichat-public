import type { Platform } from "@omnichat/chat-types";
import { readEnv } from "../env.js";
import { getPlatformTokens, upsertPlatformTokens } from "../db/repos.js";

async function refreshTwitch(refreshToken: string): Promise<{
  accessToken: string;
  refreshToken?: string;
  expiresIn?: number;
  scope?: string;
} | null> {
  const clientId = readEnv("TWITCH_CLIENT_ID");
  const clientSecret = readEnv("TWITCH_CLIENT_SECRET");
  if (!clientId || !clientSecret) return null;

  const res = await fetch("https://id.twitch.tv/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });
  if (!res.ok) return null;
  const json = (await res.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    scope?: string;
  };
  if (!json.access_token) return null;
  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token,
    expiresIn: json.expires_in,
    scope: json.scope,
  };
}

async function refreshGoogle(refreshToken: string): Promise<{
  accessToken: string;
  refreshToken?: string;
  expiresIn?: number;
  scope?: string;
} | null> {
  const clientId = readEnv("GOOGLE_CLIENT_ID");
  const clientSecret = readEnv("GOOGLE_CLIENT_SECRET");
  if (!clientId || !clientSecret) return null;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });
  if (!res.ok) return null;
  const json = (await res.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    scope?: string;
  };
  if (!json.access_token) return null;
  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token,
    expiresIn: json.expires_in,
    scope: json.scope,
  };
}

async function refreshKick(refreshToken: string): Promise<{
  accessToken: string;
  refreshToken?: string;
  expiresIn?: number;
  scope?: string;
} | null> {
  const clientId = readEnv("KICK_CLIENT_ID");
  const clientSecret = readEnv("KICK_CLIENT_SECRET");
  if (!clientId || !clientSecret) return null;

  const res = await fetch("https://id.kick.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });
  if (!res.ok) return null;
  const json = (await res.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    scope?: string;
  };
  if (!json.access_token) return null;
  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token,
    expiresIn: json.expires_in,
    scope: json.scope,
  };
}

/** Refresh OAuth token if expired or missing. Returns latest access token. */
export async function ensureFreshAccessToken(
  workspaceId: string,
  platform: Platform,
): Promise<string | undefined> {
  const tokens = await getPlatformTokens(workspaceId, platform);
  if (!tokens?.accessToken) return undefined;

  const expired =
    tokens.expiresAt !== undefined && tokens.expiresAt < Date.now() + 60_000;
  if (!expired) return tokens.accessToken;
  if (!tokens.refreshToken) return tokens.accessToken;

  const refreshed =
    platform === "twitch"
      ? await refreshTwitch(tokens.refreshToken)
      : platform === "kick"
        ? await refreshKick(tokens.refreshToken)
        : platform === "youtube"
          ? await refreshGoogle(tokens.refreshToken)
          : null;

  if (!refreshed) return tokens.accessToken;

  await upsertPlatformTokens(workspaceId, platform, {
    accessToken: refreshed.accessToken,
    refreshToken: refreshed.refreshToken ?? tokens.refreshToken,
    platformUserId: tokens.platformUserId,
    platformUsername: tokens.platformUsername,
    scope: refreshed.scope ?? tokens.scope,
    expiresAt: refreshed.expiresIn
      ? new Date(Date.now() + refreshed.expiresIn * 1000)
      : undefined,
  });
  return refreshed.accessToken;
}

export async function forceRefreshAccessToken(
  workspaceId: string,
  platform: "twitch" | "kick",
): Promise<string | undefined> {
  const tokens = await getPlatformTokens(workspaceId, platform);
  if (!tokens?.refreshToken) return tokens?.accessToken;
  const refreshed =
    platform === "twitch"
      ? await refreshTwitch(tokens.refreshToken)
      : await refreshKick(tokens.refreshToken);
  if (!refreshed) return undefined;
  await upsertPlatformTokens(workspaceId, platform, {
    accessToken: refreshed.accessToken,
    refreshToken: refreshed.refreshToken ?? tokens.refreshToken,
    platformUserId: tokens.platformUserId,
    platformUsername: tokens.platformUsername,
    scope: refreshed.scope ?? tokens.scope,
    expiresAt: refreshed.expiresIn
      ? new Date(Date.now() + refreshed.expiresIn * 1000)
      : undefined,
  });
  return refreshed.accessToken;
}

export const RECONNECT_HINT =
  "Disconnect and reconnect this platform in Settings → Connections to grant chat send permissions.";
