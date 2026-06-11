"use client";

import { PlatformBadge } from "@/components/PlatformLogos";
import type { StreamAlertKind } from "@/lib/overlay-types";
import { streamAlertBannerClass, streamAlertUsesBanner } from "@/lib/stream-alert-styles";

type Props = {
  platform: "twitch" | "kick" | "x" | "youtube" | "rumble";
  kind: StreamAlertKind;
  user: string;
  text: string;
  color?: string;
  amount?: string;
  time?: string;
  showTime?: boolean;
};

export function StreamAlertRow({
  platform,
  kind,
  user,
  text,
  color,
  amount,
  time,
  showTime = true,
}: Props) {
  const userColor = color ?? (platform === "kick" ? "#53FC18" : "#a78bfa");

  if (streamAlertUsesBanner(kind)) {
    return (
      <div className={streamAlertBannerClass(platform, kind)}>
        {showTime && time ? (
          <span className="prochat-stream-alert-time">{time}</span>
        ) : null}
        <PlatformBadge platform={platform} />
        <p className="prochat-stream-alert-copy">
          <span className="prochat-stream-alert-user" style={{ color: userColor }}>
            {user}
          </span>{" "}
          <span className="prochat-stream-alert-text">{text}</span>
        </p>
      </div>
    );
  }

  if (kind === "bits" && platform === "twitch") {
    const bits = amount ?? "100";
    return (
      <div className={streamAlertBannerClass(platform, kind)}>
        {showTime && time ? (
          <span className="prochat-stream-alert-time">{time}</span>
        ) : null}
        <PlatformBadge platform={platform} />
        <p className="prochat-stream-alert-copy">
          <span className="prochat-bits-badge" aria-hidden>
            ◆
          </span>
          <span className="prochat-stream-alert-user" style={{ color: userColor }}>
            {user}
          </span>
          <span className="text-zinc-500">: </span>
          <span className="prochat-bits-prefix">cheer{bits} </span>
          <span className="prochat-stream-alert-text">{text}</span>
        </p>
      </div>
    );
  }

  return (
    <div className="prochat-msg-row">
      {showTime && time ? (
        <span className="text-zinc-600 text-xs tabular-nums shrink-0 pt-0.5">{time}</span>
      ) : null}
      <PlatformBadge platform={platform} />
      <p className="min-w-0 flex-1">
        <span className="font-semibold" style={{ color: userColor }}>
          {user}
        </span>
        <span className="text-zinc-500">: </span>
        <span className="text-zinc-300">{text}</span>
      </p>
    </div>
  );
}
