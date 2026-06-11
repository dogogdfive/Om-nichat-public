# Domain + Vercel setup (Om-nichat)

**Production domain in this repo:** `omnichat.wtf` (web) and `api.omnichat.wtf` (API). See [`.env.production.example`](../.env.production.example).

## Critical: monorepo root directories

Each Vercel project must set **Root Directory** in the dashboard (not only `vercel.json`):

| Project | Root Directory |
|---------|----------------|
| Web | `apps/web` |
| API | `apps/api` |

Without this, deploys upload ~18KB and fail with “No Next.js version detected” or API OOM.

---

Use this after you buy a domain on Vercel. Example names: **`omnichat.wtf`** or **`omnichat.com`** (web) and **`api.<domain>`** (API).

## 1. Buy the domain (Vercel dashboard)

1. Go to [vercel.com/dashboard](https://vercel.com/dashboard) → **Domains** → **Add** → **Buy**.
2. Search for a name (e.g. `omnichat.com`, `getomnichat.com`).
3. Complete checkout (usually ~$10–15/year for `.com`).

You do **not** need a separate registrar if you buy through Vercel.

## 2. Deploy the web app (Next.js)

1. [vercel.com/new](https://vercel.com/new) → Import your **Om-nichat** Git repo.
2. Create a project:
   - **Root Directory:** `apps/web`
   - **Framework:** Next.js (auto-detected)
3. **Environment variables** (Production):

   | Name | Example |
   |------|---------|
   | `NEXT_PUBLIC_API_URL` | `https://api.omnichat.wtf` |
   | `NEXT_PUBLIC_X_API_URL` | `https://api.omnichat.wtf` |

4. Deploy.
5. **Domains** → Add **`omnichat.com`** and **`www.omnichat.com`** (redirect www → apex if you prefer).

Set `WEB_APP_URL=https://omnichat.wtf` on the **API** project (step 3).

> **Recommended for live chat + X scrape:** run the API on a **VPS** (Oracle free ARM, etc.) instead of Vercel serverless. See **[VPS-DEPLOY.md](./VPS-DEPLOY.md)** — web stays on Vercel, API on VPS with HTTPS/WSS via Caddy.

## 3. Deploy the API (Hono)

1. New Vercel project from the **same repo**.
2. **Root Directory:** `apps/api`
3. **Environment variables** (copy from local `.env`, but use production URLs):

   | Name | Production value |
   |------|------------------|
   | `WEB_APP_URL` | `https://omnichat.wtf` |
   | `API_PUBLIC_URL` | `https://api.omnichat.wtf` |
   | `DATABASE_URL` | Supabase pooler URI (password URL-encoded) |
   | `SESSION_SECRET` | long random string |
   | `TOKEN_ENCRYPTION_KEY` | 64 hex chars |
   | `TWITCH_*` / `KICK_*` / `X_*` | same keys, **HTTPS redirect URIs** below |
   | `NODEJS_HELPERS` | `0` (recommended for Hono on Vercel) |

   **OAuth redirect URIs (must match developer consoles exactly):**

   ```
   TWITCH_REDIRECT_URI=https://api.omnichat.wtf/auth/twitch/callback
   KICK_REDIRECT_URI=https://api.omnichat.wtf/auth/kick/callback
   X_REDIRECT_URI=https://api.omnichat.wtf/auth/x/callback
   ```

4. Deploy.
5. **Domains** → Add **`api.omnichat.com`** (subdomain of the domain you bought).

> WebSocket chat (`ws://`) does not run on Vercel serverless. OAuth, dashboard API, and ingest still work. Run a long-lived API elsewhere later if you need live WS on production.

## 4. X Developer Portal (xomnichat app)

**User authentication settings:**

| Field | Value |
|-------|--------|
| App permissions | **Read and write** |
| Type of App | **Web App, Automated App or Bot** |
| Callback URI | `https://api.omnichat.wtf/auth/x/callback` |
| Website URL | `https://omnichat.wtf` |

Use **OAuth 2.0 Client ID** (~34 characters), not the API Key (~25 characters).

**Keys & Tokens:** use **OAuth 2.0 Client ID** + **Client Secret** (not Consumer Key).

If the app is in **Development** mode, add your X account under **Test users**.

## 5. Twitch / Kick

Add the same HTTPS callback URLs in each developer console.

## 6. Verify

- `https://api.omnichat.com/health` → `ok: true`
- `https://api.omnichat.com/api/auth/oauth-setup` → `clientIdLooksLikeApiKey: false`
- `https://omnichat.com/login` → sign in with X / Twitch / Kick

## 7. Local dev (unchanged)

Keep `.env` with `http://localhost:8787` and `http://127.0.0.1:8787/auth/x/callback` for local OAuth. Production env vars live only in Vercel project settings.

## Quick reference

| Service | URL |
|---------|-----|
| Web | `https://omnichat.com` |
| API | `https://api.omnichat.com` |
| X callback | `https://api.omnichat.com/auth/x/callback` |

Replace `omnichat.com` with the domain you actually bought.
