#!/usr/bin/env npx tsx
/**
 * Upload visual evidence (screenshots) to the ralphie R2 bucket and print the
 * public URLs to stdout — one per line, ready to pipe into `gh pr comment`.
 *
 * Used by:
 *   - Ralphie's Exercise step (autonomous, after the screenshot pass)
 *   - Maintainer running it manually to attach evidence to a PR
 *
 *   npx tsx scripts/upload-evidence.ts <pr-number> <local-dir>
 *
 * Example:
 *   $ npx tsx scripts/upload-evidence.ts 220 /tmp/happyhq-dogfood/screenshots-216
 *   https://ralphie.happyhq.com/pr/220/<uuid>/01-task-page-pre-start.png
 *   https://ralphie.happyhq.com/pr/220/<uuid>/02-just-after-click.png
 *   ...
 *
 * Env (set in happyhq/.env.local — see exercising-the-ui.md "Maintainer setup"):
 *   R2_ACCOUNT_ID, R2_BUCKET, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_PUBLIC_BASE_URL
 *
 * Note on `aws4`: the Cloudflare-recommended way to talk to R2's data plane is
 * the S3-compatible API. `aws4` is a lightweight (~10KB) SigV4 request signer
 * — it doesn't talk to AWS, it just signs requests in the SigV4 format that
 * R2 also accepts. We avoid the full @aws-sdk/client-s3 (~3MB) since this
 * script only needs to PUT a handful of objects.
 */

import aws4 from 'aws4'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

// ---------------------------------------------------------------------------
// Env
// ---------------------------------------------------------------------------

loadEnvLocal()

const REQUIRED = [
  'R2_ACCOUNT_ID',
  'R2_BUCKET',
  'R2_ACCESS_KEY_ID',
  'R2_SECRET_ACCESS_KEY',
  'R2_PUBLIC_BASE_URL',
] as const

for (const k of REQUIRED) {
  if (!process.env[k]) {
    console.error(`Missing env var: ${k}`)
    console.error(
      'Configure R2 credentials in happyhq/.env.local — see exercising-the-ui.md.',
    )
    process.exit(1)
  }
}

const ACCOUNT_ID = process.env.R2_ACCOUNT_ID!
const BUCKET = process.env.R2_BUCKET!
const ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID!
const SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY!
const PUBLIC_BASE_URL = process.env.R2_PUBLIC_BASE_URL!.replace(/\/$/, '')
const HOST = `${ACCOUNT_ID}.r2.cloudflarestorage.com`

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const CONTENT_TYPES: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
}

function loadEnvLocal(): void {
  // happyhq/.env.local sits next to happyhq/scripts/. Load it manually so the
  // script doesn't need a runtime dotenv dep — Next.js loads it automatically
  // for the app, but tsx scripts don't get that treatment.
  const cwd = process.cwd()
  const candidates = [
    path.join(cwd, '.env.local'),
    path.join(cwd, '..', 'happyhq', '.env.local'),
  ]
  const envPath = candidates.find((p) => fs.existsSync(p))
  if (!envPath) return
  for (const rawLine of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
    if (m && process.env[m[1]] === undefined) {
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
    }
  }
}

async function uploadOne(key: string, localPath: string): Promise<string> {
  const body = fs.readFileSync(localPath)
  const ext = path.extname(localPath).toLowerCase()
  const contentType = CONTENT_TYPES[ext] || 'application/octet-stream'

  const opts: aws4.Request = {
    host: HOST,
    method: 'PUT',
    path: `/${BUCKET}/${key}`,
    service: 's3',
    region: 'auto',
    headers: {
      'Content-Type': contentType,
      'Content-Length': body.length.toString(),
    },
    body,
  }

  aws4.sign(opts, {
    accessKeyId: ACCESS_KEY_ID,
    secretAccessKey: SECRET_ACCESS_KEY,
  })

  const res = await fetch(`https://${HOST}${opts.path}`, {
    method: 'PUT',
    headers: opts.headers as Record<string, string>,
    body,
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`PUT ${key}: ${res.status} ${res.statusText}\n${text}`)
  }

  return `${PUBLIC_BASE_URL}/${key}`
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const [prArg, dirArg] = process.argv.slice(2)
  if (!prArg || !dirArg) {
    console.error('Usage: upload-evidence.ts <pr-number> <local-dir>')
    console.error(
      '  Uploads images to ralphie/pr/<n>/<uuid>/ and prints public URLs.',
    )
    process.exit(2)
  }
  if (!/^\d+$/.test(prArg)) {
    console.error(`PR number must be numeric, got: ${prArg}`)
    process.exit(2)
  }

  const dir = path.resolve(dirArg)
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) {
    console.error(`Not a directory: ${dir}`)
    process.exit(2)
  }

  const files = fs
    .readdirSync(dir)
    .filter((f) => CONTENT_TYPES[path.extname(f).toLowerCase()])
    .sort()

  if (files.length === 0) {
    console.error(
      `No image files in ${dir} (looking for: ${Object.keys(CONTENT_TYPES).join(', ')})`,
    )
    process.exit(2)
  }

  const runId = crypto.randomUUID()
  console.error(
    `Uploading ${files.length} file(s) to pr/${prArg}/${runId}/ on ${BUCKET}`,
  )

  for (const f of files) {
    const key = `pr/${prArg}/${runId}/${f}`
    const url = await uploadOne(key, path.join(dir, f))
    // URLs to stdout — caller can pipe into `gh pr comment --body-file`
    // or paste into a markdown body. Per-file feedback to stderr.
    console.log(url)
    console.error(`  ✓ ${f}`)
  }

  console.error(`\nPaste into a comment:\n`)
  for (const f of files) {
    console.error(
      `![${path.basename(f, path.extname(f))}](${PUBLIC_BASE_URL}/pr/${prArg}/${runId}/${f})`,
    )
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err))
  process.exit(1)
})
