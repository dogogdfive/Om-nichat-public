// Local mirror of the poll/pinned hub event payloads (kept in sync with
// packages/chat-types). Defined here so the web app doesn't take a build-time
// dependency on the @omnichat/chat-types package.

export type OverlayPlatform = "twitch" | "kick" | "x" | "youtube" | "rumble";

export type PollChoice = {
  id: string;
  title: string;
  votes: number;
};

export type PollEvent = {
  platform: OverlayPlatform;
  channelId?: string;
  pollId: string;
  title: string;
  choices: PollChoice[];
  totalVotes: number;
  status: "active" | "completed" | "terminated" | "archived";
  startedAt?: string;
  endsAt?: string;
  timestamp: string;
};

export type PinnedMessageEvent = {
  platform: OverlayPlatform;
  channelId?: string;
  messageId: string;
  text: string;
  author?: {
    id?: string;
    displayName: string;
    color?: string;
  };
  pinnedUntil?: string;
  timestamp: string;
};

export type StreamAlertKind = "sub" | "resub" | "sub_gift" | "bits" | "donation";

export type StreamAlertEvent = {
  id: string;
  platform: OverlayPlatform;
  channelId: string;
  kind: StreamAlertKind;
  text: string;
  user?: string;
  amount?: string;
  timestamp: string;
};
