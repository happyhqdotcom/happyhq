'use client'

/**
 * Lighter canvas grid from HQ streams — white bg with very subtle lines.
 * Softer than the desktop's CANVAS_GRID_OVERLAY.
 */
const CANVAS_GRID_BACKGROUND = {
  backgroundColor: 'rgb(250 250 250)',
  backgroundImage: `
    linear-gradient(to right, rgb(212 212 212 / 0.15) 1px, transparent 1px),
    linear-gradient(to bottom, rgb(212 212 212 / 0.15) 1px, transparent 1px),
    linear-gradient(to right, rgb(212 212 212 / 0.07) 1px, transparent 1px),
    linear-gradient(to bottom, rgb(212 212 212 / 0.07) 1px, transparent 1px)
  `,
  backgroundSize: '64px 64px, 64px 64px, 16px 16px, 16px 16px',
  backgroundPosition: '-1px -1px',
} as const

const WIDTH_CLASSES = {
  sm: 'max-w-sm',
  md: 'max-w-2xl',
  lg: 'max-w-3xl',
  xl: 'max-w-5xl',
} as const

export function Canvas({
  width = 'md',
  children,
}: {
  width?: 'sm' | 'md' | 'lg' | 'xl'
  children: React.ReactNode
}) {
  return (
    <div
      className="h-full w-full overflow-y-auto"
      style={CANVAS_GRID_BACKGROUND}
    >
      <div
        className={`mx-auto flex min-h-full flex-col justify-center px-6 py-6 ${WIDTH_CLASSES[width]}`}
      >
        {children}
      </div>
    </div>
  )
}
