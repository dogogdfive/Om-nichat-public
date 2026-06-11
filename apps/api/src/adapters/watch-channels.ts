import type { Platform } from "@omnichat/chat-types";
import { getDbMode } from "../db/storage.js";
import { localDb } from "../db/local-db.js";
import { persistWatchedChannelsForPlatform } from "../db/repos.js";

const key = (workspaceId: string, platform: Platform) => `${workspaceId}:${platform}`;

/** Platforms with server-side chat ingest. Add new platforms here when ingest ships. */
export const INGEST_PLATFORMS: Platform[] = ["twitch", "kick", "x", "youtube", "rumble"];

const watched = new Map<string, Set<string>>();

function normalize(login: string): string {
  return login.replace(/^@/, "").replace(/^#/, "").toLowerCase();
}

export function setWatchedChannels(
  workspaceId: string,
  platform: Platform,
  channels: string[],
): string[] {
  const set = new Set(channels.map(normalize).filter(Boolean));
  watched.set(key(workspaceId, platform), set);
  if (getDbMode() === "local") {
    try {
      localDb.setWatchedChannels(workspaceId, platform, [...set]);
    } catch (e) {
      console.error(`[watch] persist failed ${workspaceId} ${platform}`, e);
    }
  } else {
    void persistWatchedChannelsForPlatform(workspaceId, platform, [...set]).catch((e) =>
      console.error(`[watch] postgres persist failed ${workspaceId} ${platform}`, e),
    );
  }
  return [...set];
}

export function getWatchedChannels(workspaceId: string, platform: Platform): string[] {
  return [...(watched.get(key(workspaceId, platform)) ?? [])];
}

export function syncWatchedChannels(
  workspaceId: string,
  byPlatform: Partial<Record<string, string[]>>,
): Record<Platform, string[]> {
  const out = {} as Record<Platform, string[]>;
  for (const platform of INGEST_PLATFORMS) {
    const incoming = byPlatform[platform];
    out[platform] =
      incoming !== undefined
        ? setWatchedChannels(workspaceId, platform, incoming)
        : getWatchedChannels(workspaceId, platform);
  }
  return out;
}

export function getAllWatchedChannels(workspaceId: string): Partial<Record<Platform, string[]>> {
  const out: Partial<Record<Platform, string[]>> = {};
  for (const platform of INGEST_PLATFORMS) {
    const channels = getWatchedChannels(workspaceId, platform);
    if (channels.length > 0) out[platform] = channels;
  }
  return out;
}

/** Restore in-memory watch list from postgres/local file after API restart. */
export async function hydrateWatchedChannelsFromDb(workspaceId: string): Promise<void> {
  const grouped = new Map<Platform, string[]>();

  if (getDbMode() === "local") {
    for (const row of localDb.listWatchedChannels(workspaceId)) {
      if (!grouped.has(row.platform)) grouped.set(row.platform, []);
      grouped.get(row.platform)!.push(row.slug);
    }
    for (const s of localDb.listWorkspaceSlugs(workspaceId)) {
      if (!grouped.has(s.platform)) grouped.set(s.platform, []);
      grouped.get(s.platform)!.push(s.slug);
    }
  } else {
    const { listWatchedChannelsFromDb } = await import("../db/repos.js");
    for (const row of await listWatchedChannelsFromDb(workspaceId)) {
      if (!grouped.has(row.platform)) grouped.set(row.platform, []);
      grouped.get(row.platform)!.push(row.slug);
    }
  }

  for (const [platform, slugs] of grouped) {
    if (getWatchedChannels(workspaceId, platform).length > 0) continue;
    setWatchedChannels(workspaceId, platform, slugs);
  }
}
