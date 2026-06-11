import { readEnv } from "../env.js";
import { Hono, type Context } from "hono";
import { onPlatformLinked } from "../adapters/index.js";
import { fetchPlatformProfile } from "./platform-profiles.js";
import {
  createOAuthUserWithWorkspace,
  findOwnerByPlatformUser,
  findUserById,
  getConnections,
  isProfileSetupComplete,
  getWorkspaceForUser,
  listAllWorkspaces,
  listAutomodAudit,
  upsertPlatformTokens,
} from "../db/repos.js";
import { signSession, sessionCookieHeader } from "./session.js";
import type { ChatHub } from "../hub.js";
import { scanWalletAddresses } from "@omnichat/automod";
import { getOmnibotConfig, patchOmnibotConfig, setOmnibotLocks } from "../settings/omnibot.js";
import { requireSession } from "../routes/user-auth.js";
import { consumePending, peekPending, savePending } from "./oauth-pending.js";
import {
  looksLikeXApiKeyNotClientId,
  oauthErrorPage,
  oauthRedirectDeniedPage,
  TWITCH_OAUTH_HINTS,
  X_OAUTH_HINTS,
  xClientIdErrorPage,
} from "./oauth-error-page.js";
import { resolveOAuthRedirectUri } from "./oauth-redirect.js";
import { getGoogleRedirectUri, handleGoogleCallback, startGoogleOAuth } from "./google.js";
import {
  getYoutubeRedirectUri,
  isYoutubeOAuthConfigured,
  YOUTUBE_OAUTH_HINTS,
} from "./youtube-oauth.js";
import { pkceChallenge, randomString } from "./pkce.js";
import { parseSessionFromRequest } from "./session.js";

// Twitch Helix send requires user:write:chat; IRC uses chat:edit (see dev.twitch.tv/docs/authentication/scopes).
const TWITCH_SCOPES = [
  "chat:read",
  "chat:edit",
  "user:write:chat",
  "user:read:email",
  "moderator:manage:banned_users",
  "moderator:manage:chat_messages",
  "moderator:read:chat_messages",
  "moderator:read:chatters",
  "channel:read:polls",
].join(" ");

// Kick scopes: https://docs.kick.com/getting-started/scopes (space-separated).
const KICK_SCOPES = [
  "user:read",
  "channel:read",
  "chat:write",
  "events:subscribe",
  "moderation:ban",
  "moderation:chat_message:manage",
].join(" ");

// users.read alone returns 403 on GET /2/users/me — X also requires tweet.read for that endpoint.
const X_SCOPES = ["users.read", "tweet.read", "offline.access"].join(" ");

const YOUTUBE_SCOPES = [
  "https://www.googleapis.com/auth/youtube.readonly",
  "https://www.googleapis.com/auth/youtube.force-ssl",
].join(" ");

function webAppUrl(path: string): string {
  const base = process.env.WEB_APP_URL ?? "http://localhost:3000";
  return `${base.replace(/\/$/, "")}${path}`;
}

function safeReturnTo(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  try {
    const path = decodeURIComponent(raw);
    if (!path.startsWith("/") || path.startsWith("//") || path.includes("://")) return undefined;
    if (path.startsWith("/chat") || path.startsWith("/dashboard")) return path;
  } catch {
    /* ignore */
  }
  return undefined;
}

function isSuperAdmin(c: { req: { header: (k: string) => string | undefined } }): boolean {
  const session = parseSessionFromRequest({
    cookie: c.req.header("cookie"),
    authorization: c.req.header("authorization"),
  });
  if (session?.role === "super_admin") return true;
  const emails = (process.env.SUPER_ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim())
    .filter(Boolean);
  if (emails.length === 0) return c.req.header("x-super-admin") === "1";
  const email = c.req.header("x-admin-email") ?? session?.email ?? "";
  return emails.includes(email.toLowerCase());
}

async function exchangeToken(
  url: string,
  body: Record<string, string>,
  headers?: Record<string, string>,
): Promise<Record<string, unknown>> {
  const httpRes = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", ...headers },
    body: new URLSearchParams(body),
  });
  const json = (await httpRes.json().catch(() => ({}))) as Record<string, unknown>;
  if (!httpRes.ok) {
    const detail =
      json.error_description ??
      json.message ??
      json.error ??
      (typeof json.data === "object" && json.data !== null
        ? (json.data as { message?: string }).message
        : undefined) ??
      httpRes.statusText;
    throw new Error(String(detail));
  }
  return json;
}

export function createAuthRoutes(hub: ChatHub): Hono {
  const authRoutes = new Hono();

  authRoutes.get("/connect", (c) => c.redirect(webAppUrl("/dashboard")));
  authRoutes.get("/dashboard", (c) => c.redirect(webAppUrl("/dashboard")));

  function resolveWorkspace(c: Context): { workspaceId: string; userId: string } | null {
    const session = requireSession(c);
    if (!session) return null;
    return { workspaceId: session.workspaceId, userId: session.userId };
  }

  const oauthConfigs = {
    twitch: {
      url: "https://id.twitch.tv/oauth2/authorize",
      clientId: () => readEnv("TWITCH_CLIENT_ID"),
      redirectUri: () => resolveOAuthRedirectUri("twitch", "TWITCH_REDIRECT_URI"),
      scope: TWITCH_SCOPES,
    },
    kick: {
      url: "https://id.kick.com/oauth/authorize",
      clientId: () => readEnv("KICK_CLIENT_ID"),
      redirectUri: () => resolveOAuthRedirectUri("kick", "KICK_REDIRECT_URI"),
      scope: KICK_SCOPES,
    },
    x: {
      url: "https://x.com/i/oauth2/authorize",
      clientId: () => readEnv("X_CLIENT_ID"),
      redirectUri: () => resolveOAuthRedirectUri("x", "X_REDIRECT_URI"),
      scope: X_SCOPES,
    },
  } as const;

  function buildAuthorizeUrl(
    platform: "twitch" | "kick" | "x",
    pending: {
      state: string;
      verifier: string;
      mode: "login" | "link";
      workspaceId?: string;
      userId?: string;
      returnTo?: string;
    },
  ): string | null {
    const cfg = oauthConfigs[platform];
    const clientId = cfg.clientId();
    const redirectUri = cfg.redirectUri();
    if (!clientId || !redirectUri) return null;
    savePending(pending.state, {
      platform,
      mode: pending.mode,
      workspaceId: pending.workspaceId,
      userId: pending.userId,
      codeVerifier: pending.verifier,
      createdAt: Date.now(),
      returnTo: safeReturnTo(pending.returnTo),
    });
    const q = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: cfg.scope,
      state: pending.state,
      code_challenge: pkceChallenge(pending.verifier),
      code_challenge_method: "S256",
    });
    return `${cfg.url}?${q}`;
  }

  function buildYoutubeAuthorizeUrl(pending: {
    state: string;
    verifier: string;
    mode: "login" | "link";
    workspaceId?: string;
    userId?: string;
    returnTo?: string;
  }): string | null {
    const clientId = readEnv("GOOGLE_CLIENT_ID");
    // Reuse the already-registered Google callback so no extra redirect URI
    // needs adding in Google Cloud Console. The youtube pending state routes
    // the shared /auth/google/callback to the YouTube token exchange.
    const redirectUri = getGoogleRedirectUri() ?? getYoutubeRedirectUri();
    if (!clientId || !redirectUri) return null;
    savePending(pending.state, {
      platform: "youtube",
      mode: pending.mode,
      workspaceId: pending.workspaceId,
      userId: pending.userId,
      codeVerifier: pending.verifier,
      createdAt: Date.now(),
      returnTo: safeReturnTo(pending.returnTo),
    });
    const q = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: YOUTUBE_SCOPES,
      state: pending.state,
      code_challenge: pkceChallenge(pending.verifier),
      code_challenge_method: "S256",
      access_type: "offline",
      prompt: "consent",
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${q}`;
  }

  function startOAuth(
    c: Context,
    platform: "twitch" | "kick" | "x",
    mode: "login" | "link",
    workspaceId?: string,
    userId?: string,
  ): Response {
    if (platform === "x") {
      const xId = readEnv("X_CLIENT_ID") ?? "";
      if (looksLikeXApiKeyNotClientId(xId)) {
        return xClientIdErrorPage(xId);
      }
    }
    const state = randomString(16);
    const verifier = randomString(32);
    const url = buildAuthorizeUrl(platform, { state, verifier, mode, workspaceId, userId });
    if (!url) return c.text(`Missing OAuth env for ${platform}`, 500);
    return c.redirect(url);
  }

  authRoutes.get("/api/auth/:platform/start", (c) => {
    const platform = c.req.param("platform") as "twitch" | "kick" | "x" | "youtube";
    if (!["twitch", "kick", "x", "youtube"].includes(platform)) {
      return c.json({ error: "invalid platform" }, 400);
    }
    if (platform === "x") {
      const xId = readEnv("X_CLIENT_ID") ?? "";
      if (looksLikeXApiKeyNotClientId(xId)) {
        return c.json(
          {
            error:
              "X_CLIENT_ID looks like an API Key, not an OAuth 2.0 Client ID. Copy the OAuth 2.0 Client ID from developer.x.com → Keys and tokens.",
          },
          400,
        );
      }
    }
    const ws = resolveWorkspace(c);
    const state = randomString(16);
    const verifier = randomString(32);
    const returnTo = safeReturnTo(c.req.query("returnTo"));
    if (platform === "youtube") {
      const url = buildYoutubeAuthorizeUrl({
        state,
        verifier,
        mode: ws ? "link" : "login",
        workspaceId: ws?.workspaceId,
        userId: ws?.userId,
        returnTo,
      });
      if (!url) {
        return c.json(
          {
            error:
              "YouTube connect needs GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env (same Google OAuth app). Enable YouTube Data API v3 and add the YouTube callback URI in Google Cloud Console.",
            hints: YOUTUBE_OAUTH_HINTS,
            redirectUri: getYoutubeRedirectUri() ?? null,
          },
          500,
        );
      }
      return c.json({ url });
    }
    const url = buildAuthorizeUrl(platform, {
      state,
      verifier,
      mode: ws ? "link" : "login",
      workspaceId: ws?.workspaceId,
      userId: ws?.userId,
      returnTo,
    });
    if (!url) return c.json({ error: `Missing OAuth env for ${platform}` }, 500);
    return c.json({ url });
  });

  authRoutes.get("/auth/twitch/login", (c) => startOAuth(c, "twitch", "login"));
  authRoutes.get("/auth/kick/login", (c) => startOAuth(c, "kick", "login"));
  authRoutes.get("/auth/x/login", (c) => startOAuth(c, "x", "login"));
  authRoutes.get("/auth/google/login", startGoogleOAuth);

  function startYoutubeOAuth(
    c: Context,
    mode: "login" | "link",
    workspaceId?: string,
    userId?: string,
  ): Response {
    const state = randomString(16);
    const verifier = randomString(32);
    const returnTo = safeReturnTo(c.req.query("returnTo"));
    const url = buildYoutubeAuthorizeUrl({
      state,
      verifier,
      mode,
      workspaceId,
      userId,
      returnTo,
    });
    if (!url) {
      return oauthErrorPage(
        "youtube",
        "YouTube OAuth not configured",
        "Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env, enable YouTube Data API v3, and add the callback URI in Google Cloud Console.",
        YOUTUBE_OAUTH_HINTS,
      );
    }
    return c.redirect(url);
  }

  authRoutes.get("/auth/youtube/login", (c) => startYoutubeOAuth(c, "login"));
  authRoutes.get("/auth/youtube", (c) => {
    const ws = resolveWorkspace(c);
    if (!ws) return c.redirect("/auth/youtube/login");
    return startYoutubeOAuth(c, "link", ws.workspaceId, ws.userId);
  });

  authRoutes.get("/auth/twitch", (c) => {
    const ws = resolveWorkspace(c);
    if (!ws) return c.redirect("/auth/twitch/login");
    const clientId = readEnv("TWITCH_CLIENT_ID");
    const redirectUri = resolveOAuthRedirectUri("twitch", "TWITCH_REDIRECT_URI");
    if (!clientId || !redirectUri) return c.text("Missing TWITCH_CLIENT_ID or TWITCH_REDIRECT_URI", 500);
    return startOAuth(c, "twitch", "link", ws.workspaceId, ws.userId);
  });

  authRoutes.get("/auth/kick", (c) => {
    const ws = resolveWorkspace(c);
    if (!ws) return c.redirect("/auth/kick/login");
    const clientId = readEnv("KICK_CLIENT_ID");
    const redirectUri = resolveOAuthRedirectUri("kick", "KICK_REDIRECT_URI");
    if (!clientId || !redirectUri) return c.text("Missing KICK_CLIENT_ID or KICK_REDIRECT_URI", 500);
    return startOAuth(c, "kick", "link", ws.workspaceId, ws.userId);
  });

  authRoutes.get("/auth/x", (c) => {
    const ws = resolveWorkspace(c);
    if (!ws) return c.redirect("/auth/x/login");
    const clientId = readEnv("X_CLIENT_ID");
    const redirectUri = resolveOAuthRedirectUri("x", "X_REDIRECT_URI");
    if (!clientId || !redirectUri) return c.text("Missing X_CLIENT_ID or X_REDIRECT_URI", 500);
    return startOAuth(c, "x", "link", ws.workspaceId, ws.userId);
  });

  async function handleCallback(
    c: { req: { query: (k: string) => string | undefined } },
    platform: "twitch" | "kick" | "x" | "youtube",
    tokenUrl: string,
    extra: Record<string, string>,
    authHeader: string | undefined,
  ): Promise<Response> {
    const code = c.req.query("code");
    const state = c.req.query("state");
    const err = c.req.query("error");
    const errDesc = c.req.query("error_description");
    if (err) {
      const combined = `${err} ${errDesc ?? ""}`;
      if (/redirect/i.test(combined)) {
        return oauthRedirectDeniedPage(platform, err, errDesc, extra.redirect_uri ?? null);
      }
      return oauthErrorPage(platform, "OAuth denied", errDesc?.trim() || err, []);
    }
    if (!code || !state) return new Response("Missing code or state", { status: 400 });
    const pending = consumePending(state);
    if (!pending || pending.platform !== platform) {
      return new Response("Invalid or expired state", { status: 400 });
    }

    const body: Record<string, string> = {
      grant_type: "authorization_code",
      code,
      redirect_uri: extra.redirect_uri,
      code_verifier: pending.codeVerifier,
      ...extra,
    };

    let json: Record<string, unknown>;
    try {
      const headers = authHeader ? { Authorization: authHeader } : undefined;
      json = await exchangeToken(tokenUrl, body, headers);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const hints = platform === "x" ? X_OAUTH_HINTS : platform === "twitch" ? TWITCH_OAUTH_HINTS : [];
      return oauthErrorPage(platform, "Token exchange failed", msg, hints);
    }

    const accessToken = String(json.access_token ?? "");
    if (!accessToken) {
      return oauthErrorPage(platform, "No access token", JSON.stringify(json), []);
    }
    const refreshToken = json.refresh_token ? String(json.refresh_token) : undefined;
    const expiresIn = json.expires_in ? Number(json.expires_in) : undefined;

    if (platform === "x") {
      const granted = String(json.scope ?? "")
        .split(/\s+/)
        .filter(Boolean);
      if (!granted.includes("users.read") || !granted.includes("tweet.read")) {
        return oauthErrorPage(
          platform,
          "X token missing required scopes",
          `Granted: ${granted.join(" ") || "(none)"}\nRequired: users.read tweet.read offline.access`,
          X_OAUTH_HINTS,
        );
      }
    }

    let profile;
    try {
      profile = await fetchPlatformProfile(platform, accessToken);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const hints = platform === "x" ? X_OAUTH_HINTS : platform === "twitch" ? TWITCH_OAUTH_HINTS : [];
      return oauthErrorPage(platform, "Profile load failed", msg, hints);
    }

    try {
      let workspaceId = pending.workspaceId;
      let userId = pending.userId;
      let issueToken = false;

      let needsUsernameSetup = false;
      if (pending.mode === "login") {
        const existing = await findOwnerByPlatformUser(platform, profile.platformUserId);
        if (existing) {
          workspaceId = existing.workspace.id;
          userId = existing.user.id;
          needsUsernameSetup = !(await isProfileSetupComplete(workspaceId));
        } else {
          const created = await createOAuthUserWithWorkspace(
            platform,
            profile.platformUserId,
            profile.username,
            profile.displayName,
          );
          workspaceId = created.workspace.id;
          userId = created.user.id;
          needsUsernameSetup = true;
        }
        issueToken = true;
      }

      if (!workspaceId || !userId) {
        return new Response("OAuth session invalid — try signing in again", { status: 400 });
      }

      await upsertPlatformTokens(workspaceId, platform, {
        accessToken,
        refreshToken,
        platformUserId: profile.platformUserId,
        platformUsername: profile.username,
        expiresAt: expiresIn ? new Date(Date.now() + expiresIn * 1000) : undefined,
        scope: json.scope ? String(json.scope) : undefined,
      });
      await onPlatformLinked(workspaceId, platform, hub).catch((e) =>
        console.error(`[${platform}] adapter start`, e),
      );

      if (issueToken) {
        const user = await findUserById(userId);
        const workspace = await getWorkspaceForUser(userId);
        if (!user || !workspace) {
          return new Response("Account setup failed", { status: 500 });
        }
        const token = signSession({
          userId: user.id,
          workspaceId: workspace.id,
          email: user.email,
          role: user.role,
        });
        const dest = needsUsernameSetup
          ? webAppUrl(
              `/onboarding/username?token=${encodeURIComponent(token)}&platform=${platform}&suggested=${encodeURIComponent(profile.username)}`,
            )
          : webAppUrl(
              `/auth/callback?token=${encodeURIComponent(token)}&linked=${platform}`,
            );
        return new Response(null, {
          status: 302,
          headers: {
            Location: dest,
            "Set-Cookie": sessionCookieHeader(token),
          },
        });
      }

      return Response.redirect(
        webAppUrl(pending.returnTo ?? `/dashboard?linked=${platform}`),
        302,
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (
        msg.includes("getaddrinfo") ||
        msg.includes("tenant/user") ||
        msg.includes("password authentication") ||
        msg.includes("ENOTFOUND") ||
        msg.includes("ECONNREFUSED")
      ) {
        return oauthErrorPage(
          platform,
          "Database unreachable",
          msg,
          [
            "Open Supabase → Project omnichat → Database settings → reset password to match .env",
            "Use Session pooler URI with URL-encoded password (! → %21)",
            "Run: pnpm db:test then restart API",
          ],
          503,
        );
      }
      return oauthErrorPage(platform, "Sign-in failed", msg, []);
    }
  }

  authRoutes.get("/auth/twitch/callback", (c) => {
    const clientId = readEnv("TWITCH_CLIENT_ID");
    const clientSecret = readEnv("TWITCH_CLIENT_SECRET");
    const redirectUri = resolveOAuthRedirectUri("twitch", "TWITCH_REDIRECT_URI");
    if (!clientId || !clientSecret || !redirectUri) {
      return c.text("Missing TWITCH_CLIENT_ID, TWITCH_CLIENT_SECRET, or TWITCH_REDIRECT_URI", 500);
    }
    return handleCallback(c, "twitch", "https://id.twitch.tv/oauth2/token", {
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
    }, undefined);
  });

  authRoutes.get("/api/auth/oauth-setup", (c) => {
    const xId = readEnv("X_CLIENT_ID") ?? "";
    return c.json({
      x: {
        redirectUri: resolveOAuthRedirectUri("x", "X_REDIRECT_URI") ?? null,
        authorizeHost: "https://x.com/i/oauth2/authorize",
        scopes: X_SCOPES,
        clientIdLength: xId.length,
        clientIdLooksLikeApiKey: looksLikeXApiKeyNotClientId(xId),
        hints: X_OAUTH_HINTS,
      },
      twitch: {
        redirectUri: resolveOAuthRedirectUri("twitch", "TWITCH_REDIRECT_URI") ?? null,
        hints: TWITCH_OAUTH_HINTS,
      },
      kick: { redirectUri: resolveOAuthRedirectUri("kick", "KICK_REDIRECT_URI") ?? null },
      google: { redirectUri: getGoogleRedirectUri() ?? null },
      youtube: {
        redirectUri: getYoutubeRedirectUri() ?? null,
        scopes: YOUTUBE_SCOPES,
        configured: isYoutubeOAuthConfigured(),
        hints: YOUTUBE_OAUTH_HINTS,
      },
    });
  });

  authRoutes.get("/", async (c) => {
    const url = new URL(c.req.url);
    if (url.searchParams.get("code") && url.searchParams.get("state")) {
      // Legacy Twitch redirect to API root — preserve ?code=&state=
      url.pathname = "/auth/twitch/callback";
      return authRoutes.fetch(new Request(url.toString(), c.req.raw));
    }
    return c.redirect(webAppUrl("/"));
  });

  // Preferred Twitch callback when using https://api.yourdomain.com/auth/twitch/callback

  authRoutes.get("/auth/kick/callback", (c) => {
    const clientId = readEnv("KICK_CLIENT_ID");
    const clientSecret = readEnv("KICK_CLIENT_SECRET");
    const redirectUri = resolveOAuthRedirectUri("kick", "KICK_REDIRECT_URI");
    if (!clientId || !clientSecret || !redirectUri) {
      return c.text("Missing KICK_CLIENT_ID, KICK_CLIENT_SECRET, or KICK_REDIRECT_URI", 500);
    }
    // Kick expects credentials in the form body, not Basic auth (docs.kick.com OAuth token endpoint).
    return handleCallback(c, "kick", "https://id.kick.com/oauth/token", {
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
    }, undefined);
  });

  /** YouTube reuses the registered Google callback URI (see buildYoutubeAuthorizeUrl). */
  function youtubeCallback(
    c: { req: { query: (k: string) => string | undefined } },
    redirectUri: string,
  ): Response | Promise<Response> {
    const clientId = readEnv("GOOGLE_CLIENT_ID");
    const clientSecret = readEnv("GOOGLE_CLIENT_SECRET");
    if (!clientId || !clientSecret) {
      return oauthErrorPage(
        "youtube",
        "YouTube OAuth not configured",
        "Missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET.",
        YOUTUBE_OAUTH_HINTS,
      );
    }
    return handleCallback(c, "youtube", "https://oauth2.googleapis.com/token", {
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
    }, undefined);
  }

  // Shared Google callback: YouTube connect/login is routed through here using
  // the same registered redirect URI, so Google Cloud Console only needs one URI.
  authRoutes.get("/auth/google/callback", (c) => {
    const state = c.req.query("state");
    const pend = state ? peekPending(state) : null;
    if (pend?.platform === "youtube") {
      const redirectUri = getGoogleRedirectUri() ?? getYoutubeRedirectUri();
      if (!redirectUri) {
        return oauthErrorPage(
          "youtube",
          "YouTube OAuth not configured",
          "Missing GOOGLE_REDIRECT_URI.",
          YOUTUBE_OAUTH_HINTS,
        );
      }
      return youtubeCallback(c, redirectUri);
    }
    return handleGoogleCallback(c);
  });

  // Kept for setups that registered the dedicated YouTube callback URI directly.
  authRoutes.get("/auth/youtube/callback", (c) => {
    const redirectUri = getYoutubeRedirectUri();
    if (!redirectUri) {
      return oauthErrorPage(
        "youtube",
        "YouTube OAuth not configured",
        "Missing callback URI.",
        YOUTUBE_OAUTH_HINTS,
      );
    }
    return youtubeCallback(c, redirectUri);
  });

  authRoutes.get("/auth/x/callback", (c) => {
    const clientId = readEnv("X_CLIENT_ID");
    const clientSecret = readEnv("X_CLIENT_SECRET");
    const redirectUri = resolveOAuthRedirectUri("x", "X_REDIRECT_URI");
    if (!clientId || !clientSecret || !redirectUri) {
      return c.text("Missing X_CLIENT_ID, X_CLIENT_SECRET, or X_REDIRECT_URI", 500);
    }
    // X rejects client_id in the body when Authorization: Basic is set.
    const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
    return handleCallback(
      c,
      "x",
      "https://api.twitter.com/2/oauth2/token",
      { redirect_uri: redirectUri },
      `Basic ${basic}`,
    );
  });

  authRoutes.get("/api/workspaces/:id/omnibot", async (c) => {
    const id = c.req.param("id");
    return c.json({ workspaceId: id, config: await getOmnibotConfig(id) });
  });

  authRoutes.patch("/api/workspaces/:id/omnibot", async (c) => {
    const session = requireSession(c);
    const id = c.req.param("id");
    if (session && session.workspaceId !== id && !isSuperAdmin(c)) {
      return c.json({ error: "forbidden" }, 403);
    }
    const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
    const config = await patchOmnibotConfig(id, body as Parameters<typeof patchOmnibotConfig>[1], {
      superAdmin: isSuperAdmin(c),
    });
    return c.json({ workspaceId: id, config });
  });

  authRoutes.post("/api/workspaces/:id/omnibot/test-wallet", async (c) => {
    const session = requireSession(c);
    const id = c.req.param("id");
    if (session && session.workspaceId !== id && !isSuperAdmin(c)) {
      return c.json({ error: "forbidden" }, 403);
    }
    const body = (await c.req.json().catch(() => ({}))) as { text?: string };
    const text = typeof body.text === "string" ? body.text : "";
    const matches = scanWalletAddresses(text);
    return c.json({ workspaceId: id, matches, wouldBlock: matches.length > 0 });
  });

  authRoutes.get("/api/workspaces/:id/omnibot/audit", async (c) => {
    const session = requireSession(c);
    const id = c.req.param("id");
    if (session && session.workspaceId !== id && !isSuperAdmin(c)) {
      return c.json({ error: "forbidden" }, 403);
    }
    const limit = Math.min(100, Math.max(1, Number(c.req.query("limit") ?? 50)));
    const rows = await listAutomodAudit(id, limit);
    return c.json({
      workspaceId: id,
      audit: rows.map((r) => ({
        ...r,
        createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : r.createdAt,
      })),
    });
  });

  authRoutes.get("/api/admin/workspaces", async (c) => {
    if (!isSuperAdmin(c)) return c.json({ error: "forbidden" }, 403);
    const all = await listAllWorkspaces();
    const workspaces = await Promise.all(
      all.map(async (w) => ({
        id: w.id,
        slug: w.slug,
        displayName: w.displayName,
        connections: await getConnections(w.id),
        omnibot: await getOmnibotConfig(w.id),
      })),
    );
    return c.json({ workspaces });
  });

  authRoutes.patch("/api/admin/workspaces/:id/omnibot/locks", async (c) => {
    if (!isSuperAdmin(c)) return c.json({ error: "forbidden" }, 403);
    const body = (await c.req.json().catch(() => ({}))) as { locked?: Record<string, boolean> };
    const config = await setOmnibotLocks(c.req.param("id"), body.locked ?? {});
    return c.json({ workspaceId: c.req.param("id"), config });
  });

  authRoutes.get("/api/admin", (c) => c.redirect(webAppUrl("/admin")));

  return authRoutes;
}
