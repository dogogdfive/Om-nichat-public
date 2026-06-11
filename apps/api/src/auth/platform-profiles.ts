import type { Platform } from "@omnichat/chat-types";
import { readEnv } from "../env.js";

export type PlatformProfile = {
  platformUserId: string;
  username: string;
  displayName: string;
};

export async function fetchPlatformProfile(
  platform: Platform,
  accessToken: string,
): Promise<PlatformProfile> {
  switch (platform) {
    case "twitch":
      return fetchTwitchProfile(accessToken);
    case "kick":
      return fetchKickProfile(accessToken);
    case "x":
      return fetchXProfile(accessToken);
    case "youtube":
      return fetchYoutubeProfile(accessToken);
    case "rumble":
      throw new Error("Rumble uses Live Stream API URL — no OAuth profile fetch");
  }
}

async function fetchTwitchProfile(accessToken: string): Promise<PlatformProfile> {
  const clientId = readEnv("TWITCH_CLIENT_ID");
  if (!clientId) throw new Error("Missing TWITCH_CLIENT_ID");
  const res = await fetch("https://api.twitch.tv/helix/users", {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Client-Id": clientId,
    },
  });
  const json = (await res.json()) as {
    data?: { id: string; login: string; display_name: string }[];
    message?: string;
  };
  if (!res.ok || !json.data?.[0]) {
    throw new Error(`Twitch profile: ${json.message ?? res.statusText}`);
  }
  const u = json.data[0];
  return {
    platformUserId: u.id,
    username: u.login,
    displayName: u.display_name || u.login,
  };
}

async function fetchKickProfile(accessToken: string): Promise<PlatformProfile> {
  const res = await fetch("https://api.kick.com/public/v1/users", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const json = (await res.json()) as {
    data?: { user_id?: number; id?: number; name?: string; username?: string }[];
  };
  if (!res.ok || !json.data?.[0]) {
    throw new Error("Failed to load Kick profile");
  }
  const u = json.data[0];
  const id = String(u.user_id ?? u.id ?? "");
  const username = (u.name ?? u.username ?? "kickuser").replace(/^@/, "");
  if (!id) throw new Error("Kick profile missing user id");
  return { platformUserId: id, username, displayName: username };
}

async function fetchXProfile(accessToken: string): Promise<PlatformProfile> {
  const clientId = readEnv("X_CLIENT_ID");
  const headers: Record<string, string> = { Authorization: `Bearer ${accessToken}` };
  if (clientId) headers["X-Client-Id"] = clientId;

  const urls = [
    "https://api.x.com/2/users/me?user.fields=username,name",
    "https://api.twitter.com/2/users/me?user.fields=username,name",
  ];

  let lastBody = "";
  for (const url of urls) {
    const res = await fetch(url, { headers });
    const json = (await res.json().catch(() => ({}))) as {
      data?: { id: string; username: string; name?: string };
      errors?: { detail?: string; title?: string; type?: string }[];
      detail?: string;
      title?: string;
      type?: string;
    };
    if (res.ok && json.data?.id) {
      const u = json.data;
      return {
        platformUserId: u.id,
        username: u.username,
        displayName: u.name ?? u.username,
      };
    }
    const err = json.errors?.[0];
    lastBody = JSON.stringify(
      {
        status: res.status,
        url,
        error: err?.detail ?? err?.title ?? json.detail ?? json.title ?? res.statusText,
        type: err?.type ?? json.type,
      },
      null,
      2,
    );
  }

  throw new Error(`X profile: ${lastBody}`);
}

async function fetchYoutubeProfile(accessToken: string): Promise<PlatformProfile> {
  const res = await fetch("https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const json = (await res.json().catch(() => ({}))) as {
    items?: { id: string; snippet?: { title?: string; customUrl?: string } }[];
    error?: { message?: string };
  };
  const ch = json.items?.[0];
  if (!res.ok || !ch?.id) {
    throw new Error(json.error?.message ?? "No YouTube channel on this Google account");
  }
  const customUrl = ch.snippet?.customUrl?.replace(/^@/, "");
  const username = customUrl ?? ch.id;
  return {
    platformUserId: ch.id,
    username,
    displayName: ch.snippet?.title ?? username,
  };
}
