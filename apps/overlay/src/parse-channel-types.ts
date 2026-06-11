export type ChannelPlatform = "twitch" | "kick" | "x" | "youtube" | "rumble";

export const CHANNEL_PLATFORMS: ChannelPlatform[] = [
  "twitch",
  "kick",
  "x",
  "youtube",
  "rumble",
];

export const INGEST_CHANNEL_PLATFORMS = [
  "twitch",
  "kick",
  "x",
  "youtube",
  "rumble",
] as const;

export type ParsedChannel = {
  platform: ChannelPlatform;
  handle: string;
  youtubeVideoId?: string;
};

export function isYoutubeVideoId(value: string): boolean {
  return /^[a-zA-Z0-9_-]{11}$/.test(value.trim());
}

function extractYoutubeVideoId(parts: string[], url: URL): string | null {
  const first = parts[0] ?? "";
  if (first === "live" && parts[1] && isYoutubeVideoId(parts[1])) return parts[1];
  if (first === "watch") {
    const videoId = url.searchParams.get("v");
    if (videoId && isYoutubeVideoId(videoId)) return videoId;
  }
  if ((first === "embed" || first === "v") && parts[1] && isYoutubeVideoId(parts[1])) {
    return parts[1];
  }
  return null;
}

const RESERVED = new Set([
  "directory", "videos", "video", "settings", "popout", "chat", "clip", "clips",
  "about", "home", "i", "intent", "search", "communities", "messages",
  "notifications", "explore", "live", "dashboard", "terms", "privacy", "login",
  "signup", "user", "c",
]);

export function normalizeChannelPlatform(platform: string): ChannelPlatform | null {
  const p = platform.trim().toLowerCase();
  if (p === "twitch") return "twitch";
  if (p === "kick") return "kick";
  if (p === "x" || p === "twitter") return "x";
  if (p === "youtube" || p === "yt") return "youtube";
  if (p === "rumble") return "rumble";
  return null;
}

export function normalizeChannelHandle(handle: string): string {
  return handle.trim().replace(/^@/, "").replace(/\/+$/, "").toLowerCase();
}

function parseFromPrefix(input: string): ParsedChannel | null {
  const match = input.match(/^(twitch|kick|x|twitter|youtube|yt|rumble)[/:](.+)$/i);
  if (!match) return null;
  const platform = normalizeChannelPlatform(match[1]!);
  const handle = normalizeChannelHandle(match[2]!);
  if (!platform || !handle) return null;
  return { platform, handle };
}

function parseFromUrl(input: string): ParsedChannel | null {
  const withProto =
    input.includes("://") ? input : /^[\w.-]+\.[a-z]{2,}/i.test(input) ? `https://${input}` : null;
  if (!withProto) return null;
  let url: URL;
  try {
    url = new URL(withProto);
  } catch {
    return null;
  }
  const host = url.hostname.replace(/^www\./, "").toLowerCase();
  const parts = url.pathname.split("/").filter(Boolean);

  if (host === "twitch.tv" || host === "m.twitch.tv") {
    let slug = parts[0] ?? "";
    if (slug === "user" || slug === "u") slug = parts[1] ?? "";
    if (!slug || RESERVED.has(slug.toLowerCase())) return null;
    return { platform: "twitch", handle: normalizeChannelHandle(slug) };
  }
  if (host === "kick.com") {
    const slug = parts[0] ?? "";
    if (!slug || RESERVED.has(slug.toLowerCase())) return null;
    return { platform: "kick", handle: normalizeChannelHandle(slug) };
  }
  if (host === "x.com" || host === "twitter.com") {
    const slug = parts[0] ?? "";
    if (!slug || RESERVED.has(slug.toLowerCase())) return null;
    return { platform: "x", handle: normalizeChannelHandle(slug) };
  }
  if (host === "youtu.be") {
    const videoId = parts[0] ?? "";
    if (isYoutubeVideoId(videoId)) {
      return { platform: "youtube", handle: videoId, youtubeVideoId: videoId };
    }
  }
  if (host === "youtube.com" || host === "m.youtube.com") {
    const videoId = extractYoutubeVideoId(parts, url);
    if (videoId) return { platform: "youtube", handle: videoId, youtubeVideoId: videoId };
    const first = parts[0] ?? "";
    if (first.startsWith("@")) {
      return { platform: "youtube", handle: normalizeChannelHandle(first.slice(1)) };
    }
    if (first === "channel" && parts[1]) {
      return { platform: "youtube", handle: normalizeChannelHandle(parts[1]) };
    }
    if (first === "c" && parts[1]) {
      return { platform: "youtube", handle: normalizeChannelHandle(parts[1]) };
    }
    if (first === "user" && parts[1]) {
      return { platform: "youtube", handle: normalizeChannelHandle(parts[1]) };
    }
  }
  if (host === "rumble.com") {
    let slug = parts[0] ?? "";
    if (slug === "c" || slug === "user") slug = parts[1] ?? "";
    if (!slug || RESERVED.has(slug.toLowerCase())) return null;
    return { platform: "rumble", handle: normalizeChannelHandle(slug) };
  }
  return null;
}

export function parseChannelInput(input: string): ParsedChannel | { error: string } {
  const trimmed = input.trim();
  if (!trimmed) return { error: "Enter a channel link or username" };
  const fromUrl = parseFromUrl(trimmed);
  if (fromUrl) return fromUrl;
  const fromPrefix = parseFromPrefix(trimmed);
  if (fromPrefix) return fromPrefix;
  const bareSlug = trimmed.replace(/\s+/g, "").replace(/^@/, "").toLowerCase();
  if (/^[a-z0-9_]{2,25}$/.test(bareSlug)) {
    return { platform: "twitch", handle: bareSlug };
  }
  return {
    error:
      "Paste a channel link (youtube.com/@name, twitch.tv/name, kick.com/name) or use platform/name",
  };
}

export function groupChannelsByPlatform(
  channels: { platform: string; handle: string }[],
): Record<string, string[]> {
  const grouped: Record<string, string[]> = {};
  for (const ch of channels) {
    const platform = ch.platform.toLowerCase();
    const handle = normalizeChannelHandle(ch.handle);
    if (!handle) continue;
    if (!grouped[platform]) grouped[platform] = [];
    if (!grouped[platform].includes(handle)) grouped[platform].push(handle);
  }
  return grouped;
}

export const CHANNEL_PLATFORM_LABEL: Record<ChannelPlatform, string> = {
  twitch: "Twitch",
  kick: "Kick",
  x: "X",
  youtube: "YouTube",
  rumble: "Rumble",
};

export function channelPlatformLabel(platform: string): string {
  return CHANNEL_PLATFORM_LABEL[platform.toLowerCase() as ChannelPlatform] ?? platform;
}

export function parsePlatformRowInput(
  platform: ChannelPlatform,
  raw: string,
): { platform: ChannelPlatform; handle: string } | { error: string } {
  const trimmed = raw.trim();
  if (!trimmed) return { error: "Paste link or channel name" };
  const parsed = parseChannelInput(
    trimmed.includes("/") || trimmed.includes(".") ? trimmed : `${platform}/${trimmed}`,
  );
  if ("error" in parsed) return parsed;
  if (parsed.platform !== platform) {
    return {
      error: `That link is for ${channelPlatformLabel(parsed.platform)} — use the ${channelPlatformLabel(platform)} field`,
    };
  }
  return { platform, handle: parsed.handle };
}
