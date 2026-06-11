import type { Platform } from "@omnichat/chat-types";
import { readEnv } from "../env.js";
import { ensureFreshAccessToken } from "../auth/token-refresh.js";
import { getPlatformTokens } from "../db/repos.js";
import { resolveTwitchUserId } from "../emotes/seventv.js";

export type ModerateAction = "timeout" | "ban" | "unban";

export type ModerationAccess = {
  canModerate: boolean;
  reason?: string;
  channelLogin?: string;
};

function helixHeaders(accessToken: string, clientId: string) {
  return {
    Authorization: `Bearer ${accessToken}`,
    "Client-Id": clientId,
  };
}

export async function canModerateTwitchChannel(
  workspaceId: string,
  channelLogin: string,
): Promise<ModerationAccess> {
  const channel = channelLogin.replace(/^@/, "").toLowerCase();
  if (!channel) {
    return { canModerate: false, reason: "Channel required", channelLogin: channel };
  }

  const accessToken = await ensureFreshAccessToken(workspaceId, "twitch");
  const tokens = await getPlatformTokens(workspaceId, "twitch");
  const moderatorId = tokens?.platformUserId;
  const clientId = readEnv("TWITCH_CLIENT_ID");
  if (!moderatorId || !accessToken || !clientId) {
    return { canModerate: false, reason: "Twitch not connected", channelLogin: channel };
  }

  const broadcasterId = await resolveTwitchUserId(channel);
  if (!broadcasterId) {
    return { canModerate: false, reason: "Unknown channel", channelLogin: channel };
  }

  if (moderatorId === broadcasterId) {
    return { canModerate: true, channelLogin: channel };
  }

  const url = new URL("https://api.twitch.tv/helix/moderation/moderators");
  url.searchParams.set("broadcaster_id", broadcasterId);
  url.searchParams.set("user_id", moderatorId);

  const res = await fetch(url, { headers: helixHeaders(accessToken, clientId) });
  if (res.status === 403) {
    return {
      canModerate: false,
      reason: "You are not a moderator in this channel",
      channelLogin: channel,
    };
  }
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    return {
      canModerate: false,
      reason: body.includes("moderator:manage:banned_users")
        ? "Reconnect Twitch with moderation permissions"
        : "Could not verify mod access",
      channelLogin: channel,
    };
  }

  const json = (await res.json()) as { data?: unknown[] };
  const canModerate = (json.data?.length ?? 0) > 0;
  return {
    canModerate,
    reason: canModerate ? undefined : "You are not a moderator in this channel",
    channelLogin: channel,
  };
}

export async function moderateChatUser(
  workspaceId: string,
  platform: Platform,
  targetUserId: string,
  action: ModerateAction,
  durationSeconds?: number,
  reason = "Moderated via OMnichat",
  channelLogin?: string,
): Promise<{ ok: boolean; error?: string }> {
  if (platform === "twitch") {
    return twitchModerateUser(
      workspaceId,
      targetUserId,
      action,
      durationSeconds,
      reason,
      channelLogin,
    );
  }
  if (platform === "kick") {
    return kickModerateUser(
      workspaceId,
      targetUserId,
      action,
      durationSeconds,
      reason,
      channelLogin,
    );
  }
  return { ok: false, error: `${platform} moderation is not supported yet` };
}

async function resolveKickBroadcasterUserId(
  workspaceId: string,
  channelSlug?: string,
): Promise<{ ok: true; id: number } | { ok: false; error: string }> {
  const tokens = await getPlatformTokens(workspaceId, "kick");
  if (!tokens?.platformUserId) {
    return { ok: false, error: "Kick not connected" };
  }

  const slug = channelSlug?.replace(/^@/, "").toLowerCase();
  const ownSlug = tokens.platformUsername?.replace(/^@/, "").toLowerCase();
  if (!slug || !ownSlug || slug === ownSlug) {
    const id = Number(tokens.platformUserId);
    if (!Number.isFinite(id)) return { ok: false, error: "Invalid Kick broadcaster id" };
    return { ok: true, id };
  }

  const res = await fetch(
    `https://api.kick.com/public/v1/channels/${encodeURIComponent(slug)}`,
  );
  if (!res.ok) {
    return { ok: false, error: "Unknown Kick channel" };
  }
  const json = (await res.json()) as { data?: { user_id?: number }[] };
  const broadcasterId = json.data?.[0]?.user_id;
  if (broadcasterId == null) {
    return { ok: false, error: "Unknown Kick channel" };
  }
  return { ok: true, id: broadcasterId };
}

async function kickModerateUser(
  workspaceId: string,
  targetUserId: string,
  action: ModerateAction,
  durationSeconds?: number,
  reason = "Moderated via OMnichat",
  channelSlug?: string,
): Promise<{ ok: boolean; error?: string }> {
  const accessToken = await ensureFreshAccessToken(workspaceId, "kick");
  if (!accessToken) {
    return { ok: false, error: "Kick not connected" };
  }

  const broadcaster = await resolveKickBroadcasterUserId(workspaceId, channelSlug);
  if (!broadcaster.ok) return { ok: false, error: broadcaster.error };

  const userId = Number(targetUserId);
  if (!Number.isFinite(userId)) {
    return { ok: false, error: "Invalid Kick user id" };
  }

  const headers = {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
  };

  if (action === "unban") {
    const res = await fetch("https://api.kick.com/public/v1/moderation/bans", {
      method: "DELETE",
      headers,
      body: JSON.stringify({
        broadcaster_user_id: broadcaster.id,
        user_id: userId,
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return { ok: false, error: `Kick ${res.status}: ${body.slice(0, 200)}` };
    }
    return { ok: true };
  }

  const payload: {
    broadcaster_user_id: number;
    user_id: number;
    reason?: string;
    duration?: number;
  } = {
    broadcaster_user_id: broadcaster.id,
    user_id: userId,
    reason: reason.slice(0, 100),
  };

  if (action === "timeout" && durationSeconds != null && durationSeconds > 0) {
    payload.duration = Math.min(10_080, Math.max(1, Math.ceil(durationSeconds / 60)));
  }

  const res = await fetch("https://api.kick.com/public/v1/moderation/bans", {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    return { ok: false, error: `Kick ${res.status}: ${body.slice(0, 200)}` };
  }
  return { ok: true };
}

async function twitchModerateUser(
  workspaceId: string,
  targetUserId: string,
  action: ModerateAction,
  durationSeconds?: number,
  reason = "Moderated via OMnichat",
  channelLogin?: string,
): Promise<{ ok: boolean; error?: string }> {
  const accessToken = await ensureFreshAccessToken(workspaceId, "twitch");
  const tokens = await getPlatformTokens(workspaceId, "twitch");
  const moderatorId = tokens?.platformUserId;
  const clientId = readEnv("TWITCH_CLIENT_ID");
  if (!moderatorId || !accessToken || !clientId) {
    return { ok: false, error: "Twitch not connected" };
  }
  if (!targetUserId || targetUserId === "unknown") {
    return { ok: false, error: "Invalid user id" };
  }

  const channel = channelLogin?.replace(/^@/, "").toLowerCase();
  let broadcasterId = moderatorId;
  if (channel) {
    const access = await canModerateTwitchChannel(workspaceId, channel);
    if (!access.canModerate) {
      return { ok: false, error: access.reason ?? "Not allowed to moderate this channel" };
    }
    const resolved = await resolveTwitchUserId(channel);
    if (!resolved) return { ok: false, error: "Unknown channel" };
    broadcasterId = resolved;
  }

  const url = new URL("https://api.twitch.tv/helix/moderation/bans");
  url.searchParams.set("broadcaster_id", broadcasterId);
  url.searchParams.set("moderator_id", moderatorId);

  const headers = {
    ...helixHeaders(accessToken, clientId),
    "Content-Type": "application/json",
  };

  if (action === "unban") {
    const res = await fetch(url, {
      method: "DELETE",
      headers,
      body: JSON.stringify({ data: { user_id: targetUserId } }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return { ok: false, error: `Helix ${res.status}: ${body.slice(0, 200)}` };
    }
    return { ok: true };
  }

  const payload: { user_id: string; reason: string; duration?: number } = {
    user_id: targetUserId,
    reason: reason.slice(0, 500),
  };
  if (action === "timeout" && durationSeconds != null && durationSeconds > 0) {
    payload.duration = durationSeconds;
  }

  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({ data: payload }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    return { ok: false, error: `Helix ${res.status}: ${body.slice(0, 200)}` };
  }
  return { ok: true };
}
