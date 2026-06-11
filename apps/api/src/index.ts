import { readEnv } from "./env.js";
import { isYoutubeOAuthConfigured, getYoutubeRedirectUri } from "./auth/youtube-oauth.js";
import { getGoogleRedirectUri } from "./auth/google.js";
import { resolveOAuthRedirectUri } from "./auth/oauth-redirect.js";
import { loadedEnvPath } from "./load-env.js";
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { WebSocketServer } from "ws";
import { pingDb } from "@omnichat/db";
import { ChatMessageSchema } from "@omnichat/chat-types";
import { getDbMode, initStorage } from "./db/storage.js";
import { createAuthRoutes } from "./auth/routes.js";
import { resumeAllIngest } from "./adapters/resume-ingest.js";
import { warmAllWorkspace7tvEmotes } from "./emotes/warm.js";
import { getKickIngestStatus } from "./adapters/kick.js";
import { getRumbleIngestStatus } from "./adapters/rumble.js";
import { getTwitchIngestStatus } from "./adapters/twitch.js";
import { getYoutubeIngestStatus } from "./adapters/youtube.js";
import { getXIngestStatus } from "./adapters/x.js";
import { xScrapeConfigured } from "./adapters/x-session.js";
import { isRumbleServerIngestEnabled } from "./adapters/rumble-session.js";
import { ChatHub } from "./hub.js";
import { ingestWithAutomod } from "./automod/pipeline.js";
import { createChatUserRoutes } from "./routes/chat-users.js";
import { kickRoutes } from "./routes/kick-emotes.js";
import { emoteRoutes } from "./routes/emotes.js";
import { createChatSendRoutes } from "./routes/chat-send.js";
import { createOverlayTestAlertRoutes } from "./routes/overlay-test-alerts.js";
import { extensionRoutes } from "./routes/extension.js";
import { createIngestRoutes } from "./routes/ingest-channels.js";
import { createSsnIngestRoutes } from "./routes/ssn-ingest.js";
import { userAuthRoutes } from "./routes/user-auth.js";
import { billingRoutes } from "./routes/billing.js";
import { getRecentErrors, installProcessDebugHandlers, recordError } from "./debug.js";

await initStorage();
installProcessDebugHandlers();

const port = Number(process.env.PORT ?? 8787);
const hub = new ChatHub();
const app = new Hono();

app.onError((err, c) => {
  recordError(`http:${c.req.method} ${c.req.path}`, err);
  const detail =
    process.env.NODE_ENV !== "production" && err instanceof Error ? err.stack : undefined;
  return c.json(
    {
      error: err instanceof Error ? err.message : "internal error",
      path: c.req.path,
      ...(detail ? { detail } : {}),
    },
    500,
  );
});

const webOrigin = process.env.WEB_APP_URL ?? "http://localhost:3000";
const corsOrigins = new Set([
  webOrigin,
  "http://localhost:3000",
  "http://127.0.0.1:3000",
]);
if (webOrigin.startsWith("https://")) {
  corsOrigins.add(webOrigin.replace("https://", "https://www."));
  corsOrigins.add(webOrigin.replace("https://www.", "https://"));
}
app.use(
  "*",
  cors({
    origin: [...corsOrigins],
    credentials: true,
  }),
);

if (process.env.NODE_ENV !== "production") {
  app.use("*", async (c, next) => {
    const start = Date.now();
    await next();
    const ms = Date.now() - start;
    if (c.res.status >= 400) {
      console.warn(`[api] ${c.req.method} ${c.req.path} → ${c.res.status} (${ms}ms)`);
    }
  });
}

app.route("/", createIngestRoutes(hub));
app.route("/", createSsnIngestRoutes(hub));
app.route("/", userAuthRoutes);
app.route("/", billingRoutes);
app.route("/", createChatUserRoutes(hub));
app.route("/", kickRoutes);
app.route("/", emoteRoutes);
app.route("/", createChatSendRoutes(hub));
app.route("/", createOverlayTestAlertRoutes(hub));
app.route("/", extensionRoutes);
app.route("/", createAuthRoutes(hub));

app.get("/health", async (c) => {
  const mode = getDbMode();
  const database = mode === "local" ? true : await pingDb();
  return c.json({
    ok: true,
    envFile: loadedEnvPath ?? null,
    database,
    storage: mode,
    oauth: {
      twitch: Boolean(readEnv("TWITCH_CLIENT_ID") && resolveOAuthRedirectUri("twitch", "TWITCH_REDIRECT_URI")),
      kick: Boolean(readEnv("KICK_CLIENT_ID") && resolveOAuthRedirectUri("kick", "KICK_REDIRECT_URI")),
      x: Boolean(readEnv("X_CLIENT_ID") && resolveOAuthRedirectUri("x", "X_REDIRECT_URI")),
      google: Boolean(readEnv("GOOGLE_CLIENT_ID") && getGoogleRedirectUri()),
      youtube: isYoutubeOAuthConfigured(),
      youtubeApiKey: Boolean(readEnv("YOUTUBE_API_KEY")),
    },
    oauthRedirects: {
      twitch: resolveOAuthRedirectUri("twitch", "TWITCH_REDIRECT_URI") ?? null,
      kick: resolveOAuthRedirectUri("kick", "KICK_REDIRECT_URI") ?? null,
      x: resolveOAuthRedirectUri("x", "X_REDIRECT_URI") ?? null,
      google: getGoogleRedirectUri() ?? null,
      youtube: getYoutubeRedirectUri() ?? null,
    },
    twitchIngest: getTwitchIngestStatus(),
    kickIngest: getKickIngestStatus(),
    youtubeIngest: getYoutubeIngestStatus(),
    rumbleIngest: getRumbleIngestStatus(),
    xIngest: getXIngestStatus(),
    xServerScrape: xScrapeConfigured(),
    rumbleServerIngest: isRumbleServerIngestEnabled(),
    stripe: Boolean(readEnv("STRIPE_SECRET_KEY") && readEnv("STRIPE_PRICE_ID")),
    recentErrors: getRecentErrors(10),
  });
});

app.post("/api/ingest/:platform", async (c) => {
  const wsId = c.req.header("x-workspace-id") ?? "demo";
  const body = await c.req.json().catch(() => null);
  const parsed = ChatMessageSchema.safeParse(body?.message ?? body);
  if (!parsed.success) return c.json({ error: "invalid message" }, 400);
  const result = await ingestWithAutomod(wsId, parsed.data, hub);
  return c.json({ ok: true, published: result.published, action: result.action });
});

export default app;

// Local dev: Node HTTP server + WebSockets. Vercel runs `app.fetch` only (OAuth/REST).
if (!process.env.VERCEL) {
  const server = serve({ fetch: app.fetch, port });
  const wss = new WebSocketServer({ server: server as import("node:http").Server });
  wss.on("connection", (ws, req) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    const roomId = url.searchParams.get("room") ?? "room:demo:public";
    hub.subscribe(roomId, ws);
    ws.on("close", () => hub.unsubscribe(roomId, ws));
  });

  console.log("API http://localhost:" + port);
  console.log("Web  " + webOrigin);
  void resumeAllIngest(hub).then(() => {
    console.log("[ingest] resumed connected platforms");
    warmAllWorkspace7tvEmotes();
  });
}
