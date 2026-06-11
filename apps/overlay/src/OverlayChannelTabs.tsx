import {
  streamerTabCount,
  type ChatTab,
} from "@omnichat/chat-tabs";
import { platformIconSrc } from "./params";

type Props = {
  tabs: ChatTab[];
  allTabs: ChatTab[];
  activeTabId: string;
  combineMode: boolean;
  combineSelection: string | null;
  onSelect: (id: string) => void;
  onRemove: (id: string) => void;
  onToggleCombineMode: () => void;
  onSeparateTab: (id: string) => void;
  onOpenAdd: () => void;
};

function tabPlatforms(tab: ChatTab): string[] {
  if (tab.isAll) return [];
  const order = ["twitch", "kick", "youtube", "x"];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of order) {
    if (tab.handles.some((h) => h.platform === p) && !seen.has(p)) {
      seen.add(p);
      out.push(p);
    }
  }
  for (const h of tab.handles) {
    if (!seen.has(h.platform)) {
      seen.add(h.platform);
      out.push(h.platform);
    }
  }
  return out;
}

function ChannelTabLabel({ tab }: { tab: ChatTab }) {
  if (tab.isAll) return <>All</>;
  const platforms = tabPlatforms(tab);
  return (
    <span className="overlay-channel-tab-inner">
      {platforms.length > 0 && (
        <span className="overlay-channel-tab-icons" aria-hidden>
          {platforms.slice(0, 3).map((p) => (
            <img key={p} src={platformIconSrc(p)} alt="" className="overlay-channel-tab-icon" />
          ))}
        </span>
      )}
      <span className="overlay-channel-tab-label">{tab.label}</span>
    </span>
  );
}

export function OverlayChannelTabs({
  tabs,
  allTabs,
  activeTabId,
  combineMode,
  combineSelection,
  onSelect,
  onRemove,
  onToggleCombineMode,
  onSeparateTab,
  onOpenAdd,
}: Props) {
  const showCombineButton = streamerTabCount(allTabs) >= 2;

  return (
    <nav className="overlay-tab-bar" aria-label="Chat channels">
      <div className="overlay-channel-tabs-scroll" role="tablist">
        {tabs.map((tab) => {
          const active = tab.id === activeTabId;
          const selectedForCombine = combineSelection === tab.id;
          return (
            <span
              key={tab.id}
              className={[
                "overlay-channel-tab-wrap",
                active ? "overlay-channel-tab-wrap--active" : "",
                combineMode && selectedForCombine ? "overlay-channel-tab-wrap--combine-selected" : "",
                tab.isCombined ? "overlay-channel-tab-wrap--combined" : "",
              ]
                .filter(Boolean)
                .join(" ")}
            >
              <button
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => onSelect(tab.id)}
                className="overlay-channel-tab"
              >
                <ChannelTabLabel tab={tab} />
              </button>
              {tab.isCombined && (
                <button
                  type="button"
                  className="overlay-channel-tab-separate"
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
                  className="overlay-channel-tab-close"
                  aria-label={`Close ${tab.label}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemove(tab.id);
                  }}
                >
                  ×
                </button>
              )}
            </span>
          );
        })}

        {showCombineButton && (
          <button
            type="button"
            className={`overlay-tab-combine${combineMode ? " overlay-tab-combine--active" : ""}`}
            onClick={onToggleCombineMode}
          >
            Combine
          </button>
        )}

        <button type="button" className="overlay-tab-add" onClick={onOpenAdd}>
          +chats
        </button>
      </div>
    </nav>
  );
}
