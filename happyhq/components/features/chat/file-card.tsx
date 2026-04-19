import { PDFIcon, WordIcon } from '@/components/common/icons'
import { cn } from '@/lib/utils'
import type { StagedFile } from '@/stores/chatStore'
import { Mail, X } from 'lucide-react'

export function FileCard({
  staged,
  onRemove,
}: {
  staged: StagedFile
  onRemove: (id: string) => void
}) {
  const name = staged.name.toLowerCase()
  const isEml = name.endsWith('.eml')
  const isDocx = name.endsWith('.docx')
  const fileColor = isEml
    ? 'bg-blue-600'
    : isDocx
      ? 'bg-blue-800'
      : 'bg-[#ad2824]'
  const fileLabel = isEml ? 'Email' : isDocx ? 'Word' : 'PDF'
  return (
    <div className="group/file relative flex max-w-[200px] items-center rounded-lg border border-zinc-200 p-2 select-none">
      <div
        className={cn(
          'mr-2 flex h-8 w-8 shrink-0 items-center justify-center rounded-md',
          fileColor,
        )}
      >
        {isEml ? (
          <Mail size={16} className="text-white" />
        ) : isDocx ? (
          <WordIcon size={16} className="text-white" />
        ) : (
          <PDFIcon size={16} className="text-white" />
        )}
      </div>
      <div className="flex min-w-0 flex-col">
        <span className="truncate text-xs font-medium text-zinc-900">
          {staged.name}
        </span>
        <span className="text-[11px] leading-tight text-zinc-400">
          {fileLabel}
        </span>
      </div>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          onRemove(staged.id)
        }}
        className="border-muted absolute -top-1.5 -right-1.5 hidden h-5 w-5 items-center justify-center rounded-full border-2 bg-zinc-200 group-hover/file:flex hover:bg-zinc-300"
        aria-label={`Remove ${staged.name}`}
      >
        <X className="h-3 w-3 text-zinc-500" />
      </button>
    </div>
  )
}
