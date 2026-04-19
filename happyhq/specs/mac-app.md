# Mac App

Packaging Q as a native Mac application that non-developers can download, install, and run without a terminal.

## Purpose

This spec defines how Q is wrapped as a `.app` bundle using Electron so that regular Mac users can run it locally. The user downloads a `.dmg`, drags Q to Applications, and launches it. No Node.js, no Homebrew, no terminal. The existing setup flow handles Anthropic credentials.

## Why Electron

Q's server side is entirely Node.js — API routes, server actions, filesystem I/O, and `child_process.spawn` calls to `claude` and `git`. Electron's main process IS Node.js, so the standalone Next.js server runs natively as a forked child process.

Tauri was considered. It uses the system WebView (lighter), but Q's server needs Node.js regardless. Tauri would require bundling Node.js as a sidecar — two runtimes with the Rust side doing nothing useful. Electron's ~150MB Chromium overhead is acceptable for a professional tool (VS Code is 400MB, Slack 300MB).

## Architecture

```
Electron Main Process (main.ts)
  ├── fork('standalone/app/server.js')
  │     └── Next.js server on 127.0.0.1:<dynamic-port>
  │         └── All existing API routes, server actions, FS ops, Agent SDK
  └── BrowserWindow
        └── loads http://127.0.0.1:<port>
```

The Next.js standalone output (already configured via `output: 'standalone'` in `next.config.ts`) produces a self-contained `server.js` that runs identically to how it runs in Docker. Electron forks it as a child process.

**No changes to Q's runtime behavior.** The same code runs in dev, Docker, and the Mac app. The only difference is how the server process starts and where bundled binaries live.

## Monorepo Structure

New `desktop/` package at the monorepo root:

```
desktop/
  package.json              # Electron + electron-builder config
  tsconfig.json
  src/
    main.ts                 # App lifecycle, port, server fork, window
    preload.ts              # Context isolation (minimal)
  scripts/
    prepare-standalone.ts   # Copies build artifacts into desktop/standalone/
  build/
    icon.icns               # Mac app icon
    entitlements.mac.plist  # macOS entitlements for code signing
```

Added to `pnpm-workspace.yaml` alongside existing packages.

## Main Process Responsibilities

### Port Allocation

Find a free port at startup using `net.createServer()` on port 0. This avoids collisions if the user also runs `pnpm dev` on port 3000.

### Server Lifecycle

Fork the standalone `server.js` via `child_process.fork()` with:

| Env var                 | Value                                    |
| ----------------------- | ---------------------------------------- |
| `PORT`                  | Dynamic port from allocation             |
| `HOSTNAME`              | `127.0.0.1` (no network exposure)        |
| `Q_DESKTOP`             | `1`                                      |
| `Q_DESKTOP_CLAUDE_PATH` | Absolute path to bundled `claude` binary |

The `cwd` must be set to the standalone app directory so `process.cwd()` resolves `prompts/` and `q/` correctly (same requirement as the Dockerfile's `WORKDIR /app/app`).

Poll `http://127.0.0.1:<port>` until 200 or 302 (redirect to setup), then load the URL in the window.

If the server process exits unexpectedly, restart it and reload the window.

### Window

Single `BrowserWindow` with `titleBarStyle: 'hiddenInset'` for a native Mac feel. Q's own desktop windowing system (Zustand-managed) runs inside this single Electron window.

OAuth URLs (`claude.ai/*`, `platform.claude.com/*`) intercepted via `setWindowOpenHandler` and opened in the default browser with `shell.openExternal()`.

### Git Check

On first launch, check for `git` availability. Two failure modes exist on macOS:

1. **Xcode CLT not installed** — `git` command not found. Show a native dialog offering to run `xcode-select --install` (triggers the macOS Command Line Tools installer GUI). One-time step, no Terminal needed.
2. **Xcode CLT installed but license not accepted** — `git` exists but every command fails with "You have not agreed to the Xcode license agreements." This happens after Xcode updates. The only fix is `sudo xcodebuild -license accept` in Terminal, which is not realistic for non-technical users. There is no native macOS GUI for accepting the license without the full Xcode app (~7GB).

The app degrades gracefully in both cases — git init and sync failures are caught and logged, the app keeps working, but users lose file version history. Long-term fix: bundle a standalone git binary (see Bundled Binaries).

## Bundled Binaries

| Binary         | Strategy                                                                                                                                                                                                               |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **claude CLI** | Installed via `@anthropic-ai/claude-code` npm dep. Binary path passed to Agent SDK via `Q_DESKTOP_CLAUDE_PATH`.                                                                                                        |
| **git**        | Not bundled yet. Xcode CLT is prompted if missing, but the license-not-accepted failure mode can't be resolved without Terminal. Bundle a standalone git binary (~15–30MB) to eliminate the Xcode dependency entirely. |
| **Node.js**    | Bundled by Electron (it ships with V8 + Node).                                                                                                                                                                         |

## Changes to Existing Code

One env-var check. No behavior changes for dev or Docker.

### `lib/agents/config.server.ts`

The `claudeExecutable` currently only resolves for Docker (`Q_PASSWORD`). Add a fallback for the desktop app:

```ts
const claudeExecutable = process.env.Q_PASSWORD
  ? '/usr/local/bin/claude'
  : process.env.Q_DESKTOP_CLAUDE_PATH || undefined
```

PDF text extraction uses `@hyzyla/pdfium` (WASM, in-process) — no system binary needed, no env var for path.

## Build Pipeline

Mirrors the Dockerfile assembly:

1. **Build Next.js standalone** — `pnpm --filter=app build`
2. **Assemble artifacts** — `prepare-standalone.ts` copies:
   - `.next/standalone/` → `desktop/standalone/`
   - `.next/static/` → `desktop/standalone/app/.next/static/`
   - `public/` → `desktop/standalone/app/public/`
   - `prompts/` → `desktop/standalone/app/prompts/`
   - `q/` → `desktop/standalone/app/q/`
   - Bundled binaries → `desktop/bin/`
3. **Build Electron** — `tsc` compiles `main.ts` and `preload.ts`
4. **Package** — `electron-builder --mac dmg` produces the `.dmg`

`asar: false` in electron-builder config — the standalone output needs real filesystem access and `child_process.fork()` needs a real file path.

## Code Signing & Distribution

**For local testing:** Works unsigned on the developer's machine.

**For distribution:**

- Apple Developer account ($99/year)
- Developer ID Application certificate
- `electron-builder` handles signing + notarization via env vars
- Entitlements: JIT (V8), `network.client` (API), `network.server` (local port), file access
- Future: auto-update via `electron-updater` + GitHub Releases

## Design Decisions

**Forked child process, not inline require.** The standalone `server.js` calls `http.createServer()` and `server.listen()`. Running it via `fork()` keeps the Electron main process clean and avoids conflicts between Electron's internal HTTP handling and Next.js. A crash in the server doesn't take down the shell — main process can detect and restart.

**Dynamic port, not fixed.** Avoids collisions with `pnpm dev`. The port is an implementation detail — the user never sees it.

**No `Q_PASSWORD` in desktop mode.** The middleware bypasses password auth when `Q_PASSWORD` is unset (local dev mode). Same behavior for the desktop app — there's no need for password auth on a local machine.

**`HAPPYHQ_ROOT` unchanged.** `constants.server.ts` defaults to `~/HappyHQ`. This is already the right location for a desktop app. No changes needed.

## Acceptance Criteria

- [ ] `desktop/` package exists in monorepo with Electron + electron-builder deps
- [ ] `pnpm --filter=app build && pnpm --filter=desktop build` produces a working `.app`
- [ ] Launching the `.app` starts the Next.js server and opens the Q UI
- [ ] Setup flow works (API key entry and OAuth sign-in)
- [ ] Chat works with streaming responses
- [ ] File operations work (create stream, upload file, browse directories)
- [ ] PDF processing works with pdfium (in-process, no binary needed)
- [ ] Git operations work (stream versioning, auto-commit)
- [ ] No port conflict when `pnpm dev` is also running
- [ ] App shows a helpful dialog when git is not installed
- [ ] OAuth URLs open in the default browser, not in the Electron window
- [ ] Server crash restarts automatically without losing the window
- [ ] _(deferred)_ Code signing and notarization for distribution
- [ ] _(deferred)_ Bundle standalone git binary to remove Xcode CLT dependency
- [ ] _(deferred)_ Auto-update mechanism
- [ ] _(deferred)_ DMG background image and branding

## Testing

Primarily manual verification — Electron packaging is integration-heavy.

1. Build and launch: `pnpm --filter=desktop package`, open the `.dmg`, run the `.app`
2. Walk through setup flow with API key
3. Create a stream, send a chat message, verify streaming works
4. Upload a PDF, verify pdfium text extraction
5. Create files via agent, verify git auto-commit
6. Kill the server process (`kill <pid>`), verify it restarts
7. Run with `pnpm dev` simultaneously, verify no port collision

### Not tested

Automated Electron testing (Spectron/Playwright) — deferred until the packaging is stable. The underlying Next.js app has its own test suite.

## Edge Cases

- **No internet connection** — App launches, server starts, but API calls to Anthropic fail. Existing error handling in the chat route covers this.
- **`~/HappyHQ` on an external drive** — Works if the volume is mounted. Fails gracefully with filesystem errors if not.
- **Very large HappyHQ directory** — No different from dev mode. Filesystem operations are the same.
- **macOS Sequoia privacy prompts** — User will see "Q wants to access files in Documents" on first run. Normal and expected.
- **Multiple instances** — Each finds its own port. Multiple windows into the same `~/HappyHQ` could cause git conflicts. _(deferred — consider a single-instance lock)_

## Constraints

- Mac-only (no Windows/Linux) — matches the target audience
- Requires internet for Anthropic API calls (no offline mode)
- Requires git via Xcode CLT (not bundled yet — plan to bundle standalone git to avoid Xcode license issues)
- Node.js version locked to whatever Electron ships (currently Node 20.x in Electron 33+)

## Cross-References

- [Filesystem Layout](filesystem-layout.md) — `~/HappyHQ` directory structure
- [Chat](chat.md) — streaming architecture
- [Planning](planning.md) / [Working](working.md) — agent modes
- Dockerfile (`app/Dockerfile`) — reference implementation for standalone assembly
