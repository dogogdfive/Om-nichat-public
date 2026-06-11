"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";
import type { EmoteProvider, ResolvedEmote } from "@/lib/emotes/seventv";
import type { ChatTab } from "@/lib/chat-tabs-storage";

export type EmotePickerGroup = {
  label: string;
  provider: EmoteProvider;
  emotes: ResolvedEmote[];
};

async function fetch7tvChannelEmotes(platform: string, handle: string): Promise<ResolvedEmote[]> {
  const login = handle.replace(/^@/, "").toLowerCase();
  if (platform !== "twitch" && platform !== "kick") return [];
  const res = await apiFetch(
    `/api/emotes/channel/${encodeURIComponent(platform)}/${encodeURIComponent(login)}`,
  );
  if (!res.ok) return [];
  const json = (await res.json()) as { emotes?: ResolvedEmote[] };
  return (json.emotes ?? []).map((e) => ({ ...e, provider: "7tv" as const }));
}

async function fetchTwitchNativeEmotes(login: string): Promise<ResolvedEmote[]> {
  const res = await apiFetch(
    `/api/emotes/twitch/channel/${encodeURIComponent(login.replace(/^@/, "").toLowerCase())}`,
  );
  if (!res.ok) return [];
  const json = (await res.json()) as { emotes?: ResolvedEmote[] };
  return (json.emotes ?? []).map((e) => ({ ...e, provider: "twitch" as const }));
}

async function fetchTwitchGlobalEmotes(): Promise<ResolvedEmote[]> {
  const res = await apiFetch("/api/emotes/twitch/global");
  if (!res.ok) return [];
  const json = (await res.json()) as { emotes?: ResolvedEmote[] };
  return (json.emotes ?? []).map((e) => ({ ...e, provider: "twitch" as const }));
}

async function fetchKickNativeEmotes(login: string): Promise<ResolvedEmote[]> {
  const slug = login.replace(/^@/, "").toLowerCase();
  const res = await apiFetch(`/api/kick/emotes/${encodeURIComponent(slug)}/map`);
  if (!res.ok) return [];
  const json = (await res.json()) as { emotes?: ResolvedEmote[] };
  return (json.emotes ?? []).map((e) => ({ ...e, provider: "kick" as const }));
}

function mergeUniqueEmotes(lists: ResolvedEmote[][]): ResolvedEmote[] {
  const seen = new Set<string>();
  const out: ResolvedEmote[] = [];
  for (const list of lists) {
    for (const e of list) {
      const key = e.name.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(e);
    }
  }
  return out;
}

function emoteSlugsForTab(
  tab: ChatTab,
  fallbackChannels: { platform: string; handle: string }[],
): string[] {
  const slugs = new Set<string>();
  const handles = tab.handles.length > 0 ? tab.handles : fallbackChannels;
  for (const h of handles) {
    if (h.platform === "twitch" || h.platform === "kick") {
      slugs.add(h.handle.replace(/^@/, "").toLowerCase());
    }
  }
  const labelSlug = tab.label.replace(/^@/, "").toLowerCase();
  if (labelSlug && !tab.isAll) slugs.add(labelSlug);
  return [...slugs];
}

function handlesForTab(
  activeTab: ChatTab,
  allChannelTabs: ChatTab[],
  fallbackChannels: { platform: string; handle: string }[],
): { label: string; platform: string; handle: string }[] {
  const slugsForTabs = (tabs: ChatTab[]): string[] => {
    const slugs = new Set<string>();
    for (const tab of tabs) {
      for (const s of emoteSlugsForTab(tab, fallbackChannels)) slugs.add(s);
    }
    return [...slugs];
  };

  const slugList = activeTab.isAll
    ? slugsForTabs(allChannelTabs.filter((t) => !t.isAll))
    : emoteSlugsForTab(activeTab, fallbackChannels);

  if (slugList.length === 0) {
    return fallbackChannels
      .filter((ch) => ch.platform === "twitch" || ch.platform === "kick")
      .map((ch) => ({ label: ch.handle, platform: ch.platform, handle: ch.handle }));
  }

  const sources: { label: string; platform: string; handle: string }[] = [];
  const seen = new Set<string>();
  for (const slug of slugList) {
    for (const platform of ["twitch", "kick"] as const) {
      const key = `${platform}:${slug}`;
      if (seen.has(key)) continue;
      seen.add(key);
      sources.push({ label: slug, platform, handle: slug });
    }
  }
  return sources;
}

export async function loadEmoteGroupsForTab(
  activeTab: ChatTab,
  allChannelTabs: ChatTab[],
  fallbackChannels: { platform: string; handle: string }[] = [],
): Promise<{ groups: EmotePickerGroup[]; flatList: ResolvedEmote[] }> {
  const groups: EmotePickerGroup[] = [];
  const flatList: ResolvedEmote[] = [];
  const seenFlat = new Set<string>();

  const addGroup = (label: string, provider: EmoteProvider, emotes: ResolvedEmote[]) => {
    if (emotes.length === 0) return;
    groups.push({ label, provider, emotes });
    for (const e of emotes) {
      const key = e.name.toLowerCase();
      if (seenFlat.has(key)) continue;
      seenFlat.add(key);
      flatList.push(e);
    }
  };

  const sources = handlesForTab(activeTab, allChannelTabs, fallbackChannels);
  const twitchNativeLoads: Promise<ResolvedEmote[]>[] = [];
  const kickNativeLoads: Promise<ResolvedEmote[]>[] = [];
  const sevenTvSlugs = new Set(sources.map((s) => s.handle.toLowerCase()));

  for (const slug of sevenTvSlugs) {
    // One lookup per streamer — API falls back Kick → Twitch for 7TV sets.
    const seventv = await fetch7tvChannelEmotes("kick", slug);
    if (seventv.length > 0) {
      addGroup(slug, "7tv", seventv);
    }
  }

  for (const src of sources) {
    if (src.platform === "twitch") {
      twitchNativeLoads.push(fetchTwitchNativeEmotes(src.handle));
    }
    if (src.platform === "kick") {
      kickNativeLoads.push(fetchKickNativeEmotes(src.handle));
    }
  }

  const globalRes = await apiFetch("/api/emotes/7tv/global");
  if (globalRes.ok) {
    const json = (await globalRes.json()) as { emotes?: ResolvedEmote[] };
    addGroup("Global", "7tv", (json.emotes ?? []).map((e) => ({ ...e, provider: "7tv" as const })));
  }

  const twitchNative = mergeUniqueEmotes([
    ...(await Promise.all(twitchNativeLoads)),
    await fetchTwitchGlobalEmotes(),
  ]);
  addGroup("Twitch", "twitch", twitchNative);

  const kickNative = mergeUniqueEmotes(await Promise.all(kickNativeLoads));
  addGroup("Kick", "kick", kickNative);

  return { groups, flatList };
}

type EmoteGroupCacheEntry = {
  groups: EmotePickerGroup[];
  flatList: ResolvedEmote[];
};

const emoteGroupCache = new Map<string, EmoteGroupCacheEntry>();

function cacheKeyForTab(
  activeTab: ChatTab,
  allTabs: ChatTab[],
  fallbackChannels: { platform: string; handle: string }[],
): string {
  const handles = handlesForTab(activeTab, allTabs, fallbackChannels)
    .map((h) => `${h.platform}:${h.handle}`)
    .join("|");
  return `${activeTab.id}::${handles}`;
}

export function useChannelEmoteGroups(
  activeTab: ChatTab,
  allTabs: ChatTab[],
  seventvEnabled: boolean,
  fallbackChannels: { platform: string; handle: string }[] = [],
  workspaceEmotes: ResolvedEmote[] = [],
) {
  const cacheKey = useMemo(
    () => cacheKeyForTab(activeTab, allTabs, fallbackChannels),
    [activeTab, allTabs, fallbackChannels],
  );
  const cached = emoteGroupCache.get(cacheKey);
  const [groups, setGroups] = useState<EmotePickerGroup[]>(cached?.groups ?? []);
  const [flatList, setFlatList] = useState<ResolvedEmote[]>(cached?.flatList ?? []);
  const [loading, setLoading] = useState(seventvEnabled && !cached);

  const tabsKey = useMemo(() => allTabs.map((t) => `${t.id}:${t.label}`).join("|"), [allTabs]);
  const channelsKey = useMemo(
    () => fallbackChannels.map((c) => `${c.platform}:${c.handle}`).join("|"),
    [fallbackChannels],
  );

  // Keep latest objects in refs so the effect can use them without listing the
  // unstable identities as deps (which caused re-runs that stranded `loading`).
  const argsRef = useRef({ activeTab, allTabs, fallbackChannels });
  argsRef.current = { activeTab, allTabs, fallbackChannels };

  useEffect(() => {
    if (!seventvEnabled) {
      setGroups([]);
      setFlatList([]);
      setLoading(false);
      return;
    }

    const hit = emoteGroupCache.get(cacheKey);
    if (hit) {
      setGroups(hit.groups);
      setFlatList(hit.flatList);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    const { activeTab: at, allTabs: ats, fallbackChannels: fc } = argsRef.current;
    void loadEmoteGroupsForTab(at, ats, fc)
      .then(({ groups: g, flatList: f }) => {
        if (cancelled) return;
        emoteGroupCache.set(cacheKey, { groups: g, flatList: f });
        setGroups(g);
        setFlatList(f);
      })
      .catch(() => {
        if (!cancelled) {
          setGroups([]);
          setFlatList([]);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cacheKey, tabsKey, channelsKey, seventvEnabled]);

  // Prefetch emotes for every channel tab on load so the picker is ready when switching.
  useEffect(() => {
    if (!seventvEnabled) return;
    for (const tab of allTabs) {
      if (tab.isAll) continue;
      const key = cacheKeyForTab(tab, allTabs, fallbackChannels);
      if (emoteGroupCache.has(key)) continue;
      void loadEmoteGroupsForTab(tab, allTabs, fallbackChannels).then(({ groups: g, flatList: f }) => {
        emoteGroupCache.set(key, { groups: g, flatList: f });
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seventvEnabled, tabsKey, channelsKey]);

  const kickEmotes = useMemo(
    () => workspaceEmotes.filter((e) => e.provider === "kick"),
    [workspaceEmotes],
  );

  const mergedGroups = useMemo(() => {
    const hasKickGroup = groups.some((g) => g.provider === "kick");
    if (kickEmotes.length === 0 || hasKickGroup) return groups;
    const seen = new Set(groups.flatMap((g) => g.emotes.map((e) => e.name.toLowerCase())));
    const kickUnique = kickEmotes.filter((e) => !seen.has(e.name.toLowerCase()));
    if (kickUnique.length === 0) return groups;
    return [...groups, { label: "Kick", provider: "kick" as const, emotes: kickUnique }];
  }, [groups, kickEmotes]);

  const mergedFlat = useMemo(() => {
    if (kickEmotes.length === 0) return flatList;
    const seen = new Set(flatList.map((e) => e.name.toLowerCase()));
    const extra = kickEmotes.filter((e) => !seen.has(e.name.toLowerCase()));
    return extra.length === 0 ? flatList : [...flatList, ...extra];
  }, [flatList, kickEmotes]);

  return { groups: mergedGroups, flatList: mergedFlat, loading };
}
