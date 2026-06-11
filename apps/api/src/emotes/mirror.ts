import { createReadStream, existsSync, readdirSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Platform } from "@omnichat/chat-types";
import {
  emoteCacheDir,
  readEmoteCache,
  readEmoteCacheEntry,
  writeEmoteCache,
  type ResolvedEmote,
} from "./emote-store.js";
import {
  pull7tvEmotesForPlatformUser,
  pullGlobal7tvEmotes,
  resolveKickUserId,
  resolveTwitchUserId,
} from "./seventv.js";

const CHROME_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
/** Re-sync emote metadata from 7TV this often (images stay cached). */
const MIRROR_META_TTL_MS = 6 * 60 * 60 * 1000;
const CDN_7TV = "https://cdn.7tv.app/emote";
/** Parallel CDN fetches — shared pool across all channels. */
const IMAGE_POOL_SIZE = 48;

const mirroring = new Set<string>();
const downloadingKeys = new Set<string>();

type DownloadPriority = "high" | "low";

type MirrorProgress = {
  phase: "metadata" | "images";
  imagesDone: number;
  imagesTotal: number;
};

const mirrorProgress = new Map<string, MirrorProgress>();

/** Deduped download queue (high = watched channels, low = global set). */
const highQueue: string[] = [];
const lowQueue: string[] = [];
const queuedIds = new Set<string>();
const inflightIds = new Map<string, Promise<boolean>>();
const onDiskIds = new Set<string>();
const keyProgress = new Map<string, { done: number; total: number }>();
const keyPendingIds = new Map<string, Set<string>>();
const idWatchers = new Map<string, Set<string>>();

let assetsDirReady = false;
let diskIndexBuilt = false;
let poolPumpScheduled = false;

export function isMirroring(cacheKey: string): boolean {
  return mirroring.has(cacheKey) || downloadingKeys.has(cacheKey);
}

export function mirrorProgressFor(cacheKey: string): MirrorProgress | null {
  return mirrorProgress.get(cacheKey) ?? null;
}

function setMirrorPhase(cacheKey: string, phase: MirrorProgress["phase"], imagesTotal = 0) {
  mirrorProgress.set(cacheKey, { phase, imagesDone: 0, imagesTotal });
}

function clearMirrorProgress(cacheKey: string) {
  mirrorProgress.delete(cacheKey);
}

function updateKeyProgress(cacheKey: string) {
  const prog = keyProgress.get(cacheKey);
  if (!prog) return;
  mirrorProgress.set(cacheKey, {
    phase: "images",
    imagesDone: prog.done,
    imagesTotal: prog.total,
  });
  if (prog.done >= prog.total) {
    downloadingKeys.delete(cacheKey);
    keyProgress.delete(cacheKey);
    if (!mirrorProgress.has(cacheKey) || mirrorProgress.get(cacheKey)?.phase === "images") {
      clearMirrorProgress(cacheKey);
    }
  }
}

export function emoteAssetsDir(): string {
  return join(emoteCacheDir(), "assets");
}

export function localEmoteUrl(id: string): string {
  return `/api-backend/api/emotes/img/${id}.webp`;
}

function mirrorKey(platform: string, login: string): string {
  return `mirror:${platform}:${login.replace(/^@/, "").toLowerCase()}`;
}

function cdnEmoteUrl(id: string): string {
  // 1x is enough for chat rows and downloads ~3x faster than 2x.
  return `${CDN_7TV}/${id}/1x.webp`;
}

function safeEmoteId(id: string): string {
  return id.replace(/[^a-zA-Z0-9]/g, "");
}

async function ensureAssetsDir(): Promise<void> {
  if (assetsDirReady) return;
  await mkdir(emoteAssetsDir(), { recursive: true });
  assetsDirReady = true;
}

function buildDiskIndex(): void {
  if (diskIndexBuilt) return;
  diskIndexBuilt = true;
  try {
    for (const name of readdirSync(emoteAssetsDir())) {
      if (name.endsWith(".webp")) {
        onDiskIds.add(name.slice(0, -".webp".length));
      }
    }
  } catch {
    /* dir may not exist yet */
  }
}

function isOnDisk(id: string): boolean {
  buildDiskIndex();
  const safe = safeEmoteId(id);
  return isOnDiskBySafe(safe);
}

function isOnDiskBySafe(safe: string): boolean {
  return safe.length > 0 && onDiskIds.has(safe);
}

async function downloadEmoteImage(safeOrRaw: string): Promise<boolean> {
  const safe = safeEmoteId(safeOrRaw);
  if (!safe) return false;
  if (isOnDiskBySafe(safe)) return true;

  await ensureAssetsDir();
  const file = join(emoteAssetsDir(), `${safe}.webp`);

  const url = cdnEmoteUrl(safe);
  try {
    const res = await fetch(url, { headers: { "User-Agent": CHROME_UA } });
    if (!res.ok) return false;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length === 0) return false;
    await writeFile(file, buf);
    onDiskIds.add(safe);
    return true;
  } catch {
    return false;
  }
}

async function downloadEmoteImageDeduped(id: string): Promise<boolean> {
  if (isOnDisk(id)) return true;
  const safe = safeEmoteId(id);
  if (!safe) return false;

  const existing = inflightIds.get(safe);
  if (existing) return existing;

  const promise = downloadEmoteImage(id).finally(() => {
    inflightIds.delete(safe);
  });
  inflightIds.set(safe, promise);
  return promise;
}

function markIdDoneForKey(cacheKey: string, safeId: string): void {
  const pending = keyPendingIds.get(cacheKey);
  if (!pending?.delete(safeId)) return;

  const prog = keyProgress.get(cacheKey);
  if (prog) {
    prog.done++;
    updateKeyProgress(cacheKey);
  }

  if (pending.size === 0) {
    keyPendingIds.delete(cacheKey);
  }
}

function watchIdForKey(safeId: string, cacheKey: string): void {
  let watchers = idWatchers.get(safeId);
  if (!watchers) {
    watchers = new Set();
    idWatchers.set(safeId, watchers);
  }
  watchers.add(cacheKey);
}

function onIdDownloaded(safeId: string): void {
  const watchers = idWatchers.get(safeId);
  if (watchers) {
    for (const cacheKey of watchers) {
      markIdDoneForKey(cacheKey, safeId);
    }
    idWatchers.delete(safeId);
  }
}

function enqueueDownload(safeId: string, priority: DownloadPriority, cacheKey: string): void {
  watchIdForKey(safeId, cacheKey);

  if (isOnDiskBySafe(safeId)) {
    onIdDownloaded(safeId);
    return;
  }
  if (queuedIds.has(safeId) || inflightIds.has(safeId)) return;

  queuedIds.add(safeId);
  if (priority === "high") highQueue.push(safeId);
  else lowQueue.push(safeId);

  schedulePoolPump();
}

function dequeueNextId(): string | null {
  while (highQueue.length > 0) {
    const safeId = highQueue.shift()!;
    queuedIds.delete(safeId);
    if (isOnDiskBySafe(safeId)) {
      onIdDownloaded(safeId);
      continue;
    }
    return safeId;
  }
  while (lowQueue.length > 0) {
    const safeId = lowQueue.shift()!;
    queuedIds.delete(safeId);
    if (isOnDiskBySafe(safeId)) {
      onIdDownloaded(safeId);
      continue;
    }
    return safeId;
  }
  return null;
}

function schedulePoolPump(): void {
  if (poolPumpScheduled) return;
  poolPumpScheduled = true;
  queueMicrotask(() => {
    poolPumpScheduled = false;
    void pumpDownloadPool();
  });
}

async function pumpDownloadPool(): Promise<void> {
  const workers: Promise<void>[] = [];

  for (let w = 0; w < IMAGE_POOL_SIZE; w++) {
    workers.push(
      (async () => {
        while (true) {
          const safeId = dequeueNextId();
          if (!safeId) break;

          await downloadEmoteImageDeduped(safeId);
          onIdDownloaded(safeId);
        }
      })(),
    );
  }

  await Promise.all(workers);

  if (highQueue.length > 0 || lowQueue.length > 0) {
    schedulePoolPump();
  }
}

function queueImageDownloads(
  emotes: ResolvedEmote[],
  cacheKey: string,
  priority: DownloadPriority = "high",
): void {
  const pendingIds = new Set<string>();
  for (const e of emotes) {
    const safe = safeEmoteId(e.id);
    if (!safe || isOnDiskBySafe(safe)) continue;
    pendingIds.add(safe);
  }
  if (pendingIds.size === 0 && !keyProgress.has(cacheKey)) return;

  downloadingKeys.add(cacheKey);
  const alreadyPending = keyPendingIds.get(cacheKey) ?? new Set<string>();
  for (const safe of pendingIds) {
    if (!alreadyPending.has(safe)) {
      alreadyPending.add(safe);
      enqueueDownload(safe, priority, cacheKey);
    }
  }
  keyPendingIds.set(cacheKey, alreadyPending);

  if (!keyProgress.has(cacheKey)) {
    const done = emotes.filter((e) => isOnDisk(e.id)).length;
    keyProgress.set(cacheKey, { done, total: emotes.length });
    setMirrorPhase(cacheKey, "images", emotes.length);
  } else {
    updateKeyProgress(cacheKey);
  }
}

/** Resume image downloads when metadata exists but files are still missing. */
export function ensureEmoteImagesDownloaded(
  cacheKey: string,
  emotes: ResolvedEmote[],
  priority: DownloadPriority = cacheKey === "mirror:global" ? "low" : "high",
): void {
  queueImageDownloads(emotes, cacheKey, priority);
}

function toMirrored(emotes: ResolvedEmote[]): ResolvedEmote[] {
  return emotes.map((e) => ({ id: e.id, name: e.name, url: localEmoteUrl(e.id) }));
}

export function readMirroredEmotes(platform: "twitch" | "kick", login: string): ResolvedEmote[] | null {
  const key = mirrorKey(platform, login);
  const entry = readEmoteCacheEntry(key);
  if (!entry?.emotes?.length) return null;
  return entry.emotes;
}

export function readMirroredGlobalEmotes(): ResolvedEmote[] | null {
  return readEmoteCacheEntry("mirror:global")?.emotes ?? null;
}

async function fetchChannelFrom7tv(platform: "twitch" | "kick", login: string): Promise<ResolvedEmote[]> {
  if (platform === "twitch") {
    const id = await resolveTwitchUserId(login);
    if (!id) return [];
    return pull7tvEmotesForPlatformUser("twitch", id);
  }
  const id = await resolveKickUserId(login);
  if (!id) return [];
  return pull7tvEmotesForPlatformUser("kick", id);
}

/**
 * Pull a channel's 7TV set once, save metadata + queue image files locally.
 * Metadata returns immediately; images download in the shared background pool.
 */
export async function mirrorChannel7tv(platform: "twitch" | "kick", login: string): Promise<ResolvedEmote[]> {
  const normalized = login.replace(/^@/, "").toLowerCase();
  if (!normalized || normalized === "global") return [];
  const key = mirrorKey(platform, normalized);
  if (mirroring.has(key)) {
    return readMirroredEmotes(platform, normalized) ?? [];
  }

  const fresh = readEmoteCache(key, MIRROR_META_TTL_MS);
  if (fresh !== null) {
    queueImageDownloads(fresh, key, "high");
    return fresh;
  }

  mirroring.add(key);
  setMirrorPhase(key, "metadata");
  try {
    const fetched = await fetchChannelFrom7tv(platform, normalized);
    if (!fetched.length) {
      writeEmoteCache(key, []);
      return [];
    }

    const mirrored = toMirrored(fetched);
    writeEmoteCache(key, mirrored);
    queueImageDownloads(mirrored, key, "high");
    console.log(`[7tv] mirrored ${platform}:${normalized} (${mirrored.length} emotes, images queued)`);
    return mirrored;
  } catch (err) {
    console.warn(`[7tv] mirror failed ${platform}:${normalized}`, err);
    if (!readEmoteCacheEntry(key)) {
      writeEmoteCache(key, []);
    }
    return readMirroredEmotes(platform, normalized) ?? [];
  } finally {
    mirroring.delete(key);
    if (!downloadingKeys.has(key)) clearMirrorProgress(key);
  }
}

export async function mirrorPlatformUser7tv(platform: Platform, userId: string): Promise<ResolvedEmote[]> {
  const key = `mirror:${platform}:id:${userId}`;
  if (mirroring.has(key)) {
    const hit = readEmoteCache(key, Number.POSITIVE_INFINITY);
    return hit ?? [];
  }

  const fresh = readEmoteCache(key, MIRROR_META_TTL_MS);
  if (fresh !== null) {
    queueImageDownloads(fresh, key, "high");
    return fresh;
  }

  mirroring.add(key);
  setMirrorPhase(key, "metadata");
  try {
    const fetched = await pull7tvEmotesForPlatformUser(platform, userId);
    if (!fetched.length) {
      writeEmoteCache(key, []);
      return readEmoteCache(key, Number.POSITIVE_INFINITY) ?? [];
    }

    const mirrored = toMirrored(fetched);
    writeEmoteCache(key, mirrored);
    queueImageDownloads(mirrored, key, "high");
    console.log(`[7tv] mirrored ${platform} user ${userId} (${mirrored.length} emotes, images queued)`);
    return mirrored;
  } catch (err) {
    console.warn(`[7tv] mirror failed ${platform}:${userId}`, err);
    return readEmoteCache(key, Number.POSITIVE_INFINITY) ?? [];
  } finally {
    mirroring.delete(key);
    if (!downloadingKeys.has(key)) clearMirrorProgress(key);
  }
}

export async function mirrorGlobal7tv(): Promise<ResolvedEmote[]> {
  const key = "mirror:global";
  if (mirroring.has(key)) {
    return readEmoteCache(key, Number.POSITIVE_INFINITY) ?? [];
  }

  const fresh = readEmoteCache(key, MIRROR_META_TTL_MS);
  if (fresh !== null) {
    queueImageDownloads(fresh, key, "low");
    return fresh;
  }

  mirroring.add(key);
  setMirrorPhase(key, "metadata");
  try {
    const fetched = await pullGlobal7tvEmotes();
    if (!fetched.length) {
      writeEmoteCache(key, []);
      return readEmoteCache(key, Number.POSITIVE_INFINITY) ?? [];
    }

    const mirrored = toMirrored(fetched);
    writeEmoteCache(key, mirrored);
    queueImageDownloads(mirrored, key, "low");
    console.log(`[7tv] mirrored global (${mirrored.length} emotes, low-priority images queued)`);
    return mirrored;
  } finally {
    mirroring.delete(key);
    if (!downloadingKeys.has(key)) clearMirrorProgress(key);
  }
}

export function getMirroredEmoteAssetPath(id: string): string | null {
  const safe = safeEmoteId(id);
  if (!safe) return null;
  if (isOnDisk(id)) return join(emoteAssetsDir(), `${safe}.webp`);
  const file = join(emoteAssetsDir(), `${safe}.webp`);
  return existsSync(file) ? file : null;
}

export function openMirroredEmoteAsset(id: string): ReturnType<typeof createReadStream> | null {
  const path = getMirroredEmoteAssetPath(id);
  if (!path) return null;
  return createReadStream(path);
}

export async function ensureMirroredEmoteAsset(id: string): Promise<boolean> {
  if (isOnDisk(id)) return true;
  const ok = await downloadEmoteImageDeduped(id);
  return ok;
}

/** Prefer mirrored copy; falls back to live 7TV fetch path. */
export async function getChannel7tvEmotes(
  platform: "twitch" | "kick",
  login: string,
): Promise<ResolvedEmote[]> {
  const normalized = login.replace(/^@/, "").toLowerCase();
  const mirrored = readMirroredEmotes(platform, normalized);
  if (mirrored?.length) return mirrored;

  void mirrorChannel7tv(platform, normalized);
  return fetchChannelFrom7tv(platform, normalized);
}

export async function getGlobal7tvEmotesMirrored(): Promise<ResolvedEmote[]> {
  const hit = readEmoteCache("mirror:global", Number.POSITIVE_INFINITY);
  if (hit?.length) return hit;
  void mirrorGlobal7tv();
  return pullGlobal7tvEmotes();
}
