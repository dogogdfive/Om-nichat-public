import { moderateChatUser } from "../chat/moderate-user.js";

export async function kickTimeoutUser(
  workspaceId: string,
  targetUserId: string,
  durationSeconds: number,
  reason: string,
  channelSlug?: string,
): Promise<{ ok: boolean; error?: string }> {
  return moderateChatUser(
    workspaceId,
    "kick",
    targetUserId,
    "timeout",
    durationSeconds,
    reason,
    channelSlug,
  );
}
