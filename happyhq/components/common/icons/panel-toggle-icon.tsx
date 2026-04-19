'use client'

import { motion } from 'framer-motion'

export interface PanelToggleIconProps {
  isLocked: boolean
  isHovered?: boolean
  side?: 'left' | 'right'
  className?: string
}

/**
 * Custom animated icon that visualizes the panel state:
 * - Locked: Bounding rectangle with sidebar panel visible
 * - Unlocked: Bounding rectangle only (panel hidden)
 * - On hover: Previews the opposite state
 * - Supports both left and right sides (mirrored for right)
 */
export function PanelToggleIcon({
  isLocked,
  isHovered = false,
  side = 'left',
  className = '',
}: PanelToggleIconProps) {
  // When hovered, show preview of the opposite state
  const showPanelRect = isHovered ? !isLocked : isLocked

  return (
    <motion.svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={{ transform: side === 'right' ? 'rotate(180deg)' : undefined }}
      initial={false}
    >
      {/* Bounding rectangle representing the screen/container */}
      <rect
        x={3}
        y={4}
        width={18}
        height={16}
        rx={2.5}
        stroke="currentColor"
        strokeWidth={2}
        fill="none"
      />

      {/* Panel - animates in/out (always on left, rotation handles right side) */}
      <motion.rect
        y={6.5}
        height={11}
        rx={1.5}
        className="fill-current"
        initial={false}
        animate={{
          x: showPanelRect ? 5 : 5,
          width: showPanelRect ? 6 : 0,
          opacity: showPanelRect ? 1 : 0,
        }}
        transition={{
          type: 'spring',
          damping: 30,
          stiffness: 300,
          opacity: { duration: 0.15 },
        }}
      />
    </motion.svg>
  )
}
