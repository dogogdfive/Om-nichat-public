import { createHmac } from "node:crypto";
import type { Page } from "playwright";
import { getXLoginCredentials } from "./x-session.js";
import { debugLog, recordError } from "../debug.js";

const STEP_TIMEOUT_MS = 20_000;
const FLOW_DEADLINE_MS = 75_000;

/** Decode a base32 (RFC 4648) TOTP secret into raw bytes. */
function base32Decode(input: string): Buffer {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const clean = input.replace(/=+$/, "").replace(/\s/g, "").toUpperCase();
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const idx = alphabet.indexOf(ch);
    if (idx === -1) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/** Generate a 6-digit TOTP code for the current 30s window. */
function totp(secret: string): string {
  const key = base32Decode(secret);
  const counter = Math.floor(Date.now() / 1000 / 30);
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const hmac = createHmac("sha1", key).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0xf;
  const code =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  return (code % 1_000_000).toString().padStart(6, "0");
}

async function clickButton(page: Page, names: string[]): Promise<boolean> {
  for (const name of names) {
    const btn = page.getByRole("button", { name, exact: false }).first();
    if (await btn.isVisible().catch(() => false)) {
      await btn.click().catch(() => {});
      return true;
    }
  }
  return false;
}

async function isLoggedIn(page: Page): Promise<boolean> {
  const url = page.url();
  if (url.includes("/login") || url.includes("/i/flow")) return false;
  return page
    .locator('[data-testid="primaryColumn"], [data-testid="SideNav_AccountSwitcher_Button"], nav[aria-label="Primary"]')
    .first()
    .isVisible()
    .catch(() => false);
}

/**
 * Automatically log into X using credentials from .env, on the given page
 * (which shares the persistent scrape profile, so the refreshed session is
 * saved to disk). Handles the username → optional identity challenge →
 * password → optional 2FA flow. Returns true once the timeline is visible.
 *
 * NOTE: automated login is far more likely to trip X challenges/captchas than
 * reusing a saved session. Provide X_LOGIN_TOTP_SECRET if the account has 2FA.
 */
export async function autoLoginX(page: Page): Promise<boolean> {
  const creds = getXLoginCredentials();
  if (!creds) return false;

  debugLog("x:scrape", "auto-login: starting");
  try {
    await page.goto("https://x.com/i/flow/login", {
      waitUntil: "domcontentloaded",
      timeout: STEP_TIMEOUT_MS,
    });

    const userInput = page.locator('input[autocomplete="username"]').first();
    await userInput.waitFor({ timeout: STEP_TIMEOUT_MS });
    await userInput.fill(creds.username);
    if (!(await clickButton(page, ["Next"]))) {
      await page.keyboard.press("Enter").catch(() => {});
    }

    const deadline = Date.now() + FLOW_DEADLINE_MS;
    let passwordSubmitted = false;
    let lastAction = "";

    while (Date.now() < deadline) {
      if (await isLoggedIn(page)) {
        debugLog("x:scrape", "auto-login: success");
        return true;
      }

      const passwordField = page
        .locator('input[name="password"], input[autocomplete="current-password"]')
        .first();
      if (await passwordField.isVisible().catch(() => false)) {
        await passwordField.fill(creds.password);
        if (!(await clickButton(page, ["Log in", "Log In"]))) {
          await page.keyboard.press("Enter").catch(() => {});
        }
        passwordSubmitted = true;
        lastAction = "password";
        await page.waitForTimeout(2500);
        continue;
      }

      // The "ocf" text input doubles as: (a) identity-confirmation challenge
      // BEFORE the password (enter email/phone/username), and (b) the 2FA code
      // step AFTER the password. Decide which value to type based on stage.
      const ocfInput = page.locator('[data-testid="ocfEnterTextTextInput"]').first();
      if (await ocfInput.isVisible().catch(() => false)) {
        let value: string;
        if (passwordSubmitted) {
          if (!creds.totpSecret) {
            recordError(
              "x:scrape:autologin",
              "2FA code required but X_LOGIN_TOTP_SECRET not set",
            );
            return false;
          }
          value = totp(creds.totpSecret);
          lastAction = "2fa";
        } else {
          value = creds.email ?? creds.username;
          lastAction = "identity";
        }
        await ocfInput.fill(value);
        if (!(await clickButton(page, ["Next", "Log in", "Verify"]))) {
          await page.keyboard.press("Enter").catch(() => {});
        }
        await page.waitForTimeout(2500);
        continue;
      }

      await page.waitForTimeout(1500);
    }

    recordError("x:scrape:autologin", `auto-login timed out (last step: ${lastAction || "username"})`);
    await page.screenshot({ path: "/tmp/x-autologin-fail.png" }).catch(() => {});
    return false;
  } catch (e) {
    recordError("x:scrape:autologin", e);
    return false;
  }
}
