import { scanWalletAddresses } from "@omnichat/automod";
import type { ChatMessage } from "@omnichat/chat-types";
import type { ChatHub } from "../hub.js";
import { getOmnibotConfig, patchOmnibotConfig } from "../settings/omnibot.js";
import { getPlatformTokens, insertAutomodAudit } from "../db/repos.js";
import { canIssueOmnibunnyCommand, parseOmnibunnyCommand } from "./commands.js";
import { kickTimeoutUser } from "./kick-timeout.js";
import { shouldSkipWalletMod } from "./skip.js";
import { twitchTimeoutUser } from "./twitch-timeout.js";

const OMNIBUNNY_REASON = "Wallet address (Omnibunny)";

export type IngestModContext = {
  twitchBadges?: string | Record<string, string>;
};

function channelLoginFromMessage(message: ChatMessage): string {
  return message.channelId.replace(/^@/, "").replace(/^#/, "").toLowerCase();
}

export async function ingestWithAutomod(
  workspaceId: string,
  message: ChatMessage,
  hub: ChatHub,
  modCtx?: IngestModContext,
): Promise<{ published: boolean; action?: string }> {
  const room = `room:${workspaceId}`;
  const publicRoom = `${room}:public`;
  const channelLogin = channelLoginFromMessage(message);

  const config = await getOmnibotConfig(workspaceId);
  const tokens = await getPlatformTokens(workspaceId, message.platform);

  const omnibunnyCommand = parseOmnibunnyCommand(message.text);
  if (
    omnibunnyCommand &&
    canIssueOmnibunnyCommand({
      message,
      streamerPlatformUserId: tokens?.platformUserId,
      streamerPlatformUsername: tokens?.platformUsername,
      twitchBadges: modCtx?.twitchBadges,
    })
  ) {
    await patchOmnibotConfig(workspaceId, {
      paused: omnibunnyCommand === "pause",
    });
    hub.ingest(room, message);
    hub.ingest(publicRoom, message);
    return { published: true, action: omnibunnyCommand === "pause" ? "paused" : "started" };
  }

  const scannerActive =
    config.enabled &&
    !config.paused &&
    config.walletScanner &&
    config.platforms[message.platform];

  if (!scannerActive) {
    hub.ingest(room, message);
    hub.ingest(publicRoom, message);
    return { published: true };
  }

  if (
    shouldSkipWalletMod({
      message,
      streamerPlatformUserId: tokens?.platformUserId,
      twitchBadges: modCtx?.twitchBadges,
    })
  ) {
    hub.ingest(room, message);
    hub.ingest(publicRoom, message);
    return { published: true };
  }

  const matches = scanWalletAddresses(message.text);
  if (matches.length === 0) {
    hub.ingest(room, message);
    hub.ingest(publicRoom, message);
    return { published: true };
  }

  const matchedPattern = matches.map((m) => m.match).join(", ");
  let action: "timeout" | "mute" | "failed" = "failed";

  if (message.platform === "twitch") {
    const result = await twitchTimeoutUser(
      workspaceId,
      message.author.id,
      config.walletTimeoutSeconds,
      OMNIBUNNY_REASON,
      channelLogin,
    );
    action = result.ok ? "timeout" : "failed";
    if (!result.ok) console.warn("[omnibunny] twitch timeout failed:", result.error);
  } else if (message.platform === "kick") {
    const result = await kickTimeoutUser(
      workspaceId,
      message.author.id,
      config.walletTimeoutSeconds,
      OMNIBUNNY_REASON,
      channelLogin,
    );
    action = result.ok ? "timeout" : "failed";
    if (!result.ok) console.warn("[omnibunny] kick timeout failed:", result.error);
  } else if (message.platform === "x") {
    action = "mute";
  }

  await insertAutomodAudit({
    workspaceId,
    platform: message.platform,
    rule: "wallet",
    targetUserId: message.author.id,
    targetDisplayName: message.author.displayName,
    matchedPattern,
    action,
  });

  if (action === "timeout") {
    const login = (message.author.username ?? message.author.displayName)
      .replace(/^@/, "")
      .toLowerCase();
    const modEvent = {
      platform: message.platform,
      userId: message.author.id,
      login,
      action: "timeout" as const,
      durationSeconds: config.walletTimeoutSeconds,
      timestamp: new Date().toISOString(),
    };
    hub.publish(room, { type: "mod", mod: modEvent });
    hub.publish(publicRoom, { type: "mod", mod: modEvent });
  }

  return { published: false, action };
}
