// Command Menu Item
// Individual item with icon, label, and action text

'use client'

import { cn } from '@/lib/utils'
import { Command as CommandPrimitive } from 'cmdk'
import { ComponentType } from 'react'

// Vibrant colors with catalyst-style raised icon effect
const iconColors = {
  violet: {
    bg: 'var(--color-violet-500)',
    border: 'var(--color-violet-600)',
  },
  pink: {
    bg: 'var(--color-pink-500)',
    border: 'var(--color-pink-600)',
  },
  blue: {
    bg: 'var(--color-blue-600)',
    border: 'var(--color-blue-700)',
  },
  neutral: {
    bg: 'var(--color-zinc-100)',
    border: 'var(--color-zinc-200)',
    darkText: true,
  },
  ghost: {
    bg: 'transparent',
    border: 'transparent',
  },
  dark: {
    bg: 'var(--color-zinc-700)',
    border: 'var(--color-zinc-800)',
  },
} as const

type IconColor = keyof typeof iconColors

interface CommandMenuItemProps {
  id: string
  label: string
  icon: ComponentType<{ className?: string; size?: number }>
  action?: string
  keywords?: string[]
  iconColor?: IconColor
  disabled?: boolean
  onSelect?: () => void
}

export function CommandMenuItem({
  id,
  label,
  icon: Icon,
  action = 'Add',
  keywords,
  iconColor = 'neutral',
  disabled = false,
  onSelect,
}: CommandMenuItemProps) {
  const colors = iconColors[iconColor]
  const isGhost = iconColor === 'ghost'
  const hasDarkText = 'darkText' in colors && colors.darkText

  // Disabled items render as plain divs (not selectable, not in keyboard nav)
  if (disabled) {
    return (
      <div
        className={cn(
          'flex cursor-not-allowed items-center gap-3 rounded-lg px-3 py-2',
          'text-sm text-zinc-400',
          'opacity-50',
        )}
      >
        <div
          className={cn(
            'relative isolate flex size-6 shrink-0 items-center justify-center rounded-md',
            'text-zinc-400',
          )}
          style={
            !isGhost ? { backgroundColor: 'var(--color-zinc-200)' } : undefined
          }
        >
          {!isGhost && (
            <span
              className="absolute inset-0 -z-10 rounded-[5px]"
              style={{ backgroundColor: 'var(--color-zinc-100)' }}
            />
          )}
          <Icon className="size-3.5" size={14} />
        </div>
        <span className="flex-1 truncate">{label}</span>
        {action && (
          <span className="shrink-0 text-xs text-zinc-400">{action}</span>
        )}
      </div>
    )
  }

  return (
    <CommandPrimitive.Item
      value={id}
      keywords={keywords || [label]}
      onSelect={onSelect}
      className={cn(
        'flex cursor-default items-center gap-3 rounded-lg px-3 py-2',
        'text-sm text-zinc-800',
        'data-[selected=true]:bg-zinc-400/15 data-[selected=true]:text-zinc-900',
        'transition-colors outline-none',
      )}
    >
      {/* Icon with catalyst-style raised effect */}
      <div
        className={cn(
          'relative isolate flex size-6 shrink-0 items-center justify-center rounded-md',
          isGhost
            ? 'text-zinc-600'
            : hasDarkText
              ? 'text-zinc-600'
              : 'text-white',
        )}
        style={
          !isGhost
            ? {
                // Optical border as background (catalyst pattern)
                backgroundColor: colors.border,
              }
            : undefined
        }
      >
        {/* Foreground layer with main color + shadow */}
        {!isGhost && (
          <>
            <span
              className="absolute inset-0 -z-10 rounded-[5px] shadow-sm"
              style={{ backgroundColor: colors.bg }}
            />
            {/* Inner highlight for raised effect */}
            <span className="absolute inset-0 -z-10 rounded-[5px] shadow-[inset_0_1px_rgba(255,255,255,0.15)]" />
          </>
        )}
        <Icon className="size-3.5" size={14} />
      </div>

      {/* Label */}
      <span className="flex-1 truncate">{label}</span>

      {/* Action */}
      {action && (
        <span className="shrink-0 text-xs text-zinc-500">{action}</span>
      )}
    </CommandPrimitive.Item>
  )
}
