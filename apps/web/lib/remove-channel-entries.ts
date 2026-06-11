import type { ChatChannelEntry, ChatSettings, StreamerProfile } from "./chat-settings-storage";
import { removeProfile } from "./chat-settings-storage";

/** Remove all settings channel rows for a streamer tab (all platforms on that profile). */
export function removeChannelEntriesForTab(
  settings: Pick<ChatSettings, "profiles" | "channels">,
  tab: { profileId?: string; label: string; handles: { platform: string; handle: string }[] },
): Pick<ChatSettings, "profiles" | "channels"> {
  if (tab.profileId) {
    return removeProfile(settings as ChatSettings, tab.profileId);
  }

  const handleKeys = new Set(
    tab.handles.map(
      (h) => `${h.platform.toLowerCase()}:${h.handle.replace(/^@/, "").toLowerCase()}`,
    ),
  );

  const profileIdsToRemove = new Set<string>();
  const nextChannels = settings.channels.filter((c) => {
    const key = `${c.platform.toLowerCase()}:${c.handle.replace(/^@/, "").toLowerCase()}`;
    if (handleKeys.has(key)) {
      profileIdsToRemove.add(c.profileId);
      return false;
    }
    return true;
  });

  const nextProfiles = settings.profiles.filter((p) => !profileIdsToRemove.has(p.id));
  return { profiles: nextProfiles, channels: nextChannels };
}

export function removeChannelEntriesForProfile(
  channels: ChatChannelEntry[],
  profiles: StreamerProfile[],
  profileId: string,
): { channels: ChatChannelEntry[]; profiles: StreamerProfile[] } {
  return {
    profiles: profiles.filter((p) => p.id !== profileId),
    channels: channels.filter((c) => c.profileId !== profileId),
  };
}
