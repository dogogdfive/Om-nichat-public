# Cost — omnichat.wtf production

Short answer: **Oracle backend = $0/month.** Main paid item is the **domain**.

## Monthly

| Service | Role | Cost |
|---------|------|------|
| **Oracle Always Free VM** | API, WebSockets, X scrape (headed Chrome) | **$0/month** — no expiry |
| **Vercel Hobby** | Website (`apps/web` only) | **$0** for personal/small use |
| **DuckDNS** (optional) | Free API hostname before custom domain | **$0** |
| **Supabase** (optional) | Postgres instead of `USE_LOCAL_DB=1` on VPS | **$0** on free tier |

**Typical Oracle bill if you follow the guide: $0/month.**

## Yearly

| Item | Cost |
|------|------|
| **Domain `omnichat.wtf`** | ~**$10–15/year** (registrar — Vercel or Namecheap, etc.) |

Oracle does **not** sell you the `.wtf` domain. You buy it elsewhere and point DNS at Vercel (web) and your VPS (API).

## Oracle free tier — what you get

- **ARM VM** (`VM.Standard.A1.Flex`): up to **4 CPUs + 24 GB RAM** total across free VMs  
  - Recommended for OMnichat: **2 CPU / 12 GB** — fits inside free limits
- **Always Free** = **unlimited time** (not “12 months then paid”)
- **Card on signup** = identity verification; you are not charged for Always Free resources within limits
- **Separate $300 trial** for 30 days — for trying paid services; **not required** for the free VM

## When Oracle could charge you

- You create **paid** shapes or services outside Always Free
- You exceed Always Free quotas (e.g. more than 4 ARM CPUs total)
- You upgrade to a paid account and leave paid resources running

Stay on **Always Free-eligible** VM shapes in the console (look for the “Always Free eligible” label).

## Idle VM warning

Oracle may **remove** an Always Free VM if it looks **idle for 7+ days** (very low CPU/network/memory). OMnichat’s API polling + Chrome scrape counts as active use — you should be fine.

## Full stack summary

```text
Per month:  $0  (Oracle + Vercel free tiers)
Per year:   ~$12 (domain only, if you use omnichat.wtf)
```

See [ORACLE-AND-VPS.md](./ORACLE-AND-VPS.md) for setup steps.
