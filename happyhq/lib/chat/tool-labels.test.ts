import { reportError } from '@/lib/report-error'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getToolDetail, getToolLabel } from './tool-labels'
import type { ToolCall } from './types'

vi.mock('@/lib/report-error', () => ({
  reportError: vi.fn(),
}))

// --- getToolLabel ---

describe('getToolLabel', () => {
  beforeEach(() => {
    vi.mocked(reportError).mockClear()
  })

  it('returns null for hidden tools (they have dedicated UI cards)', () => {
    expect(getToolLabel('AskUserQuestion')).toBeNull()
    expect(getToolLabel('CreateTask')).toBeNull()
  })

  it('maps known tool names to gerund-voiced labels', () => {
    expect(getToolLabel('Read')).toBe('Reading')
    expect(getToolLabel('Glob')).toBe('Searching files')
    expect(getToolLabel('Write')).toBe('Writing')
    expect(getToolLabel('Edit')).toBe('Updating')
    expect(getToolLabel('NotebookEdit')).toBe('Editing notebook')
    expect(getToolLabel('Grep')).toBe('Finding')
    expect(getToolLabel('TaskOutput')).toBe('Checking results')
    expect(getToolLabel('WebSearch')).toBe('Searching web')
    expect(getToolLabel('WebFetch')).toBe('Fetching page')
  })

  it('uses an action voice for the labels the issue flagged as off-style', () => {
    // Was: 'To Dos' (noun). Now: gerund matching siblings.
    expect(getToolLabel('TodoWrite')).toBe('Tracking todos')
    // Was: 'Working' (too generic). Now: conveys what the user gets.
    expect(getToolLabel('Task')).toBe('Delegating')
    // Was: 'Updating Samples' (mixed case vs siblings).
    expect(getToolLabel('ProcessSample')).toBe('Updating samples')
    // Were: 'Ready to learn' / 'Done learning' (statements, mood mismatch).
    expect(getToolLabel('EnterLearningMode')).toBe('Entering learning mode')
    expect(getToolLabel('ExitLearningMode')).toBe('Exiting learning mode')
  })

  it('maps the post-SDK-upgrade tool names that previously leaked through', () => {
    // Issue #30: raw "Agent" and "ToolSearch" were appearing in the strip.
    expect(getToolLabel('Agent')).toBe('Delegating')
    expect(getToolLabel('ToolSearch')).toBe('Looking up tools')
  })

  describe('unmapped tool fallback', () => {
    it('returns a generic label instead of the raw SDK name', () => {
      // Was: returned 'SomeFutureSdkTool' verbatim, leaking SDK identifiers
      // into the user-facing progress strip.
      expect(getToolLabel('SomeFutureSdkTool_unique_a')).toBe('Working')
    })

    it('reports the unmapped name once per session, deduped', () => {
      const name = 'SomeFutureSdkTool_unique_b'
      getToolLabel(name)
      getToolLabel(name)
      getToolLabel(name)
      expect(reportError).toHaveBeenCalledTimes(1)
      expect(reportError).toHaveBeenCalledWith('client.unmapped_tool', {
        toolName: name,
      })
    })

    it('does not report for mapped tools', () => {
      getToolLabel('Read')
      getToolLabel('Agent')
      expect(reportError).not.toHaveBeenCalled()
    })
  })

  describe('Bash tool patterns', () => {
    it('returns specific labels for recognized Bash commands', () => {
      expect(getToolLabel('Bash(pdftotext:*)')).toBe('Extracting PDF text')
      expect(getToolLabel('Bash(git add:*)')).toBe('Preparing changes')
      expect(getToolLabel('Bash(git commit:*)')).toBe('Saving changes')
      expect(getToolLabel('Bash(git log:*)')).toBe('Checking history')
      expect(getToolLabel('Bash(git diff:*)')).toBe('Checking changes')
    })

    it('returns "Running {cmd}" for unrecognized Bash commands', () => {
      expect(getToolLabel('Bash(npm install:*)')).toBe('Running npm install')
      expect(getToolLabel('Bash(ls:*)')).toBe('Running ls')
    })

    it('returns the generic fallback for bare Bash with no command pattern', () => {
      expect(getToolLabel('Bash')).toBe('Working')
    })
  })
})

// --- getToolDetail ---

function toolCall(name: string, input?: Record<string, unknown>): ToolCall {
  return { id: 'test-id', name, input: input ?? {} }
}

describe('getToolDetail', () => {
  it('returns null when input is missing', () => {
    const tc = {
      id: 'test-id',
      name: 'Read',
      input: undefined,
    } as unknown as ToolCall
    expect(getToolDetail(tc)).toBeNull()
  })

  describe('file-based tools (Read, Write, Edit)', () => {
    it('extracts the filename from file_path', () => {
      expect(
        getToolDetail(toolCall('Read', { file_path: '/a/b/config.ts' })),
      ).toBe('config.ts')
      expect(
        getToolDetail(toolCall('Write', { file_path: '/src/index.ts' })),
      ).toBe('index.ts')
      expect(
        getToolDetail(toolCall('Edit', { file_path: '/deep/path/file.md' })),
      ).toBe('file.md')
    })

    it('returns null when file_path is absent', () => {
      expect(getToolDetail(toolCall('Read', {}))).toBeNull()
    })
  })

  describe('Glob tool', () => {
    it('returns the glob pattern', () => {
      expect(getToolDetail(toolCall('Glob', { pattern: '**/*.tsx' }))).toBe(
        '**/*.tsx',
      )
    })

    it('returns null when pattern is absent', () => {
      expect(getToolDetail(toolCall('Glob', {}))).toBeNull()
    })
  })

  describe('Grep tool', () => {
    it('returns the search pattern in quotes', () => {
      expect(getToolDetail(toolCall('Grep', { pattern: 'useState' }))).toBe(
        '"useState"',
      )
    })

    it('returns null when pattern is absent', () => {
      expect(getToolDetail(toolCall('Grep', {}))).toBeNull()
    })
  })

  describe('ProcessSample tool', () => {
    it('returns the upload slug as detail text', () => {
      expect(
        getToolDetail(toolCall('ProcessSample', { slug: 'acme-report-q4' })),
      ).toBe('acme-report-q4')
    })

    it('returns null when slug is absent', () => {
      expect(getToolDetail(toolCall('ProcessSample', {}))).toBeNull()
    })
  })

  describe('Task / Agent subagent tools', () => {
    it('returns the description for both Task and Agent invocations', () => {
      expect(
        getToolDetail(toolCall('Task', { description: 'Read all specs' })),
      ).toBe('Read all specs')
      expect(
        getToolDetail(toolCall('Agent', { description: 'Review the diff' })),
      ).toBe('Review the diff')
    })

    it('returns null when description is absent', () => {
      expect(getToolDetail(toolCall('Task', {}))).toBeNull()
      expect(getToolDetail(toolCall('Agent', {}))).toBeNull()
    })
  })

  describe('TodoWrite tool', () => {
    it('returns completed/total count', () => {
      expect(
        getToolDetail(
          toolCall('TodoWrite', {
            todos: [
              { content: 'A', status: 'completed', activeForm: 'Doing A' },
              { content: 'B', status: 'completed', activeForm: 'Doing B' },
              { content: 'C', status: 'in_progress', activeForm: 'Doing C' },
              { content: 'D', status: 'pending', activeForm: 'Doing D' },
              { content: 'E', status: 'pending', activeForm: 'Doing E' },
            ],
          }),
        ),
      ).toBe('2/5 done')
    })

    it('returns null when todos is absent or empty', () => {
      expect(getToolDetail(toolCall('TodoWrite', {}))).toBeNull()
      expect(getToolDetail(toolCall('TodoWrite', { todos: [] }))).toBeNull()
    })
  })

  describe('WebSearch tool', () => {
    it('returns the search query in quotes', () => {
      expect(
        getToolDetail(toolCall('WebSearch', { query: 'react hooks' })),
      ).toBe('"react hooks"')
    })

    it('returns null when query is absent', () => {
      expect(getToolDetail(toolCall('WebSearch', {}))).toBeNull()
    })
  })

  describe('WebFetch tool', () => {
    it('returns the hostname from the URL', () => {
      expect(
        getToolDetail(
          toolCall('WebFetch', { url: 'https://docs.example.com/api/v2' }),
        ),
      ).toBe('docs.example.com')
    })

    it('returns null when url is absent', () => {
      expect(getToolDetail(toolCall('WebFetch', {}))).toBeNull()
    })

    it('returns null when url is malformed', () => {
      expect(
        getToolDetail(toolCall('WebFetch', { url: 'not-a-url' })),
      ).toBeNull()
    })
  })

  describe('Bash tool (default branch)', () => {
    it('prefers description over command', () => {
      expect(
        getToolDetail(
          toolCall('Bash(npm:*)', {
            description: 'Install deps',
            command: 'npm install',
          }),
        ),
      ).toBe('Install deps')
    })

    it('falls back to command when description is absent', () => {
      expect(getToolDetail(toolCall('Bash(ls:*)', { command: 'ls -la' }))).toBe(
        'ls -la',
      )
    })

    it('truncates long commands at 50 characters', () => {
      const longCmd = 'a'.repeat(60)
      const result = getToolDetail(
        toolCall('Bash(cmd:*)', { command: longCmd }),
      )
      expect(result).toBe('a'.repeat(50) + '...')
    })

    it('returns null when neither description nor command is present', () => {
      expect(getToolDetail(toolCall('Bash(cmd:*)', {}))).toBeNull()
    })
  })

  it('returns null for unknown tools', () => {
    expect(getToolDetail(toolCall('UnknownTool', { foo: 'bar' }))).toBeNull()
  })
})
