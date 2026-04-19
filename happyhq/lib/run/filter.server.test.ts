import fc from 'fast-check'
import { describe, expect, it } from 'vitest'

import { encodeEvent, filterMessage, stripMcpPrefix } from './filter.server'

describe('filterMessage', () => {
  it('converts stream_event to partial event', () => {
    const sdkEvent = {
      type: 'content_block_delta',
      index: 0,
      delta: { type: 'text_delta', text: 'Hello' },
    }
    const result = filterMessage({
      type: 'stream_event',
      event: sdkEvent,
      parent_tool_use_id: null,
      uuid: '1',
      session_id: 's1',
    } as any)

    expect(result).toEqual({ type: 'partial', event: sdkEvent })
  })

  it('converts assistant message to assistant event', () => {
    const message = {
      id: 'msg_1',
      role: 'assistant',
      content: [{ type: 'text', text: 'Hi' }],
      model: 'claude-sonnet-4-5-20250929',
      stop_reason: 'end_turn',
    }
    const result = filterMessage({
      type: 'assistant',
      message,
      parent_tool_use_id: null,
      uuid: '1',
      session_id: 's1',
    } as any)

    expect(result).toEqual({ type: 'assistant', message })
  })

  it('converts tool_progress to tool_progress event', () => {
    const result = filterMessage({
      type: 'tool_progress',
      tool_name: 'Read',
      tool_use_id: 'tu_1',
      parent_tool_use_id: null,
      elapsed_time_seconds: 3.5,
      uuid: '1',
      session_id: 's1',
    } as any)

    expect(result).toEqual({
      type: 'tool_progress',
      toolName: 'Read',
      toolUseId: 'tu_1',
      elapsedSeconds: 3.5,
    })
  })

  it('converts successful result to result event with result data', () => {
    const result = filterMessage({
      type: 'result',
      subtype: 'success',
      result: 'Task completed',
      total_cost_usd: 0.05,
      permission_denials: [],
    } as any)

    expect(result).toEqual({
      type: 'result',
      subtype: 'success',
      result: 'Task completed',
      errors: undefined,
      permissionDenials: undefined,
      costUsd: 0.05,
    })
  })

  it('converts error result to result event with error data', () => {
    const result = filterMessage({
      type: 'result',
      subtype: 'error_during_execution',
      errors: ['Something broke'],
      total_cost_usd: 0.02,
      permission_denials: [],
    } as any)

    expect(result).toEqual({
      type: 'result',
      subtype: 'error_during_execution',
      result: undefined,
      errors: ['Something broke'],
      permissionDenials: undefined,
      costUsd: 0.02,
    })
  })

  it('forwards permission denials from result events', () => {
    const result = filterMessage({
      type: 'result',
      subtype: 'success',
      result: 'Done',
      total_cost_usd: 0.03,
      permission_denials: [
        {
          tool_name: 'Bash',
          tool_use_id: 'tu_1',
          tool_input: { command: 'rm -rf /' },
        },
      ],
    } as any)

    expect(result).toEqual({
      type: 'result',
      subtype: 'success',
      result: 'Done',
      errors: undefined,
      permissionDenials: [{ toolName: 'Bash', toolUseId: 'tu_1' }],
      costUsd: 0.03,
    })
  })

  it('strips mcp__ prefix from permission denial tool names', () => {
    const result = filterMessage({
      type: 'result',
      subtype: 'success',
      result: 'Done',
      total_cost_usd: 0.01,
      permission_denials: [
        {
          tool_name: 'mcp__q__CreateStream',
          tool_use_id: 'tu_2',
          tool_input: { name: 'test' },
        },
      ],
    } as any)

    const event = result as any
    expect(event.permissionDenials[0].toolName).toBe('CreateStream')
  })

  it('converts system task_started to subagent_event started', () => {
    const result = filterMessage({
      type: 'system',
      subtype: 'task_started',
      task_id: 'task-1',
      description: 'Drafting',
    } as any)

    expect(result).toEqual({
      type: 'subagent_event',
      subtype: 'started',
      taskId: 'task-1',
      description: 'Drafting',
    })
  })

  it('converts system task_progress to subagent_event progress', () => {
    const result = filterMessage({
      type: 'system',
      subtype: 'task_progress',
      task_id: 'task-1',
      description: 'Reading files',
      last_tool_name: 'Read',
    } as any)

    expect(result).toEqual({
      type: 'subagent_event',
      subtype: 'progress',
      taskId: 'task-1',
      description: 'Reading files',
      lastToolName: 'Read',
    })
  })

  it('converts system task_notification to subagent_event completed', () => {
    const result = filterMessage({
      type: 'system',
      subtype: 'task_notification',
      task_id: 'task-1',
      status: 'completed',
      summary: 'done',
      usage: { tool_uses: 5, duration_ms: 12300 },
    } as any)

    expect(result).toEqual({
      type: 'subagent_event',
      subtype: 'completed',
      taskId: 'task-1',
      status: 'completed',
      summary: 'done',
      toolUses: 5,
      durationMs: 12300,
    })
  })

  it('returns null for non-task system subtypes', () => {
    expect(
      filterMessage({ type: 'system', subtype: 'init', model: 'opus' } as any),
    ).toBeNull()
  })

  it('returns null for unhandled SDK message types', () => {
    expect(
      filterMessage({ type: 'status', message: 'running' } as any),
    ).toBeNull()
    expect(
      filterMessage({ type: 'hook_started', hook: 'test' } as any),
    ).toBeNull()
  })

  it('strips mcp__ prefix from tool_use blocks in assistant messages', () => {
    const message = {
      id: 'msg_1',
      role: 'assistant',
      content: [
        { type: 'text', text: 'Creating stream...' },
        {
          type: 'tool_use',
          id: 'tu_1',
          name: 'mcp__q__CreateStream',
          input: { name: 'my-stream' },
        },
        {
          type: 'tool_use',
          id: 'tu_2',
          name: 'mcp__q__CreateTask',
          input: { name: 'task' },
        },
      ],
      model: 'claude-sonnet-4-5-20250929',
      stop_reason: 'end_turn',
    }
    const result = filterMessage({
      type: 'assistant',
      message,
      parent_tool_use_id: null,
      uuid: '1',
      session_id: 's1',
    } as any)

    expect(result!.type).toBe('assistant')
    const content = (result as any).message.content
    expect(content[1].name).toBe('CreateStream')
    expect(content[2].name).toBe('CreateTask')
  })

  it('does not mutate the original SDK message when stripping prefixes', () => {
    const originalContent = [
      {
        type: 'tool_use',
        id: 'tu_1',
        name: 'mcp__q__CreateStream',
        input: { name: 'test' },
      },
    ]
    const message = {
      id: 'msg_1',
      role: 'assistant',
      content: originalContent,
      model: 'claude-sonnet-4-5-20250929',
      stop_reason: 'end_turn',
    }
    filterMessage({
      type: 'assistant',
      message,
      parent_tool_use_id: null,
      uuid: '1',
      session_id: 's1',
    } as any)

    // Original SDK message must remain unchanged
    expect(originalContent[0].name).toBe('mcp__q__CreateStream')
  })

  it('leaves non-MCP tool names unchanged in assistant messages', () => {
    const message = {
      id: 'msg_1',
      role: 'assistant',
      content: [
        {
          type: 'tool_use',
          id: 'tu_1',
          name: 'AskUserQuestion',
          input: { questions: [] },
        },
      ],
      model: 'claude-sonnet-4-5-20250929',
      stop_reason: 'end_turn',
    }
    const result = filterMessage({
      type: 'assistant',
      message,
      parent_tool_use_id: null,
      uuid: '1',
      session_id: 's1',
    } as any)

    expect((result as any).message.content[0].name).toBe('AskUserQuestion')
  })

  it('strips mcp__ prefix from tool_progress tool names', () => {
    const result = filterMessage({
      type: 'tool_progress',
      tool_name: 'mcp__q__CreateTask',
      tool_use_id: 'tu_1',
      parent_tool_use_id: null,
      elapsed_time_seconds: 2.0,
      uuid: '1',
      session_id: 's1',
    } as any)

    expect(result).toEqual({
      type: 'tool_progress',
      toolName: 'CreateTask',
      toolUseId: 'tu_1',
      elapsedSeconds: 2.0,
    })
  })
})

describe('stripMcpPrefix', () => {
  it('strips mcp__{server}__ prefix to extract tool name', () => {
    expect(stripMcpPrefix('mcp__q__CreateStream')).toBe('CreateStream')
    expect(stripMcpPrefix('mcp__q__CreateTask')).toBe('CreateTask')
  })

  it('leaves non-MCP tool names unchanged', () => {
    expect(stripMcpPrefix('AskUserQuestion')).toBe('AskUserQuestion')
    expect(stripMcpPrefix('Read')).toBe('Read')
    expect(stripMcpPrefix('Bash')).toBe('Bash')
  })

  it('leaves names that contain __ but do not start with mcp__ unchanged', () => {
    expect(stripMcpPrefix('other__server__Tool')).toBe('other__server__Tool')
  })
})

describe('encodeEvent', () => {
  it('produces valid NDJSON (JSON + newline, UTF-8 encoded)', () => {
    const event = { type: 'partial' as const, event: { type: 'message_stop' } }
    const bytes = encodeEvent(event as any)
    const decoded = new TextDecoder().decode(bytes)

    expect(decoded).toBe(JSON.stringify(event) + '\n')
  })

  it('encodes each event as a single line', () => {
    const event = {
      type: 'result' as const,
      subtype: 'success' as const,
      result: 'done',
      costUsd: 0.01,
    }
    const decoded = new TextDecoder().decode(encodeEvent(event))
    const lines = decoded.split('\n')

    // One JSON line + trailing empty string from split
    expect(lines).toHaveLength(2)
    expect(JSON.parse(lines[0])).toEqual(event)
    expect(lines[1]).toBe('')
  })
})

// ---------------------------------------------------------------------------
// Property-based tests — object routing, not string parsing
// ---------------------------------------------------------------------------

// Generate arbitrary SDK message objects for each type
const baseFields = {
  uuid: fc.string(),
  session_id: fc.string(),
  parent_tool_use_id: fc.option(fc.string(), { nil: null }),
}

const streamEventMsg = fc.record({
  type: fc.constant('stream_event' as const),
  event: fc.record({ type: fc.string(), index: fc.nat() }),
  ...baseFields,
})

const toolName = fc.oneof(
  fc.string({ minLength: 1 }), // plain names
  fc
    .tuple(fc.string({ minLength: 1 }), fc.string({ minLength: 1 }))
    .map(([server, tool]) => `mcp__${server}__${tool}`), // MCP names
)

const assistantMsg = fc.record({
  type: fc.constant('assistant' as const),
  message: fc.record({
    role: fc.constant('assistant'),
    content: fc.array(
      fc.oneof(
        fc.record({ type: fc.constant('text'), text: fc.string() }),
        fc.record({
          type: fc.constant('tool_use'),
          id: fc.string(),
          name: toolName,
          input: fc.constant({}),
        }),
      ),
      { maxLength: 5 },
    ),
  }),
  ...baseFields,
})

const toolProgressMsg = fc.record({
  type: fc.constant('tool_progress' as const),
  tool_name: toolName,
  tool_use_id: fc.string(),
  elapsed_time_seconds: fc.nat(1000),
  ...baseFields,
})

const resultMsg = fc.record({
  type: fc.constant('result' as const),
  subtype: fc.constantFrom('success', 'error_max_budget_usd', 'error'),
  result: fc.option(fc.string(), { nil: undefined }),
  errors: fc.option(fc.array(fc.string()), { nil: undefined }),
  total_cost_usd: fc.nat(1000).map((n) => n / 100),
  permission_denials: fc.option(
    fc.array(fc.record({ tool_name: toolName, tool_use_id: fc.string() })),
    { nil: undefined },
  ),
  ...baseFields,
})

const systemTaskMsg = fc.record({
  type: fc.constant('system' as const),
  subtype: fc.constantFrom(
    'task_started',
    'task_progress',
    'task_notification',
  ),
  task_id: fc.string(),
  description: fc.string(),
  status: fc.string(),
  summary: fc.string(),
  last_tool_name: fc.string(),
  usage: fc.record({ tool_uses: fc.nat(), duration_ms: fc.nat() }),
  ...baseFields,
})

const systemOtherMsg = fc.record({
  type: fc.constant('system' as const),
  subtype: fc.constantFrom('init', 'status', 'hook'),
  ...baseFields,
})

const unknownMsg = fc.record({
  type: fc.constantFrom('status', 'hooks', 'queue', 'unknown_future_type'),
  ...baseFields,
})

describe('property-based: filterMessage routing', () => {
  it('stream_event always produces a partial event', () => {
    fc.assert(
      fc.property(streamEventMsg, (msg) => {
        const result = filterMessage(msg as any)
        expect(result).not.toBeNull()
        expect(result!.type).toBe('partial')
      }),
    )
  })

  it('assistant always produces an assistant event', () => {
    fc.assert(
      fc.property(assistantMsg, (msg) => {
        const result = filterMessage(msg as any)
        expect(result).not.toBeNull()
        expect(result!.type).toBe('assistant')
      }),
    )
  })

  it('tool_progress always produces a tool_progress event', () => {
    fc.assert(
      fc.property(toolProgressMsg, (msg) => {
        const result = filterMessage(msg as any)
        expect(result).not.toBeNull()
        expect(result!.type).toBe('tool_progress')
      }),
    )
  })

  it('result always produces a result event', () => {
    fc.assert(
      fc.property(resultMsg, (msg) => {
        const result = filterMessage(msg as any)
        expect(result).not.toBeNull()
        expect(result!.type).toBe('result')
      }),
    )
  })

  it('unknown message types always return null', () => {
    fc.assert(
      fc.property(unknownMsg, (msg) => {
        expect(filterMessage(msg as any)).toBeNull()
      }),
    )
  })

  it('system task events become subagent_events, others return null', () => {
    fc.assert(
      fc.property(systemTaskMsg, (msg) => {
        const result = filterMessage(msg as any)
        expect(result).not.toBeNull()
        expect(result!.type).toBe('subagent_event')
      }),
    )
    fc.assert(
      fc.property(systemOtherMsg, (msg) => {
        expect(filterMessage(msg as any)).toBeNull()
      }),
    )
  })

  it('MCP prefixes are always stripped from tool names in output', () => {
    fc.assert(
      fc.property(assistantMsg, (msg) => {
        const result = filterMessage(msg as any)
        if (!result || result.type !== 'assistant') return

        const content = (result as any).message.content
        if (!Array.isArray(content)) return

        for (const block of content) {
          if (block.type === 'tool_use' && block.name) {
            // Should never start with mcp__ in the output
            expect(block.name.startsWith('mcp__')).toBe(false)
          }
        }
      }),
    )
  })

  it('MCP prefixes are always stripped from tool_progress names', () => {
    fc.assert(
      fc.property(toolProgressMsg, (msg) => {
        const result = filterMessage(msg as any)
        if (!result || result.type !== 'tool_progress') return
        expect((result as any).toolName.startsWith('mcp__')).toBe(false)
      }),
    )
  })

  it('MCP prefixes are always stripped from permission denial tool names', () => {
    fc.assert(
      fc.property(resultMsg, (msg) => {
        const result = filterMessage(msg as any)
        if (!result || result.type !== 'result') return
        const denials = (result as any).permissionDenials
        if (!denials) return
        for (const d of denials) {
          expect(d.toolName.startsWith('mcp__')).toBe(false)
        }
      }),
    )
  })

  it('parentToolUseId is forwarded when present, omitted when null', () => {
    const withParent = fc.record({
      type: fc.constant('stream_event' as const),
      event: fc.record({ type: fc.string() }),
      uuid: fc.string(),
      session_id: fc.string(),
      parent_tool_use_id: fc.string({ minLength: 1 }),
    })
    const withoutParent = fc.record({
      type: fc.constant('stream_event' as const),
      event: fc.record({ type: fc.string() }),
      uuid: fc.string(),
      session_id: fc.string(),
      parent_tool_use_id: fc.constant(null),
    })

    fc.assert(
      fc.property(withParent, (msg) => {
        const result = filterMessage(msg as any)
        expect((result as any).parentToolUseId).toBe(msg.parent_tool_use_id)
      }),
    )
    fc.assert(
      fc.property(withoutParent, (msg) => {
        const result = filterMessage(msg as any)
        expect((result as any).parentToolUseId).toBeUndefined()
      }),
    )
  })
})
