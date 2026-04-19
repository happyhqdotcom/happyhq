import { cn } from '@/lib/utils'

interface IslandShellProps {
  children: React.ReactNode
  className?: string
  expanded?: boolean
  onClick?: () => void
}

export function IslandShell({
  children,
  className,
  expanded,
  onClick,
}: IslandShellProps) {
  return (
    <div
      className={cn(
        'transition-all duration-300',
        expanded ? 'rounded-3xl' : 'rounded-full',
      )}
      style={{
        boxShadow:
          '0 -8px 24px -4px rgba(0,0,0,0.15), -3px 0 14px -2px rgba(0,0,0,0.08), 3px 0 14px -2px rgba(0,0,0,0.08), 0 1px 2px 0 rgba(0,0,0,0.04)',
      }}
    >
      <div
        className={cn(
          'relative flex w-full bg-white/60 ring-1 ring-zinc-950/10 backdrop-blur-lg transition-all duration-300',
          expanded
            ? 'flex-col rounded-3xl p-4'
            : 'h-[60px] items-center rounded-full pr-3 pl-5',
          onClick && 'cursor-text',
          className,
        )}
        onClick={onClick}
      >
        {children}
      </div>
    </div>
  )
}
