'use client'

import { useWindowStore } from '@/stores/windowStore'
import type { WindowComponentProps } from '../types'
import { useFrameProps } from '../use-frame-props'
import { useUpdatePulse } from '../use-update-pulse'
import { WindowFileActions } from '../window-file-actions'
import { WindowFrame } from '../window-frame'
import { WindowHistoryDropdown } from '../window-history-dropdown'
import { CsvWindowContent } from './content'

export function CsvWindow({
  id,
  canvasRef,
  openFileWindow,
}: WindowComponentProps) {
  const result = useFrameProps(id, canvasRef)
  const highlighted = useUpdatePulse(
    result?.window.contentType === 'csv'
      ? result.window.meta.lastUpdatedAt
      : undefined,
  )
  if (!result) return null

  const { frameProps, window: w } = result
  if (w.contentType !== 'csv') return null

  const { updateCsvMeta } = useWindowStore.getState()

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
          onSelectVersion={(content, entry) =>
            updateCsvMeta(w.id, {
              csv: content,
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
                updateCsvMeta(w.id, {
                  csv: content,
                  historyLabel: null,
                  historyHash: null,
                }),
              )
              .catch(() => {})
          }}
        />
      }
      actions={
        <WindowFileActions filePath={w.meta.filePath} content={w.meta.csv} />
      }
    >
      <CsvWindowContent csv={w.meta.csv} loading={w.meta.loading} />
    </WindowFrame>
  )
}
