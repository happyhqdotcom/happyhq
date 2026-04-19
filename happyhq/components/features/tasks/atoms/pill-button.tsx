export function PillButton({
  label,
  onClick,
  disabled,
  loading,
  variant = 'ghost',
}: {
  label: string
  onClick: () => void
  disabled: boolean
  loading?: boolean
  variant?: 'ghost' | 'solid'
}) {
  const base =
    'relative flex h-5 shrink-0 items-center justify-center rounded-full font-mono text-[8px] font-semibold tracking-wider uppercase transition-colors disabled:opacity-50'
  const styles =
    variant === 'solid'
      ? 'bg-zinc-900 px-2.5 text-white hover:bg-zinc-800'
      : 'bg-black/5 px-2 text-black/40 hover:bg-black/10 hover:text-black/70'

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`${base} ${styles}`}
    >
      {loading ? (
        <>
          <span className="invisible">{label}</span>
          <div className="absolute h-3 w-3 animate-spin rounded-full border-2 border-black/10 border-t-black/40" />
        </>
      ) : (
        label
      )}
    </button>
  )
}
