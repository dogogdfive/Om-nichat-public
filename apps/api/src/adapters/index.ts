import type { Platform } from "@omnichat/chat-types";
import type { ChatHub } from "../hub.js";
import { recordError } from "../debug.js";
import { warmWorkspace7tvChannels } from "../emotes/warm.js";
import { startKickIngest } from "./kick.js";
import { startTwitchIngest } from "./twitch.js";
import { startTwitchPolls } from "./twitch-polls.js";
import { startXIngest } from "./x.js";
import { startRumbleIngest } from "./rumble.js";
import { startYoutubeIngest } from "./youtube.js";

export async function onPlatformLinked(
  workspaceId: string,
  platform: Platform,
  hub: ChatHub,
): Promise<void> {
  try {
    if (platform === "twitch") {
      await startTwitchIngest(workspaceId, hub);
      startTwitchPolls(workspaceId, hub);
    } else if (platform === "kick") {
      await startKickIngest(workspaceId, hub);
    } else if (platform === "x") {
      await startXIngest(workspaceId, hub);
    } else if (platform === "youtube") {
      await startYoutubeIngest(workspaceId, hub);
    } else if (platform === "rumble") {
      await startRumbleIngest(workspaceId, hub);
    }
  } catch (err) {
    recordError(`ingest:${platform}`, err, { workspaceId });
  }
  warmWorkspace7tvChannels(workspaceId);
}
