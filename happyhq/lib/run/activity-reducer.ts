import { getToolDetail, getToolLabel } from '@/lib/chat/tool-labels'
import type {
  ChatAssistantEvent,
  ChatStreamEvent,
  ChatSubagentEvent,
  ChatToolProgressEvent,
  ContentBlock,
  StreamEvent,
} from '@/lib/chat/types'

export const THINKING_ID = '__thinking__'

export interface ActivityStep {
  toolUseId: string
  toolName: string
  label: string
  detail: string | null
  linesAdded: number | null
  elapsedSeconds: number
  isActive: boolean
}

// Reducer state: visible `steps` plus the seven bookkeeping structures that
// were `useRef` Maps/Sets in the old hook. Holding them in state lets a
// pure reducer rebuild ActivityStep[] from a wire transcript deterministically.
export interface ActivityState {
  steps: ActivityStep[]
  blockIndexMap: Map<number, string>
  partialJson: Map<number, string>
  mergedDetails: Map<string, string[]>
  confirmedRunning: Set<string>
  blockLineCount: Map<number, number>
  lastToolStep: { toolName: string; toolUseId: string } | null
  subagentStartedAt: Map<string, number>
}

export function initialActivityState(): ActivityState {
  return {
    steps: [],
    blockIndexMap: new Map(),
    partialJson: new Map(),
    mergedDetails: new Map(),
    confirmedRunning: new Set(),
    blockLineCount: new Map(),
    lastToolStep: null,
    subagentStartedAt: new Map(),
  }
}

/**
 * Try to extract a human-readable detail from partial (possibly incomplete) JSON.
 * Uses regex to find common tool input fields that appear early in the JSON stream.
 * Returns null on failure — the `assistant` event provides authoritative detail.
 */
function extractPartialDetail(json: string): string | null {
  const fileMatch = json.match(/"file_path"\s*:\s*"([^"]+)"/)
  if (fileMatch) {
    const parts = fileMatch[1].split('/')
    return parts[parts.length - 1] || fileMatch[1]
  }
  const patternMatch = json.match(/"pattern"\s*:\s*"([^"]+)"/)
  if (patternMatch) return patternMatch[1]
  const descMatch = json.match(/"description"\s*:\s*"([^"]{1,50})/)
  if (descMatch) return descMatch[1]
  const cmdMatch = json.match(/"command"\s*:\s*"([^"]{1,50})/)
  if (cmdMatch) return cmdMatch[1]
  const queryMatch = json.match(/"query"\s*:\s*"([^"]+)"/)
  if (queryMatch) return `"${queryMatch[1]}"`
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

/**
 * Pure reducer: same observable behaviour as the prior `useRunActivity`
 * for-await body, with `Date.now()` injected as `now`. Other event types
 * (`error`, `auth_error`, `pending_confirmation`, `stream_content_changed`,
 * `mode_changed`, `heartbeat`, `task_content_changed`) are no-ops here —
 * `task_content_changed` is observed by the hook for `lastContentChangeAt`,
 * which is connection state, not activity state.
 */
export function reduceActivity(
  prev: ActivityState,
  event: ChatStreamEvent,
  now: number,
): ActivityState {
  switch (event.type) {
    case 'partial':
      return reducePartial(prev, event.event)
    case 'tool_progress':
      return reduceToolProgress(prev, event)
    case 'assistant':
      return reduceAssistant(prev, event)
    case 'subagent_event':
      return reduceSubagent(prev, event, now)
    case 'result':
      return initialActivityState()
    default:
      return prev
  }
}

function reducePartial(
  prev: ActivityState,
  streamEvent: StreamEvent,
): ActivityState {
  if (streamEvent.type === 'content_block_start') {
    const block = streamEvent.content_block

    if (block.type === 'thinking' || block.type === 'text') {
      const idx = prev.steps.findIndex((s) => s.toolUseId === THINKING_ID)
      const step: ActivityStep = {
        toolUseId: THINKING_ID,
        toolName: '__thinking__',
        label: 'Thinking',
        detail: null,
        linesAdded: null,
        elapsedSeconds: 0,
        isActive: true,
      }
      const steps =
        idx >= 0
          ? prev.steps.map((s, i) => (i === idx ? step : s))
          : [...prev.steps, step]
      return { ...prev, steps }
    }

    if (block.type === 'tool_use') {
      const toolBlock = block as Extract<ContentBlock, { type: 'tool_use' }>
      const toolName = stripMcpPrefix(toolBlock.name)
      const toolUseId = toolBlock.id
      const label = getToolLabel(toolName)

      const newPartialJson = new Map(prev.partialJson)
      newPartialJson.set(streamEvent.index, '')

      if (label === null) {
        // Hidden tool — track block index for completeness but don't surface a step.
        const newBlockIndexMap = new Map(prev.blockIndexMap)
        newBlockIndexMap.set(streamEvent.index, toolUseId)
        return {
          ...prev,
          blockIndexMap: newBlockIndexMap,
          partialJson: newPartialJson,
        }
      }

      // Merge into the previous tool step if it has the same name and hasn't
      // started executing yet (parallel calls, e.g. 3 Reads). Avoids the flash
      // of a new row that immediately gets folded back.
      const last = prev.lastToolStep
      const mergeInto =
        last &&
        last.toolName === toolName &&
        !prev.confirmedRunning.has(last.toolUseId)
          ? last.toolUseId
          : null

      const newBlockIndexMap = new Map(prev.blockIndexMap)
      if (mergeInto) {
        newBlockIndexMap.set(streamEvent.index, mergeInto)
        return {
          ...prev,
          blockIndexMap: newBlockIndexMap,
          partialJson: newPartialJson,
        }
      }

      newBlockIndexMap.set(streamEvent.index, toolUseId)
      const newMergedDetails = new Map(prev.mergedDetails)
      newMergedDetails.set(toolUseId, [])

      const stepsAfterThinking = prev.steps.map((s) =>
        s.toolUseId === THINKING_ID ? { ...s, isActive: false } : s,
      )
      const steps = stepsAfterThinking.some((s) => s.toolUseId === toolUseId)
        ? stepsAfterThinking
        : [
            ...stepsAfterThinking,
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

      return {
        ...prev,
        steps,
        blockIndexMap: newBlockIndexMap,
        partialJson: newPartialJson,
        mergedDetails: newMergedDetails,
        lastToolStep: { toolName, toolUseId },
      }
    }

    return prev
  }

  if (streamEvent.type === 'content_block_delta') {
    const delta = streamEvent.delta
    if (!delta.partial_json) return prev

    const index = streamEvent.index
    const accumulated = (prev.partialJson.get(index) ?? '') + delta.partial_json
    const newPartialJson = new Map(prev.partialJson)
    newPartialJson.set(index, accumulated)

    const toolUseId = prev.blockIndexMap.get(index)
    if (!toolUseId) {
      return { ...prev, partialJson: newPartialJson }
    }

    const detail = extractPartialDetail(accumulated)
    const lineCount = extractLineCount(accumulated)

    let newBlockLineCount = prev.blockLineCount
    if (lineCount !== null && lineCount > 0) {
      newBlockLineCount = new Map(prev.blockLineCount)
      newBlockLineCount.set(index, lineCount)
    }

    let linesAdded: number | null = null
    if (lineCount !== null && lineCount > 0) {
      let total = 0
      for (const [bIdx, count] of newBlockLineCount) {
        if (prev.blockIndexMap.get(bIdx) === toolUseId) {
          total += count
        }
      }
      linesAdded = total
    }

    if (detail === null && linesAdded === null) {
      return {
        ...prev,
        partialJson: newPartialJson,
        blockLineCount: newBlockLineCount,
      }
    }

    let newMergedDetails = prev.mergedDetails
    let updatedSteps: ActivityStep[]
    const existingDetails = prev.mergedDetails.get(toolUseId)
    if (existingDetails && detail !== null) {
      // Per-block detail tracking so merged-parallel steps show "a, b, c"
      // instead of clobbering with the most recent block's detail.
      const blockKey = `__block_${index}`
      const existingIdx = existingDetails.findIndex((d) =>
        d.startsWith(blockKey + ':'),
      )
      const newDetails = [...existingDetails]
      if (existingIdx >= 0) {
        newDetails[existingIdx] = `${blockKey}:${detail}`
      } else {
        newDetails.push(`${blockKey}:${detail}`)
      }
      newMergedDetails = new Map(prev.mergedDetails)
      newMergedDetails.set(toolUseId, newDetails)

      const joined = newDetails
        .map((d) => d.slice(d.indexOf(':') + 1))
        .join(', ')
      updatedSteps = prev.steps.map((s) =>
        s.toolUseId === toolUseId
          ? {
              ...s,
              detail: joined,
              ...(linesAdded !== null && { linesAdded }),
            }
          : s,
      )
    } else {
      updatedSteps = prev.steps.map((s) =>
        s.toolUseId === toolUseId
          ? {
              ...s,
              ...(detail !== null && { detail }),
              ...(linesAdded !== null && { linesAdded }),
            }
          : s,
      )
    }

    return {
      ...prev,
      steps: updatedSteps,
      partialJson: newPartialJson,
      blockLineCount: newBlockLineCount,
      mergedDetails: newMergedDetails,
    }
  }

  return prev
}

function reduceToolProgress(
  prev: ActivityState,
  event: ChatToolProgressEvent,
): ActivityState {
  const newConfirmedRunning = new Set(prev.confirmedRunning)
  newConfirmedRunning.add(event.toolUseId)

  const label = getToolLabel(event.toolName)
  if (label === null) {
    return { ...prev, confirmedRunning: newConfirmedRunning }
  }

  const idx = prev.steps.findIndex((s) => s.toolUseId === event.toolUseId)

  let steps: ActivityStep[]
  if (idx >= 0) {
    // Parallel tools run concurrently — only update the matching step,
    // don't deactivate siblings.
    steps = prev.steps.map((s, i) =>
      i === idx
        ? {
            ...s,
            elapsedSeconds: Math.max(s.elapsedSeconds, event.elapsedSeconds),
            isActive: true,
          }
        : s,
    )
  } else {
    // Fallback: create step if partial event was missed.
    steps = [
      ...prev.steps.map((s) => ({ ...s, isActive: false })),
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
  }

  return { ...prev, steps, confirmedRunning: newConfirmedRunning }
}

function reduceAssistant(
  prev: ActivityState,
  event: ChatAssistantEvent,
): ActivityState {
  const toolUseBlocks = (event.message.content ?? []).filter(
    (b: ContentBlock) => b.type === 'tool_use',
  ) as Array<{
    type: 'tool_use'
    id: string
    name: string
    input: Record<string, unknown>
  }>
  if (toolUseBlocks.length === 0) return prev

  const next = [...prev.steps]
  for (const block of toolUseBlocks) {
    const label = getToolLabel(block.name)
    if (label === null) continue
    const detail = getToolDetail({
      id: block.id,
      name: block.name,
      input: block.input,
    })
    const idx = next.findIndex((s) => s.toolUseId === block.id)
    if (idx >= 0) {
      // Enrich detail only — activation is owned by content_block_start +
      // tool_progress, not the assistant turn.
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

  return { ...prev, steps: next }
}

function reduceSubagent(
  prev: ActivityState,
  event: ChatSubagentEvent,
  now: number,
): ActivityState {
  const subagentStepId = `subagent:${event.taskId}`

  if (event.subtype === 'started') {
    const newSubagentStartedAt = new Map(prev.subagentStartedAt)
    newSubagentStartedAt.set(event.taskId, now)

    if (prev.steps.some((s) => s.toolUseId === subagentStepId)) {
      return { ...prev, subagentStartedAt: newSubagentStartedAt }
    }

    const steps = [
      ...prev.steps.map((s) =>
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
    return { ...prev, steps, subagentStartedAt: newSubagentStartedAt }
  }

  if (event.subtype === 'progress') {
    const startedAt = prev.subagentStartedAt.get(event.taskId)
    const elapsed = startedAt ? Math.floor((now - startedAt) / 1000) : 0
    const detail = event.description ?? event.lastToolName ?? null
    const steps = prev.steps.map((s) =>
      s.toolUseId === subagentStepId
        ? {
            ...s,
            detail: detail ?? s.detail,
            elapsedSeconds: Math.max(s.elapsedSeconds, elapsed),
            isActive: true,
          }
        : s,
    )
    return { ...prev, steps }
  }

  if (event.subtype === 'completed') {
    const startedAt = prev.subagentStartedAt.get(event.taskId)
    const elapsed = startedAt ? Math.floor((now - startedAt) / 1000) : 0
    const newSubagentStartedAt = new Map(prev.subagentStartedAt)
    newSubagentStartedAt.delete(event.taskId)
    const steps = prev.steps.map((s) =>
      s.toolUseId === subagentStepId
        ? {
            ...s,
            detail: event.summary ?? s.detail,
            elapsedSeconds: Math.max(s.elapsedSeconds, elapsed),
            isActive: false,
          }
        : s,
    )
    return { ...prev, steps, subagentStartedAt: newSubagentStartedAt }
  }

  return prev
}
