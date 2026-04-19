'use client'

import { deleteSpec } from '@/lib/actions'
import { invalidateStream } from '@/lib/swr-helpers'
import { useStreamSlug } from '@/stores/desktopStore'
import { useStreamContent } from '../../hooks/use-desktop-data'
import { FileContextMenu } from '../shared/file-context-menu'
import { FileListContent } from '../shared/file-list-content'
import { FileRow } from '../shared/file-row'
import type { WindowComponentProps } from '../types'
import { useFrameProps } from '../use-frame-props'
import { WindowFrame } from '../window-frame'

export function SpecsWindow({
  id,
  canvasRef,
  openFileWindow,
}: WindowComponentProps) {
  const result = useFrameProps(id, canvasRef)
  const streamContent = useStreamContent()
  const streamSlug = useStreamSlug()

  if (!result) return null
  const { frameProps, window: w } = result

  const specs = streamContent?.specs ?? []
  const onSpecChanged = () => invalidateStream(streamSlug)

  return (
    <WindowFrame title="Specs" {...frameProps}>
      <FileListContent
        loading={w.meta?.loading}
        isEmpty={specs.length === 0}
        emptyMessage="No specs yet"
      >
        {specs.map((spec) => (
          <FileContextMenu
            key={spec.path}
            filePath={spec.path}
            onDelete={async () => {
              await deleteSpec(streamSlug, spec.name)
              onSpecChanged()
            }}
          >
            <FileRow
              name={spec.name}
              filename={spec.name}
              displayTitle={spec.title}
              onClick={() =>
                openFileWindow({ name: spec.name, path: spec.path })
              }
            />
          </FileContextMenu>
        ))}
      </FileListContent>
    </WindowFrame>
  )
}
