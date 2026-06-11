# X Live Chat (OMnichat Chrome extension)

X has **no public live-chat API**. The OMnichat Chrome extension watches X profiles,
detects when they go live, opens their chat page in the background, and forwards
messages to your OMnichat feed.

## Setup

1. **Load the extension** — Chrome → `chrome://extensions` → Developer mode → Load unpacked → `extensions/chrome`
2. **Add X profiles in OMnichat** — Settings → Channels → add `@handle` or `x.com/handle`
3. **Pair the extension** — Settings → Connections → **Generate pairing code** → paste in extension popup → **Pair with OMnichat**
4. **Enable auto-watch** — In the extension popup, confirm handles are listed and **Auto-watch & capture** is on

The extension checks profiles about every minute. When someone is live, it opens
`x.com/HANDLE/chat` in a pinned background tab and captures chat into OMnichat.

## Notes

- You must be **logged into X** in the same Chrome profile as the extension
- Read-only ingest — sending to X from OMnichat is not supported via this path
- If live detection stops working, X may have changed their page layout — update selectors in `capture.js` / `background.js`

## API (extension)

- `POST /api/extension/pairing` — generate pairing code (auth required)
- `POST /api/extension/pair` — extension exchanges code for webhook + handles
- `GET /api/workspaces/:id/extension/x-state?token=` — poll watched X handles
- `POST /api/workspaces/:id/extension/x-handles?token=` — extension pushes handles
- `POST /api/workspaces/:id/ingest/ssn?token=` — message webhook (unchanged)
