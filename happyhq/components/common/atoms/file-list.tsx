import { FileTypeIcon } from '@/components/common/icons/file-type-icon'
import { FileContextMenu } from '@/components/features/desktop/windows/shared/file-context-menu'
import { FileRow } from '@/components/features/desktop/windows/shared/file-row'

type FileEntry = { path?: string; name: string; title?: string | null }

export function FileList({
  files,
  onFileClick,
  onFileDelete,
}: {
  files: FileEntry[]
  onFileClick?: (file: FileEntry) => void
  onFileDelete?: (file: FileEntry) => Promise<void>
}) {
  return (
    <>
      {files.map((file) => {
        const row = (
          <FileRow
            key={file.path ?? file.name}
            name={file.name}
            filename={file.name}
            displayTitle={file.title}
            iconSlot={<FileTypeIcon filename={file.name} />}
            onClick={onFileClick ? () => onFileClick(file) : undefined}
          />
        )

        if (!onFileDelete || !file.path) return row

        return (
          <FileContextMenu
            key={file.path}
            filePath={file.path}
            onDelete={() => onFileDelete(file)}
          >
            {row}
          </FileContextMenu>
        )
      })}
    </>
  )
}
