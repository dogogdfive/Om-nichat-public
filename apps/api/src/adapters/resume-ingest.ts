import type { ChatHub } from "../hub.js";
import { getConnections, listAllWorkspaces } from "../db/repos.js";
import {
  getWatchedChannels,
  hydrateWatchedChannelsFromDb,
  INGEST_PLATFORMS,
} from "./watch-channels.js";import { onPlatformLinked } from "./index.js";

export async function resumeIngestForWorkspace(
  workspaceId: string,
  hub: ChatHub,
): Promise<void> {
  await hydrateWatchedChannelsFromDb(workspaceId);
  const conn = await getConnections(workspaceId);
  for (const platform of INGEST_PLATFORMS) {
    const hasChannels = getWatchedChannels(workspaceId, platform).length > 0;
    if (conn[platform].status === "connected" || hasChannels) {
      await onPlatformLinked(workspaceId, platform, hub).catch((e) =>
        console.error(`[ingest] resume ${workspaceId} ${platform}`, e),
      );
    }
  }
}

export async function resumeAllIngest(hub: ChatHub): Promise<void> {
  const workspaces = await listAllWorkspaces();
  for (const ws of workspaces) {
    await resumeIngestForWorkspace(ws.id, hub);
  }
}
