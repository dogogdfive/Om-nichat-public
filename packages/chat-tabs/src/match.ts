import type { ChatTab, ChatTabHandle } from "./types.js";

export function messageMatchesChatTab(
  line: {
    channelId: string;
    login: string;
    platform?: string;
    streamEventKind?: string;
  },
  tab: ChatTab,
  handles?: ChatTabHandle[],
): boolean {
  const list = handles ?? tab.handles;
  const channelId = line.channelId.replace(/^@/, "").replace(/^#/, "").toLowerCase();
  if (!channelId) return false;

  const platform = line.platform?.toLowerCase();

  const matchesHandle = (h: ChatTabHandle) => {
    const handle = h.handle.replace(/^@/, "").toLowerCase();
    const hPlatform = h.platform.toLowerCase();
    if (platform && hPlatform !== platform) return false;
    return handle === channelId;
  };

  const matchesPlatform = (h: ChatTabHandle) =>
    !platform || h.platform.toLowerCase() === platform;

  if (tab.isAll) {
    if (list.length === 0) return true;
    if (line.streamEventKind) return list.some(matchesPlatform);
    return list.some(matchesHandle);
  }

  if (list.length === 0) return false;
  return list.some(matchesHandle);
}
