import type { ChatMessage, Platform } from "@omnichat/chat-types";
import { PLATFORMS } from "@omnichat/chat-types";
import { sendKickChat } from "../adapters/kick.js";
import { sendRumbleChat } from "../adapters/rumble-send.js";
import { sendTwitchChat } from "../adapters/twitch.js";
import { sendYoutubeChat } from "../adapters/youtube.js";
import { fetchAllEmotesForWorkspace, emotesByName, resolveEmotesInText } from "../emotes/workspace.js";
import { getConnections, getPlatformTokens } from "../db/repos.js";
import type { ChatHub } from "../hub.js";

export type SendTarget = {
  platform: Platform;
  channel: string;
};

export type SendResult = {
  platform: Platform;
  channel?: string;
  ok: boolean;
  error?: string;
  skipped?: boolean;
  via?: "helix" | "irc";
};

function outboundMessage(
  platform: Platform,
  text: string,
  tokens: { platformUserId?: string; platformUsername?: string },
  channelId: string,
  emotes: ChatMessage["emotes"] = [],
): ChatMessage {
  const login = tokens.platformUsername ?? "you";
  return {
    id: `${platform}:out-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    platform,
    platformMessageId: String(Date.now()),
    channelId,
    author: {
      id: tokens.platformUserId ?? "self",
      displayName: login,
      username: login,
    },
    text,
    emotes,
    timestamp: new Date().toISOString(),
  };
}

function normalizeTargetChannel(channel: string): string {
  return channel.replace(/^@/, "").toLowerCase();
}

export async function sendChatToPlatforms(
  workspaceId: string,
  text: string,
  hub: ChatHub,
  opts?: { platforms?: Platform[]; targets?: SendTarget[] },
): Promise<{ results: SendResult[] }> {
  const trimmed = text.trim();
  if (!trimmed) return { results: [] };

  const allEmotes = await fetchAllEmotesForWorkspace(workspaceId);
  const byName = emotesByName(allEmotes);
  const resolved = resolveEmotesInText(trimmed, byName);

  const connections = await getConnections(workspaceId);

  const targets: SendTarget[] =
    opts?.targets
      ?.filter((t) => PLATFORMS.includes(t.platform))
      .map((t) => ({ platform: t.platform, channel: normalizeTargetChannel(t.channel) }))
      .filter((t) => t.channel && connections[t.platform]?.status === "connected") ?? [];

  const results: SendResult[] = [];

  for (const target of targets) {
    const { platform, channel } = target;

    if (platform === "twitch") {
      const result = await sendTwitchChat(workspaceId, trimmed, channel);
      results.push({ platform, channel, via: result.via, ok: result.ok, error: result.error });
      if (result.ok) {
        const tokens = await getPlatformTokens(workspaceId, "twitch");
        if (tokens) {
          hub.ingest(
            `room:${workspaceId}`,
            outboundMessage("twitch", resolved.text, tokens, channel, resolved.emotes),
          );
        }
      }
      continue;
    }

    if (platform === "kick") {
      const result = await sendKickChat(workspaceId, trimmed, channel);
      results.push({ platform, channel, ...result });
      // Kick echo arrives via Pusher — skip local ingest to avoid duplicates.
      continue;
    }

    if (platform === "x") {
      results.push({
        platform: "x",
        channel,
        ok: false,
        skipped: true,
        error: "X chat send is not supported yet",
      });
      continue;
    }

    if (platform === "youtube") {
      const result = await sendYoutubeChat(workspaceId, trimmed, channel);
      results.push({ platform, channel, ...result });
      // YouTube echo arrives via live chat poll — skip local ingest to avoid duplicates.
      continue;
    }

    if (platform === "rumble") {
      const result = await sendRumbleChat(workspaceId, trimmed, channel);
      results.push({ platform, channel, ...result });
      if (result.ok) {
        const tokens = await getPlatformTokens(workspaceId, "rumble");
        if (tokens) {
          hub.ingest(
            `room:${workspaceId}`,
            outboundMessage("rumble", resolved.text, tokens, channel, resolved.emotes),
          );
        }
      }
      continue;
    }
  }

  return { results };
}
