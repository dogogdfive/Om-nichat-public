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
  isCombined?: boolean;
  memberProfileIds?: string[];
  hidden?: boolean;
};

export type ChatTabsState = {
  activeTabId: string;
  tabs: ChatTab[];
  /** Client-generated id to dedupe WebSocket sync echoes. */
  syncId?: string;
};

export const ALL_CHAT_TAB_ID = "all";

export const DEFAULT_CHAT_TABS: ChatTabsState = {
  activeTabId: ALL_CHAT_TAB_ID,
  tabs: [{ id: ALL_CHAT_TAB_ID, label: "All", handles: [], isAll: true }],
};

export const TABS_STORAGE_KEY = "omnichat-chat-tabs";
export const DISMISSED_TABS_KEY = "omnichat-dismissed-tab-labels";
export const ACTIVATE_TAB_KEY = "omnichat-activate-tab";
export const ACTIVATE_PROFILE_KEY = "omnichat-activate-profile";
