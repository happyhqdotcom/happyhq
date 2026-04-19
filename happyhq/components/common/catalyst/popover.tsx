'use client'

import * as Headless from '@headlessui/react'
import clsx from 'clsx'
import type React from 'react'

export function Popover(props: Headless.PopoverProps) {
  return <Headless.Popover {...props} />
}

export function PopoverButton<T extends React.ElementType = 'button'>({
  className,
  ...props
}: { className?: string } & Omit<Headless.PopoverButtonProps<T>, 'className'>) {
  return (
    <Headless.PopoverButton
      className={clsx('outline-none', className)}
      {...props}
    />
  )
}

export function PopoverPanel({
  anchor = 'bottom start',
  className,
  ...props
}: { className?: string } & Omit<Headless.PopoverPanelProps, 'className'>) {
  return (
    <Headless.PopoverPanel
      {...props}
      transition
      anchor={anchor}
      className={clsx(
        className,
        // Anchor positioning
        '[--anchor-gap:--spacing(2)] [--anchor-padding:--spacing(1)]',
        // Base styles
        'isolate z-50 w-max rounded-xl',
        // Invisible border that is only visible in `forced-colors` mode for accessibility purposes
        'outline outline-transparent focus:outline-hidden',
        // Popover background
        'bg-white/75 backdrop-blur-xl dark:bg-zinc-800/75',
        // Shadows
        'shadow-lg ring-1 ring-zinc-950/10 dark:ring-white/10 dark:ring-inset',
        // Transitions
        'transition data-leave:duration-100 data-leave:ease-in data-closed:data-leave:opacity-0',
      )}
    />
  )
}

export function PopoverGroup(props: Headless.PopoverGroupProps) {
  return <Headless.PopoverGroup {...props} />
}
