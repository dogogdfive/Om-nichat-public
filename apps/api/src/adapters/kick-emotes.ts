import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { ChatMessage } from "@omnichat/chat-types";

const execFileAsync = promisify(execFile);
const CHROME_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

const EMOTE_TOKEN = /\[emote:(\d+):([^\]]+)\]/g;

type KickEmoteRow = { id: number; name: string };

type EmoteCache = { at: number; byName: Map<string, KickEmoteRow> };

const cacheBySlug = new Map<string, EmoteCache>();
const CACHE_MS = 10 * 60 * 1000;

export function kickEmoteUrl(id: string | number): string {
  return `https://files.kick.com/emotes/${id}/fullsize`;
}

export function parseKickEmoteContent(raw: string): {
  text: string;
  emotes: ChatMessage["emotes"];
} {
  const emotes: ChatMessage["emotes"] = [];
  let text = "";
  let lastIndex = 0;

  for (const match of raw.matchAll(EMOTE_TOKEN)) {
    const full = match[0];
    const id = match[1]!;
    const name = match[2]!;
    const index = match.index ?? 0;

    text += raw.slice(lastIndex, index);
    const start = text.length;
    text += name;
    const end = text.length;
    emotes.push({
      id,
      name,
      url: kickEmoteUrl(id),
      start,
      end,
    });
    lastIndex = index + full.length;
  }

  text += raw.slice(lastIndex);
  return { text: text.trim(), emotes };
}

async function curlJson(url: string): Promise<unknown> {
  const { stdout } = await execFileAsync(
    "curl.exe",
    ["-s", "-H", "Accept: application/json", "-H", `User-Agent: ${CHROME_UA}`, url],
    { maxBuffer: 8 * 1024 * 1024 },
  );
  return JSON.parse(stdout);
}

export async function fetchKickEmoteJson(slug: string): Promise<unknown> {
  const url = `https://kick.com/emotes/${encodeURIComponent(slug)}`;
  try {
    const res = await fetch(url, {
      headers: { Accept: "application/json", "User-Agent": CHROME_UA },
    });
    if (res.ok) return res.json();
  } catch {
    /* fall through */
  }
  return curlJson(url);
}

function collectEmoteGroups(json: unknown): KickEmoteRow[] {
  const rows: KickEmoteRow[] = [];
  if (!Array.isArray(json)) return rows;
  for (const group of json) {
    const emotes = (group as { emotes?: { id?: number; name?: string }[] }).emotes ?? [];
    for (const e of emotes) {
      if (e.id && e.name) rows.push({ id: e.id, name: e.name });
    }
  }
  return rows;
}

export async function getKickEmotesByName(slug: string): Promise<Map<string, KickEmoteRow>> {
  const normalized = slug.replace(/^@/, "").toLowerCase();
  const cached = cacheBySlug.get(normalized);
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.byName;

  const byName = new Map<string, KickEmoteRow>();
  const slugs = normalized === "global" ? ["global"] : [normalized, "global"];

  for (const s of slugs) {
    try {
      const json = await fetchKickEmoteJson(s);
      for (const row of collectEmoteGroups(json)) {
        if (!byName.has(row.name)) byName.set(row.name, row);
      }
    } catch {
      /* ignore */
    }
  }

  cacheBySlug.set(normalized, { at: Date.now(), byName });
  return byName;
}

export async function expandKickEmoteNames(slug: string, content: string): Promise<string> {
  if (/\[emote:\d+:/.test(content)) return content;

  const byName = await getKickEmotesByName(slug);
  if (byName.size === 0) return content;

  return content
    .split(/(\s+)/)
    .map((part) => {
      if (/^\s+$/.test(part)) return part;
      const emote = byName.get(part);
      if (emote) return `[emote:${emote.id}:${emote.name}]`;
      return part;
    })
    .join("");
}
