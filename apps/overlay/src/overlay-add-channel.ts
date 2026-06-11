import {
  requestActivateProfileTab,
  syncChatTabsFromSettings,
  type ChatTabHandle,
} from "@omnichat/chat-tabs";
import { overlayFetch } from "./overlay-api";
import {
  loadOverlaySettings,
  saveOverlaySettings,
  type SettingsSnapshot,
} from "./overlay-settings";
import { syncChatTabsToServer } from "./sync-tabs";
import {
  groupChannelsByPlatform,
  INGEST_CHANNEL_PLATFORMS,
  isYoutubeVideoId,
  parsePlatformRowInput,
  type ChannelPlatform,
  type ParsedChannel,
} from "./parse-channel-input";

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

export async function syncIngest(
  ws: string,
  workspaceId: string,
  channels: SettingsSnapshot["channels"],
): Promise<void> {
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

  const settings = loadOverlaySettings();
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
        platform: h.platform,
        handle: h.handle,
        profileId: profile.id,
      });
    }
  }

  const profiles = [...settings.profiles, profile];
  saveOverlaySettings({ profiles, channels });
  requestActivateProfileTab(profile.id);
  const tabState = syncChatTabsFromSettings(profiles, channels);

  await syncChatTabsToServer(ws, workspaceId, tabState);
  await syncIngest(ws, workspaceId, channels).catch(() => undefined);

  return { ok: true };
}
