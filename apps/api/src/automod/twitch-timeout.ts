import { moderateChatUser } from "../chat/moderate-user.js";

export async function twitchTimeoutUser(
  workspaceId: string,
  targetUserId: string,
  durationSeconds: number,
  reason: string,
  channelLogin?: string,
): Promise<{ ok: boolean; error?: string }> {
  return moderateChatUser(
    workspaceId,
    "twitch",
    targetUserId,
    "timeout",
    durationSeconds,
    reason,
    channelLogin,
  );
}
