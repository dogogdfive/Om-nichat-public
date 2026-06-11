import { useEffect, useState } from "react";
import { overlayApiPath } from "./overlay-api";

export type ResolvedEmote = {
  id: string;
  name: string;
  url: string;
};

function emotesToMap(list: ResolvedEmote[]): Map<string, ResolvedEmote> {
  const map = new Map<string, ResolvedEmote>();
  for (const e of list) {
    map.set(e.name, e);
    map.set(e.name.toLowerCase(), e);
  }
  return map;
}

function resolveEmoteUrl(url: string): string {
  if (!url) return url;
  if (url.startsWith("http://") || url.startsWith("https://")) return url;
  if (url.startsWith("/api-backend/")) return url;
  if (url.startsWith("/api/emotes/")) return `/api-backend${url}`;
  return url;
}

export function useOverlayEmotes(ws: string, workspaceId: string | null) {
  const [emotes, setEmotes] = useState<Map<string, ResolvedEmote>>(new Map());
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const bump = () => setTick((t) => t + 1);
    window.addEventListener("focus", bump);
    document.addEventListener("visibilitychange", bump);
    return () => {
      window.removeEventListener("focus", bump);
      document.removeEventListener("visibilitychange", bump);
    };
  }, []);

  useEffect(() => {
    if (!workspaceId) {
      setEmotes(new Map());
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(
          overlayApiPath(ws, `/api/emotes/workspace/${encodeURIComponent(workspaceId)}`),
          { credentials: "include" },
        );
        if (!res.ok || cancelled) return;
        const json = (await res.json()) as { emotes?: ResolvedEmote[] };
        const list = (json.emotes ?? []).map((e) => ({
          ...e,
          url: resolveEmoteUrl(e.url),
        }));
        if (!cancelled) setEmotes(emotesToMap(list));
      } catch {
        if (!cancelled) setEmotes(new Map());
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ws, workspaceId, tick]);

  useEffect(() => {
    if (!workspaceId) return;
    const id = window.setInterval(() => setTick((t) => t + 1), 60_000);
    return () => window.clearInterval(id);
  }, [workspaceId]);

  return emotes;
}
