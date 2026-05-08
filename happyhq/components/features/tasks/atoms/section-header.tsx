import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/common/ui/tooltip'
import { RotateCw } from 'lucide-react'

export function formatDuration(ms: number): string {
  const minutes = Math.round(ms / 60000)
  if (minutes < 1) return '<1m'
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  const mins = minutes % 60
  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`
}

export function SectionHeader({
  label,
  durationMs,
  onRestart,
  restartTooltip,
  disabled,
  onLabelClick,
  rightSlot,
  compact,
}: {
  label: string
  durationMs?: number
  onRestart?: () => void
  restartTooltip?: React.ReactNode
  disabled?: boolean
  onLabelClick?: () => void
  rightSlot?: React.ReactNode
  // Drop the bottom margin so the header sits centred when nothing follows it.
  compact?: boolean
}) {
  const labelText = `${label}${durationMs != null && durationMs > 0 ? ` for ${formatDuration(durationMs)}` : ''}`

  const restartButton = onRestart ? (
    <button
      type="button"
      onClick={onRestart}
      disabled={disabled}
      className="flex h-5 w-5 items-center justify-center rounded-md text-zinc-300 transition-colors hover:bg-zinc-100 hover:text-zinc-500 disabled:opacity-50"
    >
      <RotateCw className="h-3.5 w-3.5" />
    </button>
  ) : null

  return (
    <div className={`flex items-center gap-3 px-2 ${compact ? '' : 'mb-1'}`}>
      {onLabelClick ? (
        <button
          type="button"
          onClick={onLabelClick}
          className="flex-1 text-left text-sm font-medium text-zinc-500 transition-colors hover:text-zinc-700 hover:underline"
        >
          {labelText}
        </button>
      ) : (
        <span className="flex-1 text-sm font-medium text-zinc-500">
          {labelText}
        </span>
      )}
      {restartButton &&
        (restartTooltip ? (
          <Tooltip>
            <TooltipTrigger asChild>{restartButton}</TooltipTrigger>
            <TooltipContent side="top" align="start">
              {restartTooltip}
            </TooltipContent>
          </Tooltip>
        ) : (
          restartButton
        ))}
      {rightSlot}
    </div>
  )
}
