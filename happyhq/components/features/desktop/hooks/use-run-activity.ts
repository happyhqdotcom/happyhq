'use client'

import { toastError } from '@/components/common/ui/sonner'
import { getToolDetail, getToolLabel } from '@/lib/chat/tool-labels'
import type {
  ChatStreamEvent,
  ContentBlock,
  StreamEvent,
} from '@/lib/chat/types'
import { readNDJSON } from '@/lib/ndjson'
import { useEffect, useRef, useState } from 'react'

const RECONNECT_DELAY_MS = 2000
const THINKING_ID = '__thinking__'

export interface ActivityStep {
  toolUseId: string
  toolName: string
  label: string
  detail: string | null
  linesAdded: number | null
  elapsedSeconds: number
  isActive: boolean
}

interface RunActivityState {
  statusLine: string | null
  lastResultAt: number | null
  lastContentChangeAt: number | null
  isConnected: boolean
  activitySteps: ActivityStep[]
}

/**
 * Try to extract a human-readable detail from partial (possibly incomplete) JSON.
 * Uses regex to find common tool input fields that appear early in the JSON stream.
 * Returns null on failure — the `assistant` event provides authoritative detail.
 */
function extractPartialDetail(json: string): string | null {
  // file_path for Read/Write/Edit
  const fileMatch = json.match(/"file_path"\s*:\s*"([^"]+)"/)
  if (fileMatch) {
    const parts = fileMatch[1].split('/')
    return parts[parts.length - 1] || fileMatch[1]
  }
  // pattern for Glob/Grep
  const patternMatch = json.match(/"pattern"\s*:\s*"([^"]+)"/)
  if (patternMatch) return patternMatch[1]
  // description for Bash (before command — more human-readable)
  const descMatch = json.match(/"description"\s*:\s*"([^"]{1,50})/)
  if (descMatch) return descMatch[1]
  // command for Bash
  const cmdMatch = json.match(/"command"\s*:\s*"([^"]{1,50})/)
  if (cmdMatch) return cmdMatch[1]
  // query for WebSearch
  const queryMatch = json.match(/"query"\s*:\s*"([^"]+)"/)
  if (queryMatch) return `"${queryMatch[1]}"`
  // url for WebFetch
  const urlMatch = json.match(/"url"\s*:\s*"([^"]+)"/)
  if (urlMatch) {
    try {
      return new URL(urlMatch[1]).hostname
    } catch {
      return null
    }
  }
  return null
}

/**
 * Count lines being written from partial JSON.
 * Detects Write (content field) or Edit (new_string field) and counts
 * JSON-escaped newline sequences (\n) in the value.
 */
function extractLineCount(json: string): number | null {
  const contentIdx = json.indexOf('"content":"')
  const newStringIdx = json.indexOf('"new_string":"')
  const fieldKey =
    contentIdx >= 0
      ? '"content":"'
      : newStringIdx >= 0
        ? '"new_string":"'
        : null
  if (!fieldKey) return null
  const start = json.indexOf(fieldKey) + fieldKey.length
  let count = 0
  for (let i = start; i < json.length - 1; i++) {
    if (json[i] === '\\' && json[i + 1] === 'n') {
      count++
      i++
    }
  }
  return count
}

/** Strip MCP prefix (mcp__q__Task → Task). Same logic as chatStore / filter.server. */
function stripMcpPrefix(name: string): string {
  const idx = name.lastIndexOf('__')
  return idx > 0 && name.startsWith('mcp__') ? name.slice(idx + 2) : name
}

export function useRunActivity(
  isActive: boolean,
  runStartedAt?: string | null,
  onStreamNotFound?: () => void,
): RunActivityState {
  const [statusLine, setStatusLine] = useState<string | null>(null)
  const [lastResultAt, setLastResultAt] = useState<number | null>(null)
  const [lastContentChangeAt, setLastContentChangeAt] = useState<number | null>(
    null,
  )
  const [isConnected, setIsConnected] = useState(false)
  const [activitySteps, setActivitySteps] = useState<ActivityStep[]>([])
  const controllerRef = useRef<AbortController | null>(null)

  // Partial event tracking — set eagerly in the for-await loop body,
  // NOT inside setActivitySteps callbacks (React batching caveat).
  const blockIndexMapRef = useRef<Map<number, string>>(new Map())
  const partialJsonRef = useRef<Map<number, string>>(new Map())
  // Per-step accumulated details for merged parallel tools (toolUseId → detail strings)
  const mergedDetailsRef = useRef<Map<string, string[]>>(new Map())
  // toolUseIds that have received tool_progress (confirmed running)
  const confirmedRunningRef = useRef<Set<string>>(new Set())
  // Per-block line counts for Write/Edit tools
  const blockLineCountRef = useRef<Map<number, number>>(new Map())
  // Last created tool step — set eagerly so merge decisions don't read stale state
  const lastToolStepRef = useRef<{
    toolName: string
    toolUseId: string
  } | null>(null)
  // Per-subagent start timestamps — used to compute elapsedSeconds on progress
  // events, since subagent_event payloads don't carry elapsed time.
  const subagentStartedAtRef = useRef<Map<string, number>>(new Map())

  // Latest-ref pattern for values that must be read with current identity
  // inside the long-lived SSE effect, without tearing down and rebuilding the
  // connection when only their identity changes. `runStartedAt` doesn't change
  // mid-run; `onStreamNotFound` is a stable SWR `mutate` in practice — but
  // routing through refs keeps the effect's deps a clean `[isActive]`.
  const runStartedAtRef = useRef(runStartedAt)
  const onStreamNotFoundRef = useRef(onStreamNotFound)
  useEffect(() => {
    runStartedAtRef.current = runStartedAt
    onStreamNotFoundRef.current = onStreamNotFound
  })

  useEffect(() => {
    if (!isActive) {
      // Clean up and clear status when not active. The synchronous setStates
      // wipe per-run UI state in the same render that the run flips inactive,
      // so no stale activity flashes between runs.
      controllerRef.current?.abort()
      controllerRef.current = null
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setStatusLine(null)
      setLastContentChangeAt(null)
      setActivitySteps([])
      setIsConnected(false)
      blockIndexMapRef.current.clear()
      partialJsonRef.current.clear()
      mergedDetailsRef.current.clear()
      confirmedRunningRef.current.clear()
      blockLineCountRef.current.clear()
      lastToolStepRef.current = null
      subagentStartedAtRef.current.clear()
      return
    }

    let mounted = true
    let reconnectTimeout: ReturnType<typeof setTimeout> | null = null

    async function connect() {
      if (!mounted) return

      const controller = new AbortController()
      controllerRef.current = controller

      try {
        // Note: This endpoint is globally unscoped — it streams whatever run
        // is active server-side. This is safe because the `isActive` guard
        // (derived from per-stream-per-task SWR data) ensures we only connect
        // when the *current* stream's task is running. If we add concurrent
        // runs across streams, this endpoint will need stream/task params.
        const response = await fetch('/api/run/stream', {
          signal: controller.signal,
        })

        if (!response.ok) {
          // 404 means the server has no active run. Two cases:
          // (a) Run is still initialising — `streamActive` flips on
          //     synchronously inside startRun before the POST returns 200,
          //     but a slow event loop / cold compile can land the SSE GET
          //     ahead of the loop's first broadcast.
          // (b) Run already terminated — fast-fail in planning, or any
          //     other path where `streamActive` flipped back to false
          //     between the optimistic update mounting this hook and the
          //     fetch landing.
          //
          // Fire the parent's onStreamNotFound callback so it can refetch
          // SWR-backed run state. For (a) the refetch sees status='planning'
          // (already on disk before POST returned) and the cache reconciles
          // without disrupting the optimistic update; for (b) the refetch
          // surfaces status='stopped'+error and useTerminalErrorToast picks
          // it up — closes #227.
          setIsConnected(false)
          onStreamNotFoundRef.current?.()
          if (mounted) {
            reconnectTimeout = setTimeout(connect, RECONNECT_DELAY_MS)
          }
          return
        }

        setIsConnected(true)

        for await (const event of readNDJSON<ChatStreamEvent>(response)) {
          if (!mounted) break

          if (event.type === 'partial') {
            const streamEvent = event.event as StreamEvent

            if (streamEvent.type === 'content_block_start') {
              const block = streamEvent.content_block

              if (block.type === 'thinking' || block.type === 'text') {
                // Show "Thinking" step with a stable ID (never regenerated)
                setActivitySteps((prev) => {
                  const idx = prev.findIndex((s) => s.toolUseId === THINKING_ID)
                  const step: ActivityStep = {
                    toolUseId: THINKING_ID,
                    toolName: '__thinking__',
                    label: 'Thinking',
                    detail: null,
                    linesAdded: null,
                    elapsedSeconds: 0,
                    isActive: true,
                  }
                  if (idx >= 0) {
                    return prev.map((s, i) => (i === idx ? step : s))
                  }
                  return [...prev, step]
                })
              } else if (block.type === 'tool_use') {
                const toolBlock = block as Extract<
                  ContentBlock,
                  { type: 'tool_use' }
                >
                const toolName = stripMcpPrefix(toolBlock.name)
                const toolUseId = toolBlock.id
                const label = getToolLabel(toolName)

                // Set refs eagerly BEFORE the state updater
                partialJsonRef.current.set(streamEvent.index, '')

                if (label !== null) {
                  // Check if the last tool step has the same tool name and
                  // hasn't started executing yet (parallel calls, e.g. 3 Reads).
                  // Merge into it instead of creating a new step that would flash.
                  const last = lastToolStepRef.current
                  const mergeInto =
                    last &&
                    last.toolName === toolName &&
                    !confirmedRunningRef.current.has(last.toolUseId)
                      ? last.toolUseId
                      : null

                  if (mergeInto) {
                    // Route this block's partial JSON to the existing step
                    blockIndexMapRef.current.set(streamEvent.index, mergeInto)
                  } else {
                    // New step — route to its own toolUseId
                    blockIndexMapRef.current.set(streamEvent.index, toolUseId)
                    mergedDetailsRef.current.set(toolUseId, [])
                    lastToolStepRef.current = { toolName, toolUseId }

                    setActivitySteps((prev) => {
                      // Mark thinking step inactive, add new tool step
                      const next = prev.map((s) =>
                        s.toolUseId === THINKING_ID
                          ? { ...s, isActive: false }
                          : s,
                      )
                      // Guard against duplicates
                      if (next.some((s) => s.toolUseId === toolUseId))
                        return next
                      return [
                        ...next,
                        {
                          toolUseId,
                          toolName,
                          label,
                          detail: null,
                          linesAdded: null,
                          elapsedSeconds: 0,
                          isActive: true,
                        },
                      ]
                    })
                  }
                } else {
                  // Hidden tool — still track block index for completeness
                  blockIndexMapRef.current.set(streamEvent.index, toolUseId)
                }
              }
            } else if (streamEvent.type === 'content_block_delta') {
              const delta = streamEvent.delta
              if (delta.partial_json) {
                const index = streamEvent.index
                // Accumulate JSON eagerly in ref
                const accumulated =
                  (partialJsonRef.current.get(index) ?? '') + delta.partial_json
                partialJsonRef.current.set(index, accumulated)

                const toolUseId = blockIndexMapRef.current.get(index)
                if (toolUseId) {
                  const detail = extractPartialDetail(accumulated)
                  const lineCount = extractLineCount(accumulated)

                  // Update line count ref
                  if (lineCount !== null && lineCount > 0) {
                    blockLineCountRef.current.set(index, lineCount)
                  }

                  // Compute merged linesAdded for this step
                  let linesAdded: number | null = null
                  if (lineCount !== null && lineCount > 0) {
                    let total = 0
                    for (const [bIdx, count] of blockLineCountRef.current) {
                      if (blockIndexMapRef.current.get(bIdx) === toolUseId) {
                        total += count
                      }
                    }
                    linesAdded = total
                  }

                  if (detail !== null || linesAdded !== null) {
                    // Track per-block details and join for merged steps
                    const details = mergedDetailsRef.current.get(toolUseId)
                    if (details && detail !== null) {
                      // Replace detail for this block index, or add it
                      const blockKey = `__block_${index}`
                      const existing = details.findIndex((d) =>
                        d.startsWith(blockKey + ':'),
                      )
                      if (existing >= 0) {
                        details[existing] = `${blockKey}:${detail}`
                      } else {
                        details.push(`${blockKey}:${detail}`)
                      }
                      // Join the actual detail values (strip block keys)
                      const joined = details
                        .map((d) => d.slice(d.indexOf(':') + 1))
                        .join(', ')
                      setActivitySteps((prev) =>
                        prev.map((s) =>
                          s.toolUseId === toolUseId
                            ? {
                                ...s,
                                detail: joined,
                                ...(linesAdded !== null && { linesAdded }),
                              }
                            : s,
                        ),
                      )
                    } else {
                      setActivitySteps((prev) =>
                        prev.map((s) =>
                          s.toolUseId === toolUseId
                            ? {
                                ...s,
                                ...(detail !== null && { detail }),
                                ...(linesAdded !== null && { linesAdded }),
                              }
                            : s,
                        ),
                      )
                    }
                  }
                }
              }
            }
            // content_block_stop: no action needed — assistant event finalizes
          } else if (event.type === 'tool_progress') {
            confirmedRunningRef.current.add(event.toolUseId)
            setStatusLine(`${event.toolName}... (${event.elapsedSeconds}s)`)

            setActivitySteps((prev) => {
              const label = getToolLabel(event.toolName)
              if (label === null) return prev // hidden tool

              // For merged steps, tool_progress may arrive for a toolUseId
              // that was merged into another step. Check if any step owns it.
              const idx = prev.findIndex((s) => s.toolUseId === event.toolUseId)

              if (idx >= 0) {
                // Step exists — update elapsed time, keep siblings active
                // (parallel tools run concurrently, don't deactivate each other)
                return prev.map((s, i) =>
                  i === idx
                    ? {
                        ...s,
                        elapsedSeconds: Math.max(
                          s.elapsedSeconds,
                          event.elapsedSeconds,
                        ),
                        isActive: true,
                      }
                    : s,
                )
              }

              // Fallback: create step if partial event was missed
              return [
                ...prev.map((s) => ({ ...s, isActive: false })),
                {
                  toolUseId: event.toolUseId,
                  toolName: event.toolName,
                  label,
                  detail: null,
                  linesAdded: null,
                  elapsedSeconds: event.elapsedSeconds,
                  isActive: true,
                },
              ]
            })
          } else if (event.type === 'assistant') {
            const toolUseBlocks = (event.message.content ?? []).filter(
              (b: ContentBlock) => b.type === 'tool_use',
            ) as Array<{
              type: 'tool_use'
              id: string
              name: string
              input: Record<string, unknown>
            }>

            if (toolUseBlocks.length > 0) {
              setActivitySteps((prev) => {
                let next = [...prev]
                for (const block of toolUseBlocks) {
                  const label = getToolLabel(block.name)
                  if (label === null) continue // hidden tool

                  const detail = getToolDetail({
                    id: block.id,
                    name: block.name,
                    input: block.input,
                  })
                  const idx = next.findIndex((s) => s.toolUseId === block.id)

                  if (idx >= 0) {
                    // Enrich detail only — don't change isActive
                    // (activation is handled by content_block_start + tool_progress)
                    next[idx] = { ...next[idx], detail }
                  } else {
                    next.push({
                      toolUseId: block.id,
                      toolName: block.name,
                      label,
                      detail,
                      linesAdded: null,
                      elapsedSeconds: 0,
                      isActive: false,
                    })
                  }
                }
                return next
              })
            }
          } else if (event.type === 'subagent_event') {
            // Subagents (Task tool) emit lifecycle events while running.
            // Without surfacing them here the activity panel goes silent
            // for the duration of each subagent's work — see issue #26.
            const subagentStepId = `subagent:${event.taskId}`

            if (event.subtype === 'started') {
              subagentStartedAtRef.current.set(event.taskId, Date.now())
              setActivitySteps((prev) => {
                if (prev.some((s) => s.toolUseId === subagentStepId)) {
                  return prev
                }
                return [
                  ...prev.map((s) =>
                    s.toolUseId === THINKING_ID ? { ...s, isActive: false } : s,
                  ),
                  {
                    toolUseId: subagentStepId,
                    toolName: '__subagent__',
                    label: event.description
                      ? `Delegating: ${event.description}`
                      : 'Delegating',
                    detail: null,
                    linesAdded: null,
                    elapsedSeconds: 0,
                    isActive: true,
                  },
                ]
              })
            } else if (event.subtype === 'progress') {
              const startedAt = subagentStartedAtRef.current.get(event.taskId)
              const elapsed = startedAt
                ? Math.floor((Date.now() - startedAt) / 1000)
                : 0
              const detail = event.description ?? event.lastToolName ?? null
              setStatusLine(
                `${event.description ?? event.lastToolName ?? 'Subagent'}... (${elapsed}s)`,
              )
              setActivitySteps((prev) =>
                prev.map((s) =>
                  s.toolUseId === subagentStepId
                    ? {
                        ...s,
                        detail: detail ?? s.detail,
                        elapsedSeconds: Math.max(s.elapsedSeconds, elapsed),
                        isActive: true,
                      }
                    : s,
                ),
              )
            } else if (event.subtype === 'completed') {
              const startedAt = subagentStartedAtRef.current.get(event.taskId)
              const elapsed = startedAt
                ? Math.floor((Date.now() - startedAt) / 1000)
                : 0
              subagentStartedAtRef.current.delete(event.taskId)
              setActivitySteps((prev) =>
                prev.map((s) =>
                  s.toolUseId === subagentStepId
                    ? {
                        ...s,
                        detail: event.summary ?? s.detail,
                        elapsedSeconds: Math.max(s.elapsedSeconds, elapsed),
                        isActive: false,
                      }
                    : s,
                ),
              )
            }
          } else if (event.type === 'task_content_changed') {
            setLastContentChangeAt(Date.now())
          } else if (event.type === 'question') {
            // Discovery (or any heads-up phase) wrote pendingQuestions to
            // .run.json — fast-path an SWR refetch so the island question
            // UI renders without waiting for the next poll. Disk is the
            // source of truth; this is just the fast path.
            setLastContentChangeAt(Date.now())
          } else if (event.type === 'error') {
            // Run loop broadcasts this on terminal failure. Live subscribers
            // get the toast immediately. The same terminal state lands in
            // .run.json and is also picked up by useTaskData's SWR-observed
            // effect (covers fast-fails where SSE never mounts) — both paths
            // use the run.startedAt-keyed id so Sonner dedupes.
            toastError(
              event.message,
              runStartedAtRef.current
                ? { id: `run-error:${runStartedAtRef.current}` }
                : undefined,
            )
          } else if (event.type === 'result') {
            setLastResultAt(Date.now())
            setActivitySteps([]) // iteration boundary — reset
            blockIndexMapRef.current.clear()
            partialJsonRef.current.clear()
            mergedDetailsRef.current.clear()
            confirmedRunningRef.current.clear()
            blockLineCountRef.current.clear()
            lastToolStepRef.current = null
            subagentStartedAtRef.current.clear()
          }
        }
      } catch (err) {
        // AbortError is expected on cleanup
        if (err instanceof DOMException && err.name === 'AbortError') return
        // Network error mid-run — retry after delay
        setIsConnected(false)
        if (mounted) {
          reconnectTimeout = setTimeout(connect, RECONNECT_DELAY_MS)
        }
        return
      }

      // Stream ended cleanly — run is over. Trigger a final refetch
      // to pick up terminal .run.json state. Don't reconnect: a new
      // run will flip isActive off→on, re-triggering this hook.
      setIsConnected(false)
      setStatusLine(null)
      setLastContentChangeAt(Date.now())
    }

    connect()

    return () => {
      mounted = false
      controllerRef.current?.abort()
      controllerRef.current = null
      if (reconnectTimeout) clearTimeout(reconnectTimeout)
    }
  }, [isActive])

  return {
    statusLine,
    lastResultAt,
    lastContentChangeAt,
    isConnected,
    activitySteps,
  }
}
