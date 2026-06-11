#!/usr/bin/env node
/**
 * One-time helper: opens X in a browser, waits for you to log in,
 * then writes auth_token + ct0 to .env for server-side scrape.
 *
 * Usage (from repo root): pnpm capture:x-session
 */
import { chromium } from "playwright";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const envPath = resolve(root, ".env");

function upsertEnv(lines, key, value) {
  const re = new RegExp(`^${key}=.*`, "m");
  const line = `${key}=${value}`;
  if (re.test(lines)) return lines.replace(re, line);
  return `${lines.trimEnd()}\n${line}\n`;
}

async function main() {
  console.log("\nOpening X — log in if prompted (you have up to 3 minutes)...\n");

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({
    viewport: { width: 1100, height: 800 },
  });
  const page = await context.newPage();
  await page.goto("https://x.com/login", { waitUntil: "domcontentloaded" });

  const deadline = Date.now() + 3 * 60 * 1000;
  let loggedIn = false;
  while (Date.now() < deadline) {
    const url = page.url();
    if (url.includes("/home") || (url.includes("x.com") && !url.includes("/login") && !url.includes("/i/flow"))) {
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
    await page.waitForTimeout(1500);
  }

  if (!loggedIn) {
    console.error("Timed out waiting for login. Try again.");
    await browser.close();
    process.exit(1);
  }

  await page.waitForTimeout(2000);
  const cookies = await context.cookies(["https://x.com", "https://twitter.com"]);
  const auth = cookies.find((c) => c.name === "auth_token");
  const ct0 = cookies.find((c) => c.name === "ct0");

  await browser.close();

  if (!auth?.value || !ct0?.value) {
    console.error("Missing auth_token or ct0 after login. Cookies found:", cookies.map((c) => c.name).join(", "));
    process.exit(1);
  }

  let env = existsSync(envPath) ? readFileSync(envPath, "utf8") : "";
  env = upsertEnv(env, "X_SERVER_SCRAPE_ENABLED", "1");
  env = upsertEnv(env, "X_AUTH_TOKEN", auth.value);
  env = upsertEnv(env, "X_CT0", ct0.value);

  writeFileSync(envPath, env, "utf8");

  console.log("Saved to .env:");
  console.log("  X_SERVER_SCRAPE_ENABLED=1");
  console.log(`  X_AUTH_TOKEN=${auth.value.slice(0, 8)}…`);
  console.log(`  X_CT0=${ct0.value.slice(0, 8)}…`);
  console.log("\nRestart API: pnpm dev:api\n");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
