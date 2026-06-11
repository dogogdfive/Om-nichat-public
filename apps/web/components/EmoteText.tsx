"use client";

import { memo, useMemo } from "react";
import type { ResolvedEmote } from "@/lib/emotes/seventv";
import { linkifyText } from "@/lib/linkify";

type Props = {
  text: string;
  emotes: Map<string, ResolvedEmote>;
  extraEmotes?: { id: string; name: string; url: string }[];
  size: number;
};

function lookupEmote(map: Map<string, ResolvedEmote>, token: string): ResolvedEmote | undefined {
  const direct = map.get(token);
  if (direct) return direct;
  const lower = map.get(token.toLowerCase());
  if (lower) return lower;
  const stripped = token.replace(/^[^\w]+|[^\w]+$/g, "");
  if (stripped !== token) {
    return map.get(stripped) ?? map.get(stripped.toLowerCase());
  }
  return undefined;
}

function lookupExtra(
  extra: { id: string; name: string; url: string }[] | undefined,
  token: string,
): ResolvedEmote | undefined {
  if (!extra?.length) return undefined;
  const lower = token.toLowerCase();
  const stripped = token.replace(/^[^\w]+|[^\w]+$/g, "");
  const strippedLower = stripped.toLowerCase();
  for (const e of extra) {
    const nameLower = e.name.toLowerCase();
    if (e.name === token || nameLower === lower) return e;
    if (stripped && (e.name === stripped || nameLower === strippedLower)) return e;
  }
  return undefined;
}

function resolveEmote(
  emotes: Map<string, ResolvedEmote>,
  extra: { id: string; name: string; url: string }[] | undefined,
  token: string,
): ResolvedEmote | undefined {
  return lookupEmote(emotes, token) ?? lookupExtra(extra, token);
}

function renderTextToken(token: string, key: number) {
  const linked = linkifyText(token, `${key}-`);
  if (linked.length === 1 && typeof linked[0] === "string") {
    return <span key={key}>{token}</span>;
  }
  return <span key={key}>{linked}</span>;
}

export const EmoteText = memo(function EmoteText({ text, emotes, extraEmotes, size }: Props) {
  const parts = useMemo(() => text.split(/(\s+)/), [text]);
  const hasEmotes = emotes.size > 0 || (extraEmotes?.length ?? 0) > 0;

  if (!hasEmotes) {
    const linked = linkifyText(text);
    if (linked.length === 1 && typeof linked[0] === "string") return <>{text}</>;
    return <>{linked}</>;
  }

  return (
    <>
      {parts.map((part, i) => {
        if (/^\s+$/.test(part)) return <span key={i}>{part}</span>;
        const emote = resolveEmote(emotes, extraEmotes, part);
        if (emote) {
          return (
            <img
              key={i}
              src={emote.url}
              alt={emote.name}
              title={emote.name}
              className="inline-block align-middle mx-px"
              style={{ height: size, width: "auto" }}
              loading="lazy"
              decoding="async"
            />
          );
        }
        return renderTextToken(part, i);
      })}
    </>
  );
});
