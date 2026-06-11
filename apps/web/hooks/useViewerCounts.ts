"use client";

import { useEffect, useState } from "react";
import { CHAT_SETTINGS_CHANGED, DEFAULT_SETTINGS, loadChatSettings } from "@/lib/chat-settings-storage";
import { groupChannelsByPlatform } from "@/lib/parse-channel-input";
import { fetchStreamViewers, type StreamViewerSnapshot } from "@/lib/stream-viewers";

const POLL_MS = 30_000;

export function useViewerCounts(workspaceId: string | null) {
  const [snapshot, setSnapshot] = useState<StreamViewerSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [displayMode, setDisplayMode] = useState(DEFAULT_SETTINGS.appearance.viewerCount);
  const [settingsTick, setSettingsTick] = useState(0);

  useEffect(() => {
    setDisplayMode(loadChatSettings().appearance.viewerCount);
    setSettingsTick(1);
    const onChange = () => {
      setSettingsTick((t) => t + 1);
      setDisplayMode(loadChatSettings().appearance.viewerCount);
    };
    window.addEventListener(CHAT_SETTINGS_CHANGED, onChange);
    return () => window.removeEventListener(CHAT_SETTINGS_CHANGED, onChange);
  }, []);

  useEffect(() => {
    if (!workspaceId) {
      setSnapshot(null);
      return;
    }

    let cancelled = false;
    const poll = async () => {
      setLoading(true);
      const channels = groupChannelsByPlatform(loadChatSettings().channels);
      const data = await fetchStreamViewers(workspaceId, channels);
      if (!cancelled) {
        setSnapshot(data);
        setLoading(false);
      }
    };

    void poll();
    const interval = window.setInterval(() => void poll(), POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [workspaceId, settingsTick]);

  return { snapshot, displayMode, loading };
}
