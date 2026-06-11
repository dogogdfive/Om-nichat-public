import { readFile } from "node:fs/promises";
import { Hono } from "hono";
import type { Platform } from "@omnichat/chat-types";
import {
  ensureMirroredEmoteAsset,
  getMirroredEmoteAssetPath,
} from "../emotes/mirror.js";
import {
  fetch7tvEmotesForChannelLogin,
  fetch7tvEmotesForKickLogin,
  fetch7tvEmotesForPlatformUser,
  fetch7tvEmotesForTwitchLogin,
  fetch7tvEmotesForWorkspace,
  fetchGlobal7tvEmotes,
} from "../emotes/seventv.js";
import {
  fetchAllEmotesForWorkspace,
  searchChannelEmotes,
  searchWorkspaceEmotes,
} from "../emotes/workspace.js";
import { getWorkspaceEmoteCacheStatus } from "../emotes/cache-status.js";
import {
  fetchTwitchChannelEmotes,
  fetchTwitchGlobalEmotes,
} from "../adapters/twitch-emotes.js";

export const emoteRoutes = new Hono();

emoteRoutes.get("/api/emotes/img/:id{.+}", async (c) => {
  const raw = c.req.param("id");
  const id = raw.replace(/\.webp$/i, "").replace(/[^a-zA-Z0-9]/g, "");
  if (!id) return c.json({ error: "invalid id" }, 400);

  if (!(await ensureMirroredEmoteAsset(id))) {
    return c.notFound();
  }

  const path = getMirroredEmoteAssetPath(id);
  if (!path) return c.notFound();

  const body = await readFile(path);
  c.header("Content-Type", "image/webp");
  c.header("Cache-Control", "public, max-age=31536000, immutable");
  return c.body(body);
});

function parseClientChannels(c: { req: { query: (k: string) => string | undefined } }) {
  const out: Partial<Record<string, string[]>> = {};
  for (const platform of ["twitch", "kick"] as const) {
    const raw = c.req.query(platform);
    if (!raw) continue;
    const logins = raw
      .split(",")
      .map((s) => s.trim().replace(/^@/, "").toLowerCase())
      .filter(Boolean);
    if (logins.length > 0) out[platform] = logins;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

emoteRoutes.get("/api/emotes/workspace/:workspaceId/status", async (c) => {
  const workspaceId = c.req.param("workspaceId");
  const clientChannels = parseClientChannels(c);
  const status = await getWorkspaceEmoteCacheStatus(workspaceId, {
    kickoff: true,
    clientChannels,
  });
  return c.json(status);
});

emoteRoutes.get("/api/emotes/workspace/:workspaceId", async (c) => {
  const workspaceId = c.req.param("workspaceId");
  const q = c.req.query("q") ?? "";
  const emotes = q
    ? await searchWorkspaceEmotes(workspaceId, q, 300)
    : await fetchAllEmotesForWorkspace(workspaceId);
  return c.json({ emotes, count: emotes.length });
});

/** 7TV emote search — workspace-wide or per-channel mirrored set. */
emoteRoutes.get("/api/emotes/search/:workspaceId", async (c) => {
  const workspaceId = c.req.param("workspaceId");
  const q = c.req.query("q") ?? "";
  const platform = c.req.query("platform")?.toLowerCase();
  const login = c.req.query("login")?.replace(/^@/, "").toLowerCase();

  if (!q.trim()) {
    return c.json({ emotes: [], count: 0 });
  }

  const emotes =
    login && (platform === "twitch" || platform === "kick")
      ? await searchChannelEmotes(platform, login, q, 300)
      : await searchWorkspaceEmotes(workspaceId, q, 300);

  return c.json({ emotes, count: emotes.length, query: q });
});

emoteRoutes.get("/api/emotes/7tv/global", async (c) => {
  const emotes = await fetchGlobal7tvEmotes();
  return c.json({ emotes });
});

emoteRoutes.get("/api/emotes/7tv/workspace/:workspaceId", async (c) => {
  const emotes = await fetch7tvEmotesForWorkspace(c.req.param("workspaceId"));
  return c.json({ emotes });
});

emoteRoutes.get("/api/emotes/7tv/twitch/login/:login", async (c) => {
  const emotes = await fetch7tvEmotesForTwitchLogin(c.req.param("login"));
  return c.json({ emotes, count: emotes.length });
});

emoteRoutes.get("/api/emotes/7tv/kick/login/:login", async (c) => {
  const emotes = await fetch7tvEmotesForKickLogin(c.req.param("login"));
  return c.json({ emotes, count: emotes.length });
});

emoteRoutes.get("/api/emotes/twitch/global", async (c) => {
  const emotes = await fetchTwitchGlobalEmotes();
  return c.json({ emotes, count: emotes.length });
});

emoteRoutes.get("/api/emotes/twitch/channel/:login", async (c) => {
  const login = c.req.param("login").replace(/^@/, "").toLowerCase();
  const emotes = await fetchTwitchChannelEmotes(login);
  return c.json({ emotes, count: emotes.length, login });
});

/** Mirrored channel set (local URLs) — preferred for the emote picker. */
emoteRoutes.get("/api/emotes/channel/:platform/:login", async (c) => {
  const platform = c.req.param("platform").toLowerCase();
  const login = c.req.param("login").replace(/^@/, "").toLowerCase();
  if (platform !== "twitch" && platform !== "kick") {
    return c.json({ error: "invalid platform" }, 400);
  }
  const emotes =
    platform === "twitch"
      ? await fetch7tvEmotesForChannelLogin("twitch", login)
      : await fetch7tvEmotesForChannelLogin("kick", login);
  return c.json({ emotes, count: emotes.length, platform, login });
});

emoteRoutes.get("/api/emotes/7tv/:platform/:userId", async (c) => {
  const platform = c.req.param("platform") as Platform;
  if (!["twitch", "kick"].includes(platform)) {
    return c.json({ error: "invalid platform" }, 400);
  }
  const userId = c.req.param("userId");
  const emotes = await fetch7tvEmotesForPlatformUser(platform, userId);
  return c.json({ emotes });
});
