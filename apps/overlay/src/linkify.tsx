import type { ReactNode } from "react";

/** Split text into plain segments and http(s)/www URLs. */
const URL_SPLIT = /(https?:\/\/[^\s<>"']+|www\.[^\s<>"']+)/i;

function hrefFor(url: string): string {
  return url.toLowerCase().startsWith("www.") ? `https://${url}` : url;
}

export function linkifyText(text: string, keyPrefix = ""): ReactNode[] {
  const parts = text.split(URL_SPLIT).filter((p) => p.length > 0);
  if (parts.length === 1 && !URL_SPLIT.test(parts[0]!)) {
    return [text];
  }

  return parts.map((part, i) => {
    const key = `${keyPrefix}${i}`;
    if (URL_SPLIT.test(part)) {
      return (
        <a
          key={key}
          href={hrefFor(part)}
          target="_blank"
          rel="noopener noreferrer"
          className="overlay-chat-link"
        >
          {part}
        </a>
      );
    }
    return <span key={key}>{part}</span>;
  });
}

export function linkifyNodes(text: string, keyPrefix = ""): ReactNode[] {
  const linked = linkifyText(text, keyPrefix);
  if (linked.length === 1 && typeof linked[0] === "string") {
    return [text];
  }
  return linked;
}
