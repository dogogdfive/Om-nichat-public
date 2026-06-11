import { createHash } from "node:crypto";
import type { BrowserContext, Page } from "playwright";
import { chromium } from "playwright";
import {
  getXProfileDir,
  getXSessionCookies,
  hasXLoginCredentials,
  xScrapeConfigured,
  xScrapeHeadless,
} from "./x-session.js";
import { autoLoginX } from "./x-login.js";
import { debugLog, recordError } from "../debug.js";

export type ScrapedXMessage = {
  author: string;
  text: string;
  key: string;
};

export type ScrapePageResult<T> =
  | { ok: true; data: T }
  | { ok: false; reason: "auth" | "timeout" | "error"; message: string };

// Persistent context: the Chromium profile lives on disk (getXProfileDir), so a
// logged-in X session survives browser recycles and server restarts, and X's
// own cookie rotation is persisted automatically — like a normal Chrome.
let context: BrowserContext | null = null;
let contextReady = false;
let contextCreatedAt = 0;
let refreshCount = 0;
let lastRefreshAt: number | undefined;
let lastRefreshReason: string | undefined;
let consecutiveErrors = 0;

// Auto re-login state — bounded so a failing login can't hammer X every poll.
let loginInFlight = false;
let lastLoginAttemptAt = 0;
let autoLoginCount = 0;
let lastAutoLoginAt: number | undefined;
let lastAutoLoginOk: boolean | undefined;
const LOGIN_COOLDOWN_MS = 60_000;

const PAGE_TIMEOUT_MS = 25_000;

export const SESSION_EXPIRED_MESSAGE =
  "X session expired — log into X once in the VPS browser (pnpm x:login on the server), or refresh X_AUTH_TOKEN + X_CT0 in .env";

export async function refreshXScrapeBrowser(reason: string): Promise<void> {
  debugLog("x:scrape", "refreshing browser", { reason, refreshCount: refreshCount + 1 });
  contextReady = false;
  if (context) {
    await context.close().catch(() => {});
    context = null;
  }
  refreshCount += 1;
  lastRefreshAt = Date.now();
  lastRefreshReason = reason;
  consecutiveErrors = 0;
}

export async function closeXScrapeBrowser(): Promise<void> {
  await refreshXScrapeBrowser("shutdown");
}

async function ensureContext(): Promise<BrowserContext | null> {
  if (!xScrapeConfigured()) return null;
  if (context && contextReady) return context;

  try {
    if (context) {
      await context.close().catch(() => {});
      context = null;
    }
    context = await chromium.launchPersistentContext(getXProfileDir(), {
      headless: xScrapeHeadless(),
      args: [
        "--disable-blink-features=AutomationControlled",
        "--no-sandbox",
        "--disable-dev-shm-usage",
      ],
      viewport: { width: 1280, height: 900 },
      locale: "en-US",
    });
    // Bootstrap from .env cookies only when the profile has no X session yet.
    const existing = await context.cookies("https://x.com");
    const hasAuth = existing.some((c) => c.name === "auth_token" && c.value);
    const envCookies = getXSessionCookies();
    if (!hasAuth && envCookies.length > 0) {
      await context.addCookies(envCookies);
      debugLog("x:scrape", "bootstrapped profile from .env cookies", {
        cookies: envCookies.length,
      });
    }
    contextReady = true;
    contextCreatedAt = Date.now();
    debugLog("x:scrape", "persistent browser context ready", {
      profileHasSession: hasAuth,
      refreshCount,
    });
    return context;
  } catch (e) {
    recordError("x:scrape:context", e);
    contextReady = false;
    return null;
  }
}

// Returns "in" | "out" | "unknown" — "unknown" while the SPA is still hydrating.
const SESSION_STATE_FN = `
() => {
  const path = location.pathname || "";
  if (path.includes("/login") || path.includes("/i/flow/")) return "out";
  if (document.querySelector('input[autocomplete="username"]')) return "out";
  if (document.querySelector('[data-testid="loginButton"], [data-testid="signupButton"]')) return "out";
  if (document.querySelector('[data-testid="SideNav_AccountSwitcher_Button"]')) return "in";
  if (document.querySelector('[data-testid="AppTabBar_Profile_Link"]')) return "in";
  // The /livechat view is a minimal page without the main nav. Seeing the chat
  // container (or primary timeline column) also proves we are logged in.
  if (document.querySelector('[data-testid="chatContainer"]')) return "in";
  if (document.querySelector('[data-testid="primaryColumn"]')) return "in";
  return "unknown";
}
`;

// EU cookie-consent banner overlays the page on datacenter IPs; refuse it once.
const DISMISS_COOKIE_BANNER_FN = `
() => {
  for (const el of document.querySelectorAll('button, [role="button"]')) {
    const t = (el.textContent || "").trim();
    if (t === "Refuse non-essential cookies") {
      el.click();
      return true;
    }
  }
  return false;
}
`;

const SESSION_WAIT_MS = 12_000;

/**
 * Evaluate one of the function-string constants in the page.
 * Wrapped as an IIFE — passing the bare function string to page.evaluate()
 * does NOT invoke it (it evaluates to the function object → undefined result).
 */
function evalFn<T>(page: Page, fnSource: string): Promise<T> {
  return page.evaluate(`(${fnSource})()`) as Promise<T>;
}

async function waitForSession(page: Page): Promise<boolean> {
  const deadline = Date.now() + SESSION_WAIT_MS;
  let lastState = "unknown";
  let lastEvalError: string | undefined;
  while (Date.now() < deadline) {
    await evalFn(page, DISMISS_COOKIE_BANNER_FN).catch(() => false);
    try {
      lastState = await evalFn<string>(page, SESSION_STATE_FN);
      lastEvalError = undefined;
    } catch (e) {
      lastState = "unknown";
      lastEvalError = e instanceof Error ? e.message : String(e);
    }
    if (lastState === "in") return true;
    if (lastState === "out") break;
    await page.waitForTimeout(1000);
  }
  debugLog("x:scrape", "session check failed", {
    state: lastState,
    url: page.url(),
    evalError: lastEvalError,
  });
  await page.screenshot({ path: "/tmp/x-session-fail.png" }).catch(() => {});
  return false;
}

/**
 * Confirm the page is logged in. If logged out and X_LOGIN_* credentials are
 * configured, attempt an automatic re-login (rate-limited), then reload the
 * target URL. Returns true only when a valid session is present.
 */
async function ensureSessionOnPage(page: Page, targetUrl: string): Promise<boolean> {
  if (await waitForSession(page)) return true;
  if (!hasXLoginCredentials()) return false;

  if (loginInFlight) return false;
  if (Date.now() - lastLoginAttemptAt < LOGIN_COOLDOWN_MS) return false;

  loginInFlight = true;
  lastLoginAttemptAt = Date.now();
  let ok = false;
  try {
    debugLog("x:scrape", "session expired — attempting auto re-login");
    ok = await autoLoginX(page);
  } catch (e) {
    recordError("x:scrape:autologin", e);
    ok = false;
  } finally {
    loginInFlight = false;
    autoLoginCount += 1;
    lastAutoLoginAt = Date.now();
    lastAutoLoginOk = ok;
  }
  if (!ok) return false;

  console.log("[x] auto re-login succeeded — session restored");
  await page
    .goto(targetUrl, { waitUntil: "domcontentloaded", timeout: PAGE_TIMEOUT_MS })
    .catch(() => {});
  return waitForSession(page);
}

async function withPage<T>(
  fn: (page: Page) => Promise<T>,
  opts?: { allowRetry?: boolean },
): Promise<ScrapePageResult<T>> {
  const allowRetry = opts?.allowRetry !== false;

  async function attempt(): Promise<ScrapePageResult<T>> {
    const ctx = await ensureContext();
    if (!ctx) {
      return { ok: false, reason: "error", message: "browser context unavailable" };
    }
    const page = await ctx.newPage();
    page.setDefaultTimeout(PAGE_TIMEOUT_MS);
    try {
      const data = await fn(page);
      consecutiveErrors = 0;
      return { ok: true, data };
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      const reason = /session expired/i.test(message)
        ? "auth"
        : /timeout/i.test(message)
          ? "timeout"
          : "error";
      consecutiveErrors += 1;
      return { ok: false, reason, message };
    } finally {
      await page.close().catch(() => {});
    }
  }

  let result = await attempt();
  // Retry once on a fresh page WITHOUT tearing down the whole browser. Nuking
  // the persistent context on every transient error caused refresh churn,
  // leaked Chromium processes, and multi-minute hung polls. Sustained failures
  // are handled by the stall-based recovery in x.ts (after N consecutive fails).
  if (!result.ok && allowRetry && result.reason !== "auth") {
    result = await attempt();
  }
  return result;
}

const LIVE_CHECK_FN = `
() => {
  if (document.querySelector('[data-testid="liveBadge"]')) return true;
  if (document.querySelector('[aria-label="Live"]')) return true;
  if (document.querySelector('a[href*="/i/broadcasts/"]')) return true;
  for (const el of document.querySelectorAll("span, div")) {
    const t = (el.textContent || "").trim();
    if (t === "Live" || t === "LIVE") return true;
  }
  return false;
}
`;

// X live chat (x.com/HANDLE/livechat) renders messages inside
// [data-testid="chatContainer"]. Each message row contains
// [data-testid="UserAvatar-Container-{username}"] (the real handle) plus a
// sibling block holding the message text. The old tweet/messageEntry selectors
// do NOT exist on this page, so we walk the avatar -> row -> body structure.
const SCRAPE_CHAT_FN = `
() => {
  const root = document.querySelector('[data-testid="chatContainer"]');
  if (!root) return [];

  const out = [];
  const seenLocal = new Set();
  const avatars = root.querySelectorAll('[data-testid^="UserAvatar-Container-"]');

  for (const av of avatars) {
    const username = (av.getAttribute("data-testid") || "")
      .replace("UserAvatar-Container-", "")
      .trim();
    if (!username) continue;

    // Climb to the message row: nearest ancestor with 2+ element children.
    // Row text renders as "DisplayName @handle message text"; strip everything
    // up to and including the author's @handle to isolate the message.
    let row = av;
    for (let i = 0; i < 6 && row.parentElement; i++) {
      row = row.parentElement;
      if (row.childElementCount >= 2) break;
    }

    const full = (row.innerText || "").replace(/\\s+/g, " ").trim();
    const marker = "@" + username;
    const idx = full.toLowerCase().indexOf(marker.toLowerCase());
    let text = idx >= 0 ? full.slice(idx + marker.length).trim() : full;
    // Strip a leading separator/timestamp artifacts if present.
    text = text.replace(/^[·•\\-\\s]+/, "").trim();

    if (!text) continue;

    // Include broadcast handle so the same author+text in two livechats dedupes separately.
    const broadcast = ((location.pathname || "").split("/").filter(Boolean)[0] || "")
      .replace(/^@/, "")
      .toLowerCase();
    const key = "live:" + broadcast + ":" + username + ":" + text;
    if (seenLocal.has(key)) continue;
    seenLocal.add(key);
    out.push({ author: username, text, key });
  }
  return out;
}
`;

export async function checkXProfileLive(handle: string): Promise<ScrapePageResult<boolean>> {
  const normalized = handle.replace(/^@/, "").toLowerCase();
  return withPage(async (page) => {
    const url = `https://x.com/${encodeURIComponent(normalized)}`;
    await page.goto(url, {
      waitUntil: "domcontentloaded",
      timeout: PAGE_TIMEOUT_MS,
    });
    if (!(await ensureSessionOnPage(page, url))) {
      throw new Error(SESSION_EXPIRED_MESSAGE);
    }
    return evalFn<boolean>(page, LIVE_CHECK_FN);
  });
}

export async function scrapeXLiveChat(handle: string): Promise<ScrapePageResult<ScrapedXMessage[]>> {
  const normalized = handle.replace(/^@/, "").toLowerCase();
  return withPage(async (page) => {
    // /chat redirects to /livechat; navigate to /livechat directly.
    const url = `https://x.com/${encodeURIComponent(normalized)}/livechat`;
    await page.goto(url, {
      waitUntil: "domcontentloaded",
      timeout: PAGE_TIMEOUT_MS,
    });
    if (!(await ensureSessionOnPage(page, url))) {
      throw new Error(SESSION_EXPIRED_MESSAGE);
    }
    // Wait for the chat container, then for an actual message row to render
    // (messages stream in a few seconds after hydration). Empty chats fall
    // through after the timeout and correctly return 0 messages.
    await page
      .waitForSelector('[data-testid="chatContainer"]', { timeout: 15_000 })
      .catch(() => {});
    await page
      .waitForSelector('[data-testid="chatContainer"] [data-testid^="UserAvatar-Container-"]', {
        timeout: 9_000,
      })
      .catch(() => {});
    await page.waitForTimeout(2000);
    const result = await evalFn<ScrapedXMessage[]>(page, SCRAPE_CHAT_FN);
    if (result.length === 0) {
      const diag = await page
        .evaluate(`(${SCRAPE_DIAG_FN})()`)
        .catch((e) => ({ err: String(e) }));
      debugLog("x:scrape", "livechat 0 rows diag", { url: page.url(), diag });
    }
    return result;
  });
}

// On /livechat the page itself is the liveness signal: if we are still on the
// /livechat path after hydration and the chat container rendered, the broadcast
// is live. If X redirected us away (e.g. to the profile), the handle is offline.
const LIVECHAT_LIVE_FN = `
() => {
  const path = location.pathname || "";
  if (!path.includes("/livechat")) return false;
  if (document.querySelector('[data-testid="chatContainer"]')) return true;
  if (document.querySelector('[data-testid="liveBadge"]')) return true;
  if (document.querySelector('a[href*="/i/broadcasts/"]')) return true;
  return false;
}
`;

/**
 * Single-navigation live check + chat scrape. We load /livechat exactly once
 * per poll (instead of a separate heavy profile page load), which is both
 * faster and far less likely to trip rate-limiting / challenges on a datacenter
 * IP. Returns liveness plus any scraped messages.
 */
export async function scrapeXLive(
  handle: string,
): Promise<ScrapePageResult<{ live: boolean; messages: ScrapedXMessage[] }>> {
  const normalized = handle.replace(/^@/, "").toLowerCase();
  return withPage(async (page) => {
    const url = `https://x.com/${encodeURIComponent(normalized)}/livechat`;
    await page.goto(url, {
      waitUntil: "domcontentloaded",
      timeout: PAGE_TIMEOUT_MS,
    });
    if (!(await ensureSessionOnPage(page, url))) {
      throw new Error(SESSION_EXPIRED_MESSAGE);
    }
    // Let the SPA settle and the chat container hydrate (or redirect away).
    await page
      .waitForSelector('[data-testid="chatContainer"]', { timeout: 10_000 })
      .catch(() => {});
    const live = await evalFn<boolean>(page, LIVECHAT_LIVE_FN);
    if (!live) return { live: false, messages: [] };

    // Wait for an actual message row to render, then a short buffer.
    await page
      .waitForSelector('[data-testid="chatContainer"] [data-testid^="UserAvatar-Container-"]', {
        timeout: 8_000,
      })
      .catch(() => {});
    await page.waitForTimeout(1500);
    const messages = await evalFn<ScrapedXMessage[]>(page, SCRAPE_CHAT_FN);
    if (messages.length === 0) {
      const diag = await page
        .evaluate(`(${SCRAPE_DIAG_FN})()`)
        .catch((e) => ({ err: String(e) }));
      debugLog("x:scrape", "livechat 0 rows diag", { url: page.url(), diag });
    }
    return { live, messages };
  });
}

const SCRAPE_DIAG_FN = `
() => {
  const root = document.querySelector('[data-testid="chatContainer"]');
  const avatars = root ? root.querySelectorAll('[data-testid^="UserAvatar-Container-"]').length : 0;
  return {
    hasContainer: Boolean(root),
    avatarCount: avatars,
    bodyHead: (document.body && document.body.innerText || "").slice(0, 120).replace(/\\s+/g, " "),
  };
}
`;

export function scrapedMessageToId(key: string): string {
  const hash = createHash("sha1").update(key).digest("hex").slice(0, 12);
  return `x:scrape:${hash}`;
}

export function getXScrapeStatus(): {
  enabled: boolean;
  configured: boolean;
  headless: boolean;
  browserOpen: boolean;
  refreshCount: number;
  lastRefreshAt?: number;
  lastRefreshReason?: string;
  consecutiveErrors: number;
  contextAgeMs?: number;
  autoLogin: {
    credentialsSet: boolean;
    attempts: number;
    lastAttemptAt?: number;
    lastResult?: "ok" | "failed";
  };
} {
  return {
    enabled: xScrapeConfigured(),
    configured: xScrapeConfigured(),
    headless: xScrapeHeadless(),
    browserOpen: Boolean(context),
    refreshCount,
    lastRefreshAt,
    lastRefreshReason,
    consecutiveErrors,
    contextAgeMs: contextCreatedAt ? Date.now() - contextCreatedAt : undefined,
    autoLogin: {
      credentialsSet: hasXLoginCredentials(),
      attempts: autoLoginCount,
      lastAttemptAt: lastAutoLoginAt,
      lastResult:
        lastAutoLoginOk === undefined ? undefined : lastAutoLoginOk ? "ok" : "failed",
    },
  };
}

/** Called by poll loop when stalled — full browser recycle; the persistent profile keeps the session */
export async function recoverXScrapeFromStall(reason: string): Promise<void> {
  await refreshXScrapeBrowser(reason);
  await ensureContext();
}

export function shouldRecycleContext(recycleMs: number): boolean {
  if (recycleMs <= 0 || !contextCreatedAt) return false;
  return Date.now() - contextCreatedAt >= recycleMs;
}
