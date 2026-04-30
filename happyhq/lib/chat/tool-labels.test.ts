import { describe, expect, it } from 'vitest'
import { getToolDetail, getToolLabel } from './tool-labels'
import type { ToolCall } from './types'

// --- getToolLabel ---

describe('getToolLabel', () => {
  it('returns null for hidden tools (they have dedicated UI cards)', () => {
    expect(getToolLabel('AskUserQuestion')).toBeNull()
    expect(getToolLabel('CreateTask')).toBeNull()
  })

  it('maps known tool names to human-friendly labels', () => {
    expect(getToolLabel('Read')).toBe('Reading')
    expect(getToolLabel('Glob')).toBe('Searching files')
    expect(getToolLabel('Write')).toBe('Writing')
    expect(getToolLabel('Edit')).toBe('Updating')
    expect(getToolLabel('Task')).toBe('Working')
    expect(getToolLabel('Grep')).toBe('Finding')
    expect(getToolLabel('TodoWrite')).toBe('To Dos')
    expect(getToolLabel('TaskOutput')).toBe('Checking results')
    expect(getToolLabel('WebSearch')).toBe('Searching web')
    expect(getToolLabel('WebFetch')).toBe('Fetching page')
    expect(getToolLabel('ProcessSample')).toBe('Updating Samples')
  })

  it('returns the tool name as-is for unknown non-Bash tools', () => {
    expect(getToolLabel('SomeCustomTool')).toBe('SomeCustomTool')
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

    it('returns "Working" for bare Bash with no command pattern', () => {
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

  describe('Task tool', () => {
    it('returns the task description', () => {
      expect(
        getToolDetail(toolCall('Task', { description: 'Read all specs' })),
      ).toBe('Read all specs')
    })

    it('returns null when description is absent', () => {
      expect(getToolDetail(toolCall('Task', {}))).toBeNull()
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

    it('returns null when neither description nor command is present', () => {
      expect(getToolDetail(toolCall('Bash(cmd:*)', {}))).toBeNull()
    })
  })

  it('returns null for unknown tools', () => {
    expect(getToolDetail(toolCall('UnknownTool', { foo: 'bar' }))).toBeNull()
  })

  // Regression for #32: long detail strings forced the chat layout wider than
  // its container. Detail strings must be capped on the way out so neither the
  // DOM nor accessibility tree carries unbounded values.
  describe('detail length cap (issue #32)', () => {
    const cap = 60
    const longValue = 'x'.repeat(cap + 50)

    it('caps Bash command details', () => {
      const result = getToolDetail(
        toolCall('Bash(cmd:*)', { command: longValue }),
      )
      expect(result).not.toBeNull()
      expect(result!.length).toBeLessThanOrEqual(cap + 3)
      expect(result!.endsWith('...')).toBe(true)
    })

    it('caps Bash description details', () => {
      const result = getToolDetail(
        toolCall('Bash(cmd:*)', { description: longValue }),
      )
      expect(result!.length).toBeLessThanOrEqual(cap + 3)
      expect(result!.endsWith('...')).toBe(true)
    })

    it('caps Glob patterns', () => {
      const result = getToolDetail(toolCall('Glob', { pattern: longValue }))
      expect(result!.length).toBeLessThanOrEqual(cap + 3)
    })

    it('caps Grep patterns (including the surrounding quotes)', () => {
      const result = getToolDetail(toolCall('Grep', { pattern: longValue }))
      expect(result!.length).toBeLessThanOrEqual(cap + 3)
    })

    it('caps WebSearch queries', () => {
      const result = getToolDetail(toolCall('WebSearch', { query: longValue }))
      expect(result!.length).toBeLessThanOrEqual(cap + 3)
    })

    it('caps Task descriptions', () => {
      const result = getToolDetail(toolCall('Task', { description: longValue }))
      expect(result!.length).toBeLessThanOrEqual(cap + 3)
    })

    it('caps ProcessSample slugs', () => {
      const result = getToolDetail(
        toolCall('ProcessSample', { slug: longValue }),
      )
      expect(result!.length).toBeLessThanOrEqual(cap + 3)
    })

    it('leaves short values untouched', () => {
      expect(getToolDetail(toolCall('Glob', { pattern: '**/*.tsx' }))).toBe(
        '**/*.tsx',
      )
    })
  })
})
