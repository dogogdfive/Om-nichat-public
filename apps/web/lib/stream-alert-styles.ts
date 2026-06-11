import type { StreamAlertKind } from "@/lib/overlay-types";

export function streamAlertBannerClass(
  platform: "twitch" | "kick" | "x" | "youtube" | "rumble",
  kind: StreamAlertKind,
): string {
  if (platform === "twitch") {
    if (kind === "bits") return "prochat-stream-alert prochat-stream-alert--twitch-bits";
    return "prochat-stream-alert prochat-stream-alert--twitch-sub";
  }
  if (platform === "kick") {
    if (kind === "donation") return "prochat-stream-alert prochat-stream-alert--kick-donation";
    return "prochat-stream-alert prochat-stream-alert--kick-sub";
  }
  return "prochat-stream-alert";
}

export function streamAlertUsesBanner(kind: StreamAlertKind): boolean {
  return kind === "sub" || kind === "resub" || kind === "sub_gift" || kind === "donation";
}
