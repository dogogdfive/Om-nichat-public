"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import type { ResolvedEmote } from "@/lib/emotes/seventv";
import { getNativeEmojiEmotes } from "@/lib/emotes/emoji";
import { searchEmotes } from "@/lib/emotes/search";
import { loadEmoteFavorites, toggleEmoteFavorite } from "@/lib/emote-favorites";
import { loadRecentEmotes, pushRecentEmote } from "@/lib/emote-recent";
import type { EmotePickerGroup } from "@/hooks/useChannelEmotes";
import { PlatformEmblem } from "@/components/PlatformLogos";

type Props = {
  groups: EmotePickerGroup[];
  emotes: ResolvedEmote[];
  emoteSize: number;
  compose: string;
  setCompose: (value: string) => void;
  disabled?: boolean;
  loading?: boolean;
  workspaceId?: string | null;
  searchPlatform?: string;
  searchLogin?: string;
  dockRef?: RefObject<HTMLElement | null>;
  onOpenSettings?: () => void;
};

type TabKind = "recent" | "favorites" | "channel" | "global" | "twitch" | "kick" | "emoji";

type PickerTab = {
  id: string;
  kind: TabKind;
  label: string;
  emotes: ResolvedEmote[];
};

function IconRecent() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67V7z" />
    </svg>
  );
}

function IconEmote() {
  return (
    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm3.5-9c.83 0 1.5-.67 1.5-1.5S16.33 8 15.5 8 14 8.67 14 9.5s.67 1.5 1.5 1.5zm-7 0c.83 0 1.5-.67 1.5-1.5S9.33 8 8.5 8 7 8.67 7 9.5 7.67 11 8.5 11zm3.5 6.5c2.33 0 4.31-1.46 5.11-3.5H6.89c.8 2.04 2.78 3.5 5.11 3.5z" />
    </svg>
  );
}

function IconStar({ filled }: { filled?: boolean }) {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
    </svg>
  );
}

function IconSearch() {
  return (
    <svg className="w-4 h-4 shrink-0 text-zinc-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-3-3" />
    </svg>
  );
}

function IconGlobal() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z" />
    </svg>
  );
}

function IconSmiley() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm3.5-9c.83 0 1.5-.67 1.5-1.5S16.33 8 15.5 8 14 8.67 14 9.5s.67 1.5 1.5 1.5zm-7 0c.83 0 1.5-.67 1.5-1.5S9.33 8 8.5 8 7 8.67 7 9.5 7.67 11 8.5 11zm3.5 6.5c2.33 0 4.31-1.46 5.11-3.5H6.89c.8 2.04 2.78 3.5 5.11 3.5z" />
    </svg>
  );
}

function IconGearSmall() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M19.14 12.94c.04-.31.06-.63.06-.94 0-.31-.02-.63-.06-.94l2.03-1.58a.49.49 0 0 0 .12-.61l-1.92-3.32a.488.488 0 0 0-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.484.484 0 0 0-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94l-2.03 1.58a.49.49 0 0 0-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6A3.6 3.6 0 1 1 12 8.4a3.6 3.6 0 0 1 0 7.2z" />
    </svg>
  );
}

function buildTabs(
  groups: EmotePickerGroup[],
  favorites: Set<string>,
  recent: ResolvedEmote[],
  allEmotes: ResolvedEmote[],
): PickerTab[] {
  const favEmotes = allEmotes.filter((e) => favorites.has(e.name.toLowerCase()));
  const channel7tv = groups.filter(
    (g) => g.provider === "7tv" && g.label.toLowerCase() !== "global",
  );
  const global7tv = groups.find((g) => g.provider === "7tv" && g.label.toLowerCase() === "global");
  const twitchNative = groups.find((g) => g.provider === "twitch")?.emotes ?? [];
  const kickNative = groups.find((g) => g.provider === "kick")?.emotes ?? [];

  const tabs: PickerTab[] = [
    { id: "recent", kind: "recent", label: "Recent", emotes: recent },
    { id: "favorites", kind: "favorites", label: "Favorites", emotes: favEmotes },
  ];

  if (channel7tv.length > 0) {
    for (const g of channel7tv) {
      tabs.push({ id: `7tv-${g.label}`, kind: "channel", label: g.label, emotes: g.emotes });
    }
  } else {
    tabs.push({ id: "7tv-channel", kind: "channel", label: "7TV", emotes: [] });
  }

  tabs.push(
    { id: "global", kind: "global", label: "Global 7TV", emotes: global7tv?.emotes ?? [] },
    { id: "twitch", kind: "twitch", label: "Twitch", emotes: twitchNative },
    { id: "kick", kind: "kick", label: "Kick", emotes: kickNative },
    { id: "emoji-native", kind: "emoji", label: "Emoji", emotes: getNativeEmojiEmotes() },
  );

  return tabs;
}

function TabIcon({ tab }: { tab: PickerTab }) {
  if (tab.kind === "recent") return <IconRecent />;
  if (tab.kind === "favorites") return <IconStar />;
  if (tab.kind === "global") return <IconGlobal />;
  if (tab.kind === "kick") return <PlatformEmblem platform="kick" size={16} />;
  if (tab.kind === "twitch") return <PlatformEmblem platform="twitch" size={16} />;
  if (tab.kind === "emoji") return <IconSmiley />;
  return null;
}

function Channel7TVTabLabel() {
  return <span className="prochat-emote-picker-tab-7tv">7TV</span>;
}

function isEmojiTab(kind: TabKind): boolean {
  return kind === "emoji";
}

export function EmoteComposePicker({
  groups,
  emotes,
  emoteSize,
  compose,
  setCompose,
  disabled,
  loading,
  workspaceId,
  searchPlatform,
  searchLogin,
  dockRef,
  onOpenSettings,
}: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [remoteHits, setRemoteHits] = useState<ResolvedEmote[]>([]);
  const [remoteSearching, setRemoteSearching] = useState(false);
  const [activeTabId, setActiveTabId] = useState("recent");
  const [favorites, setFavorites] = useState<Set<string>>(() => loadEmoteFavorites(workspaceId));
  const [recent, setRecent] = useState<ResolvedEmote[]>(() => loadRecentEmotes(workspaceId));
  const wrapRef = useRef<HTMLDivElement>(null);
  const userPickedTabRef = useRef(false);

  const pickerEmoteSize = Math.min(emoteSize, 28);

  const allEmotes = useMemo(() => {
    const map = new Map<string, ResolvedEmote>();
    for (const e of emotes) map.set(e.name.toLowerCase(), e);
    for (const g of groups) {
      for (const e of g.emotes) map.set(e.name.toLowerCase(), e);
    }
    for (const e of getNativeEmojiEmotes()) map.set(e.name.toLowerCase(), e);
    return [...map.values()];
  }, [emotes, groups]);

  const tabs = useMemo(
    () => buildTabs(groups, favorites, recent, allEmotes),
    [groups, favorites, recent, allEmotes],
  );

  const activeTab = useMemo(
    () => tabs.find((t) => t.id === activeTabId) ?? tabs[0],
    [tabs, activeTabId],
  );

  const colonMatch = compose.match(/:(\w*)$/);
  const colonQuery = colonMatch?.[1] ?? "";
  const showColonSuggest = colonMatch != null && emotes.length > 0;

  const sortByQuery = (q: string) => (a: ResolvedEmote, b: ResolvedEmote) => {
    const al = a.name.toLowerCase();
    const bl = b.name.toLowerCase();
    return (al.startsWith(q) ? 0 : 1) - (bl.startsWith(q) ? 0 : 1) || al.localeCompare(bl);
  };

  const filtered = useMemo(() => {
    const q = (open ? search : colonQuery).trim().toLowerCase();
    if (!q) return activeTab?.emotes ?? [];
    const pool = open ? allEmotes : emotes;
    const local = pool.filter((e) => e.name.toLowerCase().includes(q)).sort(sortByQuery(q));
    if (remoteHits.length === 0) return local;
    const seen = new Set(local.map((e) => e.name.toLowerCase()));
    const merged = [...local];
    for (const e of remoteHits) {
      const key = e.name.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        merged.push(e);
      }
    }
    return merged.sort(sortByQuery(q));
  }, [activeTab, allEmotes, emotes, search, open, colonQuery, remoteHits]);

  useEffect(() => {
    setFavorites(loadEmoteFavorites(workspaceId));
    setRecent(loadRecentEmotes(workspaceId));
  }, [workspaceId]);

  useEffect(() => {
    if (!open) {
      setRemoteHits([]);
      setRemoteSearching(false);
      return;
    }
    const q = search.trim();
    if (!workspaceId || q.length < 2) {
      setRemoteHits([]);
      setRemoteSearching(false);
      return;
    }
    let cancelled = false;
    setRemoteSearching(true);
    const timer = window.setTimeout(() => {
      void searchEmotes(workspaceId, q, { platform: searchPlatform, login: searchLogin }).then((hits) => {
        if (!cancelled) {
          setRemoteHits(hits);
          setRemoteSearching(false);
        }
      });
    }, 180);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [open, search, workspaceId, searchPlatform, searchLogin]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const target = e.target as Node;
      if (wrapRef.current?.contains(target)) return;
      if (dockRef?.current?.contains(target)) return;
      setOpen(false);
    };
    const onClosePopovers = () => setOpen(false);
    document.addEventListener("mousedown", onDoc);
    window.addEventListener("omnichat-close-popovers", onClosePopovers);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      window.removeEventListener("omnichat-close-popovers", onClosePopovers);
    };
  }, [open, dockRef]);

  useEffect(() => {
    if (!open) {
      userPickedTabRef.current = false;
      return;
    }
    if (userPickedTabRef.current) return;
    const recentTab = tabs.find((t) => t.kind === "recent" && t.emotes.length > 0);
    const channelTab = tabs.find((t) => t.kind === "channel" && t.emotes.length > 0);
    const globalTab = tabs.find((t) => t.kind === "global");
    setActiveTabId(
      recentTab?.id ?? channelTab?.id ?? globalTab?.id ?? tabs[0]?.id ?? "recent",
    );
  }, [open, tabs]);

  const resolveEmote = useCallback(
    (name: string): ResolvedEmote | undefined => {
      const lower = name.toLowerCase();
      return (
        allEmotes.find((e) => e.name === name || e.name.toLowerCase() === lower) ??
        filtered.find((e) => e.name === name || e.name.toLowerCase() === lower)
      );
    },
    [allEmotes, filtered],
  );

  const insertEmote = useCallback(
    (name: string) => {
      const token = name;
      if (workspaceId) {
        const hit = resolveEmote(name);
        if (hit) setRecent(pushRecentEmote(workspaceId, hit));
      }
      if (colonMatch) {
        setCompose(compose.slice(0, -colonQuery.length - 1) + token + " ");
      } else {
        setCompose(compose ? `${compose.trimEnd()} ${token} ` : `${token} `);
      }
      setOpen(false);
      setSearch("");
    },
    [colonMatch, colonQuery, compose, setCompose, workspaceId, resolveEmote],
  );

  const onEmoteContextMenu = useCallback(
    (e: ReactMouseEvent, name: string) => {
      if (!workspaceId || isEmojiTab(activeTab?.kind ?? "channel")) return;
      e.preventDefault();
      setFavorites((prev) => toggleEmoteFavorite(workspaceId, prev, name));
    },
    [workspaceId, activeTab?.kind],
  );

  const emoteGrid = (
    <div className="prochat-emote-grid">
      {filtered.map((e) => {
        const isFav = favorites.has(e.name.toLowerCase());
        const isEmoji = !e.url || e.provider === "emoji";
        return (
          <button
            key={`${e.id}-${e.name}`}
            type="button"
            className={`prochat-emote-cell ${isFav ? "prochat-emote-cell--fav" : ""}`}
            title={`${e.name}${workspaceId && !isEmoji ? " · right-click to favorite" : ""}`}
            onClick={() => insertEmote(e.name)}
            onContextMenu={(ev) => onEmoteContextMenu(ev, e.name)}
          >
            {isEmoji ? (
              <span className="prochat-emote-emoji-char" style={{ fontSize: pickerEmoteSize }}>
                {e.name}
              </span>
            ) : (
              <img
                src={e.url}
                alt={e.name}
                style={{ height: pickerEmoteSize, width: "auto" }}
                loading="lazy"
                draggable={false}
              />
            )}
          </button>
        );
      })}
    </div>
  );

  const pickerPanel = open && (
    <div className="prochat-emote-picker prochat-emote-picker--anchored" role="listbox">
      <div className="prochat-emote-picker-tabs">
        {tabs.map((tab) => {
          const isActive = tab.id === activeTab?.id;
          return (
            <button
              key={tab.id}
              type="button"
              className={`prochat-emote-picker-tab ${isActive ? "prochat-emote-picker-tab--active" : ""}`}
              onClick={(e) => {
                e.stopPropagation();
                userPickedTabRef.current = true;
                setActiveTabId(tab.id);
                setSearch("");
              }}
              title={`${tab.label} (${tab.emotes.length})`}
              aria-label={tab.label}
              aria-selected={isActive}
            >
              {tab.kind === "channel" ? <Channel7TVTabLabel /> : <TabIcon tab={tab} />}
            </button>
          );
        })}
      </div>

      <div className="prochat-emote-picker-search-wrap">
        <IconSearch />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search emotes"
          className="prochat-emote-picker-search"
          aria-label="Search emotes"
        />
      </div>

      <div className="prochat-emote-picker-body">
        {loading && filtered.length === 0 && (
          <p className="prochat-emote-empty prochat-emote-picker-body-fill">Loading emotes…</p>
        )}
        {remoteSearching && search.trim().length >= 2 && (
          <p className="prochat-emote-empty prochat-emote-picker-body-fill">Searching…</p>
        )}
        {!loading && filtered.length === 0 && !remoteSearching && (
          <p className="prochat-emote-empty prochat-emote-picker-body-fill">
            No emotes in {activeTab?.label ?? "this category"}
          </p>
        )}
        {filtered.length > 0 && emoteGrid}
      </div>

      {onOpenSettings && (
        <button
          type="button"
          className="prochat-emote-picker-settings"
          onClick={() => {
            setOpen(false);
            onOpenSettings();
          }}
          title="Emote settings"
          aria-label="Emote settings"
        >
          <IconGearSmall />
        </button>
      )}
    </div>
  );

  const colonPanel = !open && showColonSuggest && filtered.length > 0 && (
    <div className="prochat-emote-colon-suggest" role="listbox">
      <div className="prochat-emote-grid prochat-emote-grid--compact">
        {filtered.slice(0, 24).map((e) => (
          <button
            key={`colon-${e.id}-${e.name}`}
            type="button"
            className="prochat-emote-cell"
            title={e.name}
            onClick={() => insertEmote(e.name)}
          >
            <img src={e.url} alt={e.name} style={{ height: pickerEmoteSize }} loading="lazy" draggable={false} />
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <>
      <div ref={wrapRef} className="prochat-emote-picker-anchor">
        <button
          type="button"
          disabled={disabled}
          onClick={() => setOpen((v) => !v)}
          className={`prochat-emote-btn ${open ? "prochat-emote-btn--active" : ""}`}
          title="Emotes"
          aria-label="Emotes"
          aria-expanded={open}
        >
          <IconEmote />
        </button>

        {pickerPanel}
        {!dockRef && colonPanel}
      </div>

      {colonPanel && dockRef?.current ? createPortal(colonPanel, dockRef.current) : null}
    </>
  );
}

export function useEmoteAutocomplete(
  compose: string,
  setCompose: (v: string) => void,
  emotes: ResolvedEmote[],
) {
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Tab" && e.key !== "Enter") return;
    const match = compose.match(/:(\w+)$/);
    if (!match) return;
    const q = match[1].toLowerCase();
    const hit = emotes.find((em) => em.name.toLowerCase() === q || em.name.toLowerCase().startsWith(q));
    if (!hit) return;
    e.preventDefault();
    setCompose(compose.slice(0, -match[0].length) + hit.name + " ");
  };
  return { onKeyDown };
}
