import type { Dirent } from 'node:fs'
import { readdir, readFile, stat } from 'node:fs/promises'
import path from 'node:path'

import { HAPPYHQ_ROOT } from '@/lib/constants.server'

import { assessTextQuality } from './assess-quality.server'
import { safePath, streamPath, taskPath, tasksDir } from './paths'
import { parsePlaybookMd, readPlaybookMd } from './playbook-md.server'
import { readTaskMd } from './task-md.server'
import type {
  ChatEntry,
  ChatItem,
  FileEntry,
  FileItem,
  RunInfo,
  SampleEntry,
  SampleType,
  StreamContent,
  StreamEntry,
  TaskContent,
  TaskItem,
} from './types'

/** Directory names at ~/HappyHQ/ root that are not streams. */
export const RESERVED_ROOT_DIRS = new Set(['tasks', '.chats', 'task'])

/** Parse the title field from a raw .meta.json string. Returns null on missing/malformed. */
function parseTitle(raw: string | null): string | null {
  if (!raw) return null
  try {
    return JSON.parse(raw).title ?? null
  } catch {
    return null
  }
}

/**
 * Read a text file within ~/HappyHQ/.
 * Returns null for missing files (ENOENT), throws for other errors.
 */
export async function readTextFile(filePath: string): Promise<string | null> {
  try {
    return await readFile(safePath(filePath), 'utf-8')
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw error
  }
}

/**
 * List a directory within ~/HappyHQ/.
 * Returns FileEntry[] with paths relative to HAPPYHQ_ROOT.
 * Returns empty array for missing directories (ENOENT), throws for other errors.
 */
export async function listDirectory(dirPath: string): Promise<FileEntry[]> {
  const safeDir = safePath(dirPath)
  try {
    const entries = await readdir(safeDir, { withFileTypes: true })
    return await Promise.all(
      entries
        .filter((entry) => !entry.name.startsWith('.'))
        .map(async (entry) => {
          const fullPath = path.join(safeDir, entry.name)
          const isDir = entry.isDirectory()
          const [fileStat, metaRaw] = await Promise.all([
            stat(fullPath),
            isDir
              ? readTextFile(path.join(fullPath, '.meta.json'))
              : Promise.resolve(null),
          ])
          return {
            name: entry.name,
            path: path.relative(HAPPYHQ_ROOT, fullPath),
            type: isDir ? 'directory' : 'file',
            title: parseTitle(metaRaw),
            modifiedAt: fileStat.mtime.toISOString(),
          } as FileEntry
        }),
    )
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
    throw error
  }
}

/**
 * Parse INDEX.md into a map of sample slug → description (first line of body).
 */
export function parseIndexDescriptions(
  markdown: string,
): Record<string, string> {
  const descriptions: Record<string, string> = {}
  const sections = markdown.split(/^## /m).slice(1)
  for (const section of sections) {
    const match = section.match(/^([^\s/]+)\/?/)
    if (!match) continue
    const slug = match[1]
    const body = section.slice(match[0].length).trim()
    const firstLine = body.split('\n')[0]?.trim() ?? ''
    if (firstLine) descriptions[slug] = firstLine
  }
  return descriptions
}

/** Extract the YAML frontmatter block (between --- delimiters). */
function extractFrontmatter(content: string): string | null {
  const match = content.match(/^---\n([\s\S]*?)\n---/)
  return match ? match[1] : null
}

/** Extract the first `# heading` from markdown content. */
function extractTitle(content: string): string | null {
  // Prefer frontmatter title (for link-only web inputs)
  const fm = extractFrontmatter(content)
  if (fm) {
    const fmMatch = fm.match(/^title:\s+"(.+)"$/m)
    if (fmMatch) return fmMatch[1].trim()
  }
  // Fall back to first # heading (for full-content web inputs)
  const match = content.match(/^#\s+(.+)$/m)
  return match ? match[1].trim() : null
}

/** Extract the `url:` value from YAML frontmatter. */
function extractFrontmatterUrl(content: string): string | null {
  const fm = extractFrontmatter(content)
  if (!fm) return null
  const match = fm.match(/^url:\s+(.+)$/m)
  return match ? match[1].trim() : null
}

/** Extract the `favicon:` value from YAML frontmatter. */
function extractFrontmatterFavicon(content: string): string | null {
  const fm = extractFrontmatter(content)
  if (!fm) return null
  const match = fm.match(/^favicon:\s+(.+)$/m)
  return match ? match[1].trim() : null
}

/**
 * Walk inputs/web/{domain}/{page}.md and return FileItem[] for web source inputs.
 * Each .md file under a domain directory becomes a FileItem with
 * name = "web/{domain}" so buildReadingList naturally resolves the path.
 * Title is extracted from the first # heading in the file.
 */
async function listWebInputItems(webDir: string): Promise<FileItem[]> {
  const safeWebDir = safePath(webDir)
  let domainDirs: Dirent<string>[]
  try {
    domainDirs = await readdir(safeWebDir, { withFileTypes: true })
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
    throw error
  }

  const items: FileItem[] = []
  for (const domainDir of domainDirs) {
    if (!domainDir.isDirectory() || domainDir.name.startsWith('.')) continue
    const domainPath = path.join(safeWebDir, domainDir.name)
    const files = await readdir(domainPath)
    for (const file of files) {
      if (!file.endsWith('.md') || file.startsWith('.')) continue
      const filePath = path.join(domainPath, file)
      const [fileStat, content] = await Promise.all([
        stat(filePath),
        readFile(filePath, 'utf-8'),
      ])
      items.push({
        name: `web/${domainDir.name}`,
        title: extractTitle(content),
        originalPath: path.relative(HAPPYHQ_ROOT, filePath),
        originalName: file,
        rawPath: null,
        sourceUrl: extractFrontmatterUrl(content),
        favicon: extractFrontmatterFavicon(content),
        modifiedAt: fileStat.mtime.toISOString(),
      })
    }
  }
  return items
}

/**
 * Walk a directory of slug folders ({slug}/original.{ext} + extracted form)
 * and return a flat FileItem[] sorted newest-first.
 * Each file type has its own agent-readable extracted form:
 *   PDF → raw.txt, EML → email.json
 * Skips non-directories and folders without an original.* file.
 * Returns empty array for missing directories (ENOENT).
 */
export async function listFileItems(dir: string): Promise<FileItem[]> {
  const safeDir = safePath(dir)

  let dirEntries: Dirent<string>[]
  try {
    dirEntries = await readdir(safeDir, { withFileTypes: true })
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
    throw error
  }

  const folders = dirEntries.filter(
    (e) => e.isDirectory() && !e.name.startsWith('.'),
  )

  const entries = await Promise.all(
    folders.map(async (folder) => {
      // web/ subdirectory: walk domain → page.md (two levels deep)
      if (folder.name === 'web') {
        return listWebInputItems(path.join(safeDir, 'web'))
      }

      const folderPath = path.join(safeDir, folder.name)
      const files = await readdir(folderPath)

      const originalFile = files.find((f) => f.startsWith('original.'))
      if (!originalFile) return null

      // Agent-readable extracted form: content.md (DOCX), raw.txt (PDF), or email.json (EML)
      const extractedFile = files.includes('content.md')
        ? 'content.md'
        : files.includes('raw.txt')
          ? 'raw.txt'
          : files.includes('email.json')
            ? 'email.json'
            : null
      const [fileStat, metaRaw, extractedContent] = await Promise.all([
        stat(path.join(folderPath, originalFile)),
        readTextFile(path.join(folderPath, '.meta.json')),
        // Read extracted text for quality assessment (cheap — garbage files are tiny)
        extractedFile && extractedFile !== 'email.json'
          ? readTextFile(path.join(folderPath, extractedFile))
          : Promise.resolve(null),
      ])

      // Assess text quality for extracted content (PDF raw.txt, DOCX content.md)
      const assessment =
        extractedContent != null ? assessTextQuality(extractedContent) : null

      return {
        name: folder.name,
        title: parseTitle(metaRaw),
        originalPath: path.relative(
          HAPPYHQ_ROOT,
          path.join(folderPath, originalFile),
        ),
        originalName: originalFile,
        rawPath: extractedFile
          ? path.relative(HAPPYHQ_ROOT, path.join(folderPath, extractedFile))
          : null,
        sourceUrl: null,
        favicon: null,
        modifiedAt: fileStat.mtime.toISOString(),
        quality: assessment?.quality ?? null,
      } as FileItem
    }),
  )

  // Also pick up loose files (e.g. context.md) that sit directly in the
  // directory rather than inside a slug subdirectory.
  const looseFiles = dirEntries.filter(
    (e) => e.isFile() && !e.name.startsWith('.'),
  )
  const looseEntries = await Promise.all(
    looseFiles.map(async (file) => {
      const filePath = path.join(safeDir, file.name)
      const fileStat = await stat(filePath)
      const baseName = file.name.replace(/\.[^.]+$/, '')
      return {
        name: baseName,
        title: null,
        originalPath: path.relative(HAPPYHQ_ROOT, filePath),
        originalName: file.name,
        rawPath: null,
        sourceUrl: null,
        favicon: null,
        modifiedAt: fileStat.mtime.toISOString(),
      } as FileItem
    }),
  )

  const items = [...entries.flat(), ...looseEntries].filter(
    (e): e is FileItem => e !== null,
  )
  items.sort(
    (a, b) =>
      new Date(b.modifiedAt).getTime() - new Date(a.modifiedAt).getTime(),
  )
  return items
}

/**
 * Walk the samples/ directory two levels deep, parse INDEX.md files,
 * and return a flat SampleEntry[] sorted newest-first plus all type directories.
 * Returns empty arrays for missing directories (ENOENT).
 */
export async function listSamples(
  samplesDir: string,
): Promise<{ samples: SampleEntry[]; sampleTypes: SampleType[] }> {
  const safeSamplesDir = safePath(samplesDir)

  let categoryEntries: Dirent<string>[]
  try {
    categoryEntries = await readdir(safeSamplesDir, { withFileTypes: true })
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT')
      return { samples: [], sampleTypes: [] }
    throw error
  }

  const categories = categoryEntries.filter(
    (e) => e.isDirectory() && !e.name.startsWith('.'),
  )

  const sampleTypes: SampleType[] = []
  const nested = await Promise.all(
    categories.map(async (cat) => {
      const catDir = path.join(safeSamplesDir, cat.name)

      const [indexMd, metaRaw, fileItems] = await Promise.all([
        readTextFile(path.join(catDir, 'INDEX.md')),
        readTextFile(path.join(catDir, '.meta.json')),
        listFileItems(catDir),
      ])

      const categoryTitle = parseTitle(metaRaw)
      sampleTypes.push({ slug: cat.name, title: categoryTitle })
      const descriptions = indexMd ? parseIndexDescriptions(indexMd) : {}

      return fileItems.map(
        (item) =>
          ({
            ...item,
            category: cat.name,
            categoryTitle,
            description: descriptions[item.name] ?? '',
          }) as SampleEntry,
      )
    }),
  )

  const flat = nested.flat()
  flat.sort((a, b) => {
    const dt =
      new Date(b.modifiedAt).getTime() - new Date(a.modifiedAt).getTime()
    return dt !== 0 ? dt : a.name.localeCompare(b.name)
  })
  return { samples: flat, sampleTypes }
}

/**
 * Read and parse chat.json for a given chat session.
 * All chats live at root (~/.chats/{sessionId}/).
 * Returns null if the file is missing or malformed.
 */
export async function readChatJson(
  sessionId: string,
): Promise<Record<string, unknown> | null> {
  const chatDir = safePath(path.join(HAPPYHQ_ROOT, '.chats', sessionId))
  const raw = await readTextFile(path.join(chatDir, 'chat.json'))
  if (!raw) return null
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

/**
 * List chat sessions from root .chats/ directory, optionally filtered by stream.
 * When streamName is provided, only returns chats whose chat.json has
 * a matching streamSlug field.
 * Returns ChatEntry[] sorted newest-first by birthtime.
 * Returns empty array if .chats/ does not exist.
 */
export async function listChats(streamName: string): Promise<ChatEntry[]> {
  const chatsDir = safePath(path.join(HAPPYHQ_ROOT, '.chats'))
  try {
    const entries = await readdir(chatsDir, { withFileTypes: true })
    const chats = await Promise.all(
      entries
        .filter((entry) => entry.isDirectory())
        .map(async (entry) => {
          const chatDir = path.join(chatsDir, entry.name)
          const [dirStat, chatJsonRaw] = await Promise.all([
            stat(chatDir),
            readTextFile(path.join(chatDir, 'chat.json')),
          ])
          let name: string | null = null
          let chatStreamSlug: string | null = null
          if (chatJsonRaw !== null) {
            try {
              const parsed = JSON.parse(chatJsonRaw)
              name = parsed.name ?? null
              chatStreamSlug = parsed.streamSlug ?? null
            } catch {
              // Malformed chat.json — use null name
            }
          }
          // Filter: only include chats affiliated with the requested stream
          if (chatStreamSlug !== streamName) return null
          return {
            sessionId: entry.name,
            name,
            createdAt: dirStat.birthtime.toISOString(),
          } as ChatEntry
        }),
    )
    const filtered = chats.filter((c): c is ChatEntry => c !== null)
    filtered.sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    )
    return filtered
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
    throw error
  }
}

/**
 * Find which stream a chat session belongs to by reading its chat.json.
 * All chats live at root — stream affiliation is in the streamSlug field.
 * Returns null if the session doesn't exist.
 */
export async function findStreamForSession(
  sessionId: string,
): Promise<{ streamName: string | null; chat: ChatEntry } | null> {
  const chatDir = safePath(path.join(HAPPYHQ_ROOT, '.chats', sessionId))

  let dirStat
  try {
    dirStat = await stat(chatDir)
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw error
  }

  const chatJsonRaw = await readTextFile(path.join(chatDir, 'chat.json'))
  let name: string | null = null
  let streamSlug: string | null = null
  if (chatJsonRaw) {
    try {
      const parsed = JSON.parse(chatJsonRaw)
      name = parsed.name ?? null
      streamSlug = parsed.streamSlug ?? null
    } catch {
      // Malformed chat.json
    }
  }

  return {
    streamName: streamSlug,
    chat: { sessionId, name, createdAt: dirStat.birthtime.toISOString() },
  }
}

/**
 * List all tasks from root tasks/ directory.
 * Returns TaskItem[] sorted newest-first by createdAt.
 */
export async function listAllTaskItems(): Promise<TaskItem[]> {
  const items: TaskItem[] = []

  const rootDir = tasksDir()
  try {
    const entries = await readdir(rootDir, { withFileTypes: true })
    await Promise.all(
      entries
        .filter((entry) => entry.isDirectory())
        .map(async (entry) => {
          const taskDir = path.join(rootDir, entry.name)
          const [parsed, runJson] = await Promise.all([
            readTaskMd(taskDir),
            readTextFile(path.join(taskDir, '.run.json')),
          ])
          if (!parsed) return

          let run: RunInfo | null = null
          if (runJson) {
            try {
              run = JSON.parse(runJson) as RunInfo
            } catch {
              // Malformed .run.json — leave as null
            }
          }

          items.push({
            slug: entry.name,
            frontmatter: parsed.frontmatter,
            run,
            description: parsed.body?.trim() || null,
          })
        }),
    )
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    // tasks/ directory doesn't exist yet — that's fine
  }

  // Sort newest-first by createdAt, tiebreak by slug for deterministic order
  items.sort((a, b) => {
    const aTime = new Date(a.frontmatter.createdAt).getTime()
    const bTime = new Date(b.frontmatter.createdAt).getTime()
    if (bTime !== aTime) return bTime - aTime
    return a.slug.localeCompare(b.slug)
  })

  return items
}

/**
 * List all chats from root .chats/ directory with stream affiliation.
 * All chats live at root — stream affiliation is in chat.json's streamSlug field.
 * Sorted newest-first by creation time.
 */
export async function listAllChats(): Promise<ChatItem[]> {
  const chatsDir = safePath(path.join(HAPPYHQ_ROOT, '.chats'))
  try {
    const entries = await readdir(chatsDir, { withFileTypes: true })
    const items = await Promise.all(
      entries
        .filter((entry) => entry.isDirectory())
        .map(async (entry) => {
          const chatDir = path.join(chatsDir, entry.name)
          const [dirStat, chatJsonRaw] = await Promise.all([
            stat(chatDir),
            readTextFile(path.join(chatDir, 'chat.json')),
          ])
          let name: string | null = null
          let streamSlug: string | null = null
          if (chatJsonRaw !== null) {
            try {
              const parsed = JSON.parse(chatJsonRaw)
              name = parsed.name ?? null
              streamSlug = parsed.streamSlug ?? null
            } catch {
              // Malformed chat.json — use null name
            }
          }
          return {
            streamName: streamSlug,
            sessionId: entry.name,
            title: name,
            createdAt: dirStat.birthtime.toISOString(),
          } as ChatItem
        }),
    )
    items.sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    )
    return items
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
    throw error
  }
}

/**
 * Assemble StreamContent from the filesystem for a given stream.
 * Missing files/dirs produce null or empty arrays, never errors.
 */
export async function readStreamContent(
  streamName: string,
): Promise<StreamContent> {
  const streamDir = safePath(streamPath(streamName))
  const [playbookRaw, specs, samplesResult] = await Promise.all([
    readTextFile(path.join(streamDir, 'playbook.md')),
    listDirectory(path.join(streamDir, 'specs')),
    listSamples(path.join(streamDir, 'samples')),
  ])

  // Parse playbook frontmatter if present; for legacy files extract H1 as title
  const parsed = playbookRaw ? parsePlaybookMd(playbookRaw) : null
  let playbookTitle: string | null = null
  let playbookBody: string | null = playbookRaw
  if (parsed) {
    playbookTitle = parsed.frontmatter.title
    playbookBody = parsed.body
  } else if (playbookRaw) {
    // Legacy: extract leading # heading as title, rest as body
    const h1Match = playbookRaw.match(/^# (.+)\n+/)
    if (h1Match) {
      playbookTitle = h1Match[1].trim()
      playbookBody = playbookRaw.slice(h1Match[0].length)
    }
  }

  return {
    playbook: playbookRaw,
    playbookTitle,
    playbookBody,
    specs,
    samples: samplesResult.samples,
    sampleTypes: samplesResult.sampleTypes,
  }
}

/**
 * Assemble TaskContent for a root task (~/HappyHQ/tasks/{slug}).
 * Reads task content from the root tasks/{slug}/ directory.
 */
export async function readTaskContent(
  taskSlug: string,
): Promise<TaskContent | null> {
  const taskDir = safePath(taskPath(taskSlug))

  try {
    await stat(taskDir)
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw error
  }

  const [taskMd, plan, runJson, fallbackDescription, inputs, working, outputs] =
    await Promise.all([
      readTaskMd(taskDir),
      readTextFile(path.join(taskDir, 'plan.md')),
      readTextFile(path.join(taskDir, '.run.json')),
      readTextFile(path.join(taskDir, 'inputs', 'context.md')),
      listFileItems(path.join(taskDir, 'inputs')),
      listDirectory(path.join(taskDir, 'working')),
      listDirectory(path.join(taskDir, 'outputs')),
    ])

  const description = taskMd?.body?.trim() || fallbackDescription

  let run: RunInfo | null = null
  if (runJson !== null) {
    try {
      run = JSON.parse(runJson) as RunInfo
      // Normalize legacy status values from before stopReason migration
      const s = run.status as string
      if (s === 'usage_limited' || s === 'paused') {
        run.status = 'stopped'
        run.stoppedDuring ??= 'working'
        run.stopReason ??= 'budget'
      } else if (s === 'running') {
        run.status = 'working'
      }
    } catch {
      // Malformed .run.json — return null rather than crashing.
    }
  }

  return {
    frontmatter: taskMd?.frontmatter ?? null,
    plan,
    description,
    run,
    inputs,
    working,
    outputs,
  }
}

/**
 * Check if a stream directory exists under ~/HappyHQ/.
 * Returns true if the directory exists, false for ENOENT, throws for other errors.
 */
export async function streamExists(streamName: string): Promise<boolean> {
  const dir = safePath(streamPath(streamName))
  try {
    const s = await stat(dir)
    return s.isDirectory()
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false
    throw error
  }
}

/**
 * List top-level stream directories under ~/HappyHQ/.
 * Excludes dot-prefixed directories (e.g., .git).
 * Returns newest-first by birthtime. Empty array if ~/HappyHQ/ doesn't exist.
 */
export async function readStreams(): Promise<StreamEntry[]> {
  try {
    const entries = await readdir(HAPPYHQ_ROOT, { withFileTypes: true })
    const streams = await Promise.all(
      entries
        .filter(
          (entry) =>
            entry.isDirectory() &&
            !entry.name.startsWith('.') &&
            !RESERVED_ROOT_DIRS.has(entry.name),
        )
        .map(async (entry) => {
          const fullPath = path.join(HAPPYHQ_ROOT, entry.name)
          const [dirStat, playbookParsed] = await Promise.all([
            stat(fullPath),
            readPlaybookMd(fullPath),
          ])
          return {
            id: '', // Assigned client-side by streamsStore
            name: entry.name,
            title: playbookParsed?.frontmatter.title ?? null,
            createdAt: dirStat.birthtime.toISOString(),
            hasPlaybookContent: (playbookParsed?.body ?? '').trim().length > 0,
          } as StreamEntry
        }),
    )
    // Sort newest first by birthtime
    streams.sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    )
    return streams
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
    throw error
  }
}
