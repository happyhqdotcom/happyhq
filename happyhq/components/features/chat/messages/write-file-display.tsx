'use client'

import { useWindowActions } from '@/components/features/desktop/windows/use-window-actions'
import type { ToolCall } from '@/lib/chat/types'

interface WriteFileDisplayProps {
  toolCall: ToolCall
  isActive: boolean
}

/** Extract the filename from a full file path. */
function fileName(filePath: string): string {
  const parts = filePath.split('/')
  return parts[parts.length - 1] || filePath
}

export function WriteFileDisplay({ toolCall }: WriteFileDisplayProps) {
  const { openFileWindow } = useWindowActions()
  const filePath = toolCall.input.file_path as string | undefined
  const content = toolCall.input.content as string | undefined

  if (!filePath || !content) return null

  return (
    <FilePreviewCard
      content={content}
      onClick={() =>
        openFileWindow({ name: fileName(filePath), path: filePath })
      }
    />
  )
}

/** Standalone file preview card — usable without desktop context. */
export function FilePreviewCard({
  content,
  onClick,
}: {
  content: string
  onClick?: () => void
}) {
  const previewText = content.slice(0, 500)
  const Tag = onClick ? 'button' : 'div'

  return (
    <Tag
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={
        'mt-1.5 ml-6 block overflow-hidden rounded-lg border border-zinc-200/60 bg-zinc-50/50 text-left transition-colors' +
        (onClick
          ? ' cursor-pointer hover:border-zinc-300/80 hover:bg-zinc-100/50'
          : '')
      }
    >
      <div className="relative max-h-20 overflow-hidden px-3 py-2">
        <pre className="font-sans text-[12px] leading-relaxed whitespace-pre-wrap text-zinc-400">
          {previewText}
        </pre>
        <div
          className="pointer-events-none absolute inset-x-0 bottom-0 h-8 bg-linear-to-t from-zinc-50/90 to-transparent"
          aria-hidden="true"
        />
      </div>
    </Tag>
  )
}
