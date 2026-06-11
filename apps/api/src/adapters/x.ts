import { createHash } from "node:crypto";
import type { ChatMessage } from "@omnichat/chat-types";
import type { ChatHub } from "../hub.js";
import { ingestWithAutomod } from "../automod/pipeline.js";
import { debugLog, recordError } from "../debug.js";
import {
  scrapeXLive,
  scrapedMessageToId,
  getXScrapeStatus,
  recoverXScrapeFromStall,
  shouldRecycleContext,
} from "./x-scraper.js";
import { getWatchedChannels } from "./watch-channels.js";
import { xScrapeConfigured, xScrapeStallMs, xScrapeRecycleMs, xScrapePollMs } from "./x-session.js";

const MAX_CONSECUTIVE_FAILURES = 3;

type WorkspaceState = {
  timer?: ReturnType<typeof setInterval>;
  seenByHandle: Map<string, Set<string>>;
  liveHandles: Set<string>;
  lastPollAt?: number;
  lastSuccessAt?: number;
  lastError?: string;
  pollInFlight?: boolean;
  consecutiveFailures: number;
};

const byWorkspace = new Map<string, WorkspaceState>();
let hubRef: ChatHub | null = null;
let globalLastSuccessAt = Date.now();

function normalizeHandle(raw: string): string {
  return raw.replace(/^@/, "").replace(/^#/, "").toLowerCase();
}

function slugAuthor(name: string): string {
  return name.replace(/\W/g, "_").slice(0, 32) || "x_user";
}

function toChatMessage(handle: string, author: string, text: string, key: string): ChatMessage {
  const authorId = slugAuthor(author);
  const id = scrapedMessageToId(key);
  const platformMessageId = createHash("sha1")
    .update(`${handle}:${author}:${text}`)
    .digest("hex")
    .slice(0, 16);
  return {
    id,
    platform: "x",
    platformMessageId,
    channelId: handle,
    author: {
      id: authorId,
      displayName: author,
      username: author.replace(/^@/, ""),
    },
    text,
    emotes: [],
    timestamp: new Date().toISOString(),
  };
}

function stateFor(workspaceId: string): WorkspaceState {
  let s = byWorkspace.get(workspaceId);
  if (!s) {
    s = {
      seenByHandle: new Map(),
      liveHandles: new Set(),
      consecutiveFailures: 0,
    };
    byWorkspace.set(workspaceId, s);
  }
  return s;
}

async function maybeRecoverFromStall(state: WorkspaceState, reason: string): Promise<void> {
  const stallMs = xScrapeStallMs();
  const stale = Date.now() - globalLastSuccessAt > stallMs;
  const tooManyFails = state.consecutiveFailures >= MAX_CONSECUTIVE_FAILURES;
  const recycle = shouldRecycleContext(xScrapeRecycleMs());

  if (recycle) {
    console.log("[x] scheduled browser recycle");
    await recoverXScrapeFromStall("scheduled-recycle");
    return;
  }

  if (stale || tooManyFails) {
    console.warn(`[x] auto-refresh (${reason}) — stale=${stale} failures=${state.consecutiveFailures}`);
    await recoverXScrapeFromStall(reason);
    state.consecutiveFailures = 0;
  }
}

async function pollWorkspace(workspaceId: string): Promise<void> {
  if (!xScrapeConfigured() || !hubRef) return;

  const handles = getWatchedChannels(workspaceId, "x").map(normalizeHandle).filter(Boolean);
  const state = stateFor(workspaceId);
  state.lastPollAt = Date.now();

  // Drop live/seen state for handles no longer watched (keeps /health accurate).
  const watchedSet = new Set(handles);
  for (const h of [...state.liveHandles]) {
    if (!watchedSet.has(h)) state.liveHandles.delete(h);
  }

  if (handles.length === 0) {
    state.liveHandles.clear();
    return;
  }

  await maybeRecoverFromStall(state, "pre-poll");

  let anySuccess = false;

  for (const handle of handles) {
    try {
      const result = await scrapeXLive(handle);
      if (!result.ok) {
        state.liveHandles.delete(handle);
        state.lastError = result.message;
        state.consecutiveFailures += 1;
        if (result.reason === "auth") {
          recordError("x:scrape:auth", result.message, { workspaceId, handle });
        }
        continue;
      }

      if (!result.data.live) {
        state.liveHandles.delete(handle);
        anySuccess = true;
        continue;
      }

      state.liveHandles.add(handle);
      anySuccess = true;
      const scraped = result.data.messages;
      if (scraped.length === 0) {
        console.warn(`[x] @${handle} live but scraped 0 messages (chat empty or DOM changed)`);
      }
      let seen = state.seenByHandle.get(handle);
      if (!seen) {
        seen = new Set();
        state.seenByHandle.set(handle, seen);
      }

      let newCount = 0;
      for (const row of scraped) {
        if (seen.has(row.key)) continue;
        seen.add(row.key);
        newCount += 1;
        if (seen.size > 2000) {
          const keep = [...seen].slice(-1000);
          seen.clear();
          keep.forEach((k) => seen!.add(k));
        }
        const message = toChatMessage(handle, row.author, row.text, row.key);
        await ingestWithAutomod(workspaceId, message, hubRef);
      }
      if (newCount > 0) {
        console.log(`[x] @${handle} ingested ${newCount} new message(s) (visible ${scraped.length})`);
      }
    } catch (e) {
      state.lastError = e instanceof Error ? e.message : String(e);
      state.consecutiveFailures += 1;
      recordError("x:scrape:poll", e, { workspaceId, handle });
    }
  }

  if (anySuccess) {
    state.consecutiveFailures = 0;
    state.lastSuccessAt = Date.now();
    globalLastSuccessAt = Date.now();
    state.lastError = undefined;
  } else if (handles.length > 0) {
    await maybeRecoverFromStall(state, "poll-failed");
  }
}

async function pollWorkspaceGuarded(workspaceId: string): Promise<void> {
  const state = stateFor(workspaceId);
  if (state.pollInFlight) {
    debugLog("x:scrape", "skip overlapping poll", { workspaceId });
    return;
  }
  state.pollInFlight = true;
  try {
    await pollWorkspace(workspaceId);
  } finally {
    state.pollInFlight = false;
  }
}

export async function startXIngest(workspaceId: string, hub: ChatHub): Promise<void> {
  hubRef = hub;
  const state = stateFor(workspaceId);

  if (!xScrapeConfigured()) {
    console.log(
      `[x] workspace ${workspaceId}: server scrape off — set X_SERVER_SCRAPE_ENABLED=1 in .env (log in once via pnpm x:login), or use the Chrome extension`,
    );
    return;
  }

  if (state.timer) return;

  const pollMs = xScrapePollMs();
  console.log(`[x] workspace ${workspaceId}: server-side scrape started (poll ${pollMs}ms, auto-refresh on stall)`);
  void pollWorkspaceGuarded(workspaceId);
  state.timer = setInterval(() => {
    void pollWorkspaceGuarded(workspaceId);
  }, pollMs);
}

export function stopXIngest(workspaceId: string): void {
  const state = byWorkspace.get(workspaceId);
  if (!state?.timer) return;
  clearInterval(state.timer);
  state.timer = undefined;
}

export function getXIngestStatus(): {
  mode: "server-scrape" | "extension-or-ssn";
  scrape: ReturnType<typeof getXScrapeStatus>;
  stallMs: number;
  recycleMs: number;
  workspaces: {
    workspaceId: string;
    handles: string[];
    liveHandles: string[];
    lastPollAt?: number;
    lastSuccessAt?: number;
    lastError?: string;
    consecutiveFailures: number;
  }[];
} {
  const scrape = getXScrapeStatus();
  const workspaces = [...byWorkspace.entries()].map(([workspaceId, s]) => ({
    workspaceId,
    handles: getWatchedChannels(workspaceId, "x"),
    liveHandles: [...s.liveHandles],
    lastPollAt: s.lastPollAt,
    lastSuccessAt: s.lastSuccessAt,
    lastError: s.lastError,
    consecutiveFailures: s.consecutiveFailures,
  }));
  return {
    mode: scrape.configured ? "server-scrape" : "extension-or-ssn",
    scrape,
    stallMs: xScrapeStallMs(),
    recycleMs: xScrapeRecycleMs(),
    workspaces,
  };
}
