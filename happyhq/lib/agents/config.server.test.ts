import { describe, expect, it, vi } from 'vitest'

const mockReadFileSync = vi.hoisted(() => vi.fn(() => 'prompt content'))

vi.mock('node:fs', () => ({
  default: { readFileSync: mockReadFileSync },
  readFileSync: mockReadFileSync,
}))

const mockCreateAutomatedCanUseTool = vi.hoisted(() => vi.fn(() => vi.fn()))

vi.mock('./bash-safety.server', () => ({
  isSafeBashCommand: vi.fn(),
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

import { planningAgentOptions, workingAgentOptions } from './config.server'

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

  it('preserves process.env when no override is given', async () => {
    // Regression: the SDK passes opts.env verbatim to the spawned process, so
    // when there's no override we must spread process.env ourselves. A bug
    // where the spread was conditional stripped ANTHROPIC_API_KEY, HOME, and
    // PATH on the env-var auth path and the agent failed with "Not logged in".
    const original = process.env.ANTHROPIC_API_KEY
    process.env.ANTHROPIC_API_KEY = 'sk-from-process-env'
    try {
      const opts = await planningAgentOptions(
        'my-stream',
        'my-task',
        new AbortController(),
      )
      expect(opts.env).toMatchObject({
        ANTHROPIC_API_KEY: 'sk-from-process-env',
        PATH: process.env.PATH,
        HOME: process.env.HOME,
        CLAUDE_CODE_DISABLE_AUTO_MEMORY: '1',
        ENABLE_TOOL_SEARCH: 'false',
      })
    } finally {
      if (original === undefined) delete process.env.ANTHROPIC_API_KEY
      else process.env.ANTHROPIC_API_KEY = original
    }
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

  it('preserves process.env when no override is given', async () => {
    // Regression: the SDK passes opts.env verbatim to the spawned process, so
    // when there's no override we must spread process.env ourselves. A bug
    // where the spread was conditional stripped ANTHROPIC_API_KEY, HOME, and
    // PATH on the env-var auth path and the agent failed with "Not logged in".
    const original = process.env.ANTHROPIC_API_KEY
    process.env.ANTHROPIC_API_KEY = 'sk-from-process-env'
    try {
      const opts = await workingAgentOptions(
        'my-stream',
        'my-task',
        new AbortController(),
      )
      expect(opts.env).toMatchObject({
        ANTHROPIC_API_KEY: 'sk-from-process-env',
        PATH: process.env.PATH,
        HOME: process.env.HOME,
        CLAUDE_CODE_DISABLE_AUTO_MEMORY: '1',
        ENABLE_TOOL_SEARCH: 'false',
      })
    } finally {
      if (original === undefined) delete process.env.ANTHROPIC_API_KEY
      else process.env.ANTHROPIC_API_KEY = original
    }
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
