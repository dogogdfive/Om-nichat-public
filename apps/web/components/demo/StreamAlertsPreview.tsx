"use client";

import { ChatMessageRow, type ChatMessageRowData } from "@/components/ChatMessageRow";
import { StreamAlertRow } from "@/components/StreamAlertRow";
import { PlatformEmblem } from "@/components/platform-icons";

/** Same streamer on both platforms — alerts only appear in that platform's channel tab. */
const CHANNEL = {
  twitch: "demostreamer",
  kick: "demostreamer",
};

const TWITCH_LINES: ChatMessageRowData[] = [
  {
    id: "t1",
    platform: "twitch",
    channelId: CHANNEL.twitch,
    user: "chat_fan42",
    userId: "u1",
    login: "chat_fan42",
    color: "#ff6b6b",
    text: "lets goooo PogChamp",
    time: "14:02:11",
  },
  {
    id: "t-sub",
    platform: "twitch",
    channelId: CHANNEL.twitch,
    user: "CoolViewer",
    userId: "event:twitch:sub:1",
    login: "coolviewer",
    color: "#a78bfa",
    text: "subscribed at Tier 1. They've subscribed for 3 months!",
    time: "14:02:18",
    streamEventKind: "sub",
  },
  {
    id: "t2",
    platform: "twitch",
    channelId: CHANNEL.twitch,
    user: "regular_chatter",
    userId: "u2",
    login: "regular_chatter",
    color: "#58a6ff",
    text: "W sub",
    time: "14:02:20",
  },
  {
    id: "t-gift",
    platform: "twitch",
    channelId: CHANNEL.twitch,
    user: "GenerousUser",
    userId: "event:twitch:gift:1",
    login: "generoususer",
    color: "#a78bfa",
    text: "is gifting 5 Tier 1 Subs to the community!",
    time: "14:02:45",
    streamEventKind: "sub_gift",
    streamEventAmount: "5",
  },
  {
    id: "t-bits",
    platform: "twitch",
    channelId: CHANNEL.twitch,
    user: "CheerFan",
    userId: "event:twitch:bits:1",
    login: "cheerfan",
    color: "#a78bfa",
    text: "cheered 100 bits: great stream keep it up!",
    time: "14:03:02",
    streamEventKind: "bits",
    streamEventAmount: "100",
  },
  {
    id: "t-resub",
    platform: "twitch",
    channelId: CHANNEL.twitch,
    user: "LoyalFan",
    userId: "event:twitch:resub:1",
    login: "loyalfan",
    color: "#a78bfa",
    text: "resubscribed at Tier 1. They've subscribed for 12 months!",
    time: "14:03:30",
    streamEventKind: "resub",
    streamEventAmount: "12",
  },
];

const KICK_LINES: ChatMessageRowData[] = [
  {
    id: "k1",
    platform: "kick",
    channelId: CHANNEL.kick,
    user: "kick_viewer",
    userId: "k1",
    login: "kick_viewer",
    color: "#f97316",
    text: "W stream chat",
    time: "14:02:12",
  },
  {
    id: "k-sub",
    platform: "kick",
    channelId: CHANNEL.kick,
    user: "KickFan",
    userId: "event:kick:sub:1",
    login: "kickfan",
    color: "#53FC18",
    text: "subscribed!",
    time: "14:02:22",
    streamEventKind: "sub",
  },
  {
    id: "k-gift",
    platform: "kick",
    channelId: CHANNEL.kick,
    user: "GenerousUser",
    userId: "event:kick:gift:1",
    login: "generoususer",
    color: "#53FC18",
    text: "gifted 5 subscriptions to the community!",
    time: "14:02:50",
    streamEventKind: "sub_gift",
    streamEventAmount: "5",
  },
  {
    id: "k-donation",
    platform: "kick",
    channelId: CHANNEL.kick,
    user: "BigDonor",
    userId: "event:kick:kicks:1",
    login: "bigdonor",
    color: "#53FC18",
    text: "sent 500 Kicks: W stream!",
    time: "14:03:05",
    streamEventKind: "donation",
    streamEventAmount: "500",
  },
  {
    id: "k2",
    platform: "kick",
    channelId: CHANNEL.kick,
    user: "another_fan",
    userId: "k2",
    login: "another_fan",
    color: "#38bdf8",
    text: "lets get it",
    time: "14:03:35",
  },
];

const EMPTY_EMOTES = { current: new Map() };

function PreviewPanel({
  platform,
  channelLogin,
  lines,
}: {
  platform: "twitch" | "kick";
  channelLogin: string;
  lines: ChatMessageRowData[];
}) {
  const tabClass =
    platform === "twitch"
      ? "prochat-alerts-preview-tab prochat-alerts-preview-tab--twitch"
      : "prochat-alerts-preview-tab prochat-alerts-preview-tab--kick";

  return (
    <div className="prochat-alerts-preview-panel">
      <div className="prochat-alerts-preview-header">
        <div className="flex items-center gap-2">
          <PlatformEmblem platform={platform} size={20} />
          <span className={tabClass}>{platform === "twitch" ? "Twitch" : "Kick"}</span>
        </div>
        <span className="prochat-alerts-preview-channel">#{channelLogin}</span>
      </div>
      <div className="prochat-alerts-preview-feed">
        {lines.map((line) => {
          if (line.userId.startsWith("event:") && line.streamEventKind) {
            const bitsText =
              line.streamEventKind === "bits"
                ? line.text.replace(/^cheered \d+ bits(?::\s*)?/i, "").trim() || line.text
                : line.text;
            return (
              <StreamAlertRow
                key={line.id}
                platform={line.platform}
                kind={line.streamEventKind}
                user={line.user}
                text={bitsText}
                color={line.color}
                amount={line.streamEventAmount}
                time={line.time}
              />
            );
          }
          return (
            <ChatMessageRow
              key={line.id}
              line={line}
              emotesRef={EMPTY_EMOTES}
              emoteSize={22}
              emotesMapSize={0}
              timestampFormat="12h"
              onOpenProfile={() => {}}
            />
          );
        })}
      </div>
      <div className="px-3 py-2 border-t border-zinc-800 text-xs text-zinc-500">
        Only events for <strong className="text-zinc-400">#{channelLogin}</strong> on{" "}
        {platform === "twitch" ? "Twitch" : "Kick"}
      </div>
    </div>
  );
}

export function StreamAlertsPreview() {
  return (
    <div className="prochat-alerts-preview-grid">
      <PreviewPanel platform="twitch" channelLogin={CHANNEL.twitch} lines={TWITCH_LINES} />
      <PreviewPanel platform="kick" channelLogin={CHANNEL.kick} lines={KICK_LINES} />
    </div>
  );
}
