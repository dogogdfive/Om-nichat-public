import type { Platform } from "@omnichat/chat-types";
import { getWatchedChannels } from "../adapters/watch-channels.js";
import { sevenTvLookupTargets } from "./seventv.js";

export type MirrorTarget =
  | { kind: "global"; cacheKey: string }
  | { kind: "channel"; platform: "twitch" | "kick"; login: string; cacheKey: string }
  | { kind: "user"; platform: Platform; userId: string; login?: string; cacheKey: string };

export function mirrorKeyForChannel(platform: "twitch" | "kick", login: string): string {
  return `mirror:${platform}:${login.replace(/^@/, "").toLowerCase()}`;
}

export function mirrorKeyForUser(platform: Platform, userId: string): string {
  return `mirror:${platform}:id:${userId}`;
}

export async function listWorkspaceMirrorTargets(
  workspaceId: string,
  clientChannels?: Partial<Record<string, string[]>>,
): Promise<MirrorTarget[]> {
  const targets: MirrorTarget[] = [{ kind: "global", cacheKey: "mirror:global" }];
  const seen = new Set<string>();

  const addChannel = (platform: "twitch" | "kick", login: string) => {
    const normalized = login.replace(/^@/, "").toLowerCase();
    if (!normalized) return;
    const key = mirrorKeyForChannel(platform, normalized);
    if (seen.has(key)) return;
    seen.add(key);
    targets.push({ kind: "channel", platform, login: normalized, cacheKey: key });
  };

  const slugs = new Set<string>();
  for (const login of getWatchedChannels(workspaceId, "twitch")) slugs.add(login);
  for (const slug of getWatchedChannels(workspaceId, "kick")) slugs.add(slug);
  for (const login of clientChannels?.twitch ?? []) slugs.add(login);
  for (const slug of clientChannels?.kick ?? []) slugs.add(slug);

  for (const { platform, login } of sevenTvLookupTargets(slugs)) {
    addChannel(platform, login);
  }

  return targets;
}
