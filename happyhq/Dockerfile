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

# Build-time public values. NEXT_PUBLIC_* are inlined into the JS bundle
# at next build, so they need to be present here, not at runtime.
# Defaults are empty — the image builds CE-style (no accounts, no billing).
# To build an EE-enabled image, pass `--build-arg` for each value, e.g.:
#   docker build --build-arg NEXT_PUBLIC_ACCOUNTS_ENABLED=true ...
ARG NEXT_PUBLIC_ACCOUNTS_ENABLED=""
ARG NEXT_PUBLIC_BILLING_ENABLED=""
ARG NEXT_PUBLIC_INSTANT_APP_ID=""
ARG NEXT_PUBLIC_GOOGLE_CLIENT_ID=""
ARG NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=""
ENV NEXT_PUBLIC_ACCOUNTS_ENABLED=$NEXT_PUBLIC_ACCOUNTS_ENABLED \
    NEXT_PUBLIC_BILLING_ENABLED=$NEXT_PUBLIC_BILLING_ENABLED \
    NEXT_PUBLIC_INSTANT_APP_ID=$NEXT_PUBLIC_INSTANT_APP_ID \
    NEXT_PUBLIC_GOOGLE_CLIENT_ID=$NEXT_PUBLIC_GOOGLE_CLIENT_ID \
    NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=$NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY

RUN cd happyhq && pnpm build

# ---------------------------------------------------------------------------
# Stage 4 — runtime: minimal image with only what's needed to run
# ---------------------------------------------------------------------------
FROM node:20-alpine AS runtime

# git: required by instrumentation.ts (git init) and lib/git/sync.server.ts
RUN apk add --no-cache git bash

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
# Point HOME at the mounted volume so ~/.claude.json and ~/.claude/ both
# persist across machine restarts. See docker-entrypoint.sh for the migration
# from the previous symlink-based layout.
ENV HOME=/data/home
EXPOSE 3000

COPY --chmod=755 happyhq/docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
CMD ["docker-entrypoint.sh"]
