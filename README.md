# Om-nichat

Multi-platform stream chat aggregator (Twitch, Kick, YouTube, X, Rumble).

## Setup

1. Copy [`.env.example`](.env.example) to `.env` and fill in your credentials (never commit `.env`).
2. See [SETUP.md](SETUP.md) for database, OAuth, and local dev.
3. Production deploy docs: [docs/OMNICHAT-WTF-SETUP.md](docs/OMNICHAT-WTF-SETUP.md).

## Local dev

```bash
pnpm install
pnpm --filter @omnichat/chat-types build
pnpm --filter @omnichat/api dev
pnpm --filter @omnichat/web dev
```

## Security

See [SECURITY.md](SECURITY.md) for vulnerability reporting.
