import type { ChatTabsState } from "@omnichat/chat-tabs";
import { loadChatSettingsFromStorage } from "@omnichat/chat-tabs";
import { sanitizeWsUrl } from "./params";

let lastPostedSyncId: string | null = null;

export function markRemoteChatTabsSync(syncId?: string): void {
  if (syncId) lastPostedSyncId = syncId;
}

export async function syncChatTabsToServer(
  wsBase: string,
  workspaceId: string,
  state: ChatTabsState,
  options?: { overlayAction?: "open_channels_settings" },
): Promise<void> {
  const api = sanitizeWsUrl(wsBase)
    .replace(/^wss:\/\//, "https://")
    .replace(/^ws:\/\//, "http://");

  if (options?.overlayAction) {
    await post(api, workspaceId, { overlayAction: options.overlayAction });
    return;
  }

  if (state.syncId && state.syncId === lastPostedSyncId) return;
  lastPostedSyncId = state.syncId ?? null;
  const settings = loadChatSettingsFromStorage();
  await post(api, workspaceId, {
    state: {
      activeTabId: state.activeTabId,
      tabs: state.tabs,
      syncId: state.syncId,
    },
    channels: settings.channels,
  });
}

async function post(
  api: string,
  workspaceId: string,
  body: Record<string, unknown>,
): Promise<void> {
  try {
    await fetch(`${api}/api/workspaces/${workspaceId}/chat/tabs/sync`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    /* non-fatal */
  }
}

export function workspaceIdFromRoom(room: string): string | null {
  const m = room.match(/^room:([^:]+)/);
  return m?.[1] ?? null;
}
