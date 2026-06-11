import { apiFetch } from "@/lib/api";

export type DiscoveredChannel = {
  platform: "twitch" | "kick" | "youtube" | "x";
  handle: string;
  exists: boolean;
  isLive: boolean;
  displayName?: string;
  viewers?: number | null;
  title?: string;
};

export type ChannelDiscoveryResult = {
  seed: { platform: string; handle: string };
  candidates: string[];
  channels: DiscoveredChannel[];
  live: DiscoveredChannel[];
};

export async function discoverStreamerChannels(
  workspaceId: string,
  platform: string,
  handle: string,
): Promise<ChannelDiscoveryResult> {
  const res = await apiFetch(
    `/api/workspaces/${encodeURIComponent(workspaceId)}/channels/discover`,
    {
      method: "POST",
      body: JSON.stringify({ platform, handle }),
    },
  );
  if (!res.ok) {
    return {
      seed: { platform, handle },
      candidates: [],
      channels: [],
      live: [],
    };
  }
  return (await res.json()) as ChannelDiscoveryResult;
}

export function mergeDiscoveredChannels(
  existing: { id: string; platform: string; handle: string; sendLinked?: boolean }[],
  discovered: DiscoveredChannel[],
): { id: string; platform: string; handle: string; sendLinked?: boolean }[] {
  const seen = new Set(existing.map((c) => `${c.platform}:${c.handle.toLowerCase()}`));
  const merged = [...existing];
  for (const ch of discovered) {
    const key = `${ch.platform}:${ch.handle.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push({
      id: crypto.randomUUID(),
      platform: ch.platform,
      handle: ch.handle,
      sendLinked: false,
    });
  }
  return merged;
}

export function formatDiscoveryMessage(
  discovered: DiscoveredChannel[],
  seed?: { platform: string; handle: string },
): string | null {
  const extras = discovered.filter((c) => {
    if (!c.exists) return false;
    if (
      seed &&
      c.platform === seed.platform &&
      c.handle.toLowerCase() === seed.handle.toLowerCase()
    ) {
      return false;
    }
    return true;
  });
  if (extras.length === 0) return null;

  const platformLabel = (p: string) => {
    if (p === "youtube") return "YouTube";
    if (p === "x") return "X";
    return p.charAt(0).toUpperCase() + p.slice(1);
  };

  const parts = extras.map((c) => `${platformLabel(c.platform)} @${c.handle}`);
  const live = extras.filter((c) => c.isLive);
  if (live.length > 0 && live.length === extras.length) {
    return `Also live on ${parts.join(", ")} — add them separately in Channels if you want to watch or send there.`;
  }
  if (live.length > 0) {
    const liveParts = live.map((c) => `${platformLabel(c.platform)} @${c.handle}`);
    return `Also found on ${parts.join(", ")} (${liveParts.join(", ")} live) — add each platform manually if needed.`;
  }
  return `Also found on ${parts.join(", ")} — add them separately in Channels if you want to watch or send there.`;
}
