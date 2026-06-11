import { useEffect, useMemo, useState } from "react";
import type { ChatMessage, HubEvent, Platform, StreamAlertEvent } from "@omnichat/chat-types";
import { MessageBody } from "./MessageBody";
import { OverlayStreamAlert } from "./OverlayStreamAlert";
import { platformIconSrc, readOverlayParams } from "./params";
import { overlayBackground } from "./theme";

const params = readOverlayParams();

type OverlayItem =
  | { kind: "message"; id: string; message: ChatMessage }
  | { kind: "alert"; id: string; alert: StreamAlertEvent };

export function App() {
  const [items, setItems] = useState<OverlayItem[]>([]);

  useEffect(() => {
    const ws = new WebSocket(`${params.ws}?room=${encodeURIComponent(params.room)}`);
    ws.onmessage = (ev) => {
      const data = JSON.parse(ev.data as string) as HubEvent;
      if (data.type === "message") {
        setItems((prev) => [
          ...prev.slice(-99),
          { kind: "message", id: data.message.id, message: data.message },
        ]);
        return;
      }
      if (data.type === "stream_alert" && data.alert && params.eventMessages) {
        setItems((prev) => [
          ...prev.slice(-99),
          { kind: "alert", id: data.alert.id, alert: data.alert },
        ]);
      }
    };
    return () => ws.close();
  }, []);

  const rootStyle = useMemo(
    () =>
      ({
        fontSize: `${params.fontSize}px`,
        ["--overlay-emote-size" as string]: `${params.emoteSize}px`,
        background: overlayBackground(params.bgTransparency),
      }) as React.CSSProperties,
    [],
  );

  return (
    <div className="overlay-root" style={rootStyle}>
      {items.map((item) =>
        item.kind === "alert" ? (
          <OverlayStreamAlert
            key={item.id}
            alert={item.alert}
            showPlatformIcon={params.platformIcons}
          />
        ) : (
          <OverlayMessage key={item.id} message={item.message} />
        ),
      )}
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
        <span className="overlay-text-muted">: </span>
        <span className="overlay-text">
          <MessageBody text={message.text} emotes={message.emotes ?? []} emoteSize={params.emoteSize} />
        </span>
      </p>
    </div>
  );
}
