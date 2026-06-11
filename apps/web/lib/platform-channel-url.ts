import { normalizeChannelHandle, normalizeChannelPlatform } from "./parse-channel-input";

/** Public channel/profile URL for a platform + handle. */
export function platformChannelUrl(platform: string, handle: string): string | null {
  const p = normalizeChannelPlatform(platform);
  const login = normalizeChannelHandle(handle);
  if (!p || !login) return null;
  switch (p) {
    case "twitch":
      return `https://twitch.tv/${login}`;
    case "kick":
      return `https://kick.com/${login}`;
    case "youtube":
      return `https://youtube.com/@${login}`;
    case "x":
      return `https://x.com/${login}`;
    case "rumble":
      return `https://rumble.com/c/${login}`;
    default:
      return null;
  }
}

export function platformChannelHost(platform: string): string {
  const p = normalizeChannelPlatform(platform);
  switch (p) {
    case "twitch":
      return "twitch.tv";
    case "kick":
      return "kick.com";
    case "youtube":
      return "youtube.com";
    case "x":
      return "x.com";
    case "rumble":
      return "rumble.com";
    default:
      return platform;
  }
}
