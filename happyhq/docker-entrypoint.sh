#!/bin/sh
# Runtime entrypoint for the q-* fleet.
#
# Persists Claude Code state across Fly machine restarts. The volume at /data
# survives stop/start cycles; the root filesystem does not. Setting HOME to a
# directory on the volume means ~/.claude.json (the config file) and ~/.claude/
# (the state directory) both persist naturally — no symlinks, no risk of an
# atomic rename replacing a symlink with an ephemeral file.
set -eu

mkdir -p "$HOME"

# One-time migration from the old layout, where /data/.claude was symlinked
# into /root/.claude and /root/.claude.json lived on the (ephemeral) root FS
# and got wiped on every autostop. Safe to leave in place; remove once all
# q-* machines have rotated through at least one boot on the new layout.
if [ -d /data/.claude ] && [ ! -e "$HOME/.claude" ]; then
  cp -a /data/.claude "$HOME/.claude"
fi
if [ ! -f "$HOME/.claude.json" ]; then
  latest=$(ls -t "$HOME/.claude/backups/.claude.json.backup."* 2>/dev/null | head -1 || true)
  if [ -n "${latest:-}" ]; then
    cp "$latest" "$HOME/.claude.json"
  fi
fi

exec node server.js
