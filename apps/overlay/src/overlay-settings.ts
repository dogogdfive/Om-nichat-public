import { CHAT_SETTINGS_KEY, type ChannelRow, type StreamerProfile } from "@omnichat/chat-tabs";

export const SETTINGS_CHANGED = "omnichat-chat-settings-changed";

export type SettingsSnapshot = {
  profiles: StreamerProfile[];
  channels: ChannelRow[];
};

export function loadOverlaySettings(): SettingsSnapshot {
  try {
    const raw = localStorage.getItem(CHAT_SETTINGS_KEY);
    if (!raw) return { profiles: [], channels: [] };
    const parsed = JSON.parse(raw) as Partial<SettingsSnapshot>;
    return {
      profiles: parsed.profiles ?? [],
      channels: (parsed.channels ?? []) as ChannelRow[],
    };
  } catch {
    return { profiles: [], channels: [] };
  }
}

export function saveOverlaySettings(next: SettingsSnapshot): void {
  try {
    const raw = localStorage.getItem(CHAT_SETTINGS_KEY);
    const existing = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
    localStorage.setItem(CHAT_SETTINGS_KEY, JSON.stringify({ ...existing, ...next }));
    window.dispatchEvent(new Event(SETTINGS_CHANGED));
  } catch {
    /* ignore */
  }
}

export function removeProfileFromSettings(
  settings: SettingsSnapshot,
  profileId: string,
): SettingsSnapshot {
  return {
    profiles: settings.profiles.filter((p) => p.id !== profileId),
    channels: settings.channels.filter((c) => c.profileId !== profileId),
  };
}

export function removeChannelEntriesForTab(
  settings: SettingsSnapshot,
  tab: { profileId?: string; label: string; handles: { platform: string; handle: string }[] },
): SettingsSnapshot {
  if (tab.profileId) {
    return removeProfileFromSettings(settings, tab.profileId);
  }

  const handleKeys = new Set(
    tab.handles.map(
      (h) => `${h.platform.toLowerCase()}:${h.handle.replace(/^@/, "").toLowerCase()}`,
    ),
  );

  const profileIdsToRemove = new Set<string>();
  const channels = settings.channels.filter((c) => {
    const key = `${c.platform.toLowerCase()}:${c.handle.replace(/^@/, "").toLowerCase()}`;
    if (handleKeys.has(key)) {
      if (c.profileId) profileIdsToRemove.add(c.profileId);
      return false;
    }
    return true;
  });

  const profiles = settings.profiles.filter((p) => !profileIdsToRemove.has(p.id));
  return { profiles, channels };
}
