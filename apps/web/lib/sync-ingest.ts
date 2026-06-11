import { apiFetch } from "@/lib/api";

import { loadChatSettings } from "@/lib/chat-settings-storage";

import { groupChannelsByPlatform, INGEST_CHANNEL_PLATFORMS } from "@/lib/parse-channel-input";



/** Sync ingest for channels already in settings — does not auto-add discovered platforms. */
export async function syncChatIngest(workspaceId: string): Promise<void> {
  const settings = loadChatSettings();
  const grouped = groupChannelsByPlatform(settings.channels);
  const channels: Record<string, string[]> = {};
  for (const platform of INGEST_CHANNEL_PLATFORMS) {
    channels[platform] = grouped[platform] ?? [];
  }

  await apiFetch(`/api/workspaces/${workspaceId}/ingest/channels`, {
    method: "POST",
    body: JSON.stringify({ channels, skipDiscover: true }),
  });
  void apiFetch(`/api/workspaces/${workspaceId}/ingest/ensure`, { method: "POST" }).catch((err) =>
    console.warn("[sync-ingest] ensure failed", err),
  );
}

