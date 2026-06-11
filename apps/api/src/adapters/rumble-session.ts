import { readEnv } from "../env.js";

const CHROME_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

export const RUMBLE_BASE = "https://rumble.com";
export const RUMBLE_CHAT_SSE_BASE = "https://web7.rumble.com/chat/api/chat";
export const RUMBLE_SESSION_COOKIE = "u_s";

/** Server-side Rumble watch ingest (SSE). Default enabled. */
export function isRumbleServerIngestEnabled(): boolean {
  const flag = readEnv("RUMBLE_SERVER_INGEST_ENABLED");
  if (flag === "0" || flag === "false" || flag === "no") return false;
  return true;
}

export function rumbleOfflineRetryMs(): number {
  const raw = readEnv("RUMBLE_OFFLINE_RETRY_MS");
  const n = raw ? Number(raw) : 45_000;
  return Number.isFinite(n) && n > 10_000 ? n : 45_000;
}

/** Playwright headless for Rumble page fallback. Default true. */
export function rumbleScrapeHeadless(): boolean {
  const flag = readEnv("RUMBLE_SCRAPE_HEADLESS");
  if (flag === "0" || flag === "false" || flag === "no") return false;
  return true;
}

export function normalizeRumbleSlug(raw: string): string {
  return raw.replace(/^@/, "").replace(/^\/c\//, "").toLowerCase();
}

export function normalizeSessionToken(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  if (trimmed.includes("u_s=")) {
    const match = trimmed.match(/u_s=([^;]+)/);
    return match?.[1]?.trim() ?? trimmed;
  }
  return trimmed;
}

export function rumbleSessionCookieHeader(sessionToken: string): string {
  return `${RUMBLE_SESSION_COOKIE}=${normalizeSessionToken(sessionToken)}`;
}

export function rumbleFetchHeaders(extra?: Record<string, string>): Record<string, string> {
  return {
    "User-Agent": CHROME_UA,
    Accept: "application/json, text/html, */*",
    ...extra,
  };
}

export async function validateRumbleSessionToken(raw: string): Promise<{
  ok: boolean;
  username?: string;
  error?: string;
}> {
  const token = normalizeSessionToken(raw);
  if (!token) return { ok: false, error: "Session token required" };

  try {
    const res = await fetch(`${RUMBLE_BASE}/login.php`, {
      headers: rumbleFetchHeaders({
        Cookie: rumbleSessionCookieHeader(token),
      }),
      redirect: "manual",
    });
    const location = res.headers.get("location") ?? "";
    if (location.includes("auth.rumble.com")) {
      return { ok: false, error: "Invalid or expired Rumble session token" };
    }

    const accountRes = await fetch(`${RUMBLE_BASE}/account`, {
      headers: rumbleFetchHeaders({
        Cookie: rumbleSessionCookieHeader(token),
      }),
    });
    if (!accountRes.ok) {
      return { ok: true };
    }
    const html = await accountRes.text();
    const userMatch = html.match(/"username"\s*:\s*"([^"]+)"/);
    return { ok: true, username: userMatch?.[1]?.toLowerCase() };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Could not validate Rumble session",
    };
  }
}

export function isLivestreamApiScope(scope?: string): boolean {
  return scope === "livestream-api";
}

export function isChatSessionScope(scope?: string): boolean {
  return scope === "chat-session";
}
