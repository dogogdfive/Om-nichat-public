import { loadChatSettings } from "./chat-settings-storage";
import type { ChatTabsState } from "@omnichat/chat-tabs";
import { API_URL } from "./api";

let lastPostedSyncId: string | null = null;

export async function syncChatTabsToServer(
  workspaceId: string,
  state: ChatTabsState,
  options?: { overlayAction?: "open_channels_settings" },
): Promise<void> {
  if (options?.overlayAction) {
    await postTabsSync(workspaceId, { overlayAction: options.overlayAction });
    return;
  }
  if (state.syncId && state.syncId === lastPostedSyncId) return;
  lastPostedSyncId = state.syncId ?? null;
  const settings = loadChatSettings();
  await postTabsSync(workspaceId, {
    state: {
      activeTabId: state.activeTabId,
      tabs: state.tabs,
      syncId: state.syncId,
    },
    channels: settings.channels,
  });
}

export function markRemoteChatTabsSync(syncId?: string): void {
  if (syncId) lastPostedSyncId = syncId;
}

async function postTabsSync(
  workspaceId: string,
  body: Record<string, unknown>,
): Promise<void> {
  try {
    await fetch(`${API_URL}/api/workspaces/${workspaceId}/chat/tabs/sync`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    /* non-fatal */
  }
}
