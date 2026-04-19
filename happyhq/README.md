# happyhq

The HappyHQ app — a Next.js application.

See the [root README](../README.md) for what HappyHQ is.
See [`CLAUDE.md`](./CLAUDE.md) for development conventions, commands, and debugging.

## Quick start

From the repo root:

```sh
pnpm install
cp happyhq/.env.example happyhq/.env.local
# edit happyhq/.env.local — at minimum set ANTHROPIC_API_KEY
pnpm turbo dev --filter=happyhq
```

## Layout

- `app/` — Next.js App Router pages and layouts
- `components/` — React components
- `lib/` — Utilities and business logic (`.server.ts` = server-only)
- `specs/` — Feature specifications
- `ee/` — source-available enterprise code, see [`ee/LICENSE`](./ee/LICENSE)
