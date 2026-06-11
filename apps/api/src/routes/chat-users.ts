import { Hono } from "hono";
import { formatModNote, type Platform } from "@omnichat/chat-types";
import { fetchChatUserProfile } from "../chat/user-profile.js";
import { moderateChatUser, canModerateTwitchChannel, type ModerateAction } from "../chat/moderate-user.js";
import type { ChatHub } from "../hub.js";
import { requireSession } from "./user-auth.js";

export function createChatUserRoutes(hub: ChatHub): Hono {
  const chatUserRoutes = new Hono();

chatUserRoutes.get("/api/workspaces/:id/chat-users/profile", async (c) => {
  const session = requireSession(c);
  const workspaceId = c.req.param("id");
  if (session && session.workspaceId !== workspaceId && session.role !== "super_admin") {
    return c.json({ error: "forbidden" }, 403);
  }

  const platform = c.req.query("platform") as Platform;
  const userId = c.req.query("userId") ?? "";
  const login = c.req.query("login") ?? "";
  const displayName = c.req.query("displayName") ?? login ?? "User";

  if (!["twitch", "kick", "x"].includes(platform)) {
    return c.json({ error: "invalid platform" }, 400);
  }
  if (!userId && !login) {
    return c.json({ error: "userId or login required" }, 400);
  }

  try {
    const profile = await fetchChatUserProfile(workspaceId, platform, {
      userId: userId || "unknown",
      login: login || undefined,
      displayName,
    });
    return c.json({ profile });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "profile fetch failed";
    return c.json({ error: msg }, 502);
  }
});

chatUserRoutes.get("/api/workspaces/:id/chat-users/mod-access", async (c) => {
  const session = requireSession(c);
  const workspaceId = c.req.param("id");
  if (session && session.workspaceId !== workspaceId && session.role !== "super_admin") {
    return c.json({ error: "forbidden" }, 403);
  }

  const platform = (c.req.query("platform") ?? "").toLowerCase();
  const channel = c.req.query("channel") ?? "";
  if (platform !== "twitch") {
    return c.json({ canModerate: false, reason: "Moderation is only available on Twitch" });
  }
  if (!channel.trim()) {
    return c.json({ canModerate: false, reason: "channel required" });
  }

  const access = await canModerateTwitchChannel(workspaceId, channel);
  return c.json(access);
});

chatUserRoutes.post("/api/workspaces/:id/chat-users/moderate", async (c) => {
  const session = requireSession(c);
  const workspaceId = c.req.param("id");
  if (session && session.workspaceId !== workspaceId && session.role !== "super_admin") {
    return c.json({ error: "forbidden" }, 403);
  }

  const body = (await c.req.json().catch(() => ({}))) as {
    platform?: Platform;
    userId?: string;
    login?: string;
    channel?: string;
    action?: ModerateAction;
    durationSeconds?: number;
    reason?: string;
  };

  const platform = body.platform;
  const userId = body.userId?.trim();
  const action = body.action;

  if (!platform || !["twitch", "kick", "x"].includes(platform)) {
    return c.json({ error: "invalid platform" }, 400);
  }
  if (!userId) return c.json({ error: "userId required" }, 400);
  if (!action || !["timeout", "ban", "unban"].includes(action)) {
    return c.json({ error: "invalid action" }, 400);
  }
  if (action === "timeout" && (!body.durationSeconds || body.durationSeconds < 1)) {
    return c.json({ error: "durationSeconds required for timeout" }, 400);
  }

  const result = await moderateChatUser(
    workspaceId,
    platform,
    userId,
    action,
    body.durationSeconds,
    body.reason,
    body.channel,
  );

  if (!result.ok) return c.json({ error: result.error ?? "moderation failed" }, 502);

  const modEvent = {
    platform,
    userId,
    login: (body.login ?? userId).replace(/^@/, "").toLowerCase(),
    action,
    durationSeconds: body.durationSeconds,
    timestamp: new Date().toISOString(),
  };
  const room = `room:${workspaceId}`;
  hub.publish(room, { type: "mod", mod: modEvent });
  hub.publish(`${room}:public`, { type: "mod", mod: modEvent });

  return c.json({ ok: true, action, modNote: formatModNote(action, body.durationSeconds) });
});

  return chatUserRoutes;
}
