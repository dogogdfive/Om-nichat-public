export type ActiveChatter = {
  platform: string;
  channel: string;
  login: string;
  displayName: string;
  userId: string;
  color?: string;
  lastSeen: string;
};

export type ChannelChatterGroup = {
  platform: string;
  channel: string;
  chatters: ActiveChatter[];
};

function channelKey(platform: string, channel: string): string {
  return `${platform}:${channel.replace(/^@/, "").toLowerCase()}`;
}

/** Unique chatters seen in the feed, grouped by channel (most recent activity first). */
export function collectActiveChatters(
  lines: {
    kind: string;
    platform?: string;
    channelId?: string;
    login?: string;
    user?: string;
    userId?: string;
    color?: string;
    time?: string;
  }[],
): ChannelChatterGroup[] {
  const groups = new Map<string, Map<string, ActiveChatter>>();

  for (const line of lines) {
    if (line.kind !== "message") continue;
    const platform = line.platform ?? "twitch";
    const channel = (line.channelId ?? "").replace(/^@/, "").toLowerCase();
    const login = (line.login || line.user || "").replace(/^@/, "").trim();
    if (!channel || !login) continue;

    const key = channelKey(platform, channel);
    let chatters = groups.get(key);
    if (!chatters) {
      chatters = new Map();
      groups.set(key, chatters);
    }

    chatters.set(login.toLowerCase(), {
      platform,
      channel,
      login,
      displayName: line.user || login,
      userId: line.userId ?? login,
      color: line.color,
      lastSeen: line.time ?? "",
    });
  }

  const out: ChannelChatterGroup[] = [];
  for (const [, chatters] of groups) {
    const first = chatters.values().next().value;
    if (!first) continue;
    out.push({
      platform: first.platform,
      channel: first.channel,
      chatters: [...chatters.values()].sort((a, b) =>
        a.login.localeCompare(b.login, undefined, { sensitivity: "base" }),
      ),
    });
  }

  return out.sort((a, b) => b.chatters.length - a.chatters.length);
}

export function chattersForStream(
  groups: ChannelChatterGroup[],
  platform: string,
  login: string,
): ActiveChatter[] {
  const key = channelKey(platform, login);
  return groups.find((g) => channelKey(g.platform, g.channel) === key)?.chatters ?? [];
}
