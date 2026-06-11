const KEY = "omnichat-emote-favorites";

function storageKey(workspaceId: string) {
  return `${KEY}:${workspaceId}`;
}

export function loadEmoteFavorites(workspaceId: string | null | undefined): Set<string> {
  if (!workspaceId || typeof window === "undefined") return new Set();
  try {
    const raw = localStorage.getItem(storageKey(workspaceId));
    if (!raw) return new Set();
    const list = JSON.parse(raw) as string[];
    return new Set(list.map((n) => n.toLowerCase()));
  } catch {
    return new Set();
  }
}

export function saveEmoteFavorites(workspaceId: string, names: Set<string>) {
  localStorage.setItem(storageKey(workspaceId), JSON.stringify([...names]));
}

export function toggleEmoteFavorite(
  workspaceId: string,
  current: Set<string>,
  name: string,
): Set<string> {
  const key = name.toLowerCase();
  const next = new Set(current);
  if (next.has(key)) next.delete(key);
  else next.add(key);
  saveEmoteFavorites(workspaceId, next);
  return next;
}
