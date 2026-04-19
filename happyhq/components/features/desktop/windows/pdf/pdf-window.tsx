'use client'

import { useWindowStore } from '@/stores/windowStore'
import type { WindowComponentProps } from '../types'
import { useFrameProps } from '../use-frame-props'
import { WindowFileActions } from '../window-file-actions'
import { WindowFrame } from '../window-frame'
import { PdfWindowContent } from './content'

export function PdfWindow({ id, canvasRef }: WindowComponentProps) {
  const result = useFrameProps(id, canvasRef)
  if (!result) return null

  const { frameProps, window: w } = result
  if (w.contentType !== 'pdf') return null

  const { updatePdfMeta } = useWindowStore.getState()

  return (
    <WindowFrame
      title={w.title}
      {...frameProps}
      actions={
        <WindowFileActions
          filePath={w.meta.filePath}
          rawPath={w.meta.rawPath}
          showingRaw={!!w.meta.showRawText}
          onViewRaw={() => {
            if (w.meta.showRawText) {
              updatePdfMeta(w.id, { showRawText: false })
              return
            }
            if (w.meta.rawTextContent != null) {
              updatePdfMeta(w.id, { showRawText: true })
              return
            }
            fetch(`/api/fs/file?path=${encodeURIComponent(w.meta.rawPath!)}`)
              .then((res) => {
                if (!res.ok) throw new Error(`HTTP ${res.status}`)
                return res.json() as Promise<{ content: string }>
              })
              .then(({ content }) =>
                updatePdfMeta(w.id, {
                  rawTextContent: content,
                  showRawText: true,
                }),
              )
              .catch(() => {})
          }}
        />
      }
    >
      {w.meta.showRawText ? (
        <div className="h-full overflow-y-auto p-4">
          <pre className="text-sm leading-relaxed whitespace-pre-wrap text-zinc-700">
            {w.meta.rawTextContent}
          </pre>
        </div>
      ) : (
        <PdfWindowContent filePath={w.meta.filePath} loading={w.meta.loading} />
      )}
    </WindowFrame>
  )
}
