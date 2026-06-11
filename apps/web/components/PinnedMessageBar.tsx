"use client";

import { memo } from "react";
import type { PinnedMessageEvent } from "@/lib/overlay-types";
import type { ResolvedEmote } from "@/lib/emotes/seventv";
import { EmoteText } from "@/components/EmoteText";
import { PlatformEmblem } from "@/components/PlatformLogos";

type Props = {
  pinned: PinnedMessageEvent[];
  emotes: Map<string, ResolvedEmote>;
  emoteSize: number;
  onDismiss?: (key: string) => void;
};

function PinIcon() {
  return (
    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M16 12V4h1V2H7v2h1v8l-2 2v2h5.2v6h1.6v-6H18v-2l-2-2z" />
    </svg>
  );
}

export const PinnedMessageBar = memo(function PinnedMessageBar({
  pinned,
  emotes,
  emoteSize,
  onDismiss,
}: Props) {
  if (pinned.length === 0) return null;
  return (
    <div className="prochat-pinned-bar">
      {pinned.map((pin) => {
        const key = `${pin.platform}:${pin.channelId ?? ""}`;
        return (
          <div key={key} className="prochat-pinned-item">
            <span className="prochat-pinned-icon" aria-hidden>
              <PinIcon />
            </span>
            <PlatformEmblem platform={pin.platform} size={15} />
            {pin.author?.displayName && (
              <span
                className="prochat-pinned-author"
                style={{ color: pin.author.color ?? "#e4e4e7" }}
              >
                {pin.author.displayName}:
              </span>
            )}
            <span className="prochat-pinned-text">
              <EmoteText text={pin.text} emotes={emotes} size={emoteSize} />
            </span>
            {onDismiss && (
              <button
                type="button"
                className="prochat-pinned-dismiss"
                aria-label="Dismiss pinned message"
                onClick={() => onDismiss(key)}
              >
                ×
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
});
