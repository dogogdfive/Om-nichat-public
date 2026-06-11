import type { ChatMessage } from "@omnichat/chat-types";
import { parseTwitchBadges } from "./skip.js";

export type OmnibunnyCommand = "pause" | "start";

/** Matches @omnibunnybot, @omni bunny bot, omnibunnybot pause/start, etc. */
export function parseOmnibunnyCommand(text: string): OmnibunnyCommand | null {
  const lower = text.trim().toLowerCase().replace(/\s+/g, " ");
  if (!/(?:@)?omnibunnybot|@?\s*omni\s*bunny\s*bot/.test(lower)) return null;
  if (/\bpause\b/.test(lower)) return "pause";
  if (/\b(start|resume|unpause)\b/.test(lower)) return "start";
  return null;
}

export function canIssueOmnibunnyCommand(opts: {
  message: ChatMessage;
  streamerPlatformUserId?: string | null;
  streamerPlatformUsername?: string | null;
  twitchBadges?: string | Record<string, string>;
}): boolean {
  const { message, streamerPlatformUserId, streamerPlatformUsername, twitchBadges } = opts;

  if (streamerPlatformUserId && message.author.id === streamerPlatformUserId) return true;

  const channel = message.channelId.replace(/^@/, "").replace(/^#/, "").toLowerCase();
  const login = (message.author.username ?? message.author.displayName)
    .replace(/^@/, "")
    .toLowerCase();
  const streamerLogin = streamerPlatformUsername?.replace(/^@/, "").toLowerCase();
  if (streamerLogin && login === streamerLogin && channel === streamerLogin) return true;

  if (message.platform === "twitch" && twitchBadges) {
    const badges = parseTwitchBadges(twitchBadges);
    if (badges.has("broadcaster") || badges.has("moderator")) return true;
  }

  return false;
}
