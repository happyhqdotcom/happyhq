import type { RunInfo } from '@/lib/fs/types'
import { renderHook } from '@testing-library/react'
import { useTerminalErrorToast } from './use-terminal-error-toast'

const toastErrorMock = vi.fn()
vi.mock('@/components/common/ui/sonner', () => ({
  toastError: (message: string, opts?: { id?: string }) =>
    toastErrorMock(message, opts),
}))

function makeRun(overrides: Partial<RunInfo> = {}): RunInfo {
  return {
    status: 'stopped',
    iteration: 0,
    startedAt: '2026-05-06T15:00:00.000Z',
    lastIterationAt: '2026-05-06T15:00:00.500Z',
    error: 'boom',
    ...overrides,
  }
}

beforeEach(() => {
  toastErrorMock.mockClear()
})

describe('useTerminalErrorToast', () => {
  it('does not toast on first mount, even when a stale terminal error is already on disk', () => {
    // Page reload while .run.json holds an error from a prior session must
    // not surface that error as a fresh toast.
    renderHook(({ run }) => useTerminalErrorToast(run, false), {
      initialProps: { run: makeRun() },
    })
    expect(toastErrorMock).not.toHaveBeenCalled()
  })

  it('toasts when a new run terminates with an error after mount', () => {
    // Closes the #227 race: very-fast fast-fail where SWR goes straight from
    // "no run" to "stopped+error" without ever observing planning/working.
    const { rerender } = renderHook(
      ({ run }: { run: RunInfo | null }) => useTerminalErrorToast(run, false),
      { initialProps: { run: null as RunInfo | null } },
    )
    expect(toastErrorMock).not.toHaveBeenCalled()

    rerender({
      run: makeRun({
        startedAt: '2026-05-06T15:30:00.000Z',
        error: 'subprocess died',
      }),
    })

    expect(toastErrorMock).toHaveBeenCalledTimes(1)
    expect(toastErrorMock).toHaveBeenCalledWith('subprocess died', {
      id: 'run-error:2026-05-06T15:30:00.000Z',
    })
  })

  it('does not double-toast across re-renders for the same run', () => {
    // Sonner id-based dedupe is the dedupe between SSE and SWR paths, but
    // this hook should also not call toastError twice for the same run when
    // SWR refetches don't change run.startedAt.
    const run = makeRun({
      startedAt: '2026-05-06T15:30:00.000Z',
      error: 'fail',
    })
    const { rerender } = renderHook(
      ({ run }: { run: RunInfo | null }) => useTerminalErrorToast(run, false),
      { initialProps: { run: null as RunInfo | null } },
    )
    rerender({ run })
    rerender({ run })
    rerender({ run: { ...run } }) // identical content, new object
    expect(toastErrorMock).toHaveBeenCalledTimes(1)
  })

  it('toasts again for a subsequent run with a different startedAt', () => {
    const { rerender } = renderHook(
      ({ run }: { run: RunInfo | null }) => useTerminalErrorToast(run, false),
      { initialProps: { run: null as RunInfo | null } },
    )
    rerender({
      run: makeRun({
        startedAt: '2026-05-06T15:30:00.000Z',
        error: 'first',
      }),
    })
    rerender({
      run: makeRun({
        startedAt: '2026-05-06T15:35:00.000Z',
        error: 'second',
      }),
    })
    expect(toastErrorMock).toHaveBeenCalledTimes(2)
    expect(toastErrorMock).toHaveBeenLastCalledWith('second', {
      id: 'run-error:2026-05-06T15:35:00.000Z',
    })
  })

  it('does not toast for non-terminal status transitions', () => {
    // 'planning' / 'working' / 'completed' must not toast even if the
    // run.error field happens to be set (it shouldn't be, but the hook's
    // contract is "stopped+error only").
    const { rerender } = renderHook(
      ({ run }: { run: RunInfo | null }) => useTerminalErrorToast(run, false),
      { initialProps: { run: null as RunInfo | null } },
    )
    rerender({
      run: makeRun({
        startedAt: '2026-05-06T15:30:00.000Z',
        status: 'completed',
        error: null,
      }),
    })
    rerender({
      run: makeRun({
        startedAt: '2026-05-06T15:31:00.000Z',
        status: 'working',
        error: null,
      }),
    })
    expect(toastErrorMock).not.toHaveBeenCalled()
  })

  it('skips entirely in mock mode', () => {
    const { rerender } = renderHook(
      ({ run, mockMode }: { run: RunInfo | null; mockMode: boolean }) =>
        useTerminalErrorToast(run, mockMode),
      {
        initialProps: {
          run: null as RunInfo | null,
          mockMode: true,
        },
      },
    )
    rerender({
      run: makeRun({
        startedAt: '2026-05-06T15:30:00.000Z',
        error: 'should be ignored',
      }),
      mockMode: true,
    })
    expect(toastErrorMock).not.toHaveBeenCalled()
  })
})
