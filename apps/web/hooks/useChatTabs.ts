"use client";

import { useCallback, useEffect, useMemo, useState, startTransition } from "react";
import { discoverStreamerChannels } from "@/lib/discover-channels";
import {
  ALL_CHAT_TAB_ID,
  CHAT_TABS_CHANGED,
  DEFAULT_CHAT_TABS,
  combineChatTabs,
  dismissChatTabLabel,
  loadChatTabs,
  primaryHandleForTab,
  removeChatTabById,
  requestActivateProfileTab,
  reconcileChatTabsState,
  selectChatTab,
  separateCombinedTab,
  streamerTabCount,
  syncChatTabsFromSettings,
  visibleTabs,
  type ChatTab,
  type ChatTabHandle,
} from "@/lib/chat-tabs-storage";
import { syncChatTabsToServer } from "@/lib/sync-chat-tabs";
import {
  createStreamerProfile,
  loadChatSettings,
  removeProfile,
  saveChatSettings,
  CHAT_SETTINGS_CHANGED,
} from "@/lib/chat-settings-storage";
import { parseChannelInput, normalizeChannelHandle } from "@/lib/parse-channel-input";
import { resolveYoutubeParsedChannel } from "@/lib/resolve-youtube-video";
import { removeChannelEntriesForTab } from "@/lib/remove-channel-entries";
import { syncChatIngest } from "@/lib/sync-ingest";

export function useChatTabs(workspaceId: string | null) {
  const [state, setState] = useState(() => {
    if (typeof window === "undefined") return DEFAULT_CHAT_TABS;
    return loadChatTabs();
  });
  const [combineMode, setCombineModeState] = useState(false);
  const [combineSelection, setCombineSelection] = useState<string | null>(null);

  const refreshFromStorage = useCallback(() => {
    setState(loadChatTabs());
  }, []);

  const syncFromSettings = useCallback(() => {
    const settings = loadChatSettings();
    const { state: next, profiles, channels } = reconcileChatTabsState(
      settings.profiles,
      settings.channels,
    );
    if (
      profiles.length !== settings.profiles.length ||
      channels.length !== settings.channels.length
    ) {
      saveChatSettings({ ...settings, profiles, channels: channels as typeof settings.channels });
    }
    startTransition(() => setState(next));
    if (workspaceId && streamerTabCount(next.tabs) > 0) {
      void syncChatTabsToServer(workspaceId, next);
    }
  }, [workspaceId]);

  useEffect(() => {
    syncFromSettings();
    window.addEventListener(CHAT_TABS_CHANGED, refreshFromStorage);
    window.addEventListener(CHAT_SETTINGS_CHANGED, syncFromSettings);
    return () => {
      window.removeEventListener(CHAT_TABS_CHANGED, refreshFromStorage);
      window.removeEventListener(CHAT_SETTINGS_CHANGED, syncFromSettings);
    };
  }, [refreshFromStorage, syncFromSettings]);

  useEffect(() => {
    if (!workspaceId) return;
    void syncChatTabsToServer(workspaceId, loadChatTabs());
  }, [workspaceId]);

  const activeTab =
    state.tabs.find((t) => t.id === state.activeTabId) ??
    state.tabs.find((t) => t.isAll) ??
    state.tabs[0]!;

  const barTabs = useMemo(() => visibleTabs(state.tabs), [state.tabs]);

  const setActiveTabId = useCallback(
    (id: string) => {
      const next = selectChatTab(id);
      setState(next);
      if (workspaceId) void syncChatTabsToServer(workspaceId, next);
    },
    [workspaceId],
  );

  const setCombineMode = useCallback((on: boolean) => {
    setCombineModeState(on);
    if (!on) setCombineSelection(null);
  }, []);

  const combineTabs = useCallback(
    (tabAId: string, tabBId: string) => {
      const next = combineChatTabs(tabAId, tabBId);
      setState(next);
      setCombineModeState(false);
      setCombineSelection(null);
      if (workspaceId) void syncChatTabsToServer(workspaceId, next);
    },
    [workspaceId],
  );

  const separateTab = useCallback(
    (combinedId: string) => {
      const next = separateCombinedTab(combinedId);
      setState(next);
      if (workspaceId) void syncChatTabsToServer(workspaceId, next);
    },
    [workspaceId],
  );

  const removeTab = useCallback(
    (id: string) => {
      const current = loadChatTabs();
      const tab = current.tabs.find((t) => t.id === id);
      if (!tab || tab.isAll) return;

      let settings = loadChatSettings();

      if (tab.isCombined) {
        for (const profileId of tab.memberProfileIds ?? []) {
          settings = removeProfile(settings, profileId);
          const member = current.tabs.find(
            (t) => (t.profileId ?? t.id) === profileId && !t.isCombined,
          );
          if (member) dismissChatTabLabel(member.label);
        }
        dismissChatTabLabel(tab.label);
        saveChatSettings(settings);
        const synced = syncChatTabsFromSettings(settings.profiles, settings.channels);
        setState(synced);
        if (workspaceId) void syncChatTabsToServer(workspaceId, synced);
      } else {
        const profileId = tab.profileId ?? tab.id;
        const byProfile = removeProfile(settings, profileId);
        const removed =
          byProfile.channels.length !== settings.channels.length ||
          byProfile.profiles.length !== settings.profiles.length
            ? byProfile
            : removeChannelEntriesForTab(settings, tab);

        saveChatSettings({ ...settings, profiles: removed.profiles, channels: removed.channels });
        dismissChatTabLabel(tab.label);
        const next = removeChatTabById(id);
        setState(next);
        if (workspaceId) void syncChatTabsToServer(workspaceId, next);
      }

      if (workspaceId) {
        void syncChatIngest(workspaceId).catch(() => undefined);
      }
    },
    [workspaceId],
  );

  const addChannelTab = useCallback(
    async (input: string): Promise<{ ok: true; tab: ChatTab } | { ok: false; error: string }> => {
      const parsed = parseChannelInput(input);
      if ("error" in parsed) return { ok: false, error: parsed.error };

      const resolved =
        parsed.platform === "youtube" ? await resolveYoutubeParsedChannel(parsed) : parsed;
      if ("error" in resolved) return { ok: false, error: resolved.error };

      const settings = loadChatSettings();
      const duplicateChannel = settings.channels.some(
        (c) =>
          c.platform.toLowerCase() === resolved.platform &&
          c.handle.toLowerCase() === resolved.handle.toLowerCase(),
      );
      if (duplicateChannel) {
        return { ok: false, error: "That channel is already on your list" };
      }

      const profile = createStreamerProfile(resolved.handle);
      const handles: ChatTabHandle[] = [{ platform: resolved.platform, handle: resolved.handle }];

      if (workspaceId) {
        const discovery = await discoverStreamerChannels(
          workspaceId,
          resolved.platform,
          resolved.handle,
        );
        for (const ch of discovery.channels) {
          if (!handles.some((h) => h.platform === ch.platform && h.handle === ch.handle)) {
            handles.push({ platform: ch.platform, handle: ch.handle });
          }
        }
      }

      let nextChannels = [...settings.channels];
      for (const h of handles) {
        if (
          !nextChannels.some(
            (c) =>
              c.platform.toLowerCase() === h.platform.toLowerCase() &&
              c.handle.toLowerCase() === h.handle.toLowerCase(),
          )
        ) {
          nextChannels.push({
            id: crypto.randomUUID(),
            platform: h.platform,
            handle: h.handle,
            profileId: profile.id,
          });
        }
      }

      saveChatSettings({
        ...settings,
        profiles: [...settings.profiles, profile],
        channels: nextChannels,
      });

      requestActivateProfileTab(profile.id);
      const next = syncChatTabsFromSettings(
        [...settings.profiles, profile],
        nextChannels,
      );
      setState(next);
      if (workspaceId) void syncChatTabsToServer(workspaceId, next);

      const tab =
        next.tabs.find((t) => t.profileId === profile.id) ??
        ({ id: profile.id, label: profile.label, handles, profileId: profile.id } as ChatTab);

      if (workspaceId) {
        void syncChatIngest(workspaceId).catch(() => undefined);
      }

      return { ok: true, tab };
    },
    [workspaceId],
  );

  const removeStreamer = useCallback(
    (label: string) => {
      const norm = normalizeChannelHandle(label);
      const tab = loadChatTabs().tabs.find(
        (t) => !t.isAll && normalizeChannelHandle(t.label) === norm,
      );
      if (tab) {
        removeTab(tab.id);
        return;
      }
      const settings = loadChatSettings();
      const profile = settings.profiles.find(
        (p) => normalizeChannelHandle(p.label) === norm,
      );
      if (!profile) return;
      const { profiles, channels } = removeChannelEntriesForTab(settings, {
        profileId: profile.id,
        label: profile.label,
        handles: settings.channels
          .filter((c) => c.profileId === profile.id)
          .map((c) => ({ platform: c.platform, handle: c.handle })),
      });
      saveChatSettings({ ...settings, profiles, channels });
      if (workspaceId) void syncChatIngest(workspaceId).catch(() => undefined);
    },
    [removeTab, workspaceId],
  );

  const handleTabSelectInCombineMode = useCallback(
    (id: string) => {
      const tab = state.tabs.find((t) => t.id === id);
      if (!tab || tab.isAll || tab.hidden) {
        setActiveTabId(id);
        return;
      }

      if (!combineMode) {
        setActiveTabId(id);
        return;
      }

      if (!combineSelection) {
        setCombineSelection(id);
        return;
      }

      if (combineSelection === id) {
        setCombineSelection(null);
        return;
      }

      combineTabs(combineSelection, id);
    },
    [combineMode, combineSelection, combineTabs, setActiveTabId, state.tabs],
  );

  return {
    tabs: state.tabs,
    barTabs,
    activeTab,
    activeTabId: state.activeTabId,
    setActiveTabId,
    addChannelTab,
    removeTab,
    removeStreamer,
    primaryHandle: primaryHandleForTab(activeTab),
    combineMode,
    combineSelection,
    setCombineMode,
    combineTabs,
    separateTab,
    handleTabSelectInCombineMode,
  };
}
