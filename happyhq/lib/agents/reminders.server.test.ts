import { describe, expect, it } from 'vitest'

import type {
  RunInfo,
  StreamEntry,
  TaskContent,
  TaskItem,
} from '@/lib/fs/types'

import type { StreamContent } from '@/lib/fs/types'

import {
  firstTimeContext,
  generalContext,
  hasUploads,
  hasWeTransferLinks,
  newStreamReminder,
  streamManifest,
  uploadAwareness,
  viewingTaskReminder,
  wetransferReminder,
} from './reminders.server'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeStream(
  name: string,
  title?: string,
  hasPlaybookContent = true,
): StreamEntry {
  return {
    name,
    title: title ?? null,
    createdAt: '2026-01-01T00:00:00Z',
    hasPlaybookContent,
  }
}

function makeTask(
  taskName: string,
  status?: string,
  error?: string | null,
): TaskItem {
  return {
    slug: taskName,
    frontmatter: {
      title: taskName,
      stream: 'my-stream',
      createdAt: '2026-01-01T00:00:00Z',
    },
    run: status
      ? ({
          status,
          startedAt: '2026-01-01T00:00:00Z',
          lastIterationAt: '2026-01-01T00:00:00Z',
          ...(error ? { error } : {}),
          phases: [],
        } as RunInfo)
      : null,
    description: null,
  }
}

// ---------------------------------------------------------------------------
// generalContext
// ---------------------------------------------------------------------------

describe('generalContext', () => {
  it('includes date, streams, and active stream', async () => {
    const result = await generalContext(
      [makeStream('reports', 'Client Reports'), makeStream('sows')],
      'reports',
      [],
    )
    expect(result).toMatch(/^Today is /)
    expect(result).toContain('Streams: reports (Client Reports), sows')
    expect(result).toContain('Active stream: reports')
  })

  it('omits active stream line when null', async () => {
    const result = await generalContext([makeStream('reports')], null, [])
    expect(result).not.toContain('Active stream')
  })

  it('omits task line when no tasks', async () => {
    const result = await generalContext([makeStream('reports')], null, [])
    expect(result).not.toMatch(/task/)
  })

  it('shows all-on-track when tasks have no issues', async () => {
    const result = await generalContext([makeStream('reports')], null, [
      makeTask('write-report', 'working'),
      makeTask('draft-sow', 'completed'),
    ])
    expect(result).toContain('2 tasks.')
  })

  it('shows attention-needing tasks', async () => {
    const result = await generalContext([makeStream('reports')], null, [
      makeTask('write-report', 'working'),
      makeTask('broken-task', 'stopped', 'Something went wrong'),
    ])
    expect(result).toContain('2 tasks.')
    expect(result).toContain('1 needs attention: broken-task (failed)')
  })

  it('shows budget-stopped status as paused', async () => {
    const task = makeTask('expensive-task', 'stopped')
    ;(task.run as RunInfo).stopReason = 'budget'
    const result = await generalContext([makeStream('reports')], null, [task])
    expect(result).toContain('paused (budget)')
  })

  it('handles singular task', async () => {
    const result = await generalContext([makeStream('reports')], null, [
      makeTask('only-task', 'working'),
    ])
    expect(result).toContain('1 task.')
  })
})

// ---------------------------------------------------------------------------
// uploadAwareness
// ---------------------------------------------------------------------------

describe('uploadAwareness', () => {
  it('includes session-specific path', () => {
    const result = uploadAwareness('abc-123')
    expect(result).toContain('.chats/abc-123/uploads/')
  })

  it('includes extraction conventions', () => {
    const result = uploadAwareness('abc-123')
    expect(result).toContain('PDF→raw.txt')
    expect(result).toContain('EML→email.json')
    expect(result).toContain('DOCX→content.md')
  })

  it('includes auto-process warning', () => {
    const result = uploadAwareness('abc-123')
    expect(result).toContain("Don't auto-process uploads as samples")
  })
})

// ---------------------------------------------------------------------------
// firstTimeContext
// ---------------------------------------------------------------------------

describe('firstTimeContext', () => {
  it('mentions new workspace', () => {
    expect(firstTimeContext()).toContain('new workspace')
  })

  it('explains what Q does', () => {
    expect(firstTimeContext()).toContain('learn how they work')
  })

  it('mentions learning mode', () => {
    expect(firstTimeContext()).toContain('enter learning mode')
  })
})

// ---------------------------------------------------------------------------
// viewingTaskReminder
// ---------------------------------------------------------------------------

function makeFileItem(name: string, title?: string) {
  return {
    name,
    title: title ?? null,
    originalPath: `inputs/${name}/original.pdf`,
    originalName: 'original.pdf',
    rawPath: `inputs/${name}/raw.txt`,
    sourceUrl: null,
    favicon: null,
    modifiedAt: '2026-01-01T00:00:00Z',
  }
}

function makeFileEntry(name: string) {
  return {
    name,
    path: `outputs/${name}`,
    type: 'file' as const,
    title: null,
    modifiedAt: '2026-01-01T00:00:00Z',
  }
}

describe('viewingTaskReminder', () => {
  it('completed task with outputs — uses title, stream, names outputs', () => {
    const task: TaskContent = {
      frontmatter: {
        title: "Grandma's Dutch Apple Pie Recipe",
        stream: 'apple-pies',
        completedAt: '2026-04-03T00:00:00Z',
        createdAt: '2026-04-01T00:00:00Z',
      },
      plan: '# Plan\nBake the pie.',
      description: 'A classic recipe.',
      run: {
        status: 'completed',
        startedAt: '2026-04-01T00:00:00Z',
        lastIterationAt: '2026-04-01T00:00:00Z',
        phases: [],
      },
      inputs: [],
      working: [],
      outputs: [
        makeFileEntry('recipe-card.md'),
        makeFileEntry('ingredient-sourcing-guide.md'),
      ],
    }
    const result = viewingTaskReminder('grandmas-dutch-apple', task)
    expect(result).toContain('## Viewing Task')
    expect(result).toContain("Grandma's Dutch Apple Pie Recipe")
    expect(result).toContain('completed task')
    expect(result).toContain('apple-pies stream')
    expect(result).toContain('recipe-card.md')
    expect(result).toContain('ingredient-sourcing-guide.md')
    expect(result).toContain('tasks/grandmas-dutch-apple/')
    // Should NOT contain counts
    expect(result).not.toMatch(/\d+ inputs/)
    expect(result).not.toMatch(/\d+ outputs/)
  })

  it('running task with file inputs — names inputs, no counts', () => {
    const task: TaskContent = {
      frontmatter: {
        title: 'Holiday Pie Menu',
        stream: 'apple-pies',
        createdAt: '2026-04-01T00:00:00Z',
      },
      plan: '# Plan\nChoose the pies.',
      description: null,
      run: {
        status: 'working',
        startedAt: '2026-04-01T00:00:00Z',
        lastIterationAt: '2026-04-01T00:00:00Z',
        phases: [],
      },
      inputs: [makeFileItem('flavor-profiles'), makeFileItem('crust-options')],
      working: [],
      outputs: [],
    }
    const result = viewingTaskReminder('holiday-pie-menu', task)
    expect(result).toContain('Holiday Pie Menu')
    expect(result).toContain('currently running')
    expect(result).toContain('apple-pies')
    expect(result).toContain('flavor-profiles')
    expect(result).toContain('crust-options')
    expect(result).toContain('a plan')
    expect(result).toContain('tasks/holiday-pie-menu/')
  })

  it('task with plan ready and description but no file inputs', () => {
    const task: TaskContent = {
      frontmatter: {
        title: 'Draft Intro Email',
        stream: 'email-intros',
        createdAt: '2026-04-01T00:00:00Z',
      },
      plan: 'Step 1: draft email.',
      description: 'Write an intro email for a new client.',
      run: {
        status: 'plan_ready',
        startedAt: '2026-04-01T00:00:00Z',
        lastIterationAt: '2026-04-01T00:00:00Z',
        phases: [],
      },
      inputs: [],
      working: [],
      outputs: [],
    }
    const result = viewingTaskReminder('draft-intro-email', task)
    expect(result).toContain('Draft Intro Email')
    expect(result).toContain('plan ready')
    expect(result).toContain('context')
    expect(result).toContain('a plan')
    // Should NOT say "0 inputs"
    expect(result).not.toContain('0 inputs')
  })

  it('fresh task — no content yet', () => {
    const task: TaskContent = {
      frontmatter: {
        title: 'New Pie Experiment',
        createdAt: '2026-04-01T00:00:00Z',
      },
      plan: null,
      description: null,
      run: null,
      inputs: [],
      working: [],
      outputs: [],
    }
    const result = viewingTaskReminder('new-pie-experiment', task)
    expect(result).toContain('New Pie Experiment')
    expect(result).toContain('No content yet')
    expect(result).toContain('tasks/new-pie-experiment/')
  })

  it('no frontmatter — falls back to slug', () => {
    const task: TaskContent = {
      frontmatter: null,
      plan: null,
      description: null,
      run: null,
      inputs: [],
      working: [],
      outputs: [],
    }
    const result = viewingTaskReminder('orphan-task', task)
    expect(result).toContain('"orphan-task"')
    expect(result).toContain('tasks/orphan-task/')
  })

  it('failed task — includes error', () => {
    const task: TaskContent = {
      frontmatter: {
        title: 'Burnt Pie',
        stream: 'apple-pies',
        createdAt: '2026-04-01T00:00:00Z',
      },
      plan: 'Bake at 500.',
      description: null,
      run: {
        status: 'stopped',
        startedAt: '2026-04-01T00:00:00Z',
        lastIterationAt: '2026-04-01T00:00:00Z',
        error: 'Iteration limit reached',
        phases: [],
      },
      inputs: [],
      working: [],
      outputs: [],
    }
    const result = viewingTaskReminder('burnt-pie', task)
    expect(result).toContain('failed')
    expect(result).toContain('Iteration limit reached')
  })

  it('pending approval — includes pending type', () => {
    const task: TaskContent = {
      frontmatter: {
        title: 'Review My Pie',
        stream: 'pie-reviews',
        pending: 'approval',
        createdAt: '2026-04-01T00:00:00Z',
      },
      plan: 'Review plan.',
      description: 'Please review.',
      run: null,
      inputs: [],
      working: [],
      outputs: [],
    }
    const result = viewingTaskReminder('review-my-pie', task)
    expect(result).toContain('needing approval')
  })

  it('uses input title when available', () => {
    const task: TaskContent = {
      frontmatter: {
        title: 'Pie Research',
        stream: 'apple-pies',
        createdAt: '2026-04-01T00:00:00Z',
      },
      plan: null,
      description: null,
      run: null,
      inputs: [makeFileItem('raw-data', 'Customer Survey Results')],
      working: [],
      outputs: [],
    }
    const result = viewingTaskReminder('pie-research', task)
    expect(result).toContain('Customer Survey Results')
    expect(result).not.toContain('raw-data')
  })
})

// ---------------------------------------------------------------------------
// generalContext with taskActive
// ---------------------------------------------------------------------------

describe('generalContext with taskActive', () => {
  it('simplifies to workspace headline', async () => {
    const result = await generalContext(
      [makeStream('apple-pies'), makeStream('pie-reviews')],
      null,
      [
        makeTask('bake-pie', 'working'),
        makeTask('eat-pie'),
        makeTask('rate-pie'),
      ],
      { taskActive: true },
    )
    expect(result).toMatch(/^Today is /)
    expect(result).toContain('Workspace:')
    expect(result).toContain('2 streams (apple-pies, pie-reviews)')
    expect(result).toContain('3 tasks')
    // Should NOT contain full detail
    expect(result).not.toContain('Active stream')
    expect(result).not.toContain('all on track')
  })

  it('returns date only when no streams and no tasks', async () => {
    const result = await generalContext([], null, [], { taskActive: true })
    expect(result).toMatch(/^Today is /)
    expect(result).not.toContain('Workspace')
  })
})

// ---------------------------------------------------------------------------
// hasUploads
// ---------------------------------------------------------------------------

describe('hasUploads', () => {
  it('detects upload annotation', () => {
    expect(hasUploads('Review this\n\n[Files uploaded: report.pdf]')).toBe(true)
  })

  it('returns false for plain messages', () => {
    expect(hasUploads('Just a question')).toBe(false)
  })

  it('returns false for partial match', () => {
    expect(hasUploads('Files uploaded elsewhere')).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// hasWeTransferLinks
// ---------------------------------------------------------------------------

describe('hasWeTransferLinks', () => {
  it('detects short links', () => {
    expect(hasWeTransferLinks('Check this: https://we.tl/t-ITs39gAIVx')).toBe(
      true,
    )
  })

  it('detects full download URLs', () => {
    expect(
      hasWeTransferLinks(
        'Here: https://wetransfer.com/downloads/abc123/def456?token=xyz',
      ),
    ).toBe(true)
  })

  it('returns false for plain messages', () => {
    expect(hasWeTransferLinks('Just a question about transfers')).toBe(false)
  })

  it('returns false for partial matches', () => {
    expect(hasWeTransferLinks('Check wetransfer.com for info')).toBe(false)
  })
})

describe('wetransferReminder', () => {
  it('includes API endpoint', () => {
    expect(wetransferReminder()).toContain(
      'wetransfer.com/api/v4/transfers/{transferId}/download',
    )
  })

  it('includes short link resolution step', () => {
    expect(wetransferReminder()).toContain('curl -sI')
  })

  it('mentions direct_link', () => {
    expect(wetransferReminder()).toContain('direct_link')
  })
})

// ---------------------------------------------------------------------------
// Learning-mode reminders
// ---------------------------------------------------------------------------

function makeStreamContent(
  overrides: Partial<StreamContent> = {},
): StreamContent {
  return {
    playbook: null,
    playbookTitle: null,
    playbookBody: null,
    specs: [],
    samples: [],
    sampleTypes: [],
    ...overrides,
  }
}

describe('newStreamReminder', () => {
  it('includes stream slug in header', () => {
    const result = newStreamReminder('email-intros')
    expect(result).toContain('## Stream: email-intros')
  })

  it('includes discovery guidance', () => {
    const result = newStreamReminder('email-intros')
    expect(result).toContain('new stream with no content yet')
    expect(result).toContain('thoughtful questions first')
  })
})

describe('streamManifest', () => {
  it('lists playbook when body has content', () => {
    const content = makeStreamContent({
      playbook: '---\ntitle: Test\n---\nStep 1',
      playbookBody: 'Step 1',
    })
    const result = streamManifest('email-intros', content)
    expect(result).toContain('## Stream: email-intros')
    expect(result).toContain('Playbook: email-intros/playbook.md')
  })

  it('omits playbook when body is empty', () => {
    const content = makeStreamContent({
      playbook: '---\ntitle: Test\n---\n',
      playbookBody: '',
    })
    const result = streamManifest('email-intros', content)
    expect(result).not.toContain('Playbook:')
  })

  it('lists specs with full paths', () => {
    const content = makeStreamContent({
      playbookBody: 'Step 1',
      specs: [
        {
          name: 'tone.md',
          type: 'file',
          path: '',
          title: null,
          modifiedAt: '',
        },
        {
          name: 'format.md',
          type: 'file',
          path: '',
          title: null,
          modifiedAt: '',
        },
      ],
    })
    const result = streamManifest('client-reports', content)
    expect(result).toContain('client-reports/specs/tone.md')
    expect(result).toContain('client-reports/specs/format.md')
  })

  it('includes sample count and category paths', () => {
    const content = makeStreamContent({
      playbookBody: 'Step 1',
      samples: [
        { name: 's1', category: 'reports' },
        { name: 's2', category: 'reports' },
      ] as StreamContent['samples'],
    })
    const result = streamManifest('client-reports', content)
    expect(result).toContain('Samples: 2 in client-reports/samples/reports/')
  })

  it('omits absent artifact types entirely', () => {
    const content = makeStreamContent({ playbookBody: 'Step 1' })
    const result = streamManifest('email-intros', content)
    expect(result).not.toContain('Specs:')
    expect(result).not.toContain('Samples:')
    expect(result).not.toContain('none')
  })
})
