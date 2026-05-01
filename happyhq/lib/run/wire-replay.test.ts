import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

import type { ChatStreamEvent } from '@/lib/chat/types'
import {
  initialActivityState,
  reduceActivity,
  type ActivityState,
} from './activity-reducer'

// Replay one wire.jsonl line by line through reduceActivity, keyed on a
// deterministic per-line clock (`now = (i + 1) * 1000`). The clock matters
// only for subagent elapsed-time math; non-subagent reducer paths ignore it.
function loadFixture(name: string): ChatStreamEvent[] {
  const file = path.join(__dirname, '__fixtures__', name)
  const text = fs.readFileSync(file, 'utf8')
  return text
    .split('\n')
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line) as ChatStreamEvent)
}

function replayUpTo(
  events: ChatStreamEvent[],
  endIndex: number,
): ActivityState {
  let state = initialActivityState()
  for (let i = 0; i <= endIndex && i < events.length; i++) {
    state = reduceActivity(state, events[i], (i + 1) * 1000)
  }
  return state
}

describe('wire replay — issue #26 (subagent activity must remain visible)', () => {
  const events = loadFixture('wire-issue-26.jsonl')

  it('produces a __subagent__ step on subagent_event:started so the panel is not silent', () => {
    const startedIndex = events.findIndex(
      (e) => e.type === 'subagent_event' && e.subtype === 'started',
    )
    const state = replayUpTo(events, startedIndex)

    // Regression sentinel for #26: if the subagent_event case is removed
    // from reduceActivity, no step with toolName '__subagent__' will ever
    // appear and this assertion fails.
    const subagentStep = state.steps.find((s) => s.toolName === '__subagent__')
    expect(subagentStep).toBeDefined()
    expect(subagentStep?.label).toBe('Delegating: Research auth')
    expect(subagentStep?.isActive).toBe(true)
  })

  it('updates elapsedSeconds on each progress event so the panel is not silent', () => {
    // Real SDK task_progress events carry both `description` and
    // `last_tool_name`; the reducer prefers description (?? lastToolName)
    // so the user-visible detail stays as the subagent's purpose. Visible
    // activity comes from elapsedSeconds growing across progress events —
    // that's what kills the "silent gap" symptom from #26.
    const firstProgressIndex = events.findIndex(
      (e) =>
        e.type === 'subagent_event' &&
        e.subtype === 'progress' &&
        e.lastToolName === 'Read',
    )
    const afterRead = replayUpTo(events, firstProgressIndex)
    const readStep = afterRead.steps.find((s) => s.toolName === '__subagent__')
    expect(readStep?.detail).toBe('Research auth')
    expect(readStep?.isActive).toBe(true)
    expect(readStep?.elapsedSeconds).toBeGreaterThan(0)

    const secondProgressIndex = events.findIndex(
      (e) =>
        e.type === 'subagent_event' &&
        e.subtype === 'progress' &&
        e.lastToolName === 'Grep',
    )
    const afterGrep = replayUpTo(events, secondProgressIndex)
    const grepStep = afterGrep.steps.find((s) => s.toolName === '__subagent__')
    expect(grepStep?.isActive).toBe(true)
    // Elapsed grows monotonically from one progress event to the next —
    // the visual signal that the subagent is alive.
    expect(grepStep!.elapsedSeconds).toBeGreaterThan(readStep!.elapsedSeconds)
  })

  it('marks the __subagent__ step inactive and surfaces the summary on completion', () => {
    const completedIndex = events.findIndex(
      (e) => e.type === 'subagent_event' && e.subtype === 'completed',
    )
    const state = replayUpTo(events, completedIndex)
    const step = state.steps.find((s) => s.toolName === '__subagent__')
    expect(step?.isActive).toBe(false)
    expect(step?.detail).toBe('Found 3 files')
  })

  it('clears all activity after the result event (iteration boundary)', () => {
    const state = replayUpTo(events, events.length - 1)
    expect(state.steps).toEqual([])
    expect(state.subagentStartedAt.size).toBe(0)
    expect(state.blockIndexMap.size).toBe(0)
    expect(state.partialJson.size).toBe(0)
    expect(state.lastToolStep).toBeNull()
  })

  it('renders the parent Task tool step alongside the subagent step during the run', () => {
    // The Task tool_use streams in via partial events before the subagent
    // lifecycle. Both steps should be visible while the subagent is working —
    // the parent Task row (label "Delegating", detail from input.description)
    // and the inner __subagent__ row (label "Delegating: Research auth").
    const firstProgressIndex = events.findIndex(
      (e) =>
        e.type === 'subagent_event' &&
        e.subtype === 'progress' &&
        e.lastToolName === 'Read',
    )
    const state = replayUpTo(events, firstProgressIndex)

    const taskStep = state.steps.find((s) => s.toolUseId === 'toolu_01Task')
    expect(taskStep?.label).toBe('Delegating')
    expect(taskStep?.detail).toBe('Research auth')

    const subagentStep = state.steps.find((s) => s.toolName === '__subagent__')
    expect(subagentStep?.label).toBe('Delegating: Research auth')
  })

  it('tolerates interleaved heartbeats without breaking replay', () => {
    // Heartbeats appear at lines 0, 11, 14 of the fixture. They are no-ops
    // in the reducer; confirming the final state is the same as if they
    // were filtered out keeps the contract honest.
    const filtered = events.filter((e) => e.type !== 'heartbeat')
    let withoutHeartbeats = initialActivityState()
    let i = 0
    for (const event of filtered) {
      withoutHeartbeats = reduceActivity(
        withoutHeartbeats,
        event,
        (i + 1) * 1000,
      )
      i++
    }

    // After the result, both replays converge to the empty state.
    const withHeartbeats = replayUpTo(events, events.length - 1)
    expect(withHeartbeats.steps).toEqual(withoutHeartbeats.steps)
  })
})
