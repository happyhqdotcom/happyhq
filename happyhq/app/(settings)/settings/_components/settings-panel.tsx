import clsx from 'clsx'

/** Floating island container for settings content. */
export function SettingsPanel({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <div
      className={clsx(
        'rounded-xl bg-white px-5 py-1 shadow-[0_4px_20px_rgba(0,0,0,0.035),0_0_0_0.5px_rgba(0,0,0,0.12)]',
        className,
      )}
    >
      {children}
    </div>
  )
}
