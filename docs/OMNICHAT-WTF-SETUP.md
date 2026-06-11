# omnichat.wtf — setup checklist

| What | URL |
|------|-----|
| Website (Next.js) | `https://omnichat.wtf` |
| API (OAuth + REST) | `https://api.omnichat.wtf` |
| X callback | `https://api.omnichat.wtf/auth/x/callback` |
| Twitch callback | `https://api.omnichat.wtf/auth/twitch/callback` |
| Kick callback | `https://api.omnichat.wtf/auth/kick/callback` |

---

## Part A — Vercel: web app

1. [vercel.com/new](https://vercel.com/new) → import **Om-nichat** repo.
2. **Project name:** e.g. `omnichat-web`
3. **Root Directory:** `apps/web` (Edit → set to `apps/web`)
4. **Environment variables** (Production + Preview):

   ```
   NEXT_PUBLIC_API_URL=https://api.omnichat.wtf
   NEXT_PUBLIC_X_API_URL=https://api.omnichat.wtf
   ```

5. **Deploy**.
6. Project → **Settings** → **Domains** → **Add** → `omnichat.wtf`
7. If Vercel shows DNS records, they are usually auto-configured when the domain was bought on Vercel. Wait until status is **Valid**.
8. Optional: add `www.omnichat.wtf` and redirect to `omnichat.wtf`.

---

## Part B — Vercel: API

1. **Add New Project** → same repo.
2. **Project name:** e.g. `omnichat-api`
3. **Root Directory:** `apps/api`
4. **Environment variables** (Production) — copy from local `.env`, change URLs:

   ```
   WEB_APP_URL=https://omnichat.wtf
   API_PUBLIC_URL=https://api.omnichat.wtf
   DATABASE_URL=<your Supabase pooler URI, password URL-encoded>
   SESSION_SECRET=<same as local or new random>
   TOKEN_ENCRYPTION_KEY=<same 64-hex as local>
   SUPER_ADMIN_EMAILS=you@example.com

   TWITCH_CLIENT_ID=<from Twitch console>
   TWITCH_CLIENT_SECRET=<from Twitch console>
   TWITCH_REDIRECT_URI=https://api.omnichat.wtf/auth/twitch/callback

   KICK_CLIENT_ID=<from Kick>
   KICK_CLIENT_SECRET=<from Kick>
   KICK_REDIRECT_URI=https://api.omnichat.wtf/auth/kick/callback

   X_CLIENT_ID=<OAuth 2.0 Client ID ~34 chars>
   X_CLIENT_SECRET=<OAuth 2.0 Client Secret>
   X_REDIRECT_URI=https://api.omnichat.wtf/auth/x/callback

   NODEJS_HELPERS=0
   ```

5. **Deploy**.
6. **Settings** → **Domains** → **Add** → `api.omnichat.wtf`
7. Wait for **Valid** (subdomain DNS may take a few minutes).

---

## Part C — Developer consoles (OAuth)

### X (xomnichat app)

**User authentication settings:**

- Permissions: **Read and write**
- Type: **Web App, Automated App or Bot**
- Callback: `https://api.omnichat.wtf/auth/x/callback`
- Website: `https://omnichat.wtf`
- Save

**Keys & Tokens:** OAuth 2.0 Client ID + Secret → Vercel **omnichat-api** env vars.

Development mode: add your X account as **Test user**.

### Twitch

[dev.twitch.tv/console/apps](https://dev.twitch.tv/console/apps) → your app → **OAuth Redirect URLs** → add:

```
https://api.omnichat.wtf/auth/twitch/callback
```

(Keep `http://localhost:8787` if you still develop locally.)

### Kick

Add redirect URL:

```
https://api.omnichat.wtf/auth/kick/callback
```

---

## Part D — Verify

1. `https://api.omnichat.wtf/health` → JSON with `"ok": true`
2. `https://api.omnichat.wtf/api/auth/oauth-setup` → `clientIdLooksLikeApiKey: false`
3. `https://omnichat.wtf/login` → sign in with Twitch / Kick / X
4. After login → dashboard, platforms show connected

---

## Local dev (unchanged)

Keep root `.env` with `localhost` / `127.0.0.1` URLs. Production URLs live only in Vercel.

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| `api.omnichat.wtf` NXDOMAIN / not ready | Wait for DNS; confirm subdomain added on **omnichat-api** project |
| X “Something went wrong” | OAuth 2.0 Client ID in env; Web App type; callback exact match |
| CORS error on login | `WEB_APP_URL=https://omnichat.wtf` on API project; redeploy API |
| 502 on Twitch | Read error page body; check `TWITCH_REDIRECT_URI` matches Twitch console |
