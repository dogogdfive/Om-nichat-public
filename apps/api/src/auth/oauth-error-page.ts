export function oauthErrorPage(
  platform: string,
  title: string,
  detail: string,
  hints: string[],
  status = 502,
): Response {
  const list = hints.map((h) => `<li>${escapeHtml(h)}</li>`).join("");
  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"/><title>${escapeHtml(title)}</title>
<style>
  body{font-family:system-ui,sans-serif;background:#0a0a0a;color:#e4e4e7;max-width:42rem;margin:2rem auto;padding:0 1rem;line-height:1.5}
  h1{color:#f87171;font-size:1.25rem}
  pre{background:#18181b;padding:1rem;border-radius:8px;overflow:auto;font-size:0.85rem}
  ul{color:#a1a1aa}
  a{color:#a78bfa}
</style></head>
<body>
  <h1>${escapeHtml(title)}</h1>
  <p>Platform: <strong>${escapeHtml(platform)}</strong></p>
  <pre>${escapeHtml(detail)}</pre>
  <ul>${list}</ul>
  <p><a href="${escapeHtml(process.env.WEB_APP_URL ?? "http://localhost:3000")}/login">Back to sign in</a></p>
</body></html>`;
  return new Response(html, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export const X_OAUTH_HINTS = [
  "MOST LIKELY: X granted token is missing tweet.read — GET /2/users/me returns 403 without it.",
  "In developer.x.com → your app → User authentication settings → enable OAuth 2.0 with Read and write.",
  "Required scopes: users.read, tweet.read, offline.access (reconnect after changing scopes).",
  "X_CLIENT_ID must be the OAuth 2.0 Client ID (~34 chars), NOT the API Key (~25 chars).",
  "Callback URI must exactly match X_REDIRECT_URI in .env (use http://127.0.0.1, not localhost).",
  "Website URL: set to http://localhost:3000",
  "App must be attached to a Project (not a standalone app only).",
  "If the app is in Development mode, add your X account under Test users.",
];

/**
 * X OAuth 2.0 Client IDs are ~34 chars (base64url, e.g. ends in ":1:ci" when decoded).
 * The legacy API Key (consumer key) is ~25 alphanumeric chars. People commonly paste the
 * API Key into X_CLIENT_ID by mistake, which makes X's authorize page fail generically.
 */
export function looksLikeXApiKeyNotClientId(clientId: string): boolean {
  const id = clientId.trim();
  // OAuth 2.0 client ids are at least ~30 chars; API keys are ~25 and purely alphanumeric.
  return id.length > 0 && id.length < 30 && /^[A-Za-z0-9]+$/.test(id);
}

export function xClientIdErrorPage(clientId: string): Response {
  return oauthErrorPage(
    "x",
    "Wrong X credential: this is an API Key, not an OAuth 2.0 Client ID",
    `X_CLIENT_ID is "${clientId}" (${clientId.trim().length} chars).\n` +
      `That looks like the legacy API Key. The OAuth 2.0 authorize endpoint needs the OAuth 2.0 Client ID (~34 chars).`,
    X_OAUTH_HINTS,
    400,
  );
}

export const TWITCH_OAUTH_HINTS = [
  "Twitch Developer Console → OAuth Redirect URLs must match TWITCH_REDIRECT_URI in .env exactly.",
  "If using http://localhost:8787, register that root URL OR switch to http://localhost:8787/auth/twitch/callback.",
  "Restart the API after changing .env, then start a fresh sign-in (do not reuse an old redirect tab).",
];

export function oauthRedirectDeniedPage(
  platform: string,
  error: string,
  errorDescription: string | undefined,
  redirectUri: string | null,
): Response {
  const detail = errorDescription?.trim() || error;
  const hints = [
    redirectUri
      ? `Register this exact callback URL in the ${platform} developer console: ${redirectUri}`
      : `Set ${platform.toUpperCase()}_REDIRECT_URI (or API_PUBLIC_URL) in .env and restart the API.`,
    "The URL must match character-for-character — https, no trailing slash, correct path.",
    "Keep localhost callbacks if you still develop locally; add the production URL as an additional entry.",
    "After saving in the provider console, start a fresh sign-in (do not reuse an old tab).",
  ];
  if (platform === "twitch") hints.push(...TWITCH_OAUTH_HINTS);
  if (platform === "x") hints.push(...X_OAUTH_HINTS);
  return oauthErrorPage(platform, "Redirect URI not registered", detail, hints, 400);
}
