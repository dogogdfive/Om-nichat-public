import type { PinnedMessageEvent, PollEvent } from "@omnichat/chat-types";
import type { ChatHub } from "../hub.js";
import { getPlatformTokens } from "../db/repos.js";
import { readEnv } from "../env.js";
import { ensureFreshAccessToken } from "../auth/token-refresh.js";

const POLL_INTERVAL_MS = 3000;

type Registered = {
  workspaceId: string;
  lastPollSig: string;
  lastPinnedId: string | null;
};

const registry = new Map<string, Registered>();
let timer: ReturnType<typeof setInterval> | null = null;
let hubRef: ChatHub | null = null;

type HelixPoll = {
  id: string;
  title: string;
  choices: { id: string; title: string; votes?: number }[];
  status: string;
  started_at?: string;
  ends_at?: string;
};

type HelixPin = {
  message_id: string;
  sender_user_id?: string;
  sender_user_name?: string;
  message?: { text?: string };
  pinned_until?: string;
};

function helixHeaders(token: string, clientId: string) {
  return { Authorization: `Bearer ${token}`, "Client-Id": clientId };
}

async function fetchActivePoll(
  broadcasterId: string,
  token: string,
  clientId: string,
): Promise<HelixPoll | null> {
  const res = await fetch(
    `https://api.twitch.tv/helix/polls?broadcaster_id=${broadcasterId}&first=1`,
    { headers: helixHeaders(token, clientId) },
  );
  if (!res.ok) return null;
  const json = (await res.json()) as { data?: HelixPoll[] };
  return json.data?.[0] ?? null;
}

async function fetchPinnedMessage(
  broadcasterId: string,
  token: string,
  clientId: string,
): Promise<HelixPin | null> {
  // moderator_id = broadcaster_id (broadcaster is implicitly a moderator).
  const res = await fetch(
    `https://api.twitch.tv/helix/chat/pins?broadcaster_id=${broadcasterId}&moderator_id=${broadcasterId}`,
    { headers: helixHeaders(token, clientId) },
  );
  if (!res.ok) return null;
  const json = (await res.json()) as { data?: HelixPin[] };
  return json.data?.[0] ?? null;
}

function mapStatus(status: string): PollEvent["status"] {
  const s = status.toUpperCase();
  if (s === "ACTIVE") return "active";
  if (s === "COMPLETED") return "completed";
  if (s === "TERMINATED") return "terminated";
  return "archived";
}

function toPollEvent(channelId: string, poll: HelixPoll): PollEvent {
  const choices = poll.choices.map((c) => ({
    id: c.id,
    title: c.title,
    votes: c.votes ?? 0,
  }));
  return {
    platform: "twitch",
    channelId,
    pollId: poll.id,
    title: poll.title,
    choices,
    totalVotes: choices.reduce((sum, c) => sum + c.votes, 0),
    status: mapStatus(poll.status),
    startedAt: poll.started_at,
    endsAt: poll.ends_at,
    timestamp: new Date().toISOString(),
  };
}

function publishBoth(workspaceId: string, event: Parameters<ChatHub["publish"]>[1]) {
  if (!hubRef) return;
  hubRef.publish(`room:${workspaceId}`, event);
  hubRef.publish(`room:${workspaceId}:public`, event);
}

async function tickWorkspace(reg: Registered): Promise<void> {
  const clientId = readEnv("TWITCH_CLIENT_ID");
  if (!clientId) return;
  const token = await ensureFreshAccessToken(reg.workspaceId, "twitch");
  const tokens = await getPlatformTokens(reg.workspaceId, "twitch");
  const broadcasterId = tokens?.platformUserId;
  const channelId = tokens?.platformUsername?.toLowerCase();
  if (!token || !broadcasterId || !channelId) return;

  // Polls
  try {
    const poll = await fetchActivePoll(broadcasterId, token, clientId);
    if (poll && poll.status.toUpperCase() === "ACTIVE") {
      const event = toPollEvent(channelId, poll);
      const sig = `${event.pollId}:${event.choices.map((c) => c.votes).join(",")}`;
      if (sig !== reg.lastPollSig) {
        reg.lastPollSig = sig;
        publishBoth(reg.workspaceId, { type: "poll", poll: event });
      }
    } else if (reg.lastPollSig) {
      // Poll just ended/cleared — emit a final ended event if we have one.
      if (poll) {
        publishBoth(reg.workspaceId, { type: "poll_end", poll: toPollEvent(channelId, poll) });
      } else {
        publishBoth(reg.workspaceId, {
          type: "poll_end",
          poll: {
            platform: "twitch",
            channelId,
            pollId: "",
            title: "",
            choices: [],
            totalVotes: 0,
            status: "completed",
            timestamp: new Date().toISOString(),
          },
        });
      }
      reg.lastPollSig = "";
    }
  } catch {
    /* transient */
  }

  // Pinned message
  try {
    const pin = await fetchPinnedMessage(broadcasterId, token, clientId);
    if (pin?.message_id) {
      if (pin.message_id !== reg.lastPinnedId) {
        reg.lastPinnedId = pin.message_id;
        const pinned: PinnedMessageEvent = {
          platform: "twitch",
          channelId,
          messageId: pin.message_id,
          text: pin.message?.text ?? "",
          author: pin.sender_user_name
            ? { id: pin.sender_user_id, displayName: pin.sender_user_name }
            : undefined,
          pinnedUntil: pin.pinned_until,
          timestamp: new Date().toISOString(),
        };
        publishBoth(reg.workspaceId, { type: "pinned", pinned });
      }
    } else if (reg.lastPinnedId) {
      reg.lastPinnedId = null;
      publishBoth(reg.workspaceId, { type: "pinned_clear", platform: "twitch", channelId });
    }
  } catch {
    /* transient */
  }
}

function ensureTimer(): void {
  if (timer) return;
  timer = setInterval(() => {
    for (const reg of registry.values()) {
      void tickWorkspace(reg);
    }
  }, POLL_INTERVAL_MS);
  // Don't keep the process alive solely for polling.
  (timer as { unref?: () => void }).unref?.();
}

export function startTwitchPolls(workspaceId: string, hub: ChatHub): void {
  hubRef = hub;
  if (!registry.has(workspaceId)) {
    registry.set(workspaceId, { workspaceId, lastPollSig: "", lastPinnedId: null });
  }
  ensureTimer();
}

export function stopTwitchPolls(workspaceId: string): void {
  registry.delete(workspaceId);
  if (registry.size === 0 && timer) {
    clearInterval(timer);
    timer = null;
  }
}
