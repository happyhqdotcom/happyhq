import { describe, expect, it } from 'vitest'

import type { ChatStreamEvent } from '@/lib/chat/types'
import {
  initialActivityState,
  reduceActivity,
  type ActivityState,
} from './activity-reducer'

function replay(
  events: ChatStreamEvent[],
  now: number = 1_000_000,
): ActivityState {
  return events.reduce<ActivityState>(
    (state, event) => reduceActivity(state, event, now),
    initialActivityState(),
  )
}

describe('reduceActivity — subagent_event parity with prior hook', () => {
  it('renders a step from subagent_event:started so subagent activity is visible', () => {
    const state = replay([
      {
        type: 'subagent_event',
        subtype: 'started',
        taskId: 'sa-1',
        description: 'Drafting',
      },
    ])

    expect(state.steps).toHaveLength(1)
    expect(state.steps[0].label).toBe('Delegating: Drafting')
    expect(state.steps[0].isActive).toBe(true)
  })

  it('updates the step detail on subagent_event:progress', () => {
    const state = replay([
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
    ])

    const step = state.steps.find((s) => s.label === 'Delegating: Explore')
    expect(step?.detail).toBe('Read')
    expect(step?.isActive).toBe(true)
  })

  it('marks the step inactive and surfaces the summary on subagent_event:completed', () => {
    const state = replay([
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
    ])

    const step = state.steps.find((s) => s.label === 'Delegating: Drafting')
    expect(step?.isActive).toBe(false)
    expect(step?.detail).toBe('Wrote 2 files')
  })

  it('clears all activity on result (iteration boundary)', () => {
    const state = replay([
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
    ])

    expect(state.steps).toEqual([])
    expect(state.subagentStartedAt.size).toBe(0)
    expect(state.blockIndexMap.size).toBe(0)
    expect(state.partialJson.size).toBe(0)
    expect(state.lastToolStep).toBeNull()
  })
})

describe('reduceActivity — determinism', () => {
  it('returns identical steps for the same wire transcript regardless of wall clock', () => {
    const events: ChatStreamEvent[] = [
      {
        type: 'subagent_event',
        subtype: 'started',
        taskId: 'sa-x',
        description: 'Drafting',
      },
      {
        type: 'subagent_event',
        subtype: 'progress',
        taskId: 'sa-x',
        lastToolName: 'Read',
      },
    ]

    const a = replay(events, 1_000_000)
    const b = replay(events, 1_000_000)

    expect(a.steps).toEqual(b.steps)
  })

  it('computes subagent elapsedSeconds from injected now', () => {
    const startedAt = 5_000
    const progressAt = startedAt + 7_000

    let state = initialActivityState()
    state = reduceActivity(
      state,
      {
        type: 'subagent_event',
        subtype: 'started',
        taskId: 'sa-y',
        description: 'Explore',
      },
      startedAt,
    )
    state = reduceActivity(
      state,
      {
        type: 'subagent_event',
        subtype: 'progress',
        taskId: 'sa-y',
        lastToolName: 'Grep',
      },
      progressAt,
    )

    const step = state.steps.find((s) => s.label === 'Delegating: Explore')
    expect(step?.elapsedSeconds).toBe(7)
  })
})

describe('reduceActivity — thinking block', () => {
  it('adds a Thinking step on content_block_start of type thinking', () => {
    const state = replay([
      {
        type: 'partial',
        event: {
          type: 'content_block_start',
          index: 0,
          content_block: { type: 'thinking', thinking: '' },
        },
      },
    ])

    expect(state.steps).toHaveLength(1)
    expect(state.steps[0].label).toBe('Thinking')
    expect(state.steps[0].isActive).toBe(true)
  })

  it('marks thinking inactive when a tool step is added', () => {
    const state = replay([
      {
        type: 'partial',
        event: {
          type: 'content_block_start',
          index: 0,
          content_block: { type: 'thinking', thinking: '' },
        },
      },
      {
        type: 'partial',
        event: {
          type: 'content_block_start',
          index: 1,
          content_block: {
            type: 'tool_use',
            id: 'tool-1',
            name: 'Read',
            input: {},
          },
        },
      },
    ])

    const thinking = state.steps.find((s) => s.label === 'Thinking')
    const tool = state.steps.find((s) => s.toolUseId === 'tool-1')
    expect(thinking?.isActive).toBe(false)
    expect(tool?.isActive).toBe(true)
    expect(tool?.label).toBe('Reading')
  })
})

describe('reduceActivity — tool_progress', () => {
  it('updates elapsedSeconds and confirms running on tool_progress', () => {
    const state = replay([
      {
        type: 'partial',
        event: {
          type: 'content_block_start',
          index: 0,
          content_block: {
            type: 'tool_use',
            id: 'tool-1',
            name: 'Read',
            input: {},
          },
        },
      },
      {
        type: 'tool_progress',
        toolName: 'Read',
        toolUseId: 'tool-1',
        elapsedSeconds: 3,
      },
    ])

    const step = state.steps.find((s) => s.toolUseId === 'tool-1')
    expect(step?.elapsedSeconds).toBe(3)
    expect(state.confirmedRunning.has('tool-1')).toBe(true)
  })

  it('falls back to creating a step if partial event was missed', () => {
    const state = replay([
      {
        type: 'tool_progress',
        toolName: 'Grep',
        toolUseId: 'tool-2',
        elapsedSeconds: 1,
      },
    ])

    expect(state.steps).toHaveLength(1)
    expect(state.steps[0].label).toBe('Finding')
    expect(state.steps[0].elapsedSeconds).toBe(1)
  })
})

describe('reduceActivity — assistant', () => {
  it('enriches detail on existing tool step from assistant message', () => {
    const state = replay([
      {
        type: 'partial',
        event: {
          type: 'content_block_start',
          index: 0,
          content_block: {
            type: 'tool_use',
            id: 'tool-3',
            name: 'Read',
            input: {},
          },
        },
      },
      {
        type: 'assistant',
        message: {
          id: 'msg-1',
          role: 'assistant',
          model: 'claude',
          stop_reason: 'tool_use',
          content: [
            {
              type: 'tool_use',
              id: 'tool-3',
              name: 'Read',
              input: { file_path: '/some/path/config.ts' },
            },
          ],
        },
      },
    ])

    const step = state.steps.find((s) => s.toolUseId === 'tool-3')
    expect(step?.detail).toBe('config.ts')
  })
})

describe('reduceActivity — parallel tool merging', () => {
  it('merges parallel calls of the same tool that have not started yet', () => {
    const state = replay([
      {
        type: 'partial',
        event: {
          type: 'content_block_start',
          index: 0,
          content_block: {
            type: 'tool_use',
            id: 'tool-a',
            name: 'Read',
            input: {},
          },
        },
      },
      {
        type: 'partial',
        event: {
          type: 'content_block_start',
          index: 1,
          content_block: {
            type: 'tool_use',
            id: 'tool-b',
            name: 'Read',
            input: {},
          },
        },
      },
    ])

    // Only one Read step — second was merged into the first since it
    // has not been confirmed running yet.
    const reads = state.steps.filter((s) => s.label === 'Reading')
    expect(reads).toHaveLength(1)
    expect(state.blockIndexMap.get(0)).toBe('tool-a')
    expect(state.blockIndexMap.get(1)).toBe('tool-a')
  })

  it('does NOT merge if the prior tool already started running', () => {
    const state = replay([
      {
        type: 'partial',
        event: {
          type: 'content_block_start',
          index: 0,
          content_block: {
            type: 'tool_use',
            id: 'tool-a',
            name: 'Read',
            input: {},
          },
        },
      },
      {
        type: 'tool_progress',
        toolName: 'Read',
        toolUseId: 'tool-a',
        elapsedSeconds: 1,
      },
      {
        type: 'partial',
        event: {
          type: 'content_block_start',
          index: 1,
          content_block: {
            type: 'tool_use',
            id: 'tool-b',
            name: 'Read',
            input: {},
          },
        },
      },
    ])

    const reads = state.steps.filter((s) => s.label === 'Reading')
    expect(reads).toHaveLength(2)
  })
})

describe('reduceActivity — purity', () => {
  it('does not mutate prev state', () => {
    const initial = initialActivityState()
    const initialStepsRef = initial.steps
    const initialBlockMapRef = initial.blockIndexMap

    reduceActivity(
      initial,
      {
        type: 'subagent_event',
        subtype: 'started',
        taskId: 'sa-z',
        description: 'Drafting',
      },
      0,
    )

    expect(initial.steps).toBe(initialStepsRef)
    expect(initial.steps).toHaveLength(0)
    expect(initial.blockIndexMap).toBe(initialBlockMapRef)
    expect(initial.subagentStartedAt.size).toBe(0)
  })

  it('returns prev unchanged for unhandled event types', () => {
    const initial = initialActivityState()
    const next = reduceActivity(initial, { type: 'heartbeat', t: 'x' }, 0)
    expect(next).toBe(initial)
  })
})
