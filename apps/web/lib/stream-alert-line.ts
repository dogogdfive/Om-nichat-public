import type { StreamAlertEvent } from "@/lib/overlay-types";

const PLATFORM_COLORS: Record<string, string> = {
  twitch: "#a78bfa",
  kick: "#53FC18",
  rumble: "#85c742",
};

export function streamAlertBody(alert: StreamAlertEvent): string {
  const user = alert.user?.trim();
  if (!user) return alert.text;
  const text = alert.text.trim();
  const nameLower = user.toLowerCase();
  const lower = text.toLowerCase();
  if (lower.startsWith(nameLower)) {
    let rest = text.slice(user.length).trim();
    if (rest.startsWith(":")) rest = rest.slice(1).trim();
    return rest || text;
  }
  return text;
}

export function streamAlertToChatLine(
  alert: StreamAlertEvent,
  time: string,
): {
  kind: "message";
  id: string;
  platform: "twitch" | "kick" | "x" | "rumble";
  channelId: string;
  user: string;
  userId: string;
  login: string;
  color?: string;
  text: string;
  time: string;
  streamEventKind: StreamAlertEvent["kind"];
  streamEventAmount?: string;
} {
  const user = alert.user?.trim() || "Someone";
  const platform = alert.platform === "youtube" ? "twitch" : alert.platform;
  const safePlatform =
    platform === "kick" || platform === "x" || platform === "rumble" ? platform : "twitch";

  return {
    kind: "message",
    id: alert.id,
    platform: safePlatform,
    channelId: alert.channelId.replace(/^@/, "").replace(/^#/, "").toLowerCase(),
    user,
    userId: `event:${alert.id}`,
    login: user.replace(/^@/, "").toLowerCase(),
    color: PLATFORM_COLORS[alert.platform] ?? PLATFORM_COLORS.twitch,
    text: alert.kind === "bits" ? streamAlertBody(alert) : alert.text.trim(),
    time,
    streamEventKind: alert.kind,
    streamEventAmount: alert.amount,
  };
}
