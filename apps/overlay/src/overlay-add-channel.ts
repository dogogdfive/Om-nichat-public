import {
  CHAT_SETTINGS_KEY,
  requestActivateProfileTab,
  syncChatTabsFromSettings,
  type ChatTabHandle,
} from "@omnichat/chat-tabs";
import { overlayFetch } from "./overlay-api";
import { syncChatTabsToServer } from "./sync-tabs";
import {
  groupChannelsByPlatform,
  INGEST_CHANNEL_PLATFORMS,
  isYoutubeVideoId,
  parsePlatformRowInput,
  type ChannelPlatform,
  type ParsedChannel,
} from "./parse-channel-input";

const SETTINGS_CHANGED = "omnichat-chat-settings-changed";

type ChannelEntry = {
  id: string;
  platform: string;
  handle: string;
  profileId: string;
  sendLinked?: boolean;
};

type StreamerProfile = { id: string; label: string };

type SettingsSnapshot = {
  profiles: StreamerProfile[];
  channels: ChannelEntry[];
};

function loadSettings(): SettingsSnapshot {
  try {
    const raw = localStorage.getItem(CHAT_SETTINGS_KEY);
    if (!raw) return { profiles: [], channels: [] };
    const parsed = JSON.parse(raw) as Partial<SettingsSnapshot>;
    return {
      profiles: parsed.profiles ?? [],
      channels: (parsed.channels ?? []) as ChannelEntry[],
    };
  } catch {
    return { profiles: [], channels: [] };
  }
}

function saveSettings(next: SettingsSnapshot): void {
  try {
    const raw = localStorage.getItem(CHAT_SETTINGS_KEY);
    const existing = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
    localStorage.setItem(CHAT_SETTINGS_KEY, JSON.stringify({ ...existing, ...next }));
    window.dispatchEvent(new Event(SETTINGS_CHANGED));
  } catch {
    /* ignore */
  }
}

async function resolveYoutube(
  ws: string,
  parsed: ParsedChannel,
): Promise<{ platform: "youtube"; handle: string } | { error: string }> {
  const videoId =
    parsed.youtubeVideoId ??
    (parsed.platform === "youtube" && isYoutubeVideoId(parsed.handle) ? parsed.handle : null);
  if (!videoId) {
    if (parsed.platform !== "youtube") return { error: "Not a YouTube channel" };
    return { platform: "youtube", handle: parsed.handle };
  }
  const res = await overlayFetch(
    ws,
    `/api/public/youtube/resolve?videoId=${encodeURIComponent(videoId)}`,
  );
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    return {
      error:
        body.error ??
        "Could not resolve that YouTube stream — try @channel or youtube.com/@channel instead",
    };
  }
  const body = (await res.json()) as { handle: string };
  return { platform: "youtube", handle: body.handle };
}

async function discoverChannels(
  ws: string,
  workspaceId: string,
  platform: string,
  handle: string,
): Promise<{ platform: string; handle: string }[]> {
  const res = await overlayFetch(ws, `/api/workspaces/${workspaceId}/channels/discover`, {
    method: "POST",
    body: JSON.stringify({ platform, handle }),
  });
  if (!res.ok) return [];
  const json = (await res.json()) as {
    channels?: { platform: string; handle: string; exists?: boolean }[];
  };
  return (json.channels ?? []).filter((c) => c.exists !== false);
}

async function syncIngest(ws: string, workspaceId: string, channels: ChannelEntry[]): Promise<void> {
  const grouped = groupChannelsByPlatform(channels);
  const payload: Record<string, string[]> = {};
  for (const platform of INGEST_CHANNEL_PLATFORMS) {
    payload[platform] = grouped[platform] ?? [];
  }
  await overlayFetch(ws, `/api/workspaces/${workspaceId}/ingest/channels`, {
    method: "POST",
    body: JSON.stringify({ channels: payload, skipDiscover: true }),
  });
  void overlayFetch(ws, `/api/workspaces/${workspaceId}/ingest/ensure`, { method: "POST" });
}

export async function addOverlayChannel(
  ws: string,
  workspaceId: string,
  platform: ChannelPlatform,
  rawInput: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const row = parsePlatformRowInput(platform, rawInput);
  if ("error" in row) return { ok: false, error: row.error };

  let parsed: ParsedChannel = row;
  if (platform === "youtube") {
    const resolved = await resolveYoutube(ws, row);
    if ("error" in resolved) return { ok: false, error: resolved.error };
    parsed = resolved;
  }

  const settings = loadSettings();
  const duplicate = settings.channels.some(
    (c) =>
      c.platform.toLowerCase() === parsed.platform &&
      c.handle.toLowerCase() === parsed.handle.toLowerCase(),
  );
  if (duplicate) return { ok: false, error: "That channel is already on your list" };

  const profile = {
    id: crypto.randomUUID(),
    label: parsed.handle.replace(/^@/, ""),
  };
  const handles: ChatTabHandle[] = [{ platform: parsed.platform, handle: parsed.handle }];

  const discovered = await discoverChannels(ws, workspaceId, parsed.platform, parsed.handle);
  for (const ch of discovered) {
    if (!handles.some((h) => h.platform === ch.platform && h.handle === ch.handle)) {
      handles.push({ platform: ch.platform, handle: ch.handle });
    }
  }

  const channels = [...settings.channels];
  for (const h of handles) {
    if (
      !channels.some(
        (c) =>
          c.platform.toLowerCase() === h.platform.toLowerCase() &&
          c.handle.toLowerCase() === h.handle.toLowerCase(),
      )
    ) {
      channels.push({
        id: crypto.randomUUID(),
        platform: h.platform,
        handle: h.handle,
        profileId: profile.id,
      });
    }
  }

  const profiles = [...settings.profiles, profile];
  saveSettings({ profiles, channels });
  requestActivateProfileTab(profile.id);
  const tabState = syncChatTabsFromSettings(profiles, channels);

  await syncChatTabsToServer(ws, workspaceId, tabState);
  await syncIngest(ws, workspaceId, channels).catch(() => undefined);

  return { ok: true };
}
