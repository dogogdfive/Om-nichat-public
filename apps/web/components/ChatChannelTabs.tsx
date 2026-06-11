"use client";

import { memo, useState } from "react";
import { PlatformEmblem } from "@/components/PlatformLogos";
import {
  ALL_CHAT_TAB_ID,
  canCombineTabs,
  streamerTabCount,
  type ChatTab,
  type ChatTabHandle,
} from "@/lib/chat-tabs-storage";
import { messageMatchesChatTab } from "@omnichat/chat-tabs";
export { messageMatchesChatTab };
import type { PlatformId } from "@/components/platform-icons";
import { CommunityViewerButton } from "@/components/CommunityViewerButton";
import type { ChannelChatterGroup } from "@/lib/active-chatters";
import type { StreamViewerSnapshot } from "@/lib/stream-viewers";

type ProfileTarget = {
  platform: "twitch" | "kick" | "x" | "youtube" | "rumble";
  userId: string;
  displayName: string;
  login: string;
  channelLogin?: string;
};

type Props = {
  tabs: ChatTab[];
  allTabs: ChatTab[];
  activeTabId: string;
  onSelect: (id: string) => void;
  onRemove: (id: string) => void;
  combineMode?: boolean;
  combineSelection?: string | null;
  onToggleCombineMode?: () => void;
  onCombineTabs?: (tabAId: string, tabBId: string) => void;
  onSeparateTab?: (combinedId: string) => void;
  viewerSnapshot?: StreamViewerSnapshot | null;
  viewersLoading?: boolean;
  messageChatterGroups?: ChannelChatterGroup[];
  workspaceId?: string | null;
  onOpenProfile?: (target: ProfileTarget) => void;
  onOpenChannelsSettings?: () => void;
};

function IconClose() {
  return (
    <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12 19 6.41z" />
    </svg>
  );
}

function tabPlatforms(tab: ChatTab): PlatformId[] {
  if (tab.isAll) return [];
  const order: PlatformId[] = ["twitch", "kick", "youtube", "x"];
  const seen = new Set<string>();
  const out: PlatformId[] = [];
  for (const p of order) {
    if (tab.handles.some((h) => h.platform === p) && !seen.has(p)) {
      seen.add(p);
      out.push(p);
    }
  }
  for (const h of tab.handles) {
    const p = h.platform as PlatformId;
    if (!seen.has(p)) {
      seen.add(p);
      out.push(p);
    }
  }
  return out;
}

function ChannelTabLabel({ tab }: { tab: ChatTab }) {
  if (tab.isAll) return <>All</>;
  const platforms = tabPlatforms(tab);
  return (
    <span className="prochat-channel-tab-inner">
      {platforms.length > 0 && (
        <span className="prochat-channel-tab-icons" aria-hidden>
          {platforms.slice(0, 3).map((p) => (
            <PlatformEmblem key={p} platform={p} size={13} />
          ))}
        </span>
      )}
      <span className="prochat-channel-tab-label">{tab.label}</span>
    </span>
  );
}

function isCombineTarget(tab: ChatTab): boolean {
  return !tab.isAll && !tab.hidden;
}

export const ChatChannelTabs = memo(function ChatChannelTabs({
  tabs,
  allTabs,
  activeTabId,
  onSelect,
  onRemove,
  combineMode = false,
  combineSelection = null,
  onToggleCombineMode,
  onCombineTabs,
  onSeparateTab,
  viewerSnapshot,
  viewersLoading,
  messageChatterGroups,
  workspaceId,
  onOpenProfile,
  onOpenChannelsSettings,
}: Props) {
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [dragSourceId, setDragSourceId] = useState<string | null>(null);

  const activeTab =
    allTabs.find((t) => t.id === activeTabId) ??
    tabs.find((t) => t.id === activeTabId) ??
    tabs.find((t) => t.isAll) ??
    tabs[0]!;

  const showCombineButton = streamerTabCount(allTabs) >= 2;

  const tryMerge = (sourceId: string, targetId: string) => {
    if (sourceId === targetId) return;
    const source = allTabs.find((t) => t.id === sourceId);
    const target = allTabs.find((t) => t.id === targetId);
    if (!source || !target || !canCombineTabs(source, target)) return;
    onCombineTabs?.(sourceId, targetId);
  };

  return (
    <nav className="prochat-tab-bar prochat-tab-bar--channels" aria-label="Chat channels">
      <div className="prochat-channel-tabs-scroll" role="tablist" aria-label="Switch chat">
        {tabs.map((tab) => {
          const active = tab.id === activeTabId;
          const combineTarget = combineMode && isCombineTarget(tab);
          const selectedForCombine = combineSelection === tab.id;
          const dragOver = dragOverId === tab.id;

          return (
            <span
              key={tab.id}
              className={[
                "prochat-channel-tab-wrap",
                active ? "prochat-channel-tab-wrap--active" : "",
                combineTarget && selectedForCombine ? "prochat-channel-tab-wrap--combine-selected" : "",
                combineTarget && dragOver ? "prochat-channel-tab-wrap--combine-target" : "",
                tab.isCombined ? "prochat-channel-tab-wrap--combined" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              role="presentation"
              onDragOver={(e) => {
                if (!combineMode || !isCombineTarget(tab) || !dragSourceId) return;
                e.preventDefault();
                setDragOverId(tab.id);
              }}
              onDragLeave={() => {
                if (dragOverId === tab.id) setDragOverId(null);
              }}
              onDrop={(e) => {
                e.preventDefault();
                const sourceId = e.dataTransfer.getData("text/tab-id") || dragSourceId;
                setDragOverId(null);
                setDragSourceId(null);
                if (sourceId) tryMerge(sourceId, tab.id);
              }}
            >
              <button
                type="button"
                role="tab"
                aria-selected={active}
                id={`chat-tab-${tab.id}`}
                draggable={combineMode && isCombineTarget(tab)}
                onDragStart={(e) => {
                  if (!combineMode || !isCombineTarget(tab)) return;
                  setDragSourceId(tab.id);
                  e.dataTransfer.setData("text/tab-id", tab.id);
                  e.dataTransfer.effectAllowed = "move";
                }}
                onDragEnd={() => {
                  setDragSourceId(null);
                  setDragOverId(null);
                }}
                onClick={() => onSelect(tab.id)}
                className={`prochat-tab prochat-channel-tab ${active ? "" : "prochat-tab--idle"}`}
              >
                <ChannelTabLabel tab={tab} />
              </button>
              {tab.isCombined && onSeparateTab && (
                <button
                  type="button"
                  className="prochat-channel-tab-separate"
                  onClick={(e) => {
                    e.stopPropagation();
                    onSeparateTab(tab.id);
                  }}
                >
                  Separate
                </button>
              )}
              {!tab.isAll && (
                <button
                  type="button"
                  className="prochat-channel-tab-close"
                  aria-label={tab.isCombined ? `Remove ${tab.label}` : `Close ${tab.label} tab`}
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemove(tab.id);
                  }}
                >
                  <IconClose />
                </button>
              )}
            </span>
          );
        })}

        {showCombineButton && (
          <>
            <button
              type="button"
              className={`prochat-tab prochat-tab--combine${combineMode ? " prochat-tab--combine-active" : ""}`}
              aria-pressed={combineMode}
              title={combineMode ? "Exit combine mode" : "Combine streamer tabs into one feed"}
              onClick={() => onToggleCombineMode?.()}
            >
              Combine
            </button>
            {combineMode && (
              <span className="prochat-combine-hint">
                Click or drag tabs together to combine
              </span>
            )}
          </>
        )}

        <button
          type="button"
          className="prochat-tab prochat-tab--add-channels"
          title="Add streamer chats in settings"
          aria-label="Add chats"
          onClick={() => onOpenChannelsSettings?.()}
        >
          +chats
        </button>
      </div>

      <div className="prochat-filter-tabs">
        <CommunityViewerButton
          streams={viewerSnapshot?.streams ?? []}
          loading={viewersLoading}
          messageChatterGroups={messageChatterGroups}
          workspaceId={workspaceId}
          activeTab={activeTab}
          allTabs={allTabs}
          onOpenProfile={onOpenProfile}
        />
      </div>
    </nav>
  );
});

export { ALL_CHAT_TAB_ID };
