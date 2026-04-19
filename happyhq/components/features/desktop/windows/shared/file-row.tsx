'use client'

import { displayTitle } from '@/lib/format'
import { FileIcon } from './file-icon'

interface FileRowProps extends React.ComponentPropsWithRef<'div'> {
  name: string
  filename: string
  displayTitle?: string | null
  /** Override the default FileIcon with a custom element (e.g. favicon). */
  iconSlot?: React.ReactNode
  rightSlot?: React.ReactNode
}

export function FileRow({
  name,
  filename,
  displayTitle: customTitle,
  iconSlot,
  onClick,
  rightSlot,
  ref,
  ...rest
}: FileRowProps) {
  return (
    <div
      ref={ref}
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onClick?.(e as unknown as React.MouseEvent<HTMLDivElement>)
        }
      }}
      {...rest}
      className={`group flex h-8 w-full cursor-pointer items-center gap-2 rounded-md px-2 text-left transition-colors hover:bg-zinc-950/5 ${rest.className ?? ''}`}
    >
      {iconSlot ?? <FileIcon filename={filename} />}
      <span className="min-w-0 flex-1 truncate text-sm text-zinc-700">
        {displayTitle(customTitle, name)}
      </span>
      {rightSlot}
    </div>
  )
}
