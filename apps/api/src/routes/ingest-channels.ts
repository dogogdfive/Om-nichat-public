import { Hono } from "hono";
import type { Platform } from "@omnichat/chat-types";
import { onPlatformLinked } from "../adapters/index.js";
import { resumeIngestForWorkspace } from "../adapters/resume-ingest.js";
import {
  getAllWatchedChannels,
  getWatchedChannels,
  INGEST_PLATFORMS,
  syncWatchedChannels,
} from "../adapters/watch-channels.js";
import { getKickIngestStatus } from "../adapters/kick.js";
import { getRumbleIngestStatus, validateRumbleApiUrl } from "../adapters/rumble.js";
import {
  normalizeSessionToken,
  validateRumbleSessionToken,
} from "../adapters/rumble-session.js";
import { rumbleConnectionScope } from "../adapters/rumble-tokens.js";
import { getTwitchIngestStatus } from "../adapters/twitch.js";
import { getYoutubeIngestStatus } from "../adapters/youtube.js";
import { discoverStreamerChannels, expandChannelsWithLiveMirrors } from "../channels/discover.js";
import { getConnections, upsertPlatformTokens, getPlatformTokens } from "../db/repos.js";
import type { ChatHub } from "../hub.js";
import { fetchStreamViewerSnapshot } from "../stream/viewers.js";
import { fetchWorkspaceChatters } from "../stream/chatters.js";
import { requireSession } from "./user-auth.js";

function isPlatform(value: string): value is Platform {
  return INGEST_PLATFORMS.includes(value as Platform);
}

function parseChannelPayload(body: Record<string, unknown>): Partial<Record<Platform, string[]>> {
  const incoming: Partial<Record<Platform, string[]>> = {};

  const grouped = body.channels;
  if (grouped && typeof grouped === "object" && !Array.isArray(grouped)) {
    for (const [platform, list] of Object.entries(grouped)) {
      if (!isPlatform(platform) || !Array.isArray(list)) continue;
      incoming[platform] = list.map(String);
    }
  }

  for (const platform of INGEST_PLATFORMS) {
    const legacy = body[platform];
    if (Array.isArray(legacy)) incoming[platform] = legacy.map(String);
  }

  return incoming;
}

export function createIngestRoutes(hub: ChatHub): Hono {
  const routes = new Hono();

  routes.post("/api/workspaces/:id/ingest/channels", async (c) => {
    const session = requireSession(c);
    const workspaceId = c.req.param("id");
    if (session && session.workspaceId !== workspaceId && session.role !== "super_admin") {
      return c.json({ error: "forbidden" }, 403);
    }

    const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
    const incoming = parseChannelPayload(body);
    const skipDiscover = body.skipDiscover === true;
    let synced: ReturnType<typeof syncWatchedChannels>;
    let discovered: Awaited<ReturnType<typeof expandChannelsWithLiveMirrors>>["discovered"] = [];

    if (skipDiscover) {
      const full: Partial<Record<Platform, string[]>> = {};
      for (const platform of INGEST_PLATFORMS) {
        full[platform] = incoming[platform] ?? [];
      }
      synced = syncWatchedChannels(workspaceId, full);
    } else {
      const expanded = await expandChannelsWithLiveMirrors(workspaceId, incoming);
      discovered = expanded.discovered;
      synced = syncWatchedChannels(workspaceId, expanded.channels);
    }

    const conn = await getConnections(workspaceId);
    for (const platform of INGEST_PLATFORMS) {
      const hasChannels = (synced[platform]?.length ?? 0) > 0;
      if (conn[platform].status === "connected" || hasChannels) {
        void onPlatformLinked(workspaceId, platform, hub).catch((e) =>
          console.error(`[ingest] reconnect ${workspaceId} ${platform}`, e),
        );
      }
    }

    return c.json({ ok: true, channels: synced, discovered });
  });

  routes.post("/api/workspaces/:id/channels/discover", async (c) => {
    const session = requireSession(c);
    const workspaceId = c.req.param("id");
    if (session && session.workspaceId !== workspaceId && session.role !== "super_admin") {
      return c.json({ error: "forbidden" }, 403);
    }

    const body = (await c.req.json().catch(() => ({}))) as {
      platform?: string;
      handle?: string;
    };
    const platform = (body.platform ?? "twitch").toLowerCase();
    const handle = (body.handle ?? "").trim();
    if (!handle) return c.json({ error: "handle required" }, 400);
    if (!isPlatform(platform)) return c.json({ error: "invalid platform" }, 400);

    const result = await discoverStreamerChannels(workspaceId, {
      platform: platform as "twitch" | "kick" | "youtube" | "x",
      handle,
    });
    return c.json(result);
  });

  routes.post("/api/workspaces/:id/ingest/ensure", async (c) => {
    const session = requireSession(c);
    const workspaceId = c.req.param("id");
    if (session && session.workspaceId !== workspaceId && session.role !== "super_admin") {
      return c.json({ error: "forbidden" }, 403);
    }

    // Resume ingest in the background — IRC/profile/YouTube calls can take
    // longer than the dev proxy timeout, so don't block the response on them.
    void resumeIngestForWorkspace(workspaceId, hub).catch((e) =>
      console.error(`[ingest] ensure resume ${workspaceId}`, e),
    );
    const conn = await getConnections(workspaceId);
    return c.json({
      ok: true,
      connections: conn,
      twitchIngest: getTwitchIngestStatus(),
      kickIngest: getKickIngestStatus(),
      youtubeIngest: getYoutubeIngestStatus(),
      rumbleIngest: getRumbleIngestStatus(),
      channels: getAllWatchedChannels(workspaceId),
      twitchChannels: getWatchedChannels(workspaceId, "twitch"),
      kickChannels: getWatchedChannels(workspaceId, "kick"),
      youtubeChannels: getWatchedChannels(workspaceId, "youtube"),
    });
  });

  routes.get("/api/workspaces/:id/stream/viewers", async (c) => {
    const session = requireSession(c);
    const workspaceId = c.req.param("id");
    if (session && session.workspaceId !== workspaceId && session.role !== "super_admin") {
      return c.json({ error: "forbidden" }, 403);
    }

    const clientChannels: Partial<Record<string, string[]>> = {};
    for (const platform of ["twitch", "kick", "x", "youtube"] as const) {
      const raw = c.req.query(platform);
      if (raw) clientChannels[platform] = raw.split(",").map((s) => s.trim()).filter(Boolean);
    }

    const snapshot = await fetchStreamViewerSnapshot(workspaceId, clientChannels);
    return c.json(snapshot);
  });

  routes.get("/api/workspaces/:id/stream/chatters", async (c) => {
    const session = requireSession(c);
    const workspaceId = c.req.param("id");
    if (session && session.workspaceId !== workspaceId && session.role !== "super_admin") {
      return c.json({ error: "forbidden" }, 403);
    }

    const channels: { platform: string; login: string }[] = [];
    for (const platform of ["twitch", "kick"] as const) {
      const raw = c.req.query(platform);
      if (!raw) continue;
      for (const login of raw.split(",").map((s) => s.trim()).filter(Boolean)) {
        channels.push({ platform, login });
      }
    }

    const results = await fetchWorkspaceChatters(workspaceId, channels);
    return c.json({ channels: results });
  });

  routes.post("/api/workspaces/:id/connections/rumble", async (c) => {
    const session = requireSession(c);
    const workspaceId = c.req.param("id");
    if (session && session.workspaceId !== workspaceId && session.role !== "super_admin") {
      return c.json({ error: "forbidden" }, 403);
    }

    const body = (await c.req.json().catch(() => ({}))) as { apiUrl?: string };
    const apiUrl = body.apiUrl?.trim();
    if (!apiUrl) return c.json({ error: "apiUrl required" }, 400);

    const validation = await validateRumbleApiUrl(apiUrl);
    if (!validation.ok || !validation.apiUrl) {
      return c.json({ error: validation.error ?? "Invalid Rumble API URL" }, 400);
    }

    const existing = await getPlatformTokens(workspaceId, "rumble");
    const sessionToken =
      existing?.refreshToken ??
      (existing?.scope === "chat-session" ? existing.accessToken : undefined);

    await upsertPlatformTokens(workspaceId, "rumble", {
      accessToken: validation.apiUrl,
      refreshToken: sessionToken,
      platformUsername: validation.username ?? existing?.platformUsername,
      scope: rumbleConnectionScope({ hasSession: Boolean(sessionToken), hasApi: true }),
    });
    await onPlatformLinked(workspaceId, "rumble", hub);

    return c.json({
      ok: true,
      username: validation.username,
      connections: await getConnections(workspaceId),
    });
  });

  routes.post("/api/workspaces/:id/connections/rumble/session", async (c) => {
    const session = requireSession(c);
    const workspaceId = c.req.param("id");
    if (session && session.workspaceId !== workspaceId && session.role !== "super_admin") {
      return c.json({ error: "forbidden" }, 403);
    }

    const body = (await c.req.json().catch(() => ({}))) as {
      sessionToken?: string;
      username?: string;
    };
    const sessionToken = body.sessionToken?.trim();
    if (!sessionToken) return c.json({ error: "sessionToken required" }, 400);

    const validation = await validateRumbleSessionToken(sessionToken);
    if (!validation.ok) {
      return c.json({ error: validation.error ?? "Invalid Rumble session token" }, 400);
    }

    const existing = await getPlatformTokens(workspaceId, "rumble");
    const apiUrl =
      existing?.accessToken?.includes("livestream-api") ? existing.accessToken : undefined;

    await upsertPlatformTokens(workspaceId, "rumble", {
      accessToken: apiUrl ?? normalizeSessionToken(sessionToken),
      refreshToken: apiUrl ? normalizeSessionToken(sessionToken) : undefined,
      platformUsername: validation.username ?? body.username?.trim().toLowerCase() ?? existing?.platformUsername,
      scope: rumbleConnectionScope({ hasSession: true, hasApi: Boolean(apiUrl) }),
    });
    await onPlatformLinked(workspaceId, "rumble", hub);

    return c.json({
      ok: true,
      username: validation.username ?? body.username,
      connections: await getConnections(workspaceId),
    });
  });

  return routes;
}
