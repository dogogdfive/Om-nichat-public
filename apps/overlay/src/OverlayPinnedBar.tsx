import type { PinnedMessageEvent, Platform } from "@omnichat/chat-types";
import { MessageBody } from "./MessageBody";
import { platformIconSrc } from "./params";
import type { ResolvedEmote } from "./useOverlayEmotes";

type Props = {
  pinned: PinnedMessageEvent[];
  emoteMap: Map<string, ResolvedEmote>;
  emoteSize: number;
  showPlatformIcon: boolean;
};

export function OverlayPinnedBar({ pinned, emoteMap, emoteSize, showPlatformIcon }: Props) {
  if (pinned.length === 0) return null;

  return (
    <div className="overlay-pinned-bar" aria-label="Pinned messages">
      {pinned.map((pin) => {
        const key = `${pin.platform}:${pin.channelId ?? pin.messageId}`;
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
          </div>
        );
      })}
    </div>
  );
}
