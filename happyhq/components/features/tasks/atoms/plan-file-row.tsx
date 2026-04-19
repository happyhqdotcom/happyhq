import { FileTypeIcon } from '@/components/common/icons/file-type-icon'
import { FileContextMenu } from '@/components/features/desktop/windows/shared/file-context-menu'
import { FileRow } from '@/components/features/desktop/windows/shared/file-row'
import { PillButton } from './pill-button'

export function PlanFileRow({
  isPlanReady,
  onTryAgain,
  onApprove,
  onOpenFile,
  onDelete,
  filePath,
  disabled,
}: {
  isPlanReady: boolean
  onTryAgain: () => void
  onApprove: () => void
  onOpenFile?: () => void
  onDelete?: () => Promise<void>
  filePath?: string
  disabled: boolean
}) {
  const row = (
    <FileRow
      name="plan"
      filename="plan.md"
      iconSlot={<FileTypeIcon filename="plan.md" />}
      onClick={onOpenFile}
      rightSlot={
        isPlanReady ? (
          <div
            className="flex items-center gap-1"
            onClick={(e) => e.stopPropagation()}
          >
            <PillButton
              label="Try again"
              onClick={onTryAgain}
              disabled={disabled}
            />
            <PillButton
              label="Approve"
              onClick={onApprove}
              disabled={disabled}
              variant="solid"
            />
          </div>
        ) : undefined
      }
    />
  )

  if (!onDelete || !filePath) return row

  return (
    <FileContextMenu filePath={filePath} onDelete={onDelete}>
      {row}
    </FileContextMenu>
  )
}
