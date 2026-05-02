import type { ChatStreamEvent } from '@/lib/chat/types'
import { describe, expect, it, vi } from 'vitest'

const mockReadFileSync = vi.hoisted(() => vi.fn(() => 'prompt content'))
const mockWaitForAnswer = vi.hoisted(() => vi.fn())
const mockWaitForConfirmation = vi.hoisted(() => vi.fn())
const mockIsSafeBashCommand = vi.hoisted(() => vi.fn())

vi.mock('node:fs', () => ({
  default: { readFileSync: mockReadFileSync },
  readFileSync: mockReadFileSync,
}))

vi.mock('@/lib/chat/pending-questions', () => ({
  waitForAnswer: mockWaitForAnswer,
}))

vi.mock('@/lib/chat/pending-confirmations', () => ({
  waitForConfirmation: mockWaitForConfirmation,
}))

const mockCreateAutomatedCanUseTool = vi.hoisted(() => vi.fn(() => vi.fn()))

vi.mock('./bash-safety.server', () => ({
  isSafeBashCommand: mockIsSafeBashCommand,
  createAutomatedCanUseTool: mockCreateAutomatedCanUseTool,
}))

vi.mock('@/lib/config/config.server', () => ({
  readConfig: vi.fn().mockResolvedValue({}),
}))

vi.mock('@/lib/fs/read.server', () => ({
  readStreamContent: vi.fn().mockResolvedValue({
    playbook: null,
    specs: [],
    samples: [],
    sampleTypes: [],
  }),
  readTaskContent: vi.fn().mockResolvedValue({
    frontmatter: null,
    plan: null,
    progress: null,
    run: null,
    inputs: [],
    files: [],
    outputs: [],
  }),
  listDirectory: vi.fn().mockResolvedValue([]),
}))

import {
  learningAgentOptions,
  planningAgentOptions,
  workingAgentOptions,
} from './config.server'

describe('learningAgentOptions', () => {
  it('uses Opus model with adaptive thinking', async () => {
    const opts = await learningAgentOptions('my-stream', 'session-uuid-1')
    expect(opts.model).toContain('opus')
    expect(opts.thinking).toEqual({ type: 'adaptive' })
  })

  it('sets cwd to the workspace root', async () => {
    const opts = await learningAgentOptions('my-stream', 'session-uuid-1')
    expect(opts.cwd).toMatch(/HappyHQ$/)
  })

  it('uses acceptEdits permission mode', async () => {
    const opts = await learningAgentOptions('my-stream', 'session-uuid-1')
    expect(opts.permissionMode).toBe('acceptEdits')
  })

  it('includes the MCP server', async () => {
    const opts = await learningAgentOptions('my-stream', 'session-uuid-1')
    expect(opts.mcpServers).toHaveProperty('q')
    expect(opts.mcpServers!['q']).toHaveProperty('type', 'sdk')
  })

  it('enables partial messages for streaming', async () => {
    const opts = await learningAgentOptions('my-stream', 'session-uuid-1')
    expect(opts.includePartialMessages).toBe(true)
  })

  it('sets sessionId for new sessions', async () => {
    const opts = await learningAgentOptions('my-stream', 'session-uuid-1')
    expect(opts.sessionId).toBe('session-uuid-1')
    expect(opts.resume).toBeUndefined()
  })

  it('sets resume for resumed sessions', async () => {
    const opts = await learningAgentOptions('my-stream', 'session-uuid-1', {
      resume: true,
    })
    expect(opts.resume).toBe('session-uuid-1')
    expect(opts.sessionId).toBeUndefined()
  })

  it('isolates from user settings', async () => {
    const opts = await learningAgentOptions('my-stream', 'session-uuid-1')
    expect(opts.settingSources).toEqual([])
  })

  it('auto-allows git bash commands', async () => {
    const opts = await learningAgentOptions('my-stream', 'session-uuid-1')
    expect(opts.allowedTools).toContain('Bash(git:*)')
  })

  it('auto-allows CreateTask (non-blocking — renders task card inline)', async () => {
    const opts = await learningAgentOptions('my-stream', 'session-uuid-1')
    expect(opts.allowedTools).toContain('mcp__q__CreateTask')
  })

  it('disables CLI harness auto-memory and tool-search by default', async () => {
    const opts = await learningAgentOptions('my-stream', 'session-uuid-1')
    expect(opts.env).toMatchObject({
      CLAUDE_CODE_DISABLE_AUTO_MEMORY: '1',
      ENABLE_TOOL_SEARCH: 'false',
    })
  })

  it('merges env override with the harness flags', async () => {
    const opts = await learningAgentOptions('my-stream', 'session-uuid-1', {
      env: { ANTHROPIC_API_KEY: 'sk-test-123' },
    })
    expect(opts.env).toMatchObject({
      ANTHROPIC_API_KEY: 'sk-test-123',
      CLAUDE_CODE_DISABLE_AUTO_MEMORY: '1',
      ENABLE_TOOL_SEARCH: 'false',
    })
  })

  it('does not let env override re-enable the harness flags', async () => {
    const opts = await learningAgentOptions('my-stream', 'session-uuid-1', {
      env: {
        CLAUDE_CODE_DISABLE_AUTO_MEMORY: '0',
        ENABLE_TOOL_SEARCH: 'true',
      },
    })
    expect(opts.env).toMatchObject({
      CLAUDE_CODE_DISABLE_AUTO_MEMORY: '1',
      ENABLE_TOOL_SEARCH: 'false',
    })
  })

  describe('canUseTool', () => {
    async function getCanUseTool(
      notifyClient?: (event: ChatStreamEvent) => void,
    ) {
      const opts = await learningAgentOptions('my-stream', 'session-uuid-1', {
        notifyClient,
      })
      return opts.canUseTool!
    }

    function makeContext(ac?: AbortController) {
      const controller = ac ?? new AbortController()
      return { signal: controller.signal, toolUseID: 'tool-use-123' }
    }

    describe('AskUserQuestion', () => {
      it('allows with user answers injected into updatedInput', async () => {
        const userAnswers = { q1: 'yes', q2: 'no' }
        mockWaitForAnswer.mockResolvedValueOnce(userAnswers)

        const canUseTool = await getCanUseTool()
        const input = {
          question: 'Pick one',
          options: [{ label: 'A' }, { label: 'B' }],
        }
        const result = await canUseTool('AskUserQuestion', input, makeContext())

        expect(result).toEqual({
          behavior: 'allow',
          updatedInput: { ...input, answers: userAnswers },
        })
      })

      it('denies when user dismisses the question', async () => {
        mockWaitForAnswer.mockRejectedValueOnce(
          new Error('User denied AskUserQuestion'),
        )

        const canUseTool = await getCanUseTool()
        const result = await canUseTool(
          'AskUserQuestion',
          { question: 'Pick one' },
          makeContext(),
        )

        expect(result).toEqual({
          behavior: 'deny',
          message: 'User dismissed the question',
        })
      })

      it('denies when abort signal fires before user answers', async () => {
        // waitForAnswer never resolves — the abort signal wins the race
        mockWaitForAnswer.mockReturnValueOnce(new Promise(() => {}))

        const ac = new AbortController()
        const canUseTool = await getCanUseTool()
        const promise = canUseTool(
          'AskUserQuestion',
          { question: 'Pick one' },
          makeContext(ac),
        )

        ac.abort()

        const result = await promise
        expect(result).toEqual({
          behavior: 'deny',
          message: 'User dismissed the question',
        })
      })
    })

    describe('safe Bash auto-approve', () => {
      it('auto-allows safe bash commands without user confirmation', async () => {
        mockIsSafeBashCommand.mockReturnValueOnce(true)

        const notifyClient = vi.fn()
        const canUseTool = await getCanUseTool(notifyClient)
        const input = { command: 'cd /path && git status' }
        const result = await canUseTool('Bash', input, makeContext())

        expect(result).toEqual({
          behavior: 'allow',
          updatedInput: input,
        })
        // No confirmation event sent to client
        expect(notifyClient).not.toHaveBeenCalled()
      })

      it('falls through to confirmation for unsafe bash commands', async () => {
        mockIsSafeBashCommand.mockReturnValueOnce(false)
        mockWaitForConfirmation.mockResolvedValueOnce(true)

        const notifyClient = vi.fn()
        const canUseTool = await getCanUseTool(notifyClient)
        const input = { command: 'rm -rf /' }
        const result = await canUseTool('Bash', input, makeContext())

        expect(result.behavior).toBe('allow')
        expect(notifyClient).toHaveBeenCalledWith(
          expect.objectContaining({ type: 'pending_confirmation' }),
        )
      })
    })

    describe('default tool confirmation', () => {
      it('sends pending_confirmation event and allows when user confirms', async () => {
        mockWaitForConfirmation.mockResolvedValueOnce(true)

        const notifyClient = vi.fn()
        const canUseTool = await getCanUseTool(notifyClient)
        const input = { file_path: '/tmp/test.txt', content: 'hello' }
        const result = await canUseTool('Write', input, makeContext())

        expect(notifyClient).toHaveBeenCalledWith({
          type: 'pending_confirmation',
          toolName: 'Write',
          input,
          toolUseId: 'tool-use-123',
        })
        expect(result).toEqual({
          behavior: 'allow',
          updatedInput: input,
        })
      })

      it('denies when user denies the confirmation', async () => {
        mockWaitForConfirmation.mockResolvedValueOnce(false)

        const canUseTool = await getCanUseTool(vi.fn())
        const result = await canUseTool(
          'Write',
          { file_path: '/tmp/test.txt' },
          makeContext(),
        )

        expect(result).toEqual({
          behavior: 'deny',
          message: 'User denied tool',
        })
      })

      it('denies when abort signal fires before user responds', async () => {
        // waitForConfirmation never resolves — the abort signal wins the race
        mockWaitForConfirmation.mockReturnValueOnce(new Promise(() => {}))

        const ac = new AbortController()
        const canUseTool = await getCanUseTool(vi.fn())
        const promise = canUseTool(
          'Write',
          { file_path: '/tmp/test.txt' },
          makeContext(ac),
        )

        ac.abort()

        const result = await promise
        expect(result).toEqual({
          behavior: 'deny',
          message: 'User dismissed tool confirmation',
        })
      })
    })
  })
})

describe('planningAgentOptions', () => {
  it('uses Opus model', async () => {
    const opts = await planningAgentOptions(
      'my-stream',
      'my-task',
      new AbortController(),
    )
    expect(opts.model).toContain('opus')
  })

  it('sets cwd to the workspace root', async () => {
    const opts = await planningAgentOptions(
      'my-stream',
      'my-task',
      new AbortController(),
    )
    expect(opts.cwd).toMatch(/HappyHQ$/)
  })

  it('enforces a budget limit', async () => {
    const opts = await planningAgentOptions(
      'my-stream',
      'my-task',
      new AbortController(),
    )
    expect(opts.maxBudgetUsd).toBeGreaterThan(0)
  })

  it('accepts an abort controller for cancellation', async () => {
    const ac = new AbortController()
    const opts = await planningAgentOptions('my-stream', 'my-task', ac)
    expect(opts.abortController).toBe(ac)
  })

  it('persists sessions by default', async () => {
    const opts = await planningAgentOptions(
      'my-stream',
      'my-task',
      new AbortController(),
    )
    expect(opts.persistSession).toBe(true)
  })

  it('does not include MCP servers', async () => {
    const opts = await planningAgentOptions(
      'my-stream',
      'my-task',
      new AbortController(),
    )
    expect(opts.mcpServers).toBeUndefined()
  })

  it('disables CLI harness auto-memory and tool-search by default', async () => {
    const opts = await planningAgentOptions(
      'my-stream',
      'my-task',
      new AbortController(),
    )
    expect(opts.env).toMatchObject({
      CLAUDE_CODE_DISABLE_AUTO_MEMORY: '1',
      ENABLE_TOOL_SEARCH: 'false',
    })
  })

  it('merges env override with the harness flags', async () => {
    const opts = await planningAgentOptions(
      'my-stream',
      'my-task',
      new AbortController(),
      { env: { ANTHROPIC_API_KEY: 'sk-test-123' } },
    )
    expect(opts.env).toMatchObject({
      ANTHROPIC_API_KEY: 'sk-test-123',
      CLAUDE_CODE_DISABLE_AUTO_MEMORY: '1',
      ENABLE_TOOL_SEARCH: 'false',
    })
  })

  describe('PreToolUse Write/Edit gate', () => {
    type PreHookResult = {
      continue?: boolean
      hookSpecificOutput?: {
        hookEventName: string
        permissionDecision?: string
        permissionDecisionReason?: string
      }
    }

    const callPreHook = async (
      toolName: string,
      filePath?: string,
    ): Promise<PreHookResult> => {
      const opts = await planningAgentOptions(
        'my-stream',
        'my-task',
        new AbortController(),
      )
      const hook = opts.hooks!.PreToolUse![0].hooks[0]
      const result = await hook(
        {
          hook_event_name: 'PreToolUse',
          tool_name: toolName,
          tool_input: filePath !== undefined ? { file_path: filePath } : {},
        } as any,
        undefined,
        { signal: new AbortController().signal },
      )
      return result as PreHookResult
    }

    it('allows Write to plan.md (relative path)', async () => {
      const result = await callPreHook('Write', 'tasks/my-task/plan.md')
      expect(result.hookSpecificOutput).toBeUndefined()
      expect(result.continue).toBe(true)
    })

    it('allows Write to plan.md (absolute path)', async () => {
      const result = await callPreHook(
        'Write',
        '/data/happyhq/tasks/my-task/plan.md',
      )
      expect(result.hookSpecificOutput).toBeUndefined()
      expect(result.continue).toBe(true)
    })

    it('denies Write to outputs/', async () => {
      const result = await callPreHook(
        'Write',
        '/data/happyhq/tasks/my-task/outputs/crm-note.md',
      )
      expect(result.hookSpecificOutput).toMatchObject({
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
      })
      expect(result.hookSpecificOutput!.permissionDecisionReason).toMatch(
        /plan\.md/,
      )
    })

    it('denies Write to a different task', async () => {
      const result = await callPreHook(
        'Write',
        '/data/happyhq/tasks/other-task/plan.md',
      )
      expect(result.hookSpecificOutput).toMatchObject({
        permissionDecision: 'deny',
      })
    })

    it('denies Edit always — even on plan.md', async () => {
      const result = await callPreHook('Edit', 'tasks/my-task/plan.md')
      expect(result.hookSpecificOutput).toMatchObject({
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
      })
      expect(result.hookSpecificOutput!.permissionDecisionReason).toMatch(
        /may not Edit/,
      )
    })

    it('passes through non-Write/Edit tools', async () => {
      const result = await callPreHook('Read', '/anything')
      expect(result.hookSpecificOutput).toBeUndefined()
      expect(result.continue).toBe(true)
    })
  })

  it('includes PostToolUse hook that notifies on Write/Edit', async () => {
    const notifyClient = vi.fn()
    const opts = await planningAgentOptions(
      'my-stream',
      'my-task',
      new AbortController(),
      { notifyClient },
    )
    const hook = opts.hooks!.PostToolUse![0].hooks[0]
    await hook(
      { hook_event_name: 'PostToolUse', tool_name: 'Write' } as any,
      undefined,
      { signal: new AbortController().signal },
    )
    expect(notifyClient).toHaveBeenCalledWith({ type: 'task_content_changed' })

    notifyClient.mockClear()
    await hook(
      { hook_event_name: 'PostToolUse', tool_name: 'Edit' } as any,
      undefined,
      { signal: new AbortController().signal },
    )
    expect(notifyClient).toHaveBeenCalledWith({ type: 'task_content_changed' })
  })

  it('does not notify on non-Write/Edit tools', async () => {
    const notifyClient = vi.fn()
    const opts = await planningAgentOptions(
      'my-stream',
      'my-task',
      new AbortController(),
      { notifyClient },
    )
    const hook = opts.hooks!.PostToolUse![0].hooks[0]
    await hook(
      { hook_event_name: 'PostToolUse', tool_name: 'Read' } as any,
      undefined,
      { signal: new AbortController().signal },
    )
    expect(notifyClient).not.toHaveBeenCalled()
  })

  it('wires createAutomatedCanUseTool for deterministic bash approval', async () => {
    const mockCanUseTool = vi.fn()
    mockCreateAutomatedCanUseTool.mockReturnValueOnce(mockCanUseTool)
    const opts = await planningAgentOptions(
      'my-stream',
      'my-task',
      new AbortController(),
    )
    expect(mockCreateAutomatedCanUseTool).toHaveBeenCalled()
    expect(opts.canUseTool).toBe(mockCanUseTool)
  })

  it('includes Bash(ls:*) in allowedTools', async () => {
    const opts = await planningAgentOptions(
      'my-stream',
      'my-task',
      new AbortController(),
    )
    expect(opts.allowedTools).toContain('Bash(ls:*)')
  })
})

describe('workingAgentOptions', () => {
  it('uses Opus model', async () => {
    const opts = await workingAgentOptions(
      'my-stream',
      'my-task',
      new AbortController(),
    )
    expect(opts.model).toContain('opus')
  })

  it('sets cwd to the workspace root', async () => {
    const opts = await workingAgentOptions(
      'my-stream',
      'my-task',
      new AbortController(),
    )
    expect(opts.cwd).toMatch(/HappyHQ$/)
  })

  it('auto-allows exploration tools and git bash commands', async () => {
    const opts = await workingAgentOptions(
      'my-stream',
      'my-task',
      new AbortController(),
    )
    expect(opts.allowedTools).toContain('Read')
    expect(opts.allowedTools).toContain('Glob')
    expect(opts.allowedTools).toContain('Grep')
    expect(opts.allowedTools).toContain('Task')
    expect(opts.allowedTools).toContain('Bash(git:*)')
  })

  it('enforces a budget limit', async () => {
    const opts = await workingAgentOptions(
      'my-stream',
      'my-task',
      new AbortController(),
    )
    expect(opts.maxBudgetUsd).toBeGreaterThan(0)
  })

  it('persists sessions by default', async () => {
    const opts = await workingAgentOptions(
      'my-stream',
      'my-task',
      new AbortController(),
    )
    expect(opts.persistSession).toBe(true)
  })

  it('isolates from user settings', async () => {
    const opts = await workingAgentOptions(
      'my-stream',
      'my-task',
      new AbortController(),
    )
    expect(opts.settingSources).toEqual([])
  })

  it('disables CLI harness auto-memory and tool-search by default', async () => {
    const opts = await workingAgentOptions(
      'my-stream',
      'my-task',
      new AbortController(),
    )
    expect(opts.env).toMatchObject({
      CLAUDE_CODE_DISABLE_AUTO_MEMORY: '1',
      ENABLE_TOOL_SEARCH: 'false',
    })
  })

  it('merges env override with the harness flags', async () => {
    const opts = await workingAgentOptions(
      'my-stream',
      'my-task',
      new AbortController(),
      { env: { ANTHROPIC_API_KEY: 'sk-test-123' } },
    )
    expect(opts.env).toMatchObject({
      ANTHROPIC_API_KEY: 'sk-test-123',
      CLAUDE_CODE_DISABLE_AUTO_MEMORY: '1',
      ENABLE_TOOL_SEARCH: 'false',
    })
  })

  it('includes PostToolUse hook that notifies on Write/Edit', async () => {
    const notifyClient = vi.fn()
    const opts = await workingAgentOptions(
      'my-stream',
      'my-task',
      new AbortController(),
      { notifyClient },
    )
    const hook = opts.hooks!.PostToolUse![0].hooks[0]
    await hook(
      { hook_event_name: 'PostToolUse', tool_name: 'Write' } as any,
      undefined,
      { signal: new AbortController().signal },
    )
    expect(notifyClient).toHaveBeenCalledWith({ type: 'task_content_changed' })

    notifyClient.mockClear()
    await hook(
      { hook_event_name: 'PostToolUse', tool_name: 'Edit' } as any,
      undefined,
      { signal: new AbortController().signal },
    )
    expect(notifyClient).toHaveBeenCalledWith({ type: 'task_content_changed' })
  })

  it('does not notify on non-Write/Edit tools', async () => {
    const notifyClient = vi.fn()
    const opts = await workingAgentOptions(
      'my-stream',
      'my-task',
      new AbortController(),
      { notifyClient },
    )
    const hook = opts.hooks!.PostToolUse![0].hooks[0]
    await hook(
      { hook_event_name: 'PostToolUse', tool_name: 'Read' } as any,
      undefined,
      { signal: new AbortController().signal },
    )
    expect(notifyClient).not.toHaveBeenCalled()
  })

  it('wires createAutomatedCanUseTool for deterministic bash approval', async () => {
    const mockCanUseTool = vi.fn()
    mockCreateAutomatedCanUseTool.mockReturnValueOnce(mockCanUseTool)
    const opts = await workingAgentOptions(
      'my-stream',
      'my-task',
      new AbortController(),
    )
    expect(mockCreateAutomatedCanUseTool).toHaveBeenCalled()
    expect(opts.canUseTool).toBe(mockCanUseTool)
  })

  it('includes Bash(ls:*) in allowedTools', async () => {
    const opts = await workingAgentOptions(
      'my-stream',
      'my-task',
      new AbortController(),
    )
    expect(opts.allowedTools).toContain('Bash(ls:*)')
  })
})
