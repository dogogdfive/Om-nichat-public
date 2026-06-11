import type { ResolvedEmote } from "@/lib/emotes/seventv";

/** Common emoji for the picker — inserted as unicode into chat. */
const EMOJI_CHARS = [
  "😀", "😂", "😊", "😍", "😎", "😢", "😡", "👍", "👎", "👏", "🙏", "🔥",
  "💯", "❤️", "💀", "🤣", "😭", "🥺", "😤", "🤔", "😴", "🤮", "🫡", "🎉",
  "✅", "❌", "⭐", "💜", "💙", "💚", "💛", "🧡", "🖤", "🤍", "💔", "👀",
  "🫶", "🤝", "✨", "⚡", "🎮", "🏆", "🍿", "☕", "🍕", "🐶", "🐱", "👋",
];

function twemojiUrl(char: string): string {
  const codepoints = [...char].map((c) => c.codePointAt(0)!.toString(16)).join("-");
  return `https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72/${codepoints}.png`;
}

function emojiEntry(char: string, variant: "native" | "web"): ResolvedEmote {
  const id = `emoji-${variant}-${[...char].map((c) => c.codePointAt(0)!.toString(16)).join("-")}`;
  return {
    id,
    name: char,
    url: variant === "web" ? twemojiUrl(char) : "",
    provider: variant === "web" ? "emoji-web" : "emoji",
  };
}

/** Native unicode emoji (OS / Android style in picker). */
export function getNativeEmojiEmotes(): ResolvedEmote[] {
  return EMOJI_CHARS.map((c) => emojiEntry(c, "native"));
}

/** Twemoji images (web-style emoji in picker). */
export function getWebEmojiEmotes(): ResolvedEmote[] {
  return EMOJI_CHARS.map((c) => emojiEntry(c, "web"));
}
