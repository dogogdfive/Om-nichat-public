# Om-nichat setup

## 1. Environment

Copy `.env.example` to `.env` and fill in:

- `DATABASE_URL` — your Supabase Postgres connection string (see `.env.example`).
  - On **Windows**, do **not** use the direct `db.*.supabase.co` host (IPv6-only — causes `getaddrinfo ENOENT`).
  - Open your [Supabase Database settings](https://supabase.com/dashboard) → **Reset database password** if needed.
  - Click **Connect** → **Session mode** → copy the full URI, paste into `.env` as `DATABASE_URL`, or run:
  ```powershell
  .\scripts\configure-database.ps1 "YOUR_DB_PASSWORD"
  ```
  - Verify: `pnpm db:test` (must print `connected`).
- `SESSION_SECRET` — any long random string
- `TOKEN_ENCRYPTION_KEY` — 64 hex characters (32 bytes), e.g. `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
- `WEB_APP_URL=http://localhost:3000`
- Platform OAuth keys (Twitch, Kick, X)
- Optional: `SUPER_ADMIN_EMAILS=you@example.com`

## 2. Database

```powershell
pnpm install
pnpm db:migrate
```

## Production domain (Vercel)

See **[docs/DOMAIN-AND-VERCEL.md](docs/DOMAIN-AND-VERCEL.md)** — buy domain, deploy `apps/web` + `apps/api`, set HTTPS OAuth callbacks.

## 3. Run

```powershell
pnpm --filter @omnichat/chat-types build
pnpm --filter @omnichat/db build
pnpm dev:api
```

In another terminal:

```powershell
pnpm dev:web
```

- Site: http://localhost:3000
- API: http://localhost:8787

## 4. X Live chat (optional)

See [docs/X-LIVE-CHAT.md](docs/X-LIVE-CHAT.md) — uses Social Stream Ninja webhook ingest.

## 5. Super admin

Sign up with an email listed in `SUPER_ADMIN_EMAILS`, then open http://localhost:3000/admin

## 6. Production VPS (24/7 X scrape, PC off)

See **[docs/deploy-later/README.md](docs/deploy-later/README.md)** — Oracle + Vercel checklist to do when you're ready.  
Technical detail: **[docs/VPS-DEPLOY.md](docs/VPS-DEPLOY.md)** · Scripts: **`deploy/vps/`**
