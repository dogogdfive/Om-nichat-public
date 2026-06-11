"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  CHAT_SETTINGS_CHANGED,
  loadChatSettings,
} from "@/lib/chat-settings-storage";
import { CHAT_TABS_CHANGED, loadChatTabs } from "@/lib/chat-tabs-storage";
import { groupChannelsByPlatform } from "@/lib/parse-channel-input";
import { fetchEmoteCacheStatus } from "@/lib/emotes/cache-status";
import { fetchWorkspaceEmotes } from "@/lib/emotes/workspace";
import { syncChatIngest } from "@/lib/sync-ingest";
import type { ResolvedEmote } from "@/lib/emotes/seventv";

function emotesToMap(list: ResolvedEmote[]): Map<string, ResolvedEmote> {
  const map = new Map<string, ResolvedEmote>();
  for (const e of list) {
    map.set(e.name, e);
    map.set(e.name.toLowerCase(), e);
  }
  return map;
}

/** Hide the caching banner once this much of channel emote images are local. */
const CACHE_BANNER_HIDE_PERCENT = 70;

export function useEmoteSets(workspaceId: string | null) {
  const [emotes, setEmotes] = useState<Map<string, ResolvedEmote>>(new Map());
  const [emoteList, setEmoteList] = useState<ResolvedEmote[]>([]);
  const [emoteSize, setEmoteSize] = useState(24);
  const [seventvEnabled, setSeventvEnabled] = useState(true);
  const [settingsTick, setSettingsTick] = useState(0);
  const [tabsTick, setTabsTick] = useState(0);
  const [cachingEmotes, setCachingEmotes] = useState(false);
  const [cacheProgress, setCacheProgress] = useState<{
    cached: number;
    total: number;
    percent: number;
    loadingChannels: string[];
  } | null>(null);
  const readyRef = useRef(false);
  const intervalRef = useRef<number | null>(null);
  const tabsStructureRef = useRef("");
  const emoteSigRef = useRef("");

  function tabsStructureKey(): string {
    return loadChatTabs()
      .tabs.map((t) =>
        `${t.id}:${t.label}:${t.handles.map((h) => `${h.platform}@${h.handle}`).join(",")}`,
      )
      .join("|");
  }

  useEffect(() => {
    tabsStructureRef.current = tabsStructureKey();
    const onSettings = () => setSettingsTick((t) => t + 1);
    const onTabs = () => {
      const next = tabsStructureKey();
      if (next === tabsStructureRef.current) return;
      tabsStructureRef.current = next;
      setTabsTick((t) => t + 1);
    };
    window.addEventListener(CHAT_SETTINGS_CHANGED, onSettings);
    window.addEventListener(CHAT_TABS_CHANGED, onTabs);
    return () => {
      window.removeEventListener(CHAT_SETTINGS_CHANGED, onSettings);
      window.removeEventListener(CHAT_TABS_CHANGED, onTabs);
    };
  }, []);

  const loadEmotes = useCallback(async (id: string) => {
    const list = await fetchWorkspaceEmotes(id);
    const sig = `${list.length}:${list.map((e) => e.id).join(",")}`;
    if (sig !== emoteSigRef.current) {
      emoteSigRef.current = sig;
      setEmoteList(list);
      setEmotes(emotesToMap(list));
    }
    return list.length;
  }, []);

  useEffect(() => {
    const settings = loadChatSettings();
    setEmoteSize(settings.appearance.emoteSize);
    setSeventvEnabled(settings.appearance.seventv);

    if (!settings.appearance.seventv || !workspaceId) {
      emoteSigRef.current = "";
      setEmotes(new Map());
      setEmoteList([]);
      setCachingEmotes(false);
      setCacheProgress(null);
      readyRef.current = false;
      return;
    }

    let cancelled = false;
    readyRef.current = false;

    const channelsByPlatform = groupChannelsByPlatform(settings.channels);

    const stopPolling = () => {
      readyRef.current = true;
      setCachingEmotes(false);
      setCacheProgress(null);
      if (intervalRef.current != null) {
        window.clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };

    const poll = async () => {
      try {
        const status = await fetchEmoteCacheStatus(workspaceId, channelsByPlatform);
        if (cancelled) return;

        if (status.emoteCount > 0) {
          await loadEmotes(workspaceId);
        }

        // Metadata is enough for chat; image mirroring can finish in the background.
        const percent =
          status.emoteCount > 0 && status.imagesTotal === 0
            ? 100
            : status.progressPercent;

        const showBanner =
          status.caching && percent < CACHE_BANNER_HIDE_PERCENT;

        if (!showBanner || status.ready || !status.caching) {
          stopPolling();
          return;
        }

        setCachingEmotes(true);
        setCacheProgress({
          cached: status.imagesCached,
          total: status.imagesTotal,
          percent,
          loadingChannels: status.loadingChannels,
        });
      } catch {
        if (!cancelled) stopPolling();
      }
    };

    void (async () => {
      try {
        await syncChatIngest(workspaceId);
      } catch {
        /* ingest optional for status poll */
      }
      if (!cancelled) await poll();
    })();

    intervalRef.current = window.setInterval(() => {
      if (readyRef.current) return;
      void poll();
    }, 800);

    const onVisible = () => {
      if (document.visibilityState === "visible" && !readyRef.current) {
        void poll();
      }
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      if (intervalRef.current != null) {
        window.clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [workspaceId, settingsTick, tabsTick, loadEmotes]);

  return {
    emotes,
    emoteList,
    emoteSize,
    seventvEnabled,
    cachingEmotes,
    cacheProgress,
  };
}
