#!/usr/bin/env node
/**
 * One-time X login into the persistent scrape profile.
 *
 * Opens a headed Chromium using the SAME profile directory the API scraper
 * uses (data/x-profile, or X_PROFILE_DIR). Log in once; the session is saved
 * to disk and self-refreshes afterwards — no cookie copying needed.
 *
 * On the VPS, stop the API first so the profile isn't locked:
 *   sudo systemctl stop omnichat-api
 *   DISPLAY=:99 pnpm x:login        (with x11vnc/noVNC to see the window)
 *   sudo systemctl start omnichat-api
 *
 * Usage (from repo root): pnpm x:login
 */
import { chromium } from "playwright";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const profileDir = process.env.X_PROFILE_DIR?.trim() || resolve(root, "data", "x-profile");

const LOGIN_TIMEOUT_MS = Number(process.env.X_LOGIN_TIMEOUT_MS) || 5 * 60 * 1000;

async function main() {
  console.log(`\nProfile: ${profileDir}`);
  console.log("Opening X — log in in the browser window (you have 5 minutes)...\n");

  const context = await chromium.launchPersistentContext(profileDir, {
    headless: false,
    args: [
      "--disable-blink-features=AutomationControlled",
      "--no-sandbox",
      "--disable-dev-shm-usage",
    ],
    viewport: { width: 1280, height: 900 },
    locale: "en-US",
  });

  const page = context.pages()[0] ?? (await context.newPage());
  await page.goto("https://x.com/home", { waitUntil: "domcontentloaded" });

  // If the profile is already logged in, x.com/home shows the timeline directly.
  const deadline = Date.now() + LOGIN_TIMEOUT_MS;
  let loggedIn = false;
  while (Date.now() < deadline) {
    const url = page.url();
    const onAuthFlow = url.includes("/login") || url.includes("/i/flow");
    if (!onAuthFlow) {
      const hasTimeline = await page
        .locator('[data-testid="primaryColumn"], nav[aria-label="Primary"]')
        .first()
        .isVisible()
        .catch(() => false);
      if (hasTimeline) {
        loggedIn = true;
        break;
      }
    }
    await page.waitForTimeout(2000);
  }

  if (!loggedIn) {
    console.error("Timed out waiting for login. Run again and finish logging in within 5 minutes.");
    await context.close();
    process.exit(1);
  }

  // Give X a moment to finish writing session cookies, then persist the profile.
  await page.waitForTimeout(3000);
  const cookies = await context.cookies("https://x.com");
  const hasAuth = cookies.some((c) => c.name === "auth_token" && c.value);
  await context.close();

  if (!hasAuth) {
    console.error("Logged in, but no auth_token cookie found — try running again.");
    process.exit(1);
  }

  console.log("Logged in. Session saved to the persistent profile.");
  console.log("Restart the API (sudo systemctl start omnichat-api) and X scrape will use it.\n");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
