import { Hono } from "hono";
import type { ChatChannelEntry, ChatTabsSyncState } from "@omnichat/chat-types";
import type { ChatHub } from "../hub.js";
import { requireSession } from "./user-auth.js";

export function createChatTabsRoutes(hub: ChatHub): Hono {
  const routes = new Hono();

  routes.post("/api/workspaces/:id/chat/tabs/sync", async (c) => {
    const session = requireSession(c);
    const workspaceId = c.req.param("id");
    if (!session) return c.json({ error: "unauthorized" }, 401);
    if (session.workspaceId !== workspaceId && session.role !== "super_admin") {
      return c.json({ error: "forbidden" }, 403);
    }

    const body = (await c.req.json().catch(() => ({}))) as {
      state?: ChatTabsSyncState;
      channels?: ChatChannelEntry[];
      overlayAction?: "open_channels_settings";
    };

    const room = `room:${workspaceId}`;

    if (body.overlayAction === "open_channels_settings") {
      hub.publish(room, { type: "overlay_action", action: "open_channels_settings" });
      hub.publish(`${room}:public`, { type: "overlay_action", action: "open_channels_settings" });
      return c.json({ ok: true });
    }

    if (!body.state?.tabs?.length) {
      return c.json({ error: "state required" }, 400);
    }

    const event = {
      type: "chat_tabs" as const,
      state: body.state,
      channels: body.channels,
    };
    hub.publish(room, event);
    hub.publish(`${room}:public`, event);
    return c.json({ ok: true, syncId: body.state.syncId });
  });

  return routes;
}
