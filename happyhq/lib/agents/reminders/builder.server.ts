import { assertSafeTaskSlug } from '@/lib/fs/paths'
import {
  listAllTaskItems,
  readStreamContent,
  readStreams,
  readTaskContent,
} from '@/lib/fs/read.server'
import { learningLayerPrompt } from '../prompts.server'
import { firstTimeContext } from './first-time.server'
import { generalContext } from './general.server'
import { newStreamReminder } from './new-stream.server'
import { streamManifest } from './stream-manifest.server'
import { viewingTaskReminder } from './task-open.server'
import type { ReminderContext } from './types'
import { hasUploads, uploadAwareness } from './uploads.server'
import { hasWeTransferLinks, wetransferReminder } from './wetransfer.server'

/**
 * Build all learning-mode reminders. Used by both buildReminders() and
 * the PostToolUse hook when entering learning mode.
 */
export async function buildLearningReminders(
  streamSlug: string,
): Promise<string[]> {
  const reminders: string[] = []

  // Instructions (sync, no I/O)
  reminders.push(learningLayerPrompt(streamSlug))

  // Context (situational)
  const content = await readStreamContent(streamSlug)
  const hasPlaybookContent = (content.playbookBody ?? '').trim().length > 0
  const specCount = content.specs.filter(
    (e) => e.type === 'file' && e.name.endsWith('.md'),
  ).length

  if (!hasPlaybookContent && specCount === 0 && content.samples.length === 0) {
    reminders.push(newStreamReminder(streamSlug))
  } else {
    reminders.push(streamManifest(streamSlug, content))
  }

  return reminders
}

export async function buildReminders(ctx: ReminderContext): Promise<string[]> {
  const reminders: string[] = []

  if (ctx.mode === 'learning' && ctx.streamSlug) {
    // Learning mode: composed from instruction layer + situational reminders
    const learningReminders = await buildLearningReminders(ctx.streamSlug)
    reminders.push(...learningReminders)
  } else {
    // General mode reminders
    const streams = await readStreams()
    const allItems = await listAllTaskItems()
    const tasks = ctx.streamSlug
      ? allItems.filter((t) => t.frontmatter.stream === ctx.streamSlug)
      : allItems

    const hasPlaybookContent = streams.some((s) => s.hasPlaybookContent)
    if (!hasPlaybookContent) {
      // No stream has substance yet — user is still getting started
      const now = new Date()
      const dateLine = `Today is ${now.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}.`
      reminders.push(dateLine)
      reminders.push(firstTimeContext())
    } else {
      reminders.push(
        generalContext(streams, ctx.streamSlug, tasks, {
          taskActive: !!ctx.taskSlug,
        }),
      )
    }
  }

  // Cross-mode: Viewing Task — when user has a specific task open
  if (ctx.taskSlug) {
    assertSafeTaskSlug(ctx.taskSlug)
    const task = await readTaskContent(ctx.taskSlug)
    if (task) reminders.push(viewingTaskReminder(ctx.taskSlug, task))
  }

  // Cross-mode: upload awareness
  if (hasUploads(ctx.message)) {
    reminders.push(uploadAwareness(ctx.sessionId))
  }

  // Cross-mode: WeTransfer download instructions
  if (hasWeTransferLinks(ctx.message)) {
    reminders.push(wetransferReminder())
  }

  return reminders
}
