import type { ResolvedEmote } from "@/lib/emotes/seventv";

const preloaded = new Set<string>();

export function preloadEmoteImages(urls: string[], timeoutMs = 400): Promise<void> {
  const pending = urls.filter((u) => u && !preloaded.has(u));
  if (pending.length === 0) return Promise.resolve();

  return Promise.race([
    Promise.all(
      pending.map(
        (url) =>
          new Promise<void>((resolve) => {
            const img = new Image();
            const done = () => {
              preloaded.add(url);
              resolve();
            };
            img.onload = done;
            img.onerror = done;
            img.src = url;
          }),
      ),
    ).then(() => undefined),
    new Promise<void>((resolve) => setTimeout(resolve, timeoutMs)),
  ]);
}

export function lookupEmoteInMap(
  map: Map<string, ResolvedEmote>,
  token: string,
): ResolvedEmote | undefined {
  const direct = map.get(token);
  if (direct) return direct;
  const lower = map.get(token.toLowerCase());
  if (lower) return lower;
  const stripped = token.replace(/^[^\w]+|[^\w]+$/g, "");
  if (stripped !== token) {
    return map.get(stripped) ?? map.get(stripped.toLowerCase());
  }
  return undefined;
}

export function emoteUrlsInText(
  text: string,
  emotes: Map<string, ResolvedEmote>,
  extra?: { id: string; name: string; url: string }[],
): string[] {
  const urls = new Set<string>();
  for (const e of extra ?? []) {
    if (e.url) urls.add(e.url);
  }
  for (const part of text.split(/\s+/)) {
    if (!part) continue;
    const hit = lookupEmoteInMap(emotes, part);
    if (hit?.url) urls.add(hit.url);
  }
  return [...urls];
}
