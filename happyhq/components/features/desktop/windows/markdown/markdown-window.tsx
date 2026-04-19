'use client'

import { useRunActions } from '@/stores/desktopStore'
import { useWindowStore } from '@/stores/windowStore'
import { PLAN_WINDOW_ID } from '../../constants'
import { useTaskStatus } from '../../hooks/use-desktop-data'
import type { WindowComponentProps } from '../types'
import { useFrameProps } from '../use-frame-props'
import { useUpdatePulse } from '../use-update-pulse'
import { WindowFileActions } from '../window-file-actions'
import { WindowFrame } from '../window-frame'
import { WindowHistoryDropdown } from '../window-history-dropdown'
import { MarkdownWindowContent } from './content'

export function MarkdownWindow({
  id,
  canvasRef,
  openFileWindow,
}: WindowComponentProps) {
  const result = useFrameProps(id, canvasRef)
  const taskStatus = useTaskStatus()
  const runActions = useRunActions()
  const highlighted = useUpdatePulse(
    result?.window.contentType === 'markdown'
      ? result.window.meta.lastUpdatedAt
      : undefined,
  )

  if (!result) return null

  const { frameProps, window: w } = result
  if (w.contentType !== 'markdown') return null

  const { updateWindowMeta } = useWindowStore.getState()

  const showApprovalFooter =
    w.id === PLAN_WINDOW_ID && taskStatus === 'plan_ready'

  return (
    <WindowFrame
      title={w.title}
      {...frameProps}
      afterTitle={
        <WindowHistoryDropdown
          filePath={w.meta.filePath}
          activeLabel={w.meta.historyLabel ?? null}
          activeHash={w.meta.historyHash ?? null}
          highlighted={highlighted}
          onSelectVersion={(markdown, entry) =>
            updateWindowMeta(w.id, {
              markdown,
              historyLabel: entry.date,
              historyHash: entry.hash,
            })
          }
          onSelectCurrent={() => {
            fetch(`/api/fs/file?path=${encodeURIComponent(w.meta.filePath)}`)
              .then(
                (res) =>
                  res.json() as Promise<{
                    content: string
                  }>,
              )
              .then(({ content }) =>
                updateWindowMeta(w.id, {
                  markdown: content,
                  historyLabel: null,
                  historyHash: null,
                }),
              )
              .catch(() => {})
          }}
        />
      }
      actions={
        <WindowFileActions
          filePath={w.meta.filePath}
          content={w.meta.markdown}
          rawPath={w.meta.rawPath}
          onViewRaw={(rawPath) =>
            openFileWindow({ name: 'raw.txt', path: rawPath })
          }
        />
      }
      footer={
        showApprovalFooter ? (
          <div className="flex shrink-0 items-center gap-2 border-t border-zinc-200 bg-zinc-50 px-4 py-2.5">
            <span className="flex-1 text-sm font-medium text-zinc-500">
              Approve this plan?
            </span>
            <button
              type="button"
              onClick={async () => {
                await runActions.stop?.()
                runActions.start?.()
              }}
              disabled={runActions.isLoading}
              className="flex h-6 shrink-0 items-center justify-center rounded-full bg-black/5 px-2.5 font-mono text-[10px] font-semibold tracking-wider text-black/40 uppercase transition-colors hover:bg-black/10 hover:text-black/70 disabled:opacity-50"
            >
              Try again
            </button>
            <button
              type="button"
              onClick={() => runActions.approve?.()}
              disabled={runActions.isLoading}
              className="flex h-6 shrink-0 items-center justify-center rounded-full bg-zinc-900 px-3 font-mono text-[10px] font-semibold tracking-wider text-white uppercase transition-colors hover:bg-zinc-800 disabled:opacity-50"
            >
              Approve
            </button>
          </div>
        ) : null
      }
    >
      <MarkdownWindowContent
        markdown={w.meta.markdown}
        loading={w.meta.loading}
      />
    </WindowFrame>
  )
}
