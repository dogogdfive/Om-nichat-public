import { useEffect, useMemo, useState } from "react";
import type { ChatMessage, HubEvent, Platform, StreamAlertEvent } from "@omnichat/chat-types";
import { messageMatchesChatTab } from "@omnichat/chat-tabs";
import { OverlayAddChannels } from "./OverlayAddChannels";
import { OverlayChannelTabs } from "./OverlayChannelTabs";
import { MessageBody } from "./MessageBody";
import { OverlayStreamAlert } from "./OverlayStreamAlert";
import { platformIconSrc, readOverlayParams } from "./params";
import { overlayBackground } from "./theme";
import { useOverlayAutoScroll } from "./useOverlayAutoScroll";
import { useOverlayEmotes } from "./useOverlayEmotes";
import { useOverlayTabs } from "./useOverlayTabs";
import { workspaceIdFromRoom } from "./sync-tabs";

const params = readOverlayParams();
const workspaceId = workspaceIdFromRoom(params.room);

type OverlayItem =
  | { kind: "message"; id: string; message: ChatMessage }
  | { kind: "alert"; id: string; alert: StreamAlertEvent };

function alertMatchesTab(
  alert: StreamAlertEvent,
  tab: ReturnType<typeof useOverlayTabs>["resolvedActiveTab"],
  handles: ReturnType<typeof useOverlayTabs>["feedFilterHandles"],
): boolean {
  return messageMatchesChatTab(
    {
      channelId: alert.channelId,
      login: alert.channelId,
      platform: alert.platform,
      streamEventKind: alert.kind,
    },
    tab,
    handles,
  );
}

function messageMatchesOverlayTab(
  message: ChatMessage,
  tab: ReturnType<typeof useOverlayTabs>["resolvedActiveTab"],
  handles: ReturnType<typeof useOverlayTabs>["feedFilterHandles"],
): boolean {
  const channelId = (message.channelId ?? "")
    .replace(/^#/, "")
    .replace(/^@/, "")
    .toLowerCase();
  if (!channelId) return false;
  return messageMatchesChatTab(
    {
      channelId,
      login: message.author.username ?? message.author.displayName,
      platform: message.platform,
    },
    tab,
    handles,
  );
}

export function App() {
  const [items, setItems] = useState<OverlayItem[]>([]);
  const [wsOpen, setWsOpen] = useState(false);
  const emoteMap = useOverlayEmotes(params.ws, workspaceId);
  const {
    applyRemote,
    barTabs,
    allTabs,
    activeTabId,
    resolvedActiveTab,
    feedFilterHandles,
    combineMode,
    combineSelection,
    addPanelOpen,
    streamerProfiles,
    selectTab,
    separateTab,
    removeTab,
    openAdd,
    closeAdd,
    refreshAfterAdd,
    toggleCombineMode,
  } = useOverlayTabs(params);

  const pageBg = overlayBackground(params.bgTransparency);

  useEffect(() => {
    document.documentElement.style.setProperty("--overlay-page-bg", pageBg);
    document.documentElement.style.background = pageBg;
    document.body.style.background = pageBg;
  }, [pageBg]);

  useEffect(() => {
    setItems((prev) =>
      prev.filter((item) => {
        if (item.kind === "alert") {
          return alertMatchesTab(item.alert, resolvedActiveTab, feedFilterHandles);
        }
        return messageMatchesOverlayTab(item.message, resolvedActiveTab, feedFilterHandles);
      }),
    );
  }, [activeTabId, resolvedActiveTab, feedFilterHandles]);

  useEffect(() => {
    const wsUrl = `${params.ws}?room=${encodeURIComponent(params.room)}`;
    const ws = new WebSocket(wsUrl);
    ws.onopen = () => setWsOpen(true);
    ws.onclose = () => setWsOpen(false);
    ws.onerror = () => {
      console.error("[overlay] WebSocket failed:", wsUrl);
    };
    ws.onmessage = (ev) => {
      const data = JSON.parse(ev.data as string) as HubEvent;
      if (data.type === "chat_tabs" && data.state) {
        applyRemote(data.state, data.channels);
        return;
      }
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
    return () => {
      setWsOpen(false);
      ws.close();
    };
  }, [applyRemote]);

  const visibleItems = useMemo(
    () =>
      items.filter((item) => {
        if (item.kind === "alert") {
          return alertMatchesTab(item.alert, resolvedActiveTab, feedFilterHandles);
        }
        return messageMatchesOverlayTab(item.message, resolvedActiveTab, feedFilterHandles);
      }),
    [items, resolvedActiveTab, feedFilterHandles],
  );

  const scrollKey = visibleItems.map((i) => i.id).join("|");
  const { feedRef } = useOverlayAutoScroll(scrollKey, activeTabId, emoteMap.size);

  const emptyHint = useMemo(() => {
    if (visibleItems.length > 0) return null;
    if (!wsOpen) return "Connecting…";
    if (items.length > 0) return "No messages for this tab — open chat to sync tabs";
    return "Waiting for chat…";
  }, [visibleItems.length, wsOpen, items.length]);

  const rootStyle = useMemo(
    () =>
      ({
        fontSize: `${params.fontSize}px`,
        ["--overlay-emote-size" as string]: `${params.emoteSize}px`,
        background: pageBg,
      }) as React.CSSProperties,
    [pageBg],
  );

  return (
    <div className="overlay-root" style={rootStyle}>
      {params.showTabs ? (
        <OverlayChannelTabs
          tabs={barTabs}
          allTabs={allTabs}
          activeTabId={activeTabId}
          combineMode={combineMode}
          combineSelection={combineSelection}
          streamerProfiles={streamerProfiles}
          onSelect={selectTab}
          onRemove={removeTab}
          onToggleCombineMode={toggleCombineMode}
          onSeparateTab={separateTab}
          onOpenAdd={openAdd}
        />
      ) : null}
      {addPanelOpen && workspaceId ? (
        <OverlayAddChannels
          ws={params.ws}
          workspaceId={workspaceId}
          onClose={closeAdd}
          onAdded={refreshAfterAdd}
        />
      ) : null}
      <div className="overlay-feed" ref={feedRef}>
        <div className="overlay-feed-inner">
          <div className="overlay-feed-spacer" aria-hidden />
          {emptyHint ? <p className="overlay-empty-hint">{emptyHint}</p> : null}
          {visibleItems.map((item) =>
            item.kind === "alert" ? (
              <OverlayStreamAlert
                key={item.id}
                alert={item.alert}
                showPlatformIcon={params.platformIcons}
              />
            ) : (
              <OverlayMessage key={item.id} message={item.message} emoteMap={emoteMap} />
            ),
          )}
          <div className="overlay-feed-anchor" aria-hidden />
        </div>
      </div>
    </div>
  );
}

function OverlayMessage({
  message,
  emoteMap,
}: {
  message: ChatMessage;
  emoteMap: Map<string, import("./useOverlayEmotes").ResolvedEmote>;
}) {
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
          <MessageBody
            text={message.text}
            emotes={message.emotes ?? []}
            emoteMap={emoteMap}
            emoteSize={params.emoteSize}
          />
        </span>
      </p>
    </div>
  );
}
