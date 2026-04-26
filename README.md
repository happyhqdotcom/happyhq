# [HappyHQ](https://happpyhq.com)

**The AI workspace for everyday work.**

Open-source monorepo for the HappyHQ product.

## Structure

- [`happyhq/`](./happyhq) — the main Next.js application
  - [`happyhq/ee/`](./happyhq/ee) — enterprise/source-available code (see [`happyhq/ee/LICENSE`](./happyhq/ee/LICENSE))

## Requirements

- Node.js 20+
- pnpm 10.2.1+

## Getting started

```sh
pnpm install
cp happyhq/.env.example happyhq/.env.local
# edit happyhq/.env.local — at minimum set ANTHROPIC_API_KEY
pnpm dev
```

## Common commands

- `pnpm dev` — start all dev servers
- `pnpm turbo dev --filter=happyhq` — start just the main app
- `pnpm turbo dev --filter=docs` — start just the docs site
- `pnpm lint` / `pnpm check-types` / `pnpm test` / `pnpm format`
- `pnpm --filter=happyhq test` — run tests for a single workspace

## Licensing

- Code outside `ee/` directories is MIT-licensed (see [`LICENSE`](./LICENSE))
- Code inside any `ee/` directory (e.g. [`happyhq/ee/`](./happyhq/ee)) is source-available under separate terms (see that directory's `LICENSE`)

## Contributing

See [`CONTRIBUTING.md`](./CONTRIBUTING.md).
