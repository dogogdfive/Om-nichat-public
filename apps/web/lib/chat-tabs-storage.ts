import { loadChatSettings, type StreamerProfile } from "./chat-settings-storage";

export type ChatTabHandle = {
  platform: string;
  handle: string;
};

export type ChatTab = {
  id: string;
  label: string;
  handles: ChatTabHandle[];
  profileId?: string;
  isAll?: boolean;
  /** Virtual tab merging multiple streamer profiles into one feed. */
  isCombined?: boolean;
  /** Source streamer profile IDs when isCombined. */
  memberProfileIds?: string[];
  /** Hidden from tab bar while merged into a combined tab. */
  hidden?: boolean;
};

export type ChatTabsState = {
  activeTabId: string;
  tabs: ChatTab[];
};

export const ALL_CHAT_TAB_ID = "all";

export const DEFAULT_CHAT_TABS: ChatTabsState = {
  activeTabId: ALL_CHAT_TAB_ID,
  tabs: [{ id: ALL_CHAT_TAB_ID, label: "All", handles: [], isAll: true }],
};

const KEY = "omnichat-chat-tabs";
const DISMISSED_KEY = "omnichat-dismissed-tab-labels";
const ACTIVATE_TAB_KEY = "omnichat-activate-tab";
const ACTIVATE_PROFILE_KEY = "omnichat-activate-profile";
export const CHAT_TABS_CHANGED = "omnichat-chat-tabs-changed";

function normalizeLabel(label: string): string {
  return label.replace(/^@/, "").toLowerCase();
}

function loadDismissedTabLabels(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = localStorage.getItem(DISMISSED_KEY);
    if (!raw) return new Set();
    return new Set(JSON.parse(raw) as string[]);
  } catch {
    return new Set();
  }
}

function saveDismissedTabLabels(labels: Set<string>): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(DISMISSED_KEY, JSON.stringify([...labels]));
}

export function dismissChatTabLabel(label: string): void {
  const dismissed = loadDismissedTabLabels();
  dismissed.add(normalizeLabel(label));
  saveDismissedTabLabels(dismissed);
}

export function undismissChatTabLabel(label: string): void {
  const dismissed = loadDismissedTabLabels();
  dismissed.delete(normalizeLabel(label));
  saveDismissedTabLabels(dismissed);
}

/** After adding a channel in settings, switch to that chat tab once synced. */
export function requestActivateChatTab(label: string): void {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(ACTIVATE_TAB_KEY, normalizeLabel(label));
}

export function requestActivateProfileTab(profileId: string): void {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(ACTIVATE_PROFILE_KEY, profileId);
}

type ChannelRow = { platform: string; handle: string; profileId?: string };

function groupChannelsForTabs(
  profiles: StreamerProfile[],
  channels: ChannelRow[],
): Map<string, { label: string; handles: ChatTabHandle[] }> {
  const profileById = new Map(profiles.map((p) => [p.id, p]));
  const byProfile = new Map<string, { label: string; handles: ChatTabHandle[] }>();

  for (const ch of channels) {
    if (!ch.profileId) continue;
    const profile = profileById.get(ch.profileId);
    if (!profile) continue;

    const list = byProfile.get(ch.profileId)?.handles ?? [];
    const handle = ch.handle.replace(/^@/, "");
    if (
      !list.some(
        (h) =>
          h.platform.toLowerCase() === ch.platform.toLowerCase() &&
          normalizeLabel(h.handle) === normalizeLabel(handle),
      )
    ) {
      list.push({ platform: ch.platform, handle });
    }
    byProfile.set(ch.profileId, { label: profile.label, handles: list });
  }

  return byProfile;
}

function unionHandles(...lists: ChatTabHandle[][]): ChatTabHandle[] {
  const out: ChatTabHandle[] = [];
  for (const list of lists) {
    for (const h of list) {
      const handle = h.handle.replace(/^@/, "");
      if (
        out.some(
          (x) =>
            x.platform.toLowerCase() === h.platform.toLowerCase() &&
            normalizeLabel(x.handle) === normalizeLabel(handle),
        )
      ) {
        continue;
      }
      out.push({ platform: h.platform, handle });
    }
  }
  return out;
}

function profileIdForTab(tab: ChatTab): string | null {
  if (tab.isAll || tab.isCombined) return null;
  return tab.profileId ?? tab.id;
}

function memberProfileIdsForTab(tab: ChatTab): string[] {
  if (tab.isCombined && tab.memberProfileIds?.length) return [...tab.memberProfileIds];
  const pid = profileIdForTab(tab);
  return pid ? [pid] : [];
}

export function visibleTabs(tabs: ChatTab[]): ChatTab[] {
  return tabs.filter((t) => !t.hidden);
}

/** Non-All streamer tabs (including hidden sources, excluding combined virtual tabs). */
export function streamerTabCount(tabs: ChatTab[]): number {
  return tabs.filter((t) => !t.isAll && !t.isCombined).length;
}

export function canCombineTabs(tabA: ChatTab, tabB: ChatTab): boolean {
  if (tabA.isAll || tabB.isAll || tabA.hidden || tabB.hidden) return false;
  const idsA = memberProfileIdsForTab(tabA);
  const idsB = memberProfileIdsForTab(tabB);
  if (idsA.length === 0 || idsB.length === 0) return false;
  return !idsA.some((id) => idsB.includes(id));
}

function labelsForMemberIds(
  memberProfileIds: string[],
  tabs: ChatTab[],
  grouped: Map<string, { label: string; handles: ChatTabHandle[] }>,
): string[] {
  return memberProfileIds.map((id) => {
    const fromGrouped = grouped.get(id)?.label;
    if (fromGrouped) return fromGrouped;
    const tab = tabs.find((t) => (t.profileId ?? t.id) === id && !t.isCombined);
    return tab?.label ?? id;
  });
}

function handlesForMemberIds(
  memberProfileIds: string[],
  grouped: Map<string, { label: string; handles: ChatTabHandle[] }>,
  tabs: ChatTab[],
): ChatTabHandle[] {
  const lists: ChatTabHandle[][] = memberProfileIds.map(
    (id) => grouped.get(id)?.handles ?? tabs.find((t) => (t.profileId ?? t.id) === id)?.handles ?? [],
  );
  return unionHandles(...lists);
}

export function combineChatTabs(tabAId: string, tabBId: string): ChatTabsState {
  const current = loadChatTabs();
  const tabA = current.tabs.find((t) => t.id === tabAId);
  const tabB = current.tabs.find((t) => t.id === tabBId);
  if (!tabA || !tabB || !canCombineTabs(tabA, tabB)) return current;

  const memberProfileIds = [
    ...new Set([...memberProfileIdsForTab(tabA), ...memberProfileIdsForTab(tabB)]),
  ];
  const labels = memberProfileIds.map((id) => {
    const tab = current.tabs.find((t) => (t.profileId ?? t.id) === id && !t.isCombined);
    return tab?.label ?? id;
  });
  const handles = unionHandles(tabA.handles, tabB.handles);
  const combinedId = `combined-${crypto.randomUUID()}`;
  const combinedTab: ChatTab = {
    id: combinedId,
    label: labels.join(" / "),
    handles,
    isCombined: true,
    memberProfileIds,
  };

  const removeIds = new Set([tabAId, tabBId]);
  const tabs: ChatTab[] = [];
  for (const t of current.tabs) {
    if (removeIds.has(t.id)) {
      tabs.push({ ...t, hidden: true });
      continue;
    }
    const pid = profileIdForTab(t);
    if (pid && memberProfileIds.includes(pid)) {
      tabs.push({ ...t, hidden: true });
      continue;
    }
    tabs.push(t);
  }
  tabs.push(combinedTab);

  const next = { activeTabId: combinedId, tabs };
  saveChatTabs(next);
  return next;
}

export function separateCombinedTab(combinedId: string): ChatTabsState {
  const current = loadChatTabs();
  const combined = current.tabs.find((t) => t.id === combinedId && t.isCombined);
  if (!combined) return current;

  const memberProfileIds = combined.memberProfileIds ?? [];
  const tabs = current.tabs
    .filter((t) => t.id !== combinedId)
    .map((t) => {
      const pid = profileIdForTab(t);
      if (pid && memberProfileIds.includes(pid)) {
        return { ...t, hidden: false };
      }
      return t;
    });

  const firstRestored =
    tabs.find(
      (t) =>
        !t.isAll &&
        !t.isCombined &&
        memberProfileIds.includes(t.profileId ?? t.id) &&
        !t.hidden,
    ) ??
    tabs.find((t) => t.isAll) ??
    tabs[0];

  const allMembersPresent = memberProfileIds.every((id) =>
    tabs.some((t) => !t.isAll && !t.isCombined && (t.profileId ?? t.id) === id),
  );

  if (!allMembersPresent) {
    saveChatTabs({
      activeTabId: firstRestored?.id ?? ALL_CHAT_TAB_ID,
      tabs,
    });
    const settings = loadChatSettings();
    return syncChatTabsFromSettings(settings.profiles, settings.channels);
  }

  const next = {
    activeTabId: firstRestored?.id ?? ALL_CHAT_TAB_ID,
    tabs,
  };
  saveChatTabs(next);
  return next;
}

/** Keep chat tabs in sync with settings (one tab per streamer profile). */
export function syncChatTabsFromSettings(
  profiles: StreamerProfile[],
  channels: ChannelRow[],
): ChatTabsState {
  const current = loadChatTabs();
  const allTab = current.tabs.find((t) => t.isAll) ?? DEFAULT_CHAT_TABS.tabs[0]!;
  const grouped = groupChannelsForTabs(profiles, channels);

  for (const [, { label }] of grouped) {
    undismissChatTabLabel(label);
  }

  const synced: ChatTab[] = [allTab];
  const combinedTabs = current.tabs.filter((t) => t.isCombined);
  const hiddenByCombined = new Set<string>();
  for (const ct of combinedTabs) {
    for (const id of ct.memberProfileIds ?? []) hiddenByCombined.add(id);
  }

  for (const [profileId, { label, handles }] of grouped) {
    const existing = current.tabs.find(
      (t) => !t.isAll && !t.isCombined && (t.profileId === profileId || t.id === profileId),
    );
    const hidden = hiddenByCombined.has(profileId) || existing?.hidden === true;
    synced.push(
      existing
        ? { ...existing, id: profileId, label, handles, profileId, hidden }
        : { id: profileId, label, handles, profileId, hidden },
    );
  }

  for (const ct of combinedTabs) {
    const validMembers = (ct.memberProfileIds ?? []).filter((id) => grouped.has(id));
    if (validMembers.length < 2) {
      for (const id of ct.memberProfileIds ?? []) {
        const idx = synced.findIndex((t) => (t.profileId ?? t.id) === id);
        if (idx >= 0) synced[idx] = { ...synced[idx]!, hidden: false };
      }
      continue;
    }
    const label = labelsForMemberIds(validMembers, current.tabs, grouped).join(" / ");
    const handles = handlesForMemberIds(validMembers, grouped, current.tabs);
    synced.push({
      ...ct,
      memberProfileIds: validMembers,
      label,
      handles,
    });
  }

  let activeTabId = current.activeTabId;
  if (!synced.some((t) => t.id === activeTabId)) {
    activeTabId = ALL_CHAT_TAB_ID;
  }

  if (typeof window !== "undefined") {
    const pendingProfile = sessionStorage.getItem(ACTIVATE_PROFILE_KEY);
    if (pendingProfile) {
      const target = synced.find((t) => t.profileId === pendingProfile);
      if (target) activeTabId = target.id;
      sessionStorage.removeItem(ACTIVATE_PROFILE_KEY);
    } else {
      const pendingActivate = sessionStorage.getItem(ACTIVATE_TAB_KEY);
      if (pendingActivate) {
        const target = synced.find(
          (t) => !t.isAll && normalizeLabel(t.label) === pendingActivate,
        );
        if (target) activeTabId = target.id;
        sessionStorage.removeItem(ACTIVATE_TAB_KEY);
      }
    }
  }

  const next = { activeTabId, tabs: synced };
  saveChatTabs(next);
  return next;
}

export function removeChatTabById(id: string): ChatTabsState {
  if (id === ALL_CHAT_TAB_ID) return loadChatTabs();
  const current = loadChatTabs();
  const tab = current.tabs.find((t) => t.id === id);
  if (tab?.isCombined) return separateCombinedTab(id);

  const tabs = current.tabs.filter((t) => t.id !== id);
  const activeTabId = current.activeTabId === id ? ALL_CHAT_TAB_ID : current.activeTabId;
  const next = { activeTabId, tabs };
  saveChatTabs(next);
  return next;
}

export function loadChatTabs(): ChatTabsState {
  if (typeof window === "undefined") return DEFAULT_CHAT_TABS;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULT_CHAT_TABS;
    const parsed = JSON.parse(raw) as Partial<ChatTabsState>;
    const tabs = parsed.tabs?.length ? parsed.tabs : DEFAULT_CHAT_TABS.tabs;
    const hasAll = tabs.some((t) => t.isAll);
    const normalized = hasAll
      ? tabs
      : [{ id: ALL_CHAT_TAB_ID, label: "All", handles: [], isAll: true }, ...tabs];
    const activeTabId =
      normalized.some((t) => t.id === parsed.activeTabId) ? parsed.activeTabId! : ALL_CHAT_TAB_ID;
    return { activeTabId, tabs: normalized };
  } catch {
    return DEFAULT_CHAT_TABS;
  }
}

export function saveChatTabs(state: ChatTabsState): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(KEY, JSON.stringify(state));
  window.dispatchEvent(new Event(CHAT_TABS_CHANGED));
}

export function primaryHandleForTab(tab: ChatTab): ChatTabHandle | null {
  if (tab.isAll || tab.handles.length === 0) return null;
  return (
    tab.handles.find((h) => h.platform === "twitch") ??
    tab.handles.find((h) => h.platform === "kick") ??
    tab.handles[0] ??
    null
  );
}

/** Live handles for a tab — always prefer settings channels grouped by profileId. */
export function resolveTabHandles(
  tab: ChatTab,
  profiles: { id: string; label: string }[],
  channels: { platform: string; handle: string; profileId?: string }[],
): ChatTabHandle[] {
  if (tab.isAll) return [];

  if (tab.isCombined && tab.memberProfileIds?.length) {
    const lists = tab.memberProfileIds.map((profileId) =>
      channels
        .filter((c) => c.profileId === profileId)
        .map((c) => ({
          platform: c.platform,
          handle: c.handle.replace(/^@/, ""),
        })),
    );
    const fromSettings = unionHandles(...lists);
    if (fromSettings.length > 0) return fromSettings;
    return tab.handles;
  }

  const profileId =
    tab.profileId ??
    profiles.find((p) => normalizeLabel(p.label) === normalizeLabel(tab.label))?.id ??
    tab.id;

  const fromSettings = channels
    .filter((c) => c.profileId === profileId)
    .map((c) => ({
      platform: c.platform,
      handle: c.handle.replace(/^@/, ""),
    }));

  if (fromSettings.length > 0) return fromSettings;

  const profileExists = profiles.some((p) => p.id === profileId);
  if (profileExists) return [];

  return tab.handles;
}

export function tabHandleKeys(handles: ChatTabHandle[]): Set<string> {
  const keys = new Set<string>();
  for (const h of handles) {
    keys.add(`${h.platform.toLowerCase()}:${normalizeLabel(h.handle)}`);
  }
  return keys;
}
