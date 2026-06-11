"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState, startTransition } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { apiFetch, API_URL } from "@/lib/api";
import { getToken } from "@/lib/auth";
import {
  connectionsToFlags,
  fetchConnectionsWithRetry,
  isConnectionPlatform,
  type ConnectionPlatform,
} from "@/lib/connections";
import { ChatSettingsPanel, type SettingsSection } from "@/components/ChatSettingsPanel";
import { ChatThemeToggle } from "@/components/ChatThemeToggle";
import { ChatFeed } from "@/components/ChatFeed";
import { ChatChannelTabs, messageMatchesChatTab } from "@/components/ChatChannelTabs";
import { ChatPollOverlay } from "@/components/ChatPollOverlay";
import { PinnedMessageBar } from "@/components/PinnedMessageBar";
import { EmoteComposePicker, useEmoteAutocomplete } from "@/components/EmoteComposePicker";
import { UserProfileModal, type ModActionRecord, type RecentChatMessage } from "@/components/UserProfileModal";
import { ViewerCountBar } from "@/components/ViewerCountBar";
import { ChatNotificationBell } from "@/components/ChatNotificationBell";
import { PlatformEmblem } from "@/components/PlatformLogos";
import { useEmoteSets } from "@/hooks/useEmoteSets";
import { useChannelEmoteGroups } from "@/hooks/useChannelEmotes";
import { useChatTabs } from "@/hooks/useChatTabs";
import { useViewerCounts } from "@/hooks/useViewerCounts";
import { useChatChunkBuffer, type IncomingChatMessage } from "@/hooks/useChatChunkBuffer";
import { collectMentionUsers, useMentionAutocomplete } from "@/hooks/useMentionAutocomplete";
import { primaryHandleForTab, resolveTabHandles } from "@/lib/chat-tabs-storage";
import { buildSendTargets, missingSendSetup } from "@/lib/send-targets";
import { collectActiveChatters } from "@/lib/active-chatters";
import { CHAT_SETTINGS_CHANGED, DEFAULT_SETTINGS, loadChatSettings, linkSendForAllConnected, saveChatSettings, type ChatSettings } from "@/lib/chat-settings-storage";
import { chatFontFamily, timestampsHidden } from "@/lib/chat-appearance";
import { syncChatIngest } from "@/lib/sync-ingest";
import { chatThemeClass, loadChatTheme, saveChatTheme, type ChatTheme } from "@/lib/chat-theme";
import { applyModNoteToLines, formatModNote } from "@/lib/format-mod-note";
import type { ResolvedEmote } from "@/lib/emotes/seventv";
import type { PinnedMessageEvent, PollEvent, StreamAlertEvent } from "@/lib/overlay-types";
import { streamAlertToChatLine } from "@/lib/stream-alert-line";

type ChatMessageLine = {
  kind: "message";
  id: string;
  platform: "twitch" | "kick" | "x" | "youtube" | "rumble";
  channelId: string;
  user: string;
  userId: string;
  login: string;
  color?: string;
  badges?: { url: string; title?: string }[];
  text: string;
  time: string;
  ts?: number;
  modNote?: string;
  inlineEmotes?: { id: string; name: string; url: string }[];
};

type SystemVariant = "plain" | "welcome" | "action" | "connected";

type SystemLine = {
  kind: "system";
  variant: SystemVariant;
  time: string;
  text: string;
  platforms?: ("twitch" | "kick" | "x" | "youtube" | "rumble")[];
};

type ChatLine = SystemLine | ChatMessageLine;

type ProfileTarget = {
  platform: "twitch" | "kick" | "x" | "youtube" | "rumble";
  userId: string;
  displayName: string;
  login: string;
  channelLogin?: string;
};

const MAX_LINES = 400;
const CONNECT_ONBOARDING_KEY = "omnichat-connect-onboarding-done";

function readStoredSettings(): ChatSettings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  return loadChatSettings();
}

function capLines(lines: ChatLine[]): ChatLine[] {
  return lines.length > MAX_LINES ? lines.slice(lines.length - MAX_LINES) : lines;
}

function nowTime() {
  return new Date().toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function IconLightning() {
  return (
    <svg className="w-2.5 h-2.5" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M13 2L3 14h8l-1 8 10-12h-8l1-8z" />
    </svg>
  );
}

function IconGear() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M19.14 12.94c.04-.31.06-.63.06-.94 0-.31-.02-.63-.06-.94l2.03-1.58a.49.49 0 0 0 .12-.61l-1.92-3.32a.488.488 0 0 0-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.484.484 0 0 0-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94l-2.03 1.58a.49.49 0 0 0-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6A3.6 3.6 0 1 1 12 8.4a3.6 3.6 0 0 1 0 7.2z" />
    </svg>
  );
}

function IconLink() {
  return (
    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M3.9 12c0-1.71 1.39-3.1 3.1-3.1h4V7H7c-2.76 0-5 2.24-5 5s2.24 5 5 5h4v-1.9H7c-1.71 0-3.1-1.39-3.1-3.1zM8 13h8v-2H8v2zm9-6h-4v1.9h4c1.71 0 3.1 1.39 3.1 3.1s-1.39 3.1-3.1 3.1h-4V17h4c2.76 0 5-2.24 5-5s-2.24-5-5-5z" />
    </svg>
  );
}

function SystemMessage({
  line,
  onOpenSettings,
  showTime,
}: {
  line: SystemLine;
  onOpenSettings: () => void;
  showTime: boolean;
}) {
  if (line.variant === "connected" && line.platforms?.length) {
    return (
      <div className="prochat-system-connected">
        {showTime && <time>{line.time}</time>}
        <div className="prochat-system-connected-body">
          <span>Successfully connected to</span>
          <div className="prochat-system-connected-logos">
            {line.platforms.map((p) => (
              <PlatformEmblem key={p} platform={p} size={22} />
            ))}
          </div>
        </div>
      </div>
    );
  }

  const className =
    line.variant === "welcome"
      ? "prochat-system-welcome"
      : line.variant === "action"
        ? "prochat-system-action"
        : "prochat-system-plain";

  if (line.variant === "action" && line.text.includes("Settings")) {
    const [before] = line.text.split("Settings");
    return (
      <div className={className}>
        {showTime && <time>{line.time}</time>}
        {before.trimEnd()}
        {" → "}
        <button type="button" onClick={onOpenSettings} className="inline-flex items-center gap-1 font-semibold underline underline-offset-2 hover:text-blue-800">
          <IconGear />
          Settings
        </button>
      </div>
    );
  }

  return (
    <div className={className}>
      {showTime && <time>{line.time}</time>}
      {line.text}
    </div>
  );
}

function ChatApp() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [lines, setLines] = useState<ChatLine[]>([]);
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [compose, setCompose] = useState("");
  const [connected, setConnected] = useState<Record<string, boolean>>({});
  const [settingsTick, setSettingsTick] = useState(0);

  const settingsChannels = useMemo(
    () =>
      readStoredSettings().channels.map((c) => ({
        platform: c.platform,
        handle: c.handle,
      })),
    [settingsTick],
  );

  const settingsChannelRows = useMemo(
    () => readStoredSettings().channels,
    [settingsTick],
  );

  const settingsProfiles = useMemo(
    () => readStoredSettings().profiles,
    [settingsTick],
  );

  const chatAppearance = useMemo(
    () => readStoredSettings().appearance,
    [settingsTick],
  );

  const handleConnectionsChange = useCallback(
    (conn: Record<string, boolean>) => {
      setConnected(conn);

      const settings = loadChatSettings();
      const linked = linkSendForAllConnected(settings.channels, conn);
      if (linked.some((c, i) => c.sendLinked !== settings.channels[i]?.sendLinked)) {
        saveChatSettings({ ...settings, channels: linked });
      }
    },
    [],
  );

  useEffect(() => {
    setSettingsTick(1);
    const onChange = () => startTransition(() => setSettingsTick((t) => t + 1));
    window.addEventListener(CHAT_SETTINGS_CHANGED, onChange);
    return () => window.removeEventListener(CHAT_SETTINGS_CHANGED, onChange);
  }, []);

  const { emotes, emoteList, emoteSize, seventvEnabled, cachingEmotes, cacheProgress } =
    useEmoteSets(workspaceId);
  const {
    tabs: chatTabs,
    barTabs,
    activeTab,
    activeTabId,
    removeTab,
    combineMode,
    combineSelection,
    setCombineMode,
    combineTabs,
    separateTab,
    handleTabSelectInCombineMode,
  } = useChatTabs(workspaceId);

  const resolvedActiveTab = useMemo(() => {
    if (activeTab.isAll) return activeTab;
    const handles = resolveTabHandles(activeTab, settingsProfiles, settingsChannelRows);
    return { ...activeTab, handles };
  }, [activeTab, settingsProfiles, settingsChannelRows]);

  const feedFilterHandles = useMemo(() => {
    if (activeTab.isAll) {
      return settingsChannelRows.map((c) => ({
        platform: c.platform,
        handle: c.handle.replace(/^@/, ""),
      }));
    }
    return resolvedActiveTab.handles;
  }, [activeTab.isAll, resolvedActiveTab.handles, settingsChannelRows]);

  const feedFilterRef = useRef(feedFilterHandles);
  feedFilterRef.current = feedFilterHandles;

  const watchedChannelKeys = useMemo(
    () =>
      new Set(
        settingsChannelRows.map(
          (c) =>
            `${c.platform.toLowerCase()}:${c.handle.replace(/^@/, "").replace(/^#/, "").toLowerCase()}`,
        ),
      ),
    [settingsChannelRows],
  );
  const watchedChannelKeysRef = useRef(watchedChannelKeys);
  watchedChannelKeysRef.current = watchedChannelKeys;

  useEffect(() => {
    if (settingsTick === 0) return;
    const allowed = watchedChannelKeysRef.current;
    setLines((prev) =>
      prev.filter((l) => {
        if (l.kind !== "message") return true;
        if (allowed.size === 0) return false;
        const key = `${l.platform.toLowerCase()}:${l.channelId.replace(/^@/, "").replace(/^#/, "").toLowerCase()}`;
        return allowed.has(key);
      }),
    );
  }, [settingsTick]);

  const resolvedChatTabs = useMemo(
    () =>
      chatTabs.map((t) =>
        t.isAll
          ? t
          : {
              ...t,
              handles: resolveTabHandles(t, settingsProfiles, settingsChannelRows),
            },
      ),
    [chatTabs, settingsProfiles, settingsChannelRows],
  );

  const resolvedBarTabs = useMemo(
    () =>
      barTabs.map((t) => {
        const resolved = resolvedChatTabs.find((r) => r.id === t.id);
        return resolved ?? t;
      }),
    [barTabs, resolvedChatTabs],
  );

  const { groups: emoteGroups, flatList: channelEmoteList, loading: emotesLoading } =
    useChannelEmoteGroups(resolvedActiveTab, resolvedChatTabs, seventvEnabled, settingsChannels, emoteList);
  const renderEmotes = useMemo(() => {
    if (channelEmoteList.length === 0) return emotes;
    const merged = new Map(emotes);
    for (const e of channelEmoteList) {
      if (!merged.has(e.name)) merged.set(e.name, e);
      const lower = e.name.toLowerCase();
      if (!merged.has(lower)) merged.set(lower, e);
    }
    return merged;
  }, [emotes, channelEmoteList]);
  const pickerEmotes = useMemo(() => {
    const merged = new Map<string, ResolvedEmote>();
    for (const e of [...emoteList, ...channelEmoteList]) {
      merged.set(e.name.toLowerCase(), e);
    }
    return [...merged.values()];
  }, [emoteList, channelEmoteList]);
  const { snapshot: viewerSnapshot, displayMode: viewerDisplayMode, loading: viewersLoading } =
    useViewerCounts(workspaceId);
  const { onKeyDown: onEmoteKeyDown } = useEmoteAutocomplete(compose, setCompose, pickerEmotes);
  const mentionUsers = useMemo(() => collectMentionUsers(lines), [lines]);
  const mention = useMentionAutocomplete(compose, setCompose, mentionUsers);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [profileTarget, setProfileTarget] = useState<ProfileTarget | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsSection, setSettingsSection] = useState<SettingsSection>("connections");
  const [connectionsRefreshKey, setConnectionsRefreshKey] = useState(0);
  const [modActions, setModActions] = useState<ModActionRecord[]>([]);
  const [polls, setPolls] = useState<Record<string, PollEvent>>({});
  const [pinned, setPinned] = useState<Record<string, PinnedMessageEvent>>({});
  const [userId, setUserId] = useState<string | null>(null);
  const [chatTheme, setChatTheme] = useState<ChatTheme>("classic");
  const footerBarRef = useRef<HTMLDivElement>(null);
  const feedRef = useRef<HTMLDivElement>(null);
  const atBottomRef = useRef(true);
  const [feedPaused, setFeedPaused] = useState(false);
  const chatInitRef = useRef(false);
  const linkedHandledRef = useRef<string | null>(null);
  const connectPromptOpenedRef = useRef(false);
  const seenMessageIdsRef = useRef(new Set<string>());
  const seenStreamAlertIdsRef = useRef(new Set<string>());

  const emotesRef = useRef(renderEmotes);
  emotesRef.current = renderEmotes;

  const appendMessageBatch = useCallback((batch: IncomingChatMessage[]) => {
    startTransition(() => {
      setLines((prev) =>
        capLines([
          ...prev,
          ...batch.map((msg) => ({ kind: "message" as const, ...msg })),
        ]),
      );
    });
  }, []);

  const { pushMessage: pushChatMessage } = useChatChunkBuffer(appendMessageBatch, emotesRef, {
    maxDelayMs: 2650,
    minIntervalMs: 120,
    maxBatch: 40,
    emotePreloadMs: 350,
  });

  const emoteSearchChannel = useMemo(() => {
    const handle = primaryHandleForTab(activeTab);
    if (!handle) return null;
    return { platform: handle.platform, login: handle.handle };
  }, [activeTab]);

  const pushChatMessageRef = useRef(pushChatMessage);
  pushChatMessageRef.current = pushChatMessage;

  useEffect(() => {
    if (!workspaceId) return;
    void syncChatIngest(workspaceId).catch((err) =>
      console.warn("[chat] ingest sync failed", err),
    );
  }, [workspaceId, settingsTick]);

  const addSystem = useCallback(
    (
      text: string,
      variant: SystemVariant = "plain",
      platforms?: ("twitch" | "kick" | "x" | "youtube" | "rumble")[],
    ) => {
      setLines((prev) =>
        capLines([
          ...prev,
          { kind: "system", variant, time: nowTime(), text, platforms },
        ]),
      );
    },
    [],
  );

  const upsertConnectedSystemLine = useCallback(
    (platforms: ("twitch" | "kick" | "x" | "youtube" | "rumble")[]) => {
      if (platforms.length === 0) return;
      setLines((prev) => {
        const existing = prev.find(
          (l): l is SystemLine => l.kind === "system" && l.variant === "connected",
        );
        const sorted = [...platforms].sort();
        const existingSorted = [...(existing?.platforms ?? [])].sort();
        const unchanged =
          existingSorted.length === sorted.length &&
          sorted.every((p, i) => p === existingSorted[i]);
        if (unchanged) return prev;

        const without = prev.filter(
          (l) => !(l.kind === "system" && l.variant === "connected"),
        );
        return capLines([
          ...without,
          {
            kind: "system" as const,
            variant: "connected" as const,
            time: nowTime(),
            text: "",
            platforms: sorted,
          },
        ]);
      });
    },
    [],
  );

  const openSettings = useCallback((section: SettingsSection = "connections") => {
    setSettingsSection(section);
    setSettingsOpen(true);
    window.dispatchEvent(new Event("omnichat-close-popovers"));
  }, []);
  const closeSettings = useCallback(() => setSettingsOpen(false), []);

  useEffect(() => {
    setChatTheme(loadChatTheme());
  }, []);

  const handleThemeChange = useCallback((theme: ChatTheme) => {
    setChatTheme(theme);
    saveChatTheme(theme);
  }, []);

  useEffect(() => {
    if (chatInitRef.current) return;

    if (!getToken()) {
      router.replace("/login");
      return;
    }

    chatInitRef.current = true;
    let cancelled = false;

    (async () => {
      const meRes = await apiFetch("/api/auth/me");
      if (cancelled) return;
      if (!meRes.ok) {
        chatInitRef.current = false;
        router.replace("/login");
        return;
      }
      const me = await meRes.json();
      if (cancelled) return;
      if (me.user?.id) {
        setUserId(me.user.id as string);
      }
      if (!me.workspace?.profileSetupComplete) {
        chatInitRef.current = false;
        router.replace("/onboarding/username");
        return;
      }
      const name = me.workspace.displayName ?? me.workspace.slug;
      setWorkspaceId(me.workspace.id);

      const welcomeKey = "omnichat-welcome-shown";
      if (!sessionStorage.getItem(welcomeKey)) {
        addSystem(`Welcome to OMnichat, ${name}! 🎊👏`, "welcome");
        sessionStorage.setItem(welcomeKey, "1");
      }

      const connRes = await apiFetch(`/api/workspaces/${me.workspace.id}/connections`);
      if (!connRes.ok) {
        if (!searchParams.get("linked")) {
          addSystem("Could not load connections — open Settings → Connections to retry", "plain");
        }
        return;
      }
      const conn = (await connRes.json()).connections as Record<
        string,
        { status: string; username?: string }
      >;
      const connectedPlatforms = (["twitch", "kick", "x", "youtube", "rumble"] as const).filter(
        (p) => conn[p]?.status === "connected",
      );
      const any = connectedPlatforms.length > 0;
      handleConnectionsChange(connectionsToFlags(conn));

      const linkedPlatform = searchParams.get("linked");
      if (connectedPlatforms.length > 0 && !isConnectionPlatform(linkedPlatform)) {
        upsertConnectedSystemLine([...connectedPlatforms]);
      }

      if (!any && !isConnectionPlatform(linkedPlatform)) {
        addSystem("Get started by connecting your accounts → Settings", "action");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [router, addSystem, searchParams, handleConnectionsChange, upsertConnectedSystemLine]);

  useEffect(() => {
    if (searchParams.get("upgraded") !== "1") return;
    router.replace("/chat", { scroll: false });
  }, [searchParams, router]);

  /** After OAuth link, retry connection fetch (API may restart) then clean the URL. */
  useEffect(() => {
    const linkedRaw = searchParams.get("linked");
    const pending =
      (isConnectionPlatform(linkedRaw) ? linkedRaw : null) ??
      (isConnectionPlatform(sessionStorage.getItem("omnichat-oauth-pending"))
        ? (sessionStorage.getItem("omnichat-oauth-pending") as ConnectionPlatform)
        : null);
    if (!pending) return;

    openSettings("connections");
    if (!workspaceId) return;

    let cancelled = false;

    (async () => {
      const conn = await fetchConnectionsWithRetry(workspaceId, { waitFor: pending });
      if (cancelled) return;

      sessionStorage.removeItem("omnichat-oauth-pending");
      if (conn) {
        handleConnectionsChange(connectionsToFlags(conn));
        setConnectionsRefreshKey((k) => k + 1);
      }

      if (conn?.[pending]?.status === "connected") {
        if (linkedHandledRef.current !== pending) {
          linkedHandledRef.current = pending;
        }
        const allConnected = (["twitch", "kick", "x", "youtube", "rumble"] as const).filter(
          (p) => conn[p]?.status === "connected",
        );
        upsertConnectedSystemLine(allConnected);
        await syncChatIngest(workspaceId).catch(() => undefined);
      } else {
        addSystem(
          `${pending.charAt(0).toUpperCase()}${pending.slice(1)} connect did not finish — try Connect again in Settings.`,
          "plain",
        );
      }

      if (isConnectionPlatform(linkedRaw)) {
        router.replace("/chat", { scroll: false });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [searchParams, workspaceId, openSettings, handleConnectionsChange, addSystem, router, upsertConnectedSystemLine]);

  /** First visit: open Settings → Connections so users link platforms in the settings UI. */
  useEffect(() => {
    if (!workspaceId || connectPromptOpenedRef.current) return;
    if (typeof window !== "undefined" && localStorage.getItem(CONNECT_ONBOARDING_KEY)) return;

    const any = Object.values(connected).some(Boolean);
    if (any) {
      localStorage.setItem(CONNECT_ONBOARDING_KEY, "1");
      return;
    }

    connectPromptOpenedRef.current = true;
    openSettings("connections");
  }, [workspaceId, connected, openSettings]);

  const scrollFeedToBottom = useCallback((smooth: boolean) => {
    const el = feedRef.current;
    if (!el || feedPaused) return;
    el.scrollTo({ top: el.scrollHeight, behavior: smooth ? "smooth" : "auto" });
  }, [feedPaused]);

  const onFeedScroll = useCallback(() => {
    const el = feedRef.current;
    if (!el) return;
    atBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 48;
  }, []);

  useEffect(() => {
    if (feedPaused || !atBottomRef.current) return;
    scrollFeedToBottom(false);
  }, [lines, feedPaused, scrollFeedToBottom]);

  useEffect(() => {
    let ws: WebSocket | null = null;
    let closed = false;

    const connect = async () => {
      const meRes = await apiFetch("/api/auth/me");
      if (!meRes.ok || closed) return;
      const me = await meRes.json();
      const wsId = me.workspace?.id;
      if (!wsId || closed) return;

      const wsUrl = API_URL.replace(/^http/, "ws") + `?room=room:${wsId}`;
      if (closed) return;
      ws = new WebSocket(wsUrl);

      ws.onmessage = (ev) => {
        try {
          const data = JSON.parse(ev.data as string);

          if (data.type === "mod" && data.mod) {
            const mod = data.mod as {
              platform: "twitch" | "kick" | "x" | "youtube" | "rumble";
              userId: string;
              login: string;
              action: "timeout" | "ban" | "unban";
              durationSeconds?: number;
            };
            const note = formatModNote(mod.action, mod.durationSeconds);
            setLines((prev) =>
              applyModNoteToLines(prev, {
                platform: mod.platform,
                userId: mod.userId,
                login: mod.login,
                note,
              }),
            );
            return;
          }

          if (data.type === "poll" && data.poll) {
            const poll = data.poll as PollEvent;
            const key = `${poll.platform}:${poll.channelId ?? ""}`;
            setPolls((prev) => ({ ...prev, [key]: poll }));
            return;
          }

          if (data.type === "poll_end" && data.poll) {
            const poll = data.poll as PollEvent;
            const key = `${poll.platform}:${poll.channelId ?? ""}`;
            setPolls((prev) => {
              const next = { ...prev };
              delete next[key];
              return next;
            });
            return;
          }

          if (data.type === "pinned" && data.pinned) {
            const pin = data.pinned as PinnedMessageEvent;
            const key = `${pin.platform}:${pin.channelId ?? ""}`;
            setPinned((prev) => ({ ...prev, [key]: pin }));
            return;
          }

          if (data.type === "pinned_clear") {
            const key = `${data.platform}:${data.channelId ?? ""}`;
            setPinned((prev) => {
              const next = { ...prev };
              delete next[key];
              return next;
            });
            return;
          }

          if (data.type === "stream_alert" && data.alert) {
            const alert = data.alert as StreamAlertEvent;
            const alertChannel = (alert.channelId ?? "")
              .replace(/^#/, "")
              .replace(/^@/, "")
              .toLowerCase();
            const alertKey = `${String(alert.platform ?? "").toLowerCase()}:${alertChannel}`;
            const allowedAlerts = watchedChannelKeysRef.current;
            if (allowedAlerts.size > 0 && alertChannel && !allowedAlerts.has(alertKey)) return;
            if (seenStreamAlertIdsRef.current.has(alert.id)) return;
            seenStreamAlertIdsRef.current.add(alert.id);
            if (seenStreamAlertIdsRef.current.size > 500) {
              seenStreamAlertIdsRef.current = new Set(
                [...seenStreamAlertIdsRef.current].slice(-250),
              );
            }
            setLines((prev) =>
              capLines([...prev, streamAlertToChatLine(alert, nowTime())]),
            );
            return;
          }

          const msg = data.message ?? data;
          if (!msg?.author?.displayName) return;
          const channelId = (msg.channelId ?? "")
            .replace(/^#/, "")
            .replace(/^@/, "")
            .toLowerCase();
          if (!channelId) return;
          const watchKey = `${String(msg.platform ?? "").toLowerCase()}:${channelId}`;
          const allowed = watchedChannelKeysRef.current;
          if (allowed.size > 0 && !allowed.has(watchKey)) return;
          const dedupeKey =
            msg.id ??
            (msg.platformMessageId
              ? `${msg.platform}:${channelId}:${msg.platformMessageId}`
              : null);
          if (dedupeKey) {
            if (seenMessageIdsRef.current.has(dedupeKey)) return;
            seenMessageIdsRef.current.add(dedupeKey);
            if (seenMessageIdsRef.current.size > 2000) {
              seenMessageIdsRef.current = new Set(
                [...seenMessageIdsRef.current].slice(-1000),
              );
            }
          }
          const login =
            msg.author.username ??
            msg.author.displayName.replace(/^@/, "").trim();
          pushChatMessageRef.current({
            id:
              dedupeKey ??
              `${msg.platform}:${channelId}:${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            platform: msg.platform,
            channelId,
            user: msg.author.displayName,
            userId: msg.author.id ?? "unknown",
            login,
            color: msg.author.color,
            badges: msg.badges,
            text: msg.text,
            time: nowTime(),
            ts: Date.now(),
            inlineEmotes: (msg.emotes ?? []).map(
              (e: { id: string; name: string; url: string }) => ({
                id: e.id,
                name: e.name,
                url: e.url,
              }),
            ),
          });
        } catch {
          /* ignore */
        }
      };

      ws.onclose = () => {
        if (!closed) {
          window.setTimeout(() => void connect(), 3000);
        }
      };
    };

    void connect();
    return () => {
      closed = true;
      ws?.close();
    };
  }, []);

  const openProfile = useCallback((target: ProfileTarget) => {
    setProfileTarget(target);
  }, []);

  const showSystemTime = !timestampsHidden(chatAppearance.timestampFormat);
  const renderSystemLine = useCallback(
    (line: SystemLine, index: number) => (
      <SystemMessage
        key={`s-${line.time}-${index}`}
        line={line}
        onOpenSettings={() => openSettings("connections")}
        showTime={showSystemTime}
      />
    ),
    [openSettings, showSystemTime],
  );

  const onFeedMouseEnter = useCallback(() => setFeedPaused(true), []);
  const onFeedMouseLeave = useCallback(() => {
    setFeedPaused(false);
    atBottomRef.current = true;
    scrollFeedToBottom(false);
  }, [scrollFeedToBottom]);

  // Show polls/pinned matching the active tab (All tab uses every watched channel).
  const tabChannelKeys = useMemo(() => {
    const handles = feedFilterHandles;
    if (handles.length === 0) return new Set<string>();
    return new Set(
      handles.map(
        (h) => `${h.platform.toLowerCase()}:${h.handle.replace(/^@/, "").toLowerCase()}`,
      ),
    );
  }, [feedFilterHandles]);

  const matchesTab = useCallback(
    (platform?: string, channelId?: string) => {
      if (tabChannelKeys.size === 0) return false;
      if (!channelId || !platform) return false;
      const key = `${platform.toLowerCase()}:${channelId.replace(/^#/, "").replace(/^@/, "").toLowerCase()}`;
      return tabChannelKeys.has(key);
    },
    [tabChannelKeys],
  );

  const visiblePolls = useMemo(
    () => Object.values(polls).filter((p) => matchesTab(p.platform, p.channelId)),
    [polls, matchesTab],
  );
  const visiblePinned = useMemo(
    () => Object.values(pinned).filter((p) => matchesTab(p.platform, p.channelId)),
    [pinned, matchesTab],
  );

  const dismissPinned = useCallback((key: string) => {
    setPinned((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }, []);

  const messagesForProfile = useCallback((target: ProfileTarget): RecentChatMessage[] => {
    return lines
      .filter(
        (l): l is ChatMessageLine =>
          l.kind === "message" &&
          l.platform === target.platform &&
          (l.userId === target.userId ||
            l.user === target.displayName ||
            l.login.toLowerCase() === target.login.toLowerCase()),
      )
      .map((l) => ({
        time: l.time,
        platform: l.platform,
        user: l.user,
        color: l.color,
        text: l.text,
      }));
  }, [lines]);

  const canSend = connected.twitch || connected.kick || connected.x || connected.youtube;

  const sendTargets = useMemo(
    () =>
      buildSendTargets({
        activeTab: resolvedActiveTab,
        allTabs: resolvedChatTabs,
        connected,
        settingsChannels: settingsChannelRows,
      }),
    [resolvedActiveTab, resolvedChatTabs, connected, settingsChannelRows],
  );

  const tabHandlesForSend = useMemo(() => {
    if (resolvedActiveTab.isAll) {
      const fromTabs = resolvedChatTabs.filter((t) => !t.isAll).flatMap((t) => t.handles);
      return fromTabs.length > 0 ? fromTabs : settingsChannelRows;
    }
    return resolvedActiveTab.handles;
  }, [resolvedActiveTab, resolvedChatTabs, settingsChannelRows]);

  const sendSetup = useMemo(
    () =>
      missingSendSetup({
        tabHandles: tabHandlesForSend,
        connected,
        settingsChannels: settingsChannelRows,
      }),
    [tabHandlesForSend, connected, settingsChannelRows],
  );

  const messageChatterGroups = useMemo(() => collectActiveChatters(lines), [lines]);

  const xIngestEmptyHint = useMemo(() => {
    if (resolvedActiveTab.isAll) return null;
    const hasX = resolvedActiveTab.handles.some((h) => h.platform === "x");
    if (!hasX) return null;
    const hasVisibleMessages = lines.some(
      (l) =>
        l.kind === "message" &&
        messageMatchesChatTab(l, resolvedActiveTab, feedFilterHandles),
    );
    if (hasVisibleMessages) return null;
    return (
      <div className="prochat-x-empty-hint px-4 py-8 text-center text-sm text-zinc-400">
        <p className="mb-2">No X Live messages yet.</p>
        <p>
          Add the streamer&apos;s X channel under{" "}
          <button
            type="button"
            className="underline text-violet-300"
            onClick={() => openSettings("channels")}
          >
            Settings → Channels
          </button>
          . When they go live, the server polls their live chat automatically (usually within ~15s).
        </p>
      </div>
    );
  }, [resolvedActiveTab, lines, feedFilterHandles, openSettings]);

  const sendPlaceholder = useMemo(() => {
    if (!canSend) return "Connect your account to send chat messages";
    if (sendTargets.length === 1) {
      const t = sendTargets[0]!;
      return `Send a message to ${t.platform === "kick" ? "@" : "#"}${t.channel}…`;
    }
    if (sendTargets.length > 1) {
      const platforms = [...new Set(sendTargets.map((t) => t.platform))].join(" + ");
      return `Send to ${platforms} (${sendTargets.length} chats)…`;
    }
    return "Link a channel for sending in Settings → Channels";
  }, [canSend, sendTargets]);

  const handleSend = useCallback(async () => {
    const text = compose.trim();
    if (!text || !workspaceId || sending) return;
    if (sendTargets.length === 0) {
      if (tabHandlesForSend.length > 0) {
        if (sendSetup.needsSendLink.length > 0) {
          setSendError(
            `Link ${sendSetup.needsSendLink.join(" and ")} for sending in Settings → Channels`,
          );
        } else if (sendSetup.needsConnect.length > 0) {
          setSendError(
            `Connect ${sendSetup.needsConnect.join(" and ")} in Settings → Connections`,
          );
        } else {
          setSendError("Link a channel for sending in Settings → Channels");
        }
      } else {
        setSendError("Add a channel tab (+chats) to choose where to send");
      }
      return;
    }
    setSending(true);
    setSendError(null);
    try {
      const res = await apiFetch(`/api/workspaces/${workspaceId}/chat/send`, {
        method: "POST",
        body: JSON.stringify({ text, targets: sendTargets }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        results?: {
          platform: string;
          channel?: string;
          ok: boolean;
          error?: string;
          skipped?: boolean;
        }[];
      };
      if (!res.ok) {
        setSendError(data.error ?? "Failed to send message");
        return;
      }
      setCompose("");
      const skipped = data.results?.filter((r) => r.skipped) ?? [];
      const failed = data.results?.filter((r) => !r.ok && !r.skipped) ?? [];
      if (failed.length > 0) {
        setSendError(
          failed
            .map((r) => {
              const err = r.error ?? "Failed to send";
              if (
                err.startsWith("You're ") ||
                err.startsWith("Kick couldn't") ||
                err.startsWith("Twitch couldn't")
              ) {
                return err;
              }
              const dest = r.channel ? `${r.platform}/${r.channel}` : r.platform;
              return `${dest}: ${err}`;
            })
            .join("; "),
        );
      } else if (skipped.length > 0 && (data.results?.filter((r) => r.ok).length ?? 0) === 0) {
        setSendError(skipped.map((r) => r.error).join(" "));
      }
    } catch {
      setSendError("Failed to send message");
    } finally {
      setSending(false);
    }
  }, [compose, workspaceId, sending, sendTargets, tabHandlesForSend, sendSetup]);

  return (
    <div
      className={`prochat-app ${chatThemeClass(chatTheme)}`.trim()}
      style={{ fontFamily: chatFontFamily(chatAppearance.font) }}
    >
      <header className="prochat-header">
        <div className="flex items-center gap-2 flex-wrap">
          <Link href="/" className="prochat-brand">
            OMnichat
          </Link>
          <span className="prochat-free-badge">
            <IconLightning />
            FREE
          </span>
        </div>
        <div className="flex items-center gap-2 sm:gap-3">
          <ChatNotificationBell userId={userId} />
          <ChatThemeToggle theme={chatTheme} onChange={handleThemeChange} />
          {viewerDisplayMode !== "none" && viewerSnapshot && (
            <ViewerCountBar
              streams={viewerSnapshot.streams}
              totalViewers={viewerSnapshot.totalViewers}
              mode={viewerDisplayMode === "compact" ? "compact" : "icons"}
            />
          )}
        </div>
      </header>

      <ChatChannelTabs
        tabs={resolvedBarTabs}
        allTabs={resolvedChatTabs}
        activeTabId={activeTabId}
        onSelect={handleTabSelectInCombineMode}
        onRemove={removeTab}
        combineMode={combineMode}
        combineSelection={combineSelection}
        onToggleCombineMode={() => setCombineMode(!combineMode)}
        onCombineTabs={combineTabs}
        onSeparateTab={separateTab}
        viewerSnapshot={viewerSnapshot}
        viewersLoading={viewersLoading}
        messageChatterGroups={messageChatterGroups}
        workspaceId={workspaceId}
        onOpenProfile={openProfile}
        onOpenChannelsSettings={() => openSettings("channels")}
      />

      {cachingEmotes && cacheProgress && (
        <div className="prochat-emote-cache-banner" role="status" aria-live="polite">
          <span className="prochat-emote-cache-spinner" aria-hidden />
          <div className="prochat-emote-cache-copy">
            <span className="prochat-emote-cache-title">
              Caching emotes…
              <span className="prochat-emote-cache-fraction"> {cacheProgress.percent}%</span>
              {cacheProgress.total > 0 ? (
                <span className="prochat-emote-cache-fraction">
                  {" "}
                  ({cacheProgress.cached}/{cacheProgress.total} images)
                </span>
              ) : null}
            </span>
            <div className="prochat-emote-cache-track" aria-hidden>
              <div
                className="prochat-emote-cache-fill"
                style={{ width: `${cacheProgress.percent}%` }}
              />
            </div>
          </div>
        </div>
      )}

      <ChatPollOverlay polls={visiblePolls} />
      <PinnedMessageBar
        pinned={visiblePinned}
        emotes={renderEmotes}
        emoteSize={emoteSize}
        onDismiss={dismissPinned}
      />

      <div className="prochat-feed-area">
        <ChatFeed
          lines={lines}
          activeTab={resolvedActiveTab}
          filterHandles={feedFilterHandles}
          emotesRef={emotesRef}
          emoteSize={emoteSize}
          timestampFormat={chatAppearance.timestampFormat}
          feedPaused={feedPaused}
          feedRef={feedRef}
          onFeedScroll={onFeedScroll}
          onFeedMouseEnter={onFeedMouseEnter}
          onFeedMouseLeave={onFeedMouseLeave}
          onOpenProfile={openProfile}
          renderSystemLine={renderSystemLine}
          emptyHint={xIngestEmptyHint}
        />
      </div>

      <footer className="prochat-footer">
        <div className="prochat-footer-row">
          <button
            type="button"
            onClick={() => openSettings("appearance")}
            className="prochat-footer-gear"
            title="Settings"
            aria-label="Settings"
          >
            <IconGear />
          </button>
          <div className="prochat-footer-bar" ref={footerBarRef}>
            {mention.show && (
              <div className="prochat-mention-suggest" role="listbox" aria-label="Mention suggestions">
                {mention.filtered.map((u, i) => (
                  <button
                    key={u.login}
                    type="button"
                    role="option"
                    aria-selected={i === mention.activeIndex}
                    className={`prochat-mention-item${i === mention.activeIndex ? " prochat-mention-item--active" : ""}`}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => mention.insert(u.login)}
                  >
                    <span className="prochat-mention-login">@{u.login}</span>
                    {u.displayName.toLowerCase() !== u.login.toLowerCase() && (
                      <span className="prochat-mention-name">{u.displayName}</span>
                    )}
                  </button>
                ))}
              </div>
            )}
            <button
              type="button"
              onClick={() => openSettings("connections")}
              className="prochat-connect-btn"
              title="Open Settings → Connections"
            >
              <IconLink />
              Connect Accounts
            </button>
            <input
              type="text"
              value={compose}
              onChange={(e) => {
                setCompose(e.target.value);
                if (sendError) setSendError(null);
              }}
              onKeyDown={(e) => {
                if (mention.onKeyDown(e)) return;
                onEmoteKeyDown(e);
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void handleSend();
                }
              }}
              disabled={!canSend || sending || sendTargets.length === 0}
              placeholder={sendPlaceholder}
              className="prochat-compose"
            />
            <EmoteComposePicker
              groups={emoteGroups}
              emotes={pickerEmotes}
              emoteSize={emoteSize}
              compose={compose}
              setCompose={setCompose}
              disabled={!canSend || sending}
              loading={emotesLoading}
              workspaceId={workspaceId}
              searchPlatform={emoteSearchChannel?.platform}
              searchLogin={emoteSearchChannel?.login}
              dockRef={footerBarRef}
              onOpenSettings={() => openSettings("appearance")}
            />
            <button
              type="button"
              disabled={!canSend || !compose.trim() || sending || sendTargets.length === 0}
              onClick={() => void handleSend()}
              className="prochat-send-btn"
            >
              {sending ? "…" : "Chat"}
            </button>
          </div>
        </div>
        {sendError && (
          <p className="text-xs text-red-400 px-2 pt-1 text-left">{sendError}</p>
        )}
      </footer>

      <ChatSettingsPanel
        open={settingsOpen}
        workspaceId={workspaceId}
        initialSection={settingsSection}
        connectionsRefreshKey={connectionsRefreshKey}
        onClose={closeSettings}
        onConnectionsChange={handleConnectionsChange}
      />

      {profileTarget && workspaceId && (
        <UserProfileModal
          workspaceId={workspaceId}
          platform={profileTarget.platform}
          userId={profileTarget.userId}
          displayName={profileTarget.displayName}
          login={profileTarget.login}
          channelLogin={profileTarget.channelLogin}
          userMessages={messagesForProfile(profileTarget)}
          modActions={modActions}
          emotes={renderEmotes}
          emoteSize={emoteSize}
          onModAction={(record) => {
            setModActions((prev) => [...prev, record]);
            setLines((prev) =>
              applyModNoteToLines(prev, {
                platform: record.platform,
                userId: record.userId,
                login: record.login,
                note: formatModNote(record.action, record.durationSeconds),
              }),
            );
          }}
          onClose={() => setProfileTarget(null)}
        />
      )}
    </div>
  );
}

export default function ChatPage() {
  return (
    <Suspense
      fallback={
        <div className="prochat-app flex items-center justify-center text-zinc-500">
          Loading chat…
        </div>
      }
    >
      <ChatApp />
    </Suspense>
  );
}
