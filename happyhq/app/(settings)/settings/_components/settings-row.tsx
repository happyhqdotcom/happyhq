import clsx from 'clsx'

/**
 * A single settings row: label (with optional description) on the left,
 * control (children) on the right. Renders a top border except on the
 * first row inside a SettingsPanel.
 */
export function SettingsRow({
  label,
  description,
  children,
  className,
}: {
  label: string
  description?: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <div
      className={clsx(
        'flex items-center justify-between gap-4 border-t border-zinc-950/5 py-3 first:border-t-0',
        className,
      )}
    >
      <div className="min-w-0">
        <p className="text-sm font-medium text-zinc-950">{label}</p>
        {description && (
          <p className="max-w-sm text-sm text-zinc-500">{description}</p>
        )}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  )
}
