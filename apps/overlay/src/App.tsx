import { useEffect, useMemo, useState } from "react";
import type { ChatMessage, HubEvent, Platform } from "@omnichat/chat-types";
import { MessageBody } from "./MessageBody";
import { platformIconSrc, readOverlayParams } from "./params";

const params = readOverlayParams();

export function App() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);

  useEffect(() => {
    const ws = new WebSocket(`${params.ws}?room=${encodeURIComponent(params.room)}`);
    ws.onmessage = (ev) => {
      const data = JSON.parse(ev.data as string) as HubEvent;
      if (data.type !== "message") return;
      setMessages((prev) => [...prev.slice(-99), data.message]);
    };
    return () => ws.close();
  }, []);

  const rootStyle = useMemo(
    () =>
      ({
        fontSize: `${params.fontSize}px`,
        ["--overlay-emote-size" as string]: `${params.emoteSize}px`,
        background:
          params.bgTransparency >= 100
            ? "transparent"
            : `rgba(0, 0, 0, ${Math.max(0, Math.min(1, 1 - params.bgTransparency / 100))})`,
      }) as React.CSSProperties,
    [],
  );

  return (
    <div className="overlay-root" style={rootStyle}>
      {messages.map((m) => (
        <OverlayMessage key={m.id} message={m} />
      ))}
    </div>
  );
}

function OverlayMessage({ message }: { message: ChatMessage }) {
  const platform = message.platform as Platform;
  return (
    <div className="overlay-msg">
      {params.platformIcons ? (
        <img
          className="overlay-platform-icon"
          src={platformIconSrc(platform)}
          alt={platform}
          title={platform}
        />
      ) : null}
      <p style={{ margin: 0, minWidth: 0, flex: 1 }}>
        {(message.badges ?? []).map((badge, i) => (
          <img
            key={`${badge.url}-${i}`}
            className="overlay-badge"
            src={badge.url}
            alt={badge.title ?? ""}
            title={badge.title}
          />
        ))}
        <span className="overlay-username" style={{ color: message.author.color ?? "#e4e4e7" }}>
          {message.author.displayName}
        </span>
        <span className="overlay-text">: </span>
        <span className="overlay-text">
          <MessageBody text={message.text} emotes={message.emotes ?? []} emoteSize={params.emoteSize} />
        </span>
      </p>
    </div>
  );
}
