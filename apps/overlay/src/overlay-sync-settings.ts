import {
  hydrateSettingsFromTabs,
  loadChatTabs,
  repairSettingsProfiles,
  syncChatTabsFromSettings,
  type ChatTab,
  type ChatTabsState,
} from "@omnichat/chat-tabs";
import type { ChannelRow } from "@omnichat/chat-tabs";
import {
  loadOverlaySettings,
  saveOverlaySettings,
  type SettingsSnapshot,
} from "./overlay-settings";

function normalizeHandle(handle: string): string {
  return handle.replace(/^@/, "").toLowerCase();
}

export function mergeChannelRows(a: ChannelRow[], b: ChannelRow[]): ChannelRow[] {
  const out = [...a];
  for (const ch of b) {
    const exists = out.some(
      (c) =>
        c.platform.toLowerCase() === ch.platform.toLowerCase() &&
        normalizeHandle(c.handle) === normalizeHandle(ch.handle),
    );
    if (!exists) out.push(ch);
  }
  return out;
}

function unionStreamerTabs(...lists: ChatTab[][]): ChatTab[] {
  const out: ChatTab[] = [];
  for (const tabs of lists) {
    for (const tab of tabs) {
      if (tab.isAll || tab.isCombined || tab.hidden) continue;
      const key = tab.profileId ?? tab.id;
      if (out.some((t) => (t.profileId ?? t.id) === key)) continue;
      out.push(tab);
    }
  }
  return out;
}

export function reconcileOverlaySettings(
  localSettings: SettingsSnapshot,
  opts?: { remoteChannels?: ChannelRow[]; extraTabs?: ChatTab[] },
): SettingsSnapshot {
  const localTabs = loadChatTabs().tabs;
  const channels = opts?.remoteChannels?.length
    ? mergeChannelRows(localSettings.channels, opts.remoteChannels)
    : localSettings.channels;
  const tabSources = unionStreamerTabs(localTabs, opts?.extraTabs ?? []);
  const hydrated = hydrateSettingsFromTabs(tabSources, localSettings.profiles, channels);
  return {
    profiles: repairSettingsProfiles(hydrated.profiles, hydrated.channels),
    channels: hydrated.channels,
  };
}

export function reconcileOverlayTabState(
  preferredActiveTabId?: string,
  opts?: { remoteChannels?: ChannelRow[]; remoteTabs?: ChatTab[]; remoteActiveTabId?: string },
): ChatTabsState {
  const current = loadChatTabs();
  const settings = reconcileOverlaySettings(loadOverlaySettings(), {
    remoteChannels: opts?.remoteChannels,
    extraTabs: opts?.remoteTabs,
  });
  saveOverlaySettings(settings);

  let next = syncChatTabsFromSettings(settings.profiles, settings.channels);

  const preferred =
    preferredActiveTabId ??
    opts?.remoteActiveTabId ??
    current.activeTabId;
  if (next.tabs.some((t) => t.id === preferred && !t.hidden)) {
    next = { ...next, activeTabId: preferred };
  }

  return next;
}
