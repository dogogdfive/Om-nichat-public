export * from "@omnichat/chat-tabs";

import { setChatTabsChangeHandler } from "@omnichat/chat-tabs";

export const CHAT_TABS_CHANGED = "omnichat-chat-tabs-changed";

setChatTabsChangeHandler(() => {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(CHAT_TABS_CHANGED));
});
