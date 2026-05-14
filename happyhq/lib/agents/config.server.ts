import type {
  McpSdkServerConfigWithInstance,
  Options,
} from '@anthropic-ai/claude-agent-sdk'

import { waitForConfirmation } from '@/lib/chat/pending-confirmations'
import { waitForAnswer } from '@/lib/chat/pending-questions'
import type { AskUserQuestionInput, ChatStreamEvent } from '@/lib/chat/types'
import { readConfig } from '@/lib/config/config.server'
import { resolveConfig } from '@/lib/config/defaults'
import type { ThinkingMode } from '@/lib/config/types'
import { MODEL_IDS } from '@/lib/constants'
import { HAPPYHQ_ROOT } from '@/lib/constants.server'
import { streamPath, taskPath } from '@/lib/fs/paths'
import { updateTaskMdPending } from '@/lib/fs/task-md.server'
import type { RunInfo } from '@/lib/fs/types'
import { persistWebInput } from '@/lib/fs/web-input.server'
import { log } from '@/lib/log.server'
import { updateRunInfoPendingQuestions } from '@/lib/run/loop.server'

import {
  createAutomatedCanUseTool,
  isSafeBashCommand,
} from './bash-safety.server'
import {
  discoveryPrompt,
  draftingPrompt,
  generalPrompt,
  planningPrompt,
  workingPrompt,
} from './prompts.server'
import { buildLearningReminders } from './reminders.server'
import { createQsMcpServer, MCP_SERVER_NAME, mcpToolName } from './tools.server'

/**
 * Env vars that suppress Claude Code CLI harness behaviors we don't want
 * leaking into our agents: project-memory auto-loading (MEMORY.md) and
 * deferred tool loading (ToolSearch). Both default ON in CLI 2.1.59+ and
 * are not covered by `settingSources: []`. Caller env merges first; the
 * harness flags win to prevent an upstream caller from re-enabling them.
 */
function agentEnv(
  override?: Record<string, string | undefined>,
): Record<string, string | undefined> {
  // The SDK passes this verbatim as the spawned process's env (no merge with
  // process.env), so when there's no override we have to spread process.env
  // ourselves — otherwise ANTHROPIC_API_KEY, HOME, PATH, etc. get stripped
  // and Claude Code reports "Not logged in".
  return {
    ...(override ?? process.env),
    CLAUDE_CODE_DISABLE_AUTO_MEMORY: '1',
    ENABLE_TOOL_SEARCH: 'false',
  }
}

/** Map a ThinkingMode config value to the SDK thinking option shape. */
/** Map a ThinkingMode config value to the SDK thinking option shape. */
function thinkingOption(
  mode: ThinkingMode,
):
  | { type: 'adaptive' }
  | { type: 'enabled'; budgetTokens: number }
  | { type: 'disabled' }
  | undefined {
  switch (mode) {
    case 'adaptive':
      return { type: 'adaptive' }
    case 'enabled':
      return { type: 'enabled', budgetTokens: 10000 }
    case 'disabled':
      return { type: 'disabled' }
  }
}

/**
 * Unified options factory for chat mode (general + learning).
 *
 * systemPrompt is always general.md. Learning behavior is injected
 * per-turn via a <system-reminder> prepended to the user message
 * (handled by the API route, not here).
 */
export async function chatAgentOptions(params: {
  mode: 'general' | 'learning'
  streamSlug: string | null
  sessionId: string
  resume?: boolean
  abortController?: AbortController
  notifyClient?: (event: ChatStreamEvent) => void
  env?: Record<string, string | undefined>
  taskSlug?: string
  chatDir?: string
}): Promise<Options> {
  const config = resolveConfig(await readConfig())
  const { mode, streamSlug, sessionId } = params

  // MCP server needs stream root for ProcessSample (samples live under streams)
  const mcpRoot = streamSlug ? streamPath(streamSlug) : HAPPYHQ_ROOT

  const qsMcp: McpSdkServerConfigWithInstance = createQsMcpServer(
    mcpRoot,
    sessionId,
    {
      notifyClient: params.notifyClient,
      chatDir: params.chatDir,
    },
  )

  return {
    model: MODEL_IDS[config.models.learning.model],
    thinking: thinkingOption(config.models.learning.thinking),
    systemPrompt: generalPrompt(),
    cwd: HAPPYHQ_ROOT,
    permissionMode: 'acceptEdits',
    allowedTools: [
      'Glob',
      'Grep',
      'Read',
      'Task',
      'WebFetch',
      'WebSearch',
      'Bash(git:*)',
      'Bash(ls:*)',
      mcpToolName('ProcessSample'),
      mcpToolName('CreateTask'),
      mcpToolName('EnterLearningMode'),
      mcpToolName('ExitLearningMode'),
    ],
    disallowedTools: ['EnterPlanMode', 'ExitPlanMode'],
    canUseTool: async (toolName, input, { signal, toolUseID }) => {
      if (toolName === 'AskUserQuestion') {
        log('chat.canusetool_fired', {
          sessionId,
          toolName,
          toolUseId: toolUseID,
        })
        try {
          const answers = await Promise.race([
            waitForAnswer(sessionId),
            new Promise<never>((_, reject) => {
              signal.addEventListener(
                'abort',
                () => reject(new Error('Aborted')),
                { once: true },
              )
            }),
          ])
          log('chat.canusetool_resolved', {
            sessionId,
            toolUseId: toolUseID,
            outcome: 'answered',
          })
          return {
            behavior: 'allow' as const,
            updatedInput: { ...input, answers },
          }
        } catch {
          log('chat.canusetool_resolved', {
            sessionId,
            toolUseId: toolUseID,
            outcome: 'dismissed',
          })
          return {
            behavior: 'deny' as const,
            message: 'User dismissed the question',
          }
        }
      }

      if (
        toolName === 'Bash' &&
        typeof (input as Record<string, unknown>).command === 'string' &&
        isSafeBashCommand((input as Record<string, unknown>).command as string)
      ) {
        return {
          behavior: 'allow' as const,
          updatedInput: input as Record<string, unknown>,
        }
      }

      try {
        params.notifyClient?.({
          type: 'pending_confirmation',
          toolName,
          input: input as Record<string, unknown>,
          toolUseId: toolUseID,
        })
        const allowed = await Promise.race([
          waitForConfirmation(toolUseID),
          new Promise<never>((_, reject) => {
            signal.addEventListener(
              'abort',
              () => reject(new Error('Aborted')),
              { once: true },
            )
          }),
        ])
        return allowed
          ? {
              behavior: 'allow' as const,
              updatedInput: input as Record<string, unknown>,
            }
          : { behavior: 'deny' as const, message: 'User denied tool' }
      } catch {
        return {
          behavior: 'deny' as const,
          message: 'User dismissed tool confirmation',
        }
      }
    },
    hooks: {
      PostToolUse: [
        {
          hooks: [
            async (input) => {
              if (input.hook_event_name !== 'PostToolUse')
                return { continue: true }

              if (input.tool_name === 'Write' || input.tool_name === 'Edit') {
                params.notifyClient?.({ type: 'stream_content_changed' })
              }

              // Inject learning reminders immediately when entering learning mode
              // — same mechanism Claude Code uses for plan mode instructions.
              const toolInput = input.tool_input as
                | Record<string, unknown>
                | undefined
              const enteredStreamSlug = toolInput?.streamSlug as
                | string
                | undefined
              if (
                input.tool_name === `mcp__q__EnterLearningMode` &&
                enteredStreamSlug
              ) {
                const reminders =
                  await buildLearningReminders(enteredStreamSlug)
                return {
                  continue: true,
                  hookSpecificOutput: {
                    hookEventName: 'PostToolUse' as const,
                    additionalContext: reminders
                      .map((r) => `<system-reminder>\n${r}\n</system-reminder>`)
                      .join('\n'),
                  },
                }
              }

              return { continue: true }
            },
          ],
        },
      ],
    },
    includePartialMessages: true,
    mcpServers: { [MCP_SERVER_NAME]: qsMcp },
    settingSources: [],
    env: agentEnv(params.env),
    // Drafting subagent only in learning mode (for writing playbooks/specs)
    agents:
      mode === 'learning'
        ? {
            Drafting: {
              description:
                'Spec-driven production agent. Takes a synthesized brief, file paths to a spec and samples directory, and a target output path. Reads the spec and samples, produces a quality artifact that meets every acceptance criterion, and writes it to the target path. Use for writing playbooks and specs -- any artifact that has a quality spec to write against.',
              prompt: draftingPrompt(),
              model: 'opus',
              tools: ['Read', 'Glob', 'Grep', 'Write'],
              maxTurns: 10,
            },
          }
        : {},
    ...(params.abortController && { abortController: params.abortController }),
    ...(params.resume ? { resume: sessionId } : { sessionId }),
  }
}

/**
 * Options factory for the Discovery Agent (heads-up pre-planning phase).
 *
 * Discovery reads task inputs, stream playbook, specs, and samples and decides
 * whether the task has enough context to plan well. If it doesn't, it asks the
 * user 1–3 structured questions via AskUserQuestion (blocked through canUseTool
 * so the user actually answers via the run SSE stream + POST /api/run/answer).
 * On its way out, it appends a `## Discovery` section to task.md when there's
 * something useful to record.
 *
 * Discovery is heads-up like learning, but plumbed onto the run loop's SSE
 * stream rather than the chat stream. Like planning/working, it takes an
 * abortController so the parent run can cancel mid-question.
 *
 * Explicitly NOT configured (don't copy from learning by reflex):
 *   - mcpServers: discovery uses no custom MCP tools (no ProcessSample / CreateTask)
 *   - agents: no Drafting subagent — discovery is read-and-assess, not draft-and-write
 */
export async function discoveryAgentOptions(
  streamName: string,
  taskName: string,
  sessionId: string,
  abortController: AbortController,
  opts?: {
    env?: Record<string, string | undefined>
    notifyClient?: (event: ChatStreamEvent) => void
    resume?: boolean
  },
): Promise<Options> {
  const config = resolveConfig(await readConfig())
  // Discovery's only legitimate Write target. The PreToolUse hook below denies
  // any Write outside this path and denies Edit entirely. Discovery may only
  // append a `## Discovery` section to task.md, never anything else.
  const taskMdPath = `tasks/${taskName}/task.md`

  return {
    model: MODEL_IDS[config.models.discovery.model],
    thinking: thinkingOption(config.models.discovery.thinking),
    systemPrompt: await discoveryPrompt(streamName, taskName),
    cwd: HAPPYHQ_ROOT,
    permissionMode: 'acceptEdits',
    allowedTools: [
      // AskUserQuestion is NOT listed — it must trigger canUseTool to publish
      // pendingQuestions to disk + task.md, broadcast on the run stream, and
      // block until POST /api/run/answer fulfills the question.
      'Read',
      'Glob',
      'Grep',
      'Write', // Update task.md with `## Discovery`
      'WebFetch',
      'WebSearch',
      'Bash(git:*)',
      'Bash(ls:*)',
    ],
    disallowedTools: ['EnterPlanMode', 'ExitPlanMode'],
    canUseTool: async (toolName, input, { signal }) => {
      if (toolName === 'AskUserQuestion') {
        const questions = (
          input as { questions?: AskUserQuestionInput['questions'] }
        ).questions
        if (!Array.isArray(questions) || questions.length === 0) {
          return {
            behavior: 'deny' as const,
            message: 'AskUserQuestion called without questions',
          }
        }

        // Setup ordering: disk first (authoritative for reconnect), task.md
        // pending second (drives the "Needs clarification" badge), broadcast
        // third (fast-path SWR revalidation), block fourth.
        try {
          await updateRunInfoPendingQuestions(
            taskName,
            questions as RunInfo['pendingQuestions'],
          )
          await updateTaskMdPending(taskPath(taskName), 'clarification')
        } catch (err) {
          // Setup-write failure: log run.error and deny rather than block on
          // input we can't reliably surface to the user. No silent denials.
          log('run.error', {
            stream: streamName,
            task: taskName,
            error: 'Discovery state write failed',
            message: err instanceof Error ? err.message : String(err),
          })
          return {
            behavior: 'deny' as const,
            message: 'Discovery state write failed',
          }
        }

        opts?.notifyClient?.({
          type: 'question',
          sessionId,
          questions,
        })

        try {
          const answers = await Promise.race([
            waitForAnswer(sessionId),
            new Promise<never>((_, reject) => {
              // Guard against the signal already being aborted by the time we
              // register — setup awaits above can drain microtasks before we
              // get here, in which case `addEventListener('abort', ...)`
              // would never fire and Promise.race would hang forever.
              if (signal.aborted) {
                reject(new Error('Aborted'))
                return
              }
              signal.addEventListener(
                'abort',
                () => reject(new Error('Aborted')),
                { once: true },
              )
            }),
          ])
          return {
            behavior: 'allow' as const,
            updatedInput: { ...input, answers },
          }
        } catch {
          return {
            behavior: 'deny' as const,
            message: 'Discovery aborted before user answered',
          }
        } finally {
          // Clear pendingQuestions + pending whether answered or aborted.
          // Fire-and-forget: the loop's next status write reconciles disk
          // state via the syncTaskMdFromRun cascade.
          await updateRunInfoPendingQuestions(taskName, undefined).catch(
            () => {},
          )
          await updateTaskMdPending(taskPath(taskName), undefined).catch(
            () => {},
          )
        }
      }

      return {
        behavior: 'deny' as const,
        message: `Tool ${toolName} not available in discovery mode`,
      }
    },
    abortController,
    maxBudgetUsd: config.limits.discoveryBudgetUsd,
    includePartialMessages: true,
    persistSession: true,
    settingSources: [],
    env: agentEnv(opts?.env),
    hooks: {
      PreToolUse: [
        {
          hooks: [
            async (input) => {
              if (input.hook_event_name !== 'PreToolUse') {
                return { continue: true }
              }
              if (input.tool_name !== 'Write' && input.tool_name !== 'Edit') {
                return { continue: true }
              }
              if (input.tool_name === 'Edit') {
                return {
                  hookSpecificOutput: {
                    hookEventName: 'PreToolUse' as const,
                    permissionDecision: 'deny' as const,
                    permissionDecisionReason: `Discovery may not Edit files. Write tasks/${taskName}/task.md instead.`,
                  },
                }
              }
              const filePath = (input.tool_input as Record<string, unknown>)
                ?.file_path as string | undefined
              const isTaskMd =
                typeof filePath === 'string' &&
                (filePath === taskMdPath || filePath.endsWith(`/${taskMdPath}`))
              if (isTaskMd) {
                return { continue: true }
              }
              return {
                hookSpecificOutput: {
                  hookEventName: 'PreToolUse' as const,
                  permissionDecision: 'deny' as const,
                  permissionDecisionReason: `Discovery may only Write tasks/${taskName}/task.md. Stop and write the discovery section.`,
                },
              }
            },
          ],
        },
      ],
      PostToolUse: [
        {
          hooks: [
            async (input) => {
              if (input.hook_event_name !== 'PostToolUse') {
                return { continue: true }
              }
              if (input.tool_name === 'Write' || input.tool_name === 'Edit') {
                opts?.notifyClient?.({ type: 'task_content_changed' })
              }
              return { continue: true }
            },
          ],
        },
      ],
    },
    // New session: set sessionId. Resume: set resume to the session ID.
    ...(opts?.resume ? { resume: sessionId } : { sessionId }),
  }
}

/**
 * Options factory for the Worker Agent in planning mode.
 *
 * The planning agent reads task inputs and stream context, then writes plan.md.
 * Uses Opus for synthesis, native SDK subagents for bulk reading.
 * Single invocation, no session persistence.
 */
export async function planningAgentOptions(
  streamName: string,
  taskName: string,
  abortController: AbortController,
  opts?: {
    env?: Record<string, string | undefined>
    notifyClient?: (event: ChatStreamEvent) => void
    sessionId?: string
  },
): Promise<Options> {
  const config = resolveConfig(await readConfig())
  // Planning's only legitimate Write target. The hook below denies any
  // Write outside this path and denies Edit entirely. CLI harness behavior
  // changes (e.g. injected reminders, new auto-tools) cannot bypass this.
  const planPath = `tasks/${taskName}/plan.md`
  return {
    model: MODEL_IDS[config.models.planning.model],
    thinking: thinkingOption(config.models.planning.thinking),
    systemPrompt: await planningPrompt(streamName, taskName),
    cwd: HAPPYHQ_ROOT,
    permissionMode: 'acceptEdits',
    allowedTools: [
      'Read',
      'Glob',
      'Grep',
      'WebFetch',
      'WebSearch',
      'Bash(git:*)',
      'Bash(ls:*)',
    ],
    disallowedTools: ['EnterPlanMode', 'ExitPlanMode'],
    canUseTool: createAutomatedCanUseTool(),
    abortController,
    maxBudgetUsd: config.limits.planningBudgetUsd,
    includePartialMessages: true,
    persistSession: true,
    settingSources: [],
    env: agentEnv(opts?.env),
    hooks: {
      PreToolUse: [
        {
          hooks: [
            async (input) => {
              if (input.hook_event_name !== 'PreToolUse') {
                return { continue: true }
              }
              if (input.tool_name !== 'Write' && input.tool_name !== 'Edit') {
                return { continue: true }
              }
              if (input.tool_name === 'Edit') {
                return {
                  hookSpecificOutput: {
                    hookEventName: 'PreToolUse' as const,
                    permissionDecision: 'deny' as const,
                    permissionDecisionReason: `Planning may not Edit files. Write tasks/${taskName}/plan.md instead.`,
                  },
                }
              }
              const filePath = (input.tool_input as Record<string, unknown>)
                ?.file_path as string | undefined
              const isPlanMd =
                typeof filePath === 'string' &&
                (filePath === planPath || filePath.endsWith(`/${planPath}`))
              if (isPlanMd) {
                return { continue: true }
              }
              return {
                hookSpecificOutput: {
                  hookEventName: 'PreToolUse' as const,
                  permissionDecision: 'deny' as const,
                  permissionDecisionReason: `Planning may only Write tasks/${taskName}/plan.md. Stop and write the plan.`,
                },
              }
            },
          ],
        },
      ],
      PostToolUse: [
        {
          hooks: [
            async (input) => {
              if (input.hook_event_name !== 'PostToolUse') {
                return { continue: true }
              }
              if (input.tool_name === 'Write' || input.tool_name === 'Edit') {
                opts?.notifyClient?.({ type: 'task_content_changed' })
              }
              if (input.tool_name === 'WebFetch' && input.tool_response) {
                const url = (input.tool_input as Record<string, unknown>)
                  ?.url as string | undefined
                const content =
                  typeof input.tool_response === 'string'
                    ? input.tool_response
                    : JSON.stringify(input.tool_response)
                if (url && content) {
                  persistWebInput(taskPath(taskName), url, content).catch(
                    console.error,
                  )
                  opts?.notifyClient?.({ type: 'task_content_changed' })
                }
              }
              return { continue: true }
            },
          ],
        },
      ],
    },
    ...(opts?.sessionId && { sessionId: opts.sessionId }),
  }
}

/**
 * Options factory for the Worker Agent in working mode.
 *
 * The working agent executes one iteration of the plan per call.
 * Fresh instance each time — orients from plan.md and git history.
 * Uses Opus for execution, native SDK subagents for bulk reading.
 */
export async function workingAgentOptions(
  streamName: string,
  taskName: string,
  abortController: AbortController,
  opts?: {
    env?: Record<string, string | undefined>
    notifyClient?: (event: ChatStreamEvent) => void
    sessionId?: string
  },
): Promise<Options> {
  const config = resolveConfig(await readConfig())
  return {
    model: MODEL_IDS[config.models.working.model],
    thinking: thinkingOption(config.models.working.thinking),
    systemPrompt: await workingPrompt(streamName, taskName),
    cwd: HAPPYHQ_ROOT,
    permissionMode: 'acceptEdits',
    allowedTools: [
      'Read',
      'Glob',
      'Grep',
      'Task',
      'WebFetch',
      'WebSearch',
      'Bash(git:*)',
      'Bash(ls:*)',
    ],
    disallowedTools: ['EnterPlanMode', 'ExitPlanMode'],
    canUseTool: createAutomatedCanUseTool(),
    abortController,
    maxBudgetUsd: config.limits.workingBudgetUsd,
    includePartialMessages: true,
    persistSession: true,
    settingSources: [],
    env: agentEnv(opts?.env),
    hooks: {
      PostToolUse: [
        {
          hooks: [
            async (input) => {
              if (input.hook_event_name !== 'PostToolUse') {
                return { continue: true }
              }
              if (input.tool_name === 'Write' || input.tool_name === 'Edit') {
                opts?.notifyClient?.({ type: 'task_content_changed' })
              }
              if (input.tool_name === 'WebFetch' && input.tool_response) {
                const url = (input.tool_input as Record<string, unknown>)
                  ?.url as string | undefined
                const content =
                  typeof input.tool_response === 'string'
                    ? input.tool_response
                    : JSON.stringify(input.tool_response)
                if (url && content) {
                  persistWebInput(taskPath(taskName), url, content).catch(
                    console.error,
                  )
                  opts?.notifyClient?.({ type: 'task_content_changed' })
                }
              }
              return { continue: true }
            },
          ],
        },
      ],
    },
    ...(opts?.sessionId && { sessionId: opts.sessionId }),
  }
}
