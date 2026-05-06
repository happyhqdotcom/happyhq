import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { StreamContent, TaskContent } from '@/lib/fs/types'

const mockReadFileSync = vi.hoisted(() => vi.fn())
const mockReaddirSync = vi.hoisted(() => vi.fn((_p: string) => [] as string[]))
const mockStatSync = vi.hoisted(() =>
  vi.fn((_p: string) => ({ isDirectory: () => false as boolean })),
)
const mockExistsSync = vi.hoisted(() => vi.fn((_p: string) => false as boolean))
const mockReadStreamContent = vi.hoisted(() => vi.fn())
const mockReadTaskContent = vi.hoisted(() => vi.fn())
const mockListDirectory = vi.hoisted(() => vi.fn())

vi.mock('node:fs', () => ({
  default: {
    readFileSync: mockReadFileSync,
    readdirSync: mockReaddirSync,
    statSync: mockStatSync,
    existsSync: mockExistsSync,
  },
  readFileSync: mockReadFileSync,
  readdirSync: mockReaddirSync,
  statSync: mockStatSync,
  existsSync: mockExistsSync,
}))

vi.mock('@/lib/fs/read.server', () => ({
  readStreamContent: mockReadStreamContent,
  readTaskContent: mockReadTaskContent,
  listDirectory: mockListDirectory,
}))

vi.mock('@/lib/fs/paths', () => ({
  qPath: () => '/mock/happyhq/.q',
}))

// Default mocks — empty stream/task so prompt functions don't fail
beforeEach(() => {
  const emptyStream: StreamContent = {
    playbook: null,
    playbookTitle: null,
    playbookBody: null,
    specs: [],
    samples: [],
    sampleTypes: [],
  }
  const emptyTask: TaskContent = {
    frontmatter: null,
    plan: null,
    description: null,
    run: null,
    inputs: [],
    working: [],
    outputs: [],
  }
  mockReadStreamContent.mockResolvedValue(emptyStream)
  mockReadTaskContent.mockResolvedValue(emptyTask)
  mockListDirectory.mockResolvedValue([])
})

describe('prompt loading', () => {
  beforeEach(() => {
    mockReadFileSync.mockReset()
    // Reset module cache so lazy singletons are re-initialized
    vi.resetModules()
  })

  it('returns the content of the prompt file', async () => {
    mockReadFileSync.mockReturnValue('You are a learning agent.')
    const { learningPrompt } = await import('./prompts.server')
    expect(await learningPrompt('/some/path', 'stream', 'session')).toBe(
      'You are a learning agent.',
    )
  })

  it('caches the prompt after first read', async () => {
    mockReadFileSync.mockReturnValue('cached content')
    const { learningPrompt } = await import('./prompts.server')

    const first = await learningPrompt('/some/path', 'stream', 'session')
    const second = await learningPrompt('/some/path', 'stream', 'session')

    expect(first).toBe(second)
    // 1 readFileSync for learning.md only
    expect(mockReadFileSync).toHaveBeenCalledTimes(1)
  })

  it('learning prompt substitutes {{Q_PATH}} with the provided path', async () => {
    mockReadFileSync.mockReturnValue('Read from {{Q_PATH}}/playbook.md')
    const { learningPrompt } = await import('./prompts.server')
    expect(await learningPrompt('/home/user/.q', 'stream', 'session')).toBe(
      'Read from /home/user/.q/playbook.md',
    )
  })

  it('each prompt function loads independently', async () => {
    mockReadFileSync
      .mockReturnValueOnce('learning') // learning.md
      .mockReturnValueOnce('planning {{TASK_NAME}} {{READING_LIST}}') // planning.md
      .mockReturnValueOnce(
        'working {{STREAM_NAME}} {{TASK_NAME}} {{READING_LIST}}',
      ) // working.md

    const { learningPrompt, planningPrompt, workingPrompt } =
      await import('./prompts.server')

    expect(await learningPrompt('/some/path', 'stream', 'session')).toBe(
      'learning',
    )
    const planning = await planningPrompt('stream', 'my-task')
    expect(planning).toContain('my-task')
    const working = await workingPrompt('stream', 'my-task')
    expect(working).toContain('my-task')
    expect(working).toContain('working stream my-task')
  })

  it('planning prompt builds reading list with specs, samples, and inputs', async () => {
    mockReadFileSync.mockReturnValue('{{READING_LIST}}\nPlaybook\n{{PLAYBOOK}}')
    mockReadStreamContent.mockResolvedValue({
      playbook: 'workflow here',
      specs: [
        {
          name: 'tone.md',
          type: 'file',
          path: '',
          title: null,
          modifiedAt: '',
        },
      ],
      samples: [
        {
          name: 'acme-sow',
          category: 'sows',
          description: 'Acme SOW',
          originalPath: 'stream/samples/sows/acme-sow/original.pdf',
          originalName: 'original.pdf',
          rawPath: 'stream/samples/sows/acme-sow/raw.txt',
          categoryTitle: null,
          modifiedAt: '',
        },
        {
          name: 'beta-sow',
          category: 'sows',
          description: 'Beta SOW',
          originalPath: 'stream/samples/sows/beta-sow/original.pdf',
          originalName: 'original.pdf',
          rawPath: 'stream/samples/sows/beta-sow/raw.txt',
          categoryTitle: null,
          modifiedAt: '',
        },
      ],
    })
    mockReadTaskContent.mockResolvedValue({
      frontmatter: null,
      plan: null,
      run: null,
      inputs: [
        {
          name: 'brief.md',
          originalPath: 'tasks/my-task/inputs/brief.md',
          originalName: 'brief.md',
          rawPath: null,
          modifiedAt: '',
        },
      ],
      working: [],
      outputs: [],
    })

    const { planningPrompt } = await import('./prompts.server')
    const result = await planningPrompt('stream', 'my-task')

    // task.md is listed first — frontmatter + description
    expect(result).toContain('- tasks/my-task/task.md')
    // Specs listed by path (prefixed with stream slug since CWD is workspace root)
    expect(result).toContain('- stream/specs/tone.md')
    // Multiple samples in same category → INDEX.md listed, agent chooses
    expect(result).toContain(
      'stream/samples/sows/INDEX.md — read this first, then choose the most relevant samples to read.',
    )
    // Inputs listed by path
    expect(result).toContain('- tasks/my-task/inputs/brief.md')
    // Playbook injected
    expect(result).toContain('workflow here')
    // Samples note
    expect(result).toContain('patterns, not as gospel')
  })

  it('reading list lists task.md before specs, samples, and inputs', async () => {
    mockReadFileSync.mockReturnValue('{{READING_LIST}}\n{{PLAYBOOK}}')
    mockReadStreamContent.mockResolvedValue({
      playbook: '',
      specs: [
        {
          name: 'tone.md',
          type: 'file',
          path: '',
          title: null,
          modifiedAt: '',
        },
      ],
      samples: [],
    })
    mockReadTaskContent.mockResolvedValue({
      frontmatter: null,
      plan: null,
      run: null,
      inputs: [
        {
          name: 'brief',
          originalPath: 'tasks/my-task/inputs/brief/original.pdf',
          originalName: 'original.pdf',
          rawPath: 'tasks/my-task/inputs/brief/raw.txt',
          modifiedAt: '',
        },
      ],
      working: [],
      outputs: [],
    })

    const { planningPrompt } = await import('./prompts.server')
    const result = await planningPrompt('stream', 'my-task')

    const taskMdIdx = result.indexOf('- tasks/my-task/task.md')
    const specIdx = result.indexOf('- stream/specs/tone.md')
    const inputIdx = result.indexOf('- tasks/my-task/inputs/brief/raw.txt')

    expect(taskMdIdx).toBeGreaterThanOrEqual(0)
    expect(specIdx).toBeGreaterThan(taskMdIdx)
    expect(inputIdx).toBeGreaterThan(specIdx)
  })

  it('reading list uses originalPath for loose input files (e.g. legacy context.md)', async () => {
    mockReadFileSync.mockReturnValue('{{READING_LIST}}\n{{PLAYBOOK}}')
    mockReadStreamContent.mockResolvedValue({
      playbook: '',
      specs: [],
      samples: [],
    })
    mockReadTaskContent.mockResolvedValue({
      frontmatter: null,
      plan: null,
      run: null,
      inputs: [
        // Loose file at inputs/ root — no rawPath, originalPath is the full
        // workspace-relative path. Reproduces the legacy `context.md` shape.
        {
          name: 'context',
          originalPath: 'tasks/my-task/inputs/context.md',
          originalName: 'context.md',
          rawPath: null,
          modifiedAt: '',
        },
      ],
      working: [],
      outputs: [],
    })

    const { planningPrompt } = await import('./prompts.server')
    const result = await planningPrompt('stream', 'my-task')

    // Path uses originalPath verbatim — no synthetic
    // `inputs/context/context.md` reconstruction.
    expect(result).toContain('- tasks/my-task/inputs/context.md')
    expect(result).not.toContain('inputs/context/context.md')
  })

  it('working prompt builds reading list with plan.md appended', async () => {
    mockReadFileSync.mockReturnValue('{{STREAM_NAME}} {{READING_LIST}}')
    mockReadStreamContent.mockResolvedValue({
      playbook: null,
      specs: [
        {
          name: 'tone.md',
          type: 'file',
          path: '',
          title: null,
          modifiedAt: '',
        },
      ],
      samples: [],
    })
    mockReadTaskContent.mockResolvedValue({
      frontmatter: null,
      plan: 'step 1',
      run: null,
      inputs: [
        {
          name: 'brief.md',
          originalPath: 'tasks/my-task/inputs/brief.md',
          originalName: 'brief.md',
          rawPath: null,
          modifiedAt: '',
        },
      ],
      working: [],
      outputs: [],
    })

    const { workingPrompt } = await import('./prompts.server')
    const result = await workingPrompt('stream', 'my-task')

    expect(result).toContain('stream')
    expect(result).not.toContain('{{STREAM_NAME}}')
    expect(result).toContain('- tasks/my-task/task.md')
    expect(result).toContain('- stream/specs/tone.md')
    expect(result).toContain('- tasks/my-task/inputs/brief.md')
    expect(result).toContain('- tasks/my-task/plan.md')
  })
})

describe('generalPrompt', () => {
  beforeEach(() => {
    mockReadFileSync.mockReset()
    vi.resetModules()
  })

  it('returns the content of general.md', async () => {
    mockReadFileSync.mockReturnValue('You are Q, a conversational assistant.')
    const { generalPrompt } = await import('./prompts.server')
    expect(generalPrompt()).toBe('You are Q, a conversational assistant.')
  })

  it('caches the prompt after first read', async () => {
    mockReadFileSync.mockReturnValue('cached general')
    const { generalPrompt } = await import('./prompts.server')

    const first = generalPrompt()
    const second = generalPrompt()

    expect(first).toBe(second)
    expect(mockReadFileSync).toHaveBeenCalledTimes(1)
  })
})

describe('learningLayerPrompt', () => {
  beforeEach(() => {
    mockReadFileSync.mockReset()
    vi.resetModules()
  })

  it('substitutes template variables (sync, no I/O)', async () => {
    mockReadFileSync.mockReturnValue(
      'Stream: {{STREAM_NAME}}, Slug: {{STREAM_SLUG}}, Q: {{Q_PATH}}',
    )
    const { learningLayerPrompt } = await import('./prompts.server')
    const result = learningLayerPrompt('client-reports')

    expect(result).toContain('Stream: client-reports')
    expect(result).toContain('Slug: client-reports')
    expect(result).toContain('Q: /mock/happyhq/.q')
  })

  it('does not contain removed template variables', async () => {
    mockReadFileSync.mockReturnValue(
      'Name: {{STREAM_NAME}}, Slug: {{STREAM_SLUG}}, Q: {{Q_PATH}}',
    )
    const { learningLayerPrompt } = await import('./prompts.server')
    const result = learningLayerPrompt('client-reports')

    // These template vars were removed — context comes from separate reminders now
    expect(result).not.toContain('{{STREAM_CONTEXT}}')
    expect(result).not.toContain('{{TASK_CONTEXT}}')
  })
})

describe('formatStreamContext', () => {
  it('returns brand-new-stream message when empty', async () => {
    const { formatStreamContext } = await import('./prompts.server')

    const content: StreamContent = {
      playbook: null,
      playbookTitle: null,
      playbookBody: null,
      specs: [],
      samples: [],
      sampleTypes: [],
    }

    expect(formatStreamContext(content, [])).toBe(
      'This is a brand new stream. No playbook, specs, samples, or uploads yet.',
    )
  })

  it('lists existing items', async () => {
    const { formatStreamContext } = await import('./prompts.server')

    const content: StreamContent = {
      playbook: 'workflow',
      playbookTitle: null,
      playbookBody: 'workflow',
      specs: [
        {
          name: 'tone.md',
          type: 'file',
          path: '',
          title: null,
          modifiedAt: '',
        },
      ],
      samples: [
        {
          name: 'acme-sow',
          title: null,
          category: 'sows',
          description: 'Sample SOW',
          originalPath: 'stream/samples/sows/acme-sow/original.pdf',
          originalName: 'original.pdf',
          rawPath: null,
          sourceUrl: null,
          favicon: null,
          categoryTitle: null,
          modifiedAt: '',
        },
      ],
      sampleTypes: [{ slug: 'sows', title: null }],
    }

    const result = formatStreamContext(content, [])
    expect(result).toContain('Playbook: exists')
    expect(result).toContain('Specs: tone.md')
    expect(result).toContain('Samples: 1 across sows')
    expect(result).toContain('Uploads: none')
  })
})
