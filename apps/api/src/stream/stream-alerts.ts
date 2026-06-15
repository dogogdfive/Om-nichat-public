import { isTestStreamAlert, type StreamAlertEvent } from "@omnichat/chat-types";
import type { ChatHub } from "../hub.js";
import type { ChatUserstate } from "tmi.js";

function normalizeChannel(name: string): string {
  return name.replace(/^@/, "").replace(/^#/, "").toLowerCase();
}

function tagStr(tags: ChatUserstate, key: string): string | undefined {
  const value = tags[key as keyof ChatUserstate];
  if (value == null || value === "") return undefined;
  return String(value);
}

/** Publish a stream alert to every workspace already watching this channel. */
export function publishStreamAlert(
  hub: ChatHub,
  workspaceIds: Iterable<string>,
  alert: StreamAlertEvent,
): void {
  if (isTestStreamAlert(alert)) return;
  for (const workspaceId of workspaceIds) {
    hub.publish(`room:${workspaceId}`, { type: "stream_alert", alert });
    hub.publish(`room:${workspaceId}:public`, { type: "stream_alert", alert });
  }
}

const TWITCH_ALERT_MSG_IDS = new Set([
  "sub",
  "resub",
  "subgift",
  "submysterygift",
]);

export function parseTwitchUserNotice(
  tags: ChatUserstate,
  channelLogin: string,
): StreamAlertEvent | null {
  const msgId = tagStr(tags, "msg-id");
  if (!msgId || !TWITCH_ALERT_MSG_IDS.has(msgId)) return null;

  const displayName = tagStr(tags, "display-name") ?? tagStr(tags, "login") ?? "Someone";
  const systemMsg = tagStr(tags, "system-msg")?.trim() ?? "";
  const noticeId = tagStr(tags, "id") ?? `${msgId}:${Date.now()}`;
  const timestamp = new Date().toISOString();

  if (msgId === "sub") {
    return {
      id: `twitch:sub:${noticeId}`,
      platform: "twitch",
      channelId: channelLogin,
      kind: "sub",
      text: systemMsg || `${displayName} subscribed!`,
      user: displayName,
      timestamp,
    };
  }

  if (msgId === "resub") {
    const months = tagStr(tags, "msg-param-cumulative-months");
    const fallback =
      months && months !== "1"
        ? `${displayName} resubscribed (${months} months)!`
        : `${displayName} resubscribed!`;
    return {
      id: `twitch:resub:${noticeId}`,
      platform: "twitch",
      channelId: channelLogin,
      kind: "resub",
      text: systemMsg || fallback,
      user: displayName,
      amount: months,
      timestamp,
    };
  }

  if (msgId === "subgift") {
    const recipient =
      tagStr(tags, "msg-param-recipient-display-name") ??
      tagStr(tags, "msg-param-recipient-user-name") ??
      "someone";
    return {
      id: `twitch:subgift:${noticeId}`,
      platform: "twitch",
      channelId: channelLogin,
      kind: "sub_gift",
      text: systemMsg || `${displayName} gifted a sub to ${recipient}!`,
      user: displayName,
      timestamp,
    };
  }

  if (msgId === "submysterygift") {
    const count = tagStr(tags, "msg-param-mass-gift-count") ?? "1";
    const n = Number(count);
    return {
      id: `twitch:submysterygift:${noticeId}`,
      platform: "twitch",
      channelId: channelLogin,
      kind: "sub_gift",
      text:
        systemMsg ||
        `${displayName} gifted ${count} Tier 1 Sub${n === 1 ? "" : "s"} to the community!`,
      user: displayName,
      amount: count,
      timestamp,
    };
  }

  return null;
}

export function parseTwitchBitsCheer(
  tags: ChatUserstate,
  message: string,
  channelLogin: string,
): StreamAlertEvent | null {
  const bits = tags.bits ? Number(tags.bits) : 0;
  if (!bits || bits <= 0) return null;

  const displayName = tagStr(tags, "display-name") ?? tagStr(tags, "login") ?? "Someone";
  const msgId = tagStr(tags, "id") ?? `bits:${Date.now()}`;
  const trimmed = message.trim();
  const suffix = trimmed ? `: ${trimmed}` : "";

  return {
    id: `twitch:bits:${msgId}`,
    platform: "twitch",
    channelId: channelLogin,
    kind: "bits",
    text: `${displayName} cheered ${bits} bit${bits === 1 ? "" : "s"}${suffix}`,
    user: displayName,
    amount: String(bits),
    timestamp: new Date().toISOString(),
  };
}

export function parseKickSubscription(slug: string, payload: unknown): StreamAlertEvent | null {
  const raw = payload as { username?: string; user?: { username?: string } };
  const user = raw.username ?? raw.user?.username;
  if (!user) return null;
  return {
    id: `kick:sub:${slug}:${user}:${Date.now()}`,
    platform: "kick",
    channelId: slug,
    kind: "sub",
    text: `${user} subscribed!`,
    user,
    timestamp: new Date().toISOString(),
  };
}

export function parseKickGiftedSubscriptions(
  slug: string,
  payload: unknown,
): StreamAlertEvent | null {
  const raw = payload as {
    gifted_by?: string;
    gifter?: { username?: string };
    recipients?: string[];
  };
  const gifter = raw.gifted_by ?? raw.gifter?.username;
  if (!gifter) return null;
  const count = raw.recipients?.length ?? 0;
  const text =
    count > 0
      ? `${gifter} gifted ${count} subscription${count === 1 ? "" : "s"} to the community!`
      : `${gifter} gifted subscriptions to the community!`;
  return {
    id: `kick:gift:${slug}:${gifter}:${Date.now()}`,
    platform: "kick",
    channelId: slug,
    kind: "sub_gift",
    text,
    user: gifter,
    amount: count > 0 ? String(count) : undefined,
    timestamp: new Date().toISOString(),
  };
}

export function parseKickKicksGifted(slug: string, payload: unknown): StreamAlertEvent | null {
  const raw = payload as {
    sender?: { username?: string };
    gift?: { amount?: number };
    message?: string;
    gift_transaction_id?: string;
  };
  const user = raw.sender?.username;
  if (!user) return null;
  const amount = raw.gift?.amount;
  const msg = raw.message?.trim();
  const amountLabel = amount != null ? `${amount} Kicks` : "Kicks";
  const text = msg
    ? `${user} sent ${amountLabel}: ${msg}`
    : `${user} sent ${amountLabel}!`;
  return {
    id: `kick:kicks:${raw.gift_transaction_id ?? `${user}:${Date.now()}`}`,
    platform: "kick",
    channelId: slug,
    kind: "donation",
    text,
    user,
    amount: amount != null ? String(amount) : undefined,
    timestamp: new Date().toISOString(),
  };
}
