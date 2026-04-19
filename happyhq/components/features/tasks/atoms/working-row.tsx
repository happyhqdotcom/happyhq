'use client'

import { useWorkingText } from '@/components/features/chat/messages/working-indicator'

export function WorkingRow() {
  const text = useWorkingText()
  return (
    <div className="flex h-8 items-center gap-2 rounded-md px-2">
      <div
        className="flex shrink-0 items-center justify-center"
        style={{ width: 18, height: 18 }}
      >
        <div className="working-blob h-3.5 w-3.5" />
      </div>
      <span className="min-w-0 truncate text-sm font-medium text-zinc-500">
        {text}
      </span>
    </div>
  )
}
