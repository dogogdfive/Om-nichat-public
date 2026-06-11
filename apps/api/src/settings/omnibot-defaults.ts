import type { OmnibotConfigJson } from "@omnichat/db";

/** Default Omnibunny config for new workspaces. */
export const DEFAULT_OMNIBOT: OmnibotConfigJson = {
  enabled: true,
  paused: false,
  walletScanner: true,
  walletTimeoutSeconds: 600,
  platforms: {
    twitch: true,
    kick: true,
    x: false,
    youtube: false,
    rumble: false,
  },
  viewerCollective: false,
  locked: {},
  profileSetupComplete: false,
};

/** Pre-default-change config — never explicitly turned on. */
function isLegacyOmnibotDefault(config: OmnibotConfigJson): boolean {
  return (
    !config.enabled &&
    !config.walletScanner &&
    config.walletTimeoutSeconds === 600 &&
    !config.paused &&
    config.platforms.twitch &&
    config.platforms.kick &&
    config.platforms.x &&
    config.platforms.youtube &&
    config.platforms.rumble
  );
}

export function normalizeOmnibotConfig(
  config: Partial<OmnibotConfigJson> | null | undefined,
): OmnibotConfigJson {
  if (!config) return { ...DEFAULT_OMNIBOT };

  const merged: OmnibotConfigJson = {
    ...DEFAULT_OMNIBOT,
    ...config,
    platforms: { ...DEFAULT_OMNIBOT.platforms, ...config.platforms },
    locked: config.locked ?? {},
    paused: config.paused ?? false,
  };

  if (isLegacyOmnibotDefault(merged)) return { ...DEFAULT_OMNIBOT };
  return merged;
}
