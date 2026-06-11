# Oracle + VPS setup — do later checklist

Complete these in order when you're ready to go live. **~30–60 minutes total**, mostly one-time.

---

## Part 1 — Oracle Cloud (~15 min)

1. Go to [cloud.oracle.com](https://cloud.oracle.com) and sign up (card for verification only on Always Free).
   - Optional helper from repo root:
     ```powershell
     $env:ORACLE_EMAIL="your@email.com"
     $env:ORACLE_PASSWORD="your-password"
     node scripts/oracle-signup.mjs
     ```
   - Finish card + email verification in the browser yourself.

2. **Create a VM:**
   - Shape: **VM.Standard.A1.Flex** (Always Free ARM)
   - OCPUs: **2**, Memory: **12 GB**
   - Image: **Ubuntu 22.04 Minimal (aarch64)** — not Oracle Linux
   - Paste SSH public key (see [README.md](./README.md))

3. **Networking** → Security list → allow inbound **TCP 22, 80, 443**

4. Copy the VM **public IP**

If **Out of capacity**: try another region/availability domain, or use Hetzner (~€4/mo) with the same scripts.

---

## Part 2 — DNS (~5 min)

**Option A — Free (quick test)**  
[duckdns.org](https://www.duckdns.org) → e.g. `omnichat-api.duckdns.org` → your VPS IP

**Option B — Production with omnichat.wtf**  
- `omnichat.wtf` → Vercel (web) — see [DOMAIN-AND-VERCEL.md](../DOMAIN-AND-VERCEL.md)  
- `api.omnichat.wtf` → VPS public IP (A record)

---

## Part 3 — Deploy API on VPS (~15 min)

### Easy way (from Windows, repo root)

```powershell
.\scripts\oracle-vps-handoff.ps1 -VpsIp "YOUR_VPS_IP" -ApiDomain "omnichat-api.duckdns.org"
```

### Manual way (SSH into VPS)

```bash
git clone https://github.com/dogogdfive/Om-nichat.git /opt/om-nichat
cd /opt/om-nichat
sudo bash deploy/vps/install-deps.sh
bash deploy/vps/build-api.sh
cp deploy/vps/env.example .env
nano .env
sudo bash deploy/vps/setup-caddy.sh omnichat-api.duckdns.org
sudo bash deploy/vps/install-services.sh /opt/om-nichat
```

### Required `.env` on VPS

```env
X_SERVER_SCRAPE_ENABLED=1
X_SCRAPE_HEADLESS=0          # real browser under xvfb — not headless
X_AUTH_TOKEN=...
X_CT0=...
API_PUBLIC_URL=https://omnichat-api.duckdns.org
WEB_APP_URL=https://omnichat.wtf
USE_LOCAL_DB=1
SUPER_ADMIN_EMAILS=you@example.com
SESSION_SECRET=...
TOKEN_ENCRYPTION_KEY=...
```

**X cookies:** Chrome DevTools → Application → Cookies → `x.com` → copy `auth_token` and `ct0`.

Restart after editing:

```bash
sudo systemctl restart omnichat-api
```

### Verify

```bash
curl https://omnichat-api.duckdns.org/health
```

Look for `xServerScrape: true` and scrape `headless: false`.

---

## Part 4 — Vercel website (~10 min)

Deploy **only** `apps/web` — not the API on Vercel.

1. [vercel.com/new](https://vercel.com/new) → import repo → Root Directory: **`apps/web`**
2. Set env: `NEXT_PUBLIC_API_URL=https://api.omnichat.wtf` (or your DuckDNS URL)
3. Or from Windows:

   ```powershell
   .\scripts\vercel-web-vps.ps1 -ApiUrl "https://api.omnichat.wtf"
   ```

4. **OAuth callbacks** (Twitch, Kick, X, etc.) must use the **VPS** host:

   ```
   https://api.omnichat.wtf/auth/twitch/callback
   https://api.omnichat.wtf/auth/kick/callback
   https://api.omnichat.wtf/auth/x/callback
   ```

5. Match those URLs in VPS `.env` and restart API.

---

## Part 5 — Test

1. Open site → log in  
2. Settings → Channels → add an X handle  
3. When live, chat appears in `/chat`  
4. **Shut down your PC** — VPS keeps running  

---

## What runs where

| Component | Where | Your PC needed? |
|-----------|--------|-----------------|
| Website | Vercel | No |
| API + live chat WebSocket | Oracle VPS | No |
| X chat scrape (headed Chrome) | Oracle VPS (xvfb) | No |
| Chrome extension | Not needed if VPS scrape is on | No |

---

## Scripts reference

| Script | Purpose |
|--------|---------|
| `scripts/oracle-vps-handoff.ps1` | Windows → SSH deploy everything |
| `scripts/oracle-signup.mjs` | Open Oracle signup in browser |
| `scripts/vercel-web-vps.ps1` | Deploy web, point at VPS API |
| `deploy/vps/*.sh` | VPS install, build, Caddy, systemd |

More detail: [VPS-DEPLOY.md](../VPS-DEPLOY.md)  
Costs: [COST.md](./COST.md)
