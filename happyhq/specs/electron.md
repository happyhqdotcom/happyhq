# Electron App

Packaging HappyHQ as a native Mac application that non-developers can download, install, and run without a terminal.

## Context

HappyHQ today runs as a Next.js app — fine for developers, opaque for everyone else. This spec defines how it gets wrapped as a `.app` bundle using Electron so a regular Mac user can download a `.dmg`, drag HappyHQ to Applications, and launch it. No Node.js, no Homebrew, no terminal. The existing setup flow handles Anthropic credentials.

The goal of this spec is to be executable end-to-end by an autonomous coding agent overnight, so every file, command, and version is pinned below.

## Why Electron

HappyHQ's server is entirely Node.js — API routes, server actions, filesystem I/O, and `child_process.spawn` calls to git. Electron's main process is Node, so the standalone Next.js server runs natively as a forked child.

Tauri was considered. It uses the system WebView (lighter), but the server needs Node regardless. Tauri would require bundling Node as a sidecar — two runtimes with the Rust side doing nothing useful. Electron's ~150MB Chromium overhead is acceptable for a professional tool (VS Code is 400MB, Slack 300MB).

## Why `happyhq/electron/` (not top-level, not `desktop/`)

- **Not top-level.** The Electron shell exists _for_ HappyHQ; it isn't a peer product. Nesting it inside `happyhq/` matches the conceptual hierarchy and matches the current monorepo shape (everything except root configs lives under `happyhq/`).
- **Not `desktop/`.** That word is already taken by [desktop.md](desktop.md) — the in-app workspace metaphor with draggable windows, icons, and an island. The components at [components/features/desktop/](../components/features/desktop/) and routes at [app/(desktop)/desktop/](<../app/(desktop)/desktop/>) own that name.
- **Why a workspace, not a subdirectory.** Electron + electron-builder pull in a large dependency tree we don't want bloating `happyhq/node_modules`. Adding `happyhq/electron` to `pnpm-workspace.yaml` keeps the trees separate.

## Architecture

```
Electron Main Process (main.ts)
  ├── fork('standalone/happyhq/server.js')
  │     └── Next.js server on 127.0.0.1:<dynamic-port>
  │         └── All existing API routes, server actions, FS ops, Agent SDK
  └── BrowserWindow
        └── loads http://127.0.0.1:<port>
```

The Next.js standalone output (already configured via `output: 'standalone'` in [next.config.ts](../next.config.ts)) produces a self-contained `server.js`. Electron forks it as a child process. No changes to HappyHQ's runtime behavior — the same code runs in dev, Docker, and the Mac app.

## Versions (pinned)

| Package            | Version   | Why                                                             |
| ------------------ | --------- | --------------------------------------------------------------- |
| `electron`         | `^42.0.1` | Latest stable (May 2026). Chromium 146, Node 24 LTS.            |
| `electron-builder` | `^25.1.8` | Latest stable; DMG unsigned by default (correct since 20.43.0). |
| `tsx`              | `^4.20.6` | Already at the monorepo root for scripts.                       |
| `typescript`       | `^6.0.3`  | Matches the root override.                                      |

## Repo Layout

```
happyhq/electron/
  package.json
  tsconfig.json
  electron-builder.yml
  src/
    main.ts                 # App lifecycle, port, server fork, window
    preload.ts              # Empty — contextIsolation target
  scripts/
    prepare-standalone.ts   # Copies build artifacts into standalone/
    build-icon.sh           # SVG → .icns
  build/
    entitlements.mac.plist  # Hardened-runtime entitlements (committed)
    icon.icns               # Generated, gitignored
  standalone/               # Generated, gitignored
  dist/                     # Compiled main.ts/preload.ts, gitignored
  dist-packages/            # electron-builder output, gitignored
```

### Workspace registration

`pnpm-workspace.yaml`:

```yaml
packages:
  - happyhq
  - happyhq/electron
```

### `.gitignore` additions (under `happyhq/electron/`)

```
standalone/
dist/
dist-packages/
build/icon.icns
build/*.iconset
```

## File contents

### `happyhq/electron/package.json`

```json
{
  "name": "@happyhq/electron",
  "version": "0.0.1",
  "private": true,
  "license": "MIT",
  "main": "dist/main.js",
  "scripts": {
    "build:standalone": "tsx scripts/prepare-standalone.ts",
    "build:ts": "tsc -p .",
    "build:icon": "./scripts/build-icon.sh",
    "build": "pnpm --filter=happyhq build && pnpm build:standalone && pnpm build:ts && pnpm build:icon",
    "package": "pnpm build && electron-builder --mac dmg",
    "start": "pnpm build:standalone && pnpm build:ts && electron ."
  },
  "devDependencies": {
    "@types/node": "^25.6.2",
    "electron": "^42.0.1",
    "electron-builder": "^25.1.8",
    "tsx": "^4.20.6",
    "typescript": "^6.0.3"
  }
}
```

### `happyhq/electron/tsconfig.json`

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "commonjs",
    "moduleResolution": "node",
    "outDir": "dist",
    "rootDir": "src",
    "esModuleInterop": true,
    "strict": true,
    "skipLibCheck": true,
    "resolveJsonModule": true
  },
  "include": ["src/**/*"]
}
```

### `happyhq/electron/electron-builder.yml`

```yaml
appId: com.happyhq.app
productName: HappyHQ
artifactName: '${productName}-${version}-${arch}.${ext}'

# The standalone server.js is forked at runtime and needs real filesystem
# paths; asar packing breaks child_process.fork().
asar: false

directories:
  output: dist-packages
  buildResources: build

files:
  - dist/**/*
  - package.json

extraResources:
  - from: standalone
    to: standalone
    filter: ['**/*']

mac:
  category: public.app-category.productivity
  icon: build/icon.icns
  hardenedRuntime: true
  gatekeeperAssess: false
  entitlements: build/entitlements.mac.plist
  entitlementsInherit: build/entitlements.mac.plist
  notarize: false # flip to true once Apple Developer creds are in env
  target:
    - target: dmg
      arch: [arm64, x64]

dmg:
  sign: false # Gatekeeper validates the notarized .app inside
```

### `happyhq/electron/src/main.ts`

```ts
import { app, BrowserWindow, dialog, shell } from 'electron'
import { ChildProcess, fork } from 'node:child_process'
import { createServer } from 'node:net'
import { join } from 'node:path'

if (!app.requestSingleInstanceLock()) {
  app.quit()
}

const STANDALONE_DIR = app.isPackaged
  ? join(process.resourcesPath, 'standalone')
  : join(__dirname, '../standalone')
const SERVER_ENTRY = join(STANDALONE_DIR, 'happyhq/server.js')
const SERVER_CWD = join(STANDALONE_DIR, 'happyhq')

let serverProcess: ChildProcess | null = null
let mainWindow: BrowserWindow | null = null
let serverPort = 0
let quitting = false

async function allocatePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const s = createServer()
    s.unref()
    s.on('error', reject)
    s.listen(0, '127.0.0.1', () => {
      const addr = s.address()
      if (addr && typeof addr === 'object') {
        const { port } = addr
        s.close(() => resolve(port))
      } else {
        reject(new Error('Failed to allocate port'))
      }
    })
  })
}

async function waitForServer(port: number, timeoutMs = 30_000): Promise<void> {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/health`)
      if (res.ok) return
    } catch {
      // not ready yet
    }
    await new Promise((r) => setTimeout(r, 100))
  }
  throw new Error(
    `Server did not respond within ${timeoutMs}ms on port ${port}`,
  )
}

async function startServer(): Promise<void> {
  serverPort = await allocatePort()
  serverProcess = fork(SERVER_ENTRY, [], {
    cwd: SERVER_CWD,
    env: {
      ...process.env,
      PORT: String(serverPort),
      HOSTNAME: '127.0.0.1',
    },
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
  })

  serverProcess.stdout?.on('data', (d) =>
    console.log('[server]', String(d).trimEnd()),
  )
  serverProcess.stderr?.on('data', (d) =>
    console.error('[server]', String(d).trimEnd()),
  )

  serverProcess.on('exit', (code, signal) => {
    console.error(`Server exited (code=${code}, signal=${signal})`)
    if (quitting) return
    startServer()
      .then(() => mainWindow?.loadURL(`http://127.0.0.1:${serverPort}`))
      .catch((err) => dialog.showErrorBox('Server restart failed', String(err)))
  })

  await waitForServer(serverPort)
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: join(__dirname, 'preload.js'),
    },
  })

  mainWindow.setWindowOpenHandler(({ url }) => {
    if (url.startsWith(`http://127.0.0.1:${serverPort}`))
      return { action: 'allow' }
    shell.openExternal(url)
    return { action: 'deny' }
  })

  mainWindow.loadURL(`http://127.0.0.1:${serverPort}`)
}

app.on('second-instance', () => {
  if (!mainWindow) return
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.focus()
})

app.whenReady().then(async () => {
  try {
    await startServer()
    createWindow()
  } catch (err) {
    dialog.showErrorBox('HappyHQ failed to start', String(err))
    app.quit()
  }
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  quitting = true
  serverProcess?.kill()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})
```

### `happyhq/electron/src/preload.ts`

```ts
// Empty preload. The UI talks to the local Next.js server via HTTP, so no
// IPC bridge is needed. This file exists so contextIsolation has a target.
export {}
```

### `happyhq/electron/scripts/prepare-standalone.ts`

Mirrors the Dockerfile's stage 4 layout ([Dockerfile](../Dockerfile)):

```ts
import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs'
import { join, resolve } from 'node:path'

const electronRoot = resolve(__dirname, '..')
const happyhqRoot = resolve(electronRoot, '..')
const dst = join(electronRoot, 'standalone')

if (existsSync(dst)) rmSync(dst, { recursive: true, force: true })
mkdirSync(dst, { recursive: true })

// .next/standalone/* -> standalone/* (server.js lands at standalone/happyhq/server.js)
cpSync(join(happyhqRoot, '.next/standalone'), dst, {
  recursive: true,
  dereference: true,
})

// .next/static is not included in standalone output
cpSync(join(happyhqRoot, '.next/static'), join(dst, 'happyhq/.next/static'), {
  recursive: true,
  dereference: true,
})

// Runtime files loaded via process.cwd() — same set as the Dockerfile
for (const dir of ['public', 'prompts', 'q']) {
  cpSync(join(happyhqRoot, dir), join(dst, 'happyhq', dir), {
    recursive: true,
    dereference: true,
  })
}

console.log(`Standalone prepared at ${dst}`)
```

### `happyhq/electron/scripts/build-icon.sh`

```sh
#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

SRC="../app/icon.svg"
ICONSET="build/HappyHQ.iconset"
OUT="build/icon.icns"

if ! command -v rsvg-convert >/dev/null 2>&1; then
  echo "rsvg-convert not found. Install with: brew install librsvg" >&2
  exit 1
fi
if ! command -v iconutil >/dev/null 2>&1; then
  echo "iconutil not found. Install Xcode Command Line Tools." >&2
  exit 1
fi

rm -rf "$ICONSET" "$OUT"
mkdir -p "$ICONSET"

for size in 16 32 64 128 256 512 1024; do
  rsvg-convert -w "$size" -h "$size" "$SRC" -o "$ICONSET/icon_${size}x${size}.png"
done

# Apple's iconset naming requires @2x variants of each base size.
cp "$ICONSET/icon_32x32.png"     "$ICONSET/icon_16x16@2x.png"
cp "$ICONSET/icon_64x64.png"     "$ICONSET/icon_32x32@2x.png"
cp "$ICONSET/icon_256x256.png"   "$ICONSET/icon_128x128@2x.png"
cp "$ICONSET/icon_512x512.png"   "$ICONSET/icon_256x256@2x.png"
cp "$ICONSET/icon_1024x1024.png" "$ICONSET/icon_512x512@2x.png"

iconutil -c icns "$ICONSET" -o "$OUT"
rm -rf "$ICONSET"
echo "Wrote $OUT"
```

Source artwork: [app/icon.svg](../app/icon.svg) (256×256 magenta Q mark) — also available as [public/brand/q.svg](../public/brand/q.svg).

### `happyhq/electron/build/entitlements.mac.plist`

Hardened-runtime entitlements for a Node-embedding Electron app:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>com.apple.security.cs.allow-jit</key><true/>
  <key>com.apple.security.cs.allow-unsigned-executable-memory</key><true/>
  <key>com.apple.security.cs.disable-library-validation</key><true/>
  <key>com.apple.security.network.client</key><true/>
  <key>com.apple.security.network.server</key><true/>
  <key>com.apple.security.files.user-selected.read-write</key><true/>
  <key>com.apple.security.files.downloads.read-write</key><true/>
</dict>
</plist>
```

## Runtime environment

Only two env vars are set by main.ts. No `Q_PASSWORD`, no `Q_DESKTOP_*`.

| Env var    | Value       | Purpose                                      |
| ---------- | ----------- | -------------------------------------------- |
| `PORT`     | dynamic     | Allocated by `net.createServer({ port: 0 })` |
| `HOSTNAME` | `127.0.0.1` | No network exposure                          |

- `Q_PASSWORD` unset → middleware bypassed (see [proxy.ts](../proxy.ts)).
- `HOME` defaults to the user's home, so `~/.claude/` and `~/HappyHQ` work naturally.
- The Agent SDK resolves the `claude` binary from its bundled platform optional dependency (`@anthropic-ai/claude-agent-sdk-darwin-arm64` or `-darwin-x64`), already force-included by [next.config.ts](../next.config.ts) via `outputFileTracingIncludes`. No `pathToClaudeCodeExecutable` is set anywhere in the codebase; nothing needs to change.

## OAuth and external links

`setWindowOpenHandler` routes everything except `http://127.0.0.1:<port>` to the default browser via `shell.openExternal()`. Anthropic OAuth flows (`claude.ai/*`, `platform.claude.com/*`) open externally and return via the system handler.

## Git on macOS

On first launch, check for `git`. Two known failure modes:

1. **Xcode CLT not installed** — `git` command not found. Show a native dialog with a button that runs `xcode-select --install` (triggers the macOS Command Line Tools installer GUI). One-time, no Terminal.
2. **Xcode CLT installed but license not accepted** — `git` exists, every command fails with "You have not agreed to the Xcode license agreements." Only fix is `sudo xcodebuild -license accept` in Terminal — unrealistic for non-technical users.

The app degrades gracefully in both cases: `instrumentation.ts` git init and `lib/git/sync.server.ts` sync failures are caught and logged. App keeps working; users lose file version history. Long-term fix: bundle a standalone git binary (deferred — see Acceptance Criteria).

## Server lifecycle details

- **Readiness probe.** `GET /api/health` ([app/api/health/route.ts](../app/api/health/route.ts)) — already exempt from middleware. Polled at 100ms intervals up to 30s.
- **Restart on crash.** `serverProcess.on('exit')` allocates a new port, restarts the fork, and reloads the BrowserWindow at the new URL. Suppressed during `before-quit` via the `quitting` flag.
- **Single-instance lock.** Second invocations focus the existing window instead of starting a second server.

## Build pipeline

```
pnpm --filter=happyhq build                          # next build (standalone output)
  └─ produces .next/standalone/, .next/static/
pnpm --filter=@happyhq/electron build:standalone
  └─ copies into happyhq/electron/standalone/happyhq/
pnpm --filter=@happyhq/electron build:ts
  └─ tsc compiles src/ → dist/
pnpm --filter=@happyhq/electron build:icon
  └─ rsvg-convert + iconutil → build/icon.icns
pnpm --filter=@happyhq/electron package
  └─ electron-builder --mac dmg
  └─ produces dist-packages/HappyHQ-0.0.1-arm64.dmg (and -x64.dmg)
```

The `package` script runs all of the above in order.

## Bundled binaries

| Binary   | Strategy                                                                                                           |
| -------- | ------------------------------------------------------------------------------------------------------------------ |
| `claude` | Auto-resolved by Agent SDK from its platform-specific optional dep. Bundled inside `.next/standalone` via tracing. |
| `git`    | Not bundled. Xcode CLT prompt on first launch; license-not-accepted failure mode logged but unrecoverable in-app.  |
| Node.js  | Provided by Electron (Node 24 LTS in Electron 42).                                                                 |

## Code signing & distribution

**First cut: unsigned + ad-hoc.** Works on the developer's machine; right-click → Open on other machines.

**For real distribution:**

- Apple Developer account ($99/year)
- Developer ID Application certificate in the keychain
- Set `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID` in the build environment
- Flip `mac.notarize: true` in `electron-builder.yml`
- electron-builder handles signing + notarization automatically
- DMG stays unsigned by default (Gatekeeper validates the notarized `.app` inside)

## Acceptance Criteria

**Phase 1 — builds and packages (autonomously verifiable):**

- [ ] `happyhq/electron` listed in `pnpm-workspace.yaml`
- [ ] `pnpm install` from repo root completes with the new workspace
- [ ] `pnpm --filter=@happyhq/electron build:standalone` produces `happyhq/electron/standalone/happyhq/server.js`
- [ ] `pnpm --filter=@happyhq/electron build:ts` produces `happyhq/electron/dist/main.js`
- [ ] `pnpm --filter=@happyhq/electron build:icon` produces `happyhq/electron/build/icon.icns` (requires `librsvg`; document as a host prereq)
- [ ] `pnpm --filter=@happyhq/electron package` produces `happyhq/electron/dist-packages/HappyHQ-0.0.1-arm64.dmg`
- [ ] `pnpm check-types` passes from the repo root with the new workspace included
- [ ] `pnpm lint` passes

**Phase 2 — runtime behavior (manual QA):**

- [ ] Mounting the DMG reveals `HappyHQ.app`
- [ ] Launching `HappyHQ.app` opens a window and loads the HappyHQ UI
- [ ] Setup flow accepts an Anthropic API key
- [ ] Chat streams responses
- [ ] File operations create files under `~/HappyHQ`
- [ ] PDF upload works (pdfium runs in-process; no binary needed)
- [ ] OAuth links open in the default browser, not in the Electron window
- [ ] `pnpm dev` running in parallel does not collide (dynamic port)
- [ ] Killing the forked server PID restarts it without losing the window

**Deferred:**

- [ ] Code signing + notarization (Apple Developer account required)
- [ ] DMG background image and branding polish
- [ ] Auto-update via `electron-updater` + GitHub Releases
- [ ] Bundle a standalone git binary (~15–30MB) to remove Xcode CLT dependency
- [ ] Windows / Linux targets

## Verification (Ralphie-runnable)

After implementation, an autonomous agent can self-verify:

```bash
# From repo root
pnpm install
pnpm --filter=@happyhq/electron build:standalone
test -f happyhq/electron/standalone/happyhq/server.js
test -d happyhq/electron/standalone/happyhq/public
test -d happyhq/electron/standalone/happyhq/prompts
test -d happyhq/electron/standalone/happyhq/q

pnpm --filter=@happyhq/electron build:ts
test -f happyhq/electron/dist/main.js

pnpm --filter=@happyhq/electron build:icon
test -f happyhq/electron/build/icon.icns

pnpm --filter=@happyhq/electron package
ls happyhq/electron/dist-packages/HappyHQ-*-arm64.dmg
```

Smoke runtime test (requires GUI session, document for manual follow-up):

```bash
cd happyhq/electron && pnpm start
```

A BrowserWindow should open, load HappyHQ, and the setup screen should render.

## Edge Cases

- **No internet** — App launches, server starts; API calls to Anthropic fail; existing error handling in chat route covers it.
- **`~/HappyHQ` on external drive** — Works when mounted; filesystem errors when not.
- **Very large `~/HappyHQ`** — Same as dev mode; no special handling.
- **Sequoia privacy prompts** — User sees "HappyHQ wants to access Documents" on first run. Expected.
- **Multiple instances** — Single-instance lock focuses the existing window.

## Constraints

- Mac-only for now (no Windows/Linux build targets in this spec)
- Requires internet for Anthropic API calls
- Requires `git` via Xcode CLT (not bundled yet)
- Node version locked to whatever Electron ships (Node 24 LTS in Electron 42)
- `librsvg` required on the build host for icon generation (`brew install librsvg`)

## Cross-References

- [Filesystem Layout](filesystem-layout.md) — `~/HappyHQ` directory structure
- [Chat](chat.md) — streaming architecture
- [Planning](planning.md) / [Working](working.md) — agent modes
- [Dockerfile](../Dockerfile) — the canonical standalone-assembly layout this spec mirrors
- [next.config.ts](../next.config.ts) — `output: 'standalone'` + Agent SDK platform tracing
- [proxy.ts](../proxy.ts) — middleware bypassed when `Q_PASSWORD` is unset

> Note: [desktop.md](desktop.md) is unrelated. That spec describes the in-app workspace metaphor (icons, draggable windows, the island). The Electron shell is the surrounding `.app`; the Desktop is the UI that runs inside it.
