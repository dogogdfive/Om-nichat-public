export type ChatTheme = "classic" | "landing";

const STORAGE_KEY = "omnichat-chat-theme";

export function loadChatTheme(): ChatTheme {
  if (typeof window === "undefined") return "classic";
  const raw = localStorage.getItem(STORAGE_KEY);
  return raw === "landing" ? "landing" : "classic";
}

export function saveChatTheme(theme: ChatTheme) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, theme);
}

export function chatThemeClass(theme: ChatTheme): string {
  return theme === "landing" ? "prochat-app--landing" : "";
}
