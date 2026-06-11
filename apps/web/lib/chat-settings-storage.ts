import { normalizeChannelHandle } from "./parse-channel-input";

export type AppearanceTab = "display" | "behavior" | "moderation" | "emotes";

export type StreamerProfile = {
  id: string;
  label: string;
};

/** A watched channel row. `sendLinked` must be enabled to send chat via that platform + handle. */
export type ChatChannelEntry = {
  id: string;
  platform: string;
  handle: string;
  sendLinked?: boolean;
  profileId: string;
};

export type ChatSettings = {
  appearance: {
    font: string;
    timestampFormat: string;
    platformIcons: boolean;
    profilePictures: boolean;
    highlightMentions: boolean;
    viewerCount: string;
    currency: string;
    messageFadeOut: number;
    dimChatHistory: boolean;
    liveOnlyChat: boolean;
    followerAlerts: boolean;
    quickModActions: boolean;
    showDeletedMessages: boolean;
    emoteSize: number;
    bttv: boolean;
    ffz: boolean;
    seventv: boolean;
  };
  preferences: {
    moderatedDoubleClick: "toggle" | "nothing";
  };
  overlay: {
    font: string;
    fontSize: number;
    bgTransparency: number;
    messageFadeOut: number;
    platformIcons: boolean;
    eventMessages: boolean;
    deletedMessages: boolean;
    showTabs: boolean;
  };
  profiles: StreamerProfile[];
  channels: ChatChannelEntry[];
};

export const DEFAULT_SETTINGS: ChatSettings = {
  appearance: {
    font: "Roboto",
    timestampFormat: "24h-full",
    platformIcons: true,
    profilePictures: true,
    highlightMentions: true,
    viewerCount: "none",
    currency: "USD",
    messageFadeOut: 0,
    dimChatHistory: false,
    liveOnlyChat: false,
    followerAlerts: true,
    quickModActions: true,
    showDeletedMessages: false,
    emoteSize: 24,
    bttv: false,
    ffz: false,
    seventv: true,
  },
  preferences: {
    moderatedDoubleClick: "toggle",
  },
  overlay: {
    font: "Roboto",
    fontSize: 18,
    bgTransparency: 0,
    messageFadeOut: 0,
    platformIcons: true,
    eventMessages: true,
    deletedMessages: false,
    showTabs: true,
  },
  profiles: [],
  channels: [],
};

const KEY = "omnichat-chat-settings";
const SEVENTV_MIGRATION_KEY = "omnichat-seventv-default-v1";
const PROFILES_MIGRATION_KEY = "omnichat-profiles-v1";
const OVERLAY_BG_MIGRATION_KEY = "omnichat-overlay-bg-dark-v1";

export const CHAT_SETTINGS_CHANGED = "omnichat-chat-settings-changed";

export function createStreamerProfile(label: string): StreamerProfile {
  return { id: crypto.randomUUID(), label: label.replace(/^@/, "").trim() || "Streamer" };
}

function migrateProfiles(settings: ChatSettings): ChatSettings {
  const channels = settings.channels ?? [];
  let profiles = settings.profiles ?? [];

  const profileIds = new Set(profiles.map((p) => p.id));
  const needsMigration =
    profiles.length === 0 ||
    channels.some((c) => !c.profileId || !profileIds.has(c.profileId));

  if (!needsMigration) return settings;

  const nextProfiles = [...profiles];
  const nextChannels = channels.map((c) => {
    if (c.profileId && profileIds.has(c.profileId)) return c;
    const label = normalizeChannelHandle(c.handle) || "Streamer";
    const profile = createStreamerProfile(label);
    nextProfiles.push(profile);
    profileIds.add(profile.id);
    return { ...c, profileId: profile.id };
  });

  return { ...settings, profiles: nextProfiles, channels: nextChannels };
}

export function channelsForProfile(
  channels: ChatChannelEntry[],
  profileId: string,
): ChatChannelEntry[] {
  return channels.filter((c) => c.profileId === profileId);
}

/** Remove a channel row; drops the profile when it was the last channel on that profile. */
export function removeChannelEntry(
  settings: ChatSettings,
  channelId: string,
): ChatSettings {
  const row = settings.channels.find((c) => c.id === channelId);
  if (!row) return settings;

  const nextChannels = settings.channels.filter((c) => c.id !== channelId);
  const stillOnProfile = nextChannels.some((c) => c.profileId === row.profileId);
  const nextProfiles = stillOnProfile
    ? settings.profiles
    : settings.profiles.filter((p) => p.id !== row.profileId);

  return { ...settings, profiles: nextProfiles, channels: nextChannels };
}

/** Remove all channels (and the profile) for a streamer tab. */
export function removeProfile(
  settings: ChatSettings,
  profileId: string,
): ChatSettings {
  return {
    ...settings,
    profiles: settings.profiles.filter((p) => p.id !== profileId),
    channels: settings.channels.filter((c) => c.profileId !== profileId),
  };
}

export function loadChatSettings(): ChatSettings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<ChatSettings>;
    let merged: ChatSettings = {
      ...DEFAULT_SETTINGS,
      ...parsed,
      appearance: { ...DEFAULT_SETTINGS.appearance, ...parsed.appearance },
      preferences: { ...DEFAULT_SETTINGS.preferences, ...parsed.preferences },
      overlay: { ...DEFAULT_SETTINGS.overlay, ...parsed.overlay },
      profiles: parsed.profiles ?? DEFAULT_SETTINGS.profiles,
      channels: (parsed.channels ?? DEFAULT_SETTINGS.channels) as ChatChannelEntry[],
    };

    if (!localStorage.getItem(SEVENTV_MIGRATION_KEY)) {
      merged.appearance.seventv = true;
      localStorage.setItem(SEVENTV_MIGRATION_KEY, "1");
    }

    if (!localStorage.getItem(PROFILES_MIGRATION_KEY)) {
      merged = migrateProfiles(merged);
      localStorage.setItem(PROFILES_MIGRATION_KEY, "1");
      localStorage.setItem(KEY, JSON.stringify(merged));
      return merged;
    }

    if (!localStorage.getItem(OVERLAY_BG_MIGRATION_KEY) && merged.overlay.bgTransparency >= 100) {
      merged = { ...merged, overlay: { ...merged.overlay, bgTransparency: 0 } };
      localStorage.setItem(OVERLAY_BG_MIGRATION_KEY, "1");
      localStorage.setItem(KEY, JSON.stringify(merged));
    }

    merged = migrateProfiles(merged);
    return merged;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveChatSettings(settings: ChatSettings): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(KEY, JSON.stringify(settings));
  queueMicrotask(() => window.dispatchEvent(new Event(CHAT_SETTINGS_CHANGED)));
}

/** Enable send for channel rows on a platform when that platform OAuth is connected. */
export function linkSendForConnectedPlatform(
  channels: ChatChannelEntry[],
  platform: string,
): ChatChannelEntry[] {
  const p = platform.toLowerCase();
  return channels.map((c) =>
    c.platform.toLowerCase() === p ? { ...c, sendLinked: true } : c,
  );
}

/** Link send on all channel rows whose platforms are currently connected. */
export function linkSendForAllConnected(
  channels: ChatChannelEntry[],
  connected: Record<string, boolean>,
): ChatChannelEntry[] {
  let next = channels;
  for (const [platform, isConnected] of Object.entries(connected)) {
    if (!isConnected) continue;
    next = linkSendForConnectedPlatform(next, platform);
  }
  return next;
}

export function shouldAutoLinkSend(platform: string, connected: Record<string, boolean>): boolean {
  return connected[platform.toLowerCase()] === true;
}
