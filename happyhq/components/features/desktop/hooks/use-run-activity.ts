'use client'

import type { ChatStreamEvent } from '@/lib/chat/types'
import { readNDJSON } from '@/lib/ndjson'
import {
  initialActivityState,
  reduceActivity,
  type ActivityState,
  type ActivityStep,
} from '@/lib/run/activity-reducer'
import { useEffect, useReducer, useRef, useState } from 'react'

export type { ActivityStep } from '@/lib/run/activity-reducer'

const RECONNECT_DELAY_MS = 2000

interface RunActivityState {
  statusLine: string | null
  lastResultAt: number | null
  lastContentChangeAt: number | null
  isConnected: boolean
  activitySteps: ActivityStep[]
}

type Action =
  | { type: 'event'; event: ChatStreamEvent; now: number }
  | { type: 'reset' }

function rootReducer(prev: ActivityState, action: Action): ActivityState {
  if (action.type === 'reset') return initialActivityState()
  return reduceActivity(prev, action.event, action.now)
}

export function useRunActivity(isActive: boolean): RunActivityState {
  const [statusLine, setStatusLine] = useState<string | null>(null)
  const [lastResultAt, setLastResultAt] = useState<number | null>(null)
  const [lastContentChangeAt, setLastContentChangeAt] = useState<number | null>(
    null,
  )
  const [isConnected, setIsConnected] = useState(false)
  const [state, dispatch] = useReducer(
    rootReducer,
    undefined,
    initialActivityState,
  )
  const controllerRef = useRef<AbortController | null>(null)

  useEffect(() => {
    if (!isActive) {
      controllerRef.current?.abort()
      controllerRef.current = null
      setStatusLine(null)
      setLastContentChangeAt(null)
      setIsConnected(false)
      dispatch({ type: 'reset' })
      return
    }

    let mounted = true
    let reconnectTimeout: ReturnType<typeof setTimeout> | null = null

    async function connect() {
      if (!mounted) return

      const controller = new AbortController()
      controllerRef.current = controller

      // Local mirror of subagent start times — used only to compute the
      // statusLine "Subagent... (Xs)" message. The reducer keeps its own
      // copy for activity-step elapsed tracking; both are fed by the same
      // wire so they stay in sync without sharing state.
      const subagentStartedAt = new Map<string, number>()

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
          // 404 likely means the run is still initialising (optimistic
          // update set isActive before the server was ready). Retry
          // after a short delay — cleanup will stop retries if the run
          // ends and isActive flips to false.
          setIsConnected(false)
          if (mounted) {
            reconnectTimeout = setTimeout(connect, RECONNECT_DELAY_MS)
          }
          return
        }

        setIsConnected(true)

        for await (const event of readNDJSON<ChatStreamEvent>(response)) {
          if (!mounted) break
          const now = Date.now()
          dispatch({ type: 'event', event, now })

          // Hook-owned UI state derived from the same wire events.
          if (event.type === 'tool_progress') {
            setStatusLine(`${event.toolName}... (${event.elapsedSeconds}s)`)
          } else if (event.type === 'subagent_event') {
            if (event.subtype === 'started') {
              subagentStartedAt.set(event.taskId, now)
            } else if (event.subtype === 'progress') {
              const startedAt = subagentStartedAt.get(event.taskId)
              const elapsed = startedAt
                ? Math.floor((now - startedAt) / 1000)
                : 0
              setStatusLine(
                `${event.description ?? event.lastToolName ?? 'Subagent'}... (${elapsed}s)`,
              )
            } else if (event.subtype === 'completed') {
              subagentStartedAt.delete(event.taskId)
            }
          } else if (event.type === 'task_content_changed') {
            setLastContentChangeAt(Date.now())
          } else if (event.type === 'result') {
            setLastResultAt(Date.now())
            subagentStartedAt.clear()
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
    activitySteps: state.steps,
  }
}
