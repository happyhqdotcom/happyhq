'use client'

import { FileTypeIcon } from '@/components/common/icons/file-type-icon'
import { FileRow } from '@/components/features/desktop/windows/shared/file-row'
import type { FileEntry } from '@/lib/fs/types'

export function SpecsSection({
  specs,
  onFileClick,
  onBrowse,
}: {
  specs: FileEntry[]
  onFileClick: (spec: FileEntry) => void
  onBrowse: () => void
}) {
  return (
    <div className="flex flex-col gap-0.5 px-2 py-3">
      <div className="mb-1 flex items-center px-2">
        <h3 className="flex-1 text-sm font-medium text-zinc-500">
          Specs
          {specs.length > 0 && (
            <span className="ml-1.5 text-xs font-normal text-zinc-400">
              {specs.length}
            </span>
          )}
        </h3>
        {specs.length > 0 && (
          <button
            type="button"
            onClick={onBrowse}
            className="text-xs text-zinc-400 transition-colors hover:text-zinc-600"
          >
            Browse all
          </button>
        )}
      </div>

      {specs.length > 0 ? (
        specs.map((spec) => (
          <FileRow
            key={spec.path}
            name={spec.name}
            filename={spec.name}
            iconSlot={<FileTypeIcon filename={spec.name} />}
            onClick={() => onFileClick(spec)}
          />
        ))
      ) : (
        <p className="px-2 text-xs text-zinc-400">No specs yet</p>
      )}
    </div>
  )
}
