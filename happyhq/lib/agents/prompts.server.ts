import { readFileSync } from 'node:fs'
import path from 'node:path'

import { HAPPYHQ_ROOT } from '@/lib/constants.server'
import { qPath } from '@/lib/fs/paths'
import {
  listDirectory,
  readStreamContent,
  readTaskContent,
} from '@/lib/fs/read.server'
import type { FileEntry, StreamContent, TaskContent } from '@/lib/fs/types'

let _generalPrompt: string | null = null
let _learningPrompt: string | null = null
let _learningLayerPrompt: string | null = null
let _planningPrompt: string | null = null
let _workingPrompt: string | null = null
let _draftingPrompt: string | null = null
function loadPrompt(filename: string): string {
  return readFileSync(path.join(process.cwd(), 'prompts', filename), 'utf-8')
}

export function generalPrompt(): string {
  if (!_generalPrompt) _generalPrompt = loadPrompt('general.md')
  return _generalPrompt.replaceAll('{{WORKSPACE_ROOT}}', HAPPYHQ_ROOT)
}

/**
 * Format a lightweight context summary of what exists in the stream.
 * Pure formatting — no I/O.
 */
export function formatStreamContext(
  content: StreamContent,
  uploads: FileEntry[],
): string {
  const hasPlaybookContent = (content.playbookBody ?? '').trim().length > 0
  const specNames = content.specs
    .filter((e) => e.type === 'file' && e.name.endsWith('.md'))
    .map((e) => e.name)
  const uploadDirs = uploads.filter((e) => e.type === 'directory')

  // Brand new stream — nothing exists yet
  if (
    !hasPlaybookContent &&
    specNames.length === 0 &&
    content.samples.length === 0 &&
    uploadDirs.length === 0
  ) {
    return 'This is a brand new stream. No playbook, specs, samples, or uploads yet.'
  }

  const lines: string[] = []

  lines.push(`Playbook: ${hasPlaybookContent ? 'exists' : 'none'}`)

  lines.push(
    specNames.length > 0 ? `Specs: ${specNames.join(', ')}` : 'Specs: none',
  )

  if (content.samples.length > 0) {
    const categories = [...new Set(content.samples.map((s) => s.category))]
    lines.push(
      `Samples: ${content.samples.length} across ${categories.join(', ')}`,
    )
  } else {
    lines.push('Samples: none')
  }

  lines.push(
    uploadDirs.length > 0
      ? `Uploads: ${uploadDirs.map((d) => d.name).join(', ')}`
      : 'Uploads: none',
  )

  return lines.join('\n')
}

/**
 * Build a lightweight context summary of what exists in the stream.
 * Injected into the system prompt so Q knows what's available
 * without scanning directories via tool calls.
 */
export async function buildStreamContext(
  streamName: string,
  sessionId: string,
): Promise<string> {
  const [content, uploads] = await Promise.all([
    readStreamContent(streamName),
    // All chats live at root — uploads are at HAPPYHQ_ROOT/.chats/{sessionId}/uploads
    listDirectory(path.join(HAPPYHQ_ROOT, '.chats', sessionId, 'uploads')),
  ])

  return formatStreamContext(content, uploads)
}

export async function learningPrompt(
  qAbsolutePath: string,
  streamName: string,
  sessionId: string,
  taskSlug?: string,
): Promise<string> {
  if (!_learningPrompt) _learningPrompt = loadPrompt('learning.md')

  const manifest = await buildStreamContext(streamName, sessionId)

  const taskContext = taskSlug
    ? `Active task: ${taskSlug}\nTask inputs are at tasks/${taskSlug}/inputs/. You can read and update them.`
    : ''

  return _learningPrompt
    .replaceAll('{{WORKSPACE_ROOT}}', HAPPYHQ_ROOT)
    .replaceAll('{{Q_PATH}}', qAbsolutePath)
    .replaceAll('{{STREAM_CONTEXT}}', manifest)
    .replaceAll('{{TASK_CONTEXT}}', taskContext)
}

/**
 * Build the learning layer prompt for injection as a <system-reminder>.
 * Pure instructions — no I/O. Context comes from separate reminders
 * (NewStream, StreamManifest, LearningTaskContext).
 */
export function learningLayerPrompt(streamName: string): string {
  if (!_learningLayerPrompt)
    _learningLayerPrompt = loadPrompt('learning-layer.md')

  return _learningLayerPrompt
    .replaceAll('{{WORKSPACE_ROOT}}', HAPPYHQ_ROOT)
    .replaceAll('{{STREAM_NAME}}', streamName)
    .replaceAll('{{STREAM_SLUG}}', streamName)
    .replaceAll('{{Q_PATH}}', qPath())
}

/**
 * Build a specific reading list for planning and working prompts.
 * Lists exact file paths the agent should read — specs, samples, inputs.
 * Omits sections that don't exist. For samples, picks the best readable
 * version of each: extracted.md > raw.txt > any text file.
 */
function buildReadingList(
  streamSlug: string,
  stream: StreamContent,
  task: TaskContent,
  taskName: string,
): string {
  const bullets: string[] = []

  // task.md — frontmatter (title, stream) and the user's task description.
  // Listed first so the agent reads the brief before specs/samples/inputs.
  bullets.push(`- tasks/${taskName}/task.md`)

  // Specs — list each by path (prefixed with stream slug since CWD is workspace root)
  const specFiles = stream.specs
    .filter((e) => e.type === 'file' && e.name.endsWith('.md'))
    .map((e) => e.name)
  for (const f of specFiles) {
    bullets.push(`- ${streamSlug}/specs/${f}`)
  }

  // Samples — group by category, prefer INDEX.md when multiple samples exist
  const samplesByCategory = new Map<string, typeof stream.samples>()
  for (const s of stream.samples) {
    const list = samplesByCategory.get(s.category) ?? []
    list.push(s)
    samplesByCategory.set(s.category, list)
  }
  const sampleBullets: string[] = []
  for (const [cat, samples] of samplesByCategory) {
    if (samples.length > 1) {
      sampleBullets.push(
        `- ${streamSlug}/samples/${cat}/INDEX.md — read this first, then choose the most relevant samples to read.`,
      )
    } else {
      for (const s of samples) {
        const readable = s.rawPath
          ? `${streamSlug}/samples/${s.category}/${s.name}/raw.txt`
          : `${streamSlug}/samples/${s.category}/${s.name}/${s.originalName}`
        sampleBullets.push(`- ${readable}`)
      }
    }
  }
  if (sampleBullets.length > 0) {
    bullets.push(...sampleBullets)
    bullets.push(
      '  Samples are examples of past work. Read for patterns, not as gospel.',
    )
  }

  // Inputs — use the FileItem's pre-computed paths so this works for both
  // upload subdirectories (`inputs/{slug}/raw.txt` or `original.{ext}`) and
  // legacy loose files like `inputs/context.md` that sit at the inputs root.
  // The legacy branch can be retired once no live task relies on a loose
  // `inputs/context.md` — see `listFileItems` in lib/fs/read.server.ts.
  for (const input of task.inputs) {
    bullets.push(`- ${input.rawPath ?? input.originalPath}`)
  }

  return bullets.join('\n')
}

export async function planningPrompt(
  streamName: string,
  taskName: string,
): Promise<string> {
  if (!_planningPrompt) _planningPrompt = loadPrompt('planning.md')
  const [streamContent, taskContent] = await Promise.all([
    readStreamContent(streamName),
    readTaskContent(taskName),
  ])

  if (!taskContent) {
    return _planningPrompt
      .replaceAll('{{WORKSPACE_ROOT}}', HAPPYHQ_ROOT)
      .replaceAll('{{TASK_NAME}}', taskName)
      .replaceAll('{{STREAM_SLUG}}', streamName)
      .replaceAll('{{READING_LIST}}', '(Task not found on disk.)')
      .replaceAll('{{PLAYBOOK}}', streamContent.playbook ?? '')
  }

  const readingList = buildReadingList(
    streamName,
    streamContent,
    taskContent,
    taskName,
  )
  const playbook = streamContent.playbook ?? ''
  return _planningPrompt
    .replaceAll('{{WORKSPACE_ROOT}}', HAPPYHQ_ROOT)
    .replaceAll('{{TASK_NAME}}', taskName)
    .replaceAll('{{STREAM_SLUG}}', streamName)
    .replaceAll('{{READING_LIST}}', readingList)
    .replaceAll('{{PLAYBOOK}}', playbook)
}

export async function workingPrompt(
  streamName: string,
  taskName: string,
): Promise<string> {
  if (!_workingPrompt) _workingPrompt = loadPrompt('working.md')
  const [streamContent, taskContent] = await Promise.all([
    readStreamContent(streamName),
    readTaskContent(taskName),
  ])

  let readingList = taskContent
    ? buildReadingList(streamName, streamContent, taskContent, taskName)
    : '(Task not found on disk.)'

  // Working mode also reads plan.md (planning doesn't — it writes it)
  if (taskContent) {
    readingList += `\n- tasks/${taskName}/plan.md`
  }

  return _workingPrompt
    .replaceAll('{{WORKSPACE_ROOT}}', HAPPYHQ_ROOT)
    .replaceAll('{{STREAM_NAME}}', streamName)
    .replaceAll('{{STREAM_SLUG}}', streamName)
    .replaceAll('{{TASK_NAME}}', taskName)
    .replaceAll('{{READING_LIST}}', readingList)
}

export function draftingPrompt(): string {
  if (!_draftingPrompt) _draftingPrompt = loadPrompt('drafting.md')
  return _draftingPrompt
}
