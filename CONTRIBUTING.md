# Contributing

Thanks for your interest in contributing. Participation in this project is governed by our [Code of Conduct](./CODE_OF_CONDUCT.md). A few things to read before you open a PR.

## Before you open a PR

- **Open an issue first for anything non-trivial.** Drive-by refactors, large rewrites, or feature proposals submitted without prior discussion will usually be closed. Bug fixes and small, focused improvements are fine to send directly.
- **Disclose AI-assisted code.** If you used an LLM to write any part of your contribution, say so in the PR description. "The AI wrote it" is not code review — you are expected to understand the code you submit and to have verified it works. PRs that read like unreviewed AI output will be closed.
- **Keep PRs focused.** One concern per PR. Unrelated cleanups in a feature PR make review harder and will usually be asked to split.
- **Test your change.** Include what you did to verify it — not just "tests pass."

## CLA

Contributions to HappyHQ require agreeing to our [Contributor License Agreement](https://happyhq.com/legal/cla). Signing instructions will be wired up on PRs shortly; for now, please read the CLA and confirm in your PR description that you agree to its terms.

## Setup

1. Install **Node.js 20+** and **pnpm 10.2.1+**.
2. Clone and install:
   ```sh
   git clone https://github.com/happyhqdotcom/happyhq.git
   cd happyhq
   pnpm install
   ```
3. Copy env files:
   ```sh
   cp happyhq/.env.example happyhq/.env.local
   ```
4. Start dev servers: `pnpm dev`.

## Workflow

1. Branch from `main` using a prefix:
   - `feat/` for new features
   - `fix/` for bug fixes
   - `docs/` for documentation
   - `chore/` for maintenance
2. Keep commits focused and descriptive.
3. Before opening a PR:
   ```sh
   pnpm lint
   pnpm check-types
   pnpm test
   pnpm format
   ```
4. Open a PR targeting `main`. In the description, cover:
   - What changed and why (link the issue)
   - How you tested it
   - Whether any of the code was AI-assisted

## Style

- ESLint + Prettier across the monorepo
- Tests written with [Vitest](https://vitest.dev/)

## `ee/` directories

Any directory named `ee/` (e.g. `happyhq/ee/`) contains source-available code
that is NOT MIT-licensed — see the `LICENSE` inside that directory. If you
are contributing a feature inside an `ee/` directory, you are agreeing to
contribute under those terms.
