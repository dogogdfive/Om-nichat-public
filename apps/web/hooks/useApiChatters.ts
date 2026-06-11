"use client";

import { useEffect, useMemo, useState } from "react";
import { fetchChannelChatters, type ApiChannelChatters } from "@/lib/channel-chatters";
import type { StreamViewerEntry } from "@/lib/stream-viewers";

function liveChannelKey(platform: string, login: string): string {
  return `${platform}:${login.replace(/^@/, "").toLowerCase()}`;
}

export function useApiChatters(
  workspaceId: string | null,
  streams: StreamViewerEntry[],
  open: boolean,
) {
  const [apiChatters, setApiChatters] = useState<ApiChannelChatters[]>([]);
  const [loading, setLoading] = useState(false);

  const liveTargets = useMemo(
    () =>
      streams
        .filter(
          (s) =>
            (s.platform === "twitch" || s.platform === "kick") &&
            (s.isLive || s.viewers != null),
        )
        .map((s) => ({ platform: s.platform as "twitch" | "kick", login: s.login })),
    [streams],
  );

  const targetKey = useMemo(
    () => liveTargets.map((t) => liveChannelKey(t.platform, t.login)).sort().join("|"),
    [liveTargets],
  );

  useEffect(() => {
    if (!open || !workspaceId || liveTargets.length === 0) {
      setApiChatters([]);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    void fetchChannelChatters(workspaceId, liveTargets).then((data) => {
      if (!cancelled) {
        setApiChatters(data);
        setLoading(false);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [open, workspaceId, targetKey, liveTargets]);

  return { apiChatters, loadingApiChatters: loading };
}
