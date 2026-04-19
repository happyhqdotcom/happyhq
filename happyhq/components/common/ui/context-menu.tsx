'use client'

import * as ContextMenuPrimitive from '@radix-ui/react-context-menu'
import { CheckIcon, ChevronRightIcon, CircleIcon } from 'lucide-react'
import * as React from 'react'

import { cn } from '@/lib/utils'

/**
 * Context Menu components styled to match Catalyst dropdown appearance.
 * Uses Radix primitives for right-click behavior with Catalyst visual styling.
 */

function ContextMenu({
  ...props
}: React.ComponentProps<typeof ContextMenuPrimitive.Root>) {
  return <ContextMenuPrimitive.Root data-slot="context-menu" {...props} />
}

function ContextMenuTrigger({
  ...props
}: React.ComponentProps<typeof ContextMenuPrimitive.Trigger>) {
  return (
    <ContextMenuPrimitive.Trigger data-slot="context-menu-trigger" {...props} />
  )
}

function ContextMenuGroup({
  ...props
}: React.ComponentProps<typeof ContextMenuPrimitive.Group>) {
  return (
    <ContextMenuPrimitive.Group data-slot="context-menu-group" {...props} />
  )
}

function ContextMenuPortal({
  ...props
}: React.ComponentProps<typeof ContextMenuPrimitive.Portal>) {
  return (
    <ContextMenuPrimitive.Portal data-slot="context-menu-portal" {...props} />
  )
}

function ContextMenuSub({
  ...props
}: React.ComponentProps<typeof ContextMenuPrimitive.Sub>) {
  return <ContextMenuPrimitive.Sub data-slot="context-menu-sub" {...props} />
}

function ContextMenuRadioGroup({
  ...props
}: React.ComponentProps<typeof ContextMenuPrimitive.RadioGroup>) {
  return (
    <ContextMenuPrimitive.RadioGroup
      data-slot="context-menu-radio-group"
      {...props}
    />
  )
}

function ContextMenuSubTrigger({
  className,
  inset,
  children,
  ...props
}: React.ComponentProps<typeof ContextMenuPrimitive.SubTrigger> & {
  inset?: boolean
}) {
  return (
    <ContextMenuPrimitive.SubTrigger
      data-slot="context-menu-sub-trigger"
      data-inset={inset}
      className={cn(
        // Base styles
        'group cursor-default rounded-md px-3 py-1.5 outline-hidden select-none',
        // Text styles
        'text-left text-sm/5 text-zinc-950 dark:text-white forced-colors:text-[CanvasText]',
        // Focus state
        'data-highlighted:bg-zinc-200/60 data-[state=open]:bg-zinc-200/60 dark:data-highlighted:bg-zinc-700 dark:data-[state=open]:bg-zinc-700',
        // Forced colors
        'forced-color-adjust-none forced-colors:data-highlighted:bg-[Highlight] forced-colors:data-highlighted:text-[HighlightText]',
        // Layout — subgrid with fallback
        'col-span-full grid grid-cols-[auto_1fr_1.5rem_0.5rem_auto] items-center supports-[grid-template-columns:subgrid]:grid-cols-subgrid',
        // Icons
        '*:data-[slot=icon]:col-start-1 *:data-[slot=icon]:row-start-1 *:data-[slot=icon]:mr-2.5 *:data-[slot=icon]:-ml-0.5 *:data-[slot=icon]:size-5 sm:*:data-[slot=icon]:mr-2 sm:*:data-[slot=icon]:size-4',
        '*:data-[slot=icon]:text-zinc-500 dark:*:data-[slot=icon]:text-zinc-400',
        // Inset
        'data-inset:pl-8',
        className,
      )}
      {...props}
    >
      {children}
      <ChevronRightIcon className="col-start-5 size-4 text-zinc-400" />
    </ContextMenuPrimitive.SubTrigger>
  )
}

function ContextMenuSubContent({
  className,
  ...props
}: React.ComponentProps<typeof ContextMenuPrimitive.SubContent>) {
  return (
    <ContextMenuPrimitive.Portal>
      <ContextMenuPrimitive.SubContent
        data-slot="context-menu-sub-content"
        className={cn(
          // Base styles — z-index must match or exceed parent ContextMenuContent
          'isolate z-500 w-max min-w-48 overflow-y-auto rounded-lg p-1',
          // Invisible border for forced-colors accessibility
          'outline outline-transparent focus:outline-hidden',
          // Background
          'bg-white backdrop-blur-xl dark:bg-zinc-800/75',
          // Edge treatment — shadow-dominant like windows/dialogs
          'shadow-lg ring-1 ring-zinc-950/10 dark:ring-white/10 dark:ring-inset',
          // Subgrid layout
          'supports-[grid-template-columns:subgrid]:grid supports-[grid-template-columns:subgrid]:grid-cols-[auto_1fr_1.5rem_0.5rem_auto]',
          // Transition
          'data-[state=open]:animate-in data-[state=open]:fade-in-0',
          'data-[state=closed]:animate-out data-[state=closed]:fade-out-0',
          className,
        )}
        {...props}
      />
    </ContextMenuPrimitive.Portal>
  )
}

function ContextMenuContent({
  className,
  ...props
}: React.ComponentProps<typeof ContextMenuPrimitive.Content>) {
  return (
    <ContextMenuPrimitive.Portal>
      <ContextMenuPrimitive.Content
        data-slot="context-menu-content"
        className={cn(
          // Base styles — tighter rounding and wider min for context menu feel
          'isolate z-50 w-max min-w-48 overflow-y-auto rounded-lg p-1',
          // Invisible border for forced-colors accessibility
          'outline outline-transparent focus:outline-hidden',
          // Background
          'bg-white backdrop-blur-xl dark:bg-zinc-800/75',
          // Edge treatment
          'shadow-lg ring-1 ring-zinc-950/10 dark:ring-white/10 dark:ring-inset',
          // Subgrid layout for aligned icons/labels/shortcuts
          'supports-[grid-template-columns:subgrid]:grid supports-[grid-template-columns:subgrid]:grid-cols-[auto_1fr_1.5rem_0.5rem_auto]',
          // Transition (matches Catalyst fade)
          'data-[state=open]:animate-in data-[state=open]:fade-in-0',
          'data-[state=closed]:animate-out data-[state=closed]:fade-out-0',
          className,
        )}
        {...props}
      />
    </ContextMenuPrimitive.Portal>
  )
}

function ContextMenuItem({
  className,
  inset,
  variant = 'default',
  ...props
}: React.ComponentProps<typeof ContextMenuPrimitive.Item> & {
  inset?: boolean
  variant?: 'default' | 'destructive'
}) {
  return (
    <ContextMenuPrimitive.Item
      data-slot="context-menu-item"
      data-inset={inset}
      data-variant={variant}
      className={cn(
        // Base styles
        'group cursor-default rounded-md px-3 py-1.5 outline-hidden select-none',
        // Text styles
        'text-left text-sm/5 text-zinc-950 dark:text-white forced-colors:text-[CanvasText]',
        // Focus state (data-highlighted is Radix's equivalent of Headless data-focus)
        'data-highlighted:bg-zinc-200/60 dark:data-highlighted:bg-zinc-700',
        // Disabled state
        'data-disabled:opacity-50',
        // Forced colors
        'forced-color-adjust-none forced-colors:data-highlighted:bg-[Highlight] forced-colors:data-highlighted:text-[HighlightText]',
        // Layout — subgrid with fallback
        'col-span-full grid grid-cols-[auto_1fr_1.5rem_0.5rem_auto] items-center supports-[grid-template-columns:subgrid]:grid-cols-subgrid',
        // Icons
        '*:data-[slot=icon]:col-start-1 *:data-[slot=icon]:row-start-1 *:data-[slot=icon]:mr-2.5 *:data-[slot=icon]:-ml-0.5 *:data-[slot=icon]:size-5 sm:*:data-[slot=icon]:mr-2 sm:*:data-[slot=icon]:size-4',
        '*:data-[slot=icon]:text-zinc-500 dark:*:data-[slot=icon]:text-zinc-400',
        // Destructive variant
        'data-[variant=destructive]:text-red-600 data-[variant=destructive]:data-highlighted:bg-red-50 dark:data-[variant=destructive]:text-red-400 dark:data-[variant=destructive]:data-highlighted:bg-red-950/50',
        'data-[variant=destructive]:*:data-[slot=icon]:text-red-500 dark:data-[variant=destructive]:*:data-[slot=icon]:text-red-400',
        // Inset
        'data-inset:pl-8',
        className,
      )}
      {...props}
    />
  )
}

function ContextMenuCheckboxItem({
  className,
  children,
  checked,
  ...props
}: React.ComponentProps<typeof ContextMenuPrimitive.CheckboxItem>) {
  return (
    <ContextMenuPrimitive.CheckboxItem
      data-slot="context-menu-checkbox-item"
      className={cn(
        // Base styles — compact
        'group relative flex cursor-default items-center gap-2 rounded-md py-1.5 pr-3 pl-8 outline-hidden select-none',
        // Text styles
        'text-left text-sm/5 text-zinc-950 dark:text-white',
        // Focus state
        'data-highlighted:bg-zinc-200/60 dark:data-highlighted:bg-zinc-700',
        // Disabled state
        'data-disabled:opacity-50',
        // Icons
        '[&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0',
        className,
      )}
      checked={checked}
      {...props}
    >
      <span className="pointer-events-none absolute left-3 flex size-4 items-center justify-center sm:left-2.5">
        <ContextMenuPrimitive.ItemIndicator>
          <CheckIcon className="size-4 text-zinc-950 dark:text-white" />
        </ContextMenuPrimitive.ItemIndicator>
      </span>
      {children}
    </ContextMenuPrimitive.CheckboxItem>
  )
}

function ContextMenuRadioItem({
  className,
  children,
  ...props
}: React.ComponentProps<typeof ContextMenuPrimitive.RadioItem>) {
  return (
    <ContextMenuPrimitive.RadioItem
      data-slot="context-menu-radio-item"
      className={cn(
        // Base styles — compact
        'group relative flex cursor-default items-center gap-2 rounded-md py-1.5 pr-3 pl-8 outline-hidden select-none',
        // Text styles
        'text-left text-sm/5 text-zinc-950 dark:text-white',
        // Focus state
        'data-highlighted:bg-zinc-200/60 dark:data-highlighted:bg-zinc-700',
        // Disabled state
        'data-disabled:opacity-50',
        // Icons
        '[&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0',
        className,
      )}
      {...props}
    >
      <span className="pointer-events-none absolute left-3 flex size-4 items-center justify-center sm:left-2.5">
        <ContextMenuPrimitive.ItemIndicator>
          <CircleIcon className="size-2 fill-current text-zinc-950 dark:text-white" />
        </ContextMenuPrimitive.ItemIndicator>
      </span>
      {children}
    </ContextMenuPrimitive.RadioItem>
  )
}

function ContextMenuLabel({
  className,
  inset,
  ...props
}: React.ComponentProps<typeof ContextMenuPrimitive.Label> & {
  inset?: boolean
}) {
  return (
    <ContextMenuPrimitive.Label
      data-slot="context-menu-label"
      data-inset={inset}
      className={cn(
        // Heading styles — compact
        'px-3 pt-1.5 pb-1 text-xs/4 font-medium text-zinc-500 dark:text-zinc-400',
        'data-inset:pl-8',
        className,
      )}
      {...props}
    />
  )
}

function ContextMenuSeparator({
  className,
  ...props
}: React.ComponentProps<typeof ContextMenuPrimitive.Separator>) {
  return (
    <ContextMenuPrimitive.Separator
      data-slot="context-menu-separator"
      className={cn(
        // Divider styles
        'col-span-full -mx-1 my-1 h-px border-0 bg-zinc-950/5 dark:bg-white/10 forced-colors:bg-[CanvasText]',
        className,
      )}
      {...props}
    />
  )
}

function ContextMenuShortcut({
  className,
  ...props
}: React.ComponentProps<'span'>) {
  return (
    <span
      data-slot="context-menu-shortcut"
      className={cn(
        // Catalyst shortcut styles
        'ml-auto font-sans text-zinc-400 capitalize dark:text-zinc-500',
        className,
      )}
      {...props}
    />
  )
}

export {
  ContextMenu,
  ContextMenuCheckboxItem,
  ContextMenuContent,
  ContextMenuGroup,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuPortal,
  ContextMenuRadioGroup,
  ContextMenuRadioItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
}
