import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export type ResolvedEmote = {
  id: string;
  name: string;
  url: string;
};

export type StoredEmoteEntry = {
  at: number;
  emotes: ResolvedEmote[];
};

const root = join(dirname(fileURLToPath(import.meta.url)), "../../../..");
export const emoteCacheDir = () => join(root, "data", "emote-cache");

function cachePath(key: string): string {
  // Keys use `mirror:platform:login` — colons are invalid on Windows paths.
  const safe = key.replace(/:/g, "__").replace(/[^a-zA-Z0-9_-]/g, "_");
  return join(emoteCacheDir(), `${safe}.json`);
}

export function readEmoteCacheEntry(key: string): StoredEmoteEntry | null {
  try {
    const raw = readFileSync(cachePath(key), "utf8");
    return JSON.parse(raw) as StoredEmoteEntry;
  } catch {
    return null;
  }
}

export function readEmoteCache(key: string, maxAgeMs: number): ResolvedEmote[] | null {
  const entry = readEmoteCacheEntry(key);
  if (!entry) return null;
  if (Date.now() - entry.at > maxAgeMs) return null;
  return entry.emotes;
}

export function writeEmoteCache(key: string, emotes: ResolvedEmote[]): void {
  mkdirSync(emoteCacheDir(), { recursive: true });
  const entry: StoredEmoteEntry = { at: Date.now(), emotes };
  writeFileSync(cachePath(key), JSON.stringify(entry));
}
