import { PillButton } from './pill-button'

export function ActivityHeader({
  label,
  detail,
  onStop,
  isStopping,
}: {
  label: string
  detail?: string | null
  onStop?: () => void
  isStopping?: boolean
}) {
  return (
    <div className="mb-1 flex items-center gap-3 px-2">
      <span className="flex min-w-0 flex-1 items-baseline gap-1.5 overflow-hidden">
        <span className="shrink-0 text-sm font-medium text-zinc-500">
          {label}
        </span>
        {detail && (
          <span className="truncate font-mono text-xs text-zinc-400">
            {detail}
          </span>
        )}
      </span>
      {onStop && (
        <PillButton
          label="Stop"
          onClick={onStop}
          disabled={isStopping ?? false}
          loading={isStopping}
        />
      )}
    </div>
  )
}
