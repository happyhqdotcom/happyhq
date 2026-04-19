import type { StreamEntry, TaskItem } from '@/lib/fs/types'

/**
 * Reminder: General Context
 *
 * Conditions: General mode, every turn.
 * Why: Q has no other way to know the date, what streams exist, or which
 *      tasks need attention. Without this, Q asks the user basic questions
 *      it should already know the answers to.
 *
 * When a task is active, simplifies to a lightweight workspace headline —
 * the Viewing Task reminder carries the detail.
 *
 * Example (full — no task active):
 *   Today is April 3, 2026.
 *   Streams: apple-pies (Apple Pies), pie-reviews (Pie Reviews)
 *   Active stream: apple-pies
 *   3 tasks, all on track.
 *
 * Example (simplified — task active):
 *   Today is April 3, 2026. Workspace: 2 streams (apple-pies, pie-reviews), 3 tasks.
 */
export function generalContext(
  streams: StreamEntry[],
  activeStreamSlug: string | null,
  tasks: TaskItem[],
  options?: { taskActive?: boolean },
): string {
  const now = new Date()
  const date = `Today is ${now.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}.`

  // Simplified form when a task is active — Viewing Task carries the detail
  if (options?.taskActive) {
    if (streams.length === 0 && tasks.length === 0) return date
    const parts: string[] = []
    const streamNames = streams.map((s) => s.name).join(', ')
    if (streams.length > 0)
      parts.push(
        `${streams.length} stream${streams.length === 1 ? '' : 's'} (${streamNames})`,
      )
    if (tasks.length > 0)
      parts.push(`${tasks.length} task${tasks.length === 1 ? '' : 's'}`)
    return `${date} Workspace: ${parts.join(', ')}.`
  }

  // Full form
  const lines: string[] = [date]

  if (streams.length > 0) {
    const names = streams.map((s) =>
      s.title ? `${s.name} (${s.title})` : s.name,
    )
    lines.push(`Streams: ${names.join(', ')}`)
  }

  if (activeStreamSlug) {
    lines.push(`Active stream: ${activeStreamSlug}`)
  }

  // Task headline — count + anything needing attention
  if (tasks.length > 0) {
    const needsAttention = tasks.filter(
      (t) => t.run?.status === 'stopped' || t.run?.error,
    )
    if (needsAttention.length > 0) {
      const details = needsAttention
        .map((t) => {
          const status = t.run?.error
            ? 'failed'
            : t.run?.stopReason === 'budget'
              ? 'paused (budget)'
              : (t.run?.status ?? 'unknown')
          return `${t.slug} (${status})`
        })
        .join(', ')
      lines.push(
        `${tasks.length} task${tasks.length === 1 ? '' : 's'}. ${needsAttention.length} need${needsAttention.length === 1 ? 's' : ''} attention: ${details}.`,
      )
    } else {
      lines.push(`${tasks.length} task${tasks.length === 1 ? '' : 's'}.`)
    }
  }

  return lines.join('\n')
}
