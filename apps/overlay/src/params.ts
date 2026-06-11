export type OverlayParams = {
  room: string;
  ws: string;
  fontSize: number;
  emoteSize: number;
  platformIcons: boolean;
  bgTransparency: number;
  eventMessages: boolean;
};

function parseBool(value: string | null, fallback: boolean): boolean {
  if (value == null || value === "") return fallback;
  return value === "1" || value.toLowerCase() === "true";
}

function parseIntParam(value: string | null, fallback: number): number {
  if (value == null || value === "") return fallback;
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) ? n : fallback;
}

export function readOverlayParams(search = location.search): OverlayParams {
  const params = new URLSearchParams(search);
  const wsRaw = (params.get("ws") ?? "ws://localhost:8787").replace(/\/$/, "");
  const ws = wsRaw.startsWith("http")
    ? wsRaw.replace(/^http:\/\//, "ws://").replace(/^https:\/\//, "wss://")
    : wsRaw;

  return {
    room: params.get("room") ?? "room:demo:public",
    ws,
    fontSize: parseIntParam(params.get("fontSize"), 18),
    emoteSize: parseIntParam(params.get("emoteSize"), 24),
    platformIcons: parseBool(params.get("platformIcons"), true),
    bgTransparency: parseIntParam(params.get("bgTransparency"), 0),
    eventMessages: parseBool(params.get("eventMessages"), true),
  };
}

export function platformIconSrc(platform: string): string {
  const id = platform.toLowerCase();
  if (id === "tiktok") return `/platform-images/tiktok/tiktok-horizontal.png`;
  if (["twitch", "kick", "x", "youtube", "rumble"].includes(id)) {
    return `/platform-images/${id}/${id}-icon.png`;
  }
  return `/platform-images/twitch/twitch-icon.png`;
}

/** Resolve emote URLs from the main app proxy when served under /overlay on omnichat.wtf */
export function resolveEmoteUrl(url: string): string {
  if (!url) return url;
  if (url.startsWith("http://") || url.startsWith("https://")) return url;
  if (url.startsWith("/api-backend/")) return url;
  if (url.startsWith("/api/emotes/")) return `/api-backend${url}`;
  return url;
}
