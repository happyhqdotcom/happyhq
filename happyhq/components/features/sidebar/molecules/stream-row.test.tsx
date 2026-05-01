import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Mock NameInputDialog/DeleteAlert/ItemDropdownMenu — they have their own
// contract tests; here we exercise the StreamRow controller wiring without
// dragging Catalyst portals into jsdom.
vi.mock('@/components/features/sidebar/atoms/dropdown-menu', () => ({
  ItemDropdownMenu: ({
    onRename,
    onDelete,
  }: {
    onRename: () => void
    onDelete: () => void
  }) => (
    <>
      <button data-testid="rename-trigger" onClick={onRename}>
        Rename
      </button>
      <button data-testid="delete-trigger" onClick={onDelete}>
        Delete
      </button>
    </>
  ),
}))

vi.mock('@/components/features/sidebar/molecules/name-dialog', () => ({
  NameInputDialog: ({
    open,
    defaultValue,
    onSubmit,
    onClose,
  }: {
    open: boolean
    defaultValue: string
    onSubmit: (name: string) => Promise<void>
    onClose: () => void
  }) =>
    open ? (
      <div data-testid="rename-dialog">
        <span data-testid="rename-default">{defaultValue}</span>
        <button
          data-testid="rename-submit"
          onClick={() => {
            onSubmit('renamed-slug').catch(() => {})
          }}
        >
          submit
        </button>
        <button
          data-testid="rename-submit-same"
          onClick={() => {
            onSubmit('alpha').catch(() => {})
          }}
        >
          submit-same
        </button>
        <button data-testid="rename-cancel" onClick={onClose}>
          cancel
        </button>
      </div>
    ) : null,
}))

vi.mock('@/components/common/shared/delete-alert', () => ({
  DeleteAlert: ({
    open,
    onDelete,
    onClose,
  }: {
    open: boolean
    onDelete: () => void
    onClose: () => void
  }) =>
    open ? (
      <div data-testid="delete-alert">
        <button data-testid="delete-confirm" onClick={onDelete}>
          confirm
        </button>
        <button data-testid="delete-cancel" onClick={onClose}>
          cancel
        </button>
      </div>
    ) : null,
}))

vi.mock('@/components/common/ui/sidebar', () => ({
  SidebarMenuItem: ({ children }: { children: React.ReactNode }) => (
    <li>{children}</li>
  ),
  SidebarMenuButton: ({
    children,
    asChild,
  }: {
    children: React.ReactNode
    asChild?: boolean
    isActive?: boolean
  }) => (asChild ? <>{children}</> : <button>{children}</button>),
  SidebarMenuBadge: ({ children }: { children: React.ReactNode }) => (
    <span data-testid="badge">{children}</span>
  ),
}))

const pushMock = vi.fn()
const pathnameMock = vi.fn(() => '/tasks')

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock, replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => pathnameMock(),
}))

const renameStreamMock = vi.fn()
const deleteStreamMock = vi.fn()

vi.mock('@/lib/actions/streams', () => ({
  renameStream: (...args: unknown[]) => renameStreamMock(...args),
  deleteStream: (...args: unknown[]) => deleteStreamMock(...args),
}))

const invalidateStreamMock = vi.fn()
vi.mock('@/lib/swr-helpers', () => ({
  invalidateStream: (...args: unknown[]) => invalidateStreamMock(...args),
}))

const mutateStreamsMock = vi.fn()
vi.mock('@/stores/streamsStore', () => ({
  useStreamsMutate: () => mutateStreamsMock,
}))

import { StreamRow } from './stream-row'

const baseStream = {
  name: 'alpha',
  title: 'Alpha',
  createdAt: '2025-01-01T00:00:00Z',
  hasPlaybookContent: false,
}

describe('StreamRow', () => {
  beforeEach(() => {
    pushMock.mockReset()
    pathnameMock.mockReset()
    pathnameMock.mockReturnValue('/tasks')
    renameStreamMock.mockReset().mockResolvedValue(undefined)
    deleteStreamMock.mockReset().mockResolvedValue(undefined)
    invalidateStreamMock.mockReset()
    mutateStreamsMock.mockReset().mockResolvedValue(undefined)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  function renderRow(
    overrides?: Partial<{
      stream: typeof baseStream
      isActive: boolean
      attentionCount: number
    }>,
  ) {
    return render(
      <StreamRow
        stream={overrides?.stream ?? baseStream}
        isActive={overrides?.isActive ?? false}
        attentionCount={overrides?.attentionCount ?? 0}
      />,
    )
  }

  it('opens the rename dialog with the current slug as default value', () => {
    renderRow()
    expect(screen.queryByTestId('rename-dialog')).toBeNull()
    fireEvent.click(screen.getByTestId('rename-trigger'))
    expect(screen.getByTestId('rename-dialog')).not.toBeNull()
    expect(screen.getByTestId('rename-default').textContent).toBe('alpha')
  })

  it('renames via server action, invalidates both slugs, mutates list, and navigates when viewing this stream', async () => {
    pathnameMock.mockReturnValue('/tasks/alpha')
    renderRow()
    fireEvent.click(screen.getByTestId('rename-trigger'))
    fireEvent.click(screen.getByTestId('rename-submit'))

    await waitFor(() => {
      expect(renameStreamMock).toHaveBeenCalledWith('alpha', 'renamed-slug')
    })
    expect(invalidateStreamMock).toHaveBeenCalledWith('alpha')
    expect(invalidateStreamMock).toHaveBeenCalledWith('renamed-slug')
    expect(mutateStreamsMock).toHaveBeenCalled()
    await waitFor(() => {
      expect(pushMock).toHaveBeenCalledWith('/tasks/renamed-slug')
    })
  })

  it('does not navigate after rename when the user is viewing a different stream', async () => {
    pathnameMock.mockReturnValue('/tasks/beta')
    renderRow()
    fireEvent.click(screen.getByTestId('rename-trigger'))
    fireEvent.click(screen.getByTestId('rename-submit'))

    await waitFor(() => {
      expect(renameStreamMock).toHaveBeenCalled()
    })
    expect(pushMock).not.toHaveBeenCalled()
  })

  it('skips the rename action when the new name matches the current slug', async () => {
    renderRow()
    fireEvent.click(screen.getByTestId('rename-trigger'))
    fireEvent.click(screen.getByTestId('rename-submit-same'))
    // give microtasks a chance
    await Promise.resolve()
    expect(renameStreamMock).not.toHaveBeenCalled()
    await waitFor(() => {
      expect(screen.queryByTestId('rename-dialog')).toBeNull()
    })
  })

  it('does not invalidate, mutate, or navigate when the rename action throws', async () => {
    renameStreamMock.mockRejectedValue(new Error('Name in use'))
    pathnameMock.mockReturnValue('/tasks/alpha')
    renderRow()
    fireEvent.click(screen.getByTestId('rename-trigger'))
    fireEvent.click(screen.getByTestId('rename-submit'))
    await waitFor(() => {
      expect(renameStreamMock).toHaveBeenCalled()
    })
    expect(invalidateStreamMock).not.toHaveBeenCalled()
    expect(mutateStreamsMock).not.toHaveBeenCalled()
    expect(pushMock).not.toHaveBeenCalled()
  })

  it('opens the delete confirm when delete is triggered', () => {
    renderRow()
    expect(screen.queryByTestId('delete-alert')).toBeNull()
    fireEvent.click(screen.getByTestId('delete-trigger'))
    expect(screen.getByTestId('delete-alert')).not.toBeNull()
  })

  it('deletes via server action, invalidates, mutates list, and navigates away when viewing this stream', async () => {
    pathnameMock.mockReturnValue('/tasks/alpha/some-task')
    renderRow()
    fireEvent.click(screen.getByTestId('delete-trigger'))
    fireEvent.click(screen.getByTestId('delete-confirm'))

    await waitFor(() => {
      expect(deleteStreamMock).toHaveBeenCalledWith('alpha')
    })
    expect(invalidateStreamMock).toHaveBeenCalledWith('alpha')
    expect(mutateStreamsMock).toHaveBeenCalled()
    await waitFor(() => {
      expect(pushMock).toHaveBeenCalledWith('/tasks')
    })
  })

  it('does not navigate after delete when the user is viewing a different stream', async () => {
    pathnameMock.mockReturnValue('/tasks/beta')
    renderRow()
    fireEvent.click(screen.getByTestId('delete-trigger'))
    fireEvent.click(screen.getByTestId('delete-confirm'))

    await waitFor(() => {
      expect(deleteStreamMock).toHaveBeenCalled()
    })
    expect(pushMock).not.toHaveBeenCalled()
  })

  it('renders the attention count badge when greater than zero', () => {
    renderRow({ attentionCount: 3 })
    expect(screen.getByTestId('badge').textContent).toBe('3')
  })

  it('omits the badge when the attention count is zero', () => {
    renderRow({ attentionCount: 0 })
    expect(screen.queryByTestId('badge')).toBeNull()
  })
})
