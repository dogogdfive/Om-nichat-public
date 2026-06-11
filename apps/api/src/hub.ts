import type {
  ChatMessage,
  HubEvent,
  PinnedMessageEvent,
  PollEvent,
} from "@omnichat/chat-types";
import type { WebSocket } from "ws";
const MAX = 500;
const DEDUPE_MAX = 1000;

export class ChatHub {
  private buffers = new Map<string, ChatMessage[]>();
  private rooms = new Map<string, Set<WebSocket>>();
  private recentKeys = new Map<string, string[]>();
  // Latest poll/pinned state per room, keyed by `${platform}:${channelId}` so
  // multiple platforms can each have an active poll/pin. Replayed on subscribe.
  private polls = new Map<string, Map<string, PollEvent>>();
  private pinned = new Map<string, Map<string, PinnedMessageEvent>>();

  private stateKey(platform: string, channelId?: string): string {
    return `${platform}:${channelId ?? ""}`;
  }

  private isDuplicate(roomId: string, message: ChatMessage): boolean {
    const keys = [
      `${message.platform}:${message.platformMessageId}`,
      message.id,
    ];
    const recent = this.recentKeys.get(roomId) ?? [];
    if (keys.some((key) => recent.includes(key))) return true;
    for (const key of keys) {
      recent.push(key);
    }
    if (recent.length > DEDUPE_MAX) recent.splice(0, recent.length - DEDUPE_MAX);
    this.recentKeys.set(roomId, recent);
    return false;
  }

  publish(roomId: string, event: HubEvent) {
    if (event.type === "message") {
      if (this.isDuplicate(roomId, event.message)) return;
      const buf = this.buffers.get(roomId) ?? [];
      buf.push(event.message);
      if (buf.length > MAX) buf.splice(0, buf.length - MAX);
      this.buffers.set(roomId, buf);
    } else if (event.type === "poll" || event.type === "poll_end") {
      const map = this.polls.get(roomId) ?? new Map<string, PollEvent>();
      const key = this.stateKey(event.poll.platform, event.poll.channelId);
      if (event.type === "poll_end" || event.poll.status !== "active") {
        map.delete(key);
      } else {
        map.set(key, event.poll);
      }
      this.polls.set(roomId, map);
    } else if (event.type === "pinned") {
      const map = this.pinned.get(roomId) ?? new Map<string, PinnedMessageEvent>();
      map.set(this.stateKey(event.pinned.platform, event.pinned.channelId), event.pinned);
      this.pinned.set(roomId, map);
    } else if (event.type === "pinned_clear") {
      this.pinned.get(roomId)?.delete(this.stateKey(event.platform, event.channelId));
    }
    const payload = JSON.stringify(event);
    for (const client of this.rooms.get(roomId) ?? [])
      if (client.readyState === 1) client.send(payload);
  }

  subscribe(roomId: string, ws: WebSocket) {
    if (!this.rooms.has(roomId)) this.rooms.set(roomId, new Set());
    this.rooms.get(roomId)!.add(ws);
    for (const m of this.buffers.get(roomId) ?? [])
      ws.send(JSON.stringify({ type: "message", message: m }));
    for (const poll of this.polls.get(roomId)?.values() ?? [])
      ws.send(JSON.stringify({ type: "poll", poll }));
    for (const pinned of this.pinned.get(roomId)?.values() ?? [])
      ws.send(JSON.stringify({ type: "pinned", pinned }));
  }

  unsubscribe(roomId: string, ws: WebSocket) {
    this.rooms.get(roomId)?.delete(ws);
  }

  ingest(roomId: string, message: ChatMessage) {
    this.publish(roomId, { type: "message", message });
  }
}
