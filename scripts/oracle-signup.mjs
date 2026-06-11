#!/usr/bin/env node
/**
 * Opens Oracle Cloud signup in a visible browser, fills email/password from env,
 * then pauses so you can complete card, CAPTCHA, and email verification.
 *
 * Usage (PowerShell):
 *   $env:ORACLE_EMAIL="you@example.com"
 *   $env:ORACLE_PASSWORD="your-password"
 *   node scripts/oracle-signup.mjs
 */
import { chromium } from "../apps/api/node_modules/playwright/index.mjs";

const email = process.env.ORACLE_EMAIL?.trim();
const password = process.env.ORACLE_PASSWORD;

if (!email || !password) {
  console.error("Set ORACLE_EMAIL and ORACLE_PASSWORD environment variables.");
  process.exit(1);
}

console.log("Launching browser for Oracle signup...");
console.log("Email:", email);
console.log("After autofill, complete: country, name, card, email code, CAPTCHA if any.");
console.log("Browser stays open — close it when done or press Resume in Playwright inspector if shown.\n");

const browser = await chromium.launch({
  headless: false,
  slowMo: 100,
  args: ["--start-maximized"],
});

const context = await browser.newContext({ viewport: null });
const page = await context.newPage();

await page.goto("https://www.oracle.com/cloud/free/", { waitUntil: "domcontentloaded", timeout: 60000 });

// Try common "Sign up" / "Start for free" paths
const tryClick = async (patterns) => {
  for (const p of patterns) {
    const loc = page.getByRole("link", { name: p }).or(page.getByRole("button", { name: p }));
    if (await loc.first().isVisible({ timeout: 2000 }).catch(() => false)) {
      await loc.first().click();
      await page.waitForTimeout(2000);
      return true;
    }
  }
  return false;
};

await tryClick([/sign up/i, /start for free/i, /try free/i, /get started/i]);

// Direct signup URL fallback
if (!page.url().includes("signup")) {
  await page.goto("https://signup.cloud.oracle.com/", { waitUntil: "domcontentloaded", timeout: 60000 }).catch(() => {});
}

await page.waitForTimeout(3000);

// Fill email fields (multiple possible selectors)
const emailSelectors = [
  'input[type="email"]',
  'input[name="email"]',
  'input[id*="email" i]',
  'input[autocomplete="email"]',
];
for (const sel of emailSelectors) {
  const el = page.locator(sel).first();
  if (await el.isVisible({ timeout: 1500 }).catch(() => false)) {
    await el.fill(email);
    break;
  }
}

// Password fields
const passSelectors = ['input[type="password"]', 'input[name="password"]'];
const passFields = page.locator('input[type="password"]');
const count = await passFields.count();
if (count >= 1) {
  await passFields.nth(0).fill(password);
}
if (count >= 2) {
  await passFields.nth(1).fill(password);
}

console.log("\n=== PAUSED ===");
console.log("Complete the rest in the browser (name, address, card, verify email).");
console.log("When your account is ready, create the VM — use SSH key from oracle-vps-handoff.ps1");
console.log("Press Ctrl+C in this terminal when finished.\n");

// Keep browser open until user closes or Ctrl+C
await new Promise(() => {});
