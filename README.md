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

## Local data folder

HappyHQ stores its workspace at `~/HappyHQ` by default. On first run the app creates this folder and writes a `.happyhq` marker (`{"schemaVersion":1}`) so it can tell its own data folder apart from any unrelated directory you might point it at.

Override the location by setting `HAPPYHQ_ROOT` in `happyhq/.env.local`:

```sh
HAPPYHQ_ROOT="$HOME/Documents/HappyHQ"
```

If `HAPPYHQ_ROOT` points at a non-empty folder that lacks the marker, the app refuses to mount and prints how to fix it. Note: on macOS the default filesystem is case-insensitive, so `~/happyhq` and `~/HappyHQ` resolve to the same path — if you happen to clone this repo into your home directory, set `HAPPYHQ_ROOT` to a different folder.

## Common commands

- `pnpm dev` — start the dev server
- `pnpm lint` / `pnpm check-types` / `pnpm test` / `pnpm format`

## Licensing

This repo is MIT-licensed. See [`LICENSE`](./LICENSE). Any `ee/` directory (e.g. [`happyhq/ee/`](./happyhq/ee)) is source-available under its own `LICENSE`.

## Contributing

See [`CONTRIBUTING.md`](./CONTRIBUTING.md).
