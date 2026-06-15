# OMnichat Desktop

Electron wrapper for [omnichat.wtf](https://omnichat.wtf) — same chat, login, and OAuth as the website, packaged as a native app with larger login/signup buttons.

## Prerequisites

- Node.js 20+
- [pnpm](https://pnpm.io) 9+
- **Windows `.exe`:** build on Windows
- **Mac `.dmg`:** build on macOS

## Quick start (run from repo root)

```bash
pnpm install
pnpm desktop:dev
```

Opens the app at the homepage (`https://omnichat.wtf/`). To use local web dev instead:

```bash
OMNICHAT_APP_URL=http://localhost:3000/ pnpm desktop:dev
```

## Build installers

From repo root:

```bash
# Windows NSIS installer → apps/desktop/release/
pnpm desktop:pack:win

# macOS disk image → apps/desktop/release/  (macOS only)
pnpm desktop:pack:mac
```

Installers are unsigned by default. Windows SmartScreen and macOS Gatekeeper may warn until you add code-signing certificates.

## What it does

- Loads the live Omnichat site (no bundled Next.js)
- Keeps OAuth (Twitch, Kick, X, Google) inside the app window
- Opens external links (Terms, etc.) in your system browser
- Injects desktop-only CSS for bigger auth buttons
- Single-instance — launching again focuses the existing window

## Configuration

| Variable | Default | Purpose |
|----------|---------|---------|
| `OMNICHAT_APP_URL` | `https://omnichat.wtf/` | Start URL for the app window |
