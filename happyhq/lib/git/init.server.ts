import { readConfigSync } from '@/lib/config/config.server'
import { HAPPYHQ_ROOT } from '@/lib/constants.server'
import { execFileSync, execSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const GITIGNORE_CONTENT = `.DS_Store
Thumbs.db
.chats/
.logs/
**/.run.json
**/.meta.json
.settings.json
`

export function initializeGitRepo(): void {
  // 1. Create ~/HappyHQ/ if it doesn't exist
  mkdirSync(HAPPYHQ_ROOT, { recursive: true })

  // 2. git init (idempotent — succeeds if repo already exists)
  execSync('git init', { cwd: HAPPYHQ_ROOT, stdio: 'pipe' })

  // 3. Write .gitignore (overwrite is fine — content is deterministic)
  writeFileSync(
    path.join(HAPPYHQ_ROOT, '.gitignore'),
    GITIGNORE_CONTENT,
    'utf-8',
  )

  // 4. Configure local author from config (falls back to Q <q@happyhq.com>)
  const config = readConfigSync()
  const authorName = config.git?.authorName || 'Q'
  const authorEmail = config.git?.authorEmail || 'q@happyhq.com'
  execFileSync('git', ['config', 'user.name', authorName], {
    cwd: HAPPYHQ_ROOT,
    stdio: 'pipe',
  })
  execFileSync('git', ['config', 'user.email', authorEmail], {
    cwd: HAPPYHQ_ROOT,
    stdio: 'pipe',
  })

  // 5. Commit .gitignore
  try {
    execSync('git rev-parse HEAD', { cwd: HAPPYHQ_ROOT, stdio: 'pipe' })
    // HEAD exists — commit .gitignore if it changed (e.g. new ignore rules)
    try {
      execSync('git add .gitignore && git diff --cached --quiet --exit-code', {
        cwd: HAPPYHQ_ROOT,
        stdio: 'pipe',
      })
    } catch {
      execSync('git commit -m "System update"', {
        cwd: HAPPYHQ_ROOT,
        stdio: 'pipe',
      })
    }
  } catch {
    // No commits yet — stage .gitignore and create initial commit
    execSync('git add .gitignore', { cwd: HAPPYHQ_ROOT, stdio: 'pipe' })
    execSync('git commit -m "Start HappyHQ"', {
      cwd: HAPPYHQ_ROOT,
      stdio: 'pipe',
    })
  }
}
