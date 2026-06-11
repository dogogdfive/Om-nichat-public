import type { ChatMessage } from "@omnichat/chat-types";
import { resolveEmoteUrl } from "./params";

type Emote = ChatMessage["emotes"][number];

export function MessageBody({
  text,
  emotes,
  emoteSize,
}: {
  text: string;
  emotes: Emote[];
  emoteSize: number;
}) {
  if (!emotes.length) return <>{text}</>;

  const sorted = [...emotes].sort((a, b) => a.start - b.start);
  const nodes: React.ReactNode[] = [];
  let cursor = 0;

  for (const emote of sorted) {
    const start = Math.max(0, Math.min(emote.start, text.length));
    const end = Math.max(start, Math.min(emote.end, text.length));
    if (start > cursor) nodes.push(text.slice(cursor, start));
    if (end > start) {
      nodes.push(
        <img
          key={`${emote.id}-${start}`}
          className="overlay-emote"
          src={resolveEmoteUrl(emote.url)}
          alt={emote.name}
          title={emote.name}
          style={{ height: emoteSize }}
          loading="lazy"
          decoding="async"
        />,
      );
    }
    cursor = Math.max(cursor, end);
  }

  if (cursor < text.length) nodes.push(text.slice(cursor));
  return <>{nodes}</>;
}
