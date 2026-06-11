import { createHash } from "node:crypto";
import type { ChatMessage } from "@omnichat/chat-types";

export type SsnPayload = {
  chatname?: string;
  chatmessage?: string;
  type?: string;
  id?: string | number;
  userid?: string;
  sourceName?: string;
  textonly?: boolean;
  chatimg?: string;
  event?: string | boolean;
  bot?: boolean;
};

const X_TYPES = new Set(["x", "twitter", "twitterlive", "twitterspaces"]);

function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

function slugAuthor(name: string): string {
  return name.replace(/\W/g, "_").slice(0, 32) || "x_user";
}

export function isSsnXMessage(raw: SsnPayload): boolean {
  const type = (raw.type ?? "").toLowerCase();
  if (!type) return true;
  if (X_TYPES.has(type) || type.includes("twitter")) return true;
  if (["twitch", "kick", "youtube", "rumble", "facebook", "instagram", "tiktok"].includes(type)) {
    return false;
  }
  return type.includes("x");
}

export function normalizeSsnPayload(body: unknown): SsnPayload[] {
  if (!body || typeof body !== "object") return [];
  const record = body as Record<string, unknown>;

  if (record.action === "content" && record.value && typeof record.value === "object") {
    return [record.value as SsnPayload];
  }
  if (record.action === "extContent" && typeof record.value === "string") {
    try {
      const parsed = JSON.parse(record.value) as SsnPayload;
      return [parsed];
    } catch {
      return [];
    }
  }
  if (Array.isArray(body)) {
    return body.filter((item): item is SsnPayload => !!item && typeof item === "object");
  }
  if ("chatmessage" in record || "chatname" in record) {
    return [record as SsnPayload];
  }
  if (record.message && typeof record.message === "object") {
    return [record.message as SsnPayload];
  }
  return [];
}

export function ssnPayloadToChatMessage(raw: SsnPayload, channelHint?: string): ChatMessage | null {
  if (!isSsnXMessage(raw)) return null;
  if (raw.bot) return null;
  if (typeof raw.event === "string" && raw.event.length > 0) return null;

  const displayName = (raw.chatname ?? "x_user").trim();
  const text = stripHtml(raw.chatmessage ?? "");
  if (!text || text.length < 1) return null;

  const authorId = (raw.userid ?? slugAuthor(displayName)).slice(0, 64);
  const channel =
    channelHint ??
    (raw.sourceName ?? raw.type ?? "x").replace(/^@/, "").toLowerCase();
  const hash = createHash("sha1")
    .update(`${authorId}:${text}:${raw.id ?? ""}`)
    .digest("hex")
    .slice(0, 12);

  return {
    id: `x:ssn:${hash}`,
    platform: "x",
    platformMessageId: String(raw.id ?? hash),
    channelId: channel,
    author: {
      id: authorId,
      displayName,
      username: displayName.replace(/^@/, ""),
      ...(raw.chatimg?.startsWith("http") ? { avatarUrl: raw.chatimg } : {}),
    },
    text,
    emotes: [],
    timestamp: new Date().toISOString(),
  };
}
