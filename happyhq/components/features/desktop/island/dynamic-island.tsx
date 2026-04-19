import { AskUserConfirmation } from '@/components/features/chat/interaction/ask-user-confirmation'
import { QuestionOptions } from '@/components/features/chat/interaction/question-options'
import { useActivitySteps, useRunActions } from '@/stores/desktopStore'
import { useParams } from 'next/navigation'
import { useChatActions } from '../hooks/use-chat-actions'
import { useActiveTask, useTaskStatus } from '../hooks/use-desktop-data'
import {
  usePendingConfirmation,
  usePendingQuestion,
} from '../providers/chat-session-provider'
import { IslandShell } from './island-shell'
import { TaskWorkingContent } from './modes/working'

export function DynamicIsland() {
  // ── Chat state from chatStore (for interactions) ────────────────────
  const pendingQuestion = usePendingQuestion()
  const pendingConfirmation = usePendingConfirmation()
  const chatActions = useChatActions()

  // ── Task state from desktopStore ──────────────────────────────────
  const activeTaskSlug = useParams<{ task?: string }>().task
  const activeTaskTitle = useActiveTask()?.frontmatter.title ?? null
  const taskStatus = useTaskStatus()
  const activitySteps = useActivitySteps()
  const runActions = useRunActions()

  // ── Task mode ─────────────────────────────────────────────────────
  if (activeTaskSlug) {
    const slug = activeTaskSlug
    const status = taskStatus
    const onStop = () => runActions.stop?.()
    const isStopping = runActions.isStopping

    // Pending confirmation or question takes priority
    if (pendingConfirmation) {
      return (
        <AskUserConfirmation
          toolName={pendingConfirmation.toolName}
          input={pendingConfirmation.input}
          onAllow={chatActions.allowConfirmation}
          onDeny={chatActions.denyConfirmation}
        />
      )
    }

    if (pendingQuestion) {
      return (
        <QuestionOptions
          questions={pendingQuestion.questions}
          onAnswer={chatActions.answerQuestion}
          onCancel={chatActions.cancelQuestion}
        />
      )
    }

    // Plan ready — no island (approval lives on task card + plan window footer).
    // Pending questions/confirmations are checked above and still render.
    if (status === 'plan_ready') {
      return null
    }

    // No run yet — no island (card has Start Task footer + billing warning).
    if (status === null) {
      return null
    }

    // Run finished — no island (panel has all actions + billing notices).
    if (status === 'completed' || status === 'stopped') {
      return null
    }

    // Active run (planning or running)
    return (
      <IslandShell>
        <TaskWorkingContent
          slug={slug}
          title={activeTaskTitle}
          status={status}
          onStop={onStop}
          isStopping={isStopping}
          activitySteps={activitySteps}
        />
      </IslandShell>
    )
  }

  // ── No task open — island is hidden ──────────────────────────────
  return null
}
