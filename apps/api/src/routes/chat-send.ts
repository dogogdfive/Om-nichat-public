import { Hono } from "hono";
import type { Platform } from "@omnichat/chat-types";
import { PLATFORMS } from "@omnichat/chat-types";
import { sendChatToPlatforms } from "../chat/send-message.js";
import type { ChatHub } from "../hub.js";
import { requireSession } from "./user-auth.js";

export function createChatSendRoutes(hub: ChatHub): Hono {
  const routes = new Hono();

  routes.post("/api/workspaces/:id/chat/send", async (c) => {
    const session = requireSession(c);
    const workspaceId = c.req.param("id");
    if (!session) return c.json({ error: "unauthorized" }, 401);
    if (session.workspaceId !== workspaceId && session.role !== "super_admin") {
      return c.json({ error: "forbidden" }, 403);
    }

    const body = (await c.req.json().catch(() => ({}))) as {
      text?: string;
      platforms?: Platform[];
      targets?: { platform: Platform; channel: string }[];
    };
    const text = typeof body.text === "string" ? body.text.trim() : "";
    if (!text) return c.json({ error: "text required" }, 400);
    if (text.length > 500) return c.json({ error: "message too long (max 500)" }, 400);

    const platforms = Array.isArray(body.platforms)
      ? body.platforms.filter((p): p is Platform => PLATFORMS.includes(p as Platform))
      : undefined;

    const targets = Array.isArray(body.targets)
      ? body.targets
          .filter(
            (t): t is { platform: Platform; channel: string } =>
              typeof t?.channel === "string" &&
              typeof t?.platform === "string" &&
              PLATFORMS.includes(t.platform as Platform),
          )
          .map((t) => ({ platform: t.platform, channel: t.channel.trim() }))
          .filter((t) => t.channel.length > 0)
      : undefined;

    const { results } = await sendChatToPlatforms(workspaceId, text, hub, { platforms, targets });
    const sent = results.filter((r) => r.ok);
    const failed = results.filter((r) => !r.ok && !r.skipped);

    if (sent.length === 0 && failed.length > 0) {
      return c.json(
        {
          ok: false,
          error: failed.map((r) => {
            const dest = r.channel ? `${r.platform}/${r.channel}` : r.platform;
            return `${dest}: ${r.error}`;
          }).join("; "),
          results,
        },
        502,
      );
    }

    return c.json({ ok: true, results });
  });

  return routes;
}
