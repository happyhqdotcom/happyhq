import type { TaskContent } from '@/lib/fs/types'

/**
 * Reminder: Viewing Task
 *
 * Conditions: User has a task open on the desktop (any mode).
 * Why: Q needs to know what task it's looking at to orient itself —
 *      without this, Q searches the filesystem and can find the wrong task.
 *
 * Example (completed task with outputs):
 *   ## Viewing Task
 *   The user has "Grandma's Dutch Apple Pie Recipe" open, a completed task
 *   in the apple-pies stream. The task has context, a plan, and produced
 *   outputs (recipe-card.md, ingredient-sourcing-guide.md). The task
 *   directory is tasks/grandmas-dutch-apple/.
 *
 * Example (running task with file inputs):
 *   ## Viewing Task
 *   The user has "Holiday Pie Menu" open in the apple-pies stream, currently
 *   running. The task has context including flavor-profiles and crust-options,
 *   and a plan. The task directory is tasks/holiday-pie-menu/.
 *
 * Example (fresh task):
 *   ## Viewing Task
 *   The user has "New Pie Experiment" open. No content yet. The task
 *   directory is tasks/new-pie-experiment/.
 */
export function viewingTaskReminder(
  taskSlug: string,
  task: TaskContent,
): string {
  const title = task.frontmatter?.title ?? taskSlug
  const stream = task.frontmatter?.stream

  // --- Opening: name + stream + status ---
  let opening = `The user has "${title}" open`
  const status = humanStatus(task)
  if (stream && status) {
    opening += `, ${status} in the ${stream} stream.`
  } else if (stream) {
    opening += ` in the ${stream} stream.`
  } else if (status) {
    opening += `, ${status}.`
  } else {
    opening += '.'
  }

  // --- What exists: context, plan, outputs ---
  const hasContext = !!task.description || task.inputs.length > 0
  const hasPlan = !!task.plan
  const hasOutputs = task.outputs.length > 0

  let contentPhrase = ''
  if (!hasContext && !hasPlan && !hasOutputs) {
    contentPhrase = 'No content yet.'
  } else {
    const parts: string[] = []

    if (hasContext) {
      const inputNames = task.inputs.slice(0, 5).map((i) => i.title ?? i.name)
      if (inputNames.length > 0) {
        const overflow =
          task.inputs.length > 5 ? ` and ${task.inputs.length - 5} more` : ''
        parts.push(`context including ${inputNames.join(', ')}${overflow}`)
      } else {
        parts.push('context')
      }
    }

    if (hasPlan) {
      parts.push('a plan')
    }

    if (hasOutputs) {
      const outputNames = task.outputs
        .filter((o) => o.type === 'file')
        .slice(0, 5)
        .map((o) => o.name)
      if (outputNames.length > 0) {
        const overflow =
          task.outputs.filter((o) => o.type === 'file').length > 5
            ? ` and more`
            : ''
        parts.push(`produced outputs (${outputNames.join(', ')}${overflow})`)
      } else {
        parts.push('produced outputs')
      }
    }

    contentPhrase = `The task has ${joinParts(parts)}.`
  }

  // --- Directory path ---
  const dirLine = `The task directory is tasks/${taskSlug}/.`

  return `## Viewing Task\n${opening} ${contentPhrase} ${dirLine}`
}

/** Join parts with commas and "and" before the last item. */
function joinParts(parts: string[]): string {
  if (parts.length === 1) return parts[0]
  if (parts.length === 2) return `${parts[0]} and ${parts[1]}`
  return `${parts.slice(0, -1).join(', ')}, and ${parts[parts.length - 1]}`
}

/** Map task state to a human-readable status phrase. */
function humanStatus(task: TaskContent): string | null {
  if (task.frontmatter?.completedAt) return 'a completed task'
  if (task.frontmatter?.pending)
    return `a task needing ${task.frontmatter.pending}`
  if (task.run?.error) return `a failed task (${task.run.error})`
  if (task.run?.status === 'stopped' && task.run?.stopReason === 'budget')
    return 'a paused task (usage limit)'
  if (task.run?.status === 'stopped') return 'a stopped task'
  if (task.run?.status === 'working') return 'currently running'
  if (task.run?.status === 'plan_ready') return 'plan ready'
  if (task.run?.status === 'planning') return 'currently planning'
  return null
}
