import type { ChatMessage } from "@omnichat/chat-types";

/** Twitch IRC badges string e.g. "broadcaster/1,moderator/1" */
export function parseTwitchBadges(badges?: string | Record<string, string>): Set<string> {
  const out = new Set<string>();
  if (!badges) return out;
  if (typeof badges === "object") {
    for (const k of Object.keys(badges)) out.add(k);
    return out;
  }
  for (const part of badges.split(",")) {
    const [name] = part.split("/");
    if (name) out.add(name);
  }
  return out;
}

export function shouldSkipWalletMod(opts: {
  message: ChatMessage;
  streamerPlatformUserId?: string | null;
  twitchBadges?: string | Record<string, string>;
}): boolean {
  const { message, streamerPlatformUserId, twitchBadges } = opts;
  if (streamerPlatformUserId && message.author.id === streamerPlatformUserId) return true;
  if (message.platform === "twitch" && twitchBadges) {
    const badges = parseTwitchBadges(twitchBadges);
    if (badges.has("broadcaster") || badges.has("moderator")) return true;
  }
  return false;
}
