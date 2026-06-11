import { apiFetch } from "@/lib/api";

export type StreamViewerEntry = {
  platform: "twitch" | "kick" | "x" | "youtube";
  login: string;
  isLive: boolean;
  viewers: number | null;
  title?: string;
};

export type StreamViewerSnapshot = {
  streams: StreamViewerEntry[];
  totalViewers: number;
};

export function formatViewers(count: number): string {
  if (count >= 1_000_000) {
    const v = count / 1_000_000;
    return `${v >= 10 ? Math.round(v) : v.toFixed(1).replace(/\.0$/, "")}M`;
  }
  if (count >= 10_000) return `${Math.round(count / 1000)}k`;
  if (count >= 1_000) {
    const v = count / 1000;
    return `${v.toFixed(1).replace(/\.0$/, "")}k`;
  }
  return String(count);
}

export async function fetchStreamViewers(
  workspaceId: string,
  channelsByPlatform?: Record<string, string[]>,
): Promise<StreamViewerSnapshot> {
  const params = new URLSearchParams();
  if (channelsByPlatform?.twitch?.length) {
    params.set("twitch", channelsByPlatform.twitch.join(","));
  }
  if (channelsByPlatform?.kick?.length) {
    params.set("kick", channelsByPlatform.kick.join(","));
  }
  if (channelsByPlatform?.x?.length) {
    params.set("x", channelsByPlatform.x.join(","));
  }
  if (channelsByPlatform?.youtube?.length) {
    params.set("youtube", channelsByPlatform.youtube.join(","));
  }
  const qs = params.toString();
  const res = await apiFetch(
    `/api/workspaces/${encodeURIComponent(workspaceId)}/stream/viewers${qs ? `?${qs}` : ""}`,
  );
  if (!res.ok) {
    return { streams: [], totalViewers: 0 };
  }
  return (await res.json()) as StreamViewerSnapshot;
}
