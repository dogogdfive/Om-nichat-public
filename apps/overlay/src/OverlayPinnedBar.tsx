import type { PinnedMessageEvent, Platform } from "@omnichat/chat-types";
import { MessageBody } from "./MessageBody";
import { platformIconSrc } from "./params";
import type { ResolvedEmote } from "./useOverlayEmotes";

type Props = {
  pinned: PinnedMessageEvent[];
  emoteMap: Map<string, ResolvedEmote>;
  emoteSize: number;
  showPlatformIcon: boolean;
  onDismiss?: (key: string) => void;
};

export function pinKey(pin: PinnedMessageEvent): string {
  return `${pin.platform}:${pin.channelId ?? ""}`;
}

export function OverlayPinnedBar({
  pinned,
  emoteMap,
  emoteSize,
  showPlatformIcon,
  onDismiss,
}: Props) {
  if (pinned.length === 0) return null;

  return (
    <div className="overlay-pinned-float" aria-label="Pinned messages">
      {pinned.map((pin) => {
        const key = pinKey(pin);
        const platform = pin.platform as Platform;
        return (
          <div key={key} className="overlay-pinned-item">
            <span className="overlay-pinned-icon" aria-hidden>
              📌
            </span>
            {showPlatformIcon ? (
              <img
                className="overlay-platform-icon"
                src={platformIconSrc(platform)}
                alt={platform}
              />
            ) : null}
            {pin.author?.displayName ? (
              <span
                className="overlay-username"
                style={{ color: pin.author.color ?? "#e4e4e7" }}
              >
                {pin.author.displayName}
              </span>
            ) : null}
            <span className="overlay-text-muted">: </span>
            <span className="overlay-pinned-text">
              <MessageBody text={pin.text} emotes={[]} emoteMap={emoteMap} emoteSize={emoteSize} />
            </span>
            {onDismiss ? (
              <button
                type="button"
                className="overlay-pinned-dismiss"
                aria-label="Dismiss pinned message"
                onClick={() => onDismiss(key)}
              >
                ×
              </button>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
