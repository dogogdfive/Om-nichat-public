"use client";

import { memo, useCallback, useMemo } from "react";
import { messageMatchesChatTab } from "@/components/ChatChannelTabs";
import type { ChatTab, ChatTabHandle } from "@/lib/chat-tabs-storage";
import { ChatMessageRow, type ChatMessageRowData } from "@/components/ChatMessageRow";
import type { ResolvedEmote } from "@/lib/emotes/seventv";

type SystemVariant = "plain" | "welcome" | "action" | "connected";

type SystemLine = {
  kind: "system";
  variant: SystemVariant;
  time: string;
  text: string;
  platforms?: ("twitch" | "kick" | "x" | "youtube" | "rumble")[];
};

type ChatLine = ({ kind: "message" } & ChatMessageRowData) | SystemLine;

type ProfileTarget = {
  platform: "twitch" | "kick" | "x" | "youtube" | "rumble";
  userId: string;
  displayName: string;
  login: string;
  channelLogin?: string;
};

type Props = {
  lines: ChatLine[];
  activeTab: ChatTab;
  filterHandles: ChatTabHandle[];
  emotesRef: React.RefObject<Map<string, ResolvedEmote>>;
  emoteSize: number;
  timestampFormat: string;
  feedPaused: boolean;
  feedRef: React.RefObject<HTMLDivElement | null>;
  onFeedScroll: () => void;
  onFeedMouseEnter: () => void;
  onFeedMouseLeave: () => void;
  onOpenProfile: (target: ProfileTarget) => void;
  renderSystemLine: (line: SystemLine, index: number) => React.ReactNode;
  emptyHint?: React.ReactNode;
};

export const ChatFeed = memo(function ChatFeed({
  lines,
  activeTab,
  filterHandles,
  emotesRef,
  emoteSize,
  timestampFormat,
  feedPaused,
  feedRef,
  onFeedScroll,
  onFeedMouseEnter,
  onFeedMouseLeave,
  onOpenProfile,
  renderSystemLine,
  emptyHint,
}: Props) {
  const visibleLines = useMemo(() => {
    return lines.filter((l) => {
      if (l.kind === "message" && !messageMatchesChatTab(l, activeTab, filterHandles)) {
        return false;
      }
      return true;
    });
  }, [lines, activeTab, filterHandles]);

  const stableOpenProfile = useCallback(
    (target: ProfileTarget) => onOpenProfile(target),
    [onOpenProfile],
  );

  return (
    <div
      ref={feedRef}
      className="prochat-feed"
      onScroll={onFeedScroll}
      onMouseEnter={onFeedMouseEnter}
      onMouseLeave={onFeedMouseLeave}
    >
      <div className="prochat-feed-inner">
        {visibleLines.map((line, i) => {
          if (line.kind === "system") {
            return renderSystemLine(line, i);
          }
          return (
            <ChatMessageRow
              key={line.id}
              line={line}
              emotesRef={emotesRef}
              emoteSize={emoteSize}
              emotesMapSize={emotesRef.current?.size ?? 0}
              timestampFormat={timestampFormat}
              onOpenProfile={stableOpenProfile}
            />
          );
        })}
        {visibleLines.length === 0 && emptyHint}
      </div>
      {feedPaused && (
        <div className="prochat-feed-paused">Chat paused — move mouse away to resume</div>
      )}
    </div>
  );
});
