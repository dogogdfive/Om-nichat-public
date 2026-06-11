import { z } from "zod";
export const PLATFORMS = ["twitch", "kick", "x", "youtube", "rumble"] as const;
export const PlatformSchema = z.enum(PLATFORMS);
export type Platform = z.infer<typeof PlatformSchema>;
export const ChatMessageSchema = z.object({
  id: z.string(), platform: PlatformSchema, platformMessageId: z.string(), channelId: z.string(),
  author: z.object({
    id: z.string(),
    displayName: z.string(),
    username: z.string().optional(),
    avatarUrl: z.string().url().optional(),
    color: z.string().optional(),
  }),
  text: z.string(), emotes: z.array(z.object({ id: z.string(), name: z.string(), url: z.string(), start: z.number(), end: z.number() })).default([]),
  badges: z.array(z.object({ url: z.string().url(), title: z.string().optional() })).optional(),
  timestamp: z.string(),
});
export type ChatMessage = z.infer<typeof ChatMessageSchema>;

export type ModAction = "timeout" | "ban" | "unban";

export type ModActionEvent = {
  platform: Platform;
  userId: string;
  login: string;
  action: ModAction;
  durationSeconds?: number;
  timestamp: string;
};

export function formatModNote(action: ModAction, durationSeconds?: number): string {
  if (action === "timeout") {
    const secs = durationSeconds ?? 0;
    return `Timed out (${secs}s)`;
  }
  if (action === "ban") return "Banned";
  return "Unbanned";
}

export type PollChoice = {
  id: string;
  title: string;
  votes: number;
};

export type PollEvent = {
  platform: Platform;
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
  platform: Platform;
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

export type StreamAlertKind =
  | "sub"
  | "resub"
  | "sub_gift"
  | "bits"
  | "donation";

export type StreamAlertEvent = {
  id: string;
  platform: Platform;
  channelId: string;
  kind: StreamAlertKind;
  text: string;
  user?: string;
  amount?: string;
  timestamp: string;
};

export type HubEvent =
  | { type: "message"; message: ChatMessage }
  | { type: "mod"; mod: ModActionEvent }
  | { type: "poll"; poll: PollEvent }
  | { type: "poll_end"; poll: PollEvent }
  | { type: "pinned"; pinned: PinnedMessageEvent }
  | { type: "pinned_clear"; platform: Platform; channelId?: string }
  | { type: "stream_alert"; alert: StreamAlertEvent };