import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useRunActivity } from './use-run-activity'

type WireEvent = Record<string, unknown>

function ndjsonResponse(events: WireEvent[]): Response {
  const encoder = new TextEncoder()
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const e of events) {
        controller.enqueue(encoder.encode(JSON.stringify(e) + '\n'))
      }
      controller.close()
    },
  })
  return new Response(body, {
    status: 200,
    headers: { 'content-type': 'application/x-ndjson' },
  })
}

const mockFetch = vi.fn()

beforeEach(() => {
  vi.stubGlobal('fetch', mockFetch)
  mockFetch.mockReset()
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('useRunActivity subagent events', () => {
  it('renders a step from subagent_event:started so subagent activity is visible', async () => {
    mockFetch.mockResolvedValueOnce(
      ndjsonResponse([
        {
          type: 'subagent_event',
          subtype: 'started',
          taskId: 'sa-1',
          description: 'Drafting',
        },
      ]),
    )

    const { result } = renderHook(() => useRunActivity(true))

    await waitFor(() => {
      expect(result.current.activitySteps.length).toBe(1)
    })

    const step = result.current.activitySteps[0]
    expect(step.label).toBe('Drafting')
    expect(step.isActive).toBe(true)
  })

  it('updates the step detail on subagent_event:progress', async () => {
    mockFetch.mockResolvedValueOnce(
      ndjsonResponse([
        {
          type: 'subagent_event',
          subtype: 'started',
          taskId: 'sa-2',
          description: 'Explore',
        },
        {
          type: 'subagent_event',
          subtype: 'progress',
          taskId: 'sa-2',
          lastToolName: 'Read',
        },
      ]),
    )

    const { result } = renderHook(() => useRunActivity(true))

    await waitFor(() => {
      const step = result.current.activitySteps.find(
        (s) => s.label === 'Explore',
      )
      expect(step?.detail).toBe('Read')
      expect(step?.isActive).toBe(true)
    })
  })

  it('marks the step inactive and surfaces the summary on subagent_event:completed', async () => {
    mockFetch.mockResolvedValueOnce(
      ndjsonResponse([
        {
          type: 'subagent_event',
          subtype: 'started',
          taskId: 'sa-3',
          description: 'Drafting',
        },
        {
          type: 'subagent_event',
          subtype: 'completed',
          taskId: 'sa-3',
          status: 'completed',
          summary: 'Wrote 2 files',
          toolUses: 4,
          durationMs: 1500,
        },
      ]),
    )

    const { result } = renderHook(() => useRunActivity(true))

    await waitFor(() => {
      const step = result.current.activitySteps.find(
        (s) => s.label === 'Drafting',
      )
      expect(step?.isActive).toBe(false)
      expect(step?.detail).toBe('Wrote 2 files')
    })
  })

  it('clears subagent steps on result (iteration boundary)', async () => {
    mockFetch.mockResolvedValueOnce(
      ndjsonResponse([
        {
          type: 'subagent_event',
          subtype: 'started',
          taskId: 'sa-4',
          description: 'Drafting',
        },
        {
          type: 'result',
          subtype: 'success',
          result: 'ok',
          costUsd: 0,
        },
      ]),
    )

    const { result } = renderHook(() => useRunActivity(true))

    await waitFor(() => {
      expect(result.current.activitySteps).toEqual([])
    })
  })
})
