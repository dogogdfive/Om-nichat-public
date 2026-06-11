import type { ChatChannelEntry } from "./chat-settings-storage";
import type { ChatTab, ChatTabHandle } from "./chat-tabs-storage";
import { normalizeChannelHandle } from "./parse-channel-input";

export type SendTarget = {
  platform: string;
  channel: string;
};

function channelKey(platform: string, handle: string): string {
  return `${platform.toLowerCase()}:${normalizeChannelHandle(handle)}`;
}

function isSendLinked(
  platform: string,
  handle: string,
  settingsChannels: ChatChannelEntry[],
): boolean {
  const key = channelKey(platform, handle);
  return settingsChannels.some(
    (c) => channelKey(c.platform, c.handle) === key && c.sendLinked === true,
  );
}

/** Outbound targets: active tab handles that are explicitly linked for sending. */
export function buildSendTargets(opts: {
  activeTab: ChatTab;
  allTabs: ChatTab[];
  connected: Record<string, boolean>;
  settingsChannels: ChatChannelEntry[];
}): SendTarget[] {
  const { activeTab, allTabs, connected, settingsChannels } = opts;

  let handles: ChatTabHandle[];
  if (activeTab.isAll) {
    const fromTabs = allTabs.filter((t) => !t.isAll).flatMap((t) => t.handles);
    handles = fromTabs.length > 0 ? fromTabs : settingsChannels;
  } else {
    handles = activeTab.handles;
  }

  const seen = new Set<string>();
  const out: SendTarget[] = [];
  for (const h of handles) {
    if (!connected[h.platform]) continue;
    if (!isSendLinked(h.platform, h.handle, settingsChannels)) continue;
    const channel = normalizeChannelHandle(h.handle);
    if (!channel) continue;
    const key = `${h.platform}:${channel}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ platform: h.platform, channel });
  }
  return out;
}

/** Tab handles missing a send link and/or platform OAuth connection. */
export function missingSendSetup(opts: {
  tabHandles: ChatTabHandle[];
  connected: Record<string, boolean>;
  settingsChannels: ChatChannelEntry[];
}): { needsConnect: string[]; needsSendLink: string[] } {
  const { tabHandles, connected, settingsChannels } = opts;
  const needsConnect = new Set<string>();
  const needsSendLink = new Set<string>();

  for (const h of tabHandles) {
    const linked = isSendLinked(h.platform, h.handle, settingsChannels);
    if (!linked) {
      needsSendLink.add(h.platform);
      continue;
    }
    if (!connected[h.platform]) {
      needsConnect.add(h.platform);
    }
  }

  return {
    needsConnect: [...needsConnect],
    needsSendLink: [...needsSendLink],
  };
}
