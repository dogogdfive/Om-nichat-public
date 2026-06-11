import {
  dismissChatTabLabel,
  loadChatTabs,
  removeChatTabById,
  syncChatTabsFromSettings,
  type ChatTabsState,
} from "@omnichat/chat-tabs";
import {
  loadOverlaySettings,
  removeChannelEntriesForTab,
  removeProfileFromSettings,
  saveOverlaySettings,
} from "./overlay-settings";
import { syncIngest } from "./overlay-add-channel";

function findTab(idOrProfileId: string) {
  const current = loadChatTabs();
  const tab =
    current.tabs.find((t) => t.id === idOrProfileId) ??
    current.tabs.find(
      (t) => !t.isAll && !t.isCombined && (t.profileId ?? t.id) === idOrProfileId,
    );
  return { current, tab };
}

export function removeOverlayTab(
  idOrProfileId: string,
): { tabState: ChatTabsState; settingsChanged: boolean } {
  const { current, tab } = findTab(idOrProfileId);
  if (!tab || tab.isAll) {
    const settings = loadOverlaySettings();
    const profile = settings.profiles.find((p) => p.id === idOrProfileId);
    if (!profile) {
      return { tabState: current, settingsChanged: false };
    }
    const nextSettings = removeProfileFromSettings(settings, profile.id);
    saveOverlaySettings(nextSettings);
    dismissChatTabLabel(profile.label);
    const tabState = syncChatTabsFromSettings(nextSettings.profiles, nextSettings.channels);
    return { tabState, settingsChanged: true };
  }

  let settings = loadOverlaySettings();

  if (tab.isCombined) {
    for (const profileId of tab.memberProfileIds ?? []) {
      settings = removeProfileFromSettings(settings, profileId);
      const member = current.tabs.find(
        (t) => (t.profileId ?? t.id) === profileId && !t.isCombined,
      );
      if (member) dismissChatTabLabel(member.label);
    }
    dismissChatTabLabel(tab.label);
    saveOverlaySettings(settings);
    const tabState = syncChatTabsFromSettings(settings.profiles, settings.channels);
    return { tabState, settingsChanged: true };
  }

  const profileId = tab.profileId ?? tab.id;
  const byProfile = removeProfileFromSettings(settings, profileId);
  const removed =
    byProfile.channels.length !== settings.channels.length ||
    byProfile.profiles.length !== settings.profiles.length
      ? byProfile
      : removeChannelEntriesForTab(settings, tab);

  saveOverlaySettings(removed);
  dismissChatTabLabel(tab.label);
  const tabState = removeChatTabById(tab.id);
  return { tabState, settingsChanged: true };
}

export async function removeOverlayTabAndSync(
  ws: string,
  workspaceId: string,
  idOrProfileId: string,
  syncToServer: (state: ChatTabsState) => void,
): Promise<void> {
  const { tabState, settingsChanged } = removeOverlayTab(idOrProfileId);
  syncToServer(tabState);
  if (settingsChanged) {
    await syncIngest(ws, workspaceId, loadOverlaySettings().channels).catch(() => undefined);
  }
}
