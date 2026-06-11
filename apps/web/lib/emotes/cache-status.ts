import { apiFetch } from "@/lib/api";

export type EmoteCacheChannelStatus = {
  label: string;
  platform: "global" | "twitch" | "kick";
  state: "ready" | "caching" | "pending";
  emoteCount: number;
  imagesCached: number;
  imagesTotal: number;
};

export type EmoteCacheStatus = {
  caching: boolean;
  ready: boolean;
  emoteCount: number;
  imagesCached: number;
  imagesTotal: number;
  progressPercent: number;
  targetsTotal: number;
  targetsReady: number;
  loadingChannels: string[];
  channels: EmoteCacheChannelStatus[];
};

export async function fetchEmoteCacheStatus(
  workspaceId: string,
  channelsByPlatform?: Record<string, string[]>,
): Promise<EmoteCacheStatus> {
  const params = new URLSearchParams();
  if (channelsByPlatform?.twitch?.length) {
    params.set("twitch", channelsByPlatform.twitch.join(","));
  }
  if (channelsByPlatform?.kick?.length) {
    params.set("kick", channelsByPlatform.kick.join(","));
  }
  const qs = params.toString();
  const res = await apiFetch(
    `/api/emotes/workspace/${encodeURIComponent(workspaceId)}/status${qs ? `?${qs}` : ""}`,
  );
  if (!res.ok) {
    return {
      caching: false,
      ready: false,
      emoteCount: 0,
      imagesCached: 0,
      imagesTotal: 0,
      progressPercent: 0,
      targetsTotal: 0,
      targetsReady: 0,
      loadingChannels: [],
      channels: [],
    };
  }
  return (await res.json()) as EmoteCacheStatus;
}
