export type StreamerProfile = {
  id: string;
  label: string;
};

export type ChannelRow = {
  platform: string;
  handle: string;
  profileId?: string;
};

export type ChatSettingsSnapshot = {
  profiles: StreamerProfile[];
  channels: ChannelRow[];
};

export const CHAT_SETTINGS_KEY = "omnichat-chat-settings";

export function loadChatSettingsFromStorage(): ChatSettingsSnapshot {
  if (typeof window === "undefined") {
    return { profiles: [], channels: [] };
  }
  try {
    const raw = localStorage.getItem(CHAT_SETTINGS_KEY);
    if (!raw) return { profiles: [], channels: [] };
    const parsed = JSON.parse(raw) as Partial<ChatSettingsSnapshot>;
    return {
      profiles: parsed.profiles ?? [],
      channels: parsed.channels ?? [],
    };
  } catch {
    return { profiles: [], channels: [] };
  }
}
