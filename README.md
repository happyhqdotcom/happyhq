# [HappyHQ](https://happyhq.com)

**The AI workspace for everyday work.**

An AI teammate that learns how you work. Open-source and local-first.

## Requirements

- Node.js 20+
- pnpm 10.2.1+

## Getting started

```sh
pnpm install
cp happyhq/.env.example happyhq/.env.local
pnpm dev
```

Set `ANTHROPIC_API_KEY` in `happyhq/.env.local` when you're ready to chat with Q, our agent — the app runs fine without it until then.

## Optional features

A few capabilities are off by default and enabled via env vars (see [`happyhq/.env.example`](./happyhq/.env.example)):

- **User accounts** — sign-in via InstantDB + Google OAuth
- **Billing** — Stripe-backed subscriptions (requires accounts; lives under `ee/`)

## Common commands

- `pnpm dev` — start the dev server
- `pnpm lint` / `pnpm check-types` / `pnpm test` / `pnpm format`

## Licensing

This repo is MIT-licensed. See [`LICENSE`](./LICENSE). Any `ee/` directory (e.g. [`happyhq/ee/`](./happyhq/ee)) is source-available under its own `LICENSE`.

## Contributing

See [`CONTRIBUTING.md`](./CONTRIBUTING.md).
