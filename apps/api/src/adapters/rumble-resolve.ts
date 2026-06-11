import { chromium } from "playwright";
import { recordError } from "../debug.js";
import {
  RUMBLE_BASE,
  normalizeRumbleSlug,
  rumbleFetchHeaders,
  rumbleScrapeHeadless,
} from "./rumble-session.js";

export type RumbleLiveResolve = {
  slug: string;
  streamIdB10: number;
  title?: string;
};

const BASE36 = "0123456789abcdefghijklmnopqrstuvwxyz";

export function base36ToBase10(value: string): number {
  return parseInt(value, 36);
}

export function base10ToBase36(value: number): string {
  if (value <= 0) return "0";
  let n = value;
  let out = "";
  while (n > 0) {
    out = BASE36[n % 36] + out;
    n = Math.floor(n / 36);
  }
  return out;
}

function parseVideoIdFromHtml(html: string): number | null {
  const liveBlock =
    html.match(
      /videostream[^>]*thumbnail__grid--item[^>]*>[\s\S]{0,2000}?data-video-id="(\d+)"/i,
    ) ??
    html.match(/data-video-id="(\d+)"[\s\S]{0,800}?videostream__status[^>]*live/i) ??
    html.match(/class="[^"]*videostream[^"]*live[^"]*"[^>]*data-video-id="(\d+)"/i);

  if (liveBlock?.[1]) return Number(liveBlock[1]);

  const allIds = [...html.matchAll(/data-video-id="(\d+)"/g)].map((m) => Number(m[1]));
  return allIds[0] ?? null;
}

async function fetchPageHtml(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { headers: rumbleFetchHeaders() });
    if (!res.ok) return null;
    return await res.text();
  } catch (err) {
    recordError("rumble:resolve:fetch", err, { url });
    return null;
  }
}

async function confirmLiveViaEmbedJs(streamIdB10: number): Promise<boolean> {
  try {
    const res = await fetch(
      `${RUMBLE_BASE}/embedJS/u3/?request=video&ver=2&v=${streamIdB10}`,
      { headers: rumbleFetchHeaders() },
    );
    if (!res.ok) return true;
    const json = (await res.json()) as { live?: number | boolean; is_live?: boolean };
    if (typeof json.is_live === "boolean") return json.is_live;
    if (typeof json.live === "number") return json.live === 1;
    if (typeof json.live === "boolean") return json.live;
    return true;
  } catch {
    return true;
  }
}

async function resolveViaFetch(slug: string): Promise<RumbleLiveResolve | null> {
  const normalized = normalizeRumbleSlug(slug);
  const urls = [
    `${RUMBLE_BASE}/c/${encodeURIComponent(normalized)}`,
    `${RUMBLE_BASE}/user/${encodeURIComponent(normalized)}`,
  ];

  for (const url of urls) {
    const html = await fetchPageHtml(url);
    if (!html) continue;
    const streamIdB10 = parseVideoIdFromHtml(html);
    if (!streamIdB10) continue;
    const live = await confirmLiveViaEmbedJs(streamIdB10);
    if (!live) continue;
    const titleMatch = html.match(/thumbnail__title[^>]*title="([^"]+)"/i);
    return {
      slug: normalized,
      streamIdB10,
      title: titleMatch?.[1],
    };
  }
  return null;
}

async function resolveViaPlaywright(slug: string): Promise<RumbleLiveResolve | null> {
  const normalized = normalizeRumbleSlug(slug);
  let browser: Awaited<ReturnType<typeof chromium.launch>> | null = null;
  try {
    browser = await chromium.launch({
      headless: rumbleScrapeHeadless(),
      args: ["--disable-blink-features=AutomationControlled", "--no-sandbox", "--disable-dev-shm-usage"],
    });
    const page = await browser.newPage({ userAgent: rumbleFetchHeaders()["User-Agent"] });
    for (const path of [`/c/${normalized}`, `/user/${normalized}`]) {
      await page.goto(`${RUMBLE_BASE}${path}`, { waitUntil: "domcontentloaded", timeout: 45_000 });
      await page.waitForTimeout(2000);
      const html = await page.content();
      const streamIdB10 = parseVideoIdFromHtml(html);
      if (!streamIdB10) continue;
      const live = await confirmLiveViaEmbedJs(streamIdB10);
      if (!live) continue;
      return { slug: normalized, streamIdB10 };
    }
    return null;
  } catch (err) {
    recordError("rumble:resolve:playwright", err, { slug: normalized });
    return null;
  } finally {
    await browser?.close().catch(() => undefined);
  }
}

export async function resolveRumbleLiveStream(slug: string): Promise<RumbleLiveResolve | null> {
  const fromFetch = await resolveViaFetch(slug);
  if (fromFetch) return fromFetch;
  return resolveViaPlaywright(slug);
}

const RUMBLE_CHAT_API = "https://web7.rumble.com/chat/api/chat";

export function rumbleChatSseUrl(streamIdB10: number): string {
  return `${RUMBLE_CHAT_API}/${streamIdB10}/stream`;
}

export function rumbleChatMessageUrl(streamIdB10: number): string {
  return `${RUMBLE_CHAT_API}/${streamIdB10}/message`;
}
