import { useCallback, useEffect, useMemo, useState } from "react";
import {
  applyRemoteChatTabs,
  combineChatTabs,
  decodeTabsBootstrap,
  loadChatSettingsFromStorage,
  loadChatTabs,
  resolveTabHandles,
  selectChatTab,
  separateCombinedTab,
  syncChatTabsFromSettings,
  visibleTabs,
  type ChatTab,
  type ChatTabsState,
} from "@omnichat/chat-tabs";
import type { OverlayParams } from "./params";
import { removeOverlayTabAndSync } from "./overlay-remove-tab";
import { SETTINGS_CHANGED } from "./overlay-settings";
import { markRemoteChatTabsSync, syncChatTabsToServer, workspaceIdFromRoom } from "./sync-tabs";

const CHAT_TABS_CHANGED = "omnichat-chat-tabs-changed";
const CHAT_SETTINGS_KEY = "omnichat-chat-settings";

export function useOverlayTabs(params: OverlayParams) {
  const workspaceId = workspaceIdFromRoom(params.room);

  const [state, setState] = useState<ChatTabsState>(() => {
    const fromUrl = decodeTabsBootstrap(params.tabsBootstrap);
    const base = fromUrl ?? loadChatTabs();
    if (params.tabId && base.tabs.some((t) => t.id === params.tabId)) {
      return { ...base, activeTabId: params.tabId };
    }
    return base;
  });
  const [combineMode, setCombineMode] = useState(false);
  const [combineSelection, setCombineSelection] = useState<string | null>(null);
  const [addPanelOpen, setAddPanelOpen] = useState(false);

  const [settingsTick, setSettingsTick] = useState(0);

  const settings = useMemo(
    () => loadChatSettingsFromStorage(),
    [state.syncId, settingsTick],
  );

  const refresh = useCallback(() => {
    setState(loadChatTabs());
  }, []);

  useEffect(() => {
    const bootstrap = decodeTabsBootstrap(params.tabsBootstrap);
    if (bootstrap) applyRemoteChatTabs(bootstrap);
    else {
      const s = loadChatSettingsFromStorage();
      if (s.channels.length > 0) syncChatTabsFromSettings(s.profiles, s.channels);
      refresh();
    }
  }, [params.tabsBootstrap, refresh]);

  useEffect(() => {
    window.addEventListener(CHAT_TABS_CHANGED, refresh);
    window.addEventListener(SETTINGS_CHANGED, refresh);
    const onStorage = (e: StorageEvent) => {
      if (e.key === "omnichat-chat-tabs" || e.key === CHAT_SETTINGS_KEY) refresh();
    };
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(CHAT_TABS_CHANGED, refresh);
      window.removeEventListener(SETTINGS_CHANGED, refresh);
      window.removeEventListener("storage", onStorage);
    };
  }, [refresh]);

  const applyRemote = useCallback(
    (remote: ChatTabsState, channels?: { platform: string; handle: string; profileId?: string }[]) => {
      markRemoteChatTabsSync(remote.syncId);
      if (channels?.length) {
        try {
          const raw = localStorage.getItem(CHAT_SETTINGS_KEY);
          const parsed = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
          localStorage.setItem(
            CHAT_SETTINGS_KEY,
            JSON.stringify({ ...parsed, channels }),
          );
          setSettingsTick((t) => t + 1);
        } catch {
          /* ignore */
        }
      }
      setCombineMode(false);
      setCombineSelection(null);
      setState(applyRemoteChatTabs(remote));
    },
    [],
  );

  const broadcast = useCallback(
    (next: ChatTabsState, overlayAction?: "open_channels_settings") => {
      if (!workspaceId) return;
      void syncChatTabsToServer(params.ws, workspaceId, next, overlayAction ? { overlayAction } : undefined);
    },
    [workspaceId, params.ws],
  );

  const barTabs = useMemo(() => visibleTabs(state.tabs), [state.tabs]);

  const activeTab =
    state.tabs.find((t) => t.id === state.activeTabId) ??
    state.tabs.find((t) => t.isAll) ??
    state.tabs[0]!;

  const resolvedActiveTab = useMemo(() => {
    if (activeTab.isAll) return activeTab;
    const handles = resolveTabHandles(activeTab, settings.profiles, settings.channels);
    return {
      ...activeTab,
      handles: handles.length > 0 ? handles : activeTab.handles,
    };
  }, [activeTab, settings]);

  const feedFilterHandles = useMemo(() => {
    if (activeTab.isAll) {
      const fromChannels = settings.channels.map((c) => ({
        platform: c.platform,
        handle: c.handle.replace(/^@/, ""),
      }));
      if (fromChannels.length > 0) return fromChannels;
      const fromTabs: { platform: string; handle: string }[] = [];
      for (const t of state.tabs) {
        if (t.isAll || t.hidden) continue;
        for (const h of t.handles) {
          const handle = h.handle.replace(/^@/, "");
          if (
            !fromTabs.some(
              (x) =>
                x.platform.toLowerCase() === h.platform.toLowerCase() &&
                x.handle.toLowerCase() === handle.toLowerCase(),
            )
          ) {
            fromTabs.push({ platform: h.platform, handle });
          }
        }
      }
      return fromTabs;
    }
    const resolved = resolveTabHandles(activeTab, settings.profiles, settings.channels);
    return resolved.length > 0 ? resolved : activeTab.handles;
  }, [activeTab, settings, state.tabs]);

  const selectTab = useCallback(
    (id: string) => {
      const tab = state.tabs.find((t) => t.id === id);
      if (!tab || tab.hidden) return;

      if (!combineMode) {
        const next = selectChatTab(id);
        setState(next);
        broadcast(next);
        return;
      }

      if (tab.isAll) return;

      if (!combineSelection) {
        setCombineSelection(id);
        return;
      }

      if (combineSelection === id) {
        setCombineSelection(null);
        return;
      }

      const next = combineChatTabs(combineSelection, id);
      setState(next);
      setCombineMode(false);
      setCombineSelection(null);
      broadcast(next);
    },
    [broadcast, combineMode, combineSelection, state.tabs],
  );

  const separateTab = useCallback(
    (combinedId: string) => {
      const next = separateCombinedTab(combinedId);
      setState(next);
      broadcast(next);
    },
    [broadcast],
  );

  const removeTab = useCallback(
    (id: string) => {
      if (!workspaceId) return;
      void removeOverlayTabAndSync(params.ws, workspaceId, id, (next) => {
        setState(next);
        broadcast(next);
        setSettingsTick((t) => t + 1);
      });
    },
    [broadcast, workspaceId, params.ws],
  );

  const openAdd = useCallback(() => {
    setCombineMode(false);
    setCombineSelection(null);
    setAddPanelOpen(true);
  }, []);

  const closeAdd = useCallback(() => {
    setAddPanelOpen(false);
  }, []);

  const refreshAfterAdd = useCallback(() => {
    setCombineMode(false);
    setCombineSelection(null);
    const s = loadChatSettingsFromStorage();
    if (s.channels.length > 0) syncChatTabsFromSettings(s.profiles, s.channels);
    refresh();
    setSettingsTick((t) => t + 1);
  }, [refresh]);

  return {
    barTabs,
    allTabs: state.tabs,
    activeTabId: state.activeTabId,
    resolvedActiveTab,
    feedFilterHandles,
    combineMode,
    combineSelection,
    addPanelOpen,
    applyRemote,
    selectTab,
    separateTab,
    removeTab,
    openAdd,
    closeAdd,
    refreshAfterAdd,
    toggleCombineMode: () => {
      setCombineMode((v) => !v);
      setCombineSelection(null);
    },
  };
}

export type { ChatTab };
