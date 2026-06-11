import { useMemo } from "react";
import type { ChatMessage } from "@omnichat/chat-types";
import { resolveEmoteUrl } from "./params";
import type { ResolvedEmote } from "./useOverlayEmotes";

type InlineEmote = ChatMessage["emotes"][number];

function lookupEmote(map: Map<string, ResolvedEmote>, token: string): ResolvedEmote | undefined {
  return (
    map.get(token) ??
    map.get(token.toLowerCase()) ??
    map.get(token.replace(/^[^\w]+|[^\w]+$/g, "")) ??
    map.get(token.replace(/^[^\w]+|[^\w]+$/g, "").toLowerCase())
  );
}

function renderTokenText(token: string, key: number) {
  return <span key={key}>{token}</span>;
}

function renderTokenWith7tv(
  token: string,
  key: number,
  emoteMap: Map<string, ResolvedEmote>,
  emoteSize: number,
) {
  if (/^\s+$/.test(token)) return <span key={key}>{token}</span>;
  const emote = lookupEmote(emoteMap, token);
  if (emote) {
    return (
      <img
        key={key}
        className="overlay-emote"
        src={emote.url}
        alt={emote.name}
        title={emote.name}
        style={{ height: emoteSize }}
        loading="lazy"
        decoding="async"
      />
    );
  }
  return renderTokenText(token, key);
}

function renderSegmentWith7tv(
  text: string,
  keyPrefix: string,
  emoteMap: Map<string, ResolvedEmote>,
  emoteSize: number,
) {
  const parts = text.split(/(\s+)/);
  return parts.map((part, i) =>
    renderTokenWith7tv(part, `${keyPrefix}-${i}`, emoteMap, emoteSize),
  );
}

export function MessageBody({
  text,
  emotes,
  emoteMap,
  emoteSize,
}: {
  text: string;
  emotes: InlineEmote[];
  emoteMap: Map<string, ResolvedEmote>;
  emoteSize: number;
}) {
  const nodes = useMemo(() => {
    const hasInline = emotes.length > 0;
    const has7tv = emoteMap.size > 0;

    if (!hasInline && !has7tv) return [text];

    if (!hasInline) {
      return renderSegmentWith7tv(text, "t", emoteMap, emoteSize);
    }

    const sorted = [...emotes].sort((a, b) => a.start - b.start);
    const out: React.ReactNode[] = [];
    let cursor = 0;

    for (const emote of sorted) {
      const start = Math.max(0, Math.min(emote.start, text.length));
      const end = Math.max(start, Math.min(emote.end, text.length));
      if (start > cursor) {
        const segment = text.slice(cursor, start);
        out.push(
          ...(has7tv
            ? renderSegmentWith7tv(segment, `s-${cursor}`, emoteMap, emoteSize)
            : [segment]),
        );
      }
      if (end > start) {
        out.push(
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

    if (cursor < text.length) {
      const tail = text.slice(cursor);
      out.push(
        ...(has7tv
          ? renderSegmentWith7tv(tail, `e-${cursor}`, emoteMap, emoteSize)
          : [tail]),
      );
    }

    return out;
  }, [text, emotes, emoteMap, emoteSize]);

  return <>{nodes}</>;
}
