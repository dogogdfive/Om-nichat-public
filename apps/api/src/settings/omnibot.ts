import type { OmnibotConfigJson } from "@omnichat/db";
import { getOmnibotConfig as getDb, saveOmnibotConfig } from "../db/repos.js";

export type OmnibotConfig = OmnibotConfigJson;

export async function getOmnibotConfig(workspaceId: string): Promise<OmnibotConfig> {
  return getDb(workspaceId);
}

export async function patchOmnibotConfig(
  workspaceId: string,
  patch: Partial<Omit<OmnibotConfig, "locked">>,
  opts?: { superAdmin?: boolean },
): Promise<OmnibotConfig> {
  const current = await getDb(workspaceId);
  const next: OmnibotConfig = { ...current };
  if (patch.enabled !== undefined && (opts?.superAdmin || !current.locked.enabled))
    next.enabled = patch.enabled;
  if (patch.paused !== undefined && (opts?.superAdmin || !current.locked.paused))
    next.paused = patch.paused;
  if (patch.walletScanner !== undefined && (opts?.superAdmin || !current.locked.walletScanner))
    next.walletScanner = patch.walletScanner;
  if (
    patch.walletTimeoutSeconds !== undefined &&
    (opts?.superAdmin || !current.locked.walletTimeoutSeconds)
  )
    next.walletTimeoutSeconds = patch.walletTimeoutSeconds;
  if (patch.platforms !== undefined && (opts?.superAdmin || !current.locked.platforms))
    next.platforms = { ...next.platforms, ...patch.platforms };
  if (
    patch.viewerCollective !== undefined &&
    (opts?.superAdmin || !current.locked.viewerCollective)
  )
    next.viewerCollective = patch.viewerCollective;
  await saveOmnibotConfig(workspaceId, next);
  return next;
}

export async function setOmnibotLocks(
  workspaceId: string,
  locked: OmnibotConfig["locked"],
): Promise<OmnibotConfig> {
  const current = await getDb(workspaceId);
  const next = { ...current, locked: { ...current.locked, ...locked } };
  await saveOmnibotConfig(workspaceId, next);
  return next;
}
