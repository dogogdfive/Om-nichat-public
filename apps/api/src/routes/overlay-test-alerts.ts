import { Hono } from "hono";
import type { Platform, StreamAlertEvent } from "@omnichat/chat-types";
import { INGEST_PLATFORMS, getWatchedChannels } from "../adapters/watch-channels.js";
import type { ChatHub } from "../hub.js";
import { publishStreamAlert } from "../stream/stream-alerts.js";
import { requireSession } from "./user-auth.js";

function pickChannel(workspaceId: string, platform: Platform, fallback: string): string {
  const watched = getWatchedChannels(workspaceId, platform);
  return watched[0] ?? fallback;
}

function buildTestAlerts(twitchChannel: string, kickChannel: string): StreamAlertEvent[] {
  const ts = () => new Date().toISOString();
  return [
    {
      id: `test:twitch:bits:${Date.now()}`,
      platform: "twitch",
      channelId: twitchChannel,
      kind: "bits",
      text: "TestCheerFan cheered 100 bits: great stream keep it up!",
      user: "TestCheerFan",
      amount: "100",
      timestamp: ts(),
    },
    {
      id: `test:kick:kicks:${Date.now() + 1}`,
      platform: "kick",
      channelId: kickChannel,
      kind: "donation",
      text: "TestDonor sent 500 Kicks: W stream!",
      user: "TestDonor",
      amount: "500",
      timestamp: ts(),
    },
  ];
}

async function fireTestAlerts(hub: ChatHub, workspaceId: string, twitchChannel: string, kickChannel: string) {
  const alerts = buildTestAlerts(twitchChannel, kickChannel);
  for (let i = 0; i < alerts.length; i++) {
    publishStreamAlert(hub, [workspaceId], alerts[i]!);
    if (i < alerts.length - 1) {
      await new Promise((r) => setTimeout(r, 900));
    }
  }
  return alerts;
}

export function createOverlayTestAlertRoutes(hub: ChatHub): Hono {
  const routes = new Hono();

  routes.post("/api/workspaces/:id/overlay/test-alerts", async (c) => {
    const session = requireSession(c);
    const workspaceId = c.req.param("id");
    if (!session) return c.json({ error: "unauthorized" }, 401);
    if (session.workspaceId !== workspaceId && session.role !== "super_admin") {
      return c.json({ error: "forbidden" }, 403);
    }

    const body = (await c.req.json().catch(() => ({}))) as {
      twitchChannel?: string;
      kickChannel?: string;
    };
    const fallback = "testchannel";
    const twitchChannel = (body.twitchChannel ?? pickChannel(workspaceId, "twitch", fallback)).replace(
      /^@/,
      "",
    );
    const kickChannel = (body.kickChannel ?? pickChannel(workspaceId, "kick", fallback)).replace(/^@/, "");

    const alerts = await fireTestAlerts(hub, workspaceId, twitchChannel.toLowerCase(), kickChannel.toLowerCase());
    return c.json({
      ok: true,
      count: alerts.length,
      twitchChannel: twitchChannel.toLowerCase(),
      kickChannel: kickChannel.toLowerCase(),
      platforms: INGEST_PLATFORMS,
    });
  });

  /** Localhost-only ops hook (curl on VPS). Not exposed usefully through Caddy. */
  routes.post("/internal/overlay/test-alerts", async (c) => {
    const remote = c.req.header("x-forwarded-for")?.split(",")[0]?.trim();
    if (remote && remote !== "127.0.0.1" && remote !== "::1") {
      return c.json({ error: "forbidden" }, 403);
    }

    const workspaceId = c.req.query("workspaceId");
    if (!workspaceId) return c.json({ error: "workspaceId query required" }, 400);

    const twitchChannel = pickChannel(workspaceId, "twitch", "sergioisbananas");
    const kickChannel = pickChannel(workspaceId, "kick", "sergioisbananas");
    const alerts = await fireTestAlerts(hub, workspaceId, twitchChannel, kickChannel);
    return c.json({ ok: true, count: alerts.length, workspaceId });
  });

  return routes;
}
