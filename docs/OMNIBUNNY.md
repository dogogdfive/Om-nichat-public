# Omnibunny (mod bot)

**UI name:** Omnibunny · **Code/DB:** `omnibot_*` (unchanged)

Omnibunny scans chat for crypto wallet addresses (BTC, ETH, SOL) and **times out** the sender on **Twitch** and **Kick**. It runs through OMnichat’s server — you do **not** need a separate bot account for moderation to work.

## Quick setup (no bot account yet)

1. **Connect Twitch and/or Kick** in Settings → Connections (reconnect if you linked before moderation scopes were added).
2. Open **Dashboard → Omnibunny** (or `/dashboard` after login).
3. Turn on **Omnibunny enabled** and **Wallet scanner**.
4. Enable **Twitch** and **Kick** under platforms.
5. Save.
6. Add your channels under Settings → Channels so OMnichat ingests live chat.

Twitch needs OAuth scope `moderator:manage:banned_users`. Kick needs `moderation:ban` (included in Kick connect).

Make yourself (or OMnichat’s connected account) a **moderator** on your channel if you mod someone else’s chat.

## Pause / resume in chat

Mods or the broadcaster can control the scanner without opening settings:

| Command | Effect |
|--------|--------|
| `@omnibunnybot pause` | Stop wallet timeouts (chat still flows) |
| `@omnibunnybot start` | Resume wallet timeouts |

Also works: `@omni bunny bot pause`, `omnibunnybot start`, `@omnibunnybot resume`.

**Twitch:** broadcaster or mod badges can run commands.  
**Kick:** broadcaster (channel owner) can run commands.

## Optional: register a bot account later

You do **not** need `@omnibunnybot` to exist for timeouts. Commands are detected from normal chat ingest.

If you want a visible bot identity later:

1. Create **omnibunnybot** on Twitch and/or Kick.
2. Do **not** need to connect it to OMnichat for moderation — OMnichat uses **your** OAuth token to timeout users.
3. Optionally mod the bot account on your channel if you want it to speak in chat later.

## Test without moderating

Use **Preview scan** on the dashboard, or:

```http
POST /api/workspaces/{workspaceId}/omnibot/test-wallet
Authorization: Bearer <session>
{ "text": "send to 0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb" }
```

## Audit log

```http
GET /api/workspaces/{workspaceId}/omnibot/audit?limit=50
```

## Database

Apply migrations (includes `automod_audit`):

```bash
pnpm db:migrate
```

## Local dev

```bash
pnpm --filter @omnichat/automod build
pnpm --filter @omnichat/db build
pnpm dev:api
```

Post a wallet address in your Twitch or Kick chat (not as broadcaster/mod) with scanner on — the message should not appear in OMnichat and the user should be timed out on that platform.
