# Rumble server ingest

Watch **any live Rumble channel** by adding a link under **Settings → Channels** — no API key, no Rumble login required for reading.

Sending chat back into Rumble requires each user to connect their own **u_s** session cookie once (like X cookies on the VPS).

**Production 24/7:** deploy the API on a VPS — see **[VPS-DEPLOY.md](./VPS-DEPLOY.md)**.

## How watching works

1. User adds `rumble.com/c/streamer` (or slug) in **Channels**
2. API resolves the channel page → live `stream_id`
3. API opens guest SSE: `https://web7.rumble.com/chat/api/chat/{stream_id}/stream`
4. Messages flow into the workspace chat viewer

If the channel is offline, the API retries every ~45s (tune with `RUMBLE_OFFLINE_RETRY_MS`).

## How sending works

Rumble has no OAuth for chat. To **post** from OMnichat:

1. In Chrome, log into [rumble.com](https://rumble.com)
2. DevTools → **Application** → **Cookies** → `https://rumble.com`
3. Copy the **`u_s`** value
4. **Settings → Connected Platforms → Connect Rumble** → paste `u_s`

Optional second prompt: **Live Stream API URL** (from [rumble.com/account/livestream-api](https://rumble.com/account/livestream-api)) — only for your **own** stream overlays/extras, not required for watching others.

## Env (API server)

```env
RUMBLE_SERVER_INGEST_ENABLED=1
RUMBLE_OFFLINE_RETRY_MS=45000
RUMBLE_SCRAPE_HEADLESS=1
```

| Variable | Default | Purpose |
|----------|---------|---------|
| `RUMBLE_SERVER_INGEST_ENABLED` | `1` | Watch ingest via SSE |
| `RUMBLE_OFFLINE_RETRY_MS` | `45000` | Re-check offline channels |
| `RUMBLE_SCRAPE_HEADLESS` | `1` | Playwright fallback when HTML fetch fails; use `0` + xvfb on VPS if needed |

Check status: `GET /health` → `rumbleServerIngest: true`, `rumbleIngest.sse`

## Local test scripts

From repo root (needs a **live** Rumble channel):

```bash
# Resolve slug → stream id
node apps/api/scripts/test-rumble-resolve.mjs newearthfitnessarchive

# Listen to SSE (replace id)
node apps/api/scripts/test-rumble-sse.mjs 123456789 60

# Send test message (your u_s cookie)
node apps/api/scripts/test-rumble-send.mjs 123456789 YOUR_U_S "hello from omnichat"
```

## Architecture notes

- **Read:** anonymous SSE — no browser on VPS in the normal path
- **Resolve:** HTTP fetch of channel HTML; Playwright fallback if parse fails
- **Pool:** one SSE connection per live `stream_id`, shared across workspaces watching the same stream
- **Optional API key:** `scope: livestream-api` — polls your Live Stream API for own-stream extras
- **Send:** `scope: chat-session` — stores encrypted `u_s` per workspace

## When it breaks

- Rumble changes undocumented `web7.rumble.com` endpoints → update `apps/api/src/adapters/rumble-sse.ts` / `rumble-resolve.ts`
- Session expired for sending → re-copy `u_s` into Settings
- Channel offline → chat appears when they go live and retry succeeds
- Datacenter IP blocked on page fetch → set `RUMBLE_SCRAPE_HEADLESS=0` and run API under xvfb (same VPS as X scrape)

## Risks

- Undocumented internal chat API — may change without notice
- Storing `u_s` on the server is sensitive — treat `.env` / DB like a password
- Possible Rumble ToS considerations for non-official API use
