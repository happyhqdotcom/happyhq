# Multi-stage Dockerfile for HappyHQ (happyhq/).
# Build from monorepo root: docker build -f happyhq/Dockerfile .

# ---------------------------------------------------------------------------
# Stage 1 — base: Node.js + system deps + pnpm
# ---------------------------------------------------------------------------
FROM node:20-alpine AS base

RUN apk add --no-cache git bash
RUN corepack enable && corepack prepare pnpm@10.2.1 --activate

# ---------------------------------------------------------------------------
# Stage 2 — deps: install only happyhq's dependency tree
# ---------------------------------------------------------------------------
FROM base AS deps
WORKDIR /build

# Copy only files needed for dependency resolution (cache-friendly)
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY happyhq/package.json ./happyhq/

RUN pnpm install --frozen-lockfile --filter=happyhq

# ---------------------------------------------------------------------------
# Stage 3 — build: compile Next.js standalone output
# ---------------------------------------------------------------------------
FROM deps AS build
WORKDIR /build

# Copy happyhq source (other apps excluded by .dockerignore)
COPY happyhq/ ./happyhq/

# Use Docker-specific env for build (no accounts/billing baked in)
COPY happyhq/.env.docker ./happyhq/.env.local

RUN cd happyhq && pnpm build

# ---------------------------------------------------------------------------
# Stage 4 — runtime: minimal image with only what's needed to run
# ---------------------------------------------------------------------------
FROM node:20-alpine AS runtime

# git: required by instrumentation.ts (git init) and lib/git/sync.server.ts
RUN apk add --no-cache git bash

# Claude Code CLI — required for `claude auth login` and `claude auth status`.
# Pin to the version bundled in claude-agent-sdk to avoid behavior drift.
RUN npm install -g @anthropic-ai/claude-code@2.1.92

# standalone output mirrors monorepo structure:
#   .next/standalone/
#   ├── node_modules/
#   ├── package.json
#   └── happyhq/
#       ├── server.js      <- entrypoint
#       ├── node_modules/
#       └── .next/server/
#
# WORKDIR = /app/happyhq so process.cwd() resolves prompts/ and q/ correctly
WORKDIR /app/happyhq

# Standalone server (includes node_modules + compiled server code)
COPY --from=build /build/happyhq/.next/standalone /app

# Static assets (not included in standalone output)
COPY --from=build /build/happyhq/.next/static /app/happyhq/.next/static

# Public files (not included in standalone output)
COPY --from=build /build/happyhq/public /app/happyhq/public

# Runtime data files loaded via process.cwd()
COPY --from=build /build/happyhq/prompts /app/happyhq/prompts
COPY --from=build /build/happyhq/q /app/happyhq/q

ENV PORT=3000 HOSTNAME=0.0.0.0
EXPOSE 3000

# Persist Claude Code state (~/.claude) across machine restarts by symlinking
# to the mounted volume. The volume at /data survives stop/start cycles; the
# root filesystem does not.
CMD ["sh", "-c", "mkdir -p /data/.claude && ln -sfn /data/.claude /root/.claude && exec node server.js"]
