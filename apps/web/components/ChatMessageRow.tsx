"use client";

import { memo, type RefObject } from "react";
import { ChatBadges } from "@/components/ChatBadges";
import { EmoteText } from "@/components/EmoteText";
import { PlatformBadge } from "@/components/PlatformLogos";
import { StreamAlertRow } from "@/components/StreamAlertRow";
import { formatChatTimestamp, timestampsHidden } from "@/lib/chat-appearance";
import type { StreamAlertKind } from "@/lib/overlay-types";
import type { ResolvedEmote } from "@/lib/emotes/seventv";

export type ChatMessageRowData = {
  id: string;
  platform: "twitch" | "kick" | "x" | "youtube" | "rumble";
  channelId: string;
  user: string;
  userId: string;
  login: string;
  color?: string;
  badges?: { url: string; title?: string }[];
  text: string;
  time: string;
  ts?: number;
  modNote?: string;
  inlineEmotes?: { id: string; name: string; url: string }[];
  streamEventKind?: StreamAlertKind;
  streamEventAmount?: string;
};

type Props = {
  line: ChatMessageRowData;
  emotesRef: RefObject<Map<string, ResolvedEmote>>;
  emoteSize: number;
  timestampFormat: string;
  emotesMapSize: number;
  onOpenProfile: (target: {
    platform: "twitch" | "kick" | "x" | "youtube" | "rumble";
    userId: string;
    displayName: string;
    login: string;
    channelLogin?: string;
  }) => void;
};

const EMPTY_EMOTES = new Map<string, ResolvedEmote>();

function ChatMessageRowInner({ line, emotesRef, emoteSize, timestampFormat, onOpenProfile }: Props) {
  const emotes = emotesRef.current ?? EMPTY_EMOTES;
  const isStreamEvent = line.userId.startsWith("event:");
  const showTime = !timestampsHidden(timestampFormat);
  const timeText = showTime
    ? line.ts != null
      ? formatChatTimestamp(timestampFormat, new Date(line.ts))
      : line.time
    : "";

  if (isStreamEvent && line.streamEventKind) {
    const bitsText =
      line.streamEventKind === "bits"
        ? line.text.replace(/^cheered \d+ bits(?::\s*)?/i, "").trim() || line.text
        : line.text;

    return (
      <StreamAlertRow
        platform={line.platform}
        kind={line.streamEventKind}
        user={line.user}
        text={bitsText}
        color={line.color}
        amount={line.streamEventAmount}
        time={timeText}
        showTime={showTime}
      />
    );
  }

  return (
    <div className="prochat-msg-row">
      {showTime && (
        <span className="text-zinc-600 text-xs tabular-nums shrink-0 pt-0.5">{timeText}</span>
      )}
      <PlatformBadge platform={line.platform} />
      <p className="min-w-0 flex-1">
        <ChatBadges badges={line.badges} />
        <button
          type="button"
          onClick={() =>
            onOpenProfile({
              platform: line.platform,
              userId: line.userId,
              displayName: line.user,
              login: line.login,
              channelLogin: line.channelId,
            })
          }
          className="font-semibold hover:underline"
          style={{ color: line.color ?? "#e4e4e7" }}
        >
          {line.user}
        </button>
        <span className="text-zinc-500">: </span>
        <span className="text-zinc-300">
          <EmoteText
            text={line.text}
            emotes={emotes}
            extraEmotes={line.inlineEmotes}
            size={emoteSize}
          />
        </span>
        {line.modNote && (
          <>
            <span className="text-zinc-500"> — </span>
            <em className="prochat-mod-note">{line.modNote}</em>
          </>
        )}
      </p>
    </div>
  );
}

export const ChatMessageRow = memo(ChatMessageRowInner, (prev, next) => {
  return (
    prev.line === next.line &&
    prev.emoteSize === next.emoteSize &&
    prev.emotesMapSize === next.emotesMapSize &&
    prev.timestampFormat === next.timestampFormat &&
    prev.onOpenProfile === next.onOpenProfile
  );
});
