# Deploy later — OMnichat production (Oracle + Vercel)

**Use this folder when you're ready to put omnichat.wtf online with 24/7 X chat and your PC off.**

You can keep working on the website locally first. Nothing here is required for local dev (`pnpm dev:web` + `pnpm dev:api`).

## What's in this folder

| Doc | When to read it |
|-----|-----------------|
| [ORACLE-AND-VPS.md](./ORACLE-AND-VPS.md) | Full checklist: Oracle VM, VPS deploy, X cookies, Vercel wiring |
| [COST.md](./COST.md) | What Oracle / Vercel / domain actually cost |
| [../VPS-DEPLOY.md](../VPS-DEPLOY.md) | Detailed technical guide (same flow, more depth) |
| [../../deploy/vps/README.md](../../deploy/vps/README.md) | Shell scripts on the VPS |

## Architecture (reminder)

```text
omnichat.wtf (Vercel)  →  website only, free
api.* (Oracle VPS)     →  API + WebSockets + headed X scrape, $0/month Always Free
Your PC                →  off — not needed after setup
```

## Quick start (when you're ready)

### From your Windows PC

1. **Oracle** — create Ubuntu 22.04 ARM VM (see [ORACLE-AND-VPS.md](./ORACLE-AND-VPS.md))
2. **DuckDNS** — free hostname pointing at VPS IP
3. **One command deploy** (after VM exists):

   ```powershell
   cd C:\Users\admin\Desktop\Om-nichat
   .\scripts\oracle-vps-handoff.ps1 -VpsIp "YOUR_IP" -ApiDomain "omnichat-api.duckdns.org"
   ```

4. **X cookies** — paste `auth_token` + `ct0` into VPS `/opt/om-nichat/.env`, restart service
5. **Vercel web**:

   ```powershell
   .\scripts\vercel-web-vps.ps1 -ApiUrl "https://omnichat-api.duckdns.org"
   ```

6. **Domain** — point `omnichat.wtf` at Vercel (see [DOMAIN-AND-VERCEL.md](../DOMAIN-AND-VERCEL.md))

### SSH key (already on your PC)

Public key for Oracle VM setup:

```
ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIJ8TLkl0s8ckFi7yeA6eIpK56znQLHW2W4xHPAqBqeNC omnichat-oracle
```

Private key: `C:\Users\admin\.ssh\omnichat-oracle`

## Local vs production

| | Local (now) | Production (later) |
|---|-------------|-------------------|
| Web | `localhost:3000` | Vercel → `omnichat.wtf` |
| API | `localhost:8787` | Oracle VPS → `https://api...` |
| X chat | Extension or local scrape | VPS headed Chrome (`X_SCRAPE_HEADLESS=0`) |
| Cost | $0 | ~$0/mo Oracle + ~$10–15/yr domain |

## Help

- Oracle signup browser helper: `node scripts/oracle-signup.mjs` (set `ORACLE_EMAIL` / `ORACLE_PASSWORD` env vars)
- Super admin email in `.env`: `SUPER_ADMIN_EMAILS=you@example.com`
