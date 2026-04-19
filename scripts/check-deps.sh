#!/bin/bash

# Checks if node_modules is out of sync with pnpm-lock.yaml
# Runs once at the repository root before dev/build/test commands
#
# Note: This script requires bash and is designed for macOS/Linux environments.
# Windows users with Git Bash or WSL should work fine.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
LOCKFILE="$REPO_ROOT/pnpm-lock.yaml"
NODE_MODULES="$REPO_ROOT/node_modules/.pnpm"

# Check if node_modules exists
if [ ! -d "$REPO_ROOT/node_modules" ]; then
  echo "📦 node_modules not found. Installing dependencies..."
  echo ""
  cd "$REPO_ROOT" && pnpm install
  echo ""
  echo "✅ Dependencies installed!"
  echo ""
  exit 0
fi

# Check if lockfile is newer than node_modules
if [ "$LOCKFILE" -nt "$NODE_MODULES" ]; then
  echo "⚠️  Dependencies are out of sync!"
  echo "📦 pnpm-lock.yaml has been updated. Running pnpm install..."
  echo ""
  cd "$REPO_ROOT" && pnpm install
  echo ""
  echo "✅ Dependencies updated!"
  echo ""
fi
