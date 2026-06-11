import { getWatchedChannels } from "../adapters/watch-channels.js";
import { listAllWorkspaces } from "../db/repos.js";
import {
  mirrorChannel7tv,
  mirrorGlobal7tv,
} from "./mirror.js";
import { fetch7tvEmotesForWorkspace } from "./seventv.js";

const mirroringWorkspaces = new Set<string>();

/** Mirror 7TV emotes for one channel (metadata + images to local store). */
export function warm7tvChannel(platform: "twitch" | "kick", login: string): void {
  void mirrorChannel7tv(platform, login);
}

/** Build merged workspace bundle after channel mirrors are queued. */
export function warmWorkspace7tvEmotes(workspaceId: string): void {
  if (mirroringWorkspaces.has(workspaceId)) return;
  mirroringWorkspaces.add(workspaceId);

  void (async () => {
    try {
      await fetch7tvEmotesForWorkspace(workspaceId);
      console.log(`[7tv] workspace bundle ready ${workspaceId}`);
    } catch (err) {
      console.warn(`[7tv] workspace bundle failed ${workspaceId}`, err);
    } finally {
      mirroringWorkspaces.delete(workspaceId);
    }
  })();
}

/** Mirror watched channels first; global 7TV set is large and runs last at low priority. */
export async function warmWorkspace7tvChannels(workspaceId: string): Promise<void> {
  for (const login of getWatchedChannels(workspaceId, "twitch")) {
    warm7tvChannel("twitch", login);
  }
  for (const slug of getWatchedChannels(workspaceId, "kick")) {
    warm7tvChannel("kick", slug);
  }

  warmWorkspace7tvEmotes(workspaceId);
  void mirrorGlobal7tv();
}

/** Mirror all connected workspaces on server boot (non-blocking). */
export function warmAllWorkspace7tvEmotes(): void {
  void (async () => {
    void mirrorGlobal7tv();
    const workspaces = await listAllWorkspaces();
    for (const ws of workspaces) {
      await warmWorkspace7tvChannels(ws.id);
    }
    console.log(`[7tv] channel mirror queued for ${workspaces.length} workspace(s)`);
  })();
}
