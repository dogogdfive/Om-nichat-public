import { existsSync } from "node:fs";
import { join } from "node:path";
import { syncWatchedChannels } from "../adapters/watch-channels.js";
import { readEmoteCacheEntry } from "./emote-store.js";
import { emoteAssetsDir, ensureEmoteImagesDownloaded, isMirroring, mirrorProgressFor } from "./mirror.js";
import { listWorkspaceMirrorTargets, type MirrorTarget } from "./targets.js";
import { warmWorkspace7tvChannels } from "./warm.js";

/** Warm when targets change, or retry occasionally while metadata is still pending. */
const lastKickoffSig = new Map<string, string>();
const pendingWarmAt = new Map<string, number>();
const PENDING_WARM_MS = 10_000;

function mirrorTargetSignature(targets: MirrorTarget[]): string {
  return targets
    .map((t) => t.cacheKey)
    .sort()
    .join("|");
}

export type ChannelCacheStatus = {
  label: string;
  platform: "global" | "twitch" | "kick";
  state: "ready" | "caching" | "pending";
  emoteCount: number;
  imagesCached: number;
  imagesTotal: number;
};

export type WorkspaceEmoteCacheStatus = {
  caching: boolean;
  ready: boolean;
  emoteCount: number;
  imagesCached: number;
  imagesTotal: number;
  progressPercent: number;
  targetsTotal: number;
  targetsReady: number;
  loadingChannels: string[];
  channels: ChannelCacheStatus[];
};

function countCachedImages(emotes: { id: string }[]): { cached: number; total: number } {
  const dir = emoteAssetsDir();
  let cached = 0;
  for (const e of emotes) {
    const safe = e.id.replace(/[^a-zA-Z0-9]/g, "");
    if (safe && existsSync(join(dir, `${safe}.webp`))) cached++;
  }
  return { cached, total: emotes.length };
}

function uniqueWorkspaceImageProgress(targets: MirrorTarget[]): {
  imagesCached: number;
  imagesTotal: number;
} {
  const ids = new Set<string>();
  for (const target of targets) {
    if (target.kind === "global") continue;
    const emotes = readEmoteCacheEntry(target.cacheKey)?.emotes ?? [];
    for (const e of emotes) {
      if (e.id) ids.add(e.id);
    }
  }

  const dir = emoteAssetsDir();
  let imagesCached = 0;
  for (const id of ids) {
    const safe = id.replace(/[^a-zA-Z0-9]/g, "");
    if (safe && existsSync(join(dir, `${safe}.webp`))) imagesCached++;
  }

  return { imagesCached, imagesTotal: ids.size };
}

function labelForTarget(target: MirrorTarget): string {
  if (target.kind === "global") return "Global";
  if (target.kind === "channel") return target.login;
  return target.login ?? `${target.platform}:${target.userId}`;
}

function platformForTarget(target: MirrorTarget): "global" | "twitch" | "kick" {
  if (target.kind === "global") return "global";
  if (target.platform === "twitch" || target.platform === "kick") return target.platform;
  return "twitch";
}

function statusForTarget(target: MirrorTarget): ChannelCacheStatus {
  const entry = readEmoteCacheEntry(target.cacheKey);
  const emotes = entry?.emotes ?? [];
  const images = countCachedImages(emotes);
  const progress = mirrorProgressFor(target.cacheKey);
  const active = isMirroring(target.cacheKey);
  const knownTotal = progress?.imagesTotal || images.total || emotes.length;

  let state: ChannelCacheStatus["state"] = "pending";
  if (target.kind === "global" && entry) {
    // Global is huge — metadata unlocks chat; images lazy-load in the background.
    state = "ready";
  } else if (active || progress) {
    state = "caching";
  } else if (entry && emotes.length === 0) {
    state = "ready";
  } else if (knownTotal > 0 && images.cached >= knownTotal) {
    state = "ready";
  } else if (emotes.length > 0) {
    state = "caching";
  }

  return {
    label: labelForTarget(target),
    platform: platformForTarget(target),
    state,
    emoteCount: emotes.length,
    imagesCached: progress?.imagesDone ?? images.cached,
    imagesTotal: knownTotal,
  };
}

function aggregateProgress(channels: ChannelCacheStatus[], targets: MirrorTarget[]) {
  const unique = uniqueWorkspaceImageProgress(targets);
  const loadingSet = new Set<string>();
  let targetsReady = 0;

  for (const ch of channels) {
    if (ch.state === "pending" || ch.state === "caching") {
      if (ch.label !== "Global") loadingSet.add(ch.label);
    }
    if (ch.state === "ready") targetsReady++;
  }

  const loadingChannels = [...loadingSet];
  const stillWorking = channels.some((ch) => ch.state !== "ready");

  let progressPercent = 0;
  if (unique.imagesTotal > 0) {
    progressPercent = Math.min(100, Math.round((unique.imagesCached / unique.imagesTotal) * 100));
    if (stillWorking && loadingChannels.length > 0 && progressPercent >= 100) {
      progressPercent = 99;
    }
  } else if (channels.length > 0) {
    progressPercent = Math.round((targetsReady / channels.length) * 100);
  }

  return {
    imagesCached: unique.imagesCached,
    imagesTotal: unique.imagesTotal,
    progressPercent,
    loadingChannels,
    targetsReady,
    stillWorking,
  };
}

export async function getWorkspaceEmoteCacheStatus(
  workspaceId: string,
  opts?: { kickoff?: boolean; clientChannels?: Partial<Record<string, string[]>> },
): Promise<WorkspaceEmoteCacheStatus> {
  if (opts?.clientChannels) {
    syncWatchedChannels(workspaceId, opts.clientChannels);
  }

  const targets = await listWorkspaceMirrorTargets(workspaceId, opts?.clientChannels);
  const channels = targets.map(statusForTarget);

  for (const target of targets) {
    const emotes = readEmoteCacheEntry(target.cacheKey)?.emotes ?? [];
    if (emotes.length > 0 && !isMirroring(target.cacheKey)) {
      ensureEmoteImagesDownloaded(target.cacheKey, emotes);
    }
  }

  const agg = aggregateProgress(channels, targets);

  const emoteCount = channels.reduce((sum, ch) => sum + ch.emoteCount, 0);
  const caching = agg.stillWorking;
  const ready =
    channels.length > 0 &&
    channels.every((ch) => ch.state === "ready") &&
    (emoteCount === 0 || agg.imagesTotal === 0 || agg.imagesCached >= agg.imagesTotal);

  const sig = mirrorTargetSignature(targets);
  const hasPending = channels.some((ch) => ch.state === "pending");
  const sigChanged = lastKickoffSig.get(workspaceId) !== sig;
  const pendingRetry =
    hasPending && Date.now() - (pendingWarmAt.get(workspaceId) ?? 0) > PENDING_WARM_MS;

  if (opts?.kickoff !== false && targets.length > 0 && (sigChanged || pendingRetry)) {
    if (sigChanged) lastKickoffSig.set(workspaceId, sig);
    if (pendingRetry) pendingWarmAt.set(workspaceId, Date.now());
    void warmWorkspace7tvChannels(workspaceId);
  }

  return {
    caching,
    ready,
    emoteCount,
    imagesCached: agg.imagesCached,
    imagesTotal: agg.imagesTotal,
    progressPercent: agg.progressPercent,
    targetsTotal: channels.length,
    targetsReady: agg.targetsReady,
    loadingChannels: agg.loadingChannels,
    channels,
  };
}
