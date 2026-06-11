# X server-side scrape (experimental)

Uses **your** X session cookies in `.env` + Playwright on the API server to:
1. Check if watched X handles are live
2. Open `x.com/HANDLE/livechat` in Chromium
3. Scrape chat into OMnichat (no Chrome extension, no visible tabs on your PC)

**Production 24/7:** deploy the API on a VPS with `X_SCRAPE_HEADLESS=0` and `xvfb` — see **[VPS-DEPLOY.md](./VPS-DEPLOY.md)**.

**Warning:** storing session cookies on the server is risky. If `.env` leaks, someone can use your X account. Sessions expire; X may block datacenter IPs or headless browsers.

## Setup (local)

1. In Chrome, log into X as your verified account
2. Open DevTools → **Application** → **Cookies** → `https://x.com`
3. Copy values for:
   - `auth_token`
   - `ct0`
4. Add to `.env`:

```env
X_SERVER_SCRAPE_ENABLED=1
X_SCRAPE_HEADLESS=1
X_AUTH_TOKEN=paste_auth_token_here
X_CT0=paste_ct0_here
```

5. Restart API: `pnpm dev:api`
6. Add X handles in OMnichat → **Settings → Channels** (e.g. `@xqc`)

Check status: `GET http://localhost:8787/health` → `xServerScrape: true`, `xIngest`

## VPS (headed Chrome — lower detection)

```env
X_SERVER_SCRAPE_ENABLED=1
X_SCRAPE_HEADLESS=0
X_AUTH_TOKEN=...
X_CT0=...
```

Run the API under **xvfb** (systemd unit in `deploy/vps/omnichat-api.service`). Playwright launches a real browser window on a virtual display instead of `--headless` mode.

## How it works

- Polls every ~45 seconds per workspace
- Uses the same DOM selectors as the Chrome extension
- No extension or webhook URL needed when this mode is on

## Auto re-login (no more manual logins)

When the saved session expires, the scraper can log itself back in using stored
credentials instead of failing until someone runs `pnpm x:login`. Add to `.env`:

```env
X_LOGIN_USERNAME=yourhandle        # no @
X_LOGIN_PASSWORD=your_password
X_LOGIN_EMAIL=you@example.com      # optional — clears "confirm identity" prompts
X_LOGIN_TOTP_SECRET=BASE32SECRET   # REQUIRED if the account has 2FA enabled
```

On detecting a logged-out session, the scraper runs the username → (identity
challenge) → password → (2FA) flow on the persistent profile, saves the fresh
session to disk, and resumes. Re-login is rate-limited to once per 60s so a bad
password can't hammer X. Status shows under `health → xIngest.scrape.autoLogin`
(`credentialsSet`, `attempts`, `lastResult`).

**2FA note:** if the account uses an authenticator app, set `X_LOGIN_TOTP_SECRET`
to the base32 secret from X (Settings → Security → Two-factor → Authenticator app
→ "Can't scan QR? copy key"). Without it, automated login stops at the 2FA step.

**Security:** credentials in `.env` are as sensitive as cookies — if it leaks,
someone has full access to the X account. Use a dedicated bot account.

## When it breaks

- **Auto-refresh:** the API recycles the browser if polls stall (~3 min) or every 30 min by default. Tune with `X_SCRAPE_STALL_MS` and `X_SCRAPE_RECYCLE_MS` in `.env`.
- **Session expired:** if `X_LOGIN_*` credentials are set, the scraper auto re-logs in. Otherwise re-export `auth_token` + `ct0` from Chrome into `.env`, or run `pnpm x:login` on the server.
- X changed their HTML → update `apps/api/src/adapters/x-scraper.ts`
- Run `pnpm exec playwright install chromium` in `apps/api` if browser missing

## Prefer safer option?

Use the **Chrome extension** (`extensions/chrome`) in operator mode — cookies stay in your browser, not on the server. For 24/7 without your PC, use VPS server scrape instead.
