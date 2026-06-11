import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readEnv } from "../env.js";

export type XSessionCookie = {
  name: string;
  value: string;
  domain: string;
  path: string;
};

/** Whether server-side Playwright X scrape is enabled. */
export function isXServerScrapeEnabled(): boolean {
  const flag = readEnv("X_SERVER_SCRAPE_ENABLED");
  return flag === "1" || flag === "true" || flag === "yes";
}

export function hasXSessionCookies(): boolean {
  return getXSessionCookies().length > 0;
}

/**
 * Session cookies for X — export from Chrome DevTools → Application → Cookies → x.com:
 * - auth_token
 * - ct0
 *
 * Or set X_SESSION_COOKIES as JSON array of { name, value, domain?, path? }.
 * Re-read on each browser refresh so updated .env is picked up without full restart.
 */
export function getXSessionCookies(): XSessionCookie[] {
  const rawJson = readEnv("X_SESSION_COOKIES");
  if (rawJson) {
    try {
      const parsed = JSON.parse(rawJson) as XSessionCookie[];
      if (Array.isArray(parsed)) {
        return parsed
          .filter((c) => c?.name && c?.value)
          .map((c) => ({
            name: c.name,
            value: c.value,
            domain: c.domain ?? ".x.com",
            path: c.path ?? "/",
          }));
      }
    } catch {
      /* fall through to auth_token + ct0 */
    }
  }

  const authToken = readEnv("X_AUTH_TOKEN");
  const ct0 = readEnv("X_CT0");
  if (!authToken || !ct0) return [];

  return [
    { name: "auth_token", value: authToken, domain: ".x.com", path: "/" },
    { name: "ct0", value: ct0, domain: ".x.com", path: "/" },
  ];
}

/**
 * Persistent Chromium profile directory for X scrape.
 * Logging in once (scripts/x-login-vps.mjs) stores the session here; X cookie
 * rotation is then saved to disk automatically, so .env cookies become an
 * optional bootstrap instead of the source of truth.
 */
export function getXProfileDir(): string {
  const custom = readEnv("X_PROFILE_DIR");
  if (custom) return custom;
  const root = join(dirname(fileURLToPath(import.meta.url)), "../../../..");
  return join(root, "data", "x-profile");
}

export function xScrapeConfigured(): boolean {
  // Cookies in .env are optional — a logged-in persistent profile is enough.
  return isXServerScrapeEnabled();
}

export type XLoginCredentials = {
  username: string;
  password: string;
  /** Email or phone for the "confirm your identity" challenge step. */
  email?: string;
  /** Base32 TOTP secret for 2FA accounts (authenticator app). */
  totpSecret?: string;
};

/**
 * Credentials for automatic re-login when the persistent X session expires.
 * Set X_LOGIN_USERNAME + X_LOGIN_PASSWORD in .env. Optionally X_LOGIN_EMAIL
 * (for identity-confirmation prompts) and X_LOGIN_TOTP_SECRET (for 2FA).
 */
export function getXLoginCredentials(): XLoginCredentials | null {
  const username = readEnv("X_LOGIN_USERNAME");
  const password = readEnv("X_LOGIN_PASSWORD");
  if (!username || !password) return null;
  return {
    username: username.replace(/^@/, ""),
    password,
    email: readEnv("X_LOGIN_EMAIL"),
    totpSecret: readEnv("X_LOGIN_TOTP_SECRET")?.replace(/\s+/g, ""),
  };
}

export function hasXLoginCredentials(): boolean {
  return getXLoginCredentials() !== null;
}

/** Poll interval per workspace in ms (default 15s, min 5s). */
export function xScrapePollMs(): number {
  const raw = readEnv("X_SCRAPE_POLL_MS");
  const n = raw ? Number(raw) : 15_000;
  return Number.isFinite(n) && n >= 5_000 ? n : 15_000;
}

/** Ms without a successful poll before forcing browser refresh (default 3 min). */
export function xScrapeStallMs(): number {
  const raw = readEnv("X_SCRAPE_STALL_MS");
  const n = raw ? Number(raw) : 180_000;
  return Number.isFinite(n) && n > 30_000 ? n : 180_000;
}

/** Force browser recycle every N ms even if healthy (default 30 min, 0 = off). */
export function xScrapeRecycleMs(): number {
  const raw = readEnv("X_SCRAPE_RECYCLE_MS");
  const n = raw ? Number(raw) : 30 * 60 * 1000;
  return Number.isFinite(n) && n >= 0 ? n : 30 * 60 * 1000;
}

/**
 * Playwright headless mode. Default true (local dev).
 * Set X_SCRAPE_HEADLESS=0 on a VPS with xvfb for a real (headed) browser — lower X bot detection.
 */
export function xScrapeHeadless(): boolean {
  const flag = readEnv("X_SCRAPE_HEADLESS");
  if (flag === "0" || flag === "false" || flag === "no") return false;
  if (flag === "1" || flag === "true" || flag === "yes") return true;
  return true;
}
