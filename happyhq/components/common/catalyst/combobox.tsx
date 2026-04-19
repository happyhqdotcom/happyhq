// @/components/common/catalyst/combobox.tsx
'use client'

import { cn } from '@/lib/utils'
import * as Headless from '@headlessui/react'
import clsx from 'clsx'
import { Search as MagnifyingGlassIcon } from 'lucide-react'
import { useState } from 'react'

export function Combobox<T>({
  options,
  displayValue: displayValueProp,
  filter,
  onQueryChange,
  clearQueryOnClose = true,
  showSelectionInInput = true,
  anchor = 'bottom',
  className,
  optionsClassName,
  placeholder,
  autoFocus,
  immediate = false,
  noSelection = false, // The combobox tries to align the selection with the list. But in cases where we have no selection, we want the containers to align, not the text.
  'aria-label': ariaLabel,
  children,
  ...props
}: {
  options: T[]
  displayValue: (value: T | null) => string | undefined
  filter?: (value: T, query: string) => boolean
  onQueryChange?: (query: string) => void
  clearQueryOnClose?: boolean
  showSelectionInInput?: boolean
  className?: string
  optionsClassName?: string
  placeholder?: string
  autoFocus?: boolean
  immediate?: boolean
  noSelection?: boolean
  'aria-label'?: string
  children: (value: NonNullable<T>) => React.ReactElement
} & Omit<Headless.ComboboxProps<T, false>, 'as' | 'multiple' | 'children'> & {
    anchor?:
      | 'top'
      | 'bottom'
      | 'left'
      | 'right'
      | 'top start'
      | 'top end'
      | 'bottom start'
      | 'bottom end'
      | 'left start'
      | 'left end'
      | 'right start'
      | 'right end'
  }) {
  const [query, setQuery] = useState('')

  const filteredOptions =
    query === ''
      ? options
      : options.filter((option) =>
          filter
            ? filter(option, query)
            : displayValueProp(option)
                ?.toLowerCase()
                .includes(query.toLowerCase()),
        )

  return (
    <Headless.Combobox
      {...props}
      immediate
      multiple={false}
      virtual={{ options: filteredOptions }}
      onClose={() => {
        if (clearQueryOnClose) {
          setQuery('')
          onQueryChange?.('')
        }
      }}
    >
      <span
        data-slot="control"
        className={cn(
          // Basic layout
          'relative block w-full',
          // Background color + shadow applied to inset pseudo element, so shadow blends with border in light mode
          'before:absolute before:inset-px before:rounded-[calc(var(--radius-lg)-1px)]',
          // Background color is moved to control and shadow is removed in dark mode so hide `before` pseudo
          'dark:before:hidden',
          // Focus ring
          'after:pointer-events-none after:absolute after:inset-0 after:rounded-lg after:ring-transparent after:ring-inset sm:focus-within:after:ring-2',
          // Disabled state
          'has-data-disabled:opacity-50 has-data-disabled:before:bg-zinc-950/5 has-data-disabled:before:shadow-none',
          // Invalid state
          'has-data-invalid:before:shadow-red-500/10',
          className,
        )}
      >
        {/* Search Icon */}
        <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
          <MagnifyingGlassIcon
            className="size-3 fill-(--workspace-text)/70 stroke-(--workspace-text)/70 sm:size-3 forced-colors:stroke-[CanvasText]"
            aria-hidden="true"
          />
        </div>

        <Headless.ComboboxInput
          autoFocus={autoFocus}
          autoComplete="off"
          data-slot="control"
          aria-label={ariaLabel}
          displayValue={(option: T) => {
            // When nothing is selected, show the raw query so the text doesn't disappear
            // after focus/desktop changes.
            // Headless UI passes `undefined` when no selection exists.
            // Cast to any to avoid generic nullability issues.
            const hasSelection = (option as any) != null
            if (!hasSelection) return query
            // Optionally keep the input focused on "search" rather than reflecting the selection
            if (!showSelectionInInput) return query
            return displayValueProp(option as any) ?? ''
          }}
          onChange={(event) => {
            const q = event.target.value
            setQuery(q)
            onQueryChange?.(q)
          }}
          placeholder={placeholder}
          className={cn(
            // Basic layout
            'relative block w-full appearance-none rounded-lg py-[calc(--spacing(2.5)-1px)] sm:py-[calc(--spacing(1.5)-1px)]',
            // Horizontal padding
            'pr-[calc(--spacing(10))] pl-[calc(--spacing(8))] sm:pr-[calc(--spacing(8))] sm:pl-[calc(--spacing(8))]',
            // Typography
            'text-workspace-text text-base/6 placeholder:text-zinc-500 sm:text-sm/6',
            // Border
            'border border-zinc-950/20 data-hover:border-zinc-950/30 dark:border-white/10 dark:data-hover:border-white/20',
            // Background color
            'bg-transparent dark:bg-white/5',
            // Hide default focus styles
            'focus:outline-hidden',
            // Invalid state
            'data-invalid:border-red-500 data-invalid:data-hover:border-red-500 dark:data-invalid:border-red-500 dark:data-invalid:data-hover:border-red-500',
            // Disabled state
            'data-disabled:border-zinc-950/20 dark:data-disabled:border-white/15 dark:data-disabled:bg-white/2.5 dark:data-hover:data-disabled:border-white/15',
            // System icons
            'dark:scheme-dark',
            className,
          )}
        />
      </span>
      <Headless.ComboboxOptions
        transition
        anchor={anchor}
        className={clsx(
          // Anchor positioning
          '[--anchor-gap:--spacing(2)] [--anchor-padding:--spacing(4)] sm:data-[anchor~=start]:[--anchor-offset:-4px]',
          // Base styles,
          'isolate scroll-py-1 rounded-xl p-1 select-none empty:invisible',
          // Conditional min-width based on flush prop
          noSelection
            ? 'min-w-(--input-width)'
            : 'min-w-[calc(var(--input-width)+8px)]',
          // Invisible border that is only visible in `forced-colors` mode for accessibility purposes
          'outline outline-transparent focus:outline-hidden',
          // Handle scrolling when menu won't fit in viewport
          'overflow-y-scroll overscroll-contain',
          // Popover background
          'bg-sidebar backdrop-blur-xl dark:bg-zinc-800/75',
          // Shadows
          'shadow-lg ring-1 ring-zinc-950/10 dark:ring-white/10 dark:ring-inset',
          // Transitions
          'transition-opacity duration-100 ease-in data-closed:data-leave:opacity-0 data-transition:pointer-events-none',
          // Layer
          'z-100',
          optionsClassName,
        )}
      >
        {({ option }) => children(option)}
      </Headless.ComboboxOptions>
    </Headless.Combobox>
  )
}

export function ComboboxOption<T>({
  children,
  className,
  compact = false,
  ...props
}: { className?: string; compact?: boolean; children?: React.ReactNode } & Omit<
  Headless.ComboboxOptionProps<'div', T>,
  'as' | 'className'
>) {
  let sharedClasses = clsx(
    // Base
    'flex min-w-0 items-center',
    // Icons
    '*:data-[slot=icon]:size-5 *:data-[slot=icon]:shrink-0 sm:*:data-[slot=icon]:size-4',
    '*:data-[slot=icon]:text-zinc-500 group-data-focus/option:*:data-[slot=icon]:text-white dark:*:data-[slot=icon]:text-zinc-400',
    'forced-colors:*:data-[slot=icon]:text-[CanvasText] forced-colors:group-data-focus/option:*:data-[slot=icon]:text-[Canvas]',
    // Avatars
    '*:data-[slot=avatar]:-mx-0.5 *:data-[slot=avatar]:size-6 sm:*:data-[slot=avatar]:size-5',
  )

  return (
    <Headless.ComboboxOption
      {...props}
      className={clsx(
        // Basic layout
        'group/option grid w-full cursor-default grid-cols-[1fr_--spacing(5)] items-baseline gap-x-2 rounded-lg pr-2 pl-3.5 sm:grid-cols-[1fr_--spacing(4)] sm:pr-2 sm:pl-3',
        compact ? 'py-2 sm:py-1' : 'py-2.5 sm:py-1.5',
        // Typography
        'text-base/6 text-zinc-950 sm:text-sm/6 dark:text-white forced-colors:text-[CanvasText]',
        // Focus
        'data-focus:bg-accent data-focus:text-accent-foreground outline-hidden',
        // Forced colors mode
        'forced-color-adjust-none forced-colors:data-focus:bg-[Highlight] forced-colors:data-focus:text-[HighlightText]',
        // Disabled
        'data-disabled:opacity-50',
      )}
    >
      <span className={clsx(className, sharedClasses)}>{children}</span>
      <svg
        className="relative col-start-2 hidden size-5 self-center stroke-current group-data-selected/option:inline sm:size-4"
        viewBox="0 0 16 16"
        fill="none"
        aria-hidden="true"
      >
        <path
          d="M4 8.5l3 3L12 4"
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </Headless.ComboboxOption>
  )
}

export function ComboboxLabel({
  className,
  ...props
}: React.ComponentPropsWithoutRef<'span'>) {
  return (
    <span
      {...props}
      className={clsx(
        className,
        'ml-2.5 truncate first:ml-0 sm:ml-2 sm:first:ml-0',
      )}
    />
  )
}

export function ComboboxDescription({
  className,
  children,
  ...props
}: React.ComponentPropsWithoutRef<'span'>) {
  return (
    <span
      {...props}
      className={clsx(
        className,
        'flex flex-1 overflow-hidden text-zinc-500 group-data-focus/option:text-zinc-500 before:w-2 before:min-w-0 before:shrink dark:text-zinc-400',
      )}
    >
      <span className="flex-1 truncate">{children}</span>
    </span>
  )
}
