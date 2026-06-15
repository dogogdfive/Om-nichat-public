"use client";

import { useCallback, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { ChatFeed } from "@/components/ChatFeed";
import type { ChatTab, ChatTabHandle } from "@/lib/chat-tabs-storage";
import type { ResolvedEmote } from "@/lib/emotes/seventv";
import type { ChatMessageRowData } from "@/components/ChatMessageRow";

type SystemLine = {
  kind: "system";
  variant: "plain" | "welcome" | "action" | "connected";
  time: string;
  text: string;
  platforms?: ("twitch" | "kick" | "x" | "youtube" | "rumble")[];
};

type ChatLine = ({ kind: "message" } & ChatMessageRowData) | SystemLine;

type Props = {
  container: HTMLElement;
  tabLabel: string;
  lines: ChatLine[];
  activeTab: ChatTab;
  filterHandles: ChatTabHandle[];
  emotesRef: React.RefObject<Map<string, ResolvedEmote>>;
  emoteSize: number;
  timestampFormat: string;
  onClose: () => void;
};

function noop() {
  /* read-only pop-out */
}

function renderPopoutSystemLine(line: SystemLine, index: number) {
  const className =
    line.variant === "welcome"
      ? "prochat-system-welcome"
      : line.variant === "action"
        ? "prochat-system-action"
        : "prochat-system-plain";
  return (
    <div key={`sys-${index}`} className={className}>
      {line.text}
    </div>
  );
}

export function ChatPopout({
  container,
  tabLabel,
  lines,
  activeTab,
  filterHandles,
  emotesRef,
  emoteSize,
  timestampFormat,
  onClose,
}: Props) {
  const feedRef = useRef<HTMLDivElement>(null);
  const atBottomRef = useRef(true);

  const scrollToBottom = useCallback((smooth: boolean) => {
    const el = feedRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: smooth ? "smooth" : "auto" });
  }, []);

  const onFeedScroll = useCallback(() => {
    const el = feedRef.current;
    if (!el) return;
    atBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 48;
  }, []);

  useEffect(() => {
    if (!atBottomRef.current) return;
    scrollToBottom(false);
  }, [lines, scrollToBottom]);

  return createPortal(
    <div className="prochat-popout-shell">
      <header className="prochat-popout-header">
        <span className="prochat-popout-title">{tabLabel}</span>
        <button
          type="button"
          className="prochat-popout-close"
          onClick={onClose}
          aria-label="Close pop-out chat"
          title="Close pop-out"
        >
          ×
        </button>
      </header>
      <div className="prochat-popout-feed-area">
        <ChatFeed
          lines={lines}
          activeTab={activeTab}
          filterHandles={filterHandles}
          emotesRef={emotesRef}
          emoteSize={emoteSize}
          timestampFormat={timestampFormat}
          feedPaused={false}
          feedRef={feedRef}
          onFeedScroll={onFeedScroll}
          onFeedMouseEnter={noop}
          onFeedMouseLeave={noop}
          onOpenProfile={noop}
          renderSystemLine={renderPopoutSystemLine}
        />
      </div>
    </div>,
    container,
  );
}
