import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const useTaskStatus = vi.hoisted(() => vi.fn())
const useTaskContent = vi.hoisted(() => vi.fn())
const useActiveTask = vi.hoisted(() => vi.fn())
const useDesktopStore = vi.hoisted(() => vi.fn())

vi.mock('@/components/features/desktop/hooks/use-desktop-data', () => ({
  useTaskStatus,
  useTaskContent,
  useActiveTask,
}))

vi.mock('@/stores/desktopStore', () => ({
  useDesktopStore,
}))

afterEach(() => {
  vi.resetAllMocks()
})

describe('TaskSetupChecklist', () => {
  function setupReady() {
    useTaskStatus.mockReturnValue(null)
    useTaskContent.mockReturnValue({
      description: 'context',
      inputs: [],
    })
    useActiveTask.mockReturnValue({
      slug: 't',
      frontmatter: { title: 'A task', stream: 's' },
    })
    useDesktopStore.mockImplementation((selector: any) =>
      selector({ setTaskFocusTarget: vi.fn() }),
    )
  }

  it('renders the new shaded Q glyph (not the old qutie.png)', async () => {
    setupReady()
    const { TaskSetupChecklist } = await import('./task-setup-checklist')

    render(<TaskSetupChecklist />)

    const q = screen.getByAltText('Q') as HTMLImageElement
    // next/image rewrites src; the underlying asset path is the source of truth.
    const src = q.getAttribute('src') ?? ''
    expect(src).toContain('q.svg')
    expect(src).not.toContain('qutie.png')
  })

  it('hides the checklist once the task has started', async () => {
    setupReady()
    useTaskStatus.mockReturnValue('working')
    const { TaskSetupChecklist } = await import('./task-setup-checklist')

    const { container } = render(<TaskSetupChecklist />)

    expect(container.firstChild).toBeNull()
  })
})
