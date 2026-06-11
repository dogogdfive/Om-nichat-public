# VPS deploy scripts

Run these **on the Oracle VM** (Ubuntu 22.04 ARM) unless noted.

Full checklist: [docs/deploy-later/ORACLE-AND-VPS.md](../../docs/deploy-later/ORACLE-AND-VPS.md)

## From Windows (after VM exists)

```powershell
.\scripts\oracle-vps-handoff.ps1 -VpsIp "YOUR_IP" -ApiDomain "your-api-host.duckdns.org"
.\scripts\vercel-web-vps.ps1 -ApiUrl "https://your-api-host.duckdns.org"
```

## On the VPS

| Script | Purpose |
|--------|---------|
| `install-deps.sh` | Node 20, pnpm, xvfb, ufw (ports 22/80/443) |
| `build-api.sh` | pnpm install + build + Playwright Chromium |
| `env.example` | Copy to repo root `.env` on VPS |
| `setup-caddy.sh` | HTTPS/WSS reverse proxy to `:8787` |
| `install-services.sh` | systemd unit — API under xvfb, headed Chrome |
| `bootstrap.sh` | All-in-one if run as root with domain arg |

## Headed X scrape

In VPS `.env`:

```env
X_SERVER_SCRAPE_ENABLED=1
X_SCRAPE_HEADLESS=0
```

systemd runs: `xvfb-run … node apps/api/dist/index.js`

## Health check

```bash
curl -s http://127.0.0.1:8787/health
curl -s https://YOUR_API_DOMAIN/health
```
