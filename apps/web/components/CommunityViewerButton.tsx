"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { PlatformEmblem } from "@/components/PlatformLogos";
import {
  type ActiveChatter,
  type ChannelChatterGroup,
} from "@/lib/active-chatters";
import type { ApiChannelChatters } from "@/lib/channel-chatters";
import { normalizeChannelHandle } from "@/lib/parse-channel-input";
import { formatViewers, type StreamViewerEntry } from "@/lib/stream-viewers";
import type { ChatTab } from "@/lib/chat-tabs-storage";
import { useApiChatters } from "@/hooks/useApiChatters";

function IconCommunity() {
  return (
    <svg className="prochat-community-icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5s-3 1.34-3 3 1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z" />
    </svg>
  );
}

function IconChevron({ open }: { open: boolean }) {
  return (
    <svg
      className={`prochat-community-chevron${open ? " prochat-community-chevron--open" : ""}`}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden
    >
      <path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z" />
    </svg>
  );
}

type ProfileTarget = {
  platform: "twitch" | "kick" | "x";
  userId: string;
  displayName: string;
  login: string;
  channelLogin?: string;
};

type StreamerBucket = {
  id: string;
  label: string;
  handles: { platform: string; login: string }[];
  streams: StreamViewerEntry[];
};

function handleKey(platform: string, login: string): string {
  return `${platform.toLowerCase()}:${normalizeChannelHandle(login)}`;
}

function buildStreamerBuckets(
  streams: StreamViewerEntry[],
  tabs: ChatTab[],
  activeTab: ChatTab,
): StreamerBucket[] {
  const tabList = activeTab.isAll ? tabs.filter((t) => !t.isAll) : [activeTab];

  return tabList.map((tab) => {
    const keys = new Set(tab.handles.map((h) => handleKey(h.platform, h.handle)));
    const matched = streams.filter((s) => keys.has(handleKey(s.platform, s.login)));
    const tabStreams = [...matched];

    for (const h of tab.handles) {
      const key = handleKey(h.platform, h.handle);
      if (tabStreams.some((s) => handleKey(s.platform, s.login) === key)) continue;
      tabStreams.push({
        platform: h.platform as StreamViewerEntry["platform"],
        login: normalizeChannelHandle(h.handle),
        isLive: false,
        viewers: null,
      });
    }

    return {
      id: tab.id,
      label: tab.label,
      handles: tab.handles.map((h) => ({
        platform: h.platform,
        login: normalizeChannelHandle(h.handle),
      })),
      streams: tabStreams,
    };
  });
}

function chattersForBucket(
  groups: ChannelChatterGroup[],
  bucket: StreamerBucket,
): ActiveChatter[] {
  const keys = new Set(bucket.handles.map((h) => handleKey(h.platform, h.login)));
  const seen = new Set<string>();
  const out: ActiveChatter[] = [];

  for (const g of groups) {
    if (!keys.has(handleKey(g.platform, g.channel))) continue;
    for (const c of g.chatters) {
      const key = `${c.platform}:${c.login}`.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(c);
    }
  }

  return out.sort((a, b) => a.login.localeCompare(b.login, undefined, { sensitivity: "base" }));
}

function mergeBucketChatters(
  messageChatters: ActiveChatter[],
  apiResults: ApiChannelChatters[],
): { chatters: ActiveChatter[]; source: "api" | "messages" | "mixed"; total?: number } {
  const seen = new Set<string>();
  const fromApi: ActiveChatter[] = [];
  let apiTotal = 0;
  let hasApi = false;

  for (const apiResult of apiResults) {
    if (
      (apiResult?.source !== "api" && apiResult?.source !== "activity") ||
      apiResult.chatters.length === 0
    ) {
      continue;
    }
    hasApi = true;
    if (apiResult.total) apiTotal += apiResult.total;
    for (const c of apiResult.chatters) {
      const key = `${apiResult.platform}:${c.login}`.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      fromApi.push({
        platform: apiResult.platform,
        channel: apiResult.channel,
        login: c.login,
        displayName: c.login,
        userId: c.userId,
        lastSeen: "",
      });
    }
  }

  if (hasApi) {
    for (const c of messageChatters) {
      const key = `${c.platform}:${c.login}`.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      fromApi.push(c);
    }
    fromApi.sort((a, b) => a.login.localeCompare(b.login, undefined, { sensitivity: "base" }));
    return {
      chatters: fromApi,
      source: messageChatters.length > 0 ? "mixed" : "api",
      total: apiTotal > 0 ? apiTotal : undefined,
    };
  }

  return { chatters: messageChatters, source: "messages" };
}

function bucketViewerTotal(streams: StreamViewerEntry[]): number {
  return streams.reduce((sum, s) => sum + (s.viewers ?? 0), 0);
}

function bucketIsLive(streams: StreamViewerEntry[]): boolean {
  return streams.some((s) => s.isLive || (s.viewers != null && s.viewers > 0));
}

function bucketPlatforms(bucket: StreamerBucket): StreamViewerEntry["platform"][] {
  const order: StreamViewerEntry["platform"][] = ["twitch", "kick", "youtube", "x"];
  const seen = new Set<StreamViewerEntry["platform"]>();
  const out: StreamViewerEntry["platform"][] = [];
  for (const p of order) {
    if (bucket.handles.some((h) => h.platform === p) && !seen.has(p)) {
      seen.add(p);
      out.push(p);
    }
  }
  for (const h of bucket.handles) {
    const p = h.platform as StreamViewerEntry["platform"];
    if (!seen.has(p)) {
      seen.add(p);
      out.push(p);
    }
  }
  return out;
}

function bucketMergedChatters(
  bucket: StreamerBucket,
  messageChatterGroups: ChannelChatterGroup[],
  apiChatters: ApiChannelChatters[],
) {
  const apiForBucket = apiChatters.filter((a) =>
    bucket.handles.some((h) => handleKey(h.platform, h.login) === handleKey(a.platform, a.channel)),
  );
  return {
    apiForBucket,
    merged: mergeBucketChatters(chattersForBucket(messageChatterGroups, bucket), apiForBucket),
  };
}

function ChatterChip({
  chatter,
  onOpenProfile,
}: {
  chatter: ActiveChatter;
  onOpenProfile?: (target: ProfileTarget) => void;
}) {
  const platform = chatter.platform as ProfileTarget["platform"];
  const canOpen = platform === "twitch" || platform === "kick" || platform === "x";
  const emblemPlatform =
    platform === "twitch" || platform === "kick" || platform === "x" || platform === "youtube"
      ? platform
      : "twitch";

  return (
    <button
      type="button"
      className="prochat-community-chatter"
      style={chatter.color ? { color: chatter.color } : undefined}
      title={`${chatter.displayName} (${platform})`}
      disabled={!canOpen || !onOpenProfile}
      onClick={() =>
        onOpenProfile?.({
          platform,
          userId: chatter.userId,
          displayName: chatter.displayName,
          login: chatter.login,
          channelLogin: chatter.channel,
        })
      }
    >
      <PlatformEmblem platform={emblemPlatform} size={12} />
      <span className="prochat-community-chatter-name">{chatter.login}</span>
    </button>
  );
}

function StreamerSection({
  bucket,
  messageChatterGroups,
  apiChatters,
  apiLoading,
  defaultOpen,
  onOpenProfile,
  alwaysExpanded,
}: {
  bucket: StreamerBucket;
  messageChatterGroups: ChannelChatterGroup[];
  apiChatters: ApiChannelChatters[];
  apiLoading?: boolean;
  defaultOpen?: boolean;
  onOpenProfile?: (target: ProfileTarget) => void;
  alwaysExpanded?: boolean;
}) {
  const [expanded, setExpanded] = useState(defaultOpen ?? alwaysExpanded ?? false);
  const live = bucketIsLive(bucket.streams);
  const viewers = bucketViewerTotal(bucket.streams);
  const platforms = bucketPlatforms(bucket);

  const { apiForBucket, merged } = useMemo(
    () => bucketMergedChatters(bucket, messageChatterGroups, apiChatters),
    [bucket, messageChatterGroups, apiChatters],
  );

  const countLabel =
    viewers > 0
      ? formatViewers(viewers)
      : live
        ? "Live"
        : "Offline";

  const inChatLabel =
    merged.source === "api" && merged.total != null
      ? `${merged.total.toLocaleString()} in chat`
      : merged.chatters.length > 0
        ? `${merged.chatters.length} in chat`
        : null;

  const showChatters = alwaysExpanded || expanded;
  const hasTwitchLive = bucket.streams.some(
    (s) => s.platform === "twitch" && (s.isLive || s.viewers != null),
  );
  const hasKickLive = bucket.streams.some(
    (s) => s.platform === "kick" && (s.isLive || s.viewers != null),
  );
  const loadingChatters = apiLoading && (hasTwitchLive || hasKickLive);

  return (
    <li className={`prochat-community-section${live ? "" : " prochat-community-section--offline"}`}>
      <button
        type="button"
        className={`prochat-community-row${alwaysExpanded ? "" : " prochat-community-row--expandable"}`}
        aria-expanded={showChatters}
        onClick={() => !alwaysExpanded && setExpanded((v) => !v)}
        disabled={alwaysExpanded}
      >
        {!alwaysExpanded && <IconChevron open={expanded} />}
        {platforms.length > 0 ? (
          <span className="prochat-community-row-icons" aria-hidden>
            {platforms.map((p) => (
              <PlatformEmblem key={p} platform={p} size={16} />
            ))}
          </span>
        ) : (
          <PlatformEmblem platform="twitch" size={18} />
        )}
        <div className="prochat-community-row-main">
          <span className="prochat-community-row-name">{bucket.label}</span>
          {inChatLabel && (
            <span className="prochat-community-row-sub">
              {loadingChatters ? "Loading chatters…" : inChatLabel}
            </span>
          )}
        </div>
        <span className="prochat-community-row-count">{countLabel}</span>
      </button>

      {showChatters && (
        <div className="prochat-community-chatter-list">
          {merged.chatters.length === 0 ? (
            <p className="prochat-community-chatter-empty">
              {loadingChatters
                ? "Loading…"
                : apiForBucket.some((a) => a.error === "not_a_moderator")
                  ? "Recent chatters only — mod access needed for full Twitch list"
                  : live
                    ? "No chatters yet — names appear as people chat"
                    : "Offline — chatters appear when the stream is live"}
            </p>
          ) : (
            merged.chatters.map((chatter) => (
              <ChatterChip
                key={`${chatter.platform}:${chatter.login}`}
                chatter={chatter}
                onOpenProfile={onOpenProfile}
              />
            ))
          )}
        </div>
      )}
    </li>
  );
}

export function CommunityViewerButton({
  streams,
  loading,
  messageChatterGroups = [],
  workspaceId,
  activeTab,
  allTabs = [],
  onOpenProfile,
}: {
  streams: StreamViewerEntry[];
  totalViewers?: number;
  loading?: boolean;
  messageChatterGroups?: ChannelChatterGroup[];
  workspaceId?: string | null;
  activeTab: ChatTab;
  allTabs?: ChatTab[];
  onOpenProfile?: (target: ProfileTarget) => void;
}) {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState("");
  const wrapRef = useRef<HTMLDivElement>(null);

  const buckets = useMemo(
    () => buildStreamerBuckets(streams, allTabs, activeTab),
    [streams, allTabs, activeTab],
  );

  const scopedStreams = useMemo(
    () => buckets.flatMap((b) => b.streams),
    [buckets],
  );

  const scopedViewerTotal = useMemo(() => bucketViewerTotal(scopedStreams), [scopedStreams]);

  const { apiChatters, loadingApiChatters } = useApiChatters(
    workspaceId ?? null,
    scopedStreams,
    open,
  );

  const totalInChat = useMemo(() => {
    let sum = 0;
    for (const bucket of buckets) {
      const apiForBucket = apiChatters.filter((a) =>
        bucket.handles.some(
          (h) => handleKey(h.platform, h.login) === handleKey(a.platform, a.channel),
        ),
      );
      const merged = mergeBucketChatters(chattersForBucket(messageChatterGroups, bucket), apiForBucket);
      if (merged.source === "api" && merged.total != null) {
        sum += merged.total;
      } else {
        sum += merged.chatters.length;
      }
    }
    return sum;
  }, [buckets, messageChatterGroups, apiChatters]);

  const filteredFlat = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return [];
    const out: ActiveChatter[] = [];
    const seen = new Set<string>();
    for (const bucket of buckets) {
      const apiForBucket = apiChatters.filter((a) =>
        bucket.handles.some(
          (h) => handleKey(h.platform, h.login) === handleKey(a.platform, a.channel),
        ),
      );
      const merged = mergeBucketChatters(
        chattersForBucket(messageChatterGroups, bucket),
        apiForBucket,
      );
      for (const c of merged.chatters) {
        const key = `${c.platform}:${c.login}`.toLowerCase();
        if (seen.has(key)) continue;
        if (!c.login.toLowerCase().includes(q) && !c.displayName.toLowerCase().includes(q)) {
          continue;
        }
        seen.add(key);
        out.push(c);
      }
    }
    return out.sort((a, b) => a.login.localeCompare(b.login));
  }, [filter, buckets, messageChatterGroups, apiChatters]);

  useEffect(() => {
    if (!open) {
      setFilter("");
      return;
    }
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    const onClosePopovers = () => setOpen(false);
    document.addEventListener("mousedown", onDoc);
    window.addEventListener("omnichat-close-popovers", onClosePopovers);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      window.removeEventListener("omnichat-close-popovers", onClosePopovers);
    };
  }, [open]);

  const panelTitle = activeTab.isAll ? "Community" : activeTab.label;
  const singleBucket = buckets.length === 1;
  const showSearch = buckets.length > 0;

  const singleBucketData = useMemo(() => {
    if (!singleBucket) return null;
    const bucket = buckets[0]!;
    const { apiForBucket, merged } = bucketMergedChatters(
      bucket,
      messageChatterGroups,
      apiChatters,
    );
    return { bucket, apiForBucket, merged };
  }, [singleBucket, buckets, messageChatterGroups, apiChatters]);

  const singleInChatLabel =
    singleBucketData &&
    (singleBucketData.merged.source === "api" && singleBucketData.merged.total != null
      ? `${singleBucketData.merged.total.toLocaleString()} in chat`
      : singleBucketData.merged.chatters.length > 0
        ? `${singleBucketData.merged.chatters.length} in chat`
        : null);

  return (
    <div className="prochat-community-wrap" ref={wrapRef}>
      <button
        type="button"
        className={`prochat-community-btn${open ? " prochat-community-btn--active" : ""}`}
        aria-label="Community"
        aria-expanded={open}
        title="Viewers and chatters for this tab"
        onClick={() => setOpen((v) => !v)}
      >
        <IconCommunity />
      </button>

      {open && (
        <div className="prochat-community-panel" role="dialog" aria-label="Community viewers">
          <div className="prochat-community-panel-head">
            <span className="prochat-community-panel-title">{panelTitle}</span>
            {(scopedViewerTotal > 0 || singleInChatLabel || loadingApiChatters) && (
              <span className="prochat-community-panel-total">
                {scopedViewerTotal > 0
                  ? `${scopedViewerTotal.toLocaleString()} watching`
                  : singleInChatLabel ?? "Loading…"}
              </span>
            )}
          </div>

          {showSearch && (
            <div className="prochat-community-search-wrap">
              <input
                type="text"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Search chatters…"
                className="prochat-community-search"
                aria-label="Search chatters"
              />
            </div>
          )}

          {loading && buckets.length === 0 ? (
            <p className="prochat-community-empty">Loading viewer counts…</p>
          ) : filter.trim() ? (
            filteredFlat.length === 0 ? (
              <p className="prochat-community-empty">No chatters match &ldquo;{filter}&rdquo;</p>
            ) : (
              <div className="prochat-community-chatter-list prochat-community-chatter-list--flat">
                {filteredFlat.map((chatter) => (
                  <ChatterChip
                    key={`${chatter.platform}:${chatter.channel}:${chatter.login}`}
                    chatter={chatter}
                    onOpenProfile={onOpenProfile}
                  />
                ))}
              </div>
            )
          ) : buckets.length === 0 ? (
            <p className="prochat-community-empty">
              {activeTab.isAll
                ? "Add channels to see viewers and chatters."
                : "No platforms on this tab — add channels in settings."}
            </p>
          ) : singleBucket && singleBucketData ? (
            <div className="prochat-community-body">
              {singleBucketData.merged.chatters.length === 0 ? (
                <p className="prochat-community-chatter-empty">
                  {loadingApiChatters &&
                  singleBucketData.bucket.streams.some(
                    (s) =>
                      (s.platform === "twitch" || s.platform === "kick") &&
                      (s.isLive || s.viewers != null),
                  )
                    ? "Loading chatters…"
                    : singleBucketData.apiForBucket.some((a) => a.error === "not_a_moderator")
                      ? "Recent chatters only — mod access needed for full Twitch list"
                      : bucketIsLive(singleBucketData.bucket.streams)
                        ? "No chatters yet — names appear as people chat"
                        : "Offline — chatters appear when the stream is live"}
                </p>
              ) : (
                <div className="prochat-community-chatter-list prochat-community-chatter-list--flat">
                  {singleBucketData.merged.chatters.map((chatter) => (
                    <ChatterChip
                      key={`${chatter.platform}:${chatter.login}`}
                      chatter={chatter}
                      onOpenProfile={onOpenProfile}
                    />
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="prochat-community-body">
              {!singleBucket && totalInChat > 0 && (
                <p className="prochat-community-meta">
                  {totalInChat.toLocaleString()} in chat across {buckets.length} streamers
                </p>
              )}
              <ul className="prochat-community-list prochat-community-list--sections">
                {buckets.map((bucket, i) => (
                  <StreamerSection
                    key={bucket.id}
                    bucket={bucket}
                    messageChatterGroups={messageChatterGroups}
                    apiChatters={apiChatters}
                    apiLoading={loadingApiChatters}
                    defaultOpen={i === 0 && bucketIsLive(bucket.streams)}
                    onOpenProfile={onOpenProfile}
                  />
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
