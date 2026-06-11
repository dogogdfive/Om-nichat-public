import { randomBytes } from "node:crypto";
import type { Context } from "hono";
import { readEnv } from "../env.js";
import { resolveOAuthRedirectUri } from "./oauth-redirect.js";
import {
  createUserWithWorkspace,
  findUserByEmail,
  getWorkspaceForUser,
  isProfileSetupComplete,
  resolveSuperAdminRole,
} from "../db/repos.js";
import { hashPassword } from "./password.js";
import { oauthErrorPage, oauthRedirectDeniedPage } from "./oauth-error-page.js";
import { consumePending, savePending } from "./oauth-pending.js";
import { pkceChallenge, randomString } from "./pkce.js";
import { sessionCookieHeader, signSession } from "./session.js";

const GOOGLE_HINTS = [
  "Google Cloud Console → APIs & Services → Credentials → OAuth 2.0 Client ID",
  "Authorized redirect URI must exactly match GOOGLE_REDIRECT_URI in .env",
  "OAuth consent screen: add your email under Test users if app is in Testing mode",
];

function webAppUrl(path: string): string {
  const base = process.env.WEB_APP_URL ?? "http://localhost:3000";
  return `${base.replace(/\/$/, "")}${path}`;
}

function slugFromEmail(email: string): string {
  const local = email.split("@")[0] ?? "user";
  return local.replace(/[^a-z0-9]/gi, "").toLowerCase() || "user";
}

export function getGoogleRedirectUri(): string | undefined {
  return resolveOAuthRedirectUri("google", "GOOGLE_REDIRECT_URI");
}

export function startGoogleOAuth(c: Context): Response {
  const clientId = readEnv("GOOGLE_CLIENT_ID");
  const redirectUri = getGoogleRedirectUri();
  if (!clientId || !redirectUri) {
    return c.text("Missing GOOGLE_CLIENT_ID or GOOGLE_REDIRECT_URI", 500);
  }
  const state = randomString(16);
  const verifier = randomString(32);
  savePending(state, {
    platform: "google",
    mode: "login",
    codeVerifier: verifier,
    createdAt: Date.now(),
  });
  const q = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "openid email profile",
    state,
    code_challenge: pkceChallenge(verifier),
    code_challenge_method: "S256",
    access_type: "online",
    prompt: "select_account",
  });
  return c.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${q}`);
}

export async function handleGoogleCallback(c: {
  req: { query: (k: string) => string | undefined };
}): Promise<Response> {
  const code = c.req.query("code");
  const state = c.req.query("state");
  const err = c.req.query("error");
  const errDesc = c.req.query("error_description");
  if (err) {
    const combined = `${err} ${errDesc ?? ""}`;
    if (/redirect/i.test(combined)) {
      return oauthRedirectDeniedPage("google", err, errDesc, getGoogleRedirectUri() ?? null);
    }
    return oauthErrorPage("google", "OAuth denied", errDesc?.trim() || err, GOOGLE_HINTS, 400);
  }
  if (!code || !state) return new Response("Missing code or state", { status: 400 });

  const pending = consumePending(state);
  if (!pending || pending.platform !== "google") {
    return new Response("Invalid or expired state", { status: 400 });
  }

  const clientId = readEnv("GOOGLE_CLIENT_ID");
  const clientSecret = readEnv("GOOGLE_CLIENT_SECRET");
  const redirectUri = getGoogleRedirectUri();
  if (!clientId || !clientSecret || !redirectUri) {
    return new Response("Missing Google OAuth env", { status: 500 });
  }

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      client_id: clientId,
      client_secret: clientSecret,
      code_verifier: pending.codeVerifier,
    }),
  });
  const tokenJson = (await tokenRes.json().catch(() => ({}))) as Record<string, unknown>;
  if (!tokenRes.ok) {
    const detail = String(tokenJson.error_description ?? tokenJson.error ?? tokenRes.statusText);
    return oauthErrorPage("google", "Token exchange failed", detail, GOOGLE_HINTS);
  }

  const accessToken = String(tokenJson.access_token ?? "");
  if (!accessToken) {
    return oauthErrorPage("google", "No access token", JSON.stringify(tokenJson), GOOGLE_HINTS);
  }

  const profileRes = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const profile = (await profileRes.json().catch(() => ({}))) as {
    email?: string;
    name?: string;
    given_name?: string;
  };
  if (!profileRes.ok || !profile.email) {
    return oauthErrorPage(
      "google",
      "Profile load failed",
      "Google did not return an email for this account",
      GOOGLE_HINTS,
    );
  }

  const email = profile.email.toLowerCase();
  const displayName = profile.name ?? profile.given_name ?? slugFromEmail(email);

  try {
    let user = await findUserByEmail(email);
    let workspace;
    let needsUsernameSetup = false;

    if (!user) {
      const passwordHash = hashPassword(randomBytes(32).toString("hex"));
      const created = await createUserWithWorkspace(
        email,
        passwordHash,
        slugFromEmail(email),
        displayName,
        resolveSuperAdminRole(email),
      );
      user = created.user;
      workspace = created.workspace;
      needsUsernameSetup = true;
    } else {
      workspace = await getWorkspaceForUser(user.id);
      if (!workspace) return new Response("Account setup failed", { status: 500 });
      needsUsernameSetup = !(await isProfileSetupComplete(workspace.id));
    }

    const token = signSession({
      userId: user.id,
      workspaceId: workspace.id,
      email: user.email,
      role: user.role,
    });
    const dest = needsUsernameSetup
      ? webAppUrl(`/onboarding/username?token=${encodeURIComponent(token)}&platform=google`)
      : webAppUrl(`/auth/callback?token=${encodeURIComponent(token)}&linked=google`);
    return new Response(null, {
      status: 302,
      headers: {
        Location: dest,
        "Set-Cookie": sessionCookieHeader(token),
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return oauthErrorPage("google", "Sign-in failed", msg, GOOGLE_HINTS);
  }
}
