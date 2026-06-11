const fs = require("fs");
const path = require("path");
const root = __dirname;
function w(rel, content) {
  const p = path.join(root, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content);
}
w("packages/chat-types/src/index.ts", [
  'import { z } from "zod";',
  'export const PlatformSchema = z.enum(["twitch", "kick", "x"]);',
  'export type Platform = z.infer<typeof PlatformSchema>;',
  'export const ChatMessageSchema = z.object({',
  '  id: z.string(), platform: PlatformSchema, platformMessageId: z.string(), channelId: z.string(),',
  '  author: z.object({ id: z.string(), displayName: z.string(), avatarUrl: z.string().url().optional(), color: z.string().optional() }),',
  '  text: z.string(), emotes: z.array(z.object({ id: z.string(), name: z.string(), url: z.string(), start: z.number(), end: z.number() })).default([]),',
  '  timestamp: z.string(),',
  '});',
  'export type ChatMessage = z.infer<typeof ChatMessageSchema>;',
  'export type HubEvent = { type: "message"; message: ChatMessage };',
].join("\n"));
console.log("chat-types src ok");
