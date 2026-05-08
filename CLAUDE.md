# Development Notes

pnpm/Turborepo monorepo. Active development is in `happyhq/` (the main app).

## Workspaces

- `happyhq/` — main Next.js app

The Stripe webhook handler lives in a separate private `billing` service repo,
not in this monorepo.

## Commands

- `pnpm install` — install deps (always from repo root)
- `pnpm dev` — start all apps (`pnpm turbo dev`)
- `pnpm turbo dev --filter=<workspace>` — start one workspace
- `pnpm --filter=<workspace> <script>` — run any package script from the repo root (e.g. `build`, `test`, `smoke:e2e`). Or `cd` into the workspace and run the script directly. Never build from root.
- `pnpm lint` / `pnpm check-types` / `pnpm format` — root-level scripts that span the monorepo

## Before committing

Run `pnpm format`. If deps changed, run `pnpm install` from root to update lockfile.

## Branches

Prefix with `feat/`, `fix/`, `docs/`, or `chore/`.

## Licensing

- Root MIT (`LICENSE`) covers everything outside `ee/` directories
- Any `ee/` directory (e.g. `happyhq/ee/`) is source-available under its own `LICENSE`
