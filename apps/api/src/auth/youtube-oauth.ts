import { readEnv } from "../env.js";
import { normalizeOAuthRedirectUri } from "./oauth-redirect.js";

/** Resolve YouTube OAuth callback — explicit env, or derive from Google redirect / API URL. */
export function getYoutubeRedirectUri(): string | undefined {
  const explicit = readEnv("YOUTUBE_REDIRECT_URI");
  if (explicit) return normalizeOAuthRedirectUri(explicit);

  const googleUri = readEnv("GOOGLE_REDIRECT_URI");
  if (googleUri?.includes("/auth/google/callback")) {
    return normalizeOAuthRedirectUri(
      googleUri.replace("/auth/google/callback", "/auth/youtube/callback"),
    );
  }

  const apiBase = readEnv("API_PUBLIC_URL") ?? `http://127.0.0.1:${process.env.PORT ?? 8787}`;
  return normalizeOAuthRedirectUri(`${apiBase.replace(/\/$/, "")}/auth/youtube/callback`);
}

export function isYoutubeOAuthConfigured(): boolean {
  return Boolean(
    readEnv("GOOGLE_CLIENT_ID") &&
      readEnv("GOOGLE_CLIENT_SECRET") &&
      getYoutubeRedirectUri(),
  );
}

export const YOUTUBE_OAUTH_HINTS = [
  "Google Cloud Console → APIs & Services → Credentials → your OAuth 2.0 Client ID",
  "Under Authorized redirect URIs, add this EXACT URL (copy from /health → oauthRedirects.youtube):",
  getYoutubeRedirectUri() ?? "http://127.0.0.1:8787/auth/youtube/callback",
  "Use 127.0.0.1 — not localhost. Google treats them as different URIs.",
  "Also enable YouTube Data API v3 for the project.",
  "OAuth consent screen: add your Google account under Test users if the app is in Testing mode.",
  "Set YOUTUBE_REDIRECT_URI in .env to match what you register (then restart the API).",
];
