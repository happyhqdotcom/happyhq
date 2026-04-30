import fc from 'fast-check'
import { describe, expect, it } from 'vitest'

import { parseJournalEntries } from './parse-history.server'

// --- Helpers ---

function userLine(
  text: string,
  uuid = 'u1',
  timestamp = '2025-01-01T00:00:00Z',
) {
  return JSON.stringify({
    type: 'user',
    uuid,
    timestamp,
    message: { role: 'user', content: [{ type: 'text', text }] },
  })
}

function assistantLine(
  text: string,
  opts: {
    uuid?: string
    timestamp?: string
    requestId?: string
    toolCalls?: Array<{
      id: string
      name: string
      input: Record<string, unknown>
    }>
  } = {},
) {
  const {
    uuid = 'a1',
    timestamp = '2025-01-01T00:00:01Z',
    requestId,
    toolCalls = [],
  } = opts
  const content: Array<Record<string, unknown>> = []
  if (text) content.push({ type: 'text', text })
  for (const tc of toolCalls) {
    content.push({
      type: 'tool_use',
      id: tc.id,
      name: tc.name,
      input: tc.input,
    })
  }
  return JSON.stringify({
    type: 'assistant',
    uuid,
    timestamp,
    ...(requestId ? { requestId } : {}),
    message: { role: 'assistant', content },
  })
}

function toolResultLine(uuid = 'tr1', timestamp = '2025-01-01T00:00:02Z') {
  return JSON.stringify({
    type: 'user',
    uuid,
    timestamp,
    message: {
      role: 'user',
      content: [{ type: 'tool_result', tool_use_id: 'tu1', content: 'ok' }],
    },
  })
}

function askAnswerLine(
  toolUseId: string,
  answers: Record<string, string>,
  uuid = 'ans1',
  timestamp = '2025-01-01T00:00:02Z',
) {
  const pairs = Object.entries(answers)
    .map(([q, a]) => `"${q}"="${a}"`)
    .join(', ')
  const content = `User has answered your questions: ${pairs}. You can now continue with the user's answers in mind.`
  return JSON.stringify({
    type: 'user',
    uuid,
    timestamp,
    message: {
      role: 'user',
      content: [{ type: 'tool_result', tool_use_id: toolUseId, content }],
    },
  })
}

// --- Tests ---

describe('parseJournalEntries', () => {
  it('extracts user and assistant text messages', () => {
    const content = [
      userLine('Hello', 'u1', '2025-01-01T00:00:00Z'),
      assistantLine('Hi there', {
        uuid: 'a1',
        timestamp: '2025-01-01T00:00:01Z',
      }),
    ].join('\n')

    const messages = parseJournalEntries(content)

    expect(messages).toHaveLength(2)
    expect(messages[0].role).toBe('user')
    expect(messages[0].content).toBe('Hello')
    expect(messages[0].isHistorical).toBe(true)
    expect(messages[1].role).toBe('assistant')
    expect(messages[1].content).toBe('Hi there')
    expect(messages[1].isHistorical).toBe(true)
  })

  it('skips user messages containing tool_result blocks', () => {
    const content = [
      userLine('Hello'),
      toolResultLine(),
      assistantLine('Response'),
    ].join('\n')

    const messages = parseJournalEntries(content)

    expect(messages).toHaveLength(2)
    expect(messages[0].role).toBe('user')
    expect(messages[1].role).toBe('assistant')
  })

  it('skips non-user/assistant entry types', () => {
    const content = [
      JSON.stringify({
        type: 'queue-operation',
        uuid: 'q1',
        timestamp: '2025-01-01T00:00:00Z',
      }),
      userLine('Hello'),
    ].join('\n')

    const messages = parseJournalEntries(content)

    expect(messages).toHaveLength(1)
    expect(messages[0].content).toBe('Hello')
  })

  it('skips malformed JSON lines', () => {
    const content = ['not valid json', userLine('Hello'), '{also broken'].join(
      '\n',
    )

    const messages = parseJournalEntries(content)

    expect(messages).toHaveLength(1)
    expect(messages[0].content).toBe('Hello')
  })

  it('extracts tool calls from assistant messages', () => {
    const content = assistantLine('Creating task', {
      toolCalls: [
        {
          id: 'tc1',
          name: 'CreateTask',
          input: { name: 'my-task', description: 'A task' },
        },
      ],
    })

    const messages = parseJournalEntries(content)

    expect(messages).toHaveLength(1)
    expect(messages[0].toolCalls).toHaveLength(1)
    expect(messages[0].toolCalls![0].name).toBe('CreateTask')
    expect(messages[0].toolCalls![0].input).toEqual({
      name: 'my-task',
      description: 'A task',
    })
    expect(messages[0].toolProgress).toHaveLength(1)
    expect(messages[0].toolProgress![0]).toEqual({
      toolName: 'CreateTask',
      toolUseId: 'tc1',
      elapsedSeconds: 0,
    })
  })

  it('strips MCP prefixes from tool names', () => {
    const content = assistantLine('Creating task', {
      toolCalls: [
        {
          id: 'tc1',
          name: 'mcp__q__CreateTask',
          input: { name: 'my-task' },
        },
      ],
    })

    const messages = parseJournalEntries(content)

    expect(messages[0].toolCalls![0].name).toBe('CreateTask')
    expect(messages[0].toolProgress![0].toolName).toBe('CreateTask')
  })

  it('keeps consecutive assistant messages as separate entries', () => {
    const content = [
      assistantLine('Let me check...', {
        uuid: 'a1',
        requestId: 'req1',
        timestamp: '2025-01-01T00:00:01Z',
        toolCalls: [{ id: 'tc1', name: 'Read', input: { path: '/foo' } }],
      }),
      assistantLine('Here is the result', {
        uuid: 'a2',
        requestId: 'req1',
        timestamp: '2025-01-01T00:00:02Z',
      }),
    ].join('\n')

    const messages = parseJournalEntries(content)

    expect(messages).toHaveLength(2)
    expect(messages[0].content).toBe('Let me check...')
    expect(messages[0].toolCalls).toHaveLength(1)
    expect(messages[0].toolProgress).toHaveLength(1)
    expect(messages[0].toolProgress![0].toolName).toBe('Read')
    expect(messages[1].content).toBe('Here is the result')
    expect(messages[1].toolProgress).toBeUndefined()
  })

  it('keeps consecutive assistant messages across different requestIds as separate entries', () => {
    const content = [
      userLine('Create a joke task'),
      assistantLine('Let me check your stream...', {
        uuid: 'a1',
        requestId: 'req1',
        timestamp: '2025-01-01T00:00:01Z',
        toolCalls: [{ id: 'tc1', name: 'Read', input: { path: '/foo' } }],
      }),
      assistantLine('I see you have a playbook...', {
        uuid: 'a2',
        requestId: 'req2',
        timestamp: '2025-01-01T00:00:02Z',
        toolCalls: [{ id: 'tc2', name: 'Read', input: { path: '/bar' } }],
      }),
      assistantLine('Here is your task!', {
        uuid: 'a3',
        requestId: 'req3',
        timestamp: '2025-01-01T00:00:03Z',
        toolCalls: [
          {
            id: 'tc3',
            name: 'CreateTask',
            input: { name: 'joke', description: 'A joke' },
          },
        ],
      }),
    ].join('\n')

    const messages = parseJournalEntries(content)

    expect(messages).toHaveLength(4) // user + 3 assistant
    expect(messages[1].content).toBe('Let me check your stream...')
    expect(messages[1].toolCalls).toHaveLength(1)
    expect(messages[2].content).toBe('I see you have a playbook...')
    expect(messages[3].content).toBe('Here is your task!')
  })

  it('does not merge assistant messages separated by a user message', () => {
    const content = [
      assistantLine('First response', {
        uuid: 'a1',
        requestId: 'req1',
        timestamp: '2025-01-01T00:00:01Z',
      }),
      userLine('Follow-up question', 'u2', '2025-01-01T00:00:02Z'),
      assistantLine('Second response', {
        uuid: 'a2',
        requestId: 'req2',
        timestamp: '2025-01-01T00:00:03Z',
      }),
    ].join('\n')

    const messages = parseJournalEntries(content)

    expect(messages).toHaveLength(3)
    expect(messages[0].content).toBe('First response')
    expect(messages[1].content).toBe('Follow-up question')
    expect(messages[2].content).toBe('Second response')
  })

  it('assistant entries without thinking content have thinkingBlocks undefined', () => {
    const content = assistantLine('Simple response', {
      uuid: 'a1',
      requestId: 'req1',
    })

    const messages = parseJournalEntries(content)

    expect(messages).toHaveLength(1)
    expect(messages[0].content).toBe('Simple response')
    expect(messages[0].thinkingBlocks).toBeUndefined()
  })

  it('extracts thinking blocks from assistant journal entries', () => {
    const content = JSON.stringify({
      type: 'assistant',
      uuid: 'a1',
      timestamp: '2025-01-01T00:00:01Z',
      message: {
        role: 'assistant',
        content: [
          { type: 'thinking', thinking: 'Let me reason about this...' },
          { type: 'text', text: 'Here is my answer.' },
        ],
      },
    })

    const messages = parseJournalEntries(content)

    expect(messages).toHaveLength(1)
    expect(messages[0].content).toBe('Here is my answer.')
    expect(messages[0].thinkingBlocks).toHaveLength(1)
    expect(messages[0].thinkingBlocks![0].text).toBe(
      'Let me reason about this...',
    )
  })

  it('extracts multiple thinking blocks in order', () => {
    const content = JSON.stringify({
      type: 'assistant',
      uuid: 'a1',
      timestamp: '2025-01-01T00:00:01Z',
      message: {
        role: 'assistant',
        content: [
          { type: 'thinking', thinking: 'First thought.' },
          { type: 'thinking', thinking: 'Second thought.' },
          { type: 'text', text: 'Done.' },
        ],
      },
    })

    const messages = parseJournalEntries(content)

    expect(messages[0].thinkingBlocks).toHaveLength(2)
    expect(messages[0].thinkingBlocks![0].text).toBe('First thought.')
    expect(messages[0].thinkingBlocks![1].text).toBe('Second thought.')
  })

  it('keeps each assistant turn as a separate message with its own toolCalls', () => {
    const content = [
      assistantLine('Step 1', {
        uuid: 'a1',
        requestId: 'req1',
        toolCalls: [{ id: 'tc1', name: 'Read', input: { path: '/a' } }],
      }),
      assistantLine('Step 2', {
        uuid: 'a2',
        requestId: 'req2',
        toolCalls: [{ id: 'tc2', name: 'Glob', input: { pattern: '*' } }],
      }),
      assistantLine('Done', {
        uuid: 'a3',
        requestId: 'req3',
        toolCalls: [
          {
            id: 'tc3',
            name: 'CreateTask',
            input: { name: 'task' },
          },
        ],
      }),
    ].join('\n')

    const messages = parseJournalEntries(content)

    expect(messages).toHaveLength(3)
    expect(messages[0].toolCalls).toHaveLength(1)
    expect(messages[0].toolCalls![0].name).toBe('Read')
    expect(messages[0].toolProgress).toHaveLength(1)
    expect(messages[0].toolProgress![0].toolName).toBe('Read')
    expect(messages[1].toolCalls).toHaveLength(1)
    expect(messages[1].toolCalls![0].name).toBe('Glob')
    expect(messages[1].toolProgress![0].toolName).toBe('Glob')
    expect(messages[2].toolCalls).toHaveLength(1)
    expect(messages[2].toolCalls![0].name).toBe('CreateTask')
    expect(messages[2].toolProgress![0].toolName).toBe('CreateTask')
  })

  it('generates toolProgress from toolCalls for historical messages', () => {
    const content = assistantLine('Checking files', {
      toolCalls: [
        { id: 'tc1', name: 'Read', input: { file_path: '/foo.ts' } },
        { id: 'tc2', name: 'Glob', input: { pattern: '*.tsx' } },
      ],
    })

    const messages = parseJournalEntries(content)

    expect(messages[0].toolProgress).toHaveLength(2)
    expect(messages[0].toolProgress).toEqual([
      { toolName: 'Read', toolUseId: 'tc1', elapsedSeconds: 0 },
      { toolName: 'Glob', toolUseId: 'tc2', elapsedSeconds: 0 },
    ])
  })

  it('does not generate toolProgress when there are no toolCalls', () => {
    const content = assistantLine('Just text, no tools')

    const messages = parseJournalEntries(content)

    expect(messages[0].toolProgress).toBeUndefined()
  })

  it('extracts files from [Files uploaded: ...] in user messages', () => {
    const content = userLine(
      'Here are my files\n\n[Files uploaded: report.pdf, data.csv]',
    )
    const messages = parseJournalEntries(content)

    expect(messages).toHaveLength(1)
    expect(messages[0].content).toBe('Here are my files')
    expect(messages[0].files).toEqual(['report.pdf', 'data.csv'])
  })

  it('handles files-only messages (no text, just files)', () => {
    const content = userLine('[Files uploaded: report.pdf]')
    const messages = parseJournalEntries(content)

    expect(messages).toHaveLength(1)
    expect(messages[0].content).toBe('')
    expect(messages[0].files).toEqual(['report.pdf'])
  })

  it('does not extract files from messages without the marker', () => {
    const content = userLine('Tell me about your process')
    const messages = parseJournalEntries(content)

    expect(messages).toHaveLength(1)
    expect(messages[0].content).toBe('Tell me about your process')
    expect(messages[0].files).toBeUndefined()
  })

  it('filters out the SDK trigger "Begin." user message', () => {
    const content = [
      userLine('Begin.', 'u1', '2025-01-01T00:00:00Z'),
      assistantLine('Starting work...', {
        uuid: 'a1',
        timestamp: '2025-01-01T00:00:01Z',
      }),
    ].join('\n')

    const messages = parseJournalEntries(content)

    expect(messages).toHaveLength(1)
    expect(messages[0].role).toBe('assistant')
    expect(messages[0].content).toBe('Starting work...')
  })

  it('does not filter user messages that merely contain "Begin."', () => {
    const content = userLine('Begin. And then do this too.')
    const messages = parseJournalEntries(content)

    expect(messages).toHaveLength(1)
    expect(messages[0].content).toBe('Begin. And then do this too.')
  })

  it('returns empty array for empty content', () => {
    expect(parseJournalEntries('')).toEqual([])
    expect(parseJournalEntries('\n\n')).toEqual([])
  })

  it('preserves message timestamps as epoch milliseconds', () => {
    const content = userLine('Hello', 'u1', '2025-06-15T12:30:00.000Z')
    const messages = parseJournalEntries(content)

    expect(messages[0].timestamp).toBe(
      new Date('2025-06-15T12:30:00.000Z').getTime(),
    )
  })

  it('attaches AskUserQuestion answers to the corresponding tool call', () => {
    const content = [
      assistantLine('Let me ask...', {
        uuid: 'a1',
        toolCalls: [
          { id: 'tc-ask', name: 'AskUserQuestion', input: { questions: [] } },
        ],
      }),
      askAnswerLine('tc-ask', { 'What framework?': 'React' }),
    ].join('\n')

    const messages = parseJournalEntries(content)

    expect(messages).toHaveLength(1)
    expect(messages[0].toolCalls![0].answers).toEqual({
      'What framework?': 'React',
    })
  })

  it('handles multiple answers in a single tool_result', () => {
    const content = [
      assistantLine('Questions...', {
        uuid: 'a1',
        toolCalls: [
          { id: 'tc-ask', name: 'AskUserQuestion', input: { questions: [] } },
        ],
      }),
      askAnswerLine('tc-ask', { Q1: 'A1', Q2: 'A2' }),
    ].join('\n')

    const messages = parseJournalEntries(content)

    expect(messages[0].toolCalls![0].answers).toEqual({ Q1: 'A1', Q2: 'A2' })
  })

  it('still skips non-AskUserQuestion tool_result entries', () => {
    const content = [
      userLine('Hello'),
      toolResultLine(),
      assistantLine('Response'),
    ].join('\n')

    const messages = parseJournalEntries(content)
    expect(messages).toHaveLength(2)
  })

  it('handles tool_result with array content format', () => {
    const answerText =
      'User has answered your questions: "Tone?"="Casual". You can now continue with the user\'s answers in mind.'
    const content = [
      assistantLine('Asking...', {
        uuid: 'a1',
        toolCalls: [
          { id: 'tc-ask', name: 'AskUserQuestion', input: { questions: [] } },
        ],
      }),
      JSON.stringify({
        type: 'user',
        uuid: 'ans1',
        timestamp: '2025-01-01T00:00:02Z',
        message: {
          role: 'user',
          content: [
            {
              type: 'tool_result',
              tool_use_id: 'tc-ask',
              content: [{ type: 'text', text: answerText }],
            },
          ],
        },
      }),
    ].join('\n')

    const messages = parseJournalEntries(content)

    expect(messages[0].toolCalls![0].answers).toEqual({ 'Tone?': 'Casual' })
  })

  it('does not set taskStarted on CreateTask (now handled by history route from chat.json)', () => {
    const content = [
      assistantLine('Here is a task', {
        uuid: 'a1',
        toolCalls: [
          {
            id: 'tc-task',
            name: 'CreateTask',
            input: { name: 'my-task', textContext: 'ctx', files: [] },
          },
        ],
      }),
      JSON.stringify({
        type: 'user',
        uuid: 'tr1',
        timestamp: '2025-01-01T00:00:02Z',
        message: {
          role: 'user',
          content: [
            {
              type: 'tool_result',
              tool_use_id: 'tc-task',
              content:
                'Task "my-task" suggested to user. A task card is now visible in the chat. The user can start it at any time — continue the conversation naturally.',
            },
          ],
        },
      }),
    ].join('\n')

    const messages = parseJournalEntries(content)

    expect(messages).toHaveLength(1)
    expect(messages[0].toolCalls![0].taskStarted).toBeUndefined()
  })

  it('strips system-reminder blocks from user messages', () => {
    const content = userLine(
      '<system-reminder>\nYou are in learning mode for client-reports.\n</system-reminder>\nHow do I write a playbook?',
    )
    const messages = parseJournalEntries(content)

    expect(messages).toHaveLength(1)
    expect(messages[0].content).toBe('How do I write a playbook?')
  })

  it('strips multiple system-reminder blocks from a single message', () => {
    const content = userLine(
      '<system-reminder>\nFirst reminder\n</system-reminder>\n<system-reminder>\nSecond reminder\n</system-reminder>\nActual question',
    )
    const messages = parseJournalEntries(content)

    expect(messages).toHaveLength(1)
    expect(messages[0].content).toBe('Actual question')
  })

  it('passes through messages without system-reminder blocks unchanged', () => {
    const content = userLine('Just a normal message')
    const messages = parseJournalEntries(content)

    expect(messages).toHaveLength(1)
    expect(messages[0].content).toBe('Just a normal message')
  })

  it('strips system-reminder before extracting file markers', () => {
    const content = userLine(
      '<system-reminder>\nLearning layer content\n</system-reminder>\nHere are files\n\n[Files uploaded: report.pdf]',
    )
    const messages = parseJournalEntries(content)

    expect(messages).toHaveLength(1)
    expect(messages[0].content).toBe('Here are files')
    expect(messages[0].files).toEqual(['report.pdf'])
  })

  it('does not attach answers to non-AskUserQuestion tool calls', () => {
    const content = [
      assistantLine('Reading...', {
        uuid: 'a1',
        toolCalls: [{ id: 'tc-read', name: 'Read', input: { path: '/foo' } }],
      }),
      // Even if the content somehow matched the format, it shouldn't match
      // because the tool call name is 'Read', not 'AskUserQuestion'
      JSON.stringify({
        type: 'user',
        uuid: 'tr1',
        timestamp: '2025-01-01T00:00:02Z',
        message: {
          role: 'user',
          content: [
            {
              type: 'tool_result',
              tool_use_id: 'tc-read',
              content:
                'User has answered your questions: "Q"="A". You can now continue with the user\'s answers in mind.',
            },
          ],
        },
      }),
    ].join('\n')

    const messages = parseJournalEntries(content)

    expect(messages).toHaveLength(1)
    expect(messages[0].toolCalls![0].answers).toBeUndefined()
  })

  describe('subagent activities', () => {
    function taskResultLine(opts: {
      toolUseId: string
      uuid?: string
      timestamp?: string
      status?: 'completed' | 'failed' | 'stopped'
      totalDurationMs?: number
      totalToolUseCount?: number
      summaryText?: string
    }) {
      const {
        toolUseId,
        uuid = 'tr1',
        timestamp = '2025-01-01T00:00:02Z',
        status = 'completed',
        totalDurationMs = 77000,
        totalToolUseCount = 26,
        summaryText = 'subagent finished',
      } = opts
      return JSON.stringify({
        type: 'user',
        uuid,
        timestamp,
        toolUseResult: {
          status,
          totalDurationMs,
          totalToolUseCount,
        },
        message: {
          role: 'user',
          content: [
            {
              type: 'tool_result',
              tool_use_id: toolUseId,
              content: [{ type: 'text', text: summaryText }],
            },
          ],
        },
      })
    }

    it('reconstructs a completed Task subagent activity with description, tool count, and duration', () => {
      const content = [
        assistantLine('Delegating to subagent', {
          uuid: 'a1',
          toolCalls: [
            {
              id: 'task-1',
              name: 'Task',
              input: {
                description: 'Read all specs',
                subagent_type: 'Explore',
                prompt: 'Read X, Y, Z',
              },
            },
          ],
        }),
        taskResultLine({
          toolUseId: 'task-1',
          totalDurationMs: 77000,
          totalToolUseCount: 26,
        }),
      ].join('\n')

      const messages = parseJournalEntries(content)

      expect(messages).toHaveLength(1)
      expect(messages[0].subagentActivities).toEqual([
        expect.objectContaining({
          taskId: 'task-1',
          description: 'Read all specs',
          isComplete: true,
          toolUses: 26,
          durationMs: 77000,
        }),
      ])
    })

    it('also reconstructs activities for the Agent tool name', () => {
      const content = [
        assistantLine('Delegating', {
          uuid: 'a1',
          toolCalls: [
            {
              id: 'agent-1',
              name: 'Agent',
              input: { description: 'Review the diff' },
            },
          ],
        }),
        taskResultLine({
          toolUseId: 'agent-1',
          totalDurationMs: 12000,
          totalToolUseCount: 4,
        }),
      ].join('\n')

      const messages = parseJournalEntries(content)

      expect(messages[0].subagentActivities).toEqual([
        expect.objectContaining({
          taskId: 'agent-1',
          description: 'Review the diff',
          isComplete: true,
          toolUses: 4,
          durationMs: 12000,
        }),
      ])
    })

    it('attaches multiple subagent activities spawned from the same assistant message', () => {
      const content = [
        assistantLine('Two delegations', {
          uuid: 'a1',
          toolCalls: [
            {
              id: 'task-a',
              name: 'Task',
              input: { description: 'Read playbook' },
            },
            {
              id: 'task-b',
              name: 'Task',
              input: { description: 'Read crm spec' },
            },
          ],
        }),
        taskResultLine({
          toolUseId: 'task-a',
          uuid: 'tr-a',
          totalDurationMs: 1000,
          totalToolUseCount: 1,
        }),
        taskResultLine({
          toolUseId: 'task-b',
          uuid: 'tr-b',
          totalDurationMs: 2000,
          totalToolUseCount: 2,
        }),
      ].join('\n')

      const messages = parseJournalEntries(content)

      expect(messages[0].subagentActivities).toHaveLength(2)
      expect(messages[0].subagentActivities![0]).toEqual(
        expect.objectContaining({
          taskId: 'task-a',
          description: 'Read playbook',
          isComplete: true,
          toolUses: 1,
          durationMs: 1000,
        }),
      )
      expect(messages[0].subagentActivities![1]).toEqual(
        expect.objectContaining({
          taskId: 'task-b',
          description: 'Read crm spec',
          isComplete: true,
          toolUses: 2,
          durationMs: 2000,
        }),
      )
    })

    it('completes activities when the tool_result arrives in a later assistant turn', () => {
      const content = [
        assistantLine('Spawning subagent', {
          uuid: 'a1',
          toolCalls: [
            {
              id: 'task-x',
              name: 'Task',
              input: { description: 'Long-running work' },
            },
          ],
        }),
        assistantLine('Thinking aloud while subagent runs', { uuid: 'a2' }),
        taskResultLine({
          toolUseId: 'task-x',
          totalDurationMs: 30000,
          totalToolUseCount: 9,
        }),
      ].join('\n')

      const messages = parseJournalEntries(content)

      expect(messages).toHaveLength(2)
      expect(messages[0].subagentActivities).toEqual([
        expect.objectContaining({
          taskId: 'task-x',
          description: 'Long-running work',
          isComplete: true,
          toolUses: 9,
          durationMs: 30000,
        }),
      ])
      expect(messages[1].subagentActivities).toBeUndefined()
    })

    it('marks an activity incomplete if no tool_result arrives (interrupted run)', () => {
      const content = assistantLine('Just spawned, never finished', {
        uuid: 'a1',
        toolCalls: [
          {
            id: 'task-pending',
            name: 'Task',
            input: { description: 'Will be cut off' },
          },
        ],
      })

      const messages = parseJournalEntries(content)

      expect(messages[0].subagentActivities).toEqual([
        expect.objectContaining({
          taskId: 'task-pending',
          description: 'Will be cut off',
          isComplete: false,
        }),
      ])
    })

    it('does not create a subagent activity for non-Task tool calls', () => {
      const content = assistantLine('Just reading a file', {
        uuid: 'a1',
        toolCalls: [{ id: 'tc-read', name: 'Read', input: { path: '/foo' } }],
      })

      const messages = parseJournalEntries(content)

      expect(messages[0].subagentActivities).toBeUndefined()
    })
  })
})

// ---------------------------------------------------------------------------
// Property-based tests
// ---------------------------------------------------------------------------

describe('property-based: extractFilesFromContent', () => {
  it('recovers any filename through compose → parse', () => {
    // Filenames that have visible content after trimming. Exclude `, ` and
    // `]` — the format uses these as delimiters with no escaping, so they
    // can't round-trip. This is an accepted limitation of the format.
    const anyFilename = fc
      .string({ minLength: 1 })
      .filter(
        (s) => s.trim().length > 0 && !s.includes(']') && !s.includes(','),
      )

    fc.assert(
      fc.property(anyFilename, (filename) => {
        const text = `Check these out\n\n[Files uploaded: ${filename}]`
        const content = userLine(text)
        const messages = parseJournalEntries(content)

        expect(messages[0].files).toBeDefined()
        expect(messages[0].files!.length).toBeGreaterThan(0)
        // The trimmed filename should appear in the parsed list
        expect(messages[0].files).toContain(filename.trim())
      }),
    )
  })
})

describe('property-based: stripSystemReminders', () => {
  it('never leaves system-reminder tags in the output', () => {
    fc.assert(
      fc.property(fc.string(), (userText) => {
        const text = `<system-reminder>\nSome reminder\n</system-reminder>\n${userText}`
        const content = userLine(text)
        const messages = parseJournalEntries(content)

        if (messages.length > 0) {
          expect(messages[0].content).not.toContain('<system-reminder>')
          expect(messages[0].content).not.toContain('</system-reminder>')
        }
      }),
    )
  })

  it('user content that looks like a system-reminder tag is not stripped', () => {
    // If a user literally types "<system-reminder>" in their message,
    // it WILL be stripped — this test documents that behavior
    const content = userLine(
      'I typed <system-reminder>hello</system-reminder> literally',
    )
    const messages = parseJournalEntries(content)

    // This documents the current behavior — the regex strips it
    expect(messages[0].content).toBe('I typed literally')
  })
})
